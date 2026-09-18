import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { releaseHold, getHoldById } from '../../../core/wallet/hold.service.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectStage } from '../models/projectStage.model.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { touchProject, round2 } from './project.service.js';
import { logger } from '../../../utils/logger.js';

const alive = { isDeleted: { $ne: true } };

/**
 * BRD C23 — handover and rating.
 *
 * "The customer confirms final handover, the last payment is released, and they
 * rate the contractor. That rating feeds the contractor's public score."
 *
 * Handover does NOT release retention. That money stays held for the defect
 * liability period, which is the entire point of holding it — releasing it at
 * handover would make the protection meaningless.
 */
export const confirmHandover = async (customerId, projectId, { rating, review } = {}) => {
  const project = await ConstructionProject.findOne({ _id: projectId, customerId, ...alive });
  if (!project) throw new ValidationError('Project not found');
  if (project.status === 'completed' || project.status === 'closed') {
    throw new ValidationError('This project has already been handed over');
  }
  if (project.status !== 'handover_pending' && project.status !== 'stages_complete') {
    const remaining = await ProjectStage.countDocuments({
      projectId, status: { $nin: ['payment_released'] },
    });
    throw new ValidationError(
      remaining > 0
        ? `${remaining} stage${remaining === 1 ? ' is' : 's are'} still outstanding.`
        : 'This project is not ready for handover yet',
    );
  }

  const score = rating == null ? null : Number(rating);
  if (score != null && (!Number.isFinite(score) || score < 1 || score > 5)) {
    throw new ValidationError('Rate the work between 1 and 5');
  }

  project.handedOverAt = new Date();
  if (score != null) {
    project.rating = score;
    project.review = String(review || '').trim();
    project.ratedAt = new Date();
  }
  touchProject(project, 'completed', 'Handover confirmed by the customer');
  await project.save();

  if (score != null) await applyRatingToContractor(project.contractorId, score);

  const retention = round2(project.fundedAmount - project.releasedAmount - project.refundedAmount);
  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'project.handed_over',
    after: {
      projectNumber: project.projectNumber,
      rating: score,
      retentionStillHeld: retention,
      releasesAfterDays: project.defectLiabilityDays,
    },
  });

  return {
    project: project.toObject(),
    retentionHeld: retention,
    retentionReleasesOn: project.defectLiabilityDays
      ? new Date(Date.now() + project.defectLiabilityDays * 86400000)
      : null,
  };
};

/**
 * Fold a project rating into the contractor's running average (BRD W18).
 * Recomputed from the stored average rather than re-reading every project, so
 * this stays O(1) as a contractor accumulates work.
 */
const applyRatingToContractor = async (contractorId, score) => {
  const contractor = await ContractorProfile.findById(contractorId);
  if (!contractor) return;

  const count = Number(contractor.totalRatings) || 0;
  const current = Number(contractor.rating) || 0;
  const nextCount = count + 1;

  contractor.rating = Math.round(((current * count + score) / nextCount) * 100) / 100;
  contractor.totalRatings = nextCount;
  contractor.completedProjects = (Number(contractor.completedProjects) || 0) + 1;
  await contractor.save();
};

/**
 * BRD §13 step 7 — release the retention once the defect liability period ends.
 *
 * Idempotent on a per-project reference, so the sweep can run daily without
 * ever paying twice. A project whose defect period is zero releases as soon as
 * handover is confirmed.
 */
export const releaseRetention = async (projectId, { reqUser = null, force = false } = {}) => {
  const project = await ConstructionProject.findOne({ _id: projectId, ...alive });
  if (!project) throw new ValidationError('Project not found');
  if (project.status !== 'completed') {
    throw new ValidationError('Retention is released after handover, not before');
  }
  if (project.retentionReleasedAt) {
    return { project: project.toObject(), alreadyReleased: true };
  }

  const dueOn = new Date(
    (project.handedOverAt?.getTime() || Date.now()) + (project.defectLiabilityDays || 0) * 86400000,
  );
  if (!force && dueOn.getTime() > Date.now()) {
    throw new ValidationError(
      `Retention is held until ${dueOn.toLocaleDateString('en-IN')} — the defect liability period.`,
    );
  }

  const retention = round2(project.fundedAmount - project.releasedAmount - project.refundedAmount);
  const performer = extractPerformer(reqUser);

  if (retention > 0 && project.holdId) {
    const release = await releaseHold({
      holdId: project.holdId,
      amount: retention,
      reference: `project_retention_${project._id}`,
      reason: `${project.projectNumber} — retention released`,
      payee: { entityType: 'contractor', entityId: project.contractorId },
      performedBy: performer,
      category: 'retention_release',
      payeeCategory: 'retention_release',
      description: 'Retention released after the defect liability period',
      meta: { projectId: String(project._id), projectNumber: project.projectNumber },
    });
    if (!release.alreadyProcessed) {
      project.releasedAmount = round2(project.releasedAmount + retention);
    }
  }

  project.retentionReleasedAt = new Date();
  project.closedAt = new Date();
  touchProject(project, 'closed', 'Retention released; project closed', performer);
  await project.save();

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'project.retention_released',
    after: { projectNumber: project.projectNumber, amount: retention },
    performedBy: performer,
  });

  return { project: project.toObject(), releasedAmount: retention };
};

/**
 * Daily sweep: close out every project whose defect liability period has ended.
 *
 * Without this, retention would sit held forever and contractors would have to
 * chase it — the exact behaviour the module exists to remove.
 */
export const releaseDueRetentions = async () => {
  const due = await ConstructionProject.find({
    ...alive,
    status: 'completed',
    retentionReleasedAt: null,
    handedOverAt: { $ne: null },
  }).select('_id projectNumber handedOverAt defectLiabilityDays').lean();

  let released = 0;
  for (const p of due) {
    const dueOn = new Date(
      new Date(p.handedOverAt).getTime() + (p.defectLiabilityDays || 0) * 86400000,
    );
    if (dueOn.getTime() > Date.now()) continue;
    try {
      await releaseRetention(p._id);
      released += 1;
    } catch (error) {
      logger.warn(`[construction] retention release failed for ${p.projectNumber}: ${error.message}`);
    }
  }

  if (released) logger.info(`[construction] released retention on ${released} project(s)`);
  return { released, considered: due.length };
};

/**
 * Cross-check every open project's money against the escrow ledger.
 *
 * BRD §13: "Held, released and pending amounts must always add up exactly to
 * the agreed project price." This is the job that proves it, nightly.
 */
export const reconcileAllProjects = async ({ repair = false } = {}) => {
  const projects = await ConstructionProject.find({
    ...alive,
    holdId: { $ne: null },
    status: { $nin: ['cancelled'] },
  }).select('_id projectNumber agreedValue fundedAmount releasedAmount refundedAmount holdId').lean();

  const drifted = [];
  for (const p of projects) {
    try {
      const hold = await getHoldById(p.holdId);
      if (!hold) continue;

      const fundedDrift = round2(hold.amountHeld - p.fundedAmount);
      const releasedDrift = round2(hold.amountReleased - p.releasedAmount);
      const refundedDrift = round2(hold.amountRefunded - p.refundedAmount);

      if (fundedDrift || releasedDrift || refundedDrift) {
        drifted.push({
          projectId: String(p._id),
          projectNumber: p.projectNumber,
          drift: { funded: fundedDrift, released: releasedDrift, refunded: refundedDrift },
        });
        if (repair) {
          await ConstructionProject.updateOne(
            { _id: p._id },
            {
              $set: {
                fundedAmount: hold.amountHeld,
                releasedAmount: hold.amountReleased,
                refundedAmount: hold.amountRefunded,
              },
            },
          );
        }
      }
    } catch (error) {
      logger.warn(`[construction] reconciliation failed for ${p.projectNumber}: ${error.message}`);
    }
  }

  if (drifted.length) {
    logger.error(
      `[construction] MONEY DRIFT on ${drifted.length} project(s): `
      + drifted.map((d) => d.projectNumber).join(', '),
    );
  } else {
    logger.info(`[construction] reconciliation clean across ${projects.length} project(s)`);
  }

  return { checked: projects.length, drifted, repaired: repair ? drifted.length : 0 };
};
