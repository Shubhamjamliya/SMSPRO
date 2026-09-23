import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../utils/helpers.js';
import {
  createHold, refundHold, cancelHold, getHoldById, listHoldLedger, reconcileHold,
  getAvailableBalance,
} from '../../../core/wallet/hold.service.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectStage } from '../models/projectStage.model.js';
import { StageSubmission } from '../models/stageSubmission.model.js';
import { ConstructionEnquiry } from '../models/constructionEnquiry.model.js';
import { Quotation } from '../models/quotation.model.js';
import { PackageRequest } from '../models/packageRequest.model.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ConstructionService } from '../models/constructionService.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { getSettings } from './settings.service.js';
import { logger } from '../../../utils/logger.js';

const alive = { isDeleted: { $ne: true } };
// A support operator pasting "C-12/A." into the search box must have it
// treated as text, not as regex syntax — and must not be able to turn the
// box into a CPU attack with a pathological pattern.
const REGEX_SPECIALS = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
const escapeRegex = (value) => String(value)
    .split('')
    .map((ch) => (REGEX_SPECIALS.has(ch) ? `\\${ch}` : ch))
    .join('');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const HOLD_MODULE = 'construction';
const HOLD_REF_TYPE = 'construction_project';

const touch = (project, status, reason, performer = null) => {
  if (status && project.status !== status) {
    project.status = status;
    project.statusHistory.push({ status, reason: reason || '', at: new Date(), by: performer });
  }
  project.lastActivityAt = new Date();
};

/**
 * BRD step 9 — accepting a quotation turns the enquiry into a live project.
 *
 * Everything commercial is snapshotted here. `agreedValue` comes from the
 * quotation total at this instant and never moves again; retention and
 * commission terms are copied from settings so a later change of policy cannot
 * re-price a project already under way.
 *
 * Idempotent on quotationId (unique index), so a retried acceptance returns the
 * project that already exists rather than creating a second one.
 */
export const createProjectFromQuotation = async (quotationId) => {
  const existing = await ConstructionProject.findOne({ quotationId, ...alive });
  if (existing) return existing.toObject();

  const quotation = await Quotation.findOne({ _id: quotationId, ...alive }).lean();
  if (!quotation) throw new ValidationError('Quotation not found');
  if (quotation.status !== 'accepted') {
    throw new ValidationError('Only an accepted quotation becomes a project');
  }

  const enquiry = await ConstructionEnquiry.findById(quotation.enquiryId);
  if (!enquiry) throw new ValidationError('Enquiry not found');

  const settings = await getSettings();
  const money = settings.money || {};
  const commission = settings.commission || {};

  const agreedValue = round2(quotation.total);
  if (agreedValue <= 0) throw new ValidationError('The agreed value must be greater than zero');

  let project;
  try {
    project = await ConstructionProject.create({
      enquiryId: quotation.enquiryId,
      quotationId: quotation._id,
      customerId: quotation.customerId,
      contractorId: quotation.contractorId,
      serviceId: enquiry.serviceId,
      title: quotation.title || 'Construction project',
      agreedValue,
      retentionPercent: Number(money.retentionPercent) || 0,
      defectLiabilityDays: Number(money.defectLiabilityDays) || 0,
      commission: {
        model: commission.model || 'percentage',
        value: Number(commission.value) || 0,
        chargedAt: commission.chargedAt || 'per_stage',
        chargedTo: commission.chargedTo || 'contractor',
        collectedAmount: 0,
      },
      participants: [{
        userId: quotation.customerId,
        role: 'owner',
        canApproveStages: true,
        canApprovePayments: true,
      }],
      status: 'awaiting_funding',
      statusHistory: [{ status: 'awaiting_funding', reason: 'Quotation accepted', at: new Date() }],
    });
  } catch (err) {
    // Lost a race on the unique quotationId — return the winner.
    if (err?.code === 11000) {
      const raced = await ConstructionProject.findOne({ quotationId, ...alive });
      if (raced) return raced.toObject();
    }
    throw err;
  }

  await buildStages(project, quotation.proposedStages || []);

  enquiry.projectId = project._id;
  enquiry.status = 'converted';
  enquiry.statusHistory.push({
    status: 'converted', reason: `Project ${project.projectNumber} created`, at: new Date(),
  });
  enquiry.lastActivityAt = new Date();
  await enquiry.save();

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'project.created',
    after: {
      projectNumber: project.projectNumber,
      agreedValue,
      quotationNumber: quotation.quotationNumber,
      contractorId: String(quotation.contractorId),
    },
  });

  return project.toObject();
};

/**
 * The package/site-visit pipeline's equivalent of `createProjectFromQuotation`
 * (see the model's doc comment for why these are two separate paths).
 *
 * A package `contract` is a single fixed price, not an itemised, staged
 * quotation — there is no `proposedStages` to carry over. So the stage plan is
 * synthesised here: an advance/balance split when the contract has an advance,
 * otherwise `buildStages`' own fallback of one 100% "Completion" stage.
 *
 * Idempotent on packageRequestId (unique index), so a retried confirmation
 * returns the project that already exists rather than creating a second one.
 */
export const createProjectFromPackageContract = async (packageRequestId) => {
  const existing = await ConstructionProject.findOne({ packageRequestId, ...alive });
  if (existing) return existing.toObject();

  const request = await PackageRequest.findOne({ _id: packageRequestId, ...alive }).lean();
  if (!request) throw new ValidationError('Site visit request not found');
  if (request.contract?.status !== 'accepted') {
    throw new ValidationError('Only an accepted contract becomes a project');
  }
  if (!request.assignedContractorId) throw new ValidationError('No contractor is assigned to this request');

  const settings = await getSettings();
  const money = settings.money || {};
  const commission = settings.commission || {};

  const agreedValue = round2(request.contract.price);
  if (agreedValue <= 0) throw new ValidationError('The agreed value must be greater than zero');

  let project;
  try {
    project = await ConstructionProject.create({
      packageRequestId: request._id,
      customerId: request.customerId,
      contractorId: request.assignedContractorId,
      title: request.package?.name || 'Construction project',
      agreedValue,
      retentionPercent: Number(money.retentionPercent) || 0,
      defectLiabilityDays: Number(money.defectLiabilityDays) || 0,
      commission: {
        model: commission.model || 'percentage',
        value: Number(commission.value) || 0,
        chargedAt: commission.chargedAt || 'per_stage',
        chargedTo: commission.chargedTo || 'contractor',
        collectedAmount: 0,
      },
      participants: [{
        userId: request.customerId,
        role: 'owner',
        canApproveStages: true,
        canApprovePayments: true,
      }],
      status: 'awaiting_funding',
      statusHistory: [{ status: 'awaiting_funding', reason: 'Contract confirmed by contractor', at: new Date() }],
    });
  } catch (err) {
    // Lost a race on the unique packageRequestId — return the winner.
    if (err?.code === 11000) {
      const raced = await ConstructionProject.findOne({ packageRequestId, ...alive });
      if (raced) return raced.toObject();
    }
    throw err;
  }

  const advance = round2(request.contract.advanceAmount || 0);
  const proposedStages = advance > 0 && advance < agreedValue
    ? [
      {
        name: 'Advance',
        percentage: round2((advance / agreedValue) * 100),
        description: 'Booking advance',
      },
      {
        // Subtracted from 100 rather than computed independently, so the two
        // percentages always sum to exactly 100 regardless of rounding.
        name: 'Balance on completion',
        percentage: round2(100 - round2((advance / agreedValue) * 100)),
        description: 'Remaining balance on completion',
      },
    ]
    : [];
  await buildStages(project, proposedStages);

  await PackageRequest.updateOne({ _id: request._id }, { $set: { projectId: project._id } });

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'project.created',
    after: {
      projectNumber: project.projectNumber,
      agreedValue,
      contractNumber: request.contract.number,
      contractorId: String(request.assignedContractorId),
    },
  });

  return project.toObject();
};

/**
 * Turn the quotation's proposed stages into real, payable milestones.
 *
 * Amounts are derived from percentages and then REMAINDER-CORRECTED on the last
 * stage. Percentages of an odd total do not divide cleanly, and rounding each
 * one independently would leave the stage amounts summing to slightly less or
 * more than the agreed value — which would break the escrow invariant the whole
 * module depends on.
 */
const buildStages = async (project, proposedStages) => {
  const stages = proposedStages.length
    ? proposedStages
    // A quotation with no stage plan still needs one milestone, or nothing is
    // ever payable. Better a single full-value stage than a stuck project.
    : [{ name: 'Completion', percentage: 100, description: 'Full project completion' }];

  const rows = [];
  let allocated = 0;

  stages.forEach((stage, index) => {
    const isLast = index === stages.length - 1;
    const amount = isLast
      ? round2(project.agreedValue - allocated)
      : round2((project.agreedValue * Number(stage.percentage)) / 100);
    allocated = round2(allocated + amount);

    rows.push({
      projectId: project._id,
      contractorId: project.contractorId,
      customerId: project.customerId,
      sequence: index + 1,
      name: stage.name,
      description: stage.description || '',
      percentage: Number(stage.percentage) || 0,
      amount,
      targetDate: stage.targetDays
        ? new Date(Date.now() + Number(stage.targetDays) * 86400000)
        : null,
      status: 'pending',
      // Stable, unique per stage — this is what makes a release idempotent.
      releaseReference: `stage_release_${project._id}_${index + 1}`,
    });
  });

  await ProjectStage.insertMany(rows);

  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  if (total !== round2(project.agreedValue)) {
    // Should be impossible after the remainder correction — but this invariant
    // is exactly the kind that must scream rather than drift quietly.
    logger.error(
      `[construction] stage amounts ${total} != agreed value ${project.agreedValue} `
      + `on ${project.projectNumber}`,
    );
  }
  return rows;
};

/**
 * BRD C22 / §13 steps 1–2 — the customer funds the project.
 *
 * Money does NOT move to the platform. It stays in the customer's own wallet
 * and is marked reserved, which is the distinction that may matter a great deal
 * to the legal position (BRD Q8).
 */
export const fundProject = async (customerId, projectId, amount) => {
  const project = await ConstructionProject.findOne({ _id: projectId, customerId, ...alive });
  if (!project) throw new ValidationError('Project not found');
  if (['cancelled', 'closed'].includes(project.status)) {
    throw new ValidationError('This project is closed');
  }

  const requested = round2(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new ValidationError('Enter an amount greater than zero');
  }

  const outstanding = round2(project.agreedValue - project.fundedAmount);
  if (outstanding <= 0) throw new ValidationError('This project is already fully funded');
  if (requested > outstanding) {
    throw new ValidationError(
      `Only ₹${outstanding.toLocaleString('en-IN')} is still needed to fund this project.`,
    );
  }

  const wallet = await getAvailableBalance(customerId);
  if (wallet.availableBalance < requested) {
    throw new ValidationError(
      `You have ₹${wallet.availableBalance.toLocaleString('en-IN')} available. `
      + 'Add money to your wallet first.',
    );
  }

  // Each top-up is its own ledger entry, so partial funding over time is a
  // readable history rather than a single mutating number.
  const fundedSoFar = round2(project.fundedAmount);
  const result = await createHold({
    userId: customerId,
    module: HOLD_MODULE,
    refType: HOLD_REF_TYPE,
    refId: project._id,
    amount: requested,
    reason: `Funding ${project.projectNumber}`,
    reference: `project_fund_${project._id}_${fundedSoFar}_${requested}`,
    meta: { projectNumber: project.projectNumber },
  });

  if (!result.alreadyProcessed) {
    project.holdId = result.hold.id;
    project.fundedAmount = round2(project.fundedAmount + requested);
    if (project.status === 'awaiting_funding' && project.fundedAmount > 0) {
      touch(project, 'active', 'Project funded');
      project.startedAt = project.startedAt || new Date();
      // The first stage becomes workable the moment there is money behind it.
      await ProjectStage.updateOne(
        { projectId: project._id, sequence: 1, status: 'pending' },
        { $set: { status: 'in_progress' }, $push: { statusHistory: { status: 'in_progress', reason: 'Project funded', at: new Date() } } },
      );
    }
    project.lastActivityAt = new Date();
    await project.save();

    await recordAudit({
      module: 'construction',
      entityType: 'project',
      entityId: project._id,
      action: 'project.funded',
      after: {
        amount: requested,
        fundedTotal: project.fundedAmount,
        agreedValue: project.agreedValue,
        holdId: String(result.hold.id),
      },
    });
  }

  return {
    project: project.toObject(),
    hold: result.hold,
    alreadyProcessed: Boolean(result.alreadyProcessed),
  };
};

/** BRD C14 / C21 — the customer's project dashboard. */
export const getProjectForCustomer = async (customerId, projectId) => {
  const project = await ConstructionProject
    .findOne({ _id: projectId, customerId, ...alive })
    .populate('contractorId', 'businessName contractorCode phone rating totalRatings profileImage')
    .populate('serviceId', 'name')
    .lean();
  if (!project) throw new ValidationError('Project not found');
  return decorateProject(project);
};

/** BRD W14 — the contractor's project workspace. */
export const getProjectForContractor = async (contractorId, projectId) => {
  const project = await ConstructionProject
    .findOne({ _id: projectId, contractorId, ...alive })
    .populate('customerId', 'name phone')
    .populate('serviceId', 'name')
    .lean();
  if (!project) throw new ValidationError('Project not found');
  return decorateProject(project);
};

const decorateProject = async (project) => {
  const [stages, submissions] = await Promise.all([
    ProjectStage.find({ projectId: project._id }).sort({ sequence: 1 }).lean(),
    StageSubmission.find({ projectId: project._id }).sort({ createdAt: -1 }).lean(),
  ]);

  const byStage = new Map();
  for (const s of submissions) {
    const key = String(s.stageId);
    if (!byStage.has(key)) byStage.set(key, []);
    byStage.get(key).push(s);
  }

  // Self-heal/reconcile releasedAmount to match actually released stages
  const releasedSum = stages.reduce(
    (sum, s) => sum + (s.status === 'payment_released' ? (Number(s.releasedAmount) || Number(s.amount) || 0) : 0),
    0,
  );
  const correctReleased = round2(releasedSum);
  if (project.releasedAmount !== correctReleased) {
    project.releasedAmount = correctReleased;
    await ConstructionProject.updateOne({ _id: project._id }, { $set: { releasedAmount: correctReleased } });
  }

  const held = round2(project.fundedAmount - project.releasedAmount - project.refundedAmount);
  const approvedCount = stages.filter((s) =>
    ['approved', 'payment_released'].includes(s.status)).length;

  return {
    project: {
      ...project,
      heldAmount: held,
      outstandingToFund: round2(project.agreedValue - project.fundedAmount),
      progressPercent: stages.length
        ? Math.round((approvedCount / stages.length) * 100)
        : 0,
    },
    stages: stages.map((s) => ({ ...s, submissions: byStage.get(String(s._id)) || [] })),
    // BRD C16 — every photograph, newest first, for the gallery.
    gallery: submissions.flatMap((s) => (s.photos || []).map((p) => ({
      ...p,
      stageId: String(s.stageId),
      submittedAt: s.createdAt,
    }))),
  };
};

export const listCustomerProjects = async (customerId, query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { customerId, ...alive };
  if (query.status) filter.status = query.status;

  const [docs, total] = await Promise.all([
    ConstructionProject.find(filter)
      .populate('contractorId', 'businessName rating profileImage')
      .populate('serviceId', 'name')
      .sort({ lastActivityAt: -1 })
      .skip(skip).limit(limit).lean(),
    ConstructionProject.countDocuments(filter),
  ]);

  return buildPaginatedResult({ docs: await attachStageCounts(docs), total, page, limit });
};

export const listContractorProjects = async (contractorId, query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { contractorId, ...alive };
  if (query.status) filter.status = query.status;

  const [docs, total] = await Promise.all([
    ConstructionProject.find(filter)
      .populate('customerId', 'name phone')
      .populate('serviceId', 'name')
      .sort({ lastActivityAt: -1 })
      .skip(skip).limit(limit).lean(),
    ConstructionProject.countDocuments(filter),
  ]);

  return buildPaginatedResult({ docs: await attachStageCounts(docs), total, page, limit });
};

/** Stage counts drive the "2 of 5 stages done" line on every project card. */
const attachStageCounts = async (projects) => {
  if (!projects.length) return projects;
  const ids = projects.map((p) => p._id);
  const rows = await ProjectStage.aggregate([
    { $match: { projectId: { $in: ids } } },
    {
      $group: {
        _id: '$projectId',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $in: ['$status', ['approved', 'payment_released']] }, 1, 0] } },
        awaitingApproval: { $sum: { $cond: [{ $eq: ['$status', 'submitted_for_approval'] }, 1, 0] } },
      },
    },
  ]);
  const byId = new Map(rows.map((r) => [String(r._id), r]));
  return projects.map((p) => {
    const s = byId.get(String(p._id)) || { total: 0, done: 0, awaitingApproval: 0 };
    return {
      ...p,
      heldAmount: round2(p.fundedAmount - p.releasedAmount - p.refundedAmount),
      stageCount: s.total,
      stagesDone: s.done,
      stagesAwaitingApproval: s.awaitingApproval,
      progressPercent: s.total ? Math.round((s.done / s.total) * 100) : 0,
    };
  });
};

/** BRD C21 — the money breakdown, straight from the ledger. */
export const getProjectMoney = async (projectId, { customerId, contractorId } = {}) => {
  const filter = { _id: projectId, ...alive };
  if (customerId) filter.customerId = customerId;
  if (contractorId) filter.contractorId = contractorId;

  const project = await ConstructionProject.findOne(filter).lean();
  if (!project) throw new ValidationError('Project not found');

  const stages = await ProjectStage.find({ projectId }).sort({ sequence: 1 })
    .select('sequence name amount status releasedAt releasedAmount').lean();

  const ledger = project.holdId ? await listHoldLedger(project.holdId) : [];

  return {
    agreedValue: project.agreedValue,
    funded: round2(project.fundedAmount),
    held: round2(project.fundedAmount - project.releasedAmount - project.refundedAmount),
    released: round2(project.releasedAmount),
    refunded: round2(project.refundedAmount),
    outstandingToFund: round2(project.agreedValue - project.fundedAmount),
    retentionPercent: project.retentionPercent,
    retentionAmount: round2((project.agreedValue * project.retentionPercent) / 100),
    stages,
    ledger,
  };
};

/**
 * Recompute a project's money cache from the escrow ledger.
 *
 * The ledger is authoritative; these totals are a cache. Used by the nightly
 * reconciliation job and by support when a number looks wrong.
 */
export const reconcileProjectMoney = async (projectId, { repair = false } = {}) => {
  const project = await ConstructionProject.findOne({ _id: projectId, ...alive });
  if (!project) throw new ValidationError('Project not found');
  if (!project.holdId) {
    return { projectId: String(projectId), inSync: project.fundedAmount === 0, noHold: true };
  }

  const holdCheck = await reconcileHold(project.holdId, { repair });
  const hold = await getHoldById(project.holdId);

  const drift = {
    funded: round2(hold.amountHeld - project.fundedAmount),
    released: round2(hold.amountReleased - project.releasedAmount),
    refunded: round2(hold.amountRefunded - project.refundedAmount),
  };
  const inSync = drift.funded === 0 && drift.released === 0 && drift.refunded === 0;

  if (!inSync && repair) {
    project.fundedAmount = hold.amountHeld;
    project.releasedAmount = hold.amountReleased;
    project.refundedAmount = hold.amountRefunded;
    await project.save();
    logger.warn(`[construction] project ${project.projectNumber} money repaired from ledger`);
  } else if (!inSync) {
    logger.error(
      `[construction] project ${project.projectNumber} MONEY DRIFT ${JSON.stringify(drift)}`,
    );
  }

  return {
    projectId: String(projectId),
    projectNumber: project.projectNumber,
    inSync: inSync && holdCheck.inSync,
    drift,
    holdReconciliation: holdCheck,
    repaired: Boolean(!inSync && repair),
  };
};

// ---------- Admin (BRD A5, A6) ----------

/** BRD A5 — the full record for one project, unscoped to either party. */
export const getProjectAdmin = async (projectId) => {
  const project = await ConstructionProject
    .findOne({ _id: projectId, ...alive })
    .populate('customerId', 'name phone email')
    .populate('contractorId', 'businessName contractorCode phone rating')
    .populate('serviceId', 'name')
    .lean();
  if (!project) throw new ValidationError('Project not found');

  const [detail, money] = await Promise.all([
    decorateProject(project),
    getProjectMoney(projectId),
  ]);
  return { ...detail, money };
};

export const listProjectsAdmin = async (query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { ...alive };
  if (query.status) filter.status = query.status;
  if (query.contractorId) filter.contractorId = query.contractorId;

  // Support calls arrive as "my project number is..." or "the builder is...", so
  // one box has to cover all three. Customer and contractor live in other
  // collections, so their ids are resolved first and folded into the same $or.
  const search = String(query.search || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    const [contractors, customers] = await Promise.all([
      ContractorProfile.find({ $or: [{ businessName: rx }, { contractorCode: rx }] })
        .select('_id').limit(50).lean(),
      FoodUser.find({ $or: [{ name: rx }, { phone: rx }] })
        .select('_id').limit(50).lean(),
    ]);
    filter.$or = [
      { projectNumber: rx },
      { title: rx },
      { contractorId: { $in: contractors.map((c) => c._id) } },
      { customerId: { $in: customers.map((c) => c._id) } },
    ];
  }

  const [docs, total] = await Promise.all([
    ConstructionProject.find(filter)
      .populate('customerId', 'name phone')
      .populate('contractorId', 'businessName contractorCode')
      .sort({ lastActivityAt: -1 })
      .skip(skip).limit(limit).lean(),
    ConstructionProject.countDocuments(filter),
  ]);

  return buildPaginatedResult({ docs: await attachStageCounts(docs), total, page, limit });
};

/** BRD A6 — "put a project on hold… with the reason recorded." */
export const holdProject = async (projectId, reason, reqUser = null) => {
  const project = await ConstructionProject.findOne({ _id: projectId, ...alive });
  if (!project) throw new ValidationError('Project not found');
  if (['closed', 'cancelled'].includes(project.status)) {
    throw new ValidationError('This project is already closed');
  }

  const performer = extractPerformer(reqUser);
  project.onHoldReason = String(reason || '').trim();
  touch(project, 'on_hold', project.onHoldReason, performer);
  await project.save();

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'project.held',
    after: { reason: project.onHoldReason },
    performedBy: performer,
  });
  return project.toObject();
};

/**
 * BRD A6 - "reassign the contractor".
 *
 * The last of the four interventions the BRD asks for, and much the most
 * delicate, because a project carries money that has already been released to
 * the original contractor for work they actually did.
 *
 * WHAT THIS DOES NOT DO
 * It does not claw anything back. Stages already paid stay paid - that money was
 * released against approved work, and taking it back afterwards would make stage
 * approval meaningless. The new contractor inherits only what is still unpaid.
 *
 * WHAT IT REFUSES
 *   - a stage that is mid-dispute, because the frozen money belongs to an
 *     argument about the OLD contractor and reassigning would orphan it
 *   - a stage awaiting approval, because the customer is being asked to judge
 *     work the outgoing contractor did; that has to resolve first
 *   - a contractor who is not approved, or who is at their declared capacity
 *
 * The project is left ON HOLD afterwards rather than active. A handover between
 * builders is never instant, and quietly resuming the clock would start the new
 * contractor against target dates agreed with someone else.
 */
export const reassignContractor = async (projectId, {
  newContractorId, reason, reqUser = null,
} = {}) => {
  const project = await ConstructionProject.findOne({ _id: projectId, ...alive });
  if (!project) throw new ValidationError('Project not found');
  if (['closed', 'cancelled', 'completed'].includes(project.status)) {
    throw new ValidationError('This project has already finished');
  }

  const trimmedReason = String(reason || '').trim();
  if (trimmedReason.length < 10) {
    throw new ValidationError('Record why the contractor is being changed - both sides will see it');
  }

  if (String(newContractorId) === String(project.contractorId)) {
    throw new ValidationError('That is already the contractor on this project');
  }

  const { ContractorProfile } = await import('../models/contractorProfile.model.js');
  const incoming = await ContractorProfile.findOne({ _id: newContractorId, ...alive });
  if (!incoming) throw new ValidationError('Contractor not found');
  if (incoming.status !== 'approved' || incoming.isActive === false) {
    throw new ValidationError('That contractor is not approved to take work');
  }

  // BRD W2 - declared capacity applies to a reassignment as much as to a new job.
  const liveForIncoming = await ConstructionProject.countDocuments({
    contractorId: incoming._id,
    status: { $in: ['active', 'handover_pending', 'awaiting_funding'] },
    ...alive,
  });
  if (incoming.maxConcurrentProjects > 0 && liveForIncoming >= incoming.maxConcurrentProjects) {
    throw new ValidationError(
      `${incoming.businessName} is already at their declared capacity of `
      + `${incoming.maxConcurrentProjects} projects`,
    );
  }

  const stages = await ProjectStage.find({ projectId: project._id });

  const disputed = stages.filter((st) => st.status === 'disputed');
  if (disputed.length > 0) {
    throw new ValidationError(
      `Resolve the dispute on "${disputed[0].name}" first - the money frozen there `
      + 'is part of a disagreement with the current contractor.',
    );
  }

  const awaiting = stages.filter((st) => st.status === 'submitted_for_approval');
  if (awaiting.length > 0) {
    throw new ValidationError(
      `"${awaiting[0].name}" is waiting for the customer to approve work the current `
      + 'contractor has already done. Settle that before reassigning.',
    );
  }

  const outgoingId = project.contractorId;
  const outgoing = await ContractorProfile.findById(outgoingId).select('businessName').lean();
  const performer = extractPerformer(reqUser);

  // Only stages that have NOT been paid transfer. Paid work stays with whoever
  // did it, on the record and in the money.
  const transferable = stages.filter(
    (st) => !['payment_released', 'approved'].includes(st.status),
  );

  project.contractorId = incoming._id;
  project.reassignmentHistory = [
    ...(project.reassignmentHistory || []),
    {
      fromContractorId: outgoingId,
      toContractorId: incoming._id,
      reason: trimmedReason,
      stagesTransferred: transferable.length,
      at: new Date(),
      by: performer,
    },
  ];
  project.onHoldReason = `Contractor changed to ${incoming.businessName}: ${trimmedReason}`;
  touch(project, 'on_hold', project.onHoldReason, performer);
  await project.save();

  for (const st of transferable) {
    st.contractorId = incoming._id;
    // Anything part-done goes back to the start: the new contractor has not
    // done that work and must not inherit a progress claim they cannot stand behind.
    if (['in_progress', 'rejected'].includes(st.status)) {
      st.status = 'pending';
      st.progressPercent = 0;
    }
    st.statusHistory.push({
      status: st.status,
      reason: `Reassigned to ${incoming.businessName}`,
      at: new Date(),
      by: performer,
    });
    await st.save();
  }

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'project.contractor_reassigned',
    before: { contractorId: String(outgoingId), contractor: outgoing?.businessName || null },
    after: { contractorId: String(incoming._id), contractor: incoming.businessName },
    performedBy: performer,
    metadata: {
      reason: trimmedReason,
      stagesTransferred: transferable.length,
      stagesLeftWithOutgoing: stages.length - transferable.length,
      releasedToOutgoing: round2(project.releasedAmount),
    },
  });

  return {
    project: project.toObject(),
    stagesTransferred: transferable.length,
    stagesRetainedByOutgoing: stages.length - transferable.length,
    outgoingContractor: outgoing?.businessName || null,
    newContractor: incoming.businessName,
  };
};

export const resumeProject = async (projectId, reqUser = null) => {
  const project = await ConstructionProject.findOne({ _id: projectId, ...alive });
  if (!project) throw new ValidationError('Project not found');
  if (project.status !== 'on_hold') throw new ValidationError('This project is not on hold');

  const performer = extractPerformer(reqUser);
  project.onHoldReason = '';
  touch(project, 'active', 'Resumed by admin', performer);
  await project.save();

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'project.resumed',
    performedBy: performer,
  });
  return project.toObject();
};

/**
 * BRD Q14 — cancel a project midway.
 *
 * Approved stages are already paid and stay paid. Everything still held goes
 * back to the customer, because they have not received the work it was
 * reserved for. That is the `approved_stages_only` valuation, which is the
 * default in settings.
 */
export const cancelProject = async (projectId, reason, reqUser = null) => {
  const project = await ConstructionProject.findOne({ _id: projectId, ...alive });
  if (!project) throw new ValidationError('Project not found');
  if (['closed', 'cancelled'].includes(project.status)) {
    throw new ValidationError('This project is already closed');
  }

  const performer = extractPerformer(reqUser);
  const held = round2(project.fundedAmount - project.releasedAmount - project.refundedAmount);

  if (project.holdId && held > 0) {
    const result = await cancelHold({
      holdId: project.holdId,
      reference: `project_cancel_${project._id}`,
      reason: `Project cancelled: ${String(reason || '').trim()}`,
      performedBy: performer,
    });
    project.refundedAmount = round2(project.refundedAmount + (result.returnedAmount || 0));
  }

  project.cancelledReason = String(reason || '').trim();
  touch(project, 'cancelled', project.cancelledReason, performer);
  await project.save();

  await ProjectStage.updateMany(
    { projectId: project._id, status: { $in: ['pending', 'in_progress', 'submitted_for_approval'] } },
    { $set: { status: 'rejected', rejectionReason: 'Project cancelled' } },
  );

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'project.cancelled',
    after: { reason: project.cancelledReason, returnedToCustomer: held },
    performedBy: performer,
  });
  return project.toObject();
};

export const getProjectStats = async () => {
  const [byStatus, moneyAgg, awaitingApproval] = await Promise.all([
    ConstructionProject.aggregate([
      { $match: alive },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ConstructionProject.aggregate([
      { $match: { ...alive, status: { $nin: ['cancelled'] } } },
      {
        $group: {
          _id: null,
          agreed: { $sum: '$agreedValue' },
          funded: { $sum: '$fundedAmount' },
          released: { $sum: '$releasedAmount' },
          refunded: { $sum: '$refundedAmount' },
        },
      },
    ]),
    // BRD A7 — the queue an operator actually works. A stage sitting here is a
    // contractor waiting to be paid for work they say is finished, so it is the
    // one count worth putting on the dashboard.
    ProjectStage.countDocuments({ status: 'submitted_for_approval' }),
  ]);

  const counts = byStatus.reduce((a, r) => ({ ...a, [r._id]: r.count }), {});
  const m = moneyAgg[0] || { agreed: 0, funded: 0, released: 0, refunded: 0 };

  return {
    awaitingFunding: counts.awaiting_funding || 0,
    active: counts.active || 0,
    onHold: counts.on_hold || 0,
    completed: (counts.completed || 0) + (counts.closed || 0),
    cancelled: counts.cancelled || 0,
    stagesAwaitingApproval: awaitingApproval,
    totalAgreedValue: round2(m.agreed),
    totalFunded: round2(m.funded),
    totalReleased: round2(m.released),
    totalRefunded: round2(m.refunded),
    // Refunds must come off too — money returned to a customer is no longer
    // held, and counting it as held overstates the platform's escrow position.
    totalHeld: round2(m.funded - m.released - m.refunded),
  };
};

export { touch as touchProject, round2 };
