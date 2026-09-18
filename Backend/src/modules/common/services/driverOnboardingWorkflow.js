/**
 * Driver module onboarding resubmission helpers —
 * mirrors restaurant previousSubmission + changedFields pattern.
 */

const DOC_URL_KEYS = [
  "profilePhoto",
  "aadharFront",
  "aadharBack",
  "aadharPhoto",
  "panPhoto",
  "drivingLicenseFront",
  "drivingLicenseBack",
  "drivingLicensePhoto",
  "rcPhoto",
  "rcFront",
  "rcBack",
  "insurancePhoto",
  "pucPhoto",
  "vehiclePermitPhoto",
  "fitnessCertificatePhoto",
  "vehicleImage",
  "bankProof",
];

const DIFF_FIELDS = [
  { key: "name", label: "Full name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "aadharNumber", label: "Aadhaar number" },
  { key: "panNumber", label: "PAN number" },
  { key: "drivingLicenseNumber", label: "Driving license number" },
  { key: "drivingLicenseExpiry", label: "Driving license expiry" },
  { key: "emergencyContactName", label: "Emergency contact name" },
  { key: "emergencyContactPhone", label: "Emergency contact phone" },
  { key: "bankAccountHolderName", label: "Account holder" },
  { key: "bankAccountNumber", label: "Account number" },
  { key: "bankIfscCode", label: "IFSC code" },
  { key: "bankName", label: "Bank name" },
  { key: "vehicleName", label: "Vehicle" },
  { key: "vehicleNumber", label: "Vehicle number" },
  { key: "vehicleBrand", label: "Vehicle brand" },
  { key: "vehicleModel", label: "Vehicle model" },
  { key: "vehicleConfigurationId", label: "Vehicle configuration" },
  ...DOC_URL_KEYS.map((key) => {
    const labels = {
      profilePhoto: "Profile Photo",
      aadharFront: "Aadhaar Front",
      aadharBack: "Aadhaar Back",
      aadharPhoto: "Aadhaar",
      panPhoto: "PAN",
      drivingLicenseFront: "Driving License Front",
      drivingLicenseBack: "Driving License Back",
      drivingLicensePhoto: "Driving License",
      rcPhoto: "RC",
      rcFront: "RC Front",
      rcBack: "RC Back",
      insurancePhoto: "Insurance",
      pucPhoto: "PUC",
      vehiclePermitPhoto: "Vehicle Permit",
      fitnessCertificatePhoto: "Fitness Certificate",
      vehicleImage: "Vehicle Image",
      bankProof: "Bank Proof",
    };
    return {
      key,
      label: labels[key] || key,
      isDocument: true,
    };
  }),
];

const toComparable = (value) => {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.url) return String(value.url);
    if (value._id) return String(value._id);
    return JSON.stringify(value);
  }
  return String(value).trim();
};

const readDocUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.url || "";
};

const readEnrollmentDocuments = (enrollment = {}) => {
  const raw =
    enrollment.documents instanceof Map
      ? Object.fromEntries(enrollment.documents)
      : enrollment.documents || {};
  const out = {};
  for (const key of DOC_URL_KEYS) {
    out[key] = readDocUrl(raw[key]);
  }
  return out;
};

export function buildDriverEnrollmentSnapshot(driver = {}, enrollment = {}) {
  const enrollmentDocs = readEnrollmentDocuments(enrollment);
  const snapshot = {
    name: driver.name || "",
    phone: driver.phone || "",
    email: driver.email || "",
    address: driver.address || "",
    city: driver.city || "",
    state: driver.state || "",
    dateOfBirth: driver.dateOfBirth
      ? new Date(driver.dateOfBirth).toISOString().slice(0, 10)
      : "",
    aadharNumber: driver.aadharNumber || "",
    panNumber: driver.panNumber || "",
    drivingLicenseNumber: driver.drivingLicenseNumber || "",
    drivingLicenseExpiry: driver.drivingLicenseExpiry
      ? new Date(driver.drivingLicenseExpiry).toISOString().slice(0, 10)
      : "",
    emergencyContactName: driver.emergencyContactName || "",
    emergencyContactPhone: driver.emergencyContactPhone || "",
    bankAccountHolderName: driver.bankAccountHolderName || "",
    bankAccountNumber: driver.bankAccountNumber || "",
    bankIfscCode: driver.bankIfscCode || "",
    bankName: driver.bankName || "",
    vehicleName: enrollment.vehicleName || driver.vehicleName || driver.vehicleType || "",
    vehicleNumber: enrollment.vehicleNumber || driver.vehicleNumber || "",
    vehicleBrand: enrollment.vehicleBrand || driver.vehicleBrand || "",
    vehicleModel: enrollment.vehicleModel || driver.vehicleModel || "",
    vehicleConfigurationId: enrollment.vehicleConfigurationId
      ? String(enrollment.vehicleConfigurationId)
      : driver.vehicleConfigurationId
        ? String(driver.vehicleConfigurationId)
        : "",
    status: enrollment.status || "",
    rejectionReason: enrollment.rejectionReason || "",
    capturedAt: new Date(),
  };

  for (const key of DOC_URL_KEYS) {
    snapshot[key] =
      enrollmentDocs[key] ||
      readDocUrl(driver[key]) ||
      "";
  }

  return snapshot;
}

export function buildDriverChangedFields(currentSnapshot = {}, previousSnapshot = null) {
  if (!previousSnapshot || typeof previousSnapshot !== "object") return [];

  const changed = [];
  for (const field of DIFF_FIELDS) {
    const before = toComparable(previousSnapshot[field.key]);
    const after = toComparable(currentSnapshot[field.key]);
    if (before !== after) {
      changed.push({
        field: field.key,
        label: field.label,
        before: before || "—",
        after: after || "—",
        isDocument: Boolean(field.isDocument),
      });
    }
  }
  return changed;
}

/**
 * Freeze the current enrollment/driver state as the admin "before" baseline.
 * Call once per resubmit request BEFORE profile fields are overwritten.
 * Always overwrites so each review cycle diffs against the latest rejected state.
 */
export function ensureDriverResubmitBaseline(driver, enrollment) {
  if (!enrollment) return null;
  const snapshot = buildDriverEnrollmentSnapshot(driver, enrollment);
  enrollment.previousSubmission = snapshot;
  enrollment.previousStatus = enrollment.status || "rejected";
  return snapshot;
}

export function markEnrollmentSubmissionMeta(enrollment, { isResubmit = false } = {}) {
  const now = new Date();
  const currentCount = Number(enrollment.submissionCount || 0);
  enrollment.submissionCount = currentCount > 0 ? currentCount + (isResubmit ? 1 : 0) : 1;
  if (!enrollment.firstSubmittedAt) {
    enrollment.firstSubmittedAt = enrollment.appliedAt || now;
  }
  if (isResubmit) {
    enrollment.lastResubmittedAt = now;
  }
  enrollment.submittedAt = now;
}
