import { z } from "zod";
import { ValidationError } from "../../../core/auth/errors.js";
import {
  expandRequiredUploadFields,
  resolveVehicleForModule,
} from "../services/driverOnboardingConfig.service.js";
import { toDriverModuleKey } from "../utils/moduleKeys.js";
import {
  resolveIdentityRequirementsForVehicle,
  resolveLegacyIdentityRequirements,
} from "../utils/vehicleIdentityRules.js";

const phoneSchema = z
  .string()
  .min(8, "Phone must be at least 8 digits")
  .max(15, "Phone must be at most 15 digits");

const aadharRegex = /^[0-9]{12}$/;
const drivingLicenseRegex = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/;
const vehicleNumberRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Strip spaces / formatting so "XXXX XXXX XXXX" validates as 12 digits */
const normalizeAadhaarInput = (val) =>
  String(val ?? "")
    .replace(/\D/g, "")
    .slice(0, 12);

const aadharNumberSchema = z.preprocess(
  normalizeAadhaarInput,
  z.string().regex(aadharRegex, "Invalid Aadhaar format (12 digits)"),
);
const boolFromForm = z.preprocess((val) => {
  if (val === true || val === "true" || val === "1" || val === 1) return true;
  if (val === false || val === "false" || val === "0" || val === 0)
    return false;
  return val;
}, z.boolean());

const optionalDateString = z
  .string()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
    message: "Invalid date",
  });

const parseModuleSelections = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return String(raw)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((module) => ({ module }));
    }
  }
  return [];
};

const baseProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: phoneSchema,
  email: z.string().email().optional().or(z.literal("")),
  countryCode: z.string().optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  aadharNumber: aadharNumberSchema,
  panNumber: z.string().optional().or(z.literal("")),
  bankAccountHolderName: z.string().optional().or(z.literal("")),
  bankAccountNumber: z.string().optional().or(z.literal("")),
  bankIfscCode: z.string().optional().or(z.literal("")),
  bankName: z.string().optional().or(z.literal("")),
  emergencyContactName: z
    .string()
    .min(1, "Emergency contact name is required")
    .max(100),
  emergencyContactPhone: phoneSchema,
  partnerAgreement: boolFromForm,
  termsAccepted: boolFromForm,
  privacyAccepted: boolFromForm,
  drivingLicenseNumber: z.string().optional().or(z.literal("")),
  drivingLicenseExpiry: optionalDateString,
  vehicleNumber: z.string().optional().or(z.literal("")),
  vehicleBrand: z.string().optional().or(z.literal("")),
  vehicleModel: z.string().optional().or(z.literal("")),
  // Legacy single-module fields
  vehicleType: z.string().optional().or(z.literal("")),
  vehicleConfigurationId: z.string().optional().or(z.literal("")),
  modules: z.any().optional(),
  moduleSelections: z.any().optional(),
  ref: z.string().trim().max(64).optional().or(z.literal("")),
  fcmToken: z.string().optional().nullable(),
  platform: z.enum(["web", "mobile"]).optional().default("web"),
  razorpayOrderId: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  razorpaySignature: z.string().optional(),
});

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export const assertFileValid = (file, label = "Document") => {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    throw new ValidationError(`${label} must be under 5MB`);
  }
  if (file.mimetype && !ALLOWED_MIME.has(String(file.mimetype).toLowerCase())) {
    throw new ValidationError(
      `${label} must be an image (JPG, PNG, WEBP, HEIC) or PDF`,
    );
  }
};

export const validateDriverOnboardingPayload = (body = {}) => {
  const parsed = baseProfileSchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.errors?.[0]?.message || "Invalid onboarding payload";
    throw new ValidationError(message);
  }

  const data = parsed.data;
  const dob = new Date(data.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    throw new ValidationError("Invalid date of birth");
  }
  const ageYears =
    (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 18) throw new ValidationError("You must be at least 18 years old");
  if (ageYears > 80) throw new ValidationError("Invalid date of birth");

  if (!data.partnerAgreement || !data.termsAccepted || !data.privacyAccepted) {
    throw new ValidationError("All agreements must be accepted");
  }

  return {
    ...data,
    aadharNumber: normalizeAadhaarInput(data.aadharNumber),
    phone: String(data.phone || "").replace(/\D/g, "").slice(0, 15),
    emergencyContactPhone: String(data.emergencyContactPhone || "")
      .replace(/\D/g, "")
      .slice(0, 15),
  };
};

/**
 * Normalize moduleSelections from multipart body.
 * Accepts:
 *  - moduleSelections: JSON [{ module, vehicleConfigurationId, vehicleNumber, ... }]
 *  - modules: "food,taxi" + vehicleConfigurationId (legacy single vehicle for all)
 *  - vehicleType / vehicleConfigurationId alone → food only (legacy)
 */
export const normalizeModuleSelections = (payload = {}) => {
  const fromJson = parseModuleSelections(
    payload.moduleSelections || payload.modulesJson,
  );

  if (fromJson.length) {
    return fromJson
      .map((item) => {
        if (typeof item === "string") {
          return {
            module: toDriverModuleKey(item),
            vehicleConfigurationId: payload.vehicleConfigurationId,
          };
        }
        return {
          module: toDriverModuleKey(item.module || item.key),
          vehicleConfigurationId:
            item.vehicleConfigurationId ||
            item.vehicleId ||
            payload.vehicleConfigurationId,
          vehicleNumber: item.vehicleNumber || payload.vehicleNumber,
          vehicleBrand: item.vehicleBrand || payload.vehicleBrand,
          vehicleModel: item.vehicleModel || payload.vehicleModel,
          drivingLicenseNumber:
            item.drivingLicenseNumber || payload.drivingLicenseNumber,
          drivingLicenseExpiry:
            item.drivingLicenseExpiry || payload.drivingLicenseExpiry,
        };
      })
      .filter((item) => item.module);
  }

  // modules as array: ["food","taxi"] or [{module:"food",...}]
  if (Array.isArray(payload.modules) && payload.modules.length) {
    return payload.modules
      .map((item) => {
        if (typeof item === "string") {
          return {
            module: toDriverModuleKey(item),
            vehicleConfigurationId: payload.vehicleConfigurationId,
            vehicleNumber: payload.vehicleNumber,
            vehicleBrand: payload.vehicleBrand,
            vehicleModel: payload.vehicleModel,
            drivingLicenseNumber: payload.drivingLicenseNumber,
            drivingLicenseExpiry: payload.drivingLicenseExpiry,
          };
        }
        return {
          module: toDriverModuleKey(item?.module || item?.key),
          vehicleConfigurationId:
            item?.vehicleConfigurationId ||
            item?.vehicleId ||
            payload.vehicleConfigurationId,
          vehicleNumber: item?.vehicleNumber || payload.vehicleNumber,
          vehicleBrand: item?.vehicleBrand || payload.vehicleBrand,
          vehicleModel: item?.vehicleModel || payload.vehicleModel,
          drivingLicenseNumber:
            item?.drivingLicenseNumber || payload.drivingLicenseNumber,
          drivingLicenseExpiry:
            item?.drivingLicenseExpiry || payload.drivingLicenseExpiry,
        };
      })
      .filter((item) => item.module);
  }

  // Comma-separated modules with shared vehicle
  if (typeof payload.modules === "string" && payload.modules.trim()) {
    return payload.modules
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((module) => ({
        module: toDriverModuleKey(module),
        vehicleConfigurationId: payload.vehicleConfigurationId,
        vehicleNumber: payload.vehicleNumber,
        vehicleBrand: payload.vehicleBrand,
        vehicleModel: payload.vehicleModel,
        drivingLicenseNumber: payload.drivingLicenseNumber,
        drivingLicenseExpiry: payload.drivingLicenseExpiry,
      }))
      .filter((item) => item.module);
  }

  // Legacy food-only registration — only when no explicit modules provided
  if (payload.vehicleConfigurationId || payload.vehicleType) {
    const fallbackModule = toDriverModuleKey(payload.primaryModule) || "food";
    return [
      {
        module: fallbackModule,
        vehicleConfigurationId: payload.vehicleConfigurationId || null,
        vehicleType: payload.vehicleType || null,
        vehicleNumber: payload.vehicleNumber,
        vehicleBrand: payload.vehicleBrand,
        vehicleModel: payload.vehicleModel,
        drivingLicenseNumber: payload.drivingLicenseNumber,
        drivingLicenseExpiry: payload.drivingLicenseExpiry,
      },
    ];
  }

  throw new ValidationError("Select at least one module to onboard");
};

export const validateModuleVehicleSelections = async (selections = []) => {
  if (!Array.isArray(selections) || selections.length === 0) {
    throw new ValidationError("Select at least one module to onboard");
  }

  const seen = new Set();
  const resolved = [];

  for (const selection of selections) {
    const moduleKey = toDriverModuleKey(selection.module);
    if (!moduleKey) {
      throw new ValidationError("Invalid module selection");
    }
    if (seen.has(moduleKey)) {
      throw new ValidationError(`Duplicate module selection: ${moduleKey}`);
    }
    seen.add(moduleKey);

    // Legacy path: vehicleType without vehicleConfigurationId
    if (!selection.vehicleConfigurationId && selection.vehicleType) {
      resolved.push({
        moduleKey,
        legacyVehicleType: selection.vehicleType,
        vehicle: null,
        documents: [],
        vehicleNumber: selection.vehicleNumber,
        vehicleBrand: selection.vehicleBrand,
        vehicleModel: selection.vehicleModel,
        drivingLicenseNumber: selection.drivingLicenseNumber,
        drivingLicenseExpiry: selection.drivingLicenseExpiry,
      });
      continue;
    }

    if (!selection.vehicleConfigurationId) {
      throw new ValidationError(
        `Select a vehicle for module ${moduleKey}`,
      );
    }

    const resolvedVehicle = await resolveVehicleForModule({
      moduleKey,
      vehicleConfigurationId: selection.vehicleConfigurationId,
    });

    resolved.push({
      moduleKey,
      vehicle: resolvedVehicle.vehicle,
      documents: resolvedVehicle.documents,
      vehicleNumber: selection.vehicleNumber,
      vehicleBrand: selection.vehicleBrand,
      vehicleModel: selection.vehicleModel,
      drivingLicenseNumber: selection.drivingLicenseNumber,
      drivingLicenseExpiry: selection.drivingLicenseExpiry,
    });
  }

  return resolved;
};

export const validateDocumentsForSelections = (
  files = {},
  resolvedSelections = [],
  { existingUrls = {}, allowPartial = false, requestedDocs = [] } = {},
) => {
  const pick = (...names) => {
    for (const name of names) {
      if (files?.[name]?.[0]) return files[name][0];
      if (files?.[name] && !Array.isArray(files[name])) return files[name];
    }
    return null;
  };

  // Union of required upload fields across selected vehicles
  const requiredFieldMap = new Map();
  let requiresBankDetails = false;
  let requiresDl = false;
  let requiresVehicleNumber = false;

  for (const selection of resolvedSelections) {
    if (selection.legacyVehicleType) {
      const legacy = resolveLegacyIdentityRequirements(
        selection.legacyVehicleType,
      );
      requiresDl = requiresDl || legacy.requiresDl;
      requiresVehicleNumber =
        requiresVehicleNumber || legacy.requiresVehicleNumber;
      requiresBankDetails = requiresBankDetails || legacy.requiresBankDetails;
      const legacyRequired = legacy.requiresDl
        ? [
            "profilePhoto",
            "aadharFront",
            "aadharBack",
            "drivingLicenseFront",
            "drivingLicenseBack",
            "rcFront",
            "rcBack",
            "insurancePhoto",
          ]
        : ["profilePhoto", "aadharFront", "aadharBack"];
      for (const field of legacyRequired) {
        requiredFieldMap.set(field, { field, label: field });
      }
      continue;
    }

    const expanded = expandRequiredUploadFields(selection.documents);
    requiresBankDetails = requiresBankDetails || expanded.requiresBankDetails;
    for (const field of expanded.requiredFields) {
      requiredFieldMap.set(field.field, field);
    }

    const identity = resolveIdentityRequirementsForVehicle({
      name: selection.vehicle?.name || selection.vehicleName,
      documents: selection.documents,
    });
    requiresDl = requiresDl || identity.requiresDl;
    requiresVehicleNumber =
      requiresVehicleNumber || identity.requiresVehicleNumber;
    requiresBankDetails =
      requiresBankDetails || identity.requiresBankDetails;
  }

  const requiredFields = allowPartial
    ? [...requiredFieldMap.values()].filter((item) =>
        requestedDocs.includes(item.field),
      )
    : [...requiredFieldMap.values()];

  for (const field of requiredFields) {
    const file = pick(
      field.field,
      field.field === "aadharFront" ? "aadharPhoto" : null,
      field.field === "drivingLicenseFront" ? "drivingLicensePhoto" : null,
      field.field === "rcFront" ? "rcPhoto" : null,
    );
    const hasExisting = Boolean(
      existingUrls?.[field.field] ||
        (field.field === "rcFront" && existingUrls?.rcPhoto) ||
        (field.field === "rcPhoto" &&
          (existingUrls?.rcFront || existingUrls?.rcPhoto)),
    );
    if (!file && !hasExisting) {
      throw new ValidationError(`${field.label || field.field} is required`);
    }
    if (file) assertFileValid(file, field.label || field.field);
  }

  // Validate any provided optional files too
  for (const list of Object.values(files || {})) {
    const file = Array.isArray(list) ? list[0] : list;
    if (file) assertFileValid(file);
  }

  return {
    requiredFields,
    requiresBankDetails,
    requiresDl,
    requiresVehicleNumber,
  };
};

export const validateVehicleIdentityFields = (
  payload,
  { requiresDl, requiresVehicleNumber, requiresBankDetails },
  resolvedSelections = [],
) => {
  if (requiresDl) {
    const dl = String(payload.drivingLicenseNumber || "")
      .trim()
      .toUpperCase();
    if (!dl) throw new ValidationError("Driving license number is required");
    if (!drivingLicenseRegex.test(dl)) {
      throw new ValidationError(
        "Invalid driving license format (e.g., MH1220110012345)",
      );
    }
    if (!payload.drivingLicenseExpiry) {
      throw new ValidationError("Driving license expiry date is required");
    }
    const expiry = new Date(payload.drivingLicenseExpiry);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() < Date.now()) {
      throw new ValidationError("Driving license must not be expired");
    }
  }

  const selections =
    Array.isArray(resolvedSelections) && resolvedSelections.length
      ? resolvedSelections
      : [
          {
            moduleKey: "",
            documents: [],
            legacyVehicleType: payload.vehicleType,
            vehicleNumber: payload.vehicleNumber,
            vehicleBrand: payload.vehicleBrand,
            vehicleModel: payload.vehicleModel,
          },
        ];

  let anyPlateRequired = false;
  for (const selection of selections) {
    const identity = selection.legacyVehicleType
      ? resolveLegacyIdentityRequirements(selection.legacyVehicleType)
      : resolveIdentityRequirementsForVehicle({
          name: selection.vehicle?.name || selection.vehicleName,
          documents: selection.documents || [],
        });
    const needsPlate =
      identity.requiresVehicleNumber ||
      (!selection.documents?.length &&
        !selection.legacyVehicleType &&
        requiresVehicleNumber);
    if (!needsPlate) continue;
    anyPlateRequired = true;

    const number = String(
      selection.vehicleNumber || payload.vehicleNumber || "",
    )
      .trim()
      .toUpperCase()
      .replace(/\s/g, "");
    const brand = String(
      selection.vehicleBrand || payload.vehicleBrand || "",
    ).trim();
    const model = String(
      selection.vehicleModel || payload.vehicleModel || "",
    ).trim();
    const label = selection.moduleKey
      ? ` for ${selection.moduleKey}`
      : "";

    if (!number) {
      throw new ValidationError(`Vehicle number is required${label}`);
    }
    if (!vehicleNumberRegex.test(number)) {
      throw new ValidationError(`Invalid vehicle number format${label}`);
    }
    if (!brand) {
      throw new ValidationError(`Vehicle brand is required${label}`);
    }
    if (!model) {
      throw new ValidationError(`Vehicle model is required${label}`);
    }
  }

  // Fallback when aggregated flag is set but selections had no docs (legacy)
  if (requiresVehicleNumber && !anyPlateRequired && !selections.length) {
    const number = String(payload.vehicleNumber || "")
      .trim()
      .toUpperCase()
      .replace(/\s/g, "");
    if (!number) throw new ValidationError("Vehicle number is required");
    if (!vehicleNumberRegex.test(number)) {
      throw new ValidationError("Invalid vehicle number format");
    }
    if (!String(payload.vehicleBrand || "").trim()) {
      throw new ValidationError("Vehicle brand is required");
    }
    if (!String(payload.vehicleModel || "").trim()) {
      throw new ValidationError("Vehicle model is required");
    }
  }

  if (requiresBankDetails) {
    if (!payload.bankAccountHolderName?.trim()) {
      throw new ValidationError("Account holder name is required");
    }
    if (!/^[0-9]{9,18}$/.test(String(payload.bankAccountNumber || ""))) {
      throw new ValidationError("Account number must be 9–18 digits");
    }
    if (
      !ifscRegex.test(String(payload.bankIfscCode || "").trim().toUpperCase())
    ) {
      throw new ValidationError("Invalid IFSC code");
    }
  }
};
