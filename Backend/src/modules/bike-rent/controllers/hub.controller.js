import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as hubService from '../services/hub.service.js';

export const listHubsByZone = asyncHandler(async (req, res) => {
    const hubs = await hubService.listHubsByZone(req.params.zoneId, req.query);
    return sendResponse(res, 200, 'Pickup hubs fetched successfully', { hubs });
});

export const getHubById = asyncHandler(async (req, res) => {
    const hub = await hubService.getHubById(req.params.id);
    return sendResponse(res, 200, 'Pickup hub fetched successfully', { hub });
});

export const createHub = asyncHandler(async (req, res) => {
    const hub = await hubService.createHub(req.params.zoneId, req.body, req.user);
    return sendResponse(res, 201, 'Pickup hub created successfully', { hub });
});

export const updateHub = asyncHandler(async (req, res) => {
    const hub = await hubService.updateHub(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Pickup hub updated successfully', { hub });
});

export const patchHubStatus = asyncHandler(async (req, res) => {
    const hub = await hubService.updateHubStatus(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Pickup hub status updated successfully', { hub });
});

export const deleteHub = asyncHandler(async (req, res) => {
    const result = await hubService.deleteHub(req.params.id, req.user);
    return sendResponse(res, 200, 'Pickup hub deleted successfully', result);
});

export const listHubDropdown = asyncHandler(async (req, res) => {
    const hubs = await hubService.listHubDropdown(req.query);
    return sendResponse(res, 200, 'Pickup hubs fetched successfully', { hubs });
});
