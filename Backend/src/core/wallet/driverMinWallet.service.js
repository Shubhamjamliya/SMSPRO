/**
 * Shared minimum pocket-wallet gate for ALL driver modules
 * (food, taxi, porter, returns, etc.).
 *
 * Admin sets one amount. If a partner's pocket balance is below it,
 * they are not offered new jobs. Withdrawals are still allowed.
 * Setting 0 disables the gate (existing behaviour).
 */
import mongoose from 'mongoose';
import { FoodDeliveryCashLimit } from '../../modules/food/admin/models/deliveryCashLimit.model.js';
import { FoodDeliveryWallet } from '../../modules/food/delivery/models/deliveryWallet.model.js';
import { FoodDeliveryWithdrawal } from '../../modules/food/delivery/models/foodDeliveryWithdrawal.model.js';
import { GlobalSettings } from '../../modules/common/models/settings.model.js';
import { ValidationError } from '../auth/errors.js';

export const MIN_WALLET_BLOCK_CODE = 'MIN_WALLET_REQUIRED';

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

function partnerIdKey(partner) {
    if (!partner) return '';
    if (typeof partner === 'string') return partner;
    return String(partner.partnerId || partner._id || partner.id || '');
}

export async function getMinWalletToReceiveOrders() {
    const [globalDoc, cashLimitDoc] = await Promise.all([
        GlobalSettings.findOne().select('minWalletToReceiveOrders').lean(),
        FoodDeliveryCashLimit.findOne({ isActive: true })
            .sort({ createdAt: -1 })
            .select('minWalletToReceiveOrders')
            .lean(),
    ]);
    const fromGlobal = globalDoc?.minWalletToReceiveOrders;
    if (fromGlobal !== undefined && fromGlobal !== null) {
        return Math.max(0, roundMoney(fromGlobal));
    }
    return Math.max(0, roundMoney(cashLimitDoc?.minWalletToReceiveOrders));
}

export async function syncMinWalletToReceiveOrders(amount) {
    const value = Math.max(0, roundMoney(amount));
    const cashLimit = await FoodDeliveryCashLimit.findOne({ isActive: true }).sort({
        createdAt: -1,
    });
    if (cashLimit) {
        cashLimit.minWalletToReceiveOrders = value;
        await cashLimit.save();
    }
    return value;
}

export function buildMinWalletEvaluation({
    required = 0,
    pocketBalance = 0,
} = {}) {
    const need = Math.max(0, roundMoney(required));
    const pocket = Math.max(0, roundMoney(pocketBalance));
    const eligible = need <= 0 || pocket >= need;
    const shortfall = eligible ? 0 : roundMoney(Math.max(0, need - pocket));
    return {
        minWalletToReceiveOrders: need,
        required: need,
        pocketBalance: pocket,
        canReceiveOrders: eligible,
        eligible,
        shortfall,
        isActive: need > 0,
    };
}

export function minWalletBlockMessage(evaluation) {
    const required = roundMoney(evaluation?.required ?? evaluation?.minWalletToReceiveOrders);
    const shortfall = roundMoney(evaluation?.shortfall);
    if (shortfall > 0) {
        return `Add ₹${shortfall} to your wallet to receive orders. Minimum required is ₹${required}.`;
    }
    return `Maintain at least ₹${required} in your wallet to receive orders.`;
}

export async function getPendingWithdrawalTotals(partnerIds = []) {
    const ids = [...new Set(
        (partnerIds || [])
            .map((id) => String(id || '').trim())
            .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    )].map((id) => new mongoose.Types.ObjectId(id));

    const map = new Map();
    if (!ids.length) return map;

    const rows = await FoodDeliveryWithdrawal.aggregate([
        { $match: { deliveryPartnerId: { $in: ids }, status: 'pending' } },
        { $group: { _id: '$deliveryPartnerId', total: { $sum: { $ifNull: ['$amount', 0] } } } },
    ]);

    for (const row of rows) {
        map.set(String(row._id), roundMoney(row.total));
    }
    return map;
}

export async function getPocketBalancesByPartnerIds(partnerIds = []) {
    const ids = [...new Set(
        (partnerIds || [])
            .map((id) => String(id || '').trim())
            .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    )];
    const map = new Map();
    if (!ids.length) return map;

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const [wallets, pendingMap] = await Promise.all([
        FoodDeliveryWallet.find({ deliveryPartnerId: { $in: objectIds } })
            .select('deliveryPartnerId balance')
            .lean(),
        getPendingWithdrawalTotals(ids),
    ]);

    const walletById = new Map(
        wallets.map((w) => [String(w.deliveryPartnerId), roundMoney(w.balance)]),
    );

    for (const id of ids) {
        const balance = walletById.get(id) || 0;
        const pending = pendingMap.get(id) || 0;
        map.set(id, Math.max(0, roundMoney(balance - pending)));
    }
    return map;
}

export async function evaluateDriverMinWallet(partnerId) {
    const required = await getMinWalletToReceiveOrders();
    if (!partnerId) {
        return buildMinWalletEvaluation({ required, pocketBalance: 0 });
    }
    const balances = await getPocketBalancesByPartnerIds([partnerId]);
    return buildMinWalletEvaluation({
        required,
        pocketBalance: balances.get(String(partnerId)) || 0,
    });
}

export async function filterPartnersByMinWallet(partners = []) {
    if (!partners.length) return [];
    const required = await getMinWalletToReceiveOrders();
    if (required <= 0) return partners;

    const ids = partners.map(partnerIdKey).filter(Boolean);
    const balances = await getPocketBalancesByPartnerIds(ids);
    return partners.filter((partner) => {
        const id = partnerIdKey(partner);
        if (!id) return false;
        return (balances.get(id) || 0) >= required;
    });
}

export async function assertDriverCanReceiveOrders(partnerId) {
    const evaluation = await evaluateDriverMinWallet(partnerId);
    if (evaluation.canReceiveOrders) return evaluation;
    const error = new ValidationError(minWalletBlockMessage(evaluation));
    error.code = MIN_WALLET_BLOCK_CODE;
    error.details = evaluation;
    throw error;
}

export function evaluateWithdrawalAgainstMinWallet({
    pocketBalance = 0,
    withdrawAmount = 0,
    required = 0,
} = {}) {
    const pocket = Math.max(0, roundMoney(pocketBalance));
    const amount = Math.max(0, roundMoney(withdrawAmount));
    const need = Math.max(0, roundMoney(required));
    const remaining = Math.max(0, roundMoney(pocket - amount));
    const willBlockOrders = need > 0 && remaining < need;
    return {
        willBlockOrders,
        remainingBalance: remaining,
        minWalletToReceiveOrders: need,
        withdrawAmount: amount,
        pocketBalance: pocket,
        shortfall: willBlockOrders ? roundMoney(need - remaining) : 0,
    };
}
