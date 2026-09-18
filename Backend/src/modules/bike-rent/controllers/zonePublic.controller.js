import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as zoneService from '../services/zone.service.js';

/** GET /zones/detect?lat=&lng= */
export const detectZone = asyncHandler(async (req, res) => {
    const data = await zoneService.detectZone(req.query.lat, req.query.lng);
    const message = data.status === 'IN_SERVICE' ? 'Zone detected' : 'Out of service';
    return sendResponse(res, 200, message, data);
});

/** GET /zones/public */
export const listPublicZones = asyncHandler(async (_req, res) => {
    const zones = await zoneService.listPublicZones();
    return sendResponse(res, 200, 'Bike Rent zones fetched successfully', { zones });
});
