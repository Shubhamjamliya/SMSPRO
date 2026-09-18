import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { releaseHold } from '../../../core/wallet/hold.service.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectStage } from '../models/projectStage.model.js';
import { StageSubmission } from '../models/stageSubmission.model.js';
import { getSettings } from './settings.service.js';
import { touchProject, round2 } from './project.service.js';
import { logger } from '../../../utils/logger.js';
import { notify } from './notify.service.js';

const alive = { isDeleted: { $ne: true } };

const pushStatus = (stage, status, reason, performer = null) => {
  stage.status = status;
  stage.statusHistory.push({ status, reason: reason || '', at: new Date(), by: performer });
};

/** A project must be live before any stage work counts. */
const assertProjectWorkable = (project) => {
  if (project.status === 'on_hold') {
    throw new ValidationError('This project is on hold. Contact support before continuing.');
  }
  if (['cancelled', 'closed'].includes(project.status)) {
    throw new ValidationError('This project is closed');
  }
  if (project.status === 'awaiting_funding') {
    throw new ValidationError('The customer has not funded this project yet');
  }
};

/** BRD W15 — record progress on a stage without submitting it. */
export const updateProgress = async (contractorId, stageId, { progressPercent, notes }) => {
  const stage = await ProjectStage.findOne({ _id: stageId, contractorId });
  if (!stage) throw new ValidationError('Stage not found');
  if (['approved', 'payment_released'].includes(stage.status)) {
    throw new ValidationError('This stage is already complete');
  }

  const project = await ConstructionProject.findById(stage.projectId);
  assertProjectWorkable(project);

  stage.progressPercent = Math.min(100, Math.max(0, Number(progressPercent) || 0));
  if (stage.status === 'pending') pushStatus(stage, 'in_progress', 'Work started');
  await stage.save();

  project.lastActivityAt = new Date();
  await project.save();

  return stage.toObject();
};

/**
 * BRD W16 — mark a stage complete and send it for approval.
 *
 * "Replaces the awkward phone call asking for money with a clean, neutral
 * process." The submission carries the photographic evidence the customer will
 * judge, and the model refuses a submission with no photographs at all.
 */
export const submitStage = async (contractorId, stageId, { progressPercent, notes, photos }) => {
  const stage = await ProjectStage.findOne({ _id: stageId, contractorId });
  if (!stage) throw new ValidationError('Stage not found');
  if (stage.status === 'submitted_for_approval') {
    throw new ValidationError('This stage is already waiting for approval');
  }
  if (['approved', 'payment_released'].includes(stage.status)) {
    throw new ValidationError('This stage is already complete');
  }
  if (stage.status === 'disputed') {
    throw new ValidationError('This stage is under dispute and cannot be resubmitted yet');
  }

  const project = await ConstructionProject.findById(stage.projectId);
  assertProjectWorkable(project);

  // Stages are worked in order: releasing stage 3 before stage 1 would let a
  // contractor collect the easy money and leave the foundation undone.
  const earlierUnfinished = await ProjectStage.findOne({
    projectId: stage.projectId,
    sequence: { $lt: stage.sequence },
    status: { $nin: ['approved', 'payment_released'] },
  }).select('sequence name').lean();
  if (earlierUnfinished) {
    throw new ValidationError(
      `Stage ${earlierUnfinished.sequence} ("${earlierUnfinished.name}") is not complete yet. `
      + 'Stages are approved in order.',
    );
  }

  // The stage's own money must actually be sitting there, or approving it would
  // promise a payment the project cannot make.
  const paidStages = await ProjectStage.find({ projectId: stage.projectId, status: 'payment_released' }).select('amount releasedAmount').lean();
  const actualReleased = round2(paidStages.reduce((sum, s) => sum + (Number(s.releasedAmount) || Number(s.amount) || 0), 0));
  if (project.releasedAmount !== actualReleased) {
    project.releasedAmount = actualReleased;
    await ConstructionProject.updateOne({ _id: project._id }, { $set: { releasedAmount: actualReleased } });
  }

  const held = round2(project.fundedAmount - project.releasedAmount - project.refundedAmount);
  if (held < stage.amount) {
    throw new ValidationError(
      `Only ₹${held.toLocaleString('en-IN')} is held against this project, and this stage is `
      + `₹${stage.amount.toLocaleString('en-IN')}. Ask the customer to fund the difference first.`,
    );
  }

  const previousAttempts = await StageSubmission.countDocuments({ stageId: stage._id });
  const submission = await StageSubmission.create({
    projectId: stage.projectId,
    stageId: stage._id,
    contractorId,
    attempt: previousAttempts + 1,
    progressPercent: Number(progressPercent) || 100,
    notes: String(notes || '').trim(),
    photos: (photos || []).map((p) => (typeof p === 'string'
      ? { url: p, caption: '', capturedAt: null }
      : { url: p.url, caption: p.caption || '', capturedAt: p.capturedAt || null })),
  });

  stage.progressPercent = submission.progressPercent;
  stage.submittedAt = new Date();
  stage.rejectionReason = '';
  pushStatus(stage, 'submitted_for_approval', `Submission #${submission.attempt}`);
  await stage.save();

  project.lastActivityAt = new Date();
  await project.save();

  // BRD C17 — the customer's approval is what releases the money, so they are
  // the one blocking the contractor's payment until they look at it.
  notify({
    ownerType: 'USER',
    ownerId: project.customerId,
    source: 'STAGE_SUBMITTED',
    title: 'A stage is ready for your approval',
    message: `"${stage.name}" has been submitted with ${submission.photos.length} photo`
      + `${submission.photos.length === 1 ? '' : 's'}. Approving releases `
      + `₹${Number(stage.amount).toLocaleString('en-IN')}.`,
    link: `/construction/projects/${project._id}`,
    metadata: { projectId: String(project._id), stageId: String(stage._id) },
  }).catch(() => {});

  await recordAudit({
    module: 'construction',
    entityType: 'project_stage',
    entityId: stage._id,
    action: 'stage.submitted',
    after: {
      projectNumber: project.projectNumber,
      stage: stage.name,
      attempt: submission.attempt,
      photoCount: submission.photos.length,
      amount: stage.amount,
    },
  });

  return { stage: stage.toObject(), submission: submission.toObject() };
};

/**
 * BRD C17 + §13 steps 4–5 — approve a stage and release its payment.
 *
 * This is the ONLY path that turns held money into the contractor's money, and
 * the single most important function in the module.
 *
 * `approvedVia` records which route allowed it, because BRD Q13's whole concern
 * is who is permitted to sign off:
 *   customer    — the normal case
 *   supervisor  — the escalation, when a customer has gone quiet
 *   auto        — the optional backstop, off by default
 *
 * The release is idempotent on `stage.releaseReference`, so a double-tap or a
 * retried request pays exactly once.
 */
export const approveStage = async (stageId, {
  actorRole,          // 'customer' | 'admin'
  actorId,
  reqUser = null,
  via = 'customer',
  note = '',
} = {}) => {
  const stage = await ProjectStage.findById(stageId);
  if (!stage) throw new ValidationError('Stage not found');

  if (stage.status === 'payment_released') {
    // Already done — return the current state rather than erroring, so a
    // retried request from a flaky connection is harmless.
    return { stage: stage.toObject(), alreadyReleased: true };
  }
  // The dispute check MUST come first. `disputed` is not one of the two statuses
  // the next guard allows, so putting it second made it unreachable and told a
  // customer their disputed stage "has not been submitted for approval" — which
  // is both wrong and the opposite of reassuring when their money is frozen.
  if (stage.status === 'disputed') {
    throw new ValidationError(
      'This stage is under dispute. Our team will decide it, and the money stays held until they do.',
    );
  }
  if (stage.status !== 'submitted_for_approval' && stage.status !== 'approved') {
    throw new ValidationError('This stage has not been submitted for approval');
  }

  const project = await ConstructionProject.findById(stage.projectId);
  if (!project) throw new ValidationError('Project not found');
  assertProjectWorkable(project);

  // Who is allowed to approve (BRD Q13).
  const settings = await getSettings();
  const mode = settings.stages?.stageApprovalMode || 'customer_or_supervisor';

  if (actorRole === 'customer') {
    if (String(project.customerId) !== String(actorId)) {
      throw new ValidationError('Project not found');
    }
    if (mode === 'supervisor_required') {
      throw new ValidationError(
        'Stage approvals on this platform are confirmed by our team. We will review it shortly.',
      );
    }
    const participant = (project.participants || [])
      .find((p) => String(p.userId) === String(actorId));
    if (participant && participant.canApproveStages === false) {
      throw new ValidationError('You do not have permission to approve stages on this project');
    }
  } else if (actorRole === 'admin') {
    if (mode === 'customer_only') {
      throw new ValidationError(
        'This platform is set to customer-only approval. Change the setting before approving on their behalf.',
      );
    }
  } else {
    throw new ValidationError('Not allowed');
  }

  const performer = extractPerformer(reqUser);

  const paidStages = await ProjectStage.find({ projectId: stage.projectId, status: 'payment_released' }).select('amount releasedAmount').lean();
  const actualReleased = round2(paidStages.reduce((sum, s) => sum + (Number(s.releasedAmount) || Number(s.amount) || 0), 0));
  if (project.releasedAmount !== actualReleased) {
    project.releasedAmount = actualReleased;
    await ConstructionProject.updateOne({ _id: project._id }, { $set: { releasedAmount: actualReleased } });
  }

  const heldBefore = round2(project.fundedAmount - project.releasedAmount - project.refundedAmount);
  if (heldBefore < stage.amount) {
    throw new ValidationError(
      `Cannot release ₹${stage.amount.toLocaleString('en-IN')} — only `
      + `₹${heldBefore.toLocaleString('en-IN')} is held against this project.`,
    );
  }

  // Mark approved first so the intent is on the record even if the release
  // then fails; a stuck approved stage is recoverable, a silent one is not.
  if (stage.status !== 'approved') {
    stage.approvedAt = new Date();
    stage.approvedBy = performer;
    stage.approvedVia = via;
    pushStatus(stage, 'approved', note || `Approved by ${via}`, performer);
    await stage.save();
  }

  // Commission, if it is charged per stage (BRD §13).
  const commission = project.commission || {};
  const commissionAmount = commission.chargedAt === 'per_stage' && commission.model === 'percentage'
    ? round2((stage.amount * (Number(commission.value) || 0)) / 100)
    : 0;

  /**
   * BRD §13 step 7 — "a small final portion may be held back for an agreed
   * period after completion, in case defects appear."
   *
   * Retention is withheld proportionally from EACH stage release rather than
   * taken out of the last one. Loading it all onto the final stage would mean a
   * contractor who finishes the work still waits on a disproportionate lump,
   * and it would break down entirely on a two-stage project where retention
   * exceeds the final stage's value.
   *
   * The withheld amount simply stays in the hold and is released at
   * `releaseRetention()` once the defect liability period is over.
   */
  const retentionPercent = Number(project.retentionPercent) || 0;
  const retainedAmount = stage.isRetention
    ? 0
    : round2((stage.amount * retentionPercent) / 100);
  const payableNow = round2(stage.amount - retainedAmount);

  if (payableNow <= 0) {
    throw new ValidationError('Nothing is payable on this stage after retention — check the settings');
  }

  let release = { alreadyProcessed: false };
  if (project.holdId) {
    release = await releaseHold({
      holdId: project.holdId,
      amount: payableNow,
      reference: stage.releaseReference,
      reason: `${project.projectNumber} — ${stage.name}`,
      payee: { entityType: 'contractor', entityId: project.contractorId },
      performedBy: performer,
      category: 'escrow_release',
      payeeCategory: 'escrow_release',
      description: `Stage payment: ${stage.name}`,
      payeeDescription: `${project.projectNumber} — ${stage.name}`,
      meta: {
        projectId: String(project._id),
        projectNumber: project.projectNumber,
        stageId: String(stage._id),
        stageSequence: stage.sequence,
        commissionAmount,
        retainedAmount,
      },
    });
  }

  if (!release.alreadyProcessed) {
    stage.releasedAt = new Date();
    stage.releasedAmount = payableNow;
    stage.retainedAmount = retainedAmount;
    stage.commissionAmount = commissionAmount;
    pushStatus(
      stage,
      'payment_released',
      retainedAmount > 0
        ? `Released ₹${payableNow.toLocaleString('en-IN')}; ₹${retainedAmount.toLocaleString('en-IN')} held as retention`
        : 'Payment released to the contractor',
      performer,
    );
    await stage.save();

    project.releasedAmount = round2(project.releasedAmount + payableNow);
    project.commission.collectedAmount = round2(
      (project.commission.collectedAmount || 0) + commissionAmount,
    );
    project.lastActivityAt = new Date();
    await project.save();
  } else if (stage.status !== 'payment_released') {
    // The ledger already paid this reference — bring the stage into line rather
    // than leaving it looking unpaid.
    stage.releasedAt = stage.releasedAt || new Date();
    stage.releasedAmount = payableNow;
    pushStatus(stage, 'payment_released', 'Payment already released (replayed)', performer);
    await stage.save();
  }

  await StageSubmission.updateMany(
    { stageId: stage._id, reviewOutcome: '' },
    { $set: { reviewedAt: new Date(), reviewOutcome: 'approved', reviewNote: note || '' } },
  );

  // BRD W17 — "automatic payment once a stage is approved, no chasing."
  if (!release.alreadyProcessed) {
    notify({
      ownerType: 'CONTRACTOR',
      ownerId: project.contractorId,
      source: 'PAYMENT_RELEASED',
      title: 'Payment released',
      message: `₹${payableNow.toLocaleString('en-IN')} for "${stage.name}" has reached your wallet.`
        + (retainedAmount > 0
          ? ` ₹${retainedAmount.toLocaleString('en-IN')} is held as retention until handover.`
          : ''),
      link: `/contractor/projects/${project._id}`,
      metadata: {
        projectId: String(project._id),
        stageId: String(stage._id),
        amount: payableNow,
      },
    }).catch(() => {});
  }

  await recordAudit({
    module: 'construction',
    entityType: 'project_stage',
    entityId: stage._id,
    action: 'stage.approved',
    after: {
      projectNumber: project.projectNumber,
      stage: stage.name,
      stageValue: stage.amount,
      released: payableNow,
      retained: retainedAmount,
      via,
      commissionAmount,
      alreadyReleased: Boolean(release.alreadyProcessed),
    },
    performedBy: performer,
  });

  await advanceProject(project);

  return {
    stage: stage.toObject(),
    hold: release.hold,
    alreadyReleased: Boolean(release.alreadyProcessed),
  };
};

/** BRD C17 — send it back for more work, with a reason the contractor can act on. */
export const rejectStage = async (stageId, { actorId, reqUser = null, reason }) => {
  const rejectionReason = String(reason || '').trim();
  if (!rejectionReason) {
    throw new ValidationError('Say what still needs doing — the contractor needs something to act on');
  }

  const stage = await ProjectStage.findById(stageId);
  if (!stage) throw new ValidationError('Stage not found');
  if (stage.status !== 'submitted_for_approval') {
    throw new ValidationError('This stage is not waiting for approval');
  }

  const project = await ConstructionProject.findById(stage.projectId);
  if (!project) throw new ValidationError('Project not found');
  if (actorId && String(project.customerId) !== String(actorId)) {
    throw new ValidationError('Project not found');
  }

  const performer = extractPerformer(reqUser);
  stage.rejectedAt = new Date();
  stage.rejectionReason = rejectionReason;
  pushStatus(stage, 'in_progress', rejectionReason, performer);
  await stage.save();

  await StageSubmission.updateMany(
    { stageId: stage._id, reviewOutcome: '' },
    { $set: { reviewedAt: new Date(), reviewOutcome: 'rejected', reviewNote: rejectionReason } },
  );

  project.lastActivityAt = new Date();
  await project.save();

  notify({
    ownerType: 'CONTRACTOR',
    ownerId: project.contractorId,
    source: 'STAGE_APPROVED',
    title: 'A stage was sent back',
    message: `"${stage.name}" needs more work — ${rejectionReason}`,
    link: `/contractor/projects/${project._id}`,
    metadata: { projectId: String(project._id), stageId: String(stage._id) },
  }).catch(() => {});

  await recordAudit({
    module: 'construction',
    entityType: 'project_stage',
    entityId: stage._id,
    action: 'stage.rejected',
    after: { projectNumber: project.projectNumber, stage: stage.name, reason: rejectionReason },
    performedBy: performer,
  });

  return stage.toObject();
};

/**
 * Move the project on once every stage is paid.
 * Kept private to this module — a project's status should only ever change as a
 * consequence of stage progress, never by direct assignment from a controller.
 */
const advanceProject = async (project) => {
  const remaining = await ProjectStage.countDocuments({
    projectId: project._id,
    status: { $nin: ['payment_released'] },
  });
  if (remaining > 0) return;

  const fresh = await ConstructionProject.findById(project._id);
  if (!fresh || ['completed', 'closed', 'cancelled'].includes(fresh.status)) return;

  fresh.stagesCompletedAt = new Date();
  touchProject(fresh, 'handover_pending', 'All stages approved and paid');
  await fresh.save();

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: fresh._id,
    action: 'project.stages_complete',
    after: { projectNumber: fresh.projectNumber, released: fresh.releasedAmount },
  });
};

/** Everything waiting on this customer right now. */
export const listStagesAwaitingCustomer = async (customerId) => ProjectStage
  .find({ customerId, status: 'submitted_for_approval' })
  .populate('projectId', 'projectNumber title agreedValue')
  .sort({ submittedAt: 1 })
  .lean();

export const getStage = async (stageId, { customerId, contractorId } = {}) => {
  const filter = { _id: stageId };
  if (customerId) filter.customerId = customerId;
  if (contractorId) filter.contractorId = contractorId;

  const stage = await ProjectStage.findOne(filter)
    .populate('projectId', 'projectNumber title agreedValue status fundedAmount releasedAmount refundedAmount')
    .lean();
  if (!stage) throw new ValidationError('Stage not found');

  const submissions = await StageSubmission.find({ stageId })
    .sort({ attempt: -1 })
    .lean();

  return { stage, submissions };
};

/**
 * BRD Q13 — escalate stages the customer has gone quiet on.
 *
 * Deliberately does NOT approve anything. It flags the stage so your team can
 * look at the evidence and decide. Auto-approval is a separate, opt-in setting
 * because releasing someone's money without a human looking is a bigger step
 * than surfacing it for review.
 */
export const escalateStaleApprovals = async () => {
  const settings = await getSettings();
  const days = Number(settings.stages?.approvalEscalationDays) || 7;
  const autoDays = Number(settings.stages?.autoApproveAfterDays) || 0;
  const cutoff = new Date(Date.now() - days * 86400000);

  const stale = await ProjectStage.find({
    status: 'submitted_for_approval',
    submittedAt: { $lt: cutoff },
    escalatedAt: null,
  }).select('_id projectId name submittedAt').lean();

  if (stale.length) {
    await ProjectStage.updateMany(
      { _id: { $in: stale.map((s) => s._id) } },
      { $set: { escalatedAt: new Date() } },
    );
    logger.info(`[construction] ${stale.length} stage(s) escalated for supervisor review`);
  }

  let autoApproved = 0;
  if (autoDays > 0) {
    const autoCutoff = new Date(Date.now() - autoDays * 86400000);
    const overdue = await ProjectStage.find({
      status: 'submitted_for_approval',
      submittedAt: { $lt: autoCutoff },
    }).select('_id').lean();

    for (const s of overdue) {
      try {
        await approveStage(s._id, { actorRole: 'admin', via: 'auto', note: 'Auto-approved after the configured waiting period' });
        autoApproved += 1;
      } catch (error) {
        logger.warn(`[construction] auto-approval failed for stage ${s._id}: ${error.message}`);
      }
    }
  }

  return { escalated: stale.length, autoApproved };
};

/** BRD C18 — a stage past its target date, flagged once for both sides. */
export const findDelayedStages = async () => {
  const settings = await getSettings();
  const grace = Number(settings.stages?.delayAlertAfterDays) || 0;
  const cutoff = new Date(Date.now() - grace * 86400000);

  return ProjectStage.find({
    status: { $in: ['pending', 'in_progress'] },
    targetDate: { $ne: null, $lt: cutoff },
    delayAlertedAt: null,
  })
    .populate('projectId', 'projectNumber customerId contractorId')
    .lean();
};

export const markStagesAlerted = async (stageIds) => {
  if (!stageIds?.length) return 0;
  const result = await ProjectStage.updateMany(
    { _id: { $in: stageIds } },
    { $set: { delayAlertedAt: new Date() } },
  );
  return result.modifiedCount || 0;
};
