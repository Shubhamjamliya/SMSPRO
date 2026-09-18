/**
 * Mirrors Backend/src/modules/common/utils/vehicleIdentityRules.js
 *
 * Every selected vehicle needs brand / model / number (except bicycle).
 * Document checklist only drives DL / bank / photo uploads.
 */

export const VEHICLE_DL_DOCUMENT_KEYS = Object.freeze(["drivingLicense"]);

export const VEHICLE_BANK_DOCUMENT_KEYS = Object.freeze(["bankDetails"]);

export const isNonPlatedVehicleName = (name = "") => {
  const n = String(name || "").toLowerCase();
  return /\bbicycle\b|\bcycle\b|\be-?cycle\b|\bwalk(?:ing)?\b/.test(n);
};

export const resolveIdentityRequirementsFromDocuments = (documents = []) => {
  let needsDl = false;
  let needsBank = false;

  for (const doc of documents || []) {
    if (!doc || doc.required === false) continue;
    const key = String(doc.key || "");
    if (VEHICLE_DL_DOCUMENT_KEYS.includes(key)) needsDl = true;
    if (VEHICLE_BANK_DOCUMENT_KEYS.includes(key)) needsBank = true;
  }

  return {
    needsDl,
    needsPlate: false,
    needsBank,
  };
};

/**
 * @param {{ name?: string, documents?: array } | null | undefined} vehicle
 */
export const resolveIdentityRequirementsForVehicle = (vehicle) => {
  const fromDocs = resolveIdentityRequirementsFromDocuments(
    vehicle?.documents || [],
  );
  const nonPlated = isNonPlatedVehicleName(vehicle?.name);
  return {
    needsDl: fromDocs.needsDl,
    needsPlate: !nonPlated,
    needsBank: fromDocs.needsBank,
  };
};
