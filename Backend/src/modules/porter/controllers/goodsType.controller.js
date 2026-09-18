import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as goodsTypeService from '../services/goodsType.service.js';

export const listGoodsTypes = asyncHandler(async (req, res) => {
    const data = await goodsTypeService.listGoodsTypes(req.query);
    return sendResponse(res, 200, 'Goods types fetched successfully', data);
});

export const getGoodsTypeById = asyncHandler(async (req, res) => {
    const goodsType = await goodsTypeService.getGoodsTypeById(req.params.id);
    return sendResponse(res, 200, 'Goods type fetched successfully', { goodsType });
});

export const createGoodsType = asyncHandler(async (req, res) => {
    const goodsType = await goodsTypeService.createGoodsType(req.body, req.user);
    return sendResponse(res, 201, 'Goods type created successfully', { goodsType });
});

export const updateGoodsType = asyncHandler(async (req, res) => {
    const goodsType = await goodsTypeService.updateGoodsType(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Goods type updated successfully', { goodsType });
});

export const deleteGoodsType = asyncHandler(async (req, res) => {
    const result = await goodsTypeService.deleteGoodsType(req.params.id, req.user);
    return sendResponse(res, 200, 'Goods type deleted successfully', result);
});

export const listPublicGoodsCatalog = asyncHandler(async (_req, res) => {
    const data = await goodsTypeService.listPublicGoodsCatalog();
    return sendResponse(res, 200, 'Goods catalog fetched successfully', data);
});

export const updateRestrictedItems = asyncHandler(async (req, res) => {
    const settings = await goodsTypeService.updateRestrictedItems(
        req.body?.restrictedItems || req.body?.items || [],
        req.user,
    );
    return sendResponse(res, 200, 'Restricted items updated successfully', { settings });
});
