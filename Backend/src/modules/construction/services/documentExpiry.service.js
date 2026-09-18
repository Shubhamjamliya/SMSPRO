import { ContractorDocument } from '../models/contractorDocument.model.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { logger } from '../../../utils/logger.js';
import { notifyDocumentExpiring } from './notify.service.js';

/**
 * BRD Rule 6 — "The system also tracks expiry dates and warns when a licence is
 * about to lapse."
 *
 * A verified badge backed by an expired licence is worse than no badge, because
 * customers are trusting it. This sweep does two things:
 *
 *   1. Warns once, ahead of expiry, so the contractor can renew in time.
 *   2. Marks a lapsed document as no longer verified, so it stops counting
 *      towards the contractor's verification.
 *
 * Deliberately does NOT auto-suspend the contractor. Losing all work because a
 * certificate lapsed over a weekend is disproportionate, and BRD A3 gives your
 * team an explicit suspend action for when it is warranted. The sweep surfaces
 * the problem; a person decides what to do about it.
 */
const WARN_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const alive = { isDeleted: { $ne: true } };

/** Documents lapsing within the window that have not been warned about yet. */
export const findExpiringDocuments = async (windowDays = WARN_WINDOW_DAYS) => {
  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * DAY_MS);

  return ContractorDocument.find({
    ...alive,
    status: 'verified',
    expiresAt: { $ne: null, $gte: now, $lte: horizon },
    $or: [
      { expiryWarnedAt: null },
      // Re-warn if the last warning was itself more than a window ago, so a
      // document with a long lead time is not warned once and then forgotten.
      { expiryWarnedAt: { $lt: new Date(now.getTime() - windowDays * DAY_MS) } },
    ],
  })
    .populate('contractorId', 'businessName ownerName contractorCode phoneLast10 status')
    .lean();
};

/** Documents whose expiry date has already passed but are still marked verified. */
export const findLapsedDocuments = async () => ContractorDocument.find({
  ...alive,
  status: 'verified',
  expiresAt: { $ne: null, $lt: new Date() },
})
  .populate('contractorId', 'businessName ownerName contractorCode status')
  .lean();

/**
 * Run the sweep.
 *
 * @param {object}  [options]
 * @param {boolean} [options.dryRun]  report only, change nothing
 * @param {number}  [options.windowDays]
 */
export const runDocumentExpirySweep = async ({
  dryRun = false,
  windowDays = WARN_WINDOW_DAYS,
} = {}) => {
  const [expiring, lapsed] = await Promise.all([
    findExpiringDocuments(windowDays),
    findLapsedDocuments(),
  ]);

  const result = {
    warned: 0,
    lapsed: 0,
    contractorsAffected: new Set(),
    dryRun,
  };

  for (const document of expiring) {
    result.contractorsAffected.add(String(document.contractorId?._id || document.contractorId));
    if (dryRun) {
      result.warned += 1;
      continue;
    }
    await ContractorDocument.updateOne(
      { _id: document._id },
      { $set: { expiryWarnedAt: new Date() } },
    );

    const daysLeft = Math.max(1, Math.ceil(
      (new Date(document.expiresAt).getTime() - Date.now()) / DAY_MS,
    ));
    await notifyDocumentExpiring({
      contractorId: document.contractorId?._id || document.contractorId,
      documentLabel: document.label || document.type.replace(/_/g, ' '),
      expiresAt: document.expiresAt,
      daysLeft,
    }).catch(() => {});

    result.warned += 1;
  }

  for (const document of lapsed) {
    const contractorId = String(document.contractorId?._id || document.contractorId);
    result.contractorsAffected.add(contractorId);
    if (dryRun) {
      result.lapsed += 1;
      continue;
    }

    // Drop back to pending rather than deleting: the record and its history stay
    // intact, and re-verifying after renewal is a one-click action for your team.
    await ContractorDocument.updateOne(
      { _id: document._id },
      {
        $set: {
          status: 'pending',
          rejectionReason: 'Expired — upload a current copy',
          verifiedAt: null,
        },
      },
    );
    await recordAudit({
      module: 'construction',
      entityType: 'contractor_document',
      entityId: document._id,
      action: 'document.lapsed',
      before: { status: 'verified' },
      after: { status: 'pending', expiresAt: document.expiresAt },
      meta: { contractorId, type: document.type, sweep: true },
    });
    result.lapsed += 1;
  }

  const affected = result.contractorsAffected.size;
  if (result.warned || result.lapsed) {
    logger.info(
      `[construction] document expiry sweep: ${result.warned} warned, `
      + `${result.lapsed} lapsed, ${affected} contractor(s) affected`
      + `${dryRun ? ' (dry run)' : ''}`,
    );
  }

  return {
    warned: result.warned,
    lapsed: result.lapsed,
    contractorsAffected: affected,
    dryRun,
    expiring: expiring.map((d) => ({
      id: String(d._id),
      type: d.type,
      label: d.label || '',
      expiresAt: d.expiresAt,
      daysLeft: Math.ceil((new Date(d.expiresAt).getTime() - Date.now()) / DAY_MS),
      contractor: d.contractorId?.businessName || String(d.contractorId),
      contractorCode: d.contractorId?.contractorCode || null,
    })),
    lapsedDocuments: lapsed.map((d) => ({
      id: String(d._id),
      type: d.type,
      label: d.label || '',
      expiredAt: d.expiresAt,
      contractor: d.contractorId?.businessName || String(d.contractorId),
      contractorCode: d.contractorId?.contractorCode || null,
    })),
  };
};

/**
 * Contractors currently approved but holding a lapsed document — the list your
 * team should actually look at, since these are live on the platform with an
 * incomplete verification.
 */
export const findApprovedContractorsWithLapsedDocuments = async () => {
  const lapsed = await ContractorDocument.find({
    ...alive,
    expiresAt: { $ne: null, $lt: new Date() },
  }).select('contractorId type label expiresAt').lean();

  if (!lapsed.length) return [];

  const byContractor = new Map();
  for (const document of lapsed) {
    const key = String(document.contractorId);
    if (!byContractor.has(key)) byContractor.set(key, []);
    byContractor.get(key).push(document);
  }

  const contractors = await ContractorProfile.find({
    _id: { $in: [...byContractor.keys()] },
    ...alive,
    status: 'approved',
    isActive: true,
  }).select('businessName ownerName contractorCode phoneLast10').lean();

  return contractors.map((contractor) => ({
    ...contractor,
    lapsedDocuments: byContractor.get(String(contractor._id)) || [],
  }));
};
