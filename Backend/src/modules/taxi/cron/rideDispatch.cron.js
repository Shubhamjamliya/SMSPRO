import cron from 'node-cron';
import { TaxiRide } from '../models/taxiRide.model.js';
import { TaxiRideEvent } from '../models/taxiRideEvent.model.js';
import { tryAssignRide } from '../services/rideDispatch.service.js';
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

// Run every 10 seconds
export function startRideDispatchCron() {
    cron.schedule('*/10 * * * * *', async () => {
        try {
            const cutoffTime = new Date(Date.now() - WAIT_SECONDS * 1000);
            
            // Find rides that are searching and haven't been pinged in 30 seconds
            const stalledRides = await TaxiRide.find({
                status: 'searching',
                isDeleted: { $ne: true },
                'dispatch.status': 'unassigned',
                $or: [
                    { 'dispatch.lastAttemptAt': { $lte: cutoffTime } },
                    { 'dispatch.lastAttemptAt': null }
                ]
            });

            for (const ride of stalledRides) {
                const currentAttempt = ride.dispatch?.currentAttempt || 1; // It was incremented once on create
                
                if (currentAttempt >= MAX_ATTEMPTS) {
                    // Timeout! Cancel the ride
                    ride.status = 'cancelled_by_system';
                    ride.cancelReason = 'No drivers accepted the ride within the timeout period.';
                    ride.cancelledAt = new Date();
                    ride.dispatch.status = 'cancelled';
                    await ride.save();

                    await TaxiRideEvent.create({
                        rideId: ride._id,
                        eventType: 'SYSTEM_CANCELLED',
                        metadata: { reason: 'max_attempts_reached', attempts: currentAttempt }
                    });

                    logger.info(`[TaxiDispatchCron] Ride ${ride._id} timed out after ${currentAttempt} attempts.`);
                    
                    // Notify user via socket (rider listens to ride_status_update)
                    const io = getIO();
                    if (io && ride.userId) {
                        const payload = {
                            module: 'taxi',
                            jobType: 'ride',
                            rideId: String(ride._id),
                            rideNumber: ride.rideNumber,
                            status: 'cancelled_by_system',
                            cancelReason: ride.cancelReason,
                        };
                        io.to(rooms.user(ride.userId)).emit('ride_status_update', payload);
                        io.to(rooms.user(ride.userId)).emit('ride_cancelled', payload);
                        io.to(rooms.user(ride.userId)).emit('ride_update', payload);
                    }
                } else {
                    // Try assigning again with expanded radius
                    const baseRadius = await getSearchRadiusKm();
                    // After attempt N, next radius = base + N*2 (attempt 2 → +2, attempt 3 → +4, …)
                    const newRadius = baseRadius + (currentAttempt * RADIUS_EXPAND_KM);
                    
                    logger.info(`[TaxiDispatchCron] Ride ${ride._id} stalled. Triggering attempt ${currentAttempt + 1} with radius ${newRadius}km`);
                    
                    await tryAssignRide(String(ride._id), newRadius);
                }
            }
        } catch (error) {
            logger.error(`[TaxiDispatchCron] Error executing loop: ${error.message}`);
        }
    });
}
