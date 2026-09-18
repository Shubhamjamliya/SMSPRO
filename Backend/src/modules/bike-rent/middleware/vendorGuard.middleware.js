import { BikeVendor } from '../models/bikeVendor.model.js';
import { AuthError } from '../../../core/auth/errors.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

/**
 * Runs after vendorAuth (role === 'BIKE_VENDOR'). Confirms the vendor account
 * is approved/active and pins req.vendorId so downstream services can scope
 * every query to this vendor's own hubs/bikes/bookings.
 */
export const requireApprovedVendor = asyncHandler(async (req, res, next) => {
    const vendor = await BikeVendor.findById(req.user?.userId)
        .select('status isActive isDeleted')
        .lean();
    if (!vendor || vendor.isDeleted) {
        throw new AuthError('Vendor account not found');
    }
    if (vendor.isActive === false) {
        throw new AuthError('Your vendor account has been deactivated. Contact support.');
    }
    if (vendor.status !== 'approved') {
        throw new AuthError(
            vendor.status === 'pending'
                ? 'Your vendor registration is pending approval'
                : vendor.status === 'rejected'
                    ? 'Your vendor registration was rejected. Please update and resubmit.'
                    : 'Complete vendor registration and get approved to access this feature',
        );
    }
    req.vendorId = String(req.user.userId);
    next();
});
