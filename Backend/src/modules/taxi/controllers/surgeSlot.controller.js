import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as surgeSlotService from '../services/surgeSlot.service.js';

export const listSurgeSlots = asyncHandler(async (req, res) => {
    const data = await surgeSlotService.listSurgeSlots(req.query);
    return sendResponse(res, 200, 'Surge slots fetched successfully', data);
});

export const getSurgeSlotById = asyncHandler(async (req, res) => {
    const surgeSlot = await surgeSlotService.getSurgeSlotById(req.params.id);
    return sendResponse(res, 200, 'Surge slot fetched successfully', { surgeSlot });
});

export const createSurgeSlot = asyncHandler(async (req, res) => {
    const surgeSlot = await surgeSlotService.createSurgeSlot(req.body, req.user);
    return sendResponse(res, 201, 'Surge slot created successfully', { surgeSlot });
});

export const updateSurgeSlot = asyncHandler(async (req, res) => {
    const surgeSlot = await surgeSlotService.updateSurgeSlot(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Surge slot updated successfully', { surgeSlot });
});

export const patchSurgeSlotStatus = asyncHandler(async (req, res) => {
    const surgeSlot = await surgeSlotService.updateSurgeSlotStatus(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Surge slot status updated successfully', { surgeSlot });
});

export const deleteSurgeSlot = asyncHandler(async (req, res) => {
    const result = await surgeSlotService.deleteSurgeSlot(req.params.id, req.user);
    return sendResponse(res, 200, 'Surge slot deleted successfully', result);
});
