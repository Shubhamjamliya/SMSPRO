import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../utils/helpers.js';
import { logger } from '../../../utils/logger.js';
import { Payment } from '../../../core/payments/models/payment.model.js';
import { creditWallet } from '../../../core/payments/wallet.service.js';
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyPaymentSignature,
} from '../../food/orders/helpers/razorpay.helper.js';
import { ConstructionPackage } from '../models/constructionPackage.model.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { PackageRequest, PACKAGE_REQUEST_STATUSES } from '../models/packageRequest.model.js';
import { dispatchRequest, resendToAll } from './packageDispatch.service.js';

/**
 * A customer booking a package: choose the plan, pay the plan's visiting fee, and
 * only then have the request sent to nearby contractors.
 *
 * The rule that shapes everything here: money first, contractors second. A request
 * with a visiting fee sits in `awaiting_payment`, invisible to contractors and the
 * office's work queue, until the payment is VERIFIED. Nothing the browser says is
 * taken on trust — the fee is the package's own, and "paid" only ever follows a
 * valid Razorpay signature (or Razorpay's own webhook).
 */
const alive = { isDeleted: { $ne: true } };

/** Smallest area an estimate is ever worked out for — the same floor the customer app applies. */
const MIN_BUILT_UP_AREA = 100;

/** Razorpay will not take less than ₹1. */
const MIN_FEE_RUPEES = 1;

const audit = (action, extra) => recordAudit({
  module: 'construction',
  entityType: 'package_request',
  ...extra,
  action,
});

const reference = (id) => `#${String(id).slice(-6).toUpperCase()}`;

/** What the CUSTOMER gets back: their own booking, without internal notes or contractor bookkeeping. */
export const toCustomerView = (doc) => ({
  id: String(doc._id),
  reference: reference(doc._id),
  package: doc.package,
  site: doc.site,
  estimatedCost: doc.estimatedCost,
  visitingFee: doc.visitingFee || 0,
  startWindow: doc.startWindow,
  notes: doc.notes,
  status: doc.status,
  payment: { status: doc.payment?.status || 'not_required', amount: doc.payment?.amount || 0 },
  // Enough for the app to say the right thing after paying, and no more.
  // A commercial visit is not broadcast — the office picks the contractor.
  sentToContractors: !['not_sent', 'awaiting_admin'].includes(doc.dispatch?.state || 'not_sent'),
  awaitingAssignment: doc.dispatch?.state === 'awaiting_admin',
  noContractorsYet: doc.dispatch?.state === 'no_contractors',
  contractorAssigned: Boolean(doc.assignedContractorId),
  createdAt: doc.createdAt,
});

// ---------- Payment ----------

/** Razorpay checkout options for a request that is waiting for its visiting fee. */
const checkoutOptions = (request, { orderId, amountPaise }) => ({
  key: getRazorpayKeyId(),
  orderId,
  amount: amountPaise,
  currency: 'INR',
  name: 'Site visiting fee',
  description: `${request.package?.name || 'Package'} — visit ${reference(request._id)}`,
  notes: { requestId: String(request._id) },
});

/**
 * Create the Razorpay order for a request's visiting fee, or hand back the one it
 * already has. One order per request is enough — Razorpay lets a customer retry a
 * failed attempt on the same order — and it means a retry can never leave a second,
 * stray order that could be paid without the request knowing.
 */
const ensureVisitFeeOrder = async (request) => {
  const amountPaise = Math.round(Number(request.payment.amount) * 100);
  if (request.payment.gatewayOrderId) {
    return checkoutOptions(request, { orderId: request.payment.gatewayOrderId, amountPaise });
  }

  const order = await createRazorpayOrder(
    amountPaise,
    'INR',
    `PKG-${String(request._id).slice(-8)}`,
    { module: 'construction', type: 'package_visit_fee', requestId: String(request._id) },
  );
  await PackageRequest.updateOne(
    { _id: request._id },
    { $set: { 'payment.gatewayOrderId': order.id, 'payment.gateway': 'razorpay' } },
  );
  request.payment.gatewayOrderId = order.id;
  return checkoutOptions(request, { orderId: order.id, amountPaise });
};

/**
 * A customer selects a package.
 *
 * Returns `{ request, razorpay }`. `razorpay` is the checkout to open when there is a
 * visiting fee to pay, and null when the visit is free — in which case the request
 * has already gone out to contractors.
 */
export const createPackageRequest = async (customerId, data) => {
  const pkg = await ConstructionPackage
    .findOne({ _id: data.packageId, ...alive, status: 'active' })
    .lean();
  if (!pkg) {
    throw new ValidationError('That package is no longer available. Please choose another.');
  }

  const fee = Math.max(0, Math.round(Number(pkg.visitingFee) || 0));
  if (fee > 0 && fee < MIN_FEE_RUPEES) throw new ValidationError('Invalid visiting fee for this package');
  // Better to refuse now than take details from someone who then cannot pay.
  if (fee > 0 && !isRazorpayConfigured()) {
    throw new ValidationError('Online payment is not available right now. Please try again later.');
  }

  const totalBuiltUpArea = Math.max(MIN_BUILT_UP_AREA, data.areaPerFloor * data.floors);
  const estimatedCost = Math.round(totalBuiltUpArea * pkg.price * 100) / 100;

  const request = await PackageRequest.create({
    customerId,
    contact: data.contact,
    package: {
      packageId: pkg._id,
      segment: pkg.segment,
      name: pkg.name,
      price: pkg.price,
      unit: pkg.unit || 'per sq.ft',
    },
    site: {
      city: data.city,
      area: data.area || '',
      address: data.address || '',
      landmark: data.landmark || '',
      state: data.state || '',
      pincode: data.pincode || '',
      ...(data.location
        ? { location: { type: 'Point', coordinates: [data.location.lng, data.location.lat] } }
        : {}),
      areaPerFloor: data.areaPerFloor,
      floors: data.floors,
      totalBuiltUpArea,
    },
    estimatedCost,
    visitingFee: fee,
    payment: { status: fee > 0 ? 'pending' : 'not_required', amount: fee },
    startWindow: data.startWindow,
    notes: data.notes,
    status: fee > 0 ? 'awaiting_payment' : 'new',
  });

  await audit('package_request.created', {
    entityId: request._id,
    after: { package: pkg.name, segment: pkg.segment, estimatedCost, visitingFee: fee, city: data.city },
  });

  // A free visit goes straight to contractors.
  if (fee === 0) {
    await dispatchRequest(request._id).catch((err) => {
      logger.error(`[construction] dispatch failed for package request ${request._id}: ${err.message}`);
    });
    const fresh = await PackageRequest.findById(request._id).lean();
    return { request: toCustomerView(fresh), razorpay: null };
  }

  // A fee: open the payment. If Razorpay refuses, the request never became real, so
  // it is removed rather than left behind as an unpayable draft.
  try {
    const razorpay = await ensureVisitFeeOrder(request);
    return { request: toCustomerView(request.toObject()), razorpay };
  } catch (error) {
    await PackageRequest.deleteOne({ _id: request._id, 'payment.status': 'pending' });
    logger.error(`[construction] could not open payment for package request ${request._id}: ${error.message}`);
    throw new ValidationError('Could not start the payment. Please try again.');
  }
};

/** Re-open payment for a request the customer did not finish paying for. */
export const getPaymentCheckout = async (customerId, requestId) => {
  const request = await PackageRequest.findOne({ _id: requestId, customerId });
  if (!request) throw new ValidationError('Request not found');
  if (request.payment?.status !== 'pending') {
    throw new ValidationError('This request is not waiting for payment');
  }
  if (!isRazorpayConfigured()) {
    throw new ValidationError('Online payment is not available right now. Please try again later.');
  }
  const razorpay = await ensureVisitFeeOrder(request);
  return { request: toCustomerView(request.toObject()), razorpay };
};

/**
 * Mark a request's visiting fee as paid, then send it to contractors.
 *
 * Called by the browser after checkout (with Razorpay's signature) AND by the
 * webhook (already authenticated by Razorpay's own signature on the whole event).
 * Both may fire for the same payment, so this must be idempotent: whichever gets
 * there first claims the request with one conditional update, and the other simply
 * sees it is already paid.
 */
export const confirmVisitFeePayment = async (
  requestId,
  { orderId, paymentId, signature } = {},
  { customerId = null, viaWebhook = false } = {},
) => {
  const request = await PackageRequest.findById(requestId);
  // A customer is only ever told about their own bookings.
  if (!request || (customerId && String(request.customerId) !== String(customerId))) {
    throw new ValidationError('Request not found');
  }

  if (request.payment?.status === 'paid') {
    return toCustomerView(request.toObject());
  }
  if (request.payment?.status !== 'pending') {
    throw new ValidationError('This request is not waiting for payment');
  }

  const orderIdClean = String(orderId || '').trim();
  const paymentIdClean = String(paymentId || '').trim();
  if (!orderIdClean || !paymentIdClean) throw new ValidationError('Payment details are missing');
  if (request.payment.gatewayOrderId !== orderIdClean) {
    throw new ValidationError('That payment does not belong to this request');
  }
  // From the browser the signature is the proof. From the webhook, Razorpay already
  // signed the whole event before this was ever called.
  if (!viaWebhook && !verifyPaymentSignature(orderIdClean, paymentIdClean, String(signature || '').trim())) {
    await audit('package_request.payment_failed', {
      entityId: request._id,
      after: { reason: 'signature' },
      performedBy: { userId: request.customerId, role: 'USER', actionAt: new Date() },
    });
    throw new ValidationError('Payment verification failed');
  }

  // One Razorpay payment can pay for one request, ever.
  const reused = await PackageRequest
    .findOne({ 'payment.gatewayPaymentId': paymentIdClean, _id: { $ne: request._id } })
    .select('_id')
    .lean();
  if (reused) throw new ValidationError('That payment has already been used');

  const now = new Date();
  const claimed = await PackageRequest.findOneAndUpdate(
    { _id: request._id, 'payment.status': 'pending' },
    {
      $set: {
        'payment.status': 'paid',
        'payment.gateway': 'razorpay',
        'payment.gatewayPaymentId': paymentIdClean,
        'payment.paidAt': now,
        status: 'new',
      },
    },
    { new: true },
  );
  if (!claimed) {
    // The other path got there first. Same outcome, nothing more to do.
    const settled = await PackageRequest.findById(request._id).lean();
    return toCustomerView(settled);
  }

  // The shared financial record (BRD Rule 2: one record of every payment). Failing to
  // write it must not undo a payment that genuinely happened, so it is logged loudly.
  try {
    const record = await Payment.create({
      refType: 'construction_package_request',
      refId: claimed._id,
      userId: claimed.customerId,
      amount: claimed.payment.amount,
      method: 'razorpay',
      gateway: 'razorpay',
      gatewayOrderId: orderIdClean,
      gatewayPaymentId: paymentIdClean,
      status: 'success',
      module: 'construction',
      metadata: { type: 'package_visit_fee', package: claimed.package?.name, viaWebhook },
    });
    await PackageRequest.updateOne({ _id: claimed._id }, { $set: { 'payment.paymentRecordId': record._id } });
  } catch (error) {
    logger.error(`[construction] payment record not written for package request ${claimed._id}: ${error.message}`);
  }

  await audit('package_request.paid', {
    entityId: claimed._id,
    after: { amount: claimed.payment.amount, paymentId: paymentIdClean, viaWebhook },
    performedBy: { userId: claimed.customerId, role: 'USER', actionAt: now },
  });

  // Only now — with the money verified — does the request go out.
  await dispatchRequest(claimed._id).catch((err) => {
    logger.error(`[construction] dispatch failed for package request ${claimed._id}: ${err.message}`);
  });

  const fresh = await PackageRequest.findById(claimed._id).lean();
  return toCustomerView(fresh);
};

// ---------- Admin ----------

/**
 * Paid requests with nobody on them that the office has to place: every commercial
 * visit, and any residential one that nobody accepted (or nobody covers).
 */
const NEEDS_ASSIGNMENT = {
  assignedContractorId: null,
  status: { $nin: ['awaiting_payment', 'lost'] },
  'payment.status': { $ne: 'refunded' },
  'dispatch.state': { $in: ['awaiting_admin', 'unassigned', 'no_contractors'] },
};

/**
 * The quotations view of the requests: a quotation exists once the contractor's site visit
 * report is in. 'awaiting' = report in, nothing sent yet; the rest are the contract's status.
 */
const quotationFilter = (kind) => {
  if (kind === 'all') return { 'visit.stage': 'report_submitted' };
  if (kind === 'awaiting') {
    return { 'visit.stage': 'report_submitted', 'contract.status': { $in: ['none', null] } };
  }
  if (['sent', 'accepted', 'rejected'].includes(kind)) return { 'contract.status': kind };
  return {};
};

export const listPackageRequests = async (query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = {};
  if (PACKAGE_REQUEST_STATUSES.includes(query.status)) filter.status = query.status;
  if (['residential', 'commercial'].includes(query.segment)) filter['package.segment'] = query.segment;
  if (query.needsAssignment === 'true') Object.assign(filter, NEEDS_ASSIGNMENT);
  Object.assign(filter, quotationFilter(query.quotation));

  const [docs, total] = await Promise.all([
    PackageRequest
      .find(filter)
      .populate('assignedContractorId', 'businessName ownerName phone contractorCode')
      // Who was actually asked, and how each answered — the first thing the office needs
      // when a customer says nobody has come back to them.
      .populate('offers.contractorId', 'businessName phone')
      // The quotations list reads best by what changed last; the requests list by when it arrived.
      .sort(query.quotation ? { updatedAt: -1 } : { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PackageRequest.countDocuments(filter),
  ]);

  const rows = docs.map((doc) => {
    const offers = doc.offers || [];
    const count = (status) => offers.filter((o) => o.status === status).length;
    return {
      ...doc,
      // Requests made before payments existed have no payment block at all.
      payment: { ...doc.payment, status: doc.payment?.status || 'not_required' },
      offerSummary: {
        total: offers.length,
        offered: count('offered'),
        declined: count('declined'),
        expired: count('expired'),
      },
    };
  });
  return buildPaginatedResult({ docs: rows, total, page, limit });
};

/** Quotation tab counts: how many are still to write, sent, accepted, declined. */
const quotationCounts = async (scope) => {
  const rows = await PackageRequest.aggregate([
    { $match: { ...scope, 'visit.stage': 'report_submitted' } },
    { $group: { _id: { $ifNull: ['$contract.status', 'none'] }, total: { $sum: 1 } } },
  ]);
  const out = { awaiting: 0, sent: 0, accepted: 0, rejected: 0 };
  rows.forEach((row) => {
    const key = row._id === 'none' ? 'awaiting' : row._id;
    if (key in out) out[key] += row.total;
  });
  return { ...out, all: Object.values(out).reduce((a, b) => a + b, 0) };
};

/** Counts per status, for the filter tabs. */
export const packageRequestCounts = async (segment = '') => {
  const scope = ['residential', 'commercial'].includes(segment) ? { 'package.segment': segment } : {};
  const [rows, needsAssignment] = await Promise.all([
    PackageRequest.aggregate([{ $match: scope }, { $group: { _id: '$status', total: { $sum: 1 } } }]),
    PackageRequest.countDocuments({ ...NEEDS_ASSIGNMENT, ...scope }),
  ]);
  const counts = Object.fromEntries(PACKAGE_REQUEST_STATUSES.map((s) => [s, 0]));
  rows.forEach((row) => { if (row._id in counts) counts[row._id] = row.total; });
  return { ...counts, needsAssignment, quotations: await quotationCounts(scope) };
};

export const updatePackageRequestStatus = async (id, { status, adminNote }, reqUser = null) => {
  const request = await PackageRequest.findById(id);
  if (!request) throw new ValidationError('Request not found');
  if (request.status === 'awaiting_payment') {
    throw new ValidationError('This request has not been paid for yet, so it cannot be worked on');
  }

  const before = { status: request.status };
  const performer = extractPerformer(reqUser);
  request.status = status;
  if (adminNote !== undefined) request.adminNote = adminNote;
  request.updatedBy = performer;
  await request.save();

  await audit('package_request.status_changed', {
    entityId: request._id,
    before,
    after: { status },
    performedBy: performer,
  });
  return request.toObject();
};

/**
 * The office's "send it again" button: offer a paid request to EVERY contractor who
 * covers the customer's area, reminding those who were already asked and have not
 * answered. See resendToAll for exactly who is included.
 */
export const redispatchPackageRequest = async (id, reqUser = null) => {
  const request = await PackageRequest.findById(id).select('payment status assignedContractorId').lean();
  if (!request) throw new ValidationError('Request not found');
  if (request.assignedContractorId) throw new ValidationError('A contractor has already taken this request');
  if (request.payment?.status === 'refunded') throw new ValidationError('The visiting fee has been refunded');

  const result = await resendToAll(id); // refuses unpaid itself
  await audit('package_request.redispatched', {
    entityId: id,
    after: result,
    performedBy: extractPerformer(reqUser),
  });
  return result;
};

/**
 * Give the visiting fee back — as a credit to the customer's wallet.
 *
 * The status flip is claimed with one conditional update BEFORE any money moves, so
 * pressing the button twice cannot credit the customer twice. If the credit itself
 * fails the flip is undone, so a failed refund is never recorded as done.
 */
export const refundVisitingFee = async (id, { reason }, reqUser = null) => {
  const now = new Date();
  const claimed = await PackageRequest.findOneAndUpdate(
    { _id: id, 'payment.status': 'paid', 'payment.amount': { $gt: 0 } },
    {
      $set: {
        'payment.status': 'refunded',
        'payment.refundedAt': now,
        'payment.refundNote': reason,
      },
    },
    { new: true },
  );
  if (!claimed) {
    const existing = await PackageRequest.findById(id).select('payment').lean();
    if (!existing) throw new ValidationError('Request not found');
    if (existing.payment?.status === 'refunded') throw new ValidationError('The visiting fee has already been refunded');
    throw new ValidationError('There is no paid visiting fee to refund on this request');
  }

  try {
    await creditWallet({
      entityType: 'user',
      entityId: String(claimed.customerId),
      amount: claimed.payment.amount,
      description: `Refund: site visiting fee ${reference(claimed._id)}`,
      category: 'other',
      paymentId: claimed.payment.paymentRecordId || null,
      metadata: { type: 'package_visit_fee_refund', requestId: String(claimed._id), reason },
      module: 'construction',
      countAsEarning: false,
    });
  } catch (error) {
    await PackageRequest.updateOne(
      { _id: id, 'payment.status': 'refunded' },
      { $set: { 'payment.status': 'paid', 'payment.refundedAt': null, 'payment.refundNote': '' } },
    );
    logger.error(`[construction] visiting fee refund failed for ${id}: ${error.message}`);
    throw new ValidationError('The refund could not be completed. Nothing was changed — please try again.');
  }

  // A refunded booking is over: stop asking contractors, and close it unless it was already won.
  await PackageRequest.updateOne(
    { _id: id },
    { $set: { 'offers.$[o].status': 'withdrawn', 'offers.$[o].respondedAt': now } },
    { arrayFilters: [{ 'o.status': 'offered' }] },
  );
  if (claimed.status !== 'won') {
    await PackageRequest.updateOne({ _id: id }, { $set: { status: 'lost' } });
  }
  if (claimed.payment.paymentRecordId) {
    await Payment.updateOne({ _id: claimed.payment.paymentRecordId }, { $set: { status: 'refunded' } })
      .catch((err) => logger.error(`[construction] payment record not marked refunded: ${err.message}`));
  }

  await audit('package_request.fee_refunded', {
    entityId: id,
    after: { amount: claimed.payment.amount, reason },
    performedBy: extractPerformer(reqUser),
  });
  return PackageRequest.findById(id).lean();
};

// Registered so `.populate('assignedContractorId')` always resolves, whatever loaded first.
void ContractorProfile;
