/**
 * Lightweight unit checks for module-key + enrollment + resubmit helpers.
 * Run: node scripts/test-driver-onboarding-helpers.js
 */
import {
  toDriverModuleKey,
  toSettingsModuleKey,
  getPermissionRootForModule,
} from "../src/modules/common/utils/moduleKeys.js";
import { canTransitionEnrollment } from "../src/modules/common/utils/driverEnrollment.js";
import {
  buildDriverChangedFields,
  buildDriverEnrollmentSnapshot,
  ensureDriverResubmitBaseline,
  markEnrollmentSubmissionMeta,
} from "../src/modules/common/services/driverOnboardingWorkflow.js";
import { expandRequiredUploadFields } from "../src/modules/common/services/driverOnboardingConfig.service.js";
import { normalizeModuleSelections } from "../src/modules/common/validators/driverOnboarding.validator.js";
import {
  resolveIdentityRequirementsForVehicle,
  resolveLegacyIdentityRequirements,
} from "../src/modules/common/utils/vehicleIdentityRules.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(toDriverModuleKey("quickCommerce") === "quick-commerce", "camel → kebab");
assert(toSettingsModuleKey("quick-commerce") === "quickCommerce", "kebab → camel");
assert(toDriverModuleKey("taxi") === "taxi", "taxi identity");
assert(getPermissionRootForModule("quick-commerce") === "quick", "qc permission root");
assert(getPermissionRootForModule("food") === "food", "food permission root");

assert(
  canTransitionEnrollment("not_registered", "pending", "submit"),
  "new submit allowed",
);
assert(
  canTransitionEnrollment("rejected", "pending", "submit"),
  "rejected resubmit allowed",
);
assert(
  canTransitionEnrollment("documents_required", "pending", "submit"),
  "docs required resubmit allowed",
);
assert(
  !canTransitionEnrollment("pending", "pending", "submit"),
  "duplicate pending blocked",
);
assert(
  !canTransitionEnrollment("approved", "pending", "submit"),
  "approved cannot resubmit",
);
assert(
  canTransitionEnrollment("pending", "approved", "admin"),
  "admin approve allowed",
);
assert(
  canTransitionEnrollment("pending", "rejected", "admin"),
  "admin reject allowed",
);
assert(
  !canTransitionEnrollment("approved", "rejected", "admin"),
  "invalid admin transition blocked",
);

// Snapshot + changed fields
const driver = {
  name: "Aman",
  phone: "9876543210",
  email: "a@b.com",
  address: "Old Street",
  vehicleNumber: "MH12AB1234",
  insurancePhoto: "https://cdn.example/old-insurance.jpg",
};
const enrollment = {
  status: "rejected",
  rejectionReason: "Insurance expired",
  vehicleName: "Bike",
  vehicleNumber: "MH12AB1234",
  documents: {
    insurancePhoto: { url: "https://cdn.example/old-insurance.jpg" },
  },
};

const baseline = ensureDriverResubmitBaseline(driver, enrollment);
assert(baseline.name === "Aman", "baseline captures name");
assert(baseline.address === "Old Street", "baseline captures address");
assert(
  baseline.insurancePhoto === "https://cdn.example/old-insurance.jpg",
  "baseline captures insurance",
);

const nextDriver = {
  ...driver,
  address: "New Street",
  insurancePhoto: "https://cdn.example/new-insurance.jpg",
};
const nextEnrollment = {
  ...enrollment,
  status: "pending",
  vehicleNumber: "MH12CD5678",
  documents: {
    insurancePhoto: { url: "https://cdn.example/new-insurance.jpg" },
  },
};
const current = buildDriverEnrollmentSnapshot(nextDriver, nextEnrollment);
const changed = buildDriverChangedFields(current, baseline);
assert(
  changed.some((item) => item.field === "address" && item.after === "New Street"),
  "address change detected",
);
assert(
  changed.some(
    (item) =>
      item.field === "vehicleNumber" && item.after === "MH12CD5678",
  ),
  "vehicle number change detected",
);
assert(
  changed.some(
    (item) =>
      item.field === "insurancePhoto" && item.isDocument === true,
  ),
  "insurance document change detected",
);
assert(
  !changed.some((item) => item.field === "phone"),
  "unchanged phone not listed",
);

const metaEnrollment = { submissionCount: 0 };
markEnrollmentSubmissionMeta(metaEnrollment, { isResubmit: false });
assert(metaEnrollment.submissionCount === 1, "first submission count");
assert(metaEnrollment.firstSubmittedAt, "first submitted at set");
markEnrollmentSubmissionMeta(metaEnrollment, { isResubmit: true });
assert(metaEnrollment.submissionCount === 2, "resubmit increments count");
assert(metaEnrollment.lastResubmittedAt, "last resubmitted at set");

// Dynamic document expansion includes RC sides + bank proof
const expanded = expandRequiredUploadFields([
  { key: "rc", required: true },
  { key: "bankDetails", required: true },
  { key: "aadhaar", required: true },
]);
const fields = expanded.requiredFields.map((item) => item.field);
assert(fields.includes("rcFront"), "rcFront required");
assert(fields.includes("rcBack"), "rcBack required");
assert(!fields.includes("rcPhoto"), "legacy rcPhoto not required");
assert(fields.includes("bankProof"), "bankProof required");
assert(fields.includes("aadharFront"), "aadharFront required");
assert(expanded.requiresBankDetails === true, "bank details flag");

// modules as array
const selections = normalizeModuleSelections({
  modules: ["taxi", "food"],
  vehicleConfigurationId: "abc123",
  vehicleNumber: "MH12AB1234",
});
assert(selections.length === 2, "array modules normalized");
assert(selections[0].module === "taxi", "taxi first");
assert(selections[1].module === "food", "food second");

// Every configured vehicle requires plate except bicycle
const bike = resolveIdentityRequirementsForVehicle({
  name: "Bike",
  documents: [{ key: "aadhaar", required: true }],
});
assert(bike.requiresVehicleNumber === true, "Bike must require vehicle number");
assert(bike.requiresDl === false, "aadhaar-only bike does not force DL");

const taxi = resolveIdentityRequirementsForVehicle({
  name: "Cab",
  documents: [
    { key: "drivingLicense", required: true },
    { key: "rc", required: true },
  ],
});
assert(taxi.requiresVehicleNumber === true, "Taxi must require vehicle number");
assert(taxi.requiresDl === true, "Taxi with DL doc requires DL");

const cycle = resolveIdentityRequirementsForVehicle({
  name: "Bicycle",
  documents: [{ key: "aadhaar", required: true }],
});
assert(
  cycle.requiresVehicleNumber === false,
  "Bicycle must not require vehicle number",
);

assert(
  resolveLegacyIdentityRequirements("bike").requiresVehicleNumber === true,
  "legacy bike requires plate",
);
assert(
  resolveLegacyIdentityRequirements("bicycle").requiresVehicleNumber === false,
  "legacy bicycle does not require plate",
);

console.log(
  JSON.stringify({ ok: true, message: "driver onboarding helpers passed" }),
);
