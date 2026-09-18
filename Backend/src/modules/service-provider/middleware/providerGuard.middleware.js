import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { AuthError } from '../../../core/auth/errors.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

/**
 * Runs after providerAuth (role === 'SERVICE_PROVIDER'). Confirms the provider account
 * is approved/active and pins req.providerId so downstream services can scope every
 * query to this provider's own dashboard/services/zones. Mirrors bike-rent's
 * requireApprovedVendor.
 */
export const requireApprovedServiceProvider = asyncHandler(async (req, res, next) => {
  const provider = await ServiceProviderProfile.findById(req.user?.userId)
    .select('status isActive isDeleted')
    .lean();
  if (!provider || provider.isDeleted) {
    throw new AuthError('Service provider account not found');
  }
  if (provider.isActive === false) {
    throw new AuthError('Your service provider account has been deactivated. Contact support.');
  }
  if (provider.status !== 'approved') {
    throw new AuthError(
      provider.status === 'pending_approval'
        ? 'Your service provider registration is pending approval'
        : provider.status === 'rejected'
          ? 'Your service provider registration was rejected. Please update and resubmit.'
          : 'Complete your registration and get approved to access this feature',
    );
  }
  req.providerId = String(req.user.userId);
  next();
});
