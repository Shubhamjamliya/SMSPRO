import mongoose from "mongoose";
import { actionPerformerSchema } from "./actionPerformer.schema.js";
import { DRIVER_MODULE_KEYS } from "../../modules/common/utils/moduleKeys.js";

const normalizeRatingValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Number(numeric.toFixed(1))));
};

const documentAssetSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" },
    key: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const reviewHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [
        "submitted",
        "resubmitted",
        "approved",
        "rejected",
        "documents_required",
      ],
      required: true,
    },
    note: { type: String, default: "" },
    documentsRequested: { type: [String], default: [] },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: actionPerformerSchema, default: null },
  },
  { _id: false },
);

export const moduleEnrollmentSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "not_registered",
        "pending",
        "approved",
        "rejected",
        "documents_required",
      ],
      default: "not_registered",
    },
    appliedAt: { type: Date },
    submittedAt: { type: Date },
    firstSubmittedAt: { type: Date },
    lastResubmittedAt: { type: Date },
    submissionCount: { type: Number, default: 0, min: 0 },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
    previousStatus: { type: String },
    previousRejectionReason: { type: String },
    previousSubmission: { type: mongoose.Schema.Types.Mixed, default: null },
    changedFields: { type: [mongoose.Schema.Types.Mixed], default: [] },
    documentsRequested: { type: [String], default: [] },
    vehicleConfigurationId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    vehicleName: { type: String, default: "" },
    vehicleNumber: { type: String, default: "" },
    vehicleBrand: { type: String, default: "" },
    vehicleModel: { type: String, default: "" },
    documents: {
      type: Map,
      of: documentAssetSchema,
      default: undefined,
    },
    approvedBy: { type: actionPerformerSchema, default: null },
    rejectedBy: { type: actionPerformerSchema, default: null },
    reviewHistory: { type: [reviewHistorySchema], default: [] },
  },
  { _id: false },
);

const emptyEnrollment = () => ({
  status: "not_registered",
  documentsRequested: [],
  reviewHistory: [],
  submissionCount: 0,
  previousSubmission: null,
  changedFields: [],
});

const buildRegisteredServicesShape = () => {
  const shape = {};
  for (const key of DRIVER_MODULE_KEYS) {
    shape[key] = { type: moduleEnrollmentSchema, default: () => emptyEnrollment() };
  }
  return shape;
};

const driverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
      // Draft stubs may start blank; finalized drivers must have a name
      required: function requiredName() {
        if (this.onboardingStep && this.onboardingStep !== "submitted") {
          return false;
        }
        return true;
      },
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    email: { type: String, trim: true },
    countryCode: {
      type: String,
      default: "+91",
    },
    address: {
      type: String,
    },
    city: {
      type: String,
    },
    state: {
      type: String,
    },
    dateOfBirth: {
      type: Date,
    },
    vehicleType: {
      type: String,
    },
    vehicleBrand: {
      type: String,
    },
    vehicleModel: {
      type: String,
    },
    vehicleName: {
      type: String,
    },
    vehicleNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    vehicleConfigurationId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    panNumber: {
      type: String,
    },
    aadharNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    drivingLicenseNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    drivingLicenseExpiry: {
      type: Date,
    },
    profilePhoto: {
      type: String,
    },
    fcmTokens: {
      type: [String],
      default: [],
    },
    fcmTokenMobile: {
      type: [String],
      default: [],
    },
    aadharPhoto: {
      type: String,
    },
    aadharFront: {
      type: String,
    },
    aadharBack: {
      type: String,
    },
    panPhoto: {
      type: String,
    },
    drivingLicensePhoto: {
      type: String,
    },
    drivingLicenseFront: {
      type: String,
    },
    drivingLicenseBack: {
      type: String,
    },
    rcPhoto: {
      type: String,
    },
    rcFront: {
      type: String,
    },
    rcBack: {
      type: String,
    },
    insurancePhoto: {
      type: String,
    },
    pucPhoto: {
      type: String,
    },
    vehiclePermitPhoto: {
      type: String,
    },
    fitnessCertificatePhoto: {
      type: String,
    },
    bankProof: {
      type: String,
    },
    vehicleImage: {
      type: String,
    },
    emergencyContactName: {
      type: String,
      trim: true,
    },
    emergencyContactPhone: {
      type: String,
      trim: true,
    },
    agreements: {
      partnerAgreement: { type: Boolean, default: false },
      termsAccepted: { type: Boolean, default: false },
      privacyAccepted: { type: Boolean, default: false },
      acceptedAt: { type: Date },
    },
    documentsRequested: {
      type: [String],
      default: [],
    },
    onboardingStep: {
      type: String,
      enum: ["details", "address", "documents", "review", "submitted"],
      default: "details",
    },
    /**
     * In-progress wizard state that is not yet reflected in enrollments.
     * Scoped to this Driver document only (one draft per phone/account).
     */
    onboardingDraft: {
      selectedModules: { type: [String], default: [] },
      moduleVehicles: { type: mongoose.Schema.Types.Mixed, default: {} },
      partnerAgreement: { type: Boolean, default: false },
      termsAccepted: { type: Boolean, default: false },
      privacyAccepted: { type: Boolean, default: false },
      updatedAt: { type: Date },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "documents_required"],
      default: "pending",
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    rejectionReason: { type: String },
    rejectedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: actionPerformerSchema, default: null },
    rejectedBy: { type: actionPerformerSchema, default: null },
    bankAccountHolderName: { type: String },
    bankAccountNumber: { type: String },
    bankIfscCode: { type: String },
    bankName: { type: String },
    upiId: { type: String },
    upiQrCode: { type: String },
    availabilityStatus: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },
    /** Last selected work module while online (food, taxi, …). */
    activeWorkModule: {
      type: String,
      default: null,
      trim: true,
    },
    lastLocation: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number] },
    },
    lastLat: { type: Number },
    lastLng: { type: Number },
    lastLocationAt: { type: Date },
    referralCode: { type: String, index: true },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
      index: true,
    },
    referralCount: { type: Number, default: 0, min: 0 },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
      set: normalizeRatingValue,
    },
    totalRatings: { type: Number, default: 0, min: 0 },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    accountStatus: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
    },
    /**
     * Per-module enrollment lifecycle. Nested known keys for backward
     * compatibility; helpers treat this as the source of truth.
     */
    registeredServices: buildRegisteredServicesShape(),
    /**
     * Modules the driver may work in. Secure default is empty — populated
     * only when a module enrollment is approved.
     */
    authorizedServices: {
      type: [String],
      enum: DRIVER_MODULE_KEYS,
      default: [],
    },
  },
  {
    collection: "food_delivery_partners",
    timestamps: true,
  },
);

driverSchema.index({ lastLocation: "2dsphere" });
driverSchema.index({ "registeredServices.food.status": 1 });
driverSchema.index({ "registeredServices.taxi.status": 1 });
driverSchema.index({ "registeredServices.porter.status": 1 });
driverSchema.index({ "registeredServices.quick-commerce.status": 1 });

export const Driver = mongoose.model(
  "Driver",
  driverSchema,
  "food_delivery_partners",
);
