import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as pricingService from '../services/pricing.service.js';

export const listPricing = asyncHandler(async (req, res) => {
    const data = await pricingService.listPricing(req.query);
    return sendResponse(res, 200, 'Pricing rules fetched successfully', data);
});

export const getPricingById = asyncHandler(async (req, res) => {
    const pricing = await pricingService.getPricingById(req.params.id);
    return sendResponse(res, 200, 'Pricing rule fetched successfully', { pricing });
});

export const createPricing = asyncHandler(async (req, res) => {
    const pricing = await pricingService.createPricing(req.body, req.user);
    return sendResponse(res, 201, 'Pricing rule created successfully', { pricing });
});

export const updatePricing = asyncHandler(async (req, res) => {
    const pricing = await pricingService.updatePricing(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Pricing rule updated successfully', { pricing });
});

export const patchPricingStatus = asyncHandler(async (req, res) => {
    const pricing = await pricingService.updatePricingStatus(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Pricing status updated successfully', { pricing });
});

export const deletePricing = asyncHandler(async (req, res) => {
    const result = await pricingService.deletePricing(req.params.id, req.user);
    return sendResponse(res, 200, 'Pricing rule deleted successfully', result);
});
