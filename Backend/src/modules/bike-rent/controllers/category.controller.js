import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as categoryService from '../services/category.service.js';

export const listCategories = asyncHandler(async (req, res) => {
    const data = await categoryService.listCategories(req.query);
    return sendResponse(res, 200, 'Categories fetched successfully', data);
});

export const getCategoryById = asyncHandler(async (req, res) => {
    const category = await categoryService.getCategoryById(req.params.id);
    return sendResponse(res, 200, 'Category fetched successfully', { category });
});

export const createCategory = asyncHandler(async (req, res) => {
    const category = await categoryService.createCategory(req.body, req.user);
    return sendResponse(res, 201, 'Category created successfully', { category });
});

export const updateCategory = asyncHandler(async (req, res) => {
    const category = await categoryService.updateCategory(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Category updated successfully', { category });
});

export const patchCategoryStatus = asyncHandler(async (req, res) => {
    const category = await categoryService.updateCategoryStatus(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Category status updated successfully', { category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
    const result = await categoryService.deleteCategory(req.params.id, req.user);
    return sendResponse(res, 200, 'Category deleted successfully', result);
});

export const listCategoryDropdown = asyncHandler(async (_req, res) => {
    const categories = await categoryService.listCategoryDropdown();
    return sendResponse(res, 200, 'Categories fetched successfully', { categories });
});

export const listPendingCategories = asyncHandler(async (req, res) => {
    const data = await categoryService.listPendingCategories({
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
    });
    return sendResponse(res, 200, 'Pending vendor categories fetched successfully', data);
});

export const approveCategory = asyncHandler(async (req, res) => {
    const category = await categoryService.approveCategory(req.params.id, req.user);
    return sendResponse(res, 200, 'Category approved', { category });
});

export const rejectCategory = asyncHandler(async (req, res) => {
    const reason = req.body?.reason || req.body?.rejectionReason || '';
    const category = await categoryService.rejectCategory(req.params.id, reason, req.user);
    return sendResponse(res, 200, 'Category rejected', { category });
});
