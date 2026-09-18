import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../utils/helpers.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { ContractorDocument } from '../models/contractorDocument.model.js';
import { ContractorPortfolio } from '../models/contractorPortfolio.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ConstructionCategory } from '../models/constructionCategory.model.js';
import {
  serializeContractor,
  pushStatusHistory,
  snapshotContractorFields,
} from './contractorAuth.service.js';
import { notifyContractorDecision } from './notify.service.js';

const alive = { isDeleted: { $ne: true } };
const str = (value) => String(value ?? '').trim();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const audit = (action, contractor, extra = {}) => recordAudit({
  module: 'construction',
  entityType: 'contractor',
  entityId: contractor._id,
  action,
  ...extra,
});

/**
 * BRD A2 / A4 — the approval queue and the full contractor register.
 * Defaults to pending applications, because that is the screen your team lives in.
 */
export const listContractors = async (query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { ...alive };

  if (query.status) filter.status = query.status;
  if (query.trade) filter.trades = query.trade;
  if (query.isActive === 'true') filter.isActive = true;
  if (query.isActive === 'false') filter.isActive = false;
  if (query.search) {
    const term = escapeRegex(str(query.search));
    if (term) {
      const re = new RegExp(term, 'i');
      filter.$or = [
        { businessName: re },
        { ownerName: re },
        { contractorCode: re },
        { phoneLast10: re },
        { email: re },
      ];
    }
  }

  const [docs, total] = await Promise.all([
    ContractorProfile.find(filter)
      .populate('trades', 'name slug')
      .sort({ submittedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ContractorProfile.countDocuments(filter),
  ]);

  // Document counts drive the queue badges — an application with unverified
  // documents is not ready to approve.
  const ids = docs.map((d) => d._id);
  const docStats = ids.length
    ? await ContractorDocument.aggregate([
      { $match: { contractorId: { $in: ids }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: '$contractorId',
          total: { $sum: 1 },
          verified: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } },
          expired: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$expiresAt', null] }, { $lt: ['$expiresAt', new Date()] }] },
                1, 0,
              ],
            },
          },
        },
      },
    ])
    : [];
  const byId = new Map(docStats.map((row) => [String(row._id), row]));

  return buildPaginatedResult({
    docs: docs.map((d) => ({
      ...serializeContractor(d),
      documentCount: byId.get(String(d._id))?.total || 0,
      verifiedDocumentCount: byId.get(String(d._id))?.verified || 0,
      expiredDocumentCount: byId.get(String(d._id))?.expired || 0,
    })),
    total,
    page,
    limit,
  });
};

/** BRD A3 — one contractor's complete record. */
export const getContractorById = async (contractorId) => {
  const contractor = await ContractorProfile.findOne({ _id: contractorId, ...alive })
    .populate('trades', 'name slug status');
  if (!contractor) throw new ValidationError('Contractor not found');

  const [documents, portfolio] = await Promise.all([
    ContractorDocument.find({ contractorId, ...alive }).sort({ createdAt: -1 }).lean(),
    ContractorPortfolio.find({ contractorId, ...alive })
      .populate('categoryId', 'name')
      .sort({ displayOrder: 1 })
      .lean(),
  ]);

  return {
    contractor: serializeContractor(contractor, {
      statusHistory: contractor.statusHistory || [],
    }),
    documents,
    portfolio,
  };
};

/**
 * BRD A2 / Rule 6 — approve a contractor so they can start receiving enquiries.
 *
 * Refuses while any uploaded document is still unverified. Approving a contractor
 * whose licences nobody checked would make the verified badge meaningless, and
 * that badge is the whole trust promise the module makes to customers.
 */
export const approveContractor = async (contractorId, reqUser = null) => {
  const contractor = await ContractorProfile.findOne({ _id: contractorId, ...alive });
  if (!contractor) throw new ValidationError('Contractor not found');
  if (contractor.status === 'approved') return serializeContractor(contractor);
  if (contractor.status === 'onboarding') {
    throw new ValidationError('This contractor has not submitted their registration yet');
  }

  const unverified = await ContractorDocument.countDocuments({
    contractorId,
    ...alive,
    status: 'pending',
  });
  if (unverified > 0) {
    throw new ValidationError(
      `Verify all ${unverified} pending document${unverified === 1 ? '' : 's'} before approving this contractor.`,
    );
  }

  const expired = await ContractorDocument.countDocuments({
    contractorId,
    ...alive,
    status: 'verified',
    expiresAt: { $ne: null, $lt: new Date() },
  });
  if (expired > 0) {
    throw new ValidationError(
      `${expired} document${expired === 1 ? ' has' : 's have'} expired. Ask for current copies before approving.`,
    );
  }

  const performer = extractPerformer(reqUser);
  const adminId = reqUser?.userId || null;

  contractor.status = 'approved';
  contractor.approvedAt = new Date();
  contractor.rejectedAt = null;
  contractor.rejectionReason = '';
  contractor.rejectedSnapshot = null;
  contractor.approvedBy = adminId;
  contractor.reviewedBy = adminId;
  contractor.isActive = true;
  pushStatusHistory(contractor, 'approved', { reason: 'Approved by admin', admin: reqUser });
  await contractor.save();

  // BRD W4 — "waiting without information is the main reason applicants give up."
  notifyContractorDecision({ contractorId: contractor._id, approved: true }).catch(() => {});

  await audit('contractor.approved', contractor, {
    after: { status: 'approved' },
    performedBy: performer,
  });
  return serializeContractor(contractor);
};

/** BRD A2 — reject with a reason, keeping a snapshot to diff the resubmission against. */
export const rejectContractor = async (contractorId, reason, reqUser = null) => {
  const rejectionReason = str(reason);
  if (!rejectionReason) throw new ValidationError('Give a reason — the contractor needs to know what to fix');

  const contractor = await ContractorProfile.findOne({ _id: contractorId, ...alive });
  if (!contractor) throw new ValidationError('Contractor not found');

  const performer = extractPerformer(reqUser);
  contractor.rejectedSnapshot = snapshotContractorFields(contractor);
  contractor.status = 'rejected';
  contractor.rejectedAt = new Date();
  contractor.approvedAt = null;
  contractor.rejectionReason = rejectionReason;
  contractor.reviewedBy = reqUser?.userId || null;
  pushStatusHistory(contractor, 'rejected', { reason: rejectionReason, admin: reqUser });
  await contractor.save();

  notifyContractorDecision({
    contractorId: contractor._id,
    approved: false,
    reason: rejectionReason,
  }).catch(() => {});

  await audit('contractor.rejected', contractor, {
    after: { status: 'rejected', reason: rejectionReason },
    performedBy: performer,
  });
  return serializeContractor(contractor);
};

/** BRD A3 — suspend immediately when something goes seriously wrong. */
export const suspendContractor = async (contractorId, reason, reqUser = null) => {
  const contractor = await ContractorProfile.findOne({ _id: contractorId, ...alive });
  if (!contractor) throw new ValidationError('Contractor not found');

  const performer = extractPerformer(reqUser);
  contractor.isActive = false;
  pushStatusHistory(contractor, contractor.status, {
    reason: str(reason) || 'Suspended by admin',
    admin: reqUser,
  });
  await contractor.save();

  await audit('contractor.suspended', contractor, {
    after: { isActive: false, reason: str(reason) },
    performedBy: performer,
  });
  return serializeContractor(contractor);
};

export const activateContractor = async (contractorId, reqUser = null) => {
  const contractor = await ContractorProfile.findOne({ _id: contractorId, ...alive });
  if (!contractor) throw new ValidationError('Contractor not found');

  const performer = extractPerformer(reqUser);
  contractor.isActive = true;
  pushStatusHistory(contractor, contractor.status, {
    reason: 'Reactivated by admin',
    admin: reqUser,
  });
  await contractor.save();

  await audit('contractor.activated', contractor, {
    after: { isActive: true },
    performedBy: performer,
  });
  return serializeContractor(contractor);
};

// ---------- Document verification (Rule 6) ----------

export const verifyDocument = async (documentId, reqUser = null) => {
  const document = await ContractorDocument.findOne({ _id: documentId, ...alive });
  if (!document) throw new ValidationError('Document not found');
  if (document.expiresAt && document.expiresAt.getTime() < Date.now()) {
    throw new ValidationError('This document has expired — ask for a current copy instead');
  }

  const performer = extractPerformer(reqUser);
  document.status = 'verified';
  document.verifiedAt = new Date();
  document.verifiedBy = performer;
  document.rejectionReason = '';
  await document.save();

  await recordAudit({
    module: 'construction',
    entityType: 'contractor_document',
    entityId: document._id,
    action: 'document.verified',
    after: { type: document.type, contractorId: String(document.contractorId) },
    performedBy: performer,
  });
  return document.toObject();
};

export const rejectDocument = async (documentId, reason, reqUser = null) => {
  const rejectionReason = str(reason);
  if (!rejectionReason) throw new ValidationError('Give a reason for rejecting this document');

  const document = await ContractorDocument.findOne({ _id: documentId, ...alive });
  if (!document) throw new ValidationError('Document not found');

  const performer = extractPerformer(reqUser);
  document.status = 'rejected';
  document.rejectionReason = rejectionReason;
  document.verifiedAt = null;
  document.verifiedBy = performer;
  await document.save();

  await recordAudit({
    module: 'construction',
    entityType: 'contractor_document',
    entityId: document._id,
    action: 'document.rejected',
    after: { type: document.type, reason: rejectionReason },
    performedBy: performer,
  });
  return document.toObject();
};

/** Verify a portfolio entry as genuine work done through the platform (BRD W5). */
export const setPortfolioVerified = async (entryId, verified, reqUser = null) => {
  const entry = await ContractorPortfolio.findOne({ _id: entryId, ...alive });
  if (!entry) throw new ValidationError('Portfolio entry not found');
  entry.verified = Boolean(verified);
  await entry.save();

  await recordAudit({
    module: 'construction',
    entityType: 'contractor_portfolio',
    entityId: entry._id,
    action: verified ? 'portfolio.verified' : 'portfolio.unverified',
    performedBy: extractPerformer(reqUser),
  });
  return entry.toObject();
};

/** Counts for the approval-queue header (feeds BRD A1 later). */
export const getContractorStats = async () => {
  const [byStatus, expiringSoon] = await Promise.all([
    ContractorProfile.aggregate([
      { $match: alive },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ContractorDocument.countDocuments({
      ...alive,
      status: 'verified',
      expiresAt: {
        $ne: null,
        $gte: new Date(),
        $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  const counts = byStatus.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});
  return {
    onboarding: counts.onboarding || 0,
    pendingApproval: counts.pending_approval || 0,
    approved: counts.approved || 0,
    rejected: counts.rejected || 0,
    documentsExpiringIn30Days: expiringSoon,
  };
};
