import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";
import useServerOnboardingDraft from "../../hooks/useServerOnboardingDraft";
import {
  ONBOARDING_STEPS,
  validateAddressStep,
  validatePersonalStep,
  loadHighlightedFields,
} from "../../utils/signupDraft";
import { persistOnboardingDraftStep } from "../../utils/onboardingDraftApi";
import { focusFirstInvalidField } from "../../utils/signupStepValidation";
import {
  DeliveryPrimaryButton,
  DeliveryStepper,
} from "../../components/ui/deliveryUi";

const fieldClass = (hasError, highlighted = false) =>
  `w-full min-h-[48px] px-4 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-orange/30 ${
    hasError
      ? "border-red-500"
      : highlighted
        ? "border-amber-400 bg-amber-50/40 focus:ring-amber-400/30"
        : "border-gray-300"
  }`;

export default function SignupStepAddress() {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const {
    loading: hydrating,
    ready,
    details: serverDetails,
    setDetails: setServerDetails,
  } = useServerOnboardingDraft();
  const [formData, setFormData] = useState(serverDetails);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const highlighted = useMemo(
    () => new Set(loadHighlightedFields()),
    [ready, serverDetails],
  );

  useEffect(() => {
    if (!ready) return;
    setFormData(serverDetails);
    const personalErrors = validatePersonalStep(serverDetails);
    if (Object.keys(personalErrors).length || !serverDetails.phone) {
      toast.error("Complete personal details first");
      navigate("/food/delivery/signup/details", { replace: true });
    }
  }, [ready, serverDetails, navigate]);

  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let next = value;
    if (name === "emergencyContactPhone") {
      next = String(value).replace(/\D/g, "").slice(0, 10);
    }
    if (name === "emergencyContactName") {
      next = String(value)
        .replace(/[^A-Za-z\s]/g, "")
        .replace(/\s{2,}/g, " ");
    }
    setField(name, next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || hydrating) return;
    const nextErrors = validateAddressStep(formData);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error("Please complete address and contact details");
      requestAnimationFrame(() => focusFirstInvalidField(nextErrors));
      return;
    }
    setIsSubmitting(true);
    try {
      const details = {
        ...formData,
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        emergencyContactName: formData.emergencyContactName.trim(),
        emergencyContactPhone: formData.emergencyContactPhone
          .replace(/\D/g, "")
          .slice(0, 10),
      };
      const saved = await persistOnboardingDraftStep({
        details,
        step: "documents",
      });
      setServerDetails(saved.details);
      setFormData(saved.details);
      navigate("/food/delivery/signup/documents");
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

  const hl = (name) => highlighted.has(name);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-3 sm:px-4 py-3 flex items-center gap-3 border-b border-slate-200">
        <button
          type="button"
          onClick={goBack}
          className="p-2 -ml-1 hover:bg-gray-100 rounded-full"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
            Address & contact
          </h1>
          <p className="text-xs text-gray-500 truncate">
            Step 2 of 4 · Where we can reach you
          </p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <DeliveryStepper step={2} steps={ONBOARDING_STEPS} />

        {hydrating ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your onboarding draft…
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">Address</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full address <span className="text-red-500">*</span>
                {hl("address") ? (
                  <span className="ml-2 text-[11px] font-semibold text-amber-700">
                    Needs review
                  </span>
                ) : null}
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={3}
                className={fieldClass(errors.address, hl("address"))}
                placeholder="House / street / landmark"
              />
              {errors.address ? (
                <p className="text-red-500 text-xs mt-1">{errors.address}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className={fieldClass(errors.city, hl("city"))}
                  placeholder="City"
                />
                {errors.city ? (
                  <p className="text-red-500 text-xs mt-1">{errors.city}</p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State <span className="text-red-500">*</span>
                </label>
                <input
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className={fieldClass(errors.state, hl("state"))}
                  placeholder="State"
                />
                {errors.state ? (
                  <p className="text-red-500 text-xs mt-1">{errors.state}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">
              Emergency contact
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                name="emergencyContactName"
                value={formData.emergencyContactName}
                onChange={handleChange}
                className={fieldClass(
                  errors.emergencyContactName,
                  hl("emergencyContactName"),
                )}
                placeholder="Contact person name"
              />
              {errors.emergencyContactName ? (
                <p className="text-red-500 text-xs mt-1">
                  {errors.emergencyContactName}
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mobile number <span className="text-red-500">*</span>
              </label>
              <input
                name="emergencyContactPhone"
                value={formData.emergencyContactPhone}
                onChange={handleChange}
                className={fieldClass(
                  errors.emergencyContactPhone,
                  hl("emergencyContactPhone"),
                )}
                placeholder="10-digit mobile"
                inputMode="tel"
              />
              {errors.emergencyContactPhone ? (
                <p className="text-red-500 text-xs mt-1">
                  {errors.emergencyContactPhone}
                </p>
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
