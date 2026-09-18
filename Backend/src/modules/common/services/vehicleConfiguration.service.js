import mongoose from "mongoose";
import { GlobalSettings } from "../models/settings.model.js";
import { ValidationError, NotFoundError } from "../../../core/auth/errors.js";
import { uploadImageBufferDetailed } from "../../../services/cloudinary.service.js";
import {
  getAllowedModuleKeys,
  MODULE_LABELS,
} from "../utils/moduleSettings.js";

export const VEHICLE_DOCUMENT_TYPES = [
  { key: "rc", label: "RC" },
  { key: "drivingLicense", label: "Driving License" },
  { key: "insurance", label: "Insurance" },
  { key: "puc", label: "Pollution Certificate (PUC)" },
  { key: "vehiclePermit", label: "Vehicle Permit" },
  { key: "fitnessCertificate", label: "Fitness Certificate" },
  { key: "aadhaar", label: "Aadhaar" },
  { key: "pan", label: "PAN" },
  { key: "profilePhoto", label: "Profile Photo" },
  { key: "bankDetails", label: "Bank Details" },
];

const DOCUMENT_KEYS = new Set(VEHICLE_DOCUMENT_TYPES.map((item) => item.key));

const getOrCreateSettings = async () => {
  let settings = await GlobalSettings.findOne();
  if (!settings) settings = await GlobalSettings.create({});
  return settings;
};

const parsePayload = (body = {}) => {
  if (!body.data) return body;
  if (typeof body.data === "object") return body.data;
  try {
    return JSON.parse(body.data);
  } catch {
    throw new ValidationError("Vehicle data must be valid JSON");
  }
};

const sanitizeVehiclePayload = (body = {}) => {
  const payload = parsePayload(body);
  const name = String(payload.name || "").trim();
  if (name.length < 2 || name.length > 80) {
    throw new ValidationError("Vehicle name must be between 2 and 80 characters");
  }

  const status = String(payload.status || "active").toLowerCase();
  if (!["active", "inactive"].includes(status)) {
    throw new ValidationError("Vehicle status must be active or inactive");
  }

  if (!Array.isArray(payload.documents)) {
    throw new ValidationError("Vehicle documents must be a checklist");
  }

  const seen = new Set();
  const documents = payload.documents.map((document) => {
    const key = String(document?.key || "");
    if (!DOCUMENT_KEYS.has(key)) {
      throw new ValidationError("An unsupported vehicle document was selected");
    }
    if (seen.has(key)) {
      throw new ValidationError("Vehicle documents cannot contain duplicates");
    }
    seen.add(key);
    return { key, required: document.required !== false };
  });

  const code = String(payload.code || "").trim().toUpperCase();
  const category = String(payload.category || "").trim();
  const displayOrder = Number(payload.displayOrder) || 0;

  return { name, status, documents, code, category, displayOrder };
};

const serializeConfiguration = (settings) => {
  const allowedModuleKeys = getAllowedModuleKeys(GlobalSettings);
  const rawMappings = settings.moduleVehicleMappings || {};
  const mappings =
    rawMappings instanceof Map ? Object.fromEntries(rawMappings) : rawMappings;

  return {
    vehicles: settings.vehicleConfigurations || [],
    documentTypes: VEHICLE_DOCUMENT_TYPES,
    modules: allowedModuleKeys.map((key) => ({
      key,
      label: MODULE_LABELS[key] || key,
      enabled: settings.modules?.[key] !== false,
    })),
    mappings: Object.fromEntries(
      allowedModuleKeys.map((key) => [
        key,
        Array.isArray(mappings?.[key]) ? mappings[key].map(String) : [],
      ]),
    ),
  };
};

export const getVehicleConfiguration = async () => {
  const settings = await getOrCreateSettings();
  return serializeConfiguration(settings);
};

export const createVehicleConfiguration = async ({ body, file }) => {
  const settings = await getOrCreateSettings();
  const payload = sanitizeVehiclePayload(body);

  const duplicate = settings.vehicleConfigurations.some(
    (vehicle) => vehicle.name.toLowerCase() === payload.name.toLowerCase(),
  );
  if (duplicate) throw new ValidationError("A vehicle with this name already exists");

  if (!payload.code) {
    let maxNum = 0;
    settings.vehicleConfigurations.forEach((v) => {
      const match = (v.code || "").match(/^(?:VC|TV|V)(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    payload.code = `VC${String(maxNum + 1).padStart(3, "0")}`;
  }

  let icon = { url: "", publicId: "" };
  if (file?.buffer) {
    const uploaded = await uploadImageBufferDetailed(
      file.buffer,
      "common/vehicle-configurations",
    );
    icon = { url: uploaded.secure_url, publicId: uploaded.public_id };
  }

  settings.vehicleConfigurations.push({ ...payload, icon });
  
  // Auto-map to taxi module so it appears in the taxi app automatically
  const newVehicle = settings.vehicleConfigurations[settings.vehicleConfigurations.length - 1];
  if (!settings.moduleVehicleMappings) {
    settings.moduleVehicleMappings = {};
  }
  if (!settings.moduleVehicleMappings.taxi) {
    settings.moduleVehicleMappings.taxi = [];
  }
  settings.moduleVehicleMappings.taxi.push(String(newVehicle._id));
  settings.markModified("moduleVehicleMappings");

  await settings.save();
  return serializeConfiguration(settings);
};

export const updateVehicleConfiguration = async ({ id, body, file }) => {
  if (!mongoose.isValidObjectId(id)) throw new ValidationError("Invalid vehicle id");

  const settings = await getOrCreateSettings();
  const vehicle = settings.vehicleConfigurations.id(id);
  if (!vehicle) throw new NotFoundError("Vehicle configuration not found");

  const payload = sanitizeVehiclePayload(body);
  const duplicate = settings.vehicleConfigurations.some(
    (item) =>
      String(item._id) !== String(id) &&
      item.name.toLowerCase() === payload.name.toLowerCase(),
  );
  if (duplicate) throw new ValidationError("A vehicle with this name already exists");

  vehicle.name = payload.name;
  vehicle.status = payload.status;
  vehicle.documents = payload.documents;
  vehicle.code = payload.code;
  vehicle.category = payload.category;
  vehicle.displayOrder = payload.displayOrder;

  if (file?.buffer) {
    const uploaded = await uploadImageBufferDetailed(
      file.buffer,
      "common/vehicle-configurations",
    );
    vehicle.icon = { url: uploaded.secure_url, publicId: uploaded.public_id };
  }

  await settings.save();
  return serializeConfiguration(settings);
};

export const updateVehicleStatus = async ({ id, status }) => {
  if (!mongoose.isValidObjectId(id)) throw new ValidationError("Invalid vehicle id");
  if (!["active", "inactive"].includes(status)) {
    throw new ValidationError("Vehicle status must be active or inactive");
  }

  const settings = await getOrCreateSettings();
  const vehicle = settings.vehicleConfigurations.id(id);
  if (!vehicle) throw new NotFoundError("Vehicle configuration not found");

  vehicle.status = status;
  await settings.save();
  return serializeConfiguration(settings);
};

export const deleteVehicleConfiguration = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new ValidationError("Invalid vehicle id");

  const settings = await getOrCreateSettings();
  const vehicle = settings.vehicleConfigurations.id(id);
  if (!vehicle) throw new NotFoundError("Vehicle configuration not found");

  // Remove from vehicle configurations
  settings.vehicleConfigurations.pull(id);

  // Also remove from any module mappings
  if (settings.moduleVehicleMappings && typeof settings.moduleVehicleMappings === 'object') {
    const rawMappings = settings.moduleVehicleMappings instanceof Map
      ? Object.fromEntries(settings.moduleVehicleMappings)
      : settings.moduleVehicleMappings;
      
    for (const [moduleKey, mappedIds] of Object.entries(rawMappings)) {
      if (Array.isArray(mappedIds)) {
        rawMappings[moduleKey] = mappedIds.filter((mappedId) => String(mappedId) !== String(id));
      }
    }
    
    settings.moduleVehicleMappings = rawMappings;
    settings.markModified("moduleVehicleMappings");
  }

  await settings.save();
  return serializeConfiguration(settings);
};

export const saveModuleVehicleMappings = async (incomingMappings) => {
  if (
    !incomingMappings ||
    typeof incomingMappings !== "object" ||
    Array.isArray(incomingMappings)
  ) {
    throw new ValidationError("Module vehicle mappings must be an object");
  }

  const settings = await getOrCreateSettings();
  const allowedModuleKeys = getAllowedModuleKeys(GlobalSettings);
  const vehicleIds = new Set(
    settings.vehicleConfigurations.map((vehicle) => String(vehicle._id)),
  );

  const mappings = {};
  for (const moduleKey of allowedModuleKeys) {
    const requested = incomingMappings[moduleKey] ?? [];
    if (!Array.isArray(requested)) {
      throw new ValidationError(`Vehicle mapping for ${moduleKey} must be a list`);
    }

    const uniqueIds = [...new Set(requested.map(String))];
    if (uniqueIds.some((id) => !vehicleIds.has(id))) {
      throw new ValidationError(`Vehicle mapping for ${moduleKey} is invalid`);
    }
    mappings[moduleKey] = uniqueIds;
  }

  settings.moduleVehicleMappings = mappings;
  settings.markModified("moduleVehicleMappings");
  await settings.save();
  return serializeConfiguration(settings);
};
