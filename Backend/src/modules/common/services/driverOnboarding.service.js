import mongoose from "mongoose";
import { Driver } from "../../../core/models/driver.model.js";
import { uploadImageBuffer } from "../../../services/cloudinary.service.js";
import { ValidationError, NotFoundError } from "../../../core/auth/errors.js";
import {
  validateDriverOnboardingPayload,
  normalizeModuleSelections,
  validateModuleVehicleSelections,
  validateDocumentsForSelections,
  validateVehicleIdentityFields,
} from "../validators/driverOnboarding.validator.js";
import {
  appendReviewHistory,
  canTransitionEnrollment,
  ensureRegisteredServices,
  getApprovedModules,
  getEnrollment,
  listEnrollments,
  serializeEnrollment,
  serializePublicOnboardingStatus,
  setEnrollment,
  syncAuthorizedServices,
  syncGlobalDriverStatus,
} from "../utils/driverEnrollment.js";
import { toDriverModuleKey } from "../utils/moduleKeys.js";
import { getPublicDriverOnboardingConfig } from "../services/driverOnboardingConfig.service.js";
import {
  buildDriverChangedFields,
  buildDriverEnrollmentSnapshot,
  ensureDriverResubmitBaseline,
  markEnrollmentSubmissionMeta,
} from "./driverOnboardingWorkflow.js";

const pickFirstFile = (files, ...names) => {
  for (const name of names) {
    if (!name) continue;
    if (files?.[name]?.[0]) return files[name][0];
    if (files?.[name] && !Array.isArray(files[name])) return files[name];
  }
  return null;
};

const UPLOAD_MAP = [
  ["profilePhoto", "profilePhoto", "common/drivers/profile"],
  ["aadharFront", "aadharFront", "common/drivers/aadhar"],
  ["aadharBack", "aadharBack", "common/drivers/aadhar"],
  ["drivingLicenseFront", "drivingLicenseFront", "common/drivers/license"],
  ["drivingLicenseBack", "drivingLicenseBack", "common/drivers/license"],
  ["rcFront", "rcFront", "common/drivers/rc"],
  ["rcBack", "rcBack", "common/drivers/rc"],
  ["rcPhoto", "rcPhoto", "common/drivers/rc"],
  ["insurancePhoto", "insurancePhoto", "common/drivers/insurance"],
  ["pucPhoto", "pucPhoto", "common/drivers/puc"],
  ["vehiclePermitPhoto", "vehiclePermitPhoto", "common/drivers/permit"],
  ["fitnessCertificatePhoto", "fitnessCertificatePhoto", "common/drivers/fitness"],
  ["vehicleImage", "vehicleImage", "common/drivers/vehicle"],
  ["panPhoto", "panPhoto", "common/drivers/pan"],
  ["bankProof", "bankProof", "common/drivers/bank"],
];

const uploadOnboardingImages = async (files) => {
  const images = {};
  for (const [field, destKey, folder] of UPLOAD_MAP) {
    const aliases =
      field === "aadharFront"
        ? ["aadharFront", "aadharPhoto"]
        : field === "drivingLicenseFront"
          ? ["drivingLicenseFront", "drivingLicensePhoto"]
          : field === "rcFront"
            ? ["rcFront", "rcPhoto"]
            : [field];
    const file = pickFirstFile(files, ...aliases);
    if (file) {
      images[destKey] = await uploadImageBuffer(file.buffer, folder);
      if (field === "aadharFront") images.aadharPhoto = images[destKey];
      if (field === "drivingLicenseFront") {
        images.drivingLicensePhoto = images[destKey];
      }
      if (field === "rcFront") {
        images.rcPhoto = images[destKey];
      }
    }
  }
  return images;
};

const assertUniqueIdentity = async ({
  phone,
  aadharNumber,
  drivingLicenseNumber,
  vehicleNumber,
  excludeId,
}) => {
  const exclude = excludeId ? { _id: { $ne: excludeId } } : {};

  const phoneClash = await Driver.findOne({ phone, ...exclude })
    .select("_id status authorizedServices registeredServices")
    .lean();
  if (phoneClash) {
    const hasApproved =
      Array.isArray(phoneClash.authorizedServices) &&
      phoneClash.authorizedServices.length > 0;
    const blocking =
      hasApproved ||
      !["rejected", "documents_required", "pending"].includes(phoneClash.status);
    // Allow re-apply when fully rejected / docs required / still pending with no approvals
    if (hasApproved) {
      throw new ValidationError(
        "Delivery partner with this phone already exists",
      );
    }
    if (
      phoneClash.status === "pending" &&
      !["rejected", "documents_required"].includes(phoneClash.status)
    ) {
      // pending without approval — allow module add via authenticated resubmit only
    }
  }

  if (aadharNumber) {
    const aadhaarClash = await Driver.findOne({ aadharNumber, ...exclude })
      .select("_id")
      .lean();
    if (aadhaarClash) {
      throw new ValidationError("This Aadhaar number is already registered");
    }
  }

  if (drivingLicenseNumber) {
    const dlClash = await Driver.findOne({ drivingLicenseNumber, ...exclude })
      .select("_id")
      .lean();
    if (dlClash) {
      throw new ValidationError(
        "This driving license number is already registered",
      );
    }
  }

  if (vehicleNumber) {
    const vehicleClash = await Driver.findOne({ vehicleNumber, ...exclude })
      .select("_id")
      .lean();
    if (vehicleClash) {
      throw new ValidationError("This vehicle number is already registered");
    }
  }
};

const buildDocumentMap = (images = {}) => {
  const docs = {};
  for (const [key, url] of Object.entries(images)) {
    if (!url) continue;
    docs[key] = { url, publicId: "", key, uploadedAt: new Date() };
  }
  return docs;
};

const applyEnrollmentSubmission = (
  driver,
  resolvedSelection,
  images,
  { isResubmit = false, performer = null } = {},
) => {
  const moduleKey = resolvedSelection.moduleKey;
  const enrollment = getEnrollment(driver, moduleKey);
  const fromStatus = enrollment.status || "not_registered";

  if (fromStatus === "approved") {
    throw new ValidationError(
      `Module ${moduleKey} is already approved and cannot be resubmitted`,
    );
  }
  if (fromStatus === "pending") {
    throw new ValidationError(
      `Module ${moduleKey} is already pending review`,
    );
  }
  if (!canTransitionEnrollment(fromStatus, "pending", "submit")) {
    throw new ValidationError(
      `Cannot submit onboarding for module ${moduleKey} from status ${fromStatus}`,
    );
  }

  const vehicle = resolvedSelection.vehicle;
  const now = new Date();
  const previousRejectionReason = enrollment.rejectionReason || "";
  const previousStatus = enrollment.status || "not_registered";

  let previousSnapshot = null;
  let changedFields = [];
  if (isResubmit || ["rejected", "documents_required"].includes(fromStatus)) {
    // Baseline should already be frozen before profile overwrite; reuse it.
    previousSnapshot =
      enrollment.previousSubmission &&
      typeof enrollment.previousSubmission === "object"
        ? enrollment.previousSubmission
        : ensureDriverResubmitBaseline(driver, enrollment);
  }

  const nextDocuments = {
    ...(enrollment.documents instanceof Map
      ? Object.fromEntries(enrollment.documents)
      : enrollment.documents || {}),
    ...buildDocumentMap(images),
  };

  // Temporarily apply next values so snapshot reflects current submission
  const stagedEnrollment = {
    ...enrollment.toObject?.() || enrollment,
    status: "pending",
    vehicleConfigurationId: vehicle?._id || null,
    vehicleName: vehicle?.name || resolvedSelection.legacyVehicleType || "",
    vehicleNumber: resolvedSelection.vehicleNumber || driver.vehicleNumber || "",
    vehicleBrand: resolvedSelection.vehicleBrand || driver.vehicleBrand || "",
    vehicleModel: resolvedSelection.vehicleModel || driver.vehicleModel || "",
    documents: nextDocuments,
    rejectionReason: "",
  };
  const currentSnapshot = buildDriverEnrollmentSnapshot(driver, stagedEnrollment);
  if (previousSnapshot) {
    changedFields = buildDriverChangedFields(currentSnapshot, previousSnapshot);
  }

  markEnrollmentSubmissionMeta(enrollment, {
    isResubmit:
      isResubmit || ["rejected", "documents_required"].includes(fromStatus),
  });

  setEnrollment(driver, moduleKey, {
    status: "pending",
    appliedAt: enrollment.appliedAt || now,
    submittedAt: enrollment.submittedAt || now,
    firstSubmittedAt: enrollment.firstSubmittedAt || enrollment.appliedAt || now,
    lastResubmittedAt: enrollment.lastResubmittedAt,
    submissionCount: enrollment.submissionCount || 1,
    approvedAt: undefined,
    rejectedAt: undefined,
    // Keep last rejection visible in history / UI while status is pending again
    previousStatus,
    previousRejectionReason,
    rejectionReason: previousRejectionReason || undefined,
    documentsRequested: [],
    previousSubmission: previousSnapshot || enrollment.previousSubmission || null,
    changedFields,
    vehicleConfigurationId: vehicle?._id || null,
    vehicleName: vehicle?.name || resolvedSelection.legacyVehicleType || "",
    vehicleNumber: resolvedSelection.vehicleNumber || driver.vehicleNumber || "",
    vehicleBrand: resolvedSelection.vehicleBrand || driver.vehicleBrand || "",
    vehicleModel: resolvedSelection.vehicleModel || driver.vehicleModel || "",
    documents: nextDocuments,
  });

  appendReviewHistory(getEnrollment(driver, moduleKey), {
    action:
      isResubmit || ["rejected", "documents_required"].includes(fromStatus)
        ? "resubmitted"
        : "submitted",
    note:
      isResubmit || ["rejected", "documents_required"].includes(fromStatus)
        ? previousRejectionReason
          ? `Driver resubmitted after: ${previousRejectionReason}`
          : "Driver resubmitted onboarding"
        : "Driver submitted onboarding",
    changedBy: performer,
  });
};

export const serializeDriverOnboarding = (driver) => {
  const obj = driver.toObject?.() || driver;
  const enrollments = listEnrollments(obj).map((item) =>
    serializeEnrollment(item.module, item),
  );
  // registeredServices statuses are the source of truth for module access
  const approvedFromEnrollments = getApprovedModules(obj);
  const approvedModules = approvedFromEnrollments.length
    ? approvedFromEnrollments
    : (obj.authorizedServices || []).map(String);

  return {
    id: String(obj._id),
    name: obj.name,
    phone: obj.phone,
    email: obj.email,
    countryCode: obj.countryCode,
    address: obj.address,
    city: obj.city,
    state: obj.state,
    dateOfBirth: obj.dateOfBirth,
    aadharNumber: obj.aadharNumber || "",
    panNumber: obj.panNumber || "",
    drivingLicenseNumber: obj.drivingLicenseNumber || "",
    drivingLicenseExpiry: obj.drivingLicenseExpiry || null,
    profilePhoto: obj.profilePhoto,
    status: obj.status,
    isActive: obj.isActive,
    onboardingStep: obj.onboardingStep || "details",
    authorizedServices: approvedModules,
    enrollments,
    hasApprovedModule: approvedModules.length > 0,
    bank: {
      accountHolderName: obj.bankAccountHolderName,
      accountNumber: obj.bankAccountNumber,
      ifscCode: obj.bankIfscCode,
      bankName: obj.bankName,
      upiId: obj.upiId,
    },
    emergencyContact: {
      name: obj.emergencyContactName,
      phone: obj.emergencyContactPhone,
    },
    agreements: {
      partnerAgreement: Boolean(
        obj.onboardingDraft?.partnerAgreement ?? obj.agreements?.partnerAgreement,
      ),
      termsAccepted: Boolean(
        obj.onboardingDraft?.termsAccepted ?? obj.agreements?.termsAccepted,
      ),
      privacyAccepted: Boolean(
        obj.onboardingDraft?.privacyAccepted ?? obj.agreements?.privacyAccepted,
      ),
    },
    onboardingDraft: {
      selectedModules: Array.isArray(obj.onboardingDraft?.selectedModules)
        ? obj.onboardingDraft.selectedModules.map(String)
        : [],
      moduleVehicles:
        obj.onboardingDraft?.moduleVehicles &&
        typeof obj.onboardingDraft.moduleVehicles === "object"
          ? obj.onboardingDraft.moduleVehicles
          : {},
      updatedAt: obj.onboardingDraft?.updatedAt || null,
    },
    documents: {
      profilePhoto: obj.profilePhoto,
      aadharFront: obj.aadharFront || obj.aadharPhoto,
      aadharBack: obj.aadharBack,
      panPhoto: obj.panPhoto,
      drivingLicenseFront: obj.drivingLicenseFront || obj.drivingLicensePhoto,
      drivingLicenseBack: obj.drivingLicenseBack,
      rcPhoto: obj.rcPhoto || obj.rcFront,
      rcFront: obj.rcFront || obj.rcPhoto,
      rcBack: obj.rcBack,
      insurancePhoto: obj.insurancePhoto,
      pucPhoto: obj.pucPhoto,
      vehiclePermitPhoto: obj.vehiclePermitPhoto,
      fitnessCertificatePhoto: obj.fitnessCertificatePhoto,
      vehicleImage: obj.vehicleImage,
      bankProof: obj.bankProof,
    },
    vehicle: {
      configurationId: obj.vehicleConfigurationId
        ? String(obj.vehicleConfigurationId)
        : null,
      type: obj.vehicleType,
      name: obj.vehicleName,
      number: obj.vehicleNumber,
      brand: obj.vehicleBrand,
      model: obj.vehicleModel,
    },
  };
};

export const submitDriverOnboarding = async ({
  body,
  files,
  existingDriver = null,
  performer = null,
  modulesFilter = null,
}) => {
  const payload = validateDriverOnboardingPayload(body);
  let selections = normalizeModuleSelections({ ...body, ...payload });

  if (Array.isArray(modulesFilter) && modulesFilter.length) {
    const allowed = new Set(modulesFilter.map(toDriverModuleKey));
    selections = selections.filter((item) => allowed.has(toDriverModuleKey(item.module)));
    if (!selections.length) {
      throw new ValidationError("No editable modules selected for resubmission");
    }
  }

  const resolved = await validateModuleVehicleSelections(selections);

  // Legacy food path when no vehicle configs exist yet
  if (
    resolved.every((item) => item.legacyVehicleType) &&
    !body.vehicleConfigurationId
  ) {
    // keep going — validator already expanded legacy docs
  }

  const existingUrls = existingDriver
    ? {
        profilePhoto: existingDriver.profilePhoto,
        aadharFront: existingDriver.aadharFront || existingDriver.aadharPhoto,
        aadharBack: existingDriver.aadharBack,
        drivingLicenseFront:
          existingDriver.drivingLicenseFront ||
          existingDriver.drivingLicensePhoto,
        drivingLicenseBack: existingDriver.drivingLicenseBack,
        rcFront: existingDriver.rcFront || existingDriver.rcPhoto,
        rcBack: existingDriver.rcBack,
        rcPhoto: existingDriver.rcPhoto || existingDriver.rcFront,
        insurancePhoto: existingDriver.insurancePhoto,
        pucPhoto: existingDriver.pucPhoto,
        vehiclePermitPhoto: existingDriver.vehiclePermitPhoto,
        fitnessCertificatePhoto: existingDriver.fitnessCertificatePhoto,
        panPhoto: existingDriver.panPhoto,
        vehicleImage: existingDriver.vehicleImage,
        bankProof: existingDriver.bankProof,
      }
    : {};

  const docRules = validateDocumentsForSelections(files, resolved, {
    existingUrls,
  });

  validateVehicleIdentityFields(payload, docRules, resolved);

  let partner = existingDriver;
  if (!partner) {
    const found = await Driver.findOne({ phone: payload.phone });
    if (found) {
      const approved = Array.isArray(found.authorizedServices)
        ? found.authorizedServices
        : [];
      if (approved.length > 0 && found.status === "approved") {
        throw new ValidationError(
          "Delivery partner with this phone already exists",
        );
      }
      // Only allow takeover when no approved modules
      if (approved.length === 0) {
        partner = found;
      } else {
        throw new ValidationError(
          "Delivery partner with this phone already exists",
        );
      }
    }
  }

  const plateNumbers = [
    ...new Set(
      resolved
        .map((item) =>
          String(item.vehicleNumber || payload.vehicleNumber || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  ];
  for (const plate of plateNumbers) {
    await assertUniqueIdentity({
      phone: payload.phone,
      aadharNumber: payload.aadharNumber,
      drivingLicenseNumber: payload.drivingLicenseNumber || undefined,
      vehicleNumber: plate,
      excludeId: partner?._id,
    });
  }
  if (!plateNumbers.length) {
    await assertUniqueIdentity({
      phone: payload.phone,
      aadharNumber: payload.aadharNumber,
      drivingLicenseNumber: payload.drivingLicenseNumber || undefined,
      excludeId: partner?._id,
    });
  }

  // Prevent duplicate pending submissions for same modules
  if (partner) {
    ensureRegisteredServices(partner);
    for (const selection of resolved) {
      const enrollment = getEnrollment(partner, selection.moduleKey);
      if (enrollment.status === "pending") {
        throw new ValidationError(
          `Module ${selection.moduleKey} is already pending review`,
        );
      }
      if (enrollment.status === "approved") {
        throw new ValidationError(
          `Module ${selection.moduleKey} is already approved`,
        );
      }
    }
  }

  const images = await uploadOnboardingImages(files);

  const primaryVehicle = resolved[0];
  const partnerData = {
    name: payload.name,
    phone: payload.phone,
    email: payload.email?.trim() || undefined,
    countryCode: payload.countryCode || "+91",
    address: payload.address || undefined,
    city: payload.city || undefined,
    state: payload.state || undefined,
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined,
    vehicleType:
      primaryVehicle?.legacyVehicleType ||
      primaryVehicle?.vehicle?.name ||
      payload.vehicleType ||
      undefined,
    vehicleConfigurationId: primaryVehicle?.vehicle?._id || null,
    vehicleName:
      primaryVehicle?.vehicle?.name ||
      primaryVehicle?.legacyVehicleType ||
      payload.vehicleType,
    vehicleNumber:
      primaryVehicle?.vehicleNumber || payload.vehicleNumber || undefined,
    vehicleBrand:
      primaryVehicle?.vehicleBrand || payload.vehicleBrand || undefined,
    vehicleModel:
      primaryVehicle?.vehicleModel || payload.vehicleModel || undefined,
    drivingLicenseNumber: payload.drivingLicenseNumber || undefined,
    drivingLicenseExpiry: payload.drivingLicenseExpiry
      ? new Date(payload.drivingLicenseExpiry)
      : undefined,
    aadharNumber: payload.aadharNumber,
    panNumber: payload.panNumber || undefined,
    bankAccountHolderName: payload.bankAccountHolderName || undefined,
    bankAccountNumber: payload.bankAccountNumber || undefined,
    bankIfscCode: payload.bankIfscCode || undefined,
    bankName: payload.bankName || undefined,
    emergencyContactName: payload.emergencyContactName,
    emergencyContactPhone: payload.emergencyContactPhone,
    agreements: {
      partnerAgreement: true,
      termsAccepted: true,
      privacyAccepted: true,
      acceptedAt: new Date(),
    },
    onboardingStep: "submitted",
    documentsRequested: [],
    rejectionReason: null,
    rejectedAt: undefined,
    ...images,
  };

  const { verifyAndConsumeOnboardingPayment } =
    await import("../services/onboardingFee.service.js");

  if (partner) {
    await verifyAndConsumeOnboardingPayment({
      role: "DELIVERY_PARTNER",
      paymentDetails: {
        razorpayOrderId: payload.razorpayOrderId,
        razorpayPaymentId: payload.razorpayPaymentId,
        razorpaySignature: payload.razorpaySignature,
      },
      userDetails: {
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
      },
      entityId: partner._id,
    });

    // Freeze rejected/docs_required baselines BEFORE overwriting profile fields
    ensureRegisteredServices(partner);
    for (const selection of resolved) {
      const enrollment = getEnrollment(partner, selection.moduleKey);
      if (["rejected", "documents_required"].includes(enrollment.status)) {
        ensureDriverResubmitBaseline(partner, enrollment);
      }
    }

    Object.assign(partner, partnerData);
  } else {
    await verifyAndConsumeOnboardingPayment({
      role: "DELIVERY_PARTNER",
      paymentDetails: {
        razorpayOrderId: payload.razorpayOrderId,
        razorpayPaymentId: payload.razorpayPaymentId,
        razorpaySignature: payload.razorpaySignature,
      },
      userDetails: {
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
      },
    });
    partner = new Driver(partnerData);
  }

  ensureRegisteredServices(partner);

  for (const selection of resolved) {
    const enrollment = getEnrollment(partner, selection.moduleKey);
    const fromStatus = enrollment.status || "not_registered";
    const isResubmit = ["rejected", "documents_required"].includes(fromStatus);
    applyEnrollmentSubmission(partner, selection, images, {
      isResubmit,
      performer,
    });
  }

  syncAuthorizedServices(partner);
  syncGlobalDriverStatus(partner);

  if (payload.fcmToken) {
    if (payload.platform === "mobile") {
      partner.fcmTokenMobile = [payload.fcmToken];
    } else {
      partner.fcmTokens = [payload.fcmToken];
    }
  }

  if (!partner.referralCode) {
    // assigned after first save if new
  }

  await partner.save();

  if (!partner.referralCode) {
    partner.referralCode = String(partner._id);
    await partner.save();
  }

  if (payload.razorpayOrderId) {
    try {
      const { OnboardingPaymentLog } =
        await import("../models/onboardingPaymentLog.model.js");
      await OnboardingPaymentLog.updateOne(
        { razorpayOrderId: payload.razorpayOrderId },
        { $set: { entityId: partner._id } },
      );
    } catch {
      /* ignore */
    }
  }

  try {
    const { notifyAdminsSafely } =
      await import("../../../core/notifications/firebase.service.js");
    const moduleNames = resolved.map((item) => item.moduleKey).join(", ");
    void notifyAdminsSafely({
      title: "New Driver Onboarding Request",
      body: `"${partner.name}" applied for: ${moduleNames}`,
      data: {
        type: "new_registration",
        subType: "delivery_partner",
        id: String(partner._id),
        modules: moduleNames,
      },
    });
  } catch {
    /* ignore */
  }

  return serializeDriverOnboarding(partner);
};

export const resubmitRejectedModules = async ({
  driverId,
  body,
  files,
  modules,
}) => {
  const partner = await Driver.findById(driverId);
  if (!partner) throw new NotFoundError("Driver not found");

  const filter = (modules || [])
    .map(toDriverModuleKey)
    .filter(Boolean);

  for (const moduleKey of filter) {
    const enrollment = getEnrollment(partner, moduleKey);
    if (!["rejected", "documents_required"].includes(enrollment.status)) {
      throw new ValidationError(
        `Module ${moduleKey} is not eligible for resubmission`,
      );
    }
  }

  return submitDriverOnboarding({
    body: { ...body, phone: partner.phone },
    files,
    existingDriver: partner,
    modulesFilter: filter.length ? filter : undefined,
  });
};

export const getDriverOnboardingByPhone = async (phoneRaw) => {
  const digits = String(phoneRaw || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (!last10 || last10.length < 8) {
    throw new ValidationError("Valid phone number is required");
  }

  const partner = await Driver.findOne({
    $or: [
      { phone: last10 },
      { phone: digits },
      { phone: { $regex: new RegExp(`${last10}$`) } },
    ],
  });

  if (!partner) {
    return {
      found: false,
      status: null,
      enrollments: [],
      message: "No driver registration found for this number.",
    };
  }

  const serialized = serializePublicOnboardingStatus(partner);
  return serialized;
};

const ONBOARDING_STEP_VALUES = new Set([
  "details",
  "address",
  "documents",
  "review",
  "submitted",
]);

const parseJsonField = (value, fallback) => {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const unsetIfEmpty = (partner, field, value) => {
  const trimmed = value == null ? "" : String(value).trim();
  if (!trimmed) {
    partner[field] = undefined;
    partner.set?.(field, undefined);
    return;
  }
  partner[field] = trimmed;
};

/**
 * Load onboarding draft for the authenticated driver only.
 * @param {string} driverId
 */
export const getDriverOnboardingDraft = async (driverId) => {
  if (!driverId || !mongoose.Types.ObjectId.isValid(String(driverId))) {
    throw new ValidationError("Invalid driver identity");
  }
  const partner = await Driver.findById(driverId);
  if (!partner) throw new NotFoundError("Driver not found");
  return serializeDriverOnboarding(partner);
};

/**
 * Persist step progress onto the Driver document owned by driverId.
 * Does not submit enrollments for review — final submit still uses
 * submitDriverOnboarding / resubmitRejectedModules.
 *
 * @param {{ driverId: string, body: object, files?: object }} args
 */
export const saveDriverOnboardingDraft = async ({
  driverId,
  body = {},
  files = null,
}) => {
  if (!driverId || !mongoose.Types.ObjectId.isValid(String(driverId))) {
    throw new ValidationError("Invalid driver identity");
  }

  const partner = await Driver.findById(driverId);
  if (!partner) throw new NotFoundError("Driver not found");

  const phoneFromBody = String(body.phone || "")
    .replace(/\D/g, "")
    .slice(-10);
  const ownerPhone = String(partner.phone || "")
    .replace(/\D/g, "")
    .slice(-10);
  if (phoneFromBody && ownerPhone && phoneFromBody !== ownerPhone) {
    throw new ValidationError(
      "Phone number does not match the authenticated driver",
    );
  }

  const step = String(body.onboardingStep || body.step || "").trim();
  if (step && ONBOARDING_STEP_VALUES.has(step) && step !== "submitted") {
    partner.onboardingStep = step;
  }

  if (body.name != null) partner.name = String(body.name).trim();
  if (body.email != null) partner.email = String(body.email).trim().toLowerCase();
  if (body.countryCode != null) partner.countryCode = String(body.countryCode);
  if (body.address != null) partner.address = String(body.address).trim();
  if (body.city != null) partner.city = String(body.city).trim();
  if (body.state != null) partner.state = String(body.state).trim();
  if (body.dateOfBirth) {
    const dob = new Date(body.dateOfBirth);
    if (!Number.isNaN(dob.getTime())) partner.dateOfBirth = dob;
  }

  if (body.aadharNumber != null) {
    const aadhaar = String(body.aadharNumber).replace(/\D/g, "");
    if (aadhaar) {
      await assertUniqueIdentity({
        phone: partner.phone,
        aadharNumber: aadhaar,
        excludeId: partner._id,
      });
      partner.aadharNumber = aadhaar;
    } else {
      unsetIfEmpty(partner, "aadharNumber", "");
    }
  }

  if (body.panNumber != null) {
    partner.panNumber = String(body.panNumber).trim().toUpperCase() || undefined;
  }

  if (body.emergencyContactName != null) {
    partner.emergencyContactName = String(body.emergencyContactName).trim();
  }
  if (body.emergencyContactPhone != null) {
    partner.emergencyContactPhone = String(body.emergencyContactPhone)
      .replace(/\D/g, "")
      .slice(-10);
  }

  if (body.vehicleType != null) partner.vehicleType = String(body.vehicleType).trim();
  if (body.vehicleBrand != null) partner.vehicleBrand = String(body.vehicleBrand).trim();
  if (body.vehicleModel != null) partner.vehicleModel = String(body.vehicleModel).trim();
  if (body.vehicleName != null) partner.vehicleName = String(body.vehicleName).trim();
  if (body.vehicleNumber != null) {
    const plate = String(body.vehicleNumber).trim().toUpperCase();
    if (plate) {
      await assertUniqueIdentity({
        phone: partner.phone,
        vehicleNumber: plate,
        excludeId: partner._id,
      });
      partner.vehicleNumber = plate;
    } else {
      unsetIfEmpty(partner, "vehicleNumber", "");
    }
  }
  if (body.vehicleConfigurationId) {
    partner.vehicleConfigurationId = body.vehicleConfigurationId;
  }

  if (body.drivingLicenseNumber != null) {
    const dl = String(body.drivingLicenseNumber).trim().toUpperCase();
    if (dl) {
      await assertUniqueIdentity({
        phone: partner.phone,
        drivingLicenseNumber: dl,
        excludeId: partner._id,
      });
      partner.drivingLicenseNumber = dl;
    } else {
      unsetIfEmpty(partner, "drivingLicenseNumber", "");
    }
  }
  if (body.drivingLicenseExpiry) {
    const expiry = new Date(body.drivingLicenseExpiry);
    if (!Number.isNaN(expiry.getTime())) partner.drivingLicenseExpiry = expiry;
  }

  if (body.bankAccountHolderName != null) {
    partner.bankAccountHolderName = String(body.bankAccountHolderName).trim();
  }
  if (body.bankAccountNumber != null) {
    partner.bankAccountNumber = String(body.bankAccountNumber).replace(/\s/g, "");
  }
  if (body.bankIfscCode != null) {
    partner.bankIfscCode = String(body.bankIfscCode).trim().toUpperCase();
  }
  if (body.bankName != null) partner.bankName = String(body.bankName).trim();

  const draft = partner.onboardingDraft || {};
  let selectedModules = draft.selectedModules || [];
  if (body.selectedModules != null) {
    selectedModules = parseJsonField(body.selectedModules, selectedModules);
    if (!Array.isArray(selectedModules)) selectedModules = [];
    selectedModules = selectedModules.map(String);
  } else if (body.modules != null) {
    const raw = parseJsonField(body.modules, String(body.modules).split(","));
    selectedModules = (Array.isArray(raw) ? raw : []).map(String);
  }

  let moduleVehicles = draft.moduleVehicles || {};
  if (body.moduleVehicles != null) {
    moduleVehicles = parseJsonField(body.moduleVehicles, moduleVehicles) || {};
    if (!moduleVehicles || typeof moduleVehicles !== "object") moduleVehicles = {};
  }
  if (body.moduleSelections != null) {
    const selections = parseJsonField(body.moduleSelections, []);
    if (Array.isArray(selections) && selections.length) {
      selectedModules = selections
        .map((item) => String(item.module || item.moduleKey || ""))
        .filter(Boolean);
      const nextModuleVehicles = {};
      for (const item of selections) {
        const key = String(item.module || item.moduleKey || "");
        if (!key) continue;
        const prev = moduleVehicles[key] || {};
        nextModuleVehicles[key] = {
          vehicleConfigurationId: item.vehicleConfigurationId
            ? String(item.vehicleConfigurationId)
            : prev.vehicleConfigurationId
              ? String(prev.vehicleConfigurationId)
              : "",
          vehicleName: item.vehicleName || prev.vehicleName || "",
          vehicleNumber:
            item.vehicleNumber ||
            prev.vehicleNumber ||
            body.vehicleNumber ||
            "",
          vehicleBrand:
            item.vehicleBrand || prev.vehicleBrand || body.vehicleBrand || "",
          vehicleModel:
            item.vehicleModel || prev.vehicleModel || body.vehicleModel || "",
        };
      }
      moduleVehicles = nextModuleVehicles;
    }
  }

  const nextDraft = {
    selectedModules,
    moduleVehicles:
      moduleVehicles && typeof moduleVehicles === "object" ? moduleVehicles : {},
    partnerAgreement:
      body.partnerAgreement != null
        ? body.partnerAgreement === true || body.partnerAgreement === "true"
        : Boolean(draft.partnerAgreement),
    termsAccepted:
      body.termsAccepted != null
        ? body.termsAccepted === true || body.termsAccepted === "true"
        : Boolean(draft.termsAccepted),
    privacyAccepted:
      body.privacyAccepted != null
        ? body.privacyAccepted === true || body.privacyAccepted === "true"
        : Boolean(draft.privacyAccepted),
    updatedAt: new Date(),
  };
  partner.onboardingDraft = nextDraft;

  if (files) {
    const images = await uploadOnboardingImages(files);
    Object.assign(partner, images);
  }

  await partner.save();
  return serializeDriverOnboarding(partner);
};

export const getOnboardingConfig = getPublicDriverOnboardingConfig;
