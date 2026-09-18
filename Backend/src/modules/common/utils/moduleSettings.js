import { ValidationError } from "../../../core/auth/errors.js";

export const MODULE_LABELS = {
  food: "Food Delivery",
  quickCommerce: "Quick Commerce",
  porter: "Porter / Logistics",
  taxi: "Taxi",
  bikeRent: "Bike Rent",
};

export function getAllowedModuleKeys(GlobalSettingsModel) {
  return Object.keys(GlobalSettingsModel.schema.paths)
    .filter((path) => path.startsWith("modules."))
    .map((path) => path.replace("modules.", ""));
}

export function sanitizeIncomingModules(incomingModules, allowedKeys) {
  if (incomingModules === undefined || incomingModules === null) {
    return null;
  }

  if (typeof incomingModules !== "object" || Array.isArray(incomingModules)) {
    throw new ValidationError("Modules must be a valid configuration object");
  }

  const sanitized = {};
  for (const key of allowedKeys) {
    if (incomingModules[key] === undefined) continue;
    sanitized[key] =
      incomingModules[key] === true || incomingModules[key] === "true";
  }

  return sanitized;
}

export function mergeModuleSettings({
  allowedKeys,
  currentModules = {},
  incomingModules = null,
}) {
  const nextModules = {};

  allowedKeys.forEach((mod) => {
    if (incomingModules && incomingModules[mod] !== undefined) {
      nextModules[mod] = !!incomingModules[mod];
      return;
    }

    if (currentModules[mod] !== undefined) {
      nextModules[mod] = !!currentModules[mod];
      return;
    }

    nextModules[mod] = true;
  });

  return nextModules;
}

export function countEnabledModules(modules = {}, allowedKeys = []) {
  return allowedKeys.filter((key) => modules[key] !== false).length;
}

export function assertAtLeastOneModuleEnabled(modules = {}, allowedKeys = []) {
  if (countEnabledModules(modules, allowedKeys) === 0) {
    throw new ValidationError(
      "At least one customer module must remain enabled",
    );
  }
}

export function cleanModulesForResponse(rawModules = {}, allowedKeys = []) {
  const cleaned = {};
  allowedKeys.forEach((mod) => {
    cleaned[mod] = rawModules?.[mod] !== undefined ? !!rawModules[mod] : true;
  });
  return cleaned;
}
