import { toDriverModuleKey, DRIVER_MODULE_KEYS } from "./moduleKeys.js";

export const ENROLLMENT_STATUSES = [
  "not_registered",
  "pending",
  "approved",
  "rejected",
  "documents_required",
];

export const emptyEnrollment = () => ({
  status: "not_registered",
  appliedAt: undefined,
  submittedAt: undefined,
  firstSubmittedAt: undefined,
  lastResubmittedAt: undefined,
  submissionCount: 0,
  approvedAt: undefined,
  rejectedAt: undefined,
  rejectionReason: undefined,
  previousStatus: undefined,
  previousRejectionReason: undefined,
  previousSubmission: null,
  changedFields: [],
  documentsRequested: [],
  vehicleConfigurationId: null,
  vehicleName: "",
  vehicleNumber: "",
  vehicleBrand: "",
  vehicleModel: "",
  documents: {},
  approvedBy: null,
  rejectedBy: null,
  reviewHistory: [],
});

export const ensureRegisteredServices = (driver) => {
  if (!driver.registeredServices) {
    driver.registeredServices = {};
  }
  for (const key of DRIVER_MODULE_KEYS) {
    if (!driver.registeredServices[key]) {
      driver.registeredServices[key] = emptyEnrollment();
    }
  }
  return driver.registeredServices;
};

export const getEnrollment = (driver, moduleKey) => {
  const key = toDriverModuleKey(moduleKey);
  if (!key) return null;
  const services = ensureRegisteredServices(driver);
  if (!services[key]) services[key] = emptyEnrollment();
  return services[key];
};

export const setEnrollment = (driver, moduleKey, patch = {}) => {
  const key = toDriverModuleKey(moduleKey);
  if (!key) throw new Error(`Unsupported module: ${moduleKey}`);
  const current = getEnrollment(driver, key);
  Object.assign(current, patch);
  driver.markModified?.("registeredServices");
  return current;
};

export const appendReviewHistory = (
  enrollment,
  { action, note = "", documentsRequested = [], changedBy = null },
) => {
  if (!enrollment.reviewHistory) enrollment.reviewHistory = [];
  enrollment.reviewHistory.push({
    action,
    note: String(note || ""),
    documentsRequested: Array.isArray(documentsRequested)
      ? documentsRequested
      : [],
    changedAt: new Date(),
    changedBy: changedBy || null,
  });
  // Keep history bounded
  if (enrollment.reviewHistory.length > 50) {
    enrollment.reviewHistory = enrollment.reviewHistory.slice(-50);
  }
};

export const listEnrollments = (driver) => {
  const services = ensureRegisteredServices(driver);
  return DRIVER_MODULE_KEYS.map((key) => ({
    module: key,
    ...(services[key]?.toObject?.() || services[key] || emptyEnrollment()),
  })).filter((item) => item.status && item.status !== "not_registered");
};

export const getApprovedModules = (driver) => {
  const services = ensureRegisteredServices(driver);
  return DRIVER_MODULE_KEYS.filter(
    (key) => services[key]?.status === "approved",
  );
};

export const syncAuthorizedServices = (driver) => {
  const approved = getApprovedModules(driver);
  driver.authorizedServices = approved;
  return approved;
};

export const syncGlobalDriverStatus = (driver) => {
  const services = ensureRegisteredServices(driver);
  const statuses = DRIVER_MODULE_KEYS.map((key) => services[key]?.status);

  if (statuses.includes("approved")) {
    driver.status = "approved";
    driver.isActive = driver.isDeleted !== true && driver.accountStatus !== "deleted";
    return driver.status;
  }

  if (statuses.includes("pending")) {
    driver.status = "pending";
    driver.isActive = false;
    return driver.status;
  }

  if (statuses.includes("documents_required")) {
    driver.status = "documents_required";
    driver.isActive = false;
    const first = DRIVER_MODULE_KEYS.find(
      (key) => services[key]?.status === "documents_required",
    );
    driver.documentsRequested = services[first]?.documentsRequested || [];
    return driver.status;
  }

  if (statuses.includes("rejected")) {
    driver.status = "rejected";
    driver.isActive = false;
    const first = DRIVER_MODULE_KEYS.find(
      (key) => services[key]?.status === "rejected",
    );
    driver.rejectionReason = services[first]?.rejectionReason || "";
    driver.rejectedAt = services[first]?.rejectedAt || new Date();
    return driver.status;
  }

  driver.status = "pending";
  driver.isActive = false;
  return driver.status;
};

export const canTransitionEnrollment = (fromStatus, toStatus, via = "admin") => {
  const from = fromStatus || "not_registered";
  const to = toStatus;

  if (via === "submit") {
    return (
      ["not_registered", "rejected", "documents_required"].includes(from) &&
      to === "pending"
    );
  }

  if (via === "admin") {
    if (from === "pending" && ["approved", "rejected", "documents_required"].includes(to)) {
      return true;
    }
    return false;
  }

  return false;
};

export const serializeEnrollment = (moduleKey, enrollment) => {
  const raw = enrollment?.toObject?.() || enrollment || emptyEnrollment();
  const documents =
    raw.documents instanceof Map
      ? Object.fromEntries(raw.documents)
      : raw.documents || {};

  const submissionCount = Number(raw.submissionCount || 0);
  const isResubmission = submissionCount > 1 || Boolean(raw.lastResubmittedAt);
  const reviewCycles = Array.isArray(raw.reviewHistory)
    ? raw.reviewHistory.filter((item) =>
        ["approved", "rejected", "documents_required"].includes(item?.action),
      ).length
    : 0;

  return {
    module: toDriverModuleKey(moduleKey),
    status: raw.status || "not_registered",
    appliedAt: raw.appliedAt || null,
    submittedAt: raw.submittedAt || null,
    firstSubmittedAt: raw.firstSubmittedAt || raw.appliedAt || null,
    lastResubmittedAt: raw.lastResubmittedAt || null,
    submissionCount,
    isResubmission,
    reviewCycles,
    previousStatus: raw.previousStatus || null,
    previousRejectionReason: raw.previousRejectionReason || "",
    previousSubmission: raw.previousSubmission || null,
    changedFields: Array.isArray(raw.changedFields) ? raw.changedFields : [],
    approvedAt: raw.approvedAt || null,
    rejectedAt: raw.rejectedAt || null,
    rejectionReason: raw.rejectionReason || "",
    documentsRequested: raw.documentsRequested || [],
    vehicleConfigurationId: raw.vehicleConfigurationId
      ? String(raw.vehicleConfigurationId)
      : null,
    vehicleName: raw.vehicleName || "",
    vehicleNumber: raw.vehicleNumber || "",
    vehicleBrand: raw.vehicleBrand || "",
    vehicleModel: raw.vehicleModel || "",
    documents,
    approvedBy: raw.approvedBy || null,
    rejectedBy: raw.rejectedBy || null,
    reviewHistory: Array.isArray(raw.reviewHistory) ? raw.reviewHistory : [],
  };
};

/** Safe public status payload — no PII beyond what's needed for verification UX */
export const serializePublicOnboardingStatus = (driver) => {
  const obj = driver?.toObject?.() || driver || {};
  const enrollments = listEnrollments(obj).map((item) => {
    const serialized = serializeEnrollment(item.module, item);
    return {
      module: serialized.module,
      status: serialized.status,
      rejectionReason: serialized.rejectionReason,
      rejectedAt: serialized.rejectedAt,
      approvedAt: serialized.approvedAt,
      appliedAt: serialized.appliedAt,
      documentsRequested: serialized.documentsRequested,
      submittedAt: serialized.submittedAt,
      firstSubmittedAt: serialized.firstSubmittedAt,
      lastResubmittedAt: serialized.lastResubmittedAt,
      submissionCount: serialized.submissionCount,
      isResubmission: serialized.isResubmission,
      reviewHistory: (serialized.reviewHistory || []).map((entry) => ({
        action: entry.action,
        note: entry.note,
        documentsRequested: entry.documentsRequested,
        changedAt: entry.changedAt,
      })),
    };
  });

  // registeredServices statuses are the source of truth; authorizedServices is derived.
  const approvedModules = getApprovedModules(obj);

  return {
    found: true,
    id: String(obj._id),
    status: obj.status,
    hasApprovedModule: approvedModules.length > 0,
    authorizedServices: approvedModules,
    enrollments,
    message: approvedModules.length
      ? "Driver has at least one approved module."
      : "Driver onboarding is awaiting review.",
  };
};
