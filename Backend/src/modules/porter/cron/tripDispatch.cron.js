import cron from 'node-cron';
import { PorterTrip } from '../models/porterTrip.model.js';
import { tryAssignTrip } from '../services/tripDispatch.service.js';
import { getSearchRadiusKm } from '../services/settings.service.js';
import { logger } from '../../../utils/logger.js';
import { getIO, rooms } from '../../../config/socket.js';

const MAX_ATTEMPTS = 5;
/** Driver modal accept window (NewOrderModal OFFER_SECONDS) */
const DRIVER_OFFER_SECONDS = 30;
/** Pause after offer expires before next dispatch attempt */
const RETRY_GAP_SECONDS = 20;
/** Total wait between attempts: 30s offer + 20s gap */
const WAIT_SECONDS = DRIVER_OFFER_SECONDS + RETRY_GAP_SECONDS; // 50
const RADIUS_EXPAND_KM = 2;

/**
 * Taxi-parity Porter dispatch cron:
 * - Poll every 10s
 * - Retry stalled searching trips every 30s
 * - Expand radius by +2km per attempt
 * - Auto-cancel after 5 attempts with no accept
 */
export function startTripDispatchCron() {
    cron.schedule('*/10 * * * * *', async () => {
        try {
            const cutoffTime = new Date(Date.now() - WAIT_SECONDS * 1000);

            const stalledTrips = await PorterTrip.find({
                status: 'searching',
                isDeleted: { $ne: true },
                'dispatch.status': 'unassigned',
                $or: [
                    { 'dispatch.lastAttemptAt': { $lte: cutoffTime } },
                    { 'dispatch.lastAttemptAt': null },
                ],
            });

            for (const trip of stalledTrips) {
                // Prepaid must stay paid while searching
                const method = String(trip.payment?.method || 'cash').toLowerCase();
                const prepaid = ['wallet', 'upi', 'razorpay'].includes(method);
                if (prepaid && trip.payment?.status !== 'paid') {
                    continue;
                }

                const currentAttempt = trip.dispatch?.currentAttempt || 1;

                if (currentAttempt >= MAX_ATTEMPTS) {
                    trip.status = 'cancelled_by_system';
                    trip.cancelReason = 'No drivers accepted the ride within the timeout period.';
                    trip.cancelledAt = new Date();
                    trip.dispatch = trip.dispatch || {};
                    trip.dispatch.status = 'cancelled';
                    await trip.save();

                    logger.info(
                        `[PorterDispatchCron] Trip ${trip._id} timed out after ${currentAttempt} attempts.`,
                    );

                    const io = getIO();
                    if (io && trip.userId) {
                        const payload = {
                            module: 'porter',
                            jobType: 'parcel',
                            tripId: String(trip._id),
                            tripNumber: trip.tripNumber,
                            status: 'cancelled_by_system',
                            cancelReason: trip.cancelReason,
                        };
                        io.to(rooms.user(trip.userId)).emit('parcel_status_update', payload);
                        io.to(rooms.user(trip.userId)).emit('parcel_cancelled', payload);
                    }
                } else {
                    const baseRadius = await getSearchRadiusKm();
                    // First attempt was at baseRadius; attempt 2 = base+2, attempt 3 = base+4, …
                    const newRadius = baseRadius + (currentAttempt * RADIUS_EXPAND_KM);

                    logger.info(
                        `[PorterDispatchCron] Trip ${trip._id} stalled. Triggering attempt ${currentAttempt + 1} with radius ${newRadius}km`,
                    );

                    await tryAssignTrip(String(trip._id), newRadius);
                }
            }
        } catch (error) {
            logger.error(`[PorterDispatchCron] Error executing loop: ${error.message}`);
        }
    });
}
