import mongoose from 'mongoose';
import { Counter } from '../../../core/models/counter.model.js';

const BANK_ACCOUNT_TYPES = ['savings', 'current', 'other'];
const VENDOR_STATUSES = ['onboarding', 'pending', 'approved', 'rejected'];

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: VENDOR_STATUSES, required: true },
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
    accountType: {
      type: String,
      enum: [...BANK_ACCOUNT_TYPES, ''],
      default: '',
    },
    upiId: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const documentsSchema = new mongoose.Schema(
  {
    panNumber: { type: String, trim: true, uppercase: true, default: '' },
    panImage: { type: String, trim: true, default: '' },
    aadhaarNumber: { type: String, trim: true, default: '' },
    aadhaarImage: { type: String, trim: true, default: '' },
    drivingLicenseNumber: { type: String, trim: true, uppercase: true, default: '' },
    drivingLicenseImage: { type: String, trim: true, default: '' },
    gstNumber: { type: String, trim: true, uppercase: true, default: '' },
    gstImage: { type: String, trim: true, default: '' },
    businessRegistrationNumber: { type: String, trim: true, default: '' },
    businessRegistrationImage: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const bikeVendorSchema = new mongoose.Schema(
  {
    vendorCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    /** Centralized FoodUser — same phone / wallet / common profile across modules */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },
    ownerName: { type: String, required: true, trim: true },
    businessName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, required: true, trim: true },
    phoneDigits: { type: String, trim: true },
    phoneLast10: { type: String, trim: true },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    landmark: { type: String, trim: true, default: '' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    profilePhoto: { type: String, trim: true, default: '' },
    shopImages: { type: [String], default: [] },
    bank: { type: bankSchema, default: () => ({}) },
    documents: { type: documentsSchema, default: () => ({}) },
    status: {
      type: String,
      enum: VENDOR_STATUSES,
      default: 'onboarding',
      index: true,
    },
    onboardingStep: { type: Number, min: 1, max: 4, default: 1 },
    rejectionReason: { type: String, trim: true, default: '' },
    /** Snapshot of vendor fields as they stood at the moment of the last rejection,
     *  so admins can diff it against the resubmitted values. Cleared on approval. */
    rejectedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    statusHistory: { type: [statusHistorySchema], default: [] },
    /** Snapshot of submitted fields at last approval, used to diff on resubmission after rejection */
    previousSubmission: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Platform commission % charged on this vendor's bookings; falls back to global settings default when null */
    commissionRate: { type: Number, default: null, min: 0, max: 100 },
    /**
     * Vendor-level overrides for booking/cancellation/no-show/late-fee/deposit/support policy.
     * Sparse object — only keys the vendor has explicitly customized are present; everything
     * else falls back to the platform's global BikeRentSettings. See settings.service.js
     * VENDOR_SETTINGS_SECTIONS for the whitelist of overridable keys and section grouping.
     */
    settings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    /** Zones this vendor is approved to operate hubs/bikes in */
    zones: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BikeRentZone' }],
      default: [],
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    fcmTokens: { type: [String], default: [] },
    fcmTokenMobile: { type: [String], default: [] },
  },
  {
    collection: 'bike_rent_vendors',
    timestamps: true,
  },
);

bikeVendorSchema.index({ status: 1, createdAt: -1 });
bikeVendorSchema.index(
  { phoneLast10: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phoneLast10: { $type: 'string', $gt: '' },
      isDeleted: false,
    },
  },
);

bikeVendorSchema.pre('validate', function normalizePhone(next) {
  const digits = String(this.phone || '').replace(/\D/g, '');
  this.phoneDigits = digits || this.phoneDigits || '';
  this.phoneLast10 = digits.slice(-10) || this.phoneLast10 || '';
  next();
});

bikeVendorSchema.pre('save', async function assignVendorCode(next) {
  if (!this.isNew || this.vendorCode) return next();
  try {
    const counter = await Counter.findOneAndUpdate(
      { model: 'BikeVendor' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    this.vendorCode = `BRV${String(counter.seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

export const BikeVendor = mongoose.model('BikeVendor', bikeVendorSchema);
export const BIKE_VENDOR_STATUSES = VENDOR_STATUSES;
export const BIKE_VENDOR_BANK_ACCOUNT_TYPES = BANK_ACCOUNT_TYPES;
