import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as customerService from '../services/customer.service.js';

export const listCustomers = asyncHandler(async (req, res) => {
    const data = await customerService.listCustomers(req.query);
    return sendResponse(res, 200, 'Customers fetched successfully', data);
});

export const getCustomerById = asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomerById(req.params.id);
    return sendResponse(res, 200, 'Customer fetched successfully', { customer });
});
