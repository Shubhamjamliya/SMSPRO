import {
  getDriverOnboardingDraft,
  saveDriverOnboardingDraft,
} from "@/modules/common/api/driverOnboarding";
import {
  buildModuleSelectionsPayload,
  collectOnboardingDocumentUrls,
  emptySignupDetails,
  hydrateResubmitDraft,
  normalizeAadhaar,
  prefillFromOnboarding,
  saveSignupDetails,
} from "./signupDraft";
import {
  resetOnboardingClientStateForPhone,
  appendMultipartFile,
} from "./signupSubmit";

/**
 * Apply a server onboarding payload into the in-session working copy.
 * Server data is authoritative; client cache is only a same-phone mirror.
 */
export const applyServerOnboardingToClient = (
  onboarding,
  { preferredModule = null, rejectionReason = "", documentsRequested = [] } = {},
) => {
  if (!onboarding) {
    return {
      details: emptySignupDetails(),
      docs: {},
      highlighted: [],
    };
  }

  const phone = String(onboarding.phone || "")
    .replace(/\D/g, "")
    .slice(-10);
  resetOnboardingClientStateForPhone(phone);

  const hydrated = hydrateResubmitDraft(onboarding, {
    preferredModule,
    rejectionReason,
    documentsRequested,
  });

  return (
    hydrated || {
      details: prefillFromOnboarding(onboarding, { preferredModule }),
      docs: collectOnboardingDocumentUrls(onboarding, preferredModule),
      highlighted: [],
    }
  );
};

export const fetchServerOnboardingDraft = async (options = {}) => {
  const onboarding = await getDriverOnboardingDraft();
  return {
    onboarding,
    ...applyServerOnboardingToClient(onboarding, options),
  };
};

/**
 * Persist the current step to the authenticated driver's DB draft.
 * Optional document File map is uploaded in the same request.
 */
export const persistOnboardingDraftStep = async ({
  details,
  step,
  documents = null,
}) => {
  const phone = String(details?.phone || "")
    .replace(/\D/g, "")
    .slice(-10);

  const formData = new FormData();
  formData.append("onboardingStep", step);
  formData.append("phone", phone);
  formData.append("countryCode", details.countryCode || "+91");

  const scalarFields = [
    "name",
    "email",
    "dateOfBirth",
    "address",
    "city",
    "state",
    "aadharNumber",
    "panNumber",
    "emergencyContactName",
    "emergencyContactPhone",
    "vehicleType",
    "vehicleBrand",
    "vehicleModel",
    "vehicleNumber",
    "drivingLicenseNumber",
    "drivingLicenseExpiry",
    "bankAccountHolderName",
    "bankAccountNumber",
    "bankIfscCode",
    "bankName",
  ];

  for (const key of scalarFields) {
    if (details[key] == null || details[key] === "") continue;
    let value = details[key];
    if (key === "aadharNumber") value = normalizeAadhaar(value);
    if (key === "panNumber") value = String(value).trim().toUpperCase();
    formData.append(key, String(value));
  }

  formData.append(
    "selectedModules",
    JSON.stringify(details.selectedModules || []),
  );
  formData.append(
    "moduleVehicles",
    JSON.stringify(details.moduleVehicles || {}),
  );

  const moduleSelections = buildModuleSelectionsPayload(details);
  if (moduleSelections.length) {
    formData.append("moduleSelections", JSON.stringify(moduleSelections));
  }

  if (details.partnerAgreement != null) {
    formData.append(
      "partnerAgreement",
      details.partnerAgreement ? "true" : "false",
    );
  }
  if (details.termsAccepted != null) {
    formData.append("termsAccepted", details.termsAccepted ? "true" : "false");
  }
  if (details.privacyAccepted != null) {
    formData.append(
      "privacyAccepted",
      details.privacyAccepted ? "true" : "false",
    );
  }

  if (documents && typeof documents === "object") {
    for (const [key, value] of Object.entries(documents)) {
      await appendMultipartFile(formData, key, value);
    }
  }

  const saved = await saveDriverOnboardingDraft(formData);
  const applied = applyServerOnboardingToClient(saved);
  if (details) {
    // Keep any local-only fields (e.g. ref) that the server does not store
    saveSignupDetails({
      ...applied.details,
      ref: details.ref || applied.details.ref || "",
    });
  }
  return { onboarding: saved, ...applied };
};
