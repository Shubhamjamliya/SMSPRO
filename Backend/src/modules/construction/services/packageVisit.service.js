import crypto from 'node:crypto';
import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { logger } from '../../../utils/logger.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { PackageRequest, MAX_OTP_ATTEMPTS } from '../models/packageRequest.model.js';
import { notify, notifyAdmins } from './notify.service.js';
import { toContractorView } from './packageDispatch.service.js';

/**
 * The site visit itself, after a contractor has the request:
 *
 *   start journey -> customer is told, and sees an OTP
 *   arrive        -> customer reads the OTP out, contractor types it in
 *   report        -> measurements and photos go to the office
 *   contract      -> the office sends a price and terms; the customer accepts or declines
 *
 * Every step is ONE conditional update keyed on the stage it expects, so a double tap, a
 * retry or two devices cannot move a request twice or skip a stage. Notifications are best
 * effort and never undo the step that raised them.
 */
const STAGE_LABEL = {
  assigned: 'Contractor assigned',
  on_the_way: 'Contractor is on the way',
  arrived: 'Contractor is at your site',
  report_submitted: 'Site visit complete',
};

const audit = (action, extra) => recordAudit({
  module: 'construction',
  entityType: 'package_request',
  ...extra,
  action,
});

const reference = (id) => `#${String(id).slice(-6).toUpperCase()}`;

const segmentPath = (request) => `/admin/construction/end-to-end/${
  request?.package?.segment === 'commercial' ? 'commercial' : 'residential'
}/requests`;

const customerLink = (id) => `/construction/site-visits/${id}`;
const quotationLink = (id) => `/construction/quotations/visit/${id}`;
const contractorLink = (id) => `/contractor/package-requests/${id}`;

/** Requests made before this feature carry no `visit` block at all: read that as "assigned". */
const stageOf = (doc) => doc?.visit?.stage || 'assigned';

/** Matches both a stored 'assigned' and a document that predates the field. */
const atStage = (stage) => (stage === 'assigned' ? { $in: ['assigned', null] } : stage);

const newOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const point = (location, now) => (
  location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    ? { lat: location.lat, lng: location.lng, at: now }
    : null
);

/** The request as its ASSIGNED contractor may work on it — anyone else is told it is not theirs. */
const ownRequest = async (contractorId, requestId, select = '') => {
  const request = await PackageRequest
    .findOne({ _id: requestId, assignedContractorId: contractorId })
    .select(select)
    .lean();
  if (!request) throw new ValidationError('This request is not assigned to you');
  return request;
};

const tell = (payload) => notify({ source: 'NEW_LEAD', ...payload }).catch(() => {});

// ---------- Contractor: the booking page ----------

const reportView = (report) => (report ? { ...report } : null);

/** One request as its contractor sees it, with the visit and quotation state. Assumes it is theirs. */
const contractorDetailView = (request, contractorId) => {
  const view = toContractorView(request, contractorId);
  if (!view.assignedToMe) return { ...view, visit: null, contract: null };

  return {
    ...view,
    assignedBy: request.assignedBy || 'contractor',
    assignedAt: request.assignedAt || null,
    payment: { status: request.payment?.status || 'not_required', paidAt: request.payment?.paidAt || null },
    visit: {
      stage: stageOf(request),
      startedAt: request.visit?.startedAt || null,
      arrivedAt: request.visit?.arrivedAt || null,
      // Attempts are surfaced so the screen can say how many tries are left, never the code.
      otpAttemptsLeft: Math.max(0, MAX_OTP_ATTEMPTS - (request.visit?.otp?.attempts || 0)),
      report: reportView(request.visit?.report),
    },
    contract: request.contract?.status && request.contract.status !== 'none'
      ? {
        status: request.contract.status,
        number: request.contract.number,
        price: request.contract.price,
        advanceAmount: request.contract.advanceAmount || 0,
        durationDays: request.contract.durationDays ?? null,
        sentAt: request.contract.sentAt,
        validUntil: request.contract.validUntil || null,
        respondedAt: request.contract.respondedAt,
      }
      : null,
  };
};

/** Everything the contractor's booking page needs. Customer details only once it is theirs. */
export const getContractorRequestDetail = async (contractorId, requestId) => {
  const request = await PackageRequest.findById(requestId).lean();
  const mine = request?.offers?.find((o) => String(o.contractorId) === String(contractorId));
  if (!request || !mine) throw new ValidationError('This request is not available to you');
  return contractorDetailView(request, contractorId);
};

/**
 * The contractor's site visits: every package request assigned to them, in progress or finished,
 * with the customer, the exact place, the timeline, the report and the quotation — the whole
 * record in one read. Newest assignment first.
 */
export const listContractorAssignedVisits = async (contractorId) => {
  const requests = await PackageRequest
    .find({ assignedContractorId: contractorId })
    .sort({ assignedAt: -1, createdAt: -1 })
    .limit(100)
    .lean();
  return requests.map((request) => contractorDetailView(request, contractorId));
};

// ---------- Contractor: start journey ----------

export const startJourney = async (contractorId, requestId, { location } = {}) => {
  const now = new Date();
  const code = newOtp();

  const updated = await PackageRequest.findOneAndUpdate(
    {
      _id: requestId,
      assignedContractorId: contractorId,
      'visit.stage': atStage('assigned'),
      // A refunded booking is closed: no one should be sent to that site.
      'payment.status': { $ne: 'refunded' },
    },
    {
      $set: {
        'visit.stage': 'on_the_way',
        'visit.startedAt': now,
        'visit.startLocation': point(location, now),
        'visit.otp.code': code,
        'visit.otp.issuedAt': now,
        'visit.otp.attempts': 0,
      },
    },
    { new: true },
  ).lean();

  if (!updated) {
    const existing = await ownRequest(contractorId, requestId, 'visit payment');
    if (existing.payment?.status === 'refunded') {
      throw new ValidationError('This booking was cancelled and the visiting fee refunded');
    }
    throw new ValidationError(
      stageOf(existing) === 'on_the_way'
        ? 'You have already started this journey'
        : 'This visit has already been done',
    );
  }

  const name = await ContractorProfile.findById(contractorId).select('businessName').lean();
  tell({
    ownerType: 'USER',
    ownerId: String(updated.customerId),
    title: 'Your contractor is on the way',
    message: `${name?.businessName || 'Your contractor'} is heading to your site. Share the visit OTP with them when they arrive.`,
    link: customerLink(requestId),
    metadata: { packageRequestId: String(requestId), stage: 'on_the_way' },
  });

  await audit('package_request.journey_started', {
    entityId: requestId,
    performedBy: { userId: contractorId, role: 'CONTRACTOR', actionAt: now },
  });
  return getContractorRequestDetail(contractorId, requestId);
};

// ---------- Contractor: confirm arrival with the customer's OTP ----------

export const confirmArrival = async (contractorId, requestId, { otp, location } = {}) => {
  const request = await PackageRequest
    .findOne({ _id: requestId, assignedContractorId: contractorId })
    .select('+visit.otp.code')
    .lean();
  if (!request) throw new ValidationError('This request is not assigned to you');

  const stage = stageOf(request);
  if (stage === 'assigned') throw new ValidationError('Start the journey first');
  if (stage !== 'on_the_way') throw new ValidationError('You have already confirmed this visit');

  const attempts = request.visit?.otp?.attempts || 0;
  if (attempts >= MAX_OTP_ATTEMPTS) {
    throw new ValidationError('Too many wrong attempts. Ask the customer to generate a new OTP.');
  }

  if (!request.visit?.otp?.code || !safeEqual(request.visit.otp.code, otp)) {
    // Counted with one atomic increment so two rapid guesses cannot both slip under the limit.
    const after = await PackageRequest.findOneAndUpdate(
      { _id: requestId, 'visit.stage': 'on_the_way' },
      { $inc: { 'visit.otp.attempts': 1 } },
      { new: true },
    ).select('visit.otp.attempts').lean();
    const left = Math.max(0, MAX_OTP_ATTEMPTS - (after?.visit?.otp?.attempts ?? attempts + 1));
    throw new ValidationError(
      left > 0
        ? `That OTP is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Too many wrong attempts. Ask the customer to generate a new OTP.',
    );
  }

  const now = new Date();
  const claimed = await PackageRequest.findOneAndUpdate(
    { _id: requestId, assignedContractorId: contractorId, 'visit.stage': 'on_the_way' },
    {
      $set: {
        'visit.stage': 'arrived',
        'visit.arrivedAt': now,
        'visit.arrivalLocation': point(location, now),
        'visit.report': { status: 'draft' },
      },
      $unset: { 'visit.otp.code': '' },
    },
    { new: true },
  ).lean();
  if (!claimed) throw new ValidationError('You have already confirmed this visit');

  tell({
    ownerType: 'USER',
    ownerId: String(request.customerId),
    title: 'Site visit started',
    message: 'Your contractor has confirmed arrival and is measuring the site now.',
    link: customerLink(requestId),
    metadata: { packageRequestId: String(requestId), stage: 'arrived' },
  });
  await audit('package_request.arrival_confirmed', {
    entityId: requestId,
    performedBy: { userId: contractorId, role: 'CONTRACTOR', actionAt: now },
  });
  return getContractorRequestDetail(contractorId, requestId);
};

// ---------- Contractor: the site visit report ----------

/**
 * Save the report as a draft, or send it. Only open after arrival is confirmed and closed
 * for good once submitted — the office prices the job from what was sent, so it must not
 * change underneath them.
 */
export const saveVisitReport = async (contractorId, requestId, { report, submit }) => {
  const now = new Date();
  const set = Object.fromEntries(
    Object.entries({ ...report, status: submit ? 'submitted' : 'draft', savedAt: now })
      .map(([k, v]) => [`visit.report.${k}`, v]),
  );
  if (submit) {
    set['visit.report.submittedAt'] = now;
    set['visit.stage'] = 'report_submitted';
  }

  const updated = await PackageRequest.findOneAndUpdate(
    { _id: requestId, assignedContractorId: contractorId, 'visit.stage': 'arrived' },
    { $set: set },
    { new: true },
  ).lean();

  if (!updated) {
    const existing = await ownRequest(contractorId, requestId, 'visit');
    const stage = stageOf(existing);
    if (stage === 'report_submitted') throw new ValidationError('This report has already been sent to the office');
    throw new ValidationError('Confirm your arrival with the customer\'s OTP before filling the report');
  }

  if (submit) {
    const ref = reference(requestId);
    notifyAdmins({
      source: 'NEW_LEAD',
      title: 'Site visit report received',
      message: `${updated.package?.name || 'Package'} in ${updated.site?.city} (${ref}) — review it and send the customer a contract.`,
      link: segmentPath(updated),
      metadata: { packageRequestId: String(requestId), segment: updated.package?.segment || '' },
    }).catch(() => {});
    tell({
      ownerType: 'USER',
      ownerId: String(updated.customerId),
      title: 'Site visit complete',
      message: 'Your contractor has sent the site report to our team. We will share a contract with you soon.',
      link: customerLink(requestId),
      metadata: { packageRequestId: String(requestId), stage: 'report_submitted' },
    });
    await audit('package_request.report_submitted', {
      entityId: requestId,
      after: { photos: report.photos.length },
      performedBy: { userId: contractorId, role: 'CONTRACTOR', actionAt: now },
    });
  }
  return getContractorRequestDetail(contractorId, requestId);
};

// ---------- Customer ----------

const contractView = (contract) => (
  contract?.status && contract.status !== 'none'
    ? {
      status: contract.status,
      number: contract.number,
      revision: contract.revision,
      price: contract.price,
      advanceAmount: contract.advanceAmount || 0,
      durationDays: contract.durationDays,
      scope: contract.scope || '',
      terms: contract.terms || '',
      sentAt: contract.sentAt,
      validUntil: contract.validUntil,
      respondedAt: contract.respondedAt,
      responseNote: contract.responseNote || '',
      expired: Boolean(contract.status === 'sent' && contract.validUntil && new Date(contract.validUntil) < new Date()),
    }
    : null
);

const publicReport = (r) => ({
  plotAreaSqft: r.plotAreaSqft ?? null,
  builtUpAreaSqft: r.builtUpAreaSqft ?? null,
  floorsPlanned: r.floorsPlanned ?? null,
  measurements: r.measurements || '',
  siteCondition: r.siteCondition || '',
  access: r.access || '',
  waterAvailable: r.waterAvailable ?? null,
  electricityAvailable: r.electricityAvailable ?? null,
  recommendedScope: r.recommendedScope || '',
  estimatedDurationDays: r.estimatedDurationDays ?? null,
  observations: r.observations || '',
  photos: r.photos || [],
  submittedAt: r.submittedAt || null,
});

/** A booking as the CUSTOMER follows it: stage, contractor, OTP while it is needed, contract. */
const toCustomerDetail = async (doc) => {
  const contractor = doc.assignedContractorId
    ? await ContractorProfile.findById(doc.assignedContractorId).select('businessName ownerName phone').lean()
    : null;
  const stage = doc.assignedContractorId ? stageOf(doc) : null;

  return {
    id: String(doc._id),
    reference: reference(doc._id),
    package: doc.package,
    site: doc.site,
    estimatedCost: doc.estimatedCost,
    visitingFee: doc.visitingFee || 0,
    startWindow: doc.startWindow,
    status: doc.status,
    payment: { status: doc.payment?.status || 'not_required', amount: doc.payment?.amount || 0 },
    createdAt: doc.createdAt,
    // 'finding' = nobody yet, 'awaiting_assignment' = the office is choosing (commercial / nobody accepted).
    dispatchState: doc.dispatch?.state || 'not_sent',
    contractor: contractor
      ? { name: contractor.businessName, owner: contractor.ownerName || '', phone: contractor.phone || '' }
      : null,
    visit: stage
      ? {
        stage,
        label: STAGE_LABEL[stage],
        startedAt: doc.visit?.startedAt || null,
        arrivedAt: doc.visit?.arrivedAt || null,
        reportSubmittedAt: doc.visit?.report?.submittedAt || null,
        // What the contractor found, once it has been sent. The note for the office stays internal.
        report: doc.visit?.report?.status === 'submitted' ? publicReport(doc.visit.report) : null,
        // Only while the contractor is travelling — and only ever to the customer.
        otp: stage === 'on_the_way' ? doc.visit?.otp?.code || null : null,
        otpLocked: stage === 'on_the_way' && (doc.visit?.otp?.attempts || 0) >= MAX_OTP_ATTEMPTS,
      }
      : null,
    contract: contractView(doc.contract),
  };
};

export const listCustomerRequests = async (customerId) => {
  const docs = await PackageRequest
    .find({ customerId })
    .select('+visit.otp.code')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return Promise.all(docs.map(toCustomerDetail));
};

export const getCustomerRequest = async (customerId, requestId) => {
  const doc = await PackageRequest
    .findOne({ _id: requestId, customerId })
    .select('+visit.otp.code')
    .lean();
  if (!doc) throw new ValidationError('Request not found');
  return toCustomerDetail(doc);
};

/** A new OTP — for when it was lost, or the contractor used up their attempts. */
export const regenerateOtp = async (customerId, requestId) => {
  const updated = await PackageRequest.findOneAndUpdate(
    { _id: requestId, customerId, 'visit.stage': 'on_the_way' },
    {
      $set: {
        'visit.otp.code': newOtp(),
        'visit.otp.issuedAt': new Date(),
        'visit.otp.attempts': 0,
      },
    },
  ).select('_id').lean();
  if (!updated) throw new ValidationError('There is no visit waiting for an OTP');
  return getCustomerRequest(customerId, requestId);
};

// ---------- Office: the contract ----------

export const sendContract = async (requestId, data, reqUser = null) => {
  const request = await PackageRequest.findById(requestId).select('visit contract package site customerId assignedContractorId').lean();
  if (!request) throw new ValidationError('Request not found');
  if (stageOf(request) !== 'report_submitted' || !request.assignedContractorId) {
    throw new ValidationError('A contract can only be sent once the contractor has submitted the site visit report');
  }
  if (request.contract?.status === 'accepted') {
    throw new ValidationError('The customer has already accepted a contract for this request');
  }

  const now = new Date();
  const revision = (request.contract?.revision || 0) + 1;
  const number = `CON-${String(requestId).slice(-6).toUpperCase()}${revision > 1 ? `-R${revision}` : ''}`;
  const validUntil = new Date(now.getTime() + data.validDays * 24 * 60 * 60 * 1000);
  const performer = extractPerformer(reqUser);

  // Not accepted yet, checked again in the write so a customer accepting this very moment wins.
  const updated = await PackageRequest.findOneAndUpdate(
    { _id: requestId, 'contract.status': { $ne: 'accepted' } },
    {
      $set: {
        contract: {
          status: 'sent',
          number,
          revision,
          price: data.price,
          advanceAmount: data.advanceAmount,
          durationDays: data.durationDays,
          scope: data.scope,
          terms: data.terms,
          sentAt: now,
          validUntil,
          respondedAt: null,
          responseNote: '',
        },
        status: 'quoted',
        updatedBy: performer,
      },
    },
    { new: true },
  ).lean();
  if (!updated) throw new ValidationError('The customer has already accepted a contract for this request');

  tell({
    ownerType: 'USER',
    ownerId: String(request.customerId),
    title: 'Your contract is ready',
    message: `${updated.package?.name || 'Package'} — ₹${Number(data.price).toLocaleString('en-IN')}. Review the price and terms and accept to go ahead.`,
    link: quotationLink(requestId),
    metadata: { packageRequestId: String(requestId), stage: 'contract_sent' },
  });
  tell({
    ownerType: 'CONTRACTOR',
    ownerId: String(request.assignedContractorId),
    title: 'Contract sent to the customer',
    message: `The office has sent ${number} for the ${updated.site?.city} site. You will be told when they respond.`,
    link: contractorLink(requestId),
    metadata: { packageRequestId: String(requestId) },
  });
  await audit('package_request.contract_sent', {
    entityId: requestId,
    after: { number, price: data.price, revision },
    performedBy: performer,
  });
  return updated;
};

// ---------- Customer: accept or decline the contract ----------

const respond = async (customerId, requestId, accept, { note = '' } = {}) => {
  const now = new Date();
  const updated = await PackageRequest.findOneAndUpdate(
    {
      _id: requestId,
      customerId,
      'contract.status': 'sent',
      // An offer that lapsed can no longer be accepted; the office has to send it again.
      ...(accept ? { 'contract.validUntil': { $gt: now } } : {}),
    },
    {
      $set: {
        'contract.status': accept ? 'accepted' : 'rejected',
        'contract.respondedAt': now,
        'contract.responseNote': note,
        ...(accept ? { status: 'won' } : {}),
      },
    },
    { new: true },
  ).lean();

  if (!updated) {
    const existing = await PackageRequest.findOne({ _id: requestId, customerId }).select('contract').lean();
    if (!existing) throw new ValidationError('Request not found');
    if (existing.contract?.status === 'sent') {
      throw new ValidationError('This contract has expired. Ask our team to send it again.');
    }
    throw new ValidationError(
      existing.contract?.status === 'accepted' || existing.contract?.status === 'rejected'
        ? `You have already ${existing.contract.status === 'accepted' ? 'accepted' : 'declined'} this contract`
        : 'There is no contract waiting for your answer',
    );
  }

  const ref = reference(requestId);
  notifyAdmins({
    source: 'NEW_LEAD',
    title: accept ? 'Contract accepted' : 'Contract declined',
    message: accept
      ? `${updated.contact?.name} accepted ${updated.contract.number} (${ref}) for ₹${Number(updated.contract.price).toLocaleString('en-IN')}.`
      : `${updated.contact?.name} declined ${updated.contract.number} (${ref})${note ? `: ${note}` : '.'}`,
    link: segmentPath(updated),
    metadata: { packageRequestId: String(requestId), segment: updated.package?.segment || '' },
  }).catch(() => {});
  if (updated.assignedContractorId) {
    tell({
      ownerType: 'CONTRACTOR',
      ownerId: String(updated.assignedContractorId),
      title: accept ? 'The customer accepted the contract' : 'The customer declined the contract',
      message: accept
        ? `${updated.contract.number} was accepted for the ${updated.site?.city} site. The office will be in touch about starting work.`
        : `${updated.contract.number} was declined. The office will follow up with the customer.`,
      link: contractorLink(requestId),
      metadata: { packageRequestId: String(requestId) },
    });
  }
  await audit(accept ? 'package_request.contract_accepted' : 'package_request.contract_declined', {
    entityId: requestId,
    after: { number: updated.contract.number, note },
    performedBy: { userId: customerId, role: 'USER', actionAt: now },
  });
  logger.info(`[construction] contract ${updated.contract.number} ${accept ? 'accepted' : 'declined'}`);
  return getCustomerRequest(customerId, requestId);
};

export const acceptContract = (customerId, requestId, body) => respond(customerId, requestId, true, body);
export const declineContract = (customerId, requestId, body) => respond(customerId, requestId, false, body);
