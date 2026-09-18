import { ContractorProfile } from '../models/contractorProfile.model.js';
import { AuthError } from '../../../core/auth/errors.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

/**
 * Runs after authMiddleware + requireRoles('CONTRACTOR').
 *
 * This is load-bearing, not defensive decoration: `authMiddleware` only re-checks
 * the database for USER and DELIVERY_PARTNER tokens. Every other role — including
 * CONTRACTOR — falls straight through on `return next()`. Without this guard a
 * suspended contractor would keep working until their token expired, which BRD
 * Rule 6 does not allow.
 *
 * Pins `req.contractorId` so downstream services can scope every query to the
 * contractor making the request.
 */
export const requireApprovedContractor = asyncHandler(async (req, res, next) => {
    const contractor = await ContractorProfile.findById(req.user?.userId)
        .select('status isActive isDeleted')
        .lean();

    if (!contractor || contractor.isDeleted) {
        throw new AuthError('Contractor account not found');
    }
    if (contractor.isActive === false) {
        throw new AuthError('Your contractor account has been suspended. Contact support.');
    }
    if (contractor.status !== 'approved') {
        throw new AuthError(
            contractor.status === 'pending_approval'
                ? 'Your registration is being verified. You will be notified once it is approved.'
                : contractor.status === 'rejected'
                    ? 'Your registration was not approved. Please review the reason and resubmit.'
                    : 'Finish your registration and get approved to access this feature',
        );
    }

    req.contractorId = String(req.user.userId);
    next();
});

/**
 * Weaker guard for the registration flow itself: the account must exist and not
 * be suspended, but it does NOT need to be approved — otherwise a contractor
 * could never complete the very registration that leads to approval.
 */
export const requireContractorAccount = asyncHandler(async (req, res, next) => {
    const contractor = await ContractorProfile.findById(req.user?.userId)
        .select('isActive isDeleted')
        .lean();

    if (!contractor || contractor.isDeleted) {
        throw new AuthError('Contractor account not found');
    }
    if (contractor.isActive === false) {
        throw new AuthError('Your contractor account has been suspended. Contact support.');
    }

    req.contractorId = String(req.user.userId);
    next();
});
