import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";
import useServerOnboardingDraft from "../../hooks/useServerOnboardingDraft";
import {
  ONBOARDING_STEPS,
  validatePersonalStep,
  loadHighlightedFields,
  getResubmitModules,
} from "../../utils/signupDraft";
import { persistOnboardingDraftStep } from "../../utils/onboardingDraftApi";
import { focusFirstInvalidField } from "../../utils/signupStepValidation";
import {
  DeliveryStepper,
  DeliveryPrimaryButton,
} from "../../components/ui/deliveryUi";

const fieldClass = (hasError, highlighted = false) =>
  `w-full min-h-[48px] px-4 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-orange/30 ${
    hasError
      ? "border-red-500"
      : highlighted
        ? "border-amber-400 bg-amber-50/40 focus:ring-amber-400/30"
        : "border-gray-300"
  }`;

export default function SignupStep1() {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const location = useLocation();
  const queryRef = new URLSearchParams(location.search).get("ref") || "";
  const pendingRef =
    sessionStorage.getItem("deliveryPendingReferralRef") || "";

  const {
    loading: hydrating,
    ready,
    details: serverDetails,
    setDetails: setServerDetails,
  } = useServerOnboardingDraft();

  const [formData, setFormData] = useState(serverDetails);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const highlighted = useMemo(
    () => new Set(loadHighlightedFields()),
    [ready, serverDetails],
  );

  useEffect(() => {
    if (!ready) return;
    setFormData((prev) => ({
      ...serverDetails,
      ref: serverDetails.ref || prev.ref || queryRef || pendingRef || "",
    }));
  }, [ready, serverDetails, queryRef, pendingRef]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset > 80 ? inset : 0);
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let next = value;
    if (name === "aadharNumber") {
      const digits = value.replace(/\D/g, "").slice(0, 12);
      next = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
    }
    if (name === "panNumber") {
      next = String(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 10);
    }
    if (name === "email") {
      next = String(value).replace(/\s/g, "").toLowerCase();
    }
    if (name === "name") {
      next = String(value)
        .replace(/[^A-Za-z\s]/g, "")
        .replace(/\s{2,}/g, " ");
    }
    setField(name, next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || hydrating) return;
    const nextErrors = validatePersonalStep(formData);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error("Please fill personal details correctly");
      requestAnimationFrame(() => focusFirstInvalidField(nextErrors));
      return;
    }
    setIsSubmitting(true);
    try {
      const details = {
        ...formData,
        name: formData.name.trim(),
        email: formData.email?.trim() || "",
        aadharNumber: formData.aadharNumber.replace(/\s/g, ""),
        panNumber: formData.panNumber?.trim().toUpperCase() || "",
        phone: String(formData.phone || "")
          .replace(/\D/g, "")
          .slice(0, 15),
        ref: formData.ref || queryRef || pendingRef || "",
      };
      const saved = await persistOnboardingDraftStep({
        details,
        step: "address",
      });
      setServerDetails(saved.details);
      setFormData(saved.details);
      navigate("/food/delivery/signup/address");
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const rejectionReason = sessionStorage.getItem("deliveryRejectionReason");
  const isResubmit =
    getResubmitModules().length > 0 ||
    sessionStorage.getItem("deliveryIsRejected") === "true";

  const hl = (name) => highlighted.has(name);

  return (
    <div
      className="min-h-screen bg-slate-50 flex flex-col"
      style={{ paddingBottom: keyboardInset ? keyboardInset + 16 : undefined }}
    >
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-3 sm:px-4 py-3 flex items-center gap-3 border-b border-slate-200 safe-area-top">
        <button
          type="button"
          onClick={goBack}
          className="p-2 -ml-1 hover:bg-gray-100 rounded-full transition-colors shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
            {isResubmit ? "Edit & Resubmit" : "Partner Onboarding"}
          </h1>
          <p className="text-xs text-gray-500 truncate">
            Step 1 of 4 · Personal information
          </p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <DeliveryStepper step={1} steps={ONBOARDING_STEPS} />

        {hydrating ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your onboarding draft…
          </div>
        ) : null}

        {rejectionReason ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Rejection reason</p>
                <p className="mt-0.5">{rejectionReason}</p>
                <p className="mt-1 text-xs text-amber-800/80">
                  Highlighted fields below need your attention. You can keep
                  everything else unchanged.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">
              Personal information
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full name <span className="text-red-500">*</span>
                {hl("name") ? (
                  <span className="ml-2 text-[11px] font-semibold text-amber-700">
                    Needs review
                  </span>
                ) : null}
              </label>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={fieldClass(errors.name, hl("name"))}
                placeholder="As on Aadhaar"
                autoComplete="name"
              />
              {errors.name ? (
                <p className="text-red-500 text-xs mt-1">{errors.name}</p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mobile number
              </label>
              <input
                value={`${formData.countryCode} ${formData.phone}`}
                disabled
                className="w-full min-h-[48px] px-4 py-3 text-base border border-gray-200 rounded-xl bg-gray-50 text-gray-600"
              />
              <p className="text-xs text-gray-400 mt-1">Verified via OTP</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (optional)
                {hl("email") ? (
                  <span className="ml-2 text-[11px] font-semibold text-amber-700">
                    Needs review
                  </span>
                ) : null}
              </label>
              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className={fieldClass(errors.email, hl("email"))}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
              />
              {errors.email ? (
                <p className="text-red-500 text-xs mt-1">{errors.email}</p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date of birth <span className="text-red-500">*</span>
                {hl("dateOfBirth") ? (
                  <span className="ml-2 text-[11px] font-semibold text-amber-700">
                    Needs review
                  </span>
                ) : null}
              </label>
              <input
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleChange}
                max={new Date(
                  new Date().setFullYear(new Date().getFullYear() - 18),
                )
                  .toISOString()
                  .slice(0, 10)}
                className={fieldClass(errors.dateOfBirth, hl("dateOfBirth"))}
              />
              {errors.dateOfBirth ? (
                <p className="text-red-500 text-xs mt-1">{errors.dateOfBirth}</p>
              ) : null}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">Identity</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Aadhaar number <span className="text-red-500">*</span>
                {hl("aadharNumber") ? (
                  <span className="ml-2 text-[11px] font-semibold text-amber-700">
                    Needs review
                  </span>
                ) : null}
              </label>
              <input
                name="aadharNumber"
                value={formData.aadharNumber}
                onChange={handleChange}
                className={fieldClass(errors.aadharNumber, hl("aadharNumber"))}
                placeholder="XXXX XXXX XXXX"
                inputMode="numeric"
              />
              {errors.aadharNumber ? (
                <p className="text-red-500 text-xs mt-1">{errors.aadharNumber}</p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PAN number (optional)
                {hl("panNumber") ? (
                  <span className="ml-2 text-[11px] font-semibold text-amber-700">
                    Needs review
                  </span>
                ) : null}
              </label>
              <input
                name="panNumber"
                value={formData.panNumber}
                onChange={handleChange}
                className={fieldClass(errors.panNumber, hl("panNumber"))}
                placeholder="ABCDE1234F"
              />
              {errors.panNumber ? (
                <p className="text-red-500 text-xs mt-1">{errors.panNumber}</p>
              ) : null}
            </div>
          </section>

          <div className="h-24" />
        </form>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 px-3 sm:px-4 py-3">
        <div className="max-w-lg mx-auto">
          <DeliveryPrimaryButton
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || hydrating || !ready}
            className="w-full min-h-[52px]"
          >
            Continue
          </DeliveryPrimaryButton>
        </div>
      </div>
    </div>
  );
}
