import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  emptySignupDetails,
  getResubmitModules,
  loadSignupDetails,
} from "../utils/signupDraft";
import {
  fetchServerOnboardingDraft,
} from "../utils/onboardingDraftApi";
import {
  clearSignupSession,
  resetOnboardingClientStateForPhone,
} from "../utils/signupSubmit";

const readAuthPhone = () => {
  try {
    const user = JSON.parse(localStorage.getItem("delivery_user") || "null");
    return String(user?.phone || "")
      .replace(/\D/g, "")
      .slice(-10);
  } catch {
    return "";
  }
};

const hasDeliveryToken = () =>
  Boolean(localStorage.getItem("delivery_accessToken"));

/**
 * Loads the authenticated driver's onboarding draft from the server.
 * Clears any cross-account client cache when the phone changes.
 */
export default function useServerOnboardingDraft({
  preferredModule = null,
  redirectIfUnauthenticated = true,
} = {}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [details, setDetails] = useState(() =>
    emptySignupDetails(loadSignupDetails() || {}),
  );
  const [docMarkers, setDocMarkers] = useState({});
  const [onboarding, setOnboarding] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const authPhone = readAuthPhone();
      if (!hasDeliveryToken() || !authPhone) {
        if (redirectIfUnauthenticated) {
          clearSignupSession();
          toast.error("Please verify your mobile number to continue");
          navigate("/food/delivery/login", { replace: true });
        }
        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
        return;
      }

      resetOnboardingClientStateForPhone(authPhone);

      setLoading(true);
      try {
        const resubmitModules = getResubmitModules();
        const moduleKey =
          preferredModule || resubmitModules[0] || null;
        const result = await fetchServerOnboardingDraft({
          preferredModule: moduleKey,
          rejectionReason:
            sessionStorage.getItem("deliveryRejectionReason") || "",
        });
        if (cancelled) return;

        const serverPhone = String(result.onboarding?.phone || "")
          .replace(/\D/g, "")
          .slice(-10);
        if (serverPhone && serverPhone !== authPhone) {
          clearSignupSession();
          toast.error("Session mismatch. Please sign in again.");
          navigate("/food/delivery/login", { replace: true });
          return;
        }

        setOnboarding(result.onboarding);
        setDetails(result.details);
        setDocMarkers(result.docs || {});
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error?.response?.data?.message ||
              error?.message ||
              "Failed to load your onboarding draft",
          );
          // Fall back to empty form for this phone only
          setDetails(
            emptySignupDetails({
              phone: authPhone,
              countryCode: "+91",
            }),
          );
          setDocMarkers({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, preferredModule, redirectIfUnauthenticated]);

  return {
    loading,
    ready,
    details,
    setDetails,
    docMarkers,
    setDocMarkers,
    onboarding,
    setOnboarding,
  };
}
