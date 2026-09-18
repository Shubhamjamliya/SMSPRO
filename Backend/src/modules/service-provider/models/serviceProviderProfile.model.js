import mongoose from 'mongoose';
import { Counter } from '../../../core/models/counter.model.js';

const BANK_ACCOUNT_TYPES = ['savings', 'current', 'other'];
const PROVIDER_STATUSES = ['onboarding', 'pending_approval', 'approved', 'rejected'];

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: PROVIDER_STATUSES, required: true },
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

/** Structured identity KYC — same shape as BikeVendor's documentsSchema (minus DL/GST/BizReg,
 *  which don't apply to an individual provider). Supplementary docs stay in ServiceProviderDocument. */
const documentsSchema = new mongoose.Schema(
  {
    panNumber: { type: String, trim: true, uppercase: true, default: '' },
    panImage: { type: String, trim: true, default: '' },
    aadhaarNumber: { type: String, trim: true, default: '' },
    aadhaarImage: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const serviceProviderProfileSchema = new mongoose.Schema(
  {
    providerCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    /** Centralized FoodUser — same phone / wallet / common profile across modules.
     *  Never create a new FoodUser for a provider; always resolve via findOrCreateUserByPhone. */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
    },
    ownerName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, required: true, trim: true },
    phoneDigits: { type: String, trim: true, index: true },
    phoneLast10: { type: String, trim: true },
    profileImage: { type: String, trim: true, default: '' },
    experience: { type: String, trim: true, default: '' },
    skills: { type: [String], default: [] },
    about: { type: String, trim: true, default: '', maxlength: 2000 },
    bank: { type: bankSchema, default: () => ({}) },
    documents: { type: documentsSchema, default: () => ({}) },
    /** The ONE admin-created active zone this provider serves — selected mandatorily
     *  during onboarding, validated server-side (submitOnboarding), never provider-editable
     *  once approved. Providers do not create/request zones; they only select an existing one. */
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceZone', default: null },
    /** Aggregate rating — no submission flow exists yet (out of scope), fields exist
     *  so provider cards can render a rating badge once one is built; 0 = "New". */
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalRatings: { type: Number, default: 0, min: 0 },
    /** Count of bookings this provider cancelled after accepting — crossing the
     *  admin-configured threshold (operationalSettings.maxProviderCancellations)
     *  auto-suspends the provider (isActive:false) for support review. */
    cancelledBookingsCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: PROVIDER_STATUSES,
      default: 'onboarding',
      index: true,
    },
    /** 1 Basic info, 2 Professional info, 3 Documents, 4 Bank/payout details,
     *  5 Category & Services, 6 Review/Submit */
    onboardingStep: { type: Number, min: 1, max: 6, default: 1 },
    rejectionReason: { type: String, trim: true, default: '' },
    /** Snapshot of provider fields as they stood at the moment of the last rejection,
     *  so admins can diff it against the resubmitted values. Cleared on approval. */
    rejectedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    statusHistory: { type: [statusHistorySchema], default: [] },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    fcmTokens: { type: [String], default: [] },
    /** Native-app tokens. `firebase.service` writes web and mobile separately. */
    fcmTokenMobile: { type: [String], default: [] },
  },
  {
    collection: 'service_provider_profiles',
    timestamps: true,
  },
);

serviceProviderProfileSchema.index({ status: 1, createdAt: -1 });
serviceProviderProfileSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
);
serviceProviderProfileSchema.index(
  { phoneLast10: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phoneLast10: { $type: 'string', $gt: '' },
      isDeleted: false,
    },
  },
);

serviceProviderProfileSchema.pre('validate', function normalizePhone(next) {
  const digits = String(this.phone || '').replace(/\D/g, '');
  this.phoneDigits = digits || this.phoneDigits || '';
  this.phoneLast10 = digits.slice(-10) || this.phoneLast10 || '';
  next();
});

serviceProviderProfileSchema.pre('save', async function assignProviderCode(next) {
  if (!this.isNew || this.providerCode) return next();
  try {
    const counter = await Counter.findOneAndUpdate(
      { model: 'ServiceProviderProfile' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    this.providerCode = `SP${String(counter.seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

export const ServiceProviderProfile = mongoose.models.ServiceProviderProfile
  || mongoose.model('ServiceProviderProfile', serviceProviderProfileSchema, 'service_provider_profiles');
export const SERVICE_PROVIDER_STATUSES = PROVIDER_STATUSES;
export const SERVICE_PROVIDER_BANK_ACCOUNT_TYPES = BANK_ACCOUNT_TYPES;
