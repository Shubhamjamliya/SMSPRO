/**
 * Single source of truth for driver onboarding identity fields.
 * Frontend mirrors this file — keep both in sync.
 *
 * Rule: every selected vehicle configuration requires brand / model / number,
 * except explicitly non-plated vehicles (e.g. bicycle). Document checklist
 * only controls DL / bank / uploads — never hides the vehicle number input.
 */

/** Driving license document → DL number + expiry required */
export const VEHICLE_DL_DOCUMENT_KEYS = Object.freeze(["drivingLicense"]);

/** Bank proof document → bank account fields required on review */
export const VEHICLE_BANK_DOCUMENT_KEYS = Object.freeze(["bankDetails"]);

export const isNonPlatedVehicleName = (name = "") => {
  const n = String(name || "").toLowerCase();
  return /\bbicycle\b|\bcycle\b|\be-?cycle\b|\bwalk(?:ing)?\b/.test(n);
};

/**
 * @param {Array<{ key?: string, required?: boolean }>} documents
 */
export const resolveIdentityRequirementsFromDocuments = (documents = []) => {
  let requiresDl = false;
  let requiresBankDetails = false;

  for (const doc of documents || []) {
    if (!doc || doc.required === false) continue;
    const key = String(doc.key || "");
    if (VEHICLE_DL_DOCUMENT_KEYS.includes(key)) requiresDl = true;
    if (VEHICLE_BANK_DOCUMENT_KEYS.includes(key)) requiresBankDetails = true;
  }

  return {
    requiresDl,
    // Plate is decided by vehicle selection, not document keys alone
    requiresVehicleNumber: false,
    requiresBankDetails,
  };
};

/**
 * Full identity rules for a configured vehicle (name + documents).
 * @param {{ name?: string, documents?: array } | null | undefined} vehicle
 */
export const resolveIdentityRequirementsForVehicle = (vehicle) => {
  const fromDocs = resolveIdentityRequirementsFromDocuments(
    vehicle?.documents || [],
  );
  const nonPlated = isNonPlatedVehicleName(vehicle?.name);
  return {
    requiresDl: fromDocs.requiresDl,
    requiresVehicleNumber: !nonPlated,
    requiresBankDetails: fromDocs.requiresBankDetails,
  };
};

/**
 * Legacy bike/scooter path (no vehicle configuration).
 * @param {string} legacyVehicleType
 */
export const resolveLegacyIdentityRequirements = (legacyVehicleType) => {
  const motorized = ["bike", "scooter"].includes(
    String(legacyVehicleType || ""),
  );
  return {
    requiresDl: motorized,
    requiresVehicleNumber: motorized,
    requiresBankDetails: true,
  };
};
