import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as bikeService from '../services/bike.service.js';

export const listBikes = asyncHandler(async (req, res) => {
    const data = await bikeService.listBikes(req.query);
    return sendResponse(res, 200, 'Bikes fetched successfully', data);
});

export const getBikeById = asyncHandler(async (req, res) => {
    const bike = await bikeService.getBikeById(req.params.id);
    return sendResponse(res, 200, 'Bike fetched successfully', { bike });
});

export const createBike = asyncHandler(async (req, res) => {
    const bike = await bikeService.createBike(req.body, req.user);
    return sendResponse(res, 201, 'Bike created successfully', { bike });
});

export const updateBike = asyncHandler(async (req, res) => {
    const bike = await bikeService.updateBike(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Bike updated successfully', { bike });
});

export const patchBikeStatus = asyncHandler(async (req, res) => {
    const bike = await bikeService.updateBikeStatus(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Bike status updated successfully', { bike });
});

export const deleteBike = asyncHandler(async (req, res) => {
    const result = await bikeService.deleteBike(req.params.id, req.user);
    return sendResponse(res, 200, 'Bike deleted successfully', result);
});

export const listBikeDropdown = asyncHandler(async (req, res) => {
    const bikes = await bikeService.listBikeDropdown(req.query);
    return sendResponse(res, 200, 'Bikes fetched successfully', { bikes });
});

export const listPendingBikes = asyncHandler(async (req, res) => {
    const data = await bikeService.listPendingBikes({
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        status: req.query.status,
    });
    return sendResponse(res, 200, 'Vendor bikes fetched successfully', data);
});

export const approveBike = asyncHandler(async (req, res) => {
    const bike = await bikeService.approveBike(req.params.id, req.user);
    return sendResponse(res, 200, 'Bike approved', { bike });
});

export const rejectBike = asyncHandler(async (req, res) => {
    const reason = req.body?.reason || req.body?.rejectionReason || '';
    const bike = await bikeService.rejectBike(req.params.id, reason, req.user);
    return sendResponse(res, 200, 'Bike rejected', { bike });
});
