import crypto from 'crypto';

import Razorpay from 'razorpay';

import { config } from '../../../../config/env.js';

function normalizeCredential(value) {
    if (value == null) return '';
    return String(value).trim().replace(/^['"]|['"]$/g, '');
}

function getCredentials() {
    // Read at call-time so credentials stay in sync with config/env.
    const keyId = normalizeCredential(config.razorpayKeyId || process.env.RAZORPAY_KEY_ID);
    const keySecret = normalizeCredential(config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET);
    return { keyId, keySecret };
}

function razorpayApiErrorMessage(err) {
    const description =
        err?.error?.description ||
        err?.description ||
        err?.message ||
        (typeof err === 'string' ? err : null);
    return description || 'Payment gateway error';
}

export function isRazorpayConfigured() {
    const { keyId, keySecret } = getCredentials();
    return Boolean(keyId && keySecret && Razorpay);
}

export function getRazorpayKeyId() {
    return getCredentials().keyId;
}

export function getRazorpayInstance() {
    if (!isRazorpayConfigured()) return null;
    const { keyId, keySecret } = getCredentials();
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * Create a Razorpay order.
 * @param {number} amountPaise
 * @param {string} [currency='INR']
 * @param {string} [receipt=''] - max 40 chars (Razorpay limit)
 * @param {Record<string, string|number>} [notes={}] - forwarded to Razorpay (used by webhooks)
 */
export function createRazorpayOrder(amountPaise, currency = 'INR', receipt = '', notes = {}) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));

    const safeReceipt = receipt ? String(receipt).slice(0, 40) : undefined;
    const payload = {
        amount: Math.round(Number(amountPaise) || 0),
        currency: currency || 'INR',
        receipt: safeReceipt,
    };

    if (notes && typeof notes === 'object' && Object.keys(notes).length > 0) {
        // Razorpay notes values must be strings.
        const normalizedNotes = {};
        for (const [k, v] of Object.entries(notes)) {
            if (v == null) continue;
            normalizedNotes[String(k)] = String(v).slice(0, 256);
        }
        if (Object.keys(normalizedNotes).length > 0) {
            payload.notes = normalizedNotes;
        }
    }

    return instance.orders.create(payload).catch((err) => {
        const message = razorpayApiErrorMessage(err);
        const wrapped = new Error(message);
        wrapped.cause = err;
        wrapped.statusCode = err?.statusCode || err?.status;
        throw wrapped;
    });
}

export function createPaymentLink({
    amountPaise,
    currency = 'INR',
    description,
    orderId,
    customerName,
    customerEmail,
    customerPhone,
    notes = {},
}) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    const payload = {
        amount: Math.round(amountPaise),
        currency,
        description: description || `Order ${orderId}`,
        customer: {
            name: customerName || 'Customer',
            email: customerEmail || 'customer@example.com',
            contact: customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '9999999999',
        },
    };
    if (notes && typeof notes === 'object' && Object.keys(notes).length > 0) {
        const normalizedNotes = {};
        for (const [k, v] of Object.entries(notes)) {
            if (v == null) continue;
            normalizedNotes[String(k)] = String(v).slice(0, 256);
        }
        if (Object.keys(normalizedNotes).length) payload.notes = normalizedNotes;
    }
    return instance.paymentLink.create(payload);
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
    const { keySecret } = getCredentials();
    if (!keySecret || !orderId || !paymentId || !signature) return false;
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
    } catch {
        return expected === signature;
    }
}

export function verifySubscriptionSignature(subscriptionId, paymentId, signature) {
    const { keySecret } = getCredentials();
    if (!keySecret || !subscriptionId || !paymentId || !signature) return false;
    const body = `${paymentId}|${subscriptionId}`;
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
    } catch {
        return expected === signature;
    }
}

export async function fetchRazorpayOrder(orderId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!orderId) throw new Error('orderId is required');
    return instance.orders.fetch(String(orderId));
}

/**
 * Fetch Razorpay payment (server-side) for additional validation (amount/status/order match).
 * @param {string} paymentId
 */
export async function fetchRazorpayPayment(paymentId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentId) throw new Error('paymentId is required');
    return instance.payments.fetch(String(paymentId));
}

/**
 * Fetch Razorpay payment-link to check status (used for Razorpay QR auto verification).
 * @param {string} paymentLinkId
 */
export async function fetchRazorpayPaymentLink(paymentLinkId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentLinkId) throw new Error('paymentLinkId is required');
    return instance.paymentLink.fetch(String(paymentLinkId));
}

/**
 * Create a Razorpay Plan for recurring subscriptions.
 * @param {Object} data - Plan details
 */
export async function createRazorpayPlan({ name, description, amountPaise, interval, period }) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    
    // period: 'daily' | 'weekly' | 'monthly' | 'yearly'
    return instance.plans.create({
        period: period.toLowerCase(),
        interval: Number(interval) || 1,
        item: {
            name,
            description: description || `Subscription Plan: ${name}`,
            amount: Math.round(amountPaise),
            currency: 'INR'
        }
    });
}

/**
 * Create a Razorpay Subscription for a user.
 * @param {Object} data - Subscription details
 */
export async function createRazorpaySubscription({ planId, totalCount, customerNotes = {} }) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');

    return instance.subscriptions.create({
        plan_id: planId,
        total_count: Number(totalCount) || 12, // Default 1 year of cycles if not specified
        quantity: 1,
        customer_notify: 1,
        notes: {
            type: 'subscription',
            ...customerNotes
        }
    });
}

/**
 * Cancel an active Razorpay Subscription.
 * @param {string} subscriptionId
 * @param {boolean} atCycleEnd - If true, cancels at end of current period
 */
export async function cancelRazorpaySubscription(subscriptionId, atCycleEnd = true) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');

    return instance.subscriptions.cancel(subscriptionId, !!atCycleEnd);
}

/**
 * Fetch Razorpay Subscription details.
 * @param {string} subscriptionId
 */
export async function fetchRazorpaySubscription(subscriptionId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');

    return instance.subscriptions.fetch(subscriptionId);
}

/**
 * Initiate a refund for a successful payment.
 * @param {string} paymentId - Original Razorpay payment_id (captured)
 * @param {number} amount - Amount to refund (in major unit, e.g., INR 123.45)
 */
export async function initiateRazorpayRefund(paymentId, amount) {
    if (!isRazorpayConfigured()) {
        throw new Error('Razorpay is not configured on this server');
    }
    const instance = getRazorpayInstance();
    try {
        const refund = await instance.payments.refund(paymentId, {
            amount: Math.round(Number(amount) * 100), // convert to paise
            notes: {
                reason: 'Order cancelled by system flow',
                at: new Date().toISOString()
            }
        });
        return {
            success: true,
            refundId: refund.id,
            status: refund.status || 'processed',
            raw: refund
        };
    } catch (err) {
        console.error(`Razorpay Refund API Failure [PaymentId: ${paymentId}]:`, err?.message || err);
        return {
            success: false,
            error: err?.message || 'Razorpay refund API error',
            status: 'failed'
        };
    }
}
