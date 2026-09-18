import apiClient from "@/services/api";

const unwrap = (response) => response?.data?.data || response?.data || {};

export const getPublicDriverOnboardingConfig = async () =>
  unwrap(
    await apiClient.get("/common/settings/driver-onboarding-config", {
      // public — no admin context required
      skipSlowWarning: true,
    }),
  );

export const getDeliveryOnboardingConfig = async () =>
  unwrap(
    await apiClient.get("/food/delivery/onboarding-config", {
      skipSlowWarning: true,
    }),
  );

export const getMyDriverOnboarding = async () =>
  unwrap(
    await apiClient.get("/food/delivery/onboarding/me", {
      contextModule: "delivery",
      skipSlowWarning: true,
    }),
  );

export const getDriverOnboardingDraft = async () =>
  unwrap(
    await apiClient.get("/food/delivery/onboarding/draft", {
      contextModule: "delivery",
      skipSlowWarning: true,
    }),
  );

/**
 * Persist onboarding progress for the authenticated driver.
 * Accepts FormData (with optional files) or a plain object.
 */
export const saveDriverOnboardingDraft = async (payload) => {
  return unwrap(
    await apiClient.patch("/food/delivery/onboarding/draft", payload, {
      contextModule: "delivery",
      skipSlowWarning: true,
    }),
  );
};

export const resubmitDriverModules = async (formData) =>
  unwrap(
    await apiClient.post("/food/delivery/onboarding/resubmit", formData, {
      contextModule: "delivery",
    }),
  );

export const listModuleJoinRequests = async (moduleKey, params = {}) =>
  unwrap(
    await apiClient.get(`/common/driver-onboarding/${moduleKey}/join-requests`, {
      params,
      contextModule: "admin",
    }),
  );

export const getModuleJoinRequest = async (moduleKey, id) =>
  unwrap(
    await apiClient.get(
      `/common/driver-onboarding/${moduleKey}/join-requests/${id}`,
      { contextModule: "admin" },
    ),
  );

export const approveModuleJoinRequest = async (moduleKey, id) =>
  unwrap(
    await apiClient.patch(
      `/common/driver-onboarding/${moduleKey}/join-requests/${id}/approve`,
      {},
      { contextModule: "admin" },
    ),
  );

export const rejectModuleJoinRequest = async (moduleKey, id, reason) =>
  unwrap(
    await apiClient.patch(
      `/common/driver-onboarding/${moduleKey}/join-requests/${id}/reject`,
      { reason },
      { contextModule: "admin" },
    ),
  );

export const requestModuleDocuments = async (
  moduleKey,
  id,
  documents,
  reason = "",
) =>
  unwrap(
    await apiClient.patch(
      `/common/driver-onboarding/${moduleKey}/join-requests/${id}/request-documents`,
      { documents, reason },
      { contextModule: "admin" },
    ),
  );
