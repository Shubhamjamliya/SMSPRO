import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as adminOps from '../services/adminOps.service.js';

export const listDrivers = asyncHandler(async (req, res) => {
  const data = await adminOps.listTaxiDrivers(req.query);
  return sendResponse(res, 200, 'Drivers fetched successfully', data);
});

export const getDriverById = asyncHandler(async (req, res) => {
  const driver = await adminOps.getTaxiDriverById(req.params.id);
  return sendResponse(res, 200, 'Driver fetched successfully', { driver });
});

export const patchDriverStatus = asyncHandler(async (req, res) => {
  const driver = await adminOps.patchTaxiDriverStatus(req.params.id, req.body);
  return sendResponse(res, 200, 'Driver status updated successfully', { driver });
});

export const listCustomers = asyncHandler(async (req, res) => {
  const data = await adminOps.listTaxiCustomers(req.query);
  return sendResponse(res, 200, 'Customers fetched successfully', data);
});

export const listFleet = asyncHandler(async (req, res) => {
  const data = await adminOps.listTaxiFleet(req.query);
  return sendResponse(res, 200, 'Fleet fetched successfully', data);
});

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await adminOps.getTaxiDashboardStats();
  return sendResponse(res, 200, 'Dashboard fetched successfully', data);
});
