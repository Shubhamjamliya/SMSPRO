import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as zoneService from '../services/zone.service.js';

export const listZones = asyncHandler(async (req, res) => {
    const data = await zoneService.listZones(req.query, { populateVendor: true });
    return sendResponse(res, 200, 'Bike Rent zones fetched successfully', data);
});

export const getZoneById = asyncHandler(async (req, res) => {
    const zone = await zoneService.getZoneById(req.params.id);
    return sendResponse(res, 200, 'Bike Rent zone fetched successfully', { zone });
});

export const createZone = asyncHandler(async (req, res) => {
    const zone = await zoneService.createZone(req.body, req.user);
    return sendResponse(res, 201, 'Bike Rent zone created successfully', { zone });
});

export const updateZone = asyncHandler(async (req, res) => {
    const zone = await zoneService.updateZone(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Bike Rent zone updated successfully', { zone });
});

export const patchZoneStatus = asyncHandler(async (req, res) => {
    const zone = await zoneService.updateZoneStatus(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Bike Rent zone status updated successfully', { zone });
});

export const deleteZone = asyncHandler(async (req, res) => {
    const result = await zoneService.deleteZone(req.params.id, req.user);
    return sendResponse(res, 200, 'Bike Rent zone deleted successfully', result);
});

export const listZoneDropdown = asyncHandler(async (req, res) => {
    const zones = await zoneService.listZoneDropdown();
    return sendResponse(res, 200, 'Bike Rent zones fetched successfully', { zones });
});
