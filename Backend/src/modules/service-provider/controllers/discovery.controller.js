import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { computeAvailableSlotsForZone } from '../services/slotCalculation.service.js';
import { computeBookingPricing } from '../services/pricing.service.js';
import { buildCandidateList } from '../services/dispatch.service.js';
import { detectServiceProviderZone } from '../services/zoneAccess.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

/** Date step: "on this date, at what times is at least one eligible provider free." */
export const getZoneSlotsController = asyncHandler(async (req, res, next) => {
  try {
    const { serviceId, zoneId, date } = req.query;
    const result = await computeAvailableSlotsForZone({ serviceId, zoneId, date });
    const pricing = result.service ? await computeBookingPricing(result.service.adminPrice) : null;
    return sendResponse(res, 200, 'Available slots', { ...result, pricing });
  } catch (error) {
    return handle(error, res, next);
  }
});

/** Provider step: once date+time are fixed, who is actually eligible for that exact slot. */
export const getEligibleProvidersController = asyncHandler(async (req, res, next) => {
  try {
    const { serviceId, date, startTime } = req.query;
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ValidationError('A valid location is required');
    }
    const zone = await detectServiceProviderZone(lat, lng);
    if (!zone) {
      return sendResponse(res, 200, 'Eligible providers', { providers: [], zone: null, message: 'Service is not available in your area yet.' });
    }
    const providers = await buildCandidateList({ serviceId, zoneId: zone._id, date, startTime });
    return sendResponse(res, 200, 'Eligible providers', { providers, zone: { _id: zone._id, name: zone.name } });
  } catch (error) {
    return handle(error, res, next);
  }
});
