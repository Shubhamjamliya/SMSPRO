import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as zoneService from '../services/zone.service.js';
import * as hubService from '../services/hub.service.js';
import * as bikeService from '../services/bike.service.js';
import * as bookingService from '../services/booking.service.js';
import * as bookingEngine from '../services/bookingEngine.service.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as reportsService from '../services/reports.service.js';
import * as categoryService from '../services/category.service.js';
import * as couponService from '../services/coupon.service.js';
import * as vendorWalletService from '../services/vendorWallet.service.js';
import * as notificationService from '../services/bookingNotifications.service.js';
import * as settingsService from '../services/settings.service.js';
import * as vendorTaxProfileService from '../services/vendorTaxProfile.service.js';
import * as settlementService from '../services/settlement.service.js';
import * as invoiceService from '../services/invoice.service.js';
import * as financeTransactionService from '../services/financeTransaction.service.js';
import * as monthlySettlementService from '../services/monthlySettlementService.js';

const vendorIdOf = (req) => req.vendorId;

// ——— Zones ———
export const listVendorZones = asyncHandler(async (req, res) => {
    const data = await zoneService.listZones(req.query, { populateVendor: true });
    return sendResponse(res, 200, 'Bike Rent zones fetched successfully', data);
});

export const getVendorZone = asyncHandler(async (req, res) => {
    const zone = await zoneService.getZoneById(req.params.id);
    return sendResponse(res, 200, 'Bike Rent zone fetched successfully', { zone });
});

export const createVendorZone = asyncHandler(async (req, res) => {
    const zone = await zoneService.createZone(req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 201, 'Bike Rent zone created successfully', { zone });
});

export const updateVendorZone = asyncHandler(async (req, res) => {
    const zone = await zoneService.updateZone(req.params.id, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Bike Rent zone updated successfully', { zone });
});

export const patchVendorZoneStatus = asyncHandler(async (req, res) => {
    const zone = await zoneService.updateZoneStatus(req.params.id, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Bike Rent zone status updated successfully', { zone });
});

export const deleteVendorZone = asyncHandler(async (req, res) => {
    const result = await zoneService.deleteZone(req.params.id, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Bike Rent zone deleted successfully', result);
});

// ——— Hubs ———
export const listVendorHubs = asyncHandler(async (req, res) => {
    const hubs = await hubService.listHubsForVendor(req.query, vendorIdOf(req));
    return sendResponse(res, 200, 'Pickup hubs fetched successfully', { hubs });
});

export const listVendorHubsByZone = asyncHandler(async (req, res) => {
    const hubs = await hubService.listHubsByZone(req.params.zoneId, req.query, vendorIdOf(req));
    return sendResponse(res, 200, 'Pickup hubs fetched successfully', { hubs });
});

export const getVendorHub = asyncHandler(async (req, res) => {
    const hub = await hubService.getHubById(req.params.id, vendorIdOf(req));
    return sendResponse(res, 200, 'Pickup hub fetched successfully', { hub });
});

export const createVendorHub = asyncHandler(async (req, res) => {
    const hub = await hubService.createHub(req.params.zoneId, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 201, 'Pickup hub created successfully', { hub });
});

export const updateVendorHub = asyncHandler(async (req, res) => {
    const hub = await hubService.updateHub(req.params.id, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Pickup hub updated successfully', { hub });
});

export const patchVendorHubStatus = asyncHandler(async (req, res) => {
    const hub = await hubService.updateHubStatus(req.params.id, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Pickup hub status updated successfully', { hub });
});

export const deleteVendorHub = asyncHandler(async (req, res) => {
    const result = await hubService.deleteHub(req.params.id, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Pickup hub deleted successfully', result);
});

export const listVendorHubDropdown = asyncHandler(async (req, res) => {
    const hubs = await hubService.listHubDropdown(req.query, vendorIdOf(req));
    return sendResponse(res, 200, 'Pickup hubs fetched successfully', { hubs });
});

// ——— Bikes ———
export const listVendorBikes = asyncHandler(async (req, res) => {
    const data = await bikeService.listBikes(req.query, vendorIdOf(req));
    return sendResponse(res, 200, 'Bikes fetched successfully', data);
});

export const getVendorBike = asyncHandler(async (req, res) => {
    const bike = await bikeService.getBikeById(req.params.id, vendorIdOf(req));
    return sendResponse(res, 200, 'Bike fetched successfully', { bike });
});

export const createVendorBike = asyncHandler(async (req, res) => {
    const bike = await bikeService.createBike(req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 201, 'Bike created successfully', { bike });
});

export const updateVendorBike = asyncHandler(async (req, res) => {
    const bike = await bikeService.updateBike(req.params.id, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Bike updated successfully', { bike });
});

export const patchVendorBikeStatus = asyncHandler(async (req, res) => {
    const bike = await bikeService.updateBikeStatus(req.params.id, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Bike status updated successfully', { bike });
});

export const deleteVendorBike = asyncHandler(async (req, res) => {
    const result = await bikeService.deleteBike(req.params.id, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Bike deleted successfully', result);
});

export const listVendorBikeDropdown = asyncHandler(async (req, res) => {
    const bikes = await bikeService.listBikeDropdown(req.query, vendorIdOf(req));
    return sendResponse(res, 200, 'Bikes fetched successfully', { bikes });
});

export const resubmitVendorBike = asyncHandler(async (req, res) => {
    const bike = await bikeService.resubmitBike(req.params.id, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Bike resubmitted for admin approval', { bike });
});

// ——— Bookings (read + lifecycle actions, scoped to this vendor's own bookings) ———
function forVendor(booking) {
    if (!booking || typeof booking !== 'object') return booking;
    const next = { ...booking };
    delete next.pickupCode;
    return next;
}

export const listVendorBookings = asyncHandler(async (req, res) => {
    const data = await bookingService.listBookings({ ...req.query, vendorId: vendorIdOf(req) });
    return sendResponse(res, 200, 'Bookings fetched successfully', data);
});

export const getVendorBookingById = asyncHandler(async (req, res) => {
    const booking = await bookingService.getBookingById(req.params.id, vendorIdOf(req));
    return sendResponse(res, 200, 'Booking fetched successfully', { booking });
});

export const approveVendorBooking = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.adminApproveBooking(req.params.id, req.user, {
        note: req.body?.note,
    });
    return sendResponse(res, 200, 'Booking approved — awaiting payment', { booking: forVendor(booking) });
});

export const rejectVendorBooking = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.adminRejectBooking(req.params.id, req.user, {
        reason: req.body?.reason || req.body?.note,
    });
    return sendResponse(res, 200, 'Booking rejected', { booking: forVendor(booking) });
});

export const startVendorRide = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.adminStartRide(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Hub handover confirmed — rental started', { booking: forVendor(booking) });
});

export const collectVendorDeposit = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.adminCollectDeposit(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Security deposit collected', { booking: forVendor(booking) });
});

export const inspectVendorBooking = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.inspectAndSettle(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Inspection and deposit settlement completed', { booking: forVendor(booking) });
});

export const collectVendorLateBalance = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.collectRemainingLateBalance(
        req.params.id,
        { method: req.body?.method, transactionId: req.body?.transactionId, note: req.body?.note },
        req.user,
    );
    return sendResponse(res, 200, 'Remaining late balance collected', { booking: forVendor(booking) });
});

export const previewVendorLateCharges = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const preview = await bookingEngine.previewLateReturnCharges(req.params.id, {
        actualReturnAt: req.body?.actualReturnAt || req.query?.actualReturnAt,
        damageFee: req.body?.damageFee ?? req.query?.damageFee ?? 0,
        lateFeeOverride: req.body?.lateFee ?? req.query?.lateFee,
    });
    return sendResponse(res, 200, 'Late return charges preview', { preview });
});

export const previewVendorCancellation = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const preview = await bookingEngine.previewCancellation(null, req.params.id, { actor: 'admin' });
    return sendResponse(res, 200, 'Cancellation preview', { preview });
});

export const cancelVendorBooking = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.cancelBooking(
        null,
        req.params.id,
        { reason: req.body?.reason || req.body?.note, actor: 'admin' },
        req.user,
    );
    return sendResponse(res, 200, 'Booking cancelled', { booking: forVendor(booking) });
});

export const markVendorBookingNoShow = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.markNoShow(req.params.id, req.body?.note, req.user);
    return sendResponse(res, 200, 'Marked as no-show', { booking: forVendor(booking) });
});

export const overrideVendorBookingNoShow = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.overrideNoShow(
        req.params.id,
        { reason: req.body?.reason },
        req.user,
    );
    return sendResponse(res, 200, 'No-show overridden — booking restored', {
        booking: forVendor(booking),
    });
});

export const releaseVendorDepositRefund = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.releaseScheduledDepositRefund(req.params.id, {
        force: req.body?.force !== false,
        note: req.body?.note || 'Refund released by vendor',
        finalRefundAmount: req.body?.amount,
        reqUser: req.user,
    });
    return sendResponse(res, 200, 'Security deposit refund released to wallet', { booking: forVendor(booking) });
});

export const resolveVendorExtension = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.adminResolveExtension(req.params.id, req.body, req.user);
    const action = String(req.body?.action || '').toLowerCase();
    return sendResponse(
        res,
        200,
        action === 'reject' ? 'Extension request rejected' : 'Extension request approved',
        { booking: forVendor(booking) },
    );
});

export const reassignVendorBookingBike = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const booking = await bookingEngine.reassignBookingBike(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Booking reassigned to another bike', { booking: forVendor(booking) });
});

export const listVendorBookingInspections = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const inspectionService = await import('../services/inspection.service.js');
    const inspections = await inspectionService.listInspectionsForBooking(req.params.id);
    const compare = await inspectionService.getInspectionCompare(req.params.id);
    return sendResponse(res, 200, 'Booking inspections fetched successfully', {
        inspections,
        pickup: compare.pickup,
        return: compare.return,
    });
});

export const compareVendorBookingInspections = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.id, vendorIdOf(req));
    const { getInspectionCompare } = await import('../services/inspection.service.js');
    const compare = await getInspectionCompare(req.params.id);
    return sendResponse(res, 200, 'Inspection comparison fetched successfully', compare);
});

export const listVendorInspections = asyncHandler(async (req, res) => {
    const { listInspections } = await import('../services/inspection.service.js');
    const data = await listInspections({ ...req.query, vendorId: vendorIdOf(req) });
    return sendResponse(res, 200, 'Inspections fetched successfully', data);
});

// ——— Categories ———
export const listVendorCategories = asyncHandler(async (req, res) => {
    const data = await categoryService.listCategories(req.query, vendorIdOf(req));
    return sendResponse(res, 200, 'Categories fetched successfully', data);
});

export const getVendorCategory = asyncHandler(async (req, res) => {
    const category = await categoryService.getCategoryById(req.params.id, vendorIdOf(req));
    return sendResponse(res, 200, 'Category fetched successfully', { category });
});

export const createVendorCategory = asyncHandler(async (req, res) => {
    const category = await categoryService.createCategory(req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 201, 'Category submitted for admin approval', { category });
});

export const resubmitVendorCategory = asyncHandler(async (req, res) => {
    const category = await categoryService.resubmitCategory(req.params.id, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Category resubmitted for admin approval', { category });
});

export const listVendorCategoryDropdown = asyncHandler(async (req, res) => {
    const categories = await categoryService.listCategoryDropdown(vendorIdOf(req));
    return sendResponse(res, 200, 'Categories fetched successfully', { categories });
});

// ——— Coupons ———
export const listVendorCoupons = asyncHandler(async (req, res) => {
    const data = await couponService.listCoupons(req.query, vendorIdOf(req));
    return sendResponse(res, 200, 'Coupons fetched successfully', data);
});

export const getVendorCoupon = asyncHandler(async (req, res) => {
    const coupon = await couponService.getCouponById(req.params.id, vendorIdOf(req));
    return sendResponse(res, 200, 'Coupon fetched successfully', { coupon });
});

export const createVendorCoupon = asyncHandler(async (req, res) => {
    const coupon = await couponService.createCoupon(req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 201, 'Coupon submitted for admin approval', { coupon });
});

export const resubmitVendorCoupon = asyncHandler(async (req, res) => {
    const coupon = await couponService.resubmitCoupon(req.params.id, req.body, req.user, vendorIdOf(req));
    return sendResponse(res, 200, 'Coupon resubmitted for admin approval', { coupon });
});

// ——— Notifications ———
export const listVendorNotifications = asyncHandler(async (req, res) => {
    const notifications = await notificationService.listUserNotifications(vendorIdOf(req), {
        limit: req.query.limit,
    });
    return sendResponse(res, 200, 'Notifications fetched successfully', { notifications });
});

export const markVendorNotificationRead = asyncHandler(async (req, res) => {
    const result = await notificationService.markNotificationRead(vendorIdOf(req), req.params.id);
    return sendResponse(res, 200, 'Notification marked as read', result);
});

// ——— Dashboard ———
export const getVendorDashboard = asyncHandler(async (req, res) => {
    const stats = await dashboardService.getDashboardStats(vendorIdOf(req));
    return sendResponse(res, 200, 'Dashboard fetched successfully', { stats });
});

// ——— Reports ———
export const getVendorReports = asyncHandler(async (req, res) => {
    const reports = await reportsService.getReportsSummary(req.query, vendorIdOf(req));
    return sendResponse(res, 200, 'Reports fetched successfully', { reports });
});

// ——— Wallet ———
export const getVendorWallet = asyncHandler(async (req, res) => {
    const wallet = await vendorWalletService.getVendorWalletSummary(vendorIdOf(req));
    return sendResponse(res, 200, 'Wallet fetched successfully', { wallet });
});

export const listVendorEarnings = asyncHandler(async (req, res) => {
    const data = await vendorWalletService.listVendorEarnings(vendorIdOf(req), req.query);
    return sendResponse(res, 200, 'Earnings fetched successfully', data);
});

export const listVendorWithdrawals = asyncHandler(async (req, res) => {
    const data = await vendorWalletService.listVendorWithdrawals(vendorIdOf(req), req.query);
    return sendResponse(res, 200, 'Withdrawals fetched successfully', data);
});

export const listVendorRefunds = asyncHandler(async (req, res) => {
    const data = await vendorWalletService.listVendorRefunds(vendorIdOf(req), req.query);
    return sendResponse(res, 200, 'Refund history fetched successfully', data);
});

export const requestVendorWithdrawal = asyncHandler(async (req, res) => {
    const withdrawal = await vendorWalletService.requestWithdrawal(vendorIdOf(req), req.body);
    return sendResponse(res, 201, 'Withdrawal request submitted', { withdrawal });
});

// ——— Settings (vendor's own policy overrides — booking/cancellation/no-show/late-fee/deposit/support) ———
export const getVendorSettings = asyncHandler(async (req, res) => {
    const settings = await settingsService.getVendorSettings(vendorIdOf(req));
    return sendResponse(res, 200, 'Settings fetched successfully', settings);
});

export const updateVendorSettings = asyncHandler(async (req, res) => {
    const settings = await settingsService.updateVendorSettings(vendorIdOf(req), req.body, req.user);
    return sendResponse(res, 200, 'Settings saved successfully', settings);
});

// ——— Tax & Billing (vendor's own tax/business identity — no rate/fee control) ———
export const getVendorTaxProfile = asyncHandler(async (req, res) => {
    const profile = await vendorTaxProfileService.getVendorTaxProfile(vendorIdOf(req));
    return sendResponse(res, 200, 'Tax profile fetched successfully', { profile });
});

export const updateVendorTaxProfile = asyncHandler(async (req, res) => {
    const profile = await vendorTaxProfileService.updateVendorTaxProfile(vendorIdOf(req), req.body, req.user);
    return sendResponse(res, 200, 'Tax profile saved successfully', { profile });
});

// ——— Settlements (own booking payout ledger) ———
export const listVendorSettlements = asyncHandler(async (req, res) => {
    const data = await settlementService.listVendorSettlements(vendorIdOf(req), req.query);
    return sendResponse(res, 200, 'Settlements fetched successfully', data);
});

export const getVendorSettlementById = asyncHandler(async (req, res) => {
    const settlement = await settlementService.getVendorSettlementById(req.params.id, vendorIdOf(req));
    return sendResponse(res, 200, 'Settlement fetched successfully', { settlement });
});

// ——— Invoices (own bookings only) ———
export const getVendorInvoiceByBooking = asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getVendorInvoiceByBooking(req.params.bookingId, vendorIdOf(req));
    const extensions = await invoiceService.getExtensionInvoicesByBooking(req.params.bookingId);
    return sendResponse(res, 200, 'Invoice fetched successfully', {
        invoice,
        extensions: extensions.filter((row) => String(row.vendorId) === String(vendorIdOf(req))),
    });
});

// ——— Finance transactions (own bookings/earnings only) ———
export const listVendorFinanceTransactions = asyncHandler(async (req, res) => {
    const data = await financeTransactionService.listVendorTransactions(vendorIdOf(req), req.query);
    return sendResponse(res, 200, 'Transactions fetched successfully', data);
});

export const getVendorBookingTransactions = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.bookingId, vendorIdOf(req));
    const transactions = await financeTransactionService.listBookingTransactions(req.params.bookingId);
    return sendResponse(res, 200, 'Transactions fetched successfully', { transactions });
});

export const getVendorBookingSettlement = asyncHandler(async (req, res) => {
    await bookingService.assertVendorOwnsBooking(req.params.bookingId, vendorIdOf(req));
    const settlement = await settlementService.getSettlementByBookingId(req.params.bookingId);
    return sendResponse(res, 200, 'Settlement fetched successfully', { settlement });
});

// ——— Monthly settlement (own payout history, read-only) ———
export const listVendorMonthlySettlements = asyncHandler(async (req, res) => {
    const data = await monthlySettlementService.listVendorMonthlySettlements(vendorIdOf(req), req.query);
    return sendResponse(res, 200, 'Monthly settlements fetched successfully', data);
});

export const getVendorMonthlySettlementById = asyncHandler(async (req, res) => {
    const settlement = await monthlySettlementService.getVendorMonthlySettlementById(req.params.id, vendorIdOf(req));
    return sendResponse(res, 200, 'Monthly settlement fetched successfully', { settlement });
});
