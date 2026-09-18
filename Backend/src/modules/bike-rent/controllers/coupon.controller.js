import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as couponService from '../services/coupon.service.js';

export const listCoupons = asyncHandler(async (req, res) => {
    const data = await couponService.listCoupons(req.query);
    return sendResponse(res, 200, 'Coupons fetched successfully', data);
});

export const getCouponById = asyncHandler(async (req, res) => {
    const coupon = await couponService.getCouponById(req.params.id);
    return sendResponse(res, 200, 'Coupon fetched successfully', { coupon });
});

export const createCoupon = asyncHandler(async (req, res) => {
    const coupon = await couponService.createCoupon(req.body, req.user);
    return sendResponse(res, 201, 'Coupon created successfully', { coupon });
});

export const updateCoupon = asyncHandler(async (req, res) => {
    const coupon = await couponService.updateCoupon(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Coupon updated successfully', { coupon });
});

export const patchCouponStatus = asyncHandler(async (req, res) => {
    const coupon = await couponService.updateCouponStatus(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Coupon status updated successfully', { coupon });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
    const result = await couponService.deleteCoupon(req.params.id, req.user);
    return sendResponse(res, 200, 'Coupon deleted successfully', result);
});

export const listPendingCoupons = asyncHandler(async (req, res) => {
    const data = await couponService.listPendingCoupons({
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search,
        status: req.query.status,
    });
    return sendResponse(res, 200, 'Vendor coupons fetched successfully', data);
});

export const approveCoupon = asyncHandler(async (req, res) => {
    const coupon = await couponService.approveCoupon(req.params.id, req.user);
    return sendResponse(res, 200, 'Coupon approved', { coupon });
});

export const rejectCoupon = asyncHandler(async (req, res) => {
    const reason = req.body?.reason || req.body?.rejectionReason || '';
    const coupon = await couponService.rejectCoupon(req.params.id, reason, req.user);
    return sendResponse(res, 200, 'Coupon rejected', { coupon });
});

export const getCouponSummary = asyncHandler(async (req, res) => {
    const summary = await couponService.getCouponSummary();
    return sendResponse(res, 200, 'Coupon summary fetched successfully', { summary });
});

export const listCouponUsage = asyncHandler(async (req, res) => {
    const data = await couponService.listCouponUsage(req.params.id, req.query);
    return sendResponse(res, 200, 'Coupon usage fetched successfully', data);
});

export const listAvailableCoupons = asyncHandler(async (req, res) => {
    const coupons = await couponService.listPublicCoupons({
        rentalAmount: req.query.rentalAmount || req.query.amount || 0,
        securityDeposit: req.query.securityDeposit || req.query.depositAmount || 0,
        userId: req.user?.userId || null,
        limit: req.query.limit,
    });
    return sendResponse(res, 200, 'Available bike rental coupons', { coupons });
});

export const validateCoupon = asyncHandler(async (req, res) => {
    const applied = await couponService.validateAndApplyCoupon({
        code: req.body?.code || req.body?.couponCode,
        rentalFee: req.body?.rentalFee ?? req.body?.rentalAmount ?? 0,
        securityDeposit: req.body?.securityDeposit ?? req.body?.depositAmount ?? 0,
        userId: req.user?.userId || null,
    });
    return sendResponse(res, 200, 'Coupon applied', {
        coupon: {
            id: applied.couponId,
            code: applied.couponCode,
            name: applied.name,
            description: applied.description,
            discountType: applied.discountType,
            discountValue: applied.discountValue,
            applicableOn: applied.applicableOn,
            discountAmount: applied.discountAmount,
            rentalDiscount: applied.rentalDiscount,
            depositDiscount: applied.depositDiscount,
            finalRentalAmount: applied.finalRentalAmount,
            finalDepositAmount: applied.finalDepositAmount,
        },
    });
});
