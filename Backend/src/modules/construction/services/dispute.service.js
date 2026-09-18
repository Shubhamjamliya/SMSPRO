import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../utils/helpers.js';
import { releaseHold, refundHold } from '../../../core/wallet/hold.service.js';
import { logger } from '../../../utils/logger.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectStage } from '../models/projectStage.model.js';
import { ProjectDispute } from '../models/projectDispute.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { postSystemMessage } from './message.service.js';
import { notifyDisputeRaised, notifyDisputeResolved } from './notify.service.js';

/**
 * Dispute resolution (BRD open question 15).
 *
 * "There is no dispute process anywhere in the platform today. With projects
 * worth lakhs, we strongly recommend building one."
 *
 * HOW THE FREEZE WORKS, and why it needs no new money code
 *
 * `stage.service.approveStage` is the only function on the platform that turns
 * held money into contractor money, and it refuses any stage whose status is not
 * `submitted_for_approval` or `approved`. Raising a dispute sets the stage to
 * `disputed`, so release is blocked by machinery that already exists and is
 * already covered by the Phase 5 suite. Nothing moves; the customer's money
 * simply stays held exactly where it was.
 *
 * Resolution then uses the same two escrow primitives every other path uses —
 * `releaseHold` to pay the contractor, `refundHold` to return money to the
 * customer — each with a stable reference so a retried resolution settles once.
 */

const alive = { isDeleted: { $ne: true } };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const REASON_LABELS = {
  work_quality: 'Quality of work',
  work_incomplete: 'Work not finished',
  delay: 'Delay',
  scope_disagreement: 'Disagreement about scope',
  payment_withheld: 'Payment withheld',
  materials: 'Materials',
  site_access: 'Site access',
  other: 'Other',
};

const nextDisputeNumber = async () => {
  const last = await ProjectDispute.findOne({}).sort({ createdAt: -1 }).select('disputeNumber').lean();
  const n = Number(String(last?.disputeNumber || '').replace(/\D/g, '')) || 0;
  return `DSP${String(n + 1).padStart(6, '0')}`;
};

/** Confirm the caller is actually on this project, and say which side they are. */
const resolveSide = async (projectId, { customerId, contractorId } = {}) => {
  const project = await ConstructionProject.findOne({ _id: projectId, ...alive });
  if (!project) throw new ValidationError('Project not found');

  if (customerId && String(project.customerId) === String(customerId)) {
    return { project, side: 'CUSTOMER' };
  }
  if (contractorId && String(project.contractorId) === String(contractorId)) {
    return { project, side: 'CONTRACTOR' };
  }
  throw new ValidationError('Project not found');
};

/**
 * Raise a dispute (BRD Q15).
 *
 * If it names a stage, that stage freezes. A project-level dispute freezes
 * nothing on its own — "nobody has been on site for three weeks" is a real
 * complaint but it is not a claim against one payment — though support can still
 * put the whole project on hold from the admin screen.
 */
export const raiseDispute = async (projectId, data, actor = {}) => {
  const { project, side } = await resolveSide(projectId, actor);

  if (['closed', 'cancelled'].includes(project.status)) {
    throw new ValidationError('This project is closed');
  }

  const reason = String(data.reason || '').trim();
  if (!REASON_LABELS[reason]) throw new ValidationError('Choose what the disagreement is about');

  const description = String(data.description || '').trim();
  if (description.length < 20) {
    throw new ValidationError(
      'Describe what happened in a few sentences — our team decides from what you write here',
    );
  }

  let stage = null;
  let frozenAmount = 0;
  let preDisputeStatus = '';

  if (data.stageId) {
    stage = await ProjectStage.findOne({ _id: data.stageId, projectId: project._id });
    if (!stage) throw new ValidationError('Stage not found');

    if (stage.status === 'payment_released') {
      throw new ValidationError(
        'This stage has already been paid. Raise the dispute against the project instead.',
      );
    }
    if (stage.status === 'disputed') {
      throw new ValidationError('This stage is already under dispute');
    }

    preDisputeStatus = stage.status;
    // Only money the customer has actually paid in can be frozen.
    const held = round2(project.fundedAmount - project.releasedAmount - project.refundedAmount);
    frozenAmount = Math.min(round2(stage.amount), Math.max(0, held));
  }

  const performer = extractPerformer(actor.reqUser) || null;

  let dispute;
  try {
    dispute = await ProjectDispute.create({
      disputeNumber: await nextDisputeNumber(),
      projectId: project._id,
      stageId: stage?._id || null,
      customerId: project.customerId,
      contractorId: project.contractorId,
      raisedByType: side,
      raisedBy: performer,
      reason,
      description,
      evidence: (Array.isArray(data.evidence) ? data.evidence : [])
        .map((e) => String(e).trim()).filter(Boolean).slice(0, 12),
      status: 'open',
      frozenAmount,
      preDisputeStatus,
      timeline: [{
        action: 'raised',
        note: description.slice(0, 500),
        byType: side,
        by: performer,
        at: new Date(),
      }],
      lastActivityAt: new Date(),
    });
  } catch (error) {
    // The unique partial index is the real guard against two live disputes on
    // one stage; this converts it into something a person can read.
    if (error?.code === 11000) {
      throw new ValidationError('This stage is already under dispute');
    }
    throw error;
  }

  // Freeze AFTER the dispute row exists. Freezing first would leave a stage
  // stuck in `disputed` with no dispute to resolve it if creation failed.
  if (stage) {
    stage.status = 'disputed';
    stage.statusHistory.push({
      status: 'disputed',
      reason: `Dispute ${dispute.disputeNumber}: ${REASON_LABELS[reason]}`,
      at: new Date(),
      by: performer,
    });
    await stage.save();
  }

  await recordAudit({
    module: 'construction',
    action: 'construction.dispute.raised',
    entityType: 'project',
    entityId: project._id,
    performedBy: performer,
    metadata: {
      disputeId: String(dispute._id),
      disputeNumber: dispute.disputeNumber,
      stageId: stage ? String(stage._id) : null,
      frozenAmount,
      raisedBy: side,
    },
  });

  await postSystemMessage(project._id, {
    systemEvent: 'DISPUTE_RAISED',
    body: stage
      ? `A dispute was raised about "${stage.name}" (${REASON_LABELS[reason]}). `
        + `${frozenAmount > 0 ? `₹${frozenAmount.toLocaleString('en-IN')} is held while our team reviews it.` : 'Our team will review it.'}`
      : `A dispute was raised about this project (${REASON_LABELS[reason]}). Our team will review it.`,
    relatedStageId: stage?._id || null,
    relatedDisputeId: dispute._id,
  }).catch(() => {});

  await notifyDisputeRaised(project, dispute, side).catch(() => {});

  return dispute.toObject();
};

/** Support picks it up. Purely a queue signal — no money moves. */
export const startReview = async (disputeId, reqUser = null) => {
  const dispute = await ProjectDispute.findOne({ _id: disputeId, ...alive });
  if (!dispute) throw new ValidationError('Dispute not found');
  if (dispute.status === 'resolved') throw new ValidationError('This dispute is already resolved');
  if (dispute.status === 'withdrawn') throw new ValidationError('This dispute was withdrawn');

  dispute.status = 'under_review';
  dispute.timeline.push({
    action: 'review_started',
    byType: 'ADMIN',
    by: extractPerformer(reqUser) || null,
    at: new Date(),
  });
  dispute.lastActivityAt = new Date();
  await dispute.save();

  return dispute.toObject();
};

/** Either side can add context while it is open. */
export const addComment = async (disputeId, note, actor = {}) => {
  const dispute = await ProjectDispute.findOne({ _id: disputeId, ...alive });
  if (!dispute) throw new ValidationError('Dispute not found');
  if (['resolved', 'withdrawn'].includes(dispute.status)) {
    throw new ValidationError('This dispute is closed');
  }

  const trimmed = String(note || '').trim();
  if (trimmed.length < 3) throw new ValidationError('Write something first');

  let byType = 'ADMIN';
  if (!actor.isAdmin) {
    const { side } = await resolveSide(dispute.projectId, actor);
    byType = side;
  }

  dispute.timeline.push({
    action: 'comment',
    note: trimmed.slice(0, 2000),
    byType,
    by: extractPerformer(actor.reqUser) || null,
    at: new Date(),
  });
  dispute.lastActivityAt = new Date();
  await dispute.save();

  return dispute.toObject();
};

/**
 * Put the stage back exactly where it was before the freeze.
 *
 * `preDisputeStatus` is stored for precisely this: reconstructing it from status
 * history means guessing, and guessing wrong either re-opens a payment window
 * that should be shut or strands a stage nobody can submit.
 */
const unfreezeStage = async (dispute, restoreTo, performer, note) => {
  if (!dispute.stageId) return;
  const stage = await ProjectStage.findById(dispute.stageId);
  if (!stage || stage.status !== 'disputed') return;

  stage.status = restoreTo || dispute.preDisputeStatus || 'in_progress';
  stage.statusHistory.push({
    status: stage.status,
    reason: note,
    at: new Date(),
    by: performer,
  });
  await stage.save();
};

/**
 * Resolve a dispute (BRD Q15).
 *
 * Four outcomes, and each maps onto an escrow primitive that already exists:
 *
 *   dismissed              nothing moves; the stage resumes where it left off
 *   released_to_contractor the stage is approved and paid in the normal way
 *   refunded_to_customer   the frozen amount goes back; the stage is cancelled
 *   split                  part released, part refunded, in one settlement
 *
 * Every movement carries a reference derived from the dispute id, so a retried
 * resolution is a no-op at the ledger rather than a second payment.
 */
export const resolveDispute = async (disputeId, {
  outcome,
  resolutionNote,
  amountToContractor = 0,
  amountToCustomer = 0,
  reqUser = null,
} = {}) => {
  const dispute = await ProjectDispute.findOne({ _id: disputeId, ...alive });
  if (!dispute) throw new ValidationError('Dispute not found');
  if (dispute.status === 'resolved') {
    return { dispute: dispute.toObject(), alreadyResolved: true };
  }
  if (dispute.status === 'withdrawn') throw new ValidationError('This dispute was withdrawn');

  const note = String(resolutionNote || '').trim();
  if (note.length < 10) {
    throw new ValidationError('Explain the decision — both sides will see this');
  }

  const valid = ['dismissed', 'released_to_contractor', 'refunded_to_customer', 'split'];
  if (!valid.includes(outcome)) throw new ValidationError('Choose how this is being resolved');

  const project = await ConstructionProject.findById(dispute.projectId);
  if (!project) throw new ValidationError('Project not found');

  const performer = extractPerformer(reqUser) || null;
  const frozen = round2(dispute.frozenAmount);

  // Work out the split before touching anything.
  let toContractor = 0;
  let toCustomer = 0;
  if (outcome === 'released_to_contractor') toContractor = frozen;
  else if (outcome === 'refunded_to_customer') toCustomer = frozen;
  else if (outcome === 'split') {
    toContractor = round2(amountToContractor);
    toCustomer = round2(amountToCustomer);
    if (toContractor < 0 || toCustomer < 0) {
      throw new ValidationError('Amounts cannot be negative');
    }
    if (round2(toContractor + toCustomer) !== frozen) {
      throw new ValidationError(
        `A split must account for the whole ₹${frozen.toLocaleString('en-IN')} that is frozen`,
      );
    }
  }

  if (outcome !== 'dismissed' && frozen <= 0) {
    throw new ValidationError(
      'There is no money frozen against this dispute, so it can only be dismissed',
    );
  }

  const reference = `dispute_${dispute._id}`;
  const stage = dispute.stageId ? await ProjectStage.findById(dispute.stageId) : null;

  // ---- money ----
  if (toContractor > 0) {
    if (!project.holdId) throw new ValidationError('This project has no escrow hold');
    await releaseHold({
      holdId: project.holdId,
      amount: toContractor,
      reference: `${reference}_release`,
      reason: `${project.projectNumber} — dispute ${dispute.disputeNumber}`,
      payee: { entityType: 'contractor', entityId: project.contractorId },
      performedBy: performer,
      category: 'escrow_release',
      payeeCategory: 'escrow_release',
      description: `Dispute ${dispute.disputeNumber} settled in the contractor's favour`,
      payeeDescription: `${project.projectNumber} — dispute ${dispute.disputeNumber}`,
      meta: {
        module: 'construction',
        projectId: String(project._id),
        projectNumber: project.projectNumber,
        disputeId: String(dispute._id),
        disputeNumber: dispute.disputeNumber,
      },
    });
    project.releasedAmount = round2(project.releasedAmount + toContractor);
  }

  if (toCustomer > 0) {
    if (!project.holdId) throw new ValidationError('This project has no escrow hold');
    await refundHold({
      holdId: project.holdId,
      amount: toCustomer,
      reference: `${reference}_refund`,
      reason: `${project.projectNumber} — dispute ${dispute.disputeNumber} returned to customer`,
      performedBy: performer,
      meta: {
        module: 'construction',
        projectId: String(project._id),
        projectNumber: project.projectNumber,
        disputeId: String(dispute._id),
        disputeNumber: dispute.disputeNumber,
      },
    });
    project.refundedAmount = round2(project.refundedAmount + toCustomer);
  }

  if (toContractor > 0 || toCustomer > 0) {
    project.lastActivityAt = new Date();
    await project.save();
  }

  // ---- stage ----
  if (stage) {
    if (outcome === 'dismissed') {
      await unfreezeStage(
        dispute, dispute.preDisputeStatus, performer,
        `Dispute ${dispute.disputeNumber} dismissed`,
      );
    } else if (outcome === 'released_to_contractor') {
      stage.status = 'payment_released';
      stage.releasedAmount = round2((stage.releasedAmount || 0) + toContractor);
      stage.releasedAt = new Date();
      stage.releaseReference = `${reference}_release`;
      stage.statusHistory.push({
        status: 'payment_released',
        reason: `Dispute ${dispute.disputeNumber} resolved: paid to contractor`,
        at: new Date(),
        by: performer,
      });
      await stage.save();
    } else {
      // Refunded or split — the stage is settled either way and must not be
      // claimable again. Partial payment is recorded on the stage as released.
      stage.status = 'payment_released';
      stage.releasedAmount = round2((stage.releasedAmount || 0) + toContractor);
      stage.releasedAt = new Date();
      stage.releaseReference = `${reference}_release`;
      stage.statusHistory.push({
        status: 'payment_released',
        reason: `Dispute ${dispute.disputeNumber} resolved: `
          + `₹${toContractor.toLocaleString('en-IN')} to contractor, `
          + `₹${toCustomer.toLocaleString('en-IN')} returned`,
        at: new Date(),
        by: performer,
      });
      await stage.save();
    }
  }

  // ---- close the dispute ----
  dispute.status = 'resolved';
  dispute.outcome = outcome;
  dispute.resolutionNote = note;
  dispute.amountToContractor = toContractor;
  dispute.amountToCustomer = toCustomer;
  dispute.resolvedAt = new Date();
  dispute.resolvedBy = performer;
  dispute.settlementReference = reference;
  dispute.timeline.push({
    action: `resolved_${outcome}`,
    note,
    byType: 'ADMIN',
    by: performer,
    at: new Date(),
  });
  dispute.lastActivityAt = new Date();
  await dispute.save();

  await recordAudit({
    module: 'construction',
    action: 'construction.dispute.resolved',
    entityType: 'project',
    entityId: project._id,
    performedBy: performer,
    metadata: {
      disputeId: String(dispute._id),
      disputeNumber: dispute.disputeNumber,
      outcome,
      toContractor,
      toCustomer,
      reference,
    },
  });

  const summary = outcome === 'dismissed'
    ? 'no change to the payment; work continues'
    : `₹${toContractor.toLocaleString('en-IN')} to the contractor, `
      + `₹${toCustomer.toLocaleString('en-IN')} back to the customer`;

  await postSystemMessage(project._id, {
    systemEvent: 'DISPUTE_RESOLVED',
    body: `Dispute ${dispute.disputeNumber} was resolved — ${summary}. ${note}`,
    relatedStageId: stage?._id || null,
    relatedDisputeId: dispute._id,
  }).catch(() => {});

  await notifyDisputeResolved(project, dispute).catch(() => {});

  logger.info(
    `[construction] dispute ${dispute.disputeNumber} resolved (${outcome}): `
    + `contractor ${toContractor}, customer ${toCustomer}`,
  );

  return { dispute: dispute.toObject(), toContractor, toCustomer };
};

/** The party who raised it can back out while it is still open. */
export const withdrawDispute = async (disputeId, reason, actor = {}) => {
  const dispute = await ProjectDispute.findOne({ _id: disputeId, ...alive });
  if (!dispute) throw new ValidationError('Dispute not found');
  if (dispute.status === 'resolved') throw new ValidationError('This dispute is already resolved');
  if (dispute.status === 'withdrawn') return dispute.toObject();

  if (!actor.isAdmin) {
    const { side } = await resolveSide(dispute.projectId, actor);
    if (side !== dispute.raisedByType) {
      throw new ValidationError('Only the party who raised this dispute can withdraw it');
    }
  }

  const performer = extractPerformer(actor.reqUser) || null;

  dispute.status = 'withdrawn';
  dispute.timeline.push({
    action: 'withdrawn',
    note: String(reason || '').trim().slice(0, 500),
    byType: actor.isAdmin ? 'ADMIN' : dispute.raisedByType,
    by: performer,
    at: new Date(),
  });
  dispute.lastActivityAt = new Date();
  await dispute.save();

  await unfreezeStage(
    dispute, dispute.preDisputeStatus, performer,
    `Dispute ${dispute.disputeNumber} withdrawn`,
  );

  await postSystemMessage(dispute.projectId, {
    systemEvent: 'DISPUTE_WITHDRAWN',
    body: `Dispute ${dispute.disputeNumber} was withdrawn. Work continues as before.`,
    relatedStageId: dispute.stageId,
    relatedDisputeId: dispute._id,
  }).catch(() => {});

  return dispute.toObject();
};

// ---------------------------------------------------------------- reading

export const listDisputesForProject = async (projectId, actor = {}) => {
  if (!actor.isAdmin) await resolveSide(projectId, actor);
  return ProjectDispute.find({ projectId, ...alive }).sort({ createdAt: -1 }).lean();
};

export const getDispute = async (disputeId, actor = {}) => {
  const dispute = await ProjectDispute.findOne({ _id: disputeId, ...alive })
    .populate('projectId', 'projectNumber title agreedValue status')
    .populate('contractorId', 'businessName contractorCode phone')
    .populate('customerId', 'name phone')
    .lean();
  if (!dispute) throw new ValidationError('Dispute not found');

  if (!actor.isAdmin) {
    await resolveSide(dispute.projectId?._id || dispute.projectId, actor);
  }

  const stage = dispute.stageId
    ? await ProjectStage.findById(dispute.stageId)
      .select('name sequence amount status targetDate').lean()
    : null;

  return { dispute, stage };
};

/** BRD A6 — the support queue. Oldest untouched first. */
export const listDisputesAdmin = async (query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { ...alive };
  if (query.status) filter.status = query.status;
  if (query.contractorId) filter.contractorId = query.contractorId;

  const [docs, total] = await Promise.all([
    ProjectDispute.find(filter)
      .populate('projectId', 'projectNumber title agreedValue')
      .populate('contractorId', 'businessName contractorCode')
      .populate('customerId', 'name phone')
      .sort({ status: 1, createdAt: 1 })
      .skip(skip).limit(limit).lean(),
    ProjectDispute.countDocuments(filter),
  ]);

  return buildPaginatedResult({ docs, total, page, limit });
};

export const getDisputeStats = async () => {
  const rows = await ProjectDispute.aggregate([
    { $match: alive },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        frozen: { $sum: '$frozenAmount' },
      },
    },
  ]);

  const byStatus = rows.reduce((a, r) => ({ ...a, [r._id]: r.count }), {});
  const frozenLive = rows
    .filter((r) => ['open', 'under_review'].includes(r._id))
    .reduce((sum, r) => sum + (r.frozen || 0), 0);

  return {
    open: byStatus.open || 0,
    underReview: byStatus.under_review || 0,
    resolved: byStatus.resolved || 0,
    withdrawn: byStatus.withdrawn || 0,
    /** Customer money currently frozen by live disputes — the number ops cares about. */
    moneyFrozen: round2(frozenLive),
  };
};

export { REASON_LABELS };
