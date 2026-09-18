import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as inspectionService from '../services/inspection.service.js';

export const listInspections = asyncHandler(async (req, res) => {
    const data = await inspectionService.listInspections(req.query);
    return sendResponse(res, 200, 'Inspections fetched successfully', data);
});

export const getInspectionById = asyncHandler(async (req, res) => {
    const inspection = await inspectionService.getInspectionById(req.params.id);
    return sendResponse(res, 200, 'Inspection fetched successfully', { inspection });
});

export const listBookingInspections = asyncHandler(async (req, res) => {
    const inspections = await inspectionService.listInspectionsForBooking(req.params.id);
    const compare = await inspectionService.getInspectionCompare(req.params.id);
    return sendResponse(res, 200, 'Booking inspections fetched successfully', {
        inspections,
        pickup: compare.pickup,
        return: compare.return,
    });
});

export const compareBookingInspections = asyncHandler(async (req, res) => {
    const compare = await inspectionService.getInspectionCompare(req.params.id);
    return sendResponse(res, 200, 'Inspection comparison fetched successfully', compare);
});
