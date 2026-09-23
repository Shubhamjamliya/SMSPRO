import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * PackageRequest — a customer booking a Residential or Commercial package on the
 * End-to-End screen, from choosing the plan to a contractor taking the site visit.
 * Also covers a Budget Friendly service booked the same way (`package.sourceModel:
 * 'ConstructionBudgetService'`, `package.segment: 'budget_service'`) — the whole
 * site-visit-to-contract flow below is shared, not duplicated per catalogue.
 *
 * The life of one request:
 *
 *   1. The customer picks a plan and fills in the details.
 *   2. If the plan has a visiting fee, the request waits in `awaiting_payment`
 *      until that fee has been paid AND verified. Nothing is sent to anyone before
 *      that: an unpaid request is only a draft.
 *   3. Once paid it becomes `new` and is offered to nearby contractors (`offers`).
 *   4. The first contractor to accept is `assignedContractorId`; the other offers
 *      are withdrawn.
 *   5. The office follows the customer up from there (contacted → quoted → won/lost).
 *
 * It is a lead, not an enquiry: an enquiry belongs to a catalogue service and runs
 * through contractor matching by trade and quotations, whereas a package is a
 * headline rate the customer has already picked. Keeping the two apart also means
 * this flow depends on nothing in the service catalogue.
 *
 * The package's name, rate, visiting fee and the estimate are SNAPSHOTS taken when
 * the request is made. Packages get repriced and removed, and the request must keep
 * saying what the customer was actually shown and charged.
 */
export const PACKAGE_REQUEST_STATUSES = [
  'awaiting_payment',
  'new',
  'contacted',
  'quoted',
  'won',
  'lost',
];

/** What the office may set by hand. `awaiting_payment` is only ever set by the payment flow. */
export const PACKAGE_REQUEST_OFFICE_STATUSES = PACKAGE_REQUEST_STATUSES
  .filter((status) => status !== 'awaiting_payment');

export const START_WINDOWS = ['Immediately', 'Next 30 Days', 'Within 3 Months'];

export const PAYMENT_STATUSES = ['not_required', 'pending', 'paid', 'refunded'];

/**
 * `sent` offers are out with contractors. `accepted` is settled. `no_contractors`
 * means nobody covers the customer's area; `unassigned` means contractors were
 * asked but none took it. Both need the office. `awaiting_admin` is a paid COMMERCIAL
 * request: those are never broadcast, the office picks the contractor.
 */
export const DISPATCH_STATES = [
  'not_sent', 'sent', 'accepted', 'no_contractors', 'unassigned', 'awaiting_admin',
];

/** Who put the contractor on the request: they accepted an offer, or the office assigned them. */
export const ASSIGNED_BY = ['contractor', 'admin'];

export const OFFER_STATUSES = ['offered', 'accepted', 'declined', 'expired', 'withdrawn'];

export const OFFER_DECLINE_REASONS = ['too_far', 'no_capacity', 'not_my_type', 'other'];

/**
 * Where the site visit itself has got to, once a contractor has the request:
 *
 *   assigned -> on_the_way -> arrived -> report_submitted
 *
 * `on_the_way` is the contractor tapping "Start journey"; `arrived` follows the customer
 * giving them the OTP on site. The report is only ever open after `arrived`.
 */
export const VISIT_STAGES = ['assigned', 'on_the_way', 'arrived', 'report_submitted'];

export const CONTRACT_STATUSES = ['none', 'sent', 'accepted', 'rejected'];

export const SITE_ACCESS_LEVELS = ['easy', 'moderate', 'difficult'];

/** How many wrong OTP guesses before the contractor is locked out of trying. */
export const MAX_OTP_ATTEMPTS = 5;

const pointSchema = new mongoose.Schema(
  { lat: { type: Number, default: null }, lng: { type: Number, default: null }, at: { type: Date, default: null } },
  { _id: false },
);

/** What the contractor records on site. Everything the office needs to price the job. */
const visitReportSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['draft', 'submitted'], default: 'draft' },
    plotAreaSqft: { type: Number, default: null, min: 0 },
    builtUpAreaSqft: { type: Number, default: null, min: 0 },
    floorsPlanned: { type: Number, default: null, min: 0 },
    measurements: { type: String, default: '', trim: true, maxlength: 2000 },
    siteCondition: { type: String, default: '', trim: true, maxlength: 2000 },
    access: { type: String, enum: [...SITE_ACCESS_LEVELS, ''], default: '' },
    waterAvailable: { type: Boolean, default: null },
    electricityAvailable: { type: Boolean, default: null },
    recommendedScope: { type: String, default: '', trim: true, maxlength: 2000 },
    estimatedDurationDays: { type: Number, default: null, min: 0 },
    observations: { type: String, default: '', trim: true, maxlength: 3000 },
    notesForOffice: { type: String, default: '', trim: true, maxlength: 1000 },
    photos: { type: [String], default: [] },
    savedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
  },
  { _id: false },
);

/**
 * The customer accepting is only half of it — the contractor still has to
 * confirm before the fee they paid to take the site visit is earned back and
 * work can start. Mirrors `Quotation.contractorConfirmation` in the
 * enquiry/quotation flow (`models/quotation.model.js`); `contract.status`
 * stays `accepted` either way, this sub-document tracks the second step.
 */
const contractConfirmationSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: null },
    respondedAt: { type: Date, default: null },
    declineNote: { type: String, trim: true, default: '', maxlength: 500 },
  },
  { _id: false },
);

/** The office's offer once the report is in: a price and terms for the customer to accept. */
const contractSchema = new mongoose.Schema(
  {
    status: { type: String, enum: CONTRACT_STATUSES, default: 'none' },
    number: { type: String, default: '' },
    revision: { type: Number, default: 0 },
    price: { type: Number, default: 0, min: 0 },
    advanceAmount: { type: Number, default: 0, min: 0 },
    durationDays: { type: Number, default: null, min: 0 },
    scope: { type: String, default: '', trim: true, maxlength: 3000 },
    terms: { type: String, default: '', trim: true, maxlength: 5000 },
    sentAt: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    responseNote: { type: String, default: '', trim: true, maxlength: 500 },
    contractorConfirmation: { type: contractConfirmationSchema, default: null },
  },
  { _id: false },
);

const offerSchema = new mongoose.Schema(
  {
    contractorId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContractorProfile', required: true },
    status: { type: String, enum: OFFER_STATUSES, default: 'offered' },
    offeredAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    /** Set once the "offer is about to lapse" push has gone, so it is sent only once per offer. */
    reminderSentAt: { type: Date, default: null },
    declineReason: { type: String, enum: [...OFFER_DECLINE_REASONS, ''], default: '' },
    declineNote: { type: String, default: '', trim: true, maxlength: 500 },
    /** Why this contractor was picked, shown to the office when asking "why them?". */
    matchReasons: { type: [String], default: [] },
  },
  { _id: false },
);

const packageRequestSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },
    contact: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
    },

    package: {
      /**
       * Which catalogue this was booked from — a Residential/Commercial `ConstructionPackage`,
       * or a `ConstructionBudgetService` (booked the same way, under Budget Friendly).
       * `packageId` is resolved against whichever this names (see `refPath` below).
       */
      sourceModel: {
        type: String,
        enum: ['ConstructionPackage', 'ConstructionBudgetService'],
        default: 'ConstructionPackage',
      },
      packageId: { type: mongoose.Schema.Types.ObjectId, refPath: 'package.sourceModel', required: true },
      /** 'residential' | 'commercial' | 'budget_service'. */
      segment: { type: String, required: true },
      name: { type: String, required: true, trim: true },
      /** Rupees per `unit` at the time of the request. Null when the source has no listed rate — quoted after the visit. */
      price: { type: Number, default: null, min: 0 },
      unit: { type: String, default: 'per sq.ft', trim: true },
    },

    site: {
      city: { type: String, required: true, trim: true, maxlength: 120 },
      /** Locality within the city — optional, and used to match contractors more closely. */
      area: { type: String, default: '', trim: true, maxlength: 120 },
      /**
       * The exact place, as the customer confirmed it on the map: the full address, a flat/plot
       * or landmark note, and the pin. Private until a contractor takes the visit.
       */
      address: { type: String, default: '', trim: true, maxlength: 400 },
      landmark: { type: String, default: '', trim: true, maxlength: 200 },
      state: { type: String, default: '', trim: true, maxlength: 80 },
      pincode: { type: String, default: '', trim: true, maxlength: 12 },
      location: {
        type: { type: String, enum: ['Point'], default: undefined },
        /** [longitude, latitude], the GeoJSON order. */
        coordinates: { type: [Number], default: undefined },
      },
      /** Built-up area of one floor, as the customer entered it. */
      areaPerFloor: { type: Number, required: true, min: 0 },
      floors: { type: Number, required: true, min: 1 },
      totalBuiltUpArea: { type: Number, required: true, min: 0 },
    },

    /** rate × total built-up area — an indication, not a quote. Null when the source has no listed rate. */
    estimatedCost: { type: Number, default: null, min: 0 },

    /** The visiting fee charged for this booking, snapshotted from the package. 0 = free visit. */
    visitingFee: { type: Number, default: 0, min: 0 },

    payment: {
      status: { type: String, enum: PAYMENT_STATUSES, default: 'not_required', index: true },
      /** Amount in rupees actually asked for — always the snapshotted fee, never client input. */
      amount: { type: Number, default: 0, min: 0 },
      gateway: { type: String, default: '' },
      gatewayOrderId: { type: String, default: '', trim: true },
      gatewayPaymentId: { type: String, default: '', trim: true },
      paidAt: { type: Date, default: null },
      /** The shared `payments` record written when the payment was verified. */
      paymentRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
      refundedAt: { type: Date, default: null },
      refundNote: { type: String, default: '', trim: true, maxlength: 300 },
    },

    startWindow: { type: String, enum: START_WINDOWS, default: 'Next 30 Days' },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },

    status: { type: String, enum: PACKAGE_REQUEST_STATUSES, default: 'new', index: true },

    dispatch: {
      state: { type: String, enum: DISPATCH_STATES, default: 'not_sent' },
      /** How many times the request has been offered to a fresh batch of contractors. */
      rounds: { type: Number, default: 0 },
      lastDispatchedAt: { type: Date, default: null },
    },
    assignedBy: { type: String, enum: [...ASSIGNED_BY, ''], default: '' },

    /** The site visit, from "start journey" to a submitted report. */
    visit: {
      stage: { type: String, enum: VISIT_STAGES, default: 'assigned' },
      startedAt: { type: Date, default: null },
      arrivedAt: { type: Date, default: null },
      startLocation: { type: pointSchema, default: null },
      arrivalLocation: { type: pointSchema, default: null },
      /**
       * The arrival OTP. Shown to the CUSTOMER only, and never selected by default, so it
       * cannot leak through any list or detail read; the two places that need it ask for it.
       */
      otp: {
        code: { type: String, select: false, default: undefined },
        issuedAt: { type: Date, default: null },
        attempts: { type: Number, default: 0 },
      },
      report: { type: visitReportSchema, default: null },
    },
    contract: { type: contractSchema, default: () => ({}) },
    offers: { type: [offerSchema], default: [] },
    assignedContractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      default: null,
      index: true,
    },
    assignedAt: { type: Date, default: null },

    /** Set once the contractor confirms the contract — see `project.service.js#createProjectFromPackageContract`. */
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionProject',
      default: null,
    },

    /**
     * The minimum fee charged to the accepting contractor's wallet
     * (`settings.money.siteVisitAcceptanceFee`), snapshotted here for the
     * record. `null`/`amount: 0` means no fee applied to this request.
     * Refunded automatically once the CUSTOMER accepts this same request's
     * contract — the visit having turned into real business is what earns it
     * back (see `packageVisit.service.js#respond`).
     */
    acceptanceFee: {
      amount: { type: Number, default: 0, min: 0 },
      chargedAt: { type: Date, default: null },
      transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
      refundedAt: { type: Date, default: null },
      refundTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    },

    /** Internal only — never returned to the customer. */
    adminNote: { type: String, default: '', trim: true, maxlength: 1000 },
    updatedBy: { type: actionPerformerSchema, default: null },
  },
  {
    collection: 'construction_package_requests',
    timestamps: true,
  },
);

packageRequestSchema.index({ status: 1, createdAt: -1 });
packageRequestSchema.index({ 'offers.contractorId': 1, createdAt: -1 });
packageRequestSchema.index({ 'payment.gatewayOrderId': 1 }, { sparse: true });
packageRequestSchema.index({ 'dispatch.state': 1, 'offers.expiresAt': 1 });

export const PackageRequest = mongoose.models.PackageRequest
  || mongoose.model('PackageRequest', packageRequestSchema, 'construction_package_requests');
