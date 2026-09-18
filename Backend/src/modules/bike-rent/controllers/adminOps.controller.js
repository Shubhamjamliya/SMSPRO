import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as reportsService from '../services/reports.service.js';
import * as settingsService from '../services/settings.service.js';
import * as taxSettingsService from '../services/taxSettings.service.js';
import * as settlementService from '../services/settlement.service.js';
import * as invoiceService from '../services/invoice.service.js';
import * as financeTransactionService from '../services/financeTransaction.service.js';
import * as monthlySettlementService from '../services/monthlySettlementService.js';
import * as financeService from '../services/finance.service.js';

export const getDashboard = asyncHandler(async (_req, res) => {
    const stats = await dashboardService.getDashboardStats();
    return sendResponse(res, 200, 'Dashboard fetched successfully', { stats });
});

export const getReports = asyncHandler(async (req, res) => {
    const reports = await reportsService.getReportsSummary(req.query);
    return sendResponse(res, 200, 'Reports fetched successfully', { reports });
});

export const getSettings = asyncHandler(async (_req, res) => {
    const settings = await settingsService.getSettings();
    return sendResponse(res, 200, 'Settings fetched successfully', { settings });
});

export const updateSettings = asyncHandler(async (req, res) => {
    const settings = await settingsService.updateSettings(req.body, req.user);
    return sendResponse(res, 200, 'Settings updated successfully', { settings });
});

export const previewNoShowPolicy = asyncHandler(async (req, res) => {
    const { previewNoShowRefund } = await import('../services/noShowPolicy.service.js');
    const body = req.body || {};
    const settings = await settingsService.getSettings();
    const preview = previewNoShowRefund({
        securityDeposit: body.securityDeposit ?? 2000,
        refundRule: body.noShowRefundRule ?? body.refundRule ?? settings.noShowRefundRule,
        refundMode: body.noShowRefundMode ?? body.refundMode ?? settings.noShowRefundMode,
        refundPercent: body.noShowRefundPercent ?? body.refundPercent ?? settings.noShowRefundPercent,
        refundFixed: body.noShowRefundFixed ?? body.refundFixed ?? settings.noShowRefundFixed,
        penaltyAmount: body.noShowPenaltyAmount ?? body.penaltyAmount ?? settings.noShowPenaltyAmount,
        graceMinutes: body.noShowGraceMinutes ?? body.graceMinutes ?? settings.noShowGraceMinutes,
    });
    return sendResponse(res, 200, 'No-show refund preview', { preview });
});

export const listWalletTransactions = asyncHandler(async (req, res) => {
    const { listWalletTransactionsAdmin, getWalletBalance } = await import(
        '../../../core/wallet/index.js'
    );
    const data = await listWalletTransactionsAdmin({
        source: req.query.source || 'BIKE_RENTAL',
        type: req.query.type || null,
        from: req.query.from || null,
        to: req.query.to || null,
        userId: req.query.userId || null,
        search: req.query.search || '',
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
    });

    let userWallet = null;
    if (req.query.userId) {
        try {
            userWallet = await getWalletBalance(req.query.userId);
        } catch {
            userWallet = null;
        }
    }

    return sendResponse(res, 200, 'Wallet transactions fetched', {
        ...data,
        userWallet,
    });
});

export const getTaxSettings = asyncHandler(async (_req, res) => {
    const settings = await taxSettingsService.getTaxSettings();
    return sendResponse(res, 200, 'Tax settings fetched successfully', { settings });
});

export const updateTaxSettings = asyncHandler(async (req, res) => {
    const settings = await taxSettingsService.updateTaxSettings(req.body, req.user);
    return sendResponse(res, 200, 'Tax settings updated successfully', { settings });
});

export const listSettlements = asyncHandler(async (req, res) => {
    const data = await settlementService.listSettlements(req.query);
    return sendResponse(res, 200, 'Settlements fetched successfully', data);
});

export const getSettlementById = asyncHandler(async (req, res) => {
    const settlement = await settlementService.getSettlementById(req.params.id);
    return sendResponse(res, 200, 'Settlement fetched successfully', { settlement });
});

export const getInvoiceById = asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getAdminInvoiceById(req.params.id);
    return sendResponse(res, 200, 'Invoice fetched successfully', { invoice });
});

export const listFinanceTransactions = asyncHandler(async (req, res) => {
    const data = await financeTransactionService.listTransactions(req.query);
    return sendResponse(res, 200, 'Transactions fetched successfully', data);
});

export const createFinanceAdjustment = asyncHandler(async (req, res) => {
    const transaction = await financeTransactionService.recordAdminAdjustment({
        bookingId: req.body?.bookingId || null,
        userId: req.body?.userId || null,
        vendorId: req.body?.vendorId || null,
        amount: req.body?.amount,
        reason: req.body?.reason,
        reqUser: req.user,
    });
    return sendResponse(res, 201, 'Adjustment recorded successfully', { transaction });
});

/** Booking-detail finance enrichment: invoice (+ any extension debit notes), settlement, transactions. */
export const getBookingInvoice = asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getInvoiceByBooking(req.params.bookingId);
    const extensions = await invoiceService.getExtensionInvoicesByBooking(req.params.bookingId);
    return sendResponse(res, 200, 'Invoice fetched successfully', { invoice, extensions });
});

export const getBookingSettlement = asyncHandler(async (req, res) => {
    const settlement = await settlementService.getSettlementByBookingId(req.params.bookingId);
    return sendResponse(res, 200, 'Settlement fetched successfully', { settlement });
});

export const getBookingTransactions = asyncHandler(async (req, res) => {
    const transactions = await financeTransactionService.listBookingTransactions(req.params.bookingId);
    return sendResponse(res, 200, 'Transactions fetched successfully', { transactions });
});

// ——— Monthly vendor settlement (payout runs) ———
export const listMonthlySettlements = asyncHandler(async (req, res) => {
    const data = await monthlySettlementService.listMonthlySettlements(req.query);
    return sendResponse(res, 200, 'Monthly settlements fetched successfully', data);
});

export const getMonthlySettlementById = asyncHandler(async (req, res) => {
    const settlement = await monthlySettlementService.getMonthlySettlementById(req.params.id);
    return sendResponse(res, 200, 'Monthly settlement fetched successfully', { settlement });
});

export const generateMonthlySettlements = asyncHandler(async (req, res) => {
    const period = String(req.body?.period || '').trim() || monthlySettlementService.currentPeriod();
    const vendorId = req.body?.vendorId;
    if (vendorId) {
        const settlement = await monthlySettlementService.generateMonthlySettlement(vendorId, period);
        return sendResponse(res, 201, 'Monthly settlement generated', { settlement, settlements: settlement ? [settlement] : [] });
    }
    const settlements = await monthlySettlementService.generateAllMonthlySettlements(period);
    return sendResponse(res, 201, 'Monthly settlements generated', { settlements, period });
});

export const approveMonthlySettlement = asyncHandler(async (req, res) => {
    const settlement = await monthlySettlementService.approveMonthlySettlement(req.params.id, req.user, req.body);
    return sendResponse(res, 200, 'Monthly settlement approved', { settlement });
});

export const markMonthlySettlementProcessing = asyncHandler(async (req, res) => {
    const settlement = await monthlySettlementService.markMonthlySettlementProcessing(req.params.id, req.user, req.body);
    return sendResponse(res, 200, 'Monthly settlement marked as processing', { settlement });
});

export const markMonthlySettlementPaid = asyncHandler(async (req, res) => {
    const settlement = await monthlySettlementService.markMonthlySettlementPaid(req.params.id, req.user, req.body);
    return sendResponse(res, 200, 'Monthly settlement marked as paid', { settlement });
});

export const markMonthlySettlementFailed = asyncHandler(async (req, res) => {
    const settlement = await monthlySettlementService.markMonthlySettlementFailed(req.params.id, req.user, req.body);
    return sendResponse(res, 200, 'Monthly settlement marked as failed', { settlement });
});

export const getFinanceOverview = asyncHandler(async (req, res) => {
    const overview = await financeService.getFinanceOverview(req.query);
    return sendResponse(res, 200, 'Finance overview fetched successfully', { overview });
});
