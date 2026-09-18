/** Shared draft helpers + constants for Food Delivery rider onboarding */

import { resolveIdentityRequirementsForVehicle } from "./vehicleIdentityRules";

export const VEHICLE_OPTIONS = [
  {
    id: "bike",
    label: "Bike",
    requiresRegistration: true,
    requiresDl: true,
    icon: "🏍️",
  },
  {
    id: "scooter",
    label: "Scooter",
    requiresRegistration: true,
    requiresDl: true,
    icon: "🛵",
  },
  {
    id: "bicycle",
    label: "Bicycle",
    requiresRegistration: false,
    requiresDl: false,
    icon: "🚲",
  },
];

export const DOC_KEYS = {
  profilePhoto: "Profile Photo",
  aadharFront: "Aadhaar Front",
  aadharBack: "Aadhaar Back",
  panPhoto: "PAN",
  drivingLicenseFront: "Driving License Front",
  drivingLicenseBack: "Driving License Back",
  rcFront: "RC Front",
  rcBack: "RC Back",
  rcPhoto: "RC (Registration Certificate)",
  insurancePhoto: "Vehicle Insurance",
  pucPhoto: "PUC",
  vehiclePermitPhoto: "Vehicle Permit",
  fitnessCertificatePhoto: "Fitness Certificate",
  vehicleImage: "Vehicle Image",
  bankProof: "Bank Proof",
};

export const ALL_DOC_KEYS = Object.keys(DOC_KEYS);

export const ONBOARDING_STEPS = [
  "Personal",
  "Address",
  "Vehicle",
  "Review",
];

export const emptySignupDetails = (overrides = {}) => ({
  name: "",
  phone: "",
  countryCode: "+91",
  ref: "",
  email: "",
  dateOfBirth: "",
  address: "",
  city: "",
  state: "",
  panNumber: "",
  vehicleType: "",
  vehicleBrand: "",
  vehicleModel: "",
  vehicleNumber: "",
  drivingLicenseNumber: "",
  drivingLicenseExpiry: "",
  aadharNumber: "",
  bankAccountHolderName: "",
  bankAccountNumber: "",
  bankIfscCode: "",
  bankName: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  partnerAgreement: false,
  termsAccepted: false,
  privacyAccepted: false,
  /** @type {string[]} driver module keys e.g. food, taxi */
  selectedModules: [],
  /**
   * Per-module vehicle picks:
   * { [moduleKey]: { vehicleConfigurationId, vehicleName } }
   */
  moduleVehicles: {},
  ...overrides,
});

export const emptyUploadedDocs = () =>
  ALL_DOC_KEYS.reduce((acc, key) => {
    acc[key] = null;
    return acc;
  }, {});

/** Digits-only Aadhaar (shared by step validation + submit payload). */
export const normalizeAadhaar = (value) =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(0, 12);

const DB_NAME = "DeliverySignupDB";
const STORE_NAME = "documents";
const IDB_OP_TIMEOUT_MS = 2500;
let cachedDB = null;
let idbDisabled = false;

const withTimeout = (promise, ms, fallback) =>
  new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });

/** Flutter/WebView IndexedDB can hang on open or transactions — fail soft. */
const markIdbUnusable = () => {
  idbDisabled = true;
  cachedDB = null;
};

export const initDB = () =>
  withTimeout(
    new Promise((resolve) => {
      if (idbDisabled) return resolve(null);
      if (cachedDB) return resolve(cachedDB);
      if (typeof indexedDB === "undefined" || !indexedDB) return resolve(null);
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = (e) => {
          cachedDB = e.target.result;
          resolve(cachedDB);
        };
        request.onerror = () => {
          markIdbUnusable();
          resolve(null);
        };
        request.onblocked = () => resolve(null);
      } catch {
        markIdbUnusable();
        resolve(null);
      }
    }),
    IDB_OP_TIMEOUT_MS,
    null,
  ).then((db) => {
    // Open hung (common in Flutter InAppWebView) — skip further attempts
    if (!db && !idbDisabled && !cachedDB && typeof indexedDB !== "undefined") {
      markIdbUnusable();
    }
    return db;
  });

/**
 * Flutter InAppWebView IndexedDB often hangs or cannot restore File objects.
 * Keep binaries in memory so review/submit still has RC Front and other docs.
 */
const memoryDocs = Object.create(null);

export const cacheSignupFile = (key, file) => {
  if (!key) return;
  if (file) memoryDocs[key] = file;
  else delete memoryDocs[key];
};

export const getCachedSignupFile = (key) => memoryDocs[key] || null;

export const clearCachedSignupFiles = () => {
  for (const key of Object.keys(memoryDocs)) delete memoryDocs[key];
};

export const saveFileToDB = async (key, file) => {
  cacheSignupFile(key, file);
  const db = await initDB();
  if (!db) return;
  const ok = await withTimeout(
    new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(file, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    }),
    IDB_OP_TIMEOUT_MS,
    false,
  );
  if (!ok) markIdbUnusable();
};

export const getFileFromDB = async (key) => {
  const cached = getCachedSignupFile(key);
  if (cached) return cached;
  const db = await initDB();
  if (!db) return null;
  const TIMEOUT = Symbol("idb-timeout");
  const result = await withTimeout(
    new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    }),
    IDB_OP_TIMEOUT_MS,
    TIMEOUT,
  );
  if (result === TIMEOUT) {
    markIdbUnusable();
    return null;
  }
  return result;
};

export const removeFileFromDB = async (key) => {
  cacheSignupFile(key, null);
  const db = await initDB();
  if (!db) return;
  try {
    db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key);
  } catch {
    /* ignore */
  }
};

export const clearSignupDB = async () => {
  clearCachedSignupFiles();
  const db = await initDB();
  if (!db) return;
  try {
    db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear();
  } catch {
    /* ignore */
  }
};

export const loadSignupDetails = () => {
  try {
    const authPhone = (() => {
      try {
        const user = JSON.parse(localStorage.getItem("delivery_user") || "null");
        return String(user?.phone || "")
          .replace(/\D/g, "")
          .slice(-10);
      } catch {
        return "";
      }
    })();
    const cachedPhone = String(
      sessionStorage.getItem("deliveryOnboardingPhone") || "",
    )
      .replace(/\D/g, "")
      .slice(-10);
    // Never return another driver's cached draft
    if (authPhone && cachedPhone && authPhone !== cachedPhone) {
      sessionStorage.removeItem("deliverySignupDetails");
      sessionStorage.removeItem("deliverySignupDocs");
      sessionStorage.removeItem("deliveryHighlightedFields");
      sessionStorage.setItem("deliveryOnboardingPhone", authPhone);
      return null;
    }
    const raw = sessionStorage.getItem("deliverySignupDetails");
    if (!raw) return null;
    const parsed = { ...emptySignupDetails(), ...JSON.parse(raw) };
    const draftPhone = String(parsed.phone || "")
      .replace(/\D/g, "")
      .slice(-10);
    if (authPhone && draftPhone && draftPhone !== authPhone) {
      sessionStorage.removeItem("deliverySignupDetails");
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const saveSignupDetails = (details) => {
  const phone = String(details?.phone || "")
    .replace(/\D/g, "")
    .slice(-10);
  if (phone) {
    sessionStorage.setItem("deliveryOnboardingPhone", phone);
  }
  sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details));
};

export const getResubmitModules = () => {
  try {
    const raw = sessionStorage.getItem("deliveryResubmitModules");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

export const setResubmitModules = (modules = []) => {
  sessionStorage.setItem(
    "deliveryResubmitModules",
    JSON.stringify(Array.isArray(modules) ? modules : []),
  );
};

export const isMotorizedVehicle = (vehicleType) =>
  vehicleType === "bike" || vehicleType === "scooter";

export const buildModuleSelectionsPayload = (formData) => {
  const modules = Array.isArray(formData.selectedModules)
    ? formData.selectedModules
    : [];
  const resubmitOnly = getResubmitModules();
  const filtered = resubmitOnly.length
    ? modules.filter((key) => resubmitOnly.includes(key))
    : modules;
  return filtered.map((moduleKey) => {
    const pick = formData.moduleVehicles?.[moduleKey] || {};
    return {
      module: moduleKey,
      vehicleConfigurationId: pick.vehicleConfigurationId || "",
      vehicleName: pick.vehicleName || formData.vehicleType || "",
      vehicleNumber: (
        pick.vehicleNumber ||
        formData.vehicleNumber ||
        ""
      )
        .trim()
        .toUpperCase(),
      vehicleBrand: (pick.vehicleBrand || formData.vehicleBrand || "").trim(),
      vehicleModel: (pick.vehicleModel || formData.vehicleModel || "").trim(),
      drivingLicenseNumber: formData.drivingLicenseNumber || "",
      drivingLicenseExpiry: formData.drivingLicenseExpiry || "",
    };
  });
};

/** Sync root-level vehicle fields from the first selected module (legacy Driver fields). */
export const syncPrimaryVehicleFields = (formData = {}) => {
  const firstKey = (formData.selectedModules || [])[0];
  const pick = firstKey ? formData.moduleVehicles?.[firstKey] : null;
  if (!pick) return formData;
  return {
    ...formData,
    vehicleNumber: pick.vehicleNumber || formData.vehicleNumber || "",
    vehicleBrand: pick.vehicleBrand || formData.vehicleBrand || "",
    vehicleModel: pick.vehicleModel || formData.vehicleModel || "",
    vehicleType: pick.vehicleName || formData.vehicleType || "",
  };
};

const nameOk = (name) =>
  /^[A-Za-z][A-Za-z\s]*[A-Za-z]$/.test((name || "").trim()) ||
  /^[A-Za-z]{2,}$/.test((name || "").trim());

export const validatePersonalStep = (formData = {}) => {
  const errors = {};
  if (!formData.name?.trim()) errors.name = "Full name is required";
  else if (!nameOk(formData.name)) errors.name = "Name can contain letters only";

  if (formData.email?.trim()) {
    if (
      !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
        formData.email.trim().toLowerCase(),
      )
    ) {
      errors.email = "Enter a valid email address";
    }
  }

  if (!formData.dateOfBirth) {
    errors.dateOfBirth = "Date of birth is required";
  } else {
    const dob = new Date(formData.dateOfBirth);
    const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(dob.getTime()) || age < 18)
      errors.dateOfBirth = "You must be at least 18 years old";
  }

  const aadhaar = normalizeAadhaar(formData.aadharNumber);
  if (!aadhaar) errors.aadharNumber = "Aadhaar number is required";
  else if (!/^\d{12}$/.test(aadhaar))
    errors.aadharNumber = "Aadhaar must be 12 digits";

  if (formData.panNumber?.trim()) {
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formData.panNumber.trim().toUpperCase())) {
      errors.panNumber = "Invalid PAN format (e.g., ABCDE1234F)";
    }
  }

  return errors;
};

export const validateAddressStep = (formData = {}) => {
  const errors = {};
  if (!formData.address?.trim()) errors.address = "Address is required";
  if (!formData.city?.trim()) errors.city = "City is required";
  if (!formData.state?.trim()) errors.state = "State is required";

  if (!formData.emergencyContactName?.trim())
    errors.emergencyContactName = "Emergency contact name is required";
  const emergPhone = String(formData.emergencyContactPhone || "").replace(
    /\D/g,
    "",
  );
  if (!emergPhone || emergPhone.length < 10)
    errors.emergencyContactPhone = "Valid mobile number is required";
  else if (
    emergPhone.slice(-10) ===
    String(formData.phone || "")
      .replace(/\D/g, "")
      .slice(-10)
  ) {
    errors.emergencyContactPhone = "Must be different from your mobile number";
  }

  return errors;
};

export const resolveVehicleRequirements = (formData = {}, options = {}) => {
  const modules = options.modules || [];
  const requireConfigVehicles =
    options.requireConfigVehicles !== false && modules.length > 0;

  let needsDl = false;
  let needsPlate = false;
  let needsBank = false;

  if (requireConfigVehicles && modules.length) {
    for (const moduleKey of formData.selectedModules || []) {
      const moduleDef = modules.find((item) => item.key === moduleKey);
      const vehicleId =
        formData.moduleVehicles?.[moduleKey]?.vehicleConfigurationId;
      const vehicle = moduleDef?.vehicles?.find(
        (item) => String(item.id) === String(vehicleId || ""),
      );
      if (!vehicle) continue;
      const identity = resolveIdentityRequirementsForVehicle(vehicle);
      needsDl = needsDl || identity.needsDl;
      needsPlate = needsPlate || identity.needsPlate;
      needsBank = needsBank || identity.needsBank;
    }
  } else {
    const motorized = isMotorizedVehicle(formData.vehicleType);
    needsDl = motorized;
    needsPlate = motorized;
    needsBank = true;
  }

  return { needsDl, needsPlate, needsBank, requireConfigVehicles };
};

/** Prefer per-module vehicle fields; fall back to root legacy fields. */
const pickModuleVehicleField = (formData, moduleKey, field) => {
  const pick = formData.moduleVehicles?.[moduleKey] || {};
  return String(pick[field] || formData[field] || "").trim();
};

export const validateVehicleStep = (formData = {}, options = {}) => {
  const errors = {};
  const { needsDl, needsPlate, requireConfigVehicles } =
    resolveVehicleRequirements(formData, options);
  const modules = options.modules || [];

  if (requireConfigVehicles) {
    if (
      !Array.isArray(formData.selectedModules) ||
      !formData.selectedModules.length
    ) {
      errors.selectedModules = "Select at least one module";
    } else {
      for (const moduleKey of formData.selectedModules) {
        const pick = formData.moduleVehicles?.[moduleKey];
        if (!pick?.vehicleConfigurationId) {
          errors[`vehicle_${moduleKey}`] = `Select a vehicle for ${moduleKey}`;
          continue;
        }
        const moduleDef = modules.find((item) => item.key === moduleKey);
        const vehicle = moduleDef?.vehicles?.find(
          (item) =>
            String(item.id) === String(pick.vehicleConfigurationId || ""),
        );
        // Unknown vehicle id — still require plate identity unless name says bicycle
        const identity = resolveIdentityRequirementsForVehicle(
          vehicle || { name: pick.vehicleName || formData.vehicleType || "" },
        );
        if (identity.needsPlate) {
          const plate = pickModuleVehicleField(
            formData,
            moduleKey,
            "vehicleNumber",
          ).toUpperCase();
          if (!plate) {
            errors[`vehicleNumber_${moduleKey}`] =
              "Vehicle number is required";
          } else if (
            !/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(plate)
          ) {
            errors[`vehicleNumber_${moduleKey}`] =
              "Invalid format (e.g., MH12AB1234)";
          }
          if (!pickModuleVehicleField(formData, moduleKey, "vehicleBrand")) {
            errors[`vehicleBrand_${moduleKey}`] = "Vehicle brand is required";
          }
          if (!pickModuleVehicleField(formData, moduleKey, "vehicleModel")) {
            errors[`vehicleModel_${moduleKey}`] = "Vehicle model is required";
          }
        }
      }
    }
  } else if (!formData.vehicleType) {
    errors.vehicleType = "Select a vehicle type";
  }

  if (needsDl) {
    if (!formData.drivingLicenseNumber?.trim()) {
      errors.drivingLicenseNumber = "Driving license number is required";
    } else if (
      !/^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/.test(
        formData.drivingLicenseNumber.trim().toUpperCase(),
      )
    ) {
      errors.drivingLicenseNumber = "Invalid DL format (e.g., MH1220110012345)";
    }
    if (!formData.drivingLicenseExpiry) {
      errors.drivingLicenseExpiry = "License expiry date is required";
    } else if (new Date(formData.drivingLicenseExpiry).getTime() < Date.now()) {
      errors.drivingLicenseExpiry = "License must not be expired";
    }
  }

  // Legacy single-vehicle path (no module config)
  if (!requireConfigVehicles && needsPlate) {
    if (!formData.vehicleNumber?.trim()) {
      errors.vehicleNumber = "Vehicle number is required";
    } else if (
      !/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(
        formData.vehicleNumber.trim().toUpperCase(),
      )
    ) {
      errors.vehicleNumber = "Invalid format (e.g., MH12AB1234)";
    }
    if (!formData.vehicleBrand?.trim()) {
      errors.vehicleBrand = "Vehicle brand is required";
    }
    if (!formData.vehicleModel?.trim()) {
      errors.vehicleModel = "Vehicle model is required";
    }
  }

  return errors;
};

export const validateBankReviewStep = (formData = {}, options = {}) => {
  const errors = {};
  const { needsBank } = resolveVehicleRequirements(formData, options);

  if (needsBank) {
    if (!formData.bankAccountHolderName?.trim())
      errors.bankAccountHolderName = "Account holder name is required";
    if (!formData.bankAccountNumber?.trim())
      errors.bankAccountNumber = "Account number is required";
    else if (!/^\d{9,18}$/.test(formData.bankAccountNumber.replace(/\s/g, ""))) {
      errors.bankAccountNumber = "Account number must be 9–18 digits";
    }
    if (!formData.bankIfscCode?.trim())
      errors.bankIfscCode = "IFSC code is required";
    else if (
      !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.bankIfscCode.trim().toUpperCase())
    ) {
      errors.bankIfscCode = "Invalid IFSC (e.g., SBIN0001234)";
    }
  }

  if (!formData.partnerAgreement) errors.partnerAgreement = "Required";
  if (!formData.termsAccepted) errors.termsAccepted = "Required";
  if (!formData.privacyAccepted) errors.privacyAccepted = "Required";

  return errors;
};

/**
 * @param {object} formData
 * @param {{ modules?: array, requireConfigVehicles?: boolean }} options
 */
export const validateSignupDetails = (formData, options = {}) => ({
  ...validatePersonalStep(formData),
  ...validateAddressStep(formData),
  ...validateVehicleStep(formData, options),
  ...validateBankReviewStep(formData, options),
});

const readDocUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value.url) return String(value.url).trim();
  return "";
};

const formatAadhaarDisplay = (value) =>
  normalizeAadhaar(value).replace(/(\d{4})(?=\d)/g, "$1 ");

const toDateInput = (value) => {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

/**
 * Infer which form fields / document keys to highlight from an admin
 * rejection reason and any explicitly requested documents.
 */
export const inferHighlightedFields = (
  rejectionReason = "",
  documentsRequested = [],
) => {
  const highlighted = new Set();
  const reason = String(rejectionReason || "").toLowerCase();

  for (const doc of documentsRequested || []) {
    if (doc) highlighted.add(String(doc));
  }

  const rules = [
    { keys: ["name"], patterns: ["name", "full name"] },
    { keys: ["email"], patterns: ["email"] },
    { keys: ["dateOfBirth"], patterns: ["date of birth", "dob", "age"] },
    { keys: ["aadharNumber", "aadharFront", "aadharBack"], patterns: ["aadhaar", "aadhar"] },
    { keys: ["panNumber", "panPhoto"], patterns: ["pan"] },
    {
      keys: ["drivingLicenseNumber", "drivingLicenseExpiry", "drivingLicenseFront", "drivingLicenseBack"],
      patterns: ["driving license", "licence", " dl ", "dl,", "dl."],
    },
    {
      keys: ["vehicleNumber", "vehicleBrand", "vehicleModel", "rcFront", "rcBack", "rcPhoto"],
      patterns: ["vehicle number", "rc", "registration"],
    },
    { keys: ["insurancePhoto"], patterns: ["insurance"] },
    { keys: ["pucPhoto"], patterns: ["puc", "pollution"] },
    { keys: ["vehiclePermitPhoto"], patterns: ["permit"] },
    { keys: ["fitnessCertificatePhoto"], patterns: ["fitness"] },
    { keys: ["profilePhoto"], patterns: ["profile photo", "selfie", "photo"] },
    {
      keys: ["bankAccountHolderName", "bankAccountNumber", "bankIfscCode", "bankName", "bankProof"],
      patterns: ["bank", "ifsc", "account"],
    },
    { keys: ["address", "city", "state"], patterns: ["address", "city", "state"] },
    {
      keys: ["emergencyContactName", "emergencyContactPhone"],
      patterns: ["emergency"],
    },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => reason.includes(pattern.trim()))) {
      rule.keys.forEach((key) => highlighted.add(key));
    }
  }

  return [...highlighted];
};

export const collectOnboardingDocumentUrls = (
  onboarding = {},
  preferredModule = null,
) => {
  const docs = {};
  const merge = (source = {}) => {
    for (const [key, value] of Object.entries(source || {})) {
      const url = readDocUrl(value);
      if (url) docs[key] = url;
    }
  };

  merge(onboarding.documents);
  if (onboarding.profilePhoto) {
    const url = readDocUrl(onboarding.profilePhoto);
    if (url) docs.profilePhoto = url;
  }

  const enrollments = Array.isArray(onboarding.enrollments)
    ? onboarding.enrollments
    : [];
  const preferred = preferredModule
    ? enrollments.find((item) => item.module === preferredModule)
    : null;
  if (preferred?.documents) merge(preferred.documents);
  for (const enrollment of enrollments) {
    if (preferred && enrollment.module === preferred.module) continue;
    merge(enrollment.documents);
  }

  return docs;
};

/**
 * @param {object} onboarding
 * @param {{ preferredModule?: string|null }} [options]
 */
export const prefillFromOnboarding = (onboarding = {}, options = {}) => {
  const enrollments = Array.isArray(onboarding.enrollments)
    ? onboarding.enrollments
    : [];
  const preferredModule = options.preferredModule || null;
  const draftModules = Array.isArray(onboarding.onboardingDraft?.selectedModules)
    ? onboarding.onboardingDraft.selectedModules.map(String)
    : [];
  const enrollmentModules = enrollments
    .filter((item) => item.status && item.status !== "not_registered")
    .map((item) => item.module);
  const selectedModules = draftModules.length
    ? draftModules
    : enrollmentModules;

  const moduleVehicles = {
    ...(onboarding.onboardingDraft?.moduleVehicles &&
    typeof onboarding.onboardingDraft.moduleVehicles === "object"
      ? onboarding.onboardingDraft.moduleVehicles
      : {}),
  };
  for (const item of enrollments) {
    if (!item.module) continue;
    if (item.vehicleConfigurationId || item.vehicleNumber || item.vehicleBrand) {
      moduleVehicles[item.module] = {
        ...(moduleVehicles[item.module] || {}),
        vehicleConfigurationId: item.vehicleConfigurationId
          ? String(item.vehicleConfigurationId)
          : moduleVehicles[item.module]?.vehicleConfigurationId || "",
        vehicleName:
          item.vehicleName || moduleVehicles[item.module]?.vehicleName || "",
        vehicleNumber:
          item.vehicleNumber || moduleVehicles[item.module]?.vehicleNumber || "",
        vehicleBrand:
          item.vehicleBrand || moduleVehicles[item.module]?.vehicleBrand || "",
        vehicleModel:
          item.vehicleModel || moduleVehicles[item.module]?.vehicleModel || "",
      };
    }
  }

  // Heal drafts that only kept vehicleConfigurationId (older save bug)
  const rootNumber = onboarding.vehicle?.number || "";
  const rootBrand = onboarding.vehicle?.brand || "";
  const rootModel = onboarding.vehicle?.model || "";
  const rootName = onboarding.vehicle?.name || onboarding.vehicle?.type || "";
  for (const moduleKey of selectedModules) {
    const prev = moduleVehicles[moduleKey] || {};
    if (!prev.vehicleConfigurationId && !rootNumber && !rootBrand) continue;
    moduleVehicles[moduleKey] = {
      ...prev,
      vehicleConfigurationId: prev.vehicleConfigurationId
        ? String(prev.vehicleConfigurationId)
        : onboarding.vehicle?.configurationId
          ? String(onboarding.vehicle.configurationId)
          : "",
      vehicleName: prev.vehicleName || rootName || "",
      vehicleNumber: prev.vehicleNumber || rootNumber || "",
      vehicleBrand: prev.vehicleBrand || rootBrand || "",
      vehicleModel: prev.vehicleModel || rootModel || "",
    };
  }
  const primary =
    (preferredModule &&
      enrollments.find((item) => item.module === preferredModule)) ||
    enrollments.find((item) =>
      ["rejected", "documents_required", "pending"].includes(item.status),
    ) ||
    enrollments[0] ||
    {};

  const aadhaarRaw =
    onboarding.aadharNumber ||
    onboarding.aadhaarNumber ||
    "";

  const agreements = onboarding.agreements || {};

  return emptySignupDetails({
    name: onboarding.name || "",
    phone: String(onboarding.phone || "")
      .replace(/\D/g, "")
      .slice(-10),
    countryCode: onboarding.countryCode || "+91",
    email: onboarding.email || "",
    dateOfBirth: toDateInput(onboarding.dateOfBirth),
    address: onboarding.address || "",
    city: onboarding.city || "",
    state: onboarding.state || "",
    aadharNumber: formatAadhaarDisplay(aadhaarRaw),
    panNumber: onboarding.panNumber || "",
    vehicleType:
      primary.vehicleName ||
      onboarding.vehicle?.name ||
      onboarding.vehicle?.type ||
      "",
    vehicleBrand: primary.vehicleBrand || onboarding.vehicle?.brand || "",
    vehicleModel: primary.vehicleModel || onboarding.vehicle?.model || "",
    vehicleNumber: primary.vehicleNumber || onboarding.vehicle?.number || "",
    drivingLicenseNumber: onboarding.drivingLicenseNumber || "",
    drivingLicenseExpiry: toDateInput(onboarding.drivingLicenseExpiry),
    bankAccountHolderName: onboarding.bank?.accountHolderName || "",
    bankAccountNumber: onboarding.bank?.accountNumber || "",
    bankIfscCode: onboarding.bank?.ifscCode || "",
    bankName: onboarding.bank?.bankName || "",
    emergencyContactName: onboarding.emergencyContact?.name || "",
    emergencyContactPhone: String(
      onboarding.emergencyContact?.phone || "",
    ).replace(/\D/g, ""),
    partnerAgreement: Boolean(agreements.partnerAgreement),
    termsAccepted: Boolean(agreements.termsAccepted),
    privacyAccepted: Boolean(agreements.privacyAccepted),
    selectedModules: preferredModule
      ? selectedModules.includes(preferredModule)
        ? selectedModules
        : [...selectedModules, preferredModule]
      : selectedModules,
    moduleVehicles,
  });
};

/**
 * Persist a full resubmit draft (form + document URL markers + highlights).
 * Never clears an existing draft unless fresh onboarding data is provided.
 */
export const hydrateResubmitDraft = (
  onboarding,
  {
    preferredModule = null,
    rejectionReason = "",
    documentsRequested = [],
  } = {},
) => {
  if (!onboarding || typeof onboarding !== "object") return null;

  const details = prefillFromOnboarding(onboarding, { preferredModule });
  const docs = collectOnboardingDocumentUrls(onboarding, preferredModule);
  const highlighted = inferHighlightedFields(
    rejectionReason ||
      onboarding.enrollments?.find((item) => item.module === preferredModule)
        ?.rejectionReason ||
      "",
    documentsRequested.length
      ? documentsRequested
      : onboarding.enrollments?.find((item) => item.module === preferredModule)
          ?.documentsRequested || [],
  );

  saveSignupDetails(details);
  sessionStorage.setItem("deliverySignupDocs", JSON.stringify(docs));
  sessionStorage.setItem(
    "deliveryHighlightedFields",
    JSON.stringify(highlighted),
  );
  return { details, docs, highlighted };
};

export const loadHighlightedFields = () => {
  try {
    const raw = sessionStorage.getItem("deliveryHighlightedFields");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export const draftLooksEmpty = (details) => {
  if (!details) return true;
  return !(
    details.name?.trim() ||
    normalizeAadhaar(details.aadharNumber) ||
    details.address?.trim() ||
    details.bankAccountNumber?.trim() ||
    (Array.isArray(details.selectedModules) && details.selectedModules.length)
  );
};
