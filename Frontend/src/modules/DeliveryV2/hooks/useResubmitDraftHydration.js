import { useEffect, useState } from "react";
import { getDriverOnboardingDraft } from "@/modules/common/api/driverOnboarding";
import {
  draftLooksEmpty,
  getResubmitModules,
  loadSignupDetails,
} from "../utils/signupDraft";
import { applyServerOnboardingToClient } from "../utils/onboardingDraftApi";

/**
 * Ensures Edit & Resubmit hydrates from the authenticated driver's server draft.
 * Never falls back to another account's cached client data.
 */
export default function useResubmitDraftHydration({
  preferredModule = null,
  enabled = true,
} = {}) {
  const [hydrating, setHydrating] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const run = async () => {
      const resubmitModules = getResubmitModules();
      const isResubmit =
        resubmitModules.length > 0 ||
        sessionStorage.getItem("deliveryIsRejected") === "true";
      if (!isResubmit) {
        setHydrated(true);
        return;
      }

      const existing = loadSignupDetails();
      const needsHydrate = draftLooksEmpty(existing);
      const moduleKey = preferredModule || resubmitModules[0] || null;

      if (!needsHydrate) {
        setHydrated(true);
        return;
      }

      setHydrating(true);
      try {
        const onboarding = await getDriverOnboardingDraft();
        if (!cancelled && onboarding) {
          applyServerOnboardingToClient(onboarding, {
            preferredModule: moduleKey,
            rejectionReason:
              sessionStorage.getItem("deliveryRejectionReason") || "",
          });
        }
      } catch {
        /* server is source of truth — leave empty rather than reuse foreign cache */
      } finally {
        if (!cancelled) {
          setHydrating(false);
          setHydrated(true);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [enabled, preferredModule]);

  return { hydrating, hydrated };
}
