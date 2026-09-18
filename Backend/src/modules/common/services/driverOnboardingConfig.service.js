import mongoose from "mongoose";
import { GlobalSettings } from "../models/settings.model.js";
import { ValidationError } from "../../../core/auth/errors.js";
import {
  getAllowedModuleKeys,
  MODULE_LABELS,
} from "../utils/moduleSettings.js";
import {
  toDriverModuleKey,
  toSettingsModuleKey,
  getModuleLabel,
} from "../utils/moduleKeys.js";
import { VEHICLE_DOCUMENT_TYPES } from "../services/vehicleConfiguration.service.js";

/** Map VehicleConfiguration document keys → multipart upload field names */
export const DOCUMENT_UPLOAD_FIELDS = {
  rc: [
    { field: "rcFront", label: "RC Front", requiredSide: "front" },
    { field: "rcBack", label: "RC Back", requiredSide: "back" },
    // Legacy alias kept for older clients — not required when rcFront is present
    { field: "rcPhoto", label: "RC", requiredSide: "legacy", optional: true },
  ],
  drivingLicense: [
    { field: "drivingLicenseFront", label: "Driving License Front", requiredSide: "front" },
    { field: "drivingLicenseBack", label: "Driving License Back", requiredSide: "back" },
  ],
  insurance: [{ field: "insurancePhoto", label: "Insurance", requiredSide: "single" }],
  puc: [{ field: "pucPhoto", label: "PUC", requiredSide: "single" }],
  vehiclePermit: [
    { field: "vehiclePermitPhoto", label: "Vehicle Permit", requiredSide: "single" },
  ],
  fitnessCertificate: [
    {
      field: "fitnessCertificatePhoto",
      label: "Fitness Certificate",
      requiredSide: "single",
    },
  ],
  aadhaar: [
    { field: "aadharFront", label: "Aadhaar Front", requiredSide: "front" },
    { field: "aadharBack", label: "Aadhaar Back", requiredSide: "back" },
  ],
  pan: [{ field: "panPhoto", label: "PAN", requiredSide: "single" }],
  profilePhoto: [
    { field: "profilePhoto", label: "Profile Photo", requiredSide: "single" },
  ],
  bankDetails: [
    { field: "bankProof", label: "Bank Proof", requiredSide: "single" },
  ],
};

const getOrCreateSettings = async () => {
  let settings = await GlobalSettings.findOne();
  if (!settings) settings = await GlobalSettings.create({});
  return settings;
};

const asPlainMappings = (raw) => {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw);
  return raw;
};

/**
 * Public onboarding configuration — enabled modules + active mapped vehicles
 * + expandable document checklist. No admin-only fields.
 */
export const getPublicDriverOnboardingConfig = async () => {
  const settings = await getOrCreateSettings();
  const allowedKeys = getAllowedModuleKeys(GlobalSettings);
  const mappings = asPlainMappings(settings.moduleVehicleMappings);
  const vehicles = Array.isArray(settings.vehicleConfigurations)
    ? settings.vehicleConfigurations
    : [];

  const activeVehicles = vehicles
    .filter((vehicle) => vehicle.status === "active")
    .map((vehicle) => ({
      id: String(vehicle._id),
      name: vehicle.name,
      icon: vehicle.icon?.url || "",
      documents: Array.isArray(vehicle.documents)
        ? vehicle.documents.map((doc) => ({
            key: doc.key,
            required: doc.required !== false,
            label:
              VEHICLE_DOCUMENT_TYPES.find((item) => item.key === doc.key)
                ?.label || doc.key,
            uploadFields: DOCUMENT_UPLOAD_FIELDS[doc.key] || [],
          }))
        : [],
    }));

  const vehicleById = new Map(activeVehicles.map((v) => [v.id, v]));

  const modules = allowedKeys
    .filter((settingsKey) => settings.modules?.[settingsKey] !== false)
    .map((settingsKey) => {
      const driverKey = toDriverModuleKey(settingsKey);
      const mappedIds = Array.isArray(mappings?.[settingsKey])
        ? mappings[settingsKey].map(String)
        : [];
      const moduleVehicles = mappedIds
        .map((id) => vehicleById.get(id))
        .filter(Boolean);

      return {
        key: driverKey,
        settingsKey,
        label: getModuleLabel(settingsKey, MODULE_LABELS),
        vehicles: moduleVehicles,
      };
    })
    .filter((module) => module.vehicles.length > 0);

  return {
    modules,
    documentTypes: VEHICLE_DOCUMENT_TYPES.map((item) => ({
      ...item,
      uploadFields: DOCUMENT_UPLOAD_FIELDS[item.key] || [],
    })),
  };
};

export const resolveVehicleForModule = async ({
  moduleKey,
  vehicleConfigurationId,
}) => {
  const driverKey = toDriverModuleKey(moduleKey);
  const settingsKey = toSettingsModuleKey(moduleKey);
  if (!driverKey || !settingsKey) {
    throw new ValidationError("Unsupported module selected");
  }

  if (!mongoose.isValidObjectId(vehicleConfigurationId)) {
    throw new ValidationError("Invalid vehicle selection");
  }

  const settings = await getOrCreateSettings();
  if (settings.modules?.[settingsKey] === false) {
    throw new ValidationError("Selected module is currently disabled");
  }

  const mappings = asPlainMappings(settings.moduleVehicleMappings);
  const mappedIds = (mappings?.[settingsKey] || []).map(String);
  const vehicleId = String(vehicleConfigurationId);
  if (!mappedIds.includes(vehicleId)) {
    throw new ValidationError(
      "Selected vehicle is not mapped to the chosen module",
    );
  }

  const vehicle = (settings.vehicleConfigurations || []).id
    ? settings.vehicleConfigurations.id(vehicleId)
    : (settings.vehicleConfigurations || []).find(
        (item) => String(item._id) === vehicleId,
      );

  if (!vehicle || vehicle.status !== "active") {
    throw new ValidationError("Selected vehicle is not available");
  }

  return {
    moduleKey: driverKey,
    settingsKey,
    vehicle,
    documents: Array.isArray(vehicle.documents) ? vehicle.documents : [],
  };
};

export const expandRequiredUploadFields = (vehicleDocuments = []) => {
  const requiredFields = [];
  const optionalFields = [];
  let requiresBankDetails = false;

  for (const doc of vehicleDocuments) {
    if (doc.key === "bankDetails") {
      if (doc.required !== false) {
        requiresBankDetails = true;
        const fields = DOCUMENT_UPLOAD_FIELDS.bankDetails || [];
        for (const field of fields) {
          if (field.optional) continue;
          if (!requiredFields.some((item) => item.field === field.field)) {
            requiredFields.push({ ...field, documentKey: doc.key });
          }
        }
      }
      continue;
    }
    const fields = DOCUMENT_UPLOAD_FIELDS[doc.key] || [];
    for (const field of fields) {
      if (field.optional || field.requiredSide === "legacy") continue;
      const target = doc.required !== false ? requiredFields : optionalFields;
      if (!target.some((item) => item.field === field.field)) {
        target.push({ ...field, documentKey: doc.key });
      }
    }
  }

  return { requiredFields, optionalFields, requiresBankDetails };
};
