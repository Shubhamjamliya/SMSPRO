import cron from 'node-cron';
import { expireStaleLeads } from '../services/matching.service.js';
import { expireStalePackageOffers, remindExpiringPackageOffers } from '../services/packageDispatch.service.js';
import { expireQuotations } from '../services/quotation.service.js';
import { escalateStaleApprovals, findDelayedStages, markStagesAlerted } from '../services/stage.service.js';
import { releaseDueRetentions, reconcileAllProjects } from '../services/handover.service.js';
import { recalculateAllScores } from '../services/score.service.js';
import { notify } from '../services/notify.service.js';
import { isModuleEnabled } from '../../../core/modules/moduleEnabled.service.js';
import { logger } from '../../../utils/logger.js';

/**
 * Keeps the enquiry pipeline moving (BRD W7, C10).
 *
 * Two things rot if nobody sweeps them:
 *
 *   Leads nobody answered — BRD W7: "a fast decline is far better for the
 *   customer than a slow non-answer". An unanswered lead is the slowest possible
 *   non-answer, so it is reclaimed and the enquiry offered to the next
 *   contractor down the ranking.
 *
 *   Quotations past their validity — BRD C10 asks for "how long the price is
 *   valid", which is meaningless if an expired quote stays acceptable. Prices
 *   move; a contractor must not be held to a rate they quoted months ago.
 *
 * Every 15 minutes: lead response windows are measured in hours, so a daily
 * sweep would waste most of a day, and a per-minute one would be pointless load.
 */
export function startConstructionPipelineCron() {
    cron.schedule('*/15 * * * *', async () => {
        try {
            if (!(await isModuleEnabled('construction'))) return;

            // Remind BEFORE expiring, and not in parallel: an offer that lapses this run
            // should not be nudged in the same breath.
            await remindExpiringPackageOffers().catch((err) => {
                logger.warn(`[construction] package offer reminders failed: ${err.message}`);
            });

            const [leads, quotes, packageOffers] = await Promise.all([
                expireStaleLeads(),
                expireQuotations(),
                // Paid site-visit requests nobody answered in time move on to the next contractors.
                expireStalePackageOffers(),
            ]);

            if (packageOffers.expired) {
                logger.info(
                    `[construction] package request sweep: ${packageOffers.expired} request(s) had unanswered offers, `
                    + `${packageOffers.resent} sent on to new contractors`,
                );
            }

            if (leads.expired || quotes.expired) {
                logger.info(
                    `[construction] pipeline sweep: ${leads.expired} lead(s) expired, `
                    + `${leads.rematched} enquiry(ies) re-matched, ${quotes.expired} quotation(s) expired`,
                );
            }
        } catch (error) {
            logger.error(`[construction] pipeline sweep failed: ${error.message}`);
        }
    });
    logger.info('[construction] pipeline cron scheduled (every 15 minutes)');
}

/**
 * Daily project sweep — the jobs that keep money and schedules honest.
 *
 *   Stale approvals   BRD Q13. A customer who goes quiet must not be able to
 *                     withhold a contractor's payment indefinitely, so the stage
 *                     is flagged for supervisor review. Auto-approval only runs
 *                     if the platform has explicitly opted into it.
 *   Delay alerts      BRD C18. "Small delays get discussed early instead of
 *                     becoming big arguments later."
 *   Retention         BRD §13 step 7. Released once the defect liability period
 *                     ends, so nobody has to chase it.
 *   Reconciliation    BRD §13. "Held, released and pending amounts must always
 *                     add up exactly to the agreed project price." This is the
 *                     job that proves it, and it REPORTS rather than repairs —
 *                     money drifting is a thing a person should look at.
 *
 * 03:00 daily, half an hour after the document expiry sweep so the two never
 * contend for the same connection pool.
 */
export function startConstructionProjectCron() {
    cron.schedule('0 3 * * *', async () => {
        try {
            if (!(await isModuleEnabled('construction'))) return;

            const [approvals, retentions, reconciliation] = await Promise.all([
                escalateStaleApprovals(),
                releaseDueRetentions(),
                reconcileAllProjects({ repair: false }),
            ]);

            // BRD C18 — tell both sides once, not every night.
            const delayed = await findDelayedStages();
            for (const stage of delayed) {
                const project = stage.projectId;
                if (!project) continue;
                const message = `"${stage.name}" passed its target date of `
                    + `${new Date(stage.targetDate).toLocaleDateString('en-IN')}.`;
                await Promise.all([
                    notify({
                        ownerType: 'USER',
                        ownerId: project.customerId,
                        source: 'STAGE_DELAYED',
                        title: 'A stage is running late',
                        message,
                        link: `/construction/projects/${project._id}`,
                        metadata: { projectId: String(project._id), stageId: String(stage._id) },
                    }),
                    notify({
                        ownerType: 'CONTRACTOR',
                        ownerId: project.contractorId,
                        source: 'STAGE_DELAYED',
                        title: 'A stage is past its target date',
                        message,
                        link: `/contractor/projects/${project._id}`,
                        metadata: { projectId: String(project._id), stageId: String(stage._id) },
                    }),
                ]);
            }
            await markStagesAlerted(delayed.map((s) => s._id));

            if (approvals.escalated || approvals.autoApproved || retentions.released || delayed.length) {
                logger.info(
                    `[construction] project sweep: ${approvals.escalated} escalated, `
                    + `${approvals.autoApproved} auto-approved, ${retentions.released} retention(s) released, `
                    + `${delayed.length} delay alert(s)`,
                );
            }
            if (reconciliation.drifted.length) {
                logger.error(
                    `[construction] ${reconciliation.drifted.length} project(s) have money drift — `
                    + 'investigate before it compounds',
                );
            }
        } catch (error) {
            logger.error(`[construction] project sweep failed: ${error.message}`);
        }
    });
    logger.info('[construction] project cron scheduled (daily 03:00)');
}

/**
 * Nightly trust-score recalculation (BRD W18).
 *
 * Recalculated rather than incremented, so a missed or replayed event cannot
 * corrupt the number — the worst case is a score that is a day stale, and this
 * job is what fixes that.
 *
 * 03:30, half an hour after the project sweep: disputes resolved and retentions
 * released by that sweep are the inputs to this one, so it must run after it,
 * not alongside it.
 */
export function startConstructionScoreCron() {
  cron.schedule('30 3 * * *', async () => {
    try {
      if (!(await isModuleEnabled('construction'))) return;
      const result = await recalculateAllScores();
      if (result.updated) {
        logger.info(
          `[construction] trust scores: ${result.updated}/${result.total} recalculated`
          + (result.failures.length ? `, ${result.failures.length} failed` : ''),
        );
      }
    } catch (error) {
      logger.error(`[construction] score sweep failed: ${error.message}`);
    }
  });
  logger.info('[construction] score cron scheduled (daily 03:30)');
}
