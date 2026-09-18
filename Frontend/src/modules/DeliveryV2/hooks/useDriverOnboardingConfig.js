import { useCallback, useEffect, useState } from "react";
import {
  getDeliveryOnboardingConfig,
  getPublicDriverOnboardingConfig,
} from "@/modules/common/api/driverOnboarding";

let cachedConfig = null;
let inflight = null;

const loadConfig = async () => {
  if (cachedConfig) return cachedConfig;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      try {
        cachedConfig = await getDeliveryOnboardingConfig();
      } catch {
        cachedConfig = await getPublicDriverOnboardingConfig();
      }
      return cachedConfig;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
};

export const useDriverOnboardingConfig = () => {
  const [config, setConfig] = useState(cachedConfig);
  const [loading, setLoading] = useState(!cachedConfig);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      cachedConfig = null;
      const next = await loadConfig();
      setConfig(next);
      return next;
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load onboarding config");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const next = await loadConfig();
        if (mounted) setConfig(next);
      } catch (err) {
        if (mounted) {
          setError(
            err?.response?.data?.message || "Failed to load onboarding config",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return {
    config,
    modules: config?.modules || [],
    documentTypes: config?.documentTypes || [],
    loading,
    error,
    refresh,
  };
};

/**
 * Build a multi-module document plan from selected service/vehicle pairs.
 * - Groups fields by module + vehicle for UI
 * - Deduplicates uploads by field key (upload once, reuse everywhere)
 * - If any selected vehicle marks a doc required, it is required overall
 *
 * @param {Array<{ moduleKey: string, moduleLabel?: string, vehicle: object }>} selections
 */
export const buildMultiModuleDocumentPlan = (selections = []) => {
  const groups = [];
  const requiredMap = new Map();
  const optionalMap = new Map();
  const fieldOwners = new Map(); // field -> { moduleKey, moduleLabel, vehicleName }
  const fieldUsedBy = new Map(); // field -> [{ moduleKey, moduleLabel, vehicleName }]
  let requiresBankDetails = false;

  const registerUsage = (field, meta) => {
    const list = fieldUsedBy.get(field) || [];
    if (!list.some((item) => item.moduleKey === meta.moduleKey)) {
      list.push(meta);
      fieldUsedBy.set(field, list);
    }
  };

  for (const selection of selections) {
    const vehicle = selection?.vehicle;
    if (!vehicle) continue;

    const moduleMeta = {
      moduleKey: selection.moduleKey,
      moduleLabel: selection.moduleLabel || selection.moduleKey,
      vehicleName: vehicle.name || "Vehicle",
      vehicleId: vehicle.id || vehicle._id || "",
    };

    const groupFields = [];

    for (const doc of vehicle.documents || []) {
      const isRequired = doc.required !== false;
      if (doc.key === "bankDetails" && isRequired) {
        requiresBankDetails = true;
      }

      for (const upload of doc.uploadFields || []) {
        if (upload.optional || upload.requiredSide === "legacy") continue;

        const entry = {
          field: upload.field,
          label: upload.label || doc.label || upload.field,
          documentKey: doc.key,
          required: isRequired,
        };

        registerUsage(entry.field, moduleMeta);

        // Global required wins across modules
        if (isRequired) {
          optionalMap.delete(entry.field);
          if (!requiredMap.has(entry.field)) {
            requiredMap.set(entry.field, { ...entry, required: true });
          } else {
            requiredMap.set(entry.field, {
              ...requiredMap.get(entry.field),
              required: true,
            });
          }
        } else if (
          !requiredMap.has(entry.field) &&
          !optionalMap.has(entry.field)
        ) {
          optionalMap.set(entry.field, { ...entry, required: false });
        }

        const alreadyOwned = fieldOwners.has(entry.field);
        if (!alreadyOwned) {
          fieldOwners.set(entry.field, moduleMeta);
        }

        groupFields.push({
          ...entry,
          // First module to list this field owns the upload widget
          sharedFrom: alreadyOwned ? fieldOwners.get(entry.field) : null,
          isPrimaryUpload: !alreadyOwned,
        });
      }
    }

    if (groupFields.length) {
      groups.push({
        ...moduleMeta,
        fields: groupFields,
      });
    }
  }

  // Promote group-level required flags from global merge
  for (const group of groups) {
    group.fields = group.fields.map((field) => {
      const globalRequired = requiredMap.has(field.field);
      return {
        ...field,
        required: globalRequired,
        alsoUsedBy: (fieldUsedBy.get(field.field) || []).filter(
          (item) => item.moduleKey !== group.moduleKey,
        ),
      };
    });
  }

  const requiredFields = [...requiredMap.values()];
  const optionalFields = [...optionalMap.values()].filter(
    (item) => !requiredMap.has(item.field),
  );
  const configuredFields = [...requiredFields, ...optionalFields];

  return {
    groups,
    requiredFields,
    optionalFields,
    configuredFields,
    requiresBankDetails,
    fieldUsedBy,
  };
};

/**
 * Flat collector used when only a vehicle list is available (no module labels).
 */
export const collectConfiguredUploadFields = (selectedModuleVehicles = []) => {
  const selections = (selectedModuleVehicles || []).map((vehicle, index) => ({
    moduleKey: `vehicle-${index}`,
    moduleLabel: vehicle?.name || `Vehicle ${index + 1}`,
    vehicle,
  }));
  return buildMultiModuleDocumentPlan(selections);
};

/** @deprecated Prefer collectConfiguredUploadFields / buildMultiModuleDocumentPlan */
export const collectRequiredUploadFields = (selectedModuleVehicles = []) => {
  const { requiredFields, requiresBankDetails } = collectConfiguredUploadFields(
    selectedModuleVehicles,
  );
  return { requiredFields, requiresBankDetails };
};
