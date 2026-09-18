import mongoose from 'mongoose';
import { Counter } from '../../../core/models/counter.model.js';

/**
 * ContractorProfile — the supply side of the construction module (BRD W1–W5).
 *
 * Its own collection and its own role, mirroring ServiceProviderProfile and
 * BikeVendor rather than extending either. Two reasons that matters:
 *
 *   1. A contractor spans several trades (civil + electrical + finishing) and
 *      several areas. The Service Provider catalogue rule allows exactly one
 *      category and one zone — correct for a plumber, wrong for a builder.
 *   2. A construction job runs for months. Capacity is declared up front via
 *      `maxConcurrentProjects` rather than inferred from a runtime lock, which
 *      is the honest answer to the concern raised in BRD question 2.
 *
 * Identity is still shared: `userId` always points at the one central FoodUser
 * resolved by phone, so a contractor who is also a customer has one account
 * (BRD Rule 1). Never create a FoodUser here — always findOrCreateUserByPhone.
 */
const BUSINESS_TYPES = [
  'individual',
  'proprietorship',
  'partnership',
  'pvt_ltd',
  'llp',
  'other',
];

const CONTRACTOR_STATUSES = [
  'onboarding',
  'pending_approval',
  'approved',
  'rejected',
];

const BANK_ACCOUNT_TYPES = ['savings', 'current', 'other'];

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: CONTRACTOR_STATUSES, required: true },
    reason: { type: String, trim: true, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    changedByName: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const bankSchema = new mongoose.Schema(
  {
    bankName: { type: String, trim: true, default: '' },
    accountHolderName: { type: String, trim: true, default: '' },
    accountNumber: { type: String, trim: true, default: '' },
    ifscCode: { type: String, trim: true, uppercase: true, default: '' },
    accountType: { type: String, enum: [...BANK_ACCOUNT_TYPES, ''], default: '' },
    upiId: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

/** Identity KYC held on the profile. Licences and certificates that carry an
 *  expiry date live in ContractorDocument instead, because Rule 6 requires the
 *  system to warn before each one lapses. */
const identityDocumentsSchema = new mongoose.Schema(
  {
    panNumber: { type: String, trim: true, uppercase: true, default: '' },
    panImage: { type: String, trim: true, default: '' },
    aadhaarNumber: { type: String, trim: true, default: '' },
    aadhaarImage: { type: String, trim: true, default: '' },
    gstNumber: { type: String, trim: true, uppercase: true, default: '' },
    gstImage: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const contractorProfileSchema = new mongoose.Schema(
  {
    contractorCode: { type: String, unique: true, sparse: true, trim: true },

    /** Centralized FoodUser — one account across every module (BRD Rule 1). */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
    },

    // ---------- W1 Registration ----------
    businessName: { type: String, required: true, trim: true },
    businessType: { type: String, enum: BUSINESS_TYPES, default: 'individual' },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, required: true, trim: true },
    phoneDigits: { type: String, trim: true, index: true },
    phoneLast10: { type: String, trim: true },
    profileImage: { type: String, trim: true, default: '' },
    yearsExperience: { type: Number, default: 0, min: 0, max: 100 },
    about: { type: String, trim: true, default: '', maxlength: 2000 },

    // ---------- W2 Declaring what they do ----------
    /** MULTIPLE trades, deliberately — a builder is not a single-category worker. */
    trades: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ConstructionCategory' }],
    /** Cities or areas served. Free text until construction zones exist. */
    serviceAreas: { type: [String], default: [] },
    travelRadiusKm: { type: Number, default: null, min: 0, max: 1000 },
    /** Project value band this contractor takes on — feeds matching (BRD W2). */
    projectSizeMin: { type: Number, default: null, min: 0 },
    projectSizeMax: { type: Number, default: null, min: 0 },
    /**
     * How many live projects they can run at once. This is the honest replacement
     * for a runtime lock: capacity is declared, not inferred, so a six-month job
     * never blocks a contractor from quoting other work.
     */
    maxConcurrentProjects: { type: Number, default: 3, min: 1, max: 100 },

    // ---------- W3 Documents / KYC ----------
    documents: { type: identityDocumentsSchema, default: () => ({}) },
    bank: { type: bankSchema, default: () => ({}) },

    // ---------- W4 Verification status ----------
    status: {
      type: String,
      enum: CONTRACTOR_STATUSES,
      default: 'onboarding',
      index: true,
    },
    /** 1 Business · 2 Trades & capacity · 3 Coverage · 4 Identity KYC
     *  5 Licences · 6 Bank details · 7 Review & submit */
    onboardingStep: { type: Number, min: 1, max: 7, default: 1 },
    rejectionReason: { type: String, trim: true, default: '' },
    /** Field snapshot as it stood at the last rejection, so an admin can diff a
     *  resubmission against what they actually rejected. Cleared on approval. */
    rejectedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    statusHistory: { type: [statusHistorySchema], default: [] },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },

    // ---------- W18 Trust score (populated from Phase 6) ----------
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalRatings: { type: Number, default: 0, min: 0 },
    trustScore: { type: Number, default: 0, min: 0, max: 100 },
    completedProjects: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    fcmTokens: { type: [String], default: [] },
    /** Native-app tokens. `firebase.service` writes web and mobile separately. */
    fcmTokenMobile: { type: [String], default: [] },
  },
  {
    collection: 'construction_contractors',
    timestamps: true,
  },
);

contractorProfileSchema.index({ status: 1, createdAt: -1 });
contractorProfileSchema.index({ trades: 1, status: 1 });
contractorProfileSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
contractorProfileSchema.index(
  { phoneLast10: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phoneLast10: { $type: 'string', $gt: '' },
      isDeleted: false,
    },
  },
);

contractorProfileSchema.pre('validate', function normalize(next) {
  const digits = String(this.phone || '').replace(/\D/g, '');
  this.phoneDigits = digits || this.phoneDigits || '';
  this.phoneLast10 = digits.slice(-10) || this.phoneLast10 || '';

  if (
    this.projectSizeMin != null
    && this.projectSizeMax != null
    && Number(this.projectSizeMax) < Number(this.projectSizeMin)
  ) {
    return next(new Error('Maximum project size cannot be less than the minimum'));
  }
  next();
});

contractorProfileSchema.pre('save', async function assignCode(next) {
  if (!this.isNew || this.contractorCode) return next();
  try {
    const counter = await Counter.findOneAndUpdate(
      { model: 'ContractorProfile' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    this.contractorCode = `CTR${String(counter.seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

export const ContractorProfile = mongoose.models.ContractorProfile
  || mongoose.model('ContractorProfile', contractorProfileSchema, 'construction_contractors');

export const CONTRACTOR_BUSINESS_TYPES = BUSINESS_TYPES;
export const CONTRACTOR_PROFILE_STATUSES = CONTRACTOR_STATUSES;
export const CONTRACTOR_BANK_ACCOUNT_TYPES = BANK_ACCOUNT_TYPES;
