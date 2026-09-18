import cron from 'node-cron';
import { runDocumentExpirySweep } from '../services/documentExpiry.service.js';
import { isModuleEnabled } from '../../../core/modules/moduleEnabled.service.js';
import { logger } from '../../../utils/logger.js';

/**
 * BRD Rule 6 — warn before a contractor's licence lapses, and stop treating an
 * expired one as verified.
 *
 * Runs once a day rather than on a short interval: expiry is a calendar event,
 * not a real-time one, and warning the same contractor repeatedly is noise. The
 * sweep itself only warns once per window.
 *
 * 02:30 daily — after midnight so "days remaining" is computed against a fresh
 * date, and off-peak so it never competes with dispatch traffic.
 */
export function startConstructionDocumentExpiryCron() {
    cron.schedule('30 2 * * *', async () => {
        try {
            // Skip entirely while the module is switched off — there is no one to
            // warn, and a disabled module should be quiet.
            if (!(await isModuleEnabled('construction'))) return;

            const result = await runDocumentExpirySweep();
            if (result.warned || result.lapsed) {
                logger.info(
                    `[construction] expiry sweep done: ${result.warned} warned, ${result.lapsed} lapsed`,
                );
            }
        } catch (error) {
            logger.error(`[construction] document expiry sweep failed: ${error.message}`);
        }
    });
    logger.info('[construction] document expiry cron scheduled (daily 02:30)');
}
