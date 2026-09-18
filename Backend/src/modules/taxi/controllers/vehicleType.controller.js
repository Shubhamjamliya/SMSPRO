import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as vehicleTypeService from '../services/vehicleType.service.js';

export const listVehicleTypes = asyncHandler(async (req, res) => {
    const data = await vehicleTypeService.listVehicleTypes(req.query);
    return sendResponse(res, 200, 'Vehicle types fetched successfully', data);
});

export const getVehicleTypeById = asyncHandler(async (req, res) => {
    const vehicleType = await vehicleTypeService.getVehicleTypeById(req.params.id);
    return sendResponse(res, 200, 'Vehicle type fetched successfully', { vehicleType });
});

export const createVehicleType = asyncHandler(async (req, res) => {
    const vehicleType = await vehicleTypeService.createVehicleType(req.body, req.user);
    return sendResponse(res, 201, 'Vehicle type created successfully', { vehicleType });
});

export const updateVehicleType = asyncHandler(async (req, res) => {
    const vehicleType = await vehicleTypeService.updateVehicleType(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Vehicle type updated successfully', { vehicleType });
});

export const patchVehicleTypeStatus = asyncHandler(async (req, res) => {
    const vehicleType = await vehicleTypeService.updateVehicleTypeStatus(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Vehicle type status updated successfully', { vehicleType });
});

export const deleteVehicleType = asyncHandler(async (req, res) => {
    const result = await vehicleTypeService.deleteVehicleType(req.params.id, req.user);
    return sendResponse(res, 200, 'Vehicle type deleted successfully', result);
});

export const listVehicleTypeDropdown = asyncHandler(async (req, res) => {
    const vehicleTypes = await vehicleTypeService.listVehicleTypeDropdown();
    return sendResponse(res, 200, 'Vehicle types fetched successfully', { vehicleTypes });
});
