import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { deliveryAPI, onboardingFeeAPI } from "@food/api";
import { initRazorpayPayment } from "@food/utils/razorpay";
import { resubmitDriverModules } from "@/modules/common/api/driverOnboarding";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";
import {
  ALL_DOC_KEYS,
  ONBOARDING_STEPS,
  getFileFromDB,
  resolveVehicleRequirements,
  validateBankReviewStep,
  getResubmitModules,
  loadHighlightedFields,
  syncPrimaryVehicleFields,
} from "../../utils/signupDraft";
import {
  hasBinaryUpload,
  toUploadFile,
  hasDocumentValue,
  validateDocumentsStep,
  buildRegistrationFormData,
  clearSignupSession,
  getFriendlyRegistrationError,
} from "../../utils/signupSubmit";
import {
  focusFirstInvalidField,
  findFirstIncompleteSignupRoute,
} from "../../utils/signupStepValidation";
import { persistOnboardingDraftStep } from "../../utils/onboardingDraftApi";
import { DeliveryStepper } from "../../components/ui/deliveryUi";
import {
  useDriverOnboardingConfig,
  buildMultiModuleDocumentPlan,
} from "../../hooks/useDriverOnboardingConfig";
import useServerOnboardingDraft from "../../hooks/useServerOnboardingDraft";

const fieldClass = (hasError, highlighted = false) =>
  `w-full min-h-[48px] px-4 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-orange/30 ${
    hasError
      ? "border-red-500"
      : highlighted
        ? "border-amber-400 bg-amber-50/40 focus:ring-amber-400/30"
        : "border-gray-300"
  }`;

function ReviewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right break-words">
        {value}
      </span>
    </div>
  );
}

export default function SignupStepReview() {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const submitLock = useRef(false);
  const { modules } = useDriverOnboardingConfig();
  const {
    loading: draftLoading,
    ready: draftReady,
    details: serverDetails,
    docMarkers: serverDocMarkers,
    setDetails: setServerDetails,
  } = useServerOnboardingDraft();

  const resubmitModules = useMemo(() => getResubmitModules(), []);
  const isResubmit =
    resubmitModules.length > 0 ||
    sessionStorage.getItem("deliveryIsRejected") === "true";
  const hasDeliveryToken = Boolean(
    localStorage.getItem("delivery_accessToken"),
  );
  const useResubmitApi = isResubmit && hasDeliveryToken;

  const [formData, setFormData] = useState(serverDetails);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const highlighted = useMemo(
    () => new Set(loadHighlightedFields()),
    [draftReady, serverDetails],
  );
  const [feeConfig, setFeeConfig] = useState(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState(() => {
    try {
      const saved = sessionStorage.getItem("deliveryPaymentSuccessData");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [keyboardInset, setKeyboardInset] = useState(0);

  const { needsBank, needsPlate } = useMemo(
    () => resolveVehicleRequirements(formData, { modules }),
    [formData, modules],
  );

  useEffect(() => {
    if (!draftReady || !modules.length) return;
    const synced = syncPrimaryVehicleFields(serverDetails);
    setFormData(synced);
    const incomplete = findFirstIncompleteSignupRoute(synced, { modules });
    if (incomplete?.path === "/food/delivery/signup/documents") {
      toast.error(incomplete.message);
      navigate(incomplete.path, { replace: true });
    }
  }, [draftReady, serverDetails, modules, navigate]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset > 80 ? inset : 0);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const fetchFees = async () => {
      try {
        if (isResubmit) {
          setFeeConfig(null);
          return;
        }
        const res = await onboardingFeeAPI.getPublicFees();
        const fees = res?.data?.data || res?.data;
        if (fees?.DELIVERY_PARTNER) setFeeConfig(fees.DELIVERY_PARTNER);
      } catch {
        /* ignore */
      }
    };
    fetchFees();
  }, [isResubmit]);

  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let next = type === "checkbox" ? checked : value;
    if (name === "bankIfscCode") {
      next = String(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 11);
    }
    if (name === "bankAccountNumber") {
      next = String(value).replace(/\D/g, "").slice(0, 18);
    }
    if (name === "bankAccountHolderName") {
      next = String(value)
        .replace(/[^A-Za-z\s]/g, "")
        .replace(/\s{2,}/g, " ");
    }
    setField(name, next);
  };

  const selectedModuleSummary = useMemo(() => {
    const keys = resubmitModules.length
      ? (formData.selectedModules || []).filter((key) =>
          resubmitModules.includes(key),
        )
      : formData.selectedModules || [];
    return keys.map((key) => {
      const moduleDef = modules.find((item) => item.key === key);
      const pick = formData.moduleVehicles?.[key];
      return {
        key,
        label: moduleDef?.label || key,
        vehicleName: pick?.vehicleName || "",
        vehicleNumber: pick?.vehicleNumber || "",
        vehicleBrand: pick?.vehicleBrand || "",
        vehicleModel: pick?.vehicleModel || "",
      };
    });
  }, [modules, formData.selectedModules, formData.moduleVehicles, resubmitModules]);

  const configuredUploads = useMemo(() => {
    if (!modules.length || !(formData.selectedModules || []).length) {
      return { requiredFields: [], optionalFields: [], configuredFields: [] };
    }
    const selections = (formData.selectedModules || [])
      .map((moduleKey) => {
        const moduleDef = modules.find((item) => item.key === moduleKey);
        const vehicleId =
          formData.moduleVehicles?.[moduleKey]?.vehicleConfigurationId;
        const vehicle = moduleDef?.vehicles?.find(
          (item) => item.id === vehicleId,
        );
        if (!vehicle) return null;
        return {
          moduleKey,
          moduleLabel: moduleDef?.label || moduleKey,
          vehicle,
        };
      })
      .filter(Boolean);
    return buildMultiModuleDocumentPlan(selections);
  }, [modules, formData.selectedModules, formData.moduleVehicles]);

  const requiredDocs = useMemo(
    () => configuredUploads.requiredFields.map((item) => item.field),
    [configuredUploads],
  );

  const configuredDocKeys = useMemo(
    () => configuredUploads.configuredFields.map((item) => item.field),
    [configuredUploads],
  );

  const gatherDocuments = async () => {
    const docs = {};
    const keys = new Set(
      configuredDocKeys.length
        ? configuredDocKeys
        : [...ALL_DOC_KEYS, ...requiredDocs],
    );
    for (const key of keys) {
      const raw = await getFileFromDB(key);
      const file = toUploadFile(raw, key);
      if (file) docs[key] = file;
    }
    return docs;
  };

  const loadUploadedMarkers = () => ({
    ...serverDocMarkers,
    ...( (() => {
      try {
        return JSON.parse(sessionStorage.getItem("deliverySignupDocs") || "{}");
      } catch {
        return {};
      }
    })() ),
  });

  const onSubmitSuccess = (details, enrollments) => {
    const phoneDisplay = `${details.countryCode || "+91"} ${String(details.phone).replace(/\D/g, "").slice(-10)}`;
    clearSignupSession();
    sessionStorage.setItem("deliveryPendingPhone", phoneDisplay);
    sessionStorage.removeItem("deliveryNeedsRegistration");
    toast.success("Submitted. Verification is in progress.");
    setTimeout(
      () =>
        navigate("/food/delivery/verification", {
          replace: true,
          state: {
            phone: phoneDisplay,
            enrollments: Array.isArray(enrollments) ? enrollments : [],
          },
        }),
      800,
    );
  };

  const runSubmit = async (extraPayment = null) => {
    if (submitLock.current) return;
    submitLock.current = true;
    setIsSubmitting(true);
    try {
      const details = formData || {};
      if (!details?.phone) {
        toast.error("Session expired. Please start again.");
        navigate("/food/delivery/login", { replace: true });
        return;
      }

      if ((details.selectedModules || []).length && !modules.length) {
        toast.error("Still loading document checklist. Please try again.");
        return;
      }

      const docs = await gatherDocuments();
      const markers = loadUploadedMarkers();
      const missing = requiredDocs.filter(
        (key) => !hasBinaryUpload(docs[key]) && !hasDocumentValue(null, markers[key]),
      );
      if (missing.length) {
        toast.error("Some documents are missing. Please re-upload them.");
        navigate("/food/delivery/signup/documents");
        return;
      }

      const formDataObj = await buildRegistrationFormData(details, docs);
      const pay = extraPayment || paymentSuccessData;
      if (pay && !isResubmit) {
        formDataObj.append("razorpayOrderId", pay.razorpayOrderId);
        formDataObj.append("razorpayPaymentId", pay.razorpayPaymentId);
        formDataObj.append("razorpaySignature", pay.razorpaySignature);
      }

      let enrollments = [];
      if (useResubmitApi) {
        const data = await resubmitDriverModules(formDataObj);
        enrollments = data?.enrollments || [];
      } else {
        const response = await deliveryAPI.register(formDataObj);
        if (!response?.data?.success) {
          throw new Error(
            response?.data?.message ||
              response?.data?.error ||
              "Registration failed. Please try again.",
          );
        }
        enrollments =
          response?.data?.data?.enrollments || response?.data?.enrollments || [];
      }
      onSubmitSuccess(details, enrollments);
    } catch (error) {
      toast.error(getFriendlyRegistrationError(error));
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (isSubmitting || submitLock.current) return;

    // Guard: if earlier steps were invalidated (e.g. draft edited), send user
    // back instead of showing Step 1/2 field errors on the review screen.
    const incomplete = findFirstIncompleteSignupRoute(formData, { modules });
    if (incomplete) {
      toast.error(incomplete.message);
      navigate(incomplete.path, { replace: true });
      return;
    }

    // Final sanity check for documents — redirect rather than show Step 3
    // field errors on the review screen.
    const docsOnDisk = await gatherDocuments();
    const missingDocs = validateDocumentsStep({
      requiredFields: requiredDocs,
      documents: docsOnDisk,
      uploadedDocs: loadUploadedMarkers(),
      labels: Object.fromEntries(
        (configuredUploads.requiredFields || []).map((item) => [
          item.field,
          item.label || item.field,
        ]),
      ),
    });
    if (Object.keys(missingDocs).length) {
      toast.error("Some documents are missing. Please upload them.");
      navigate("/food/delivery/signup/documents");
      return;
    }

    const nextErrors = validateBankReviewStep(formData, { modules });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error("Please complete bank details and agreements");
      requestAnimationFrame(() => focusFirstInvalidField(nextErrors));
      return;
    }

    const details = {
      ...formData,
      bankAccountHolderName: (formData.bankAccountHolderName || "").trim(),
      bankAccountNumber: (formData.bankAccountNumber || "").replace(/\s/g, ""),
      bankIfscCode: (formData.bankIfscCode || "").trim().toUpperCase(),
      bankName: (formData.bankName || "").trim(),
    };

    try {
      const saved = await persistOnboardingDraftStep({
        details,
        step: "review",
      });
      setServerDetails(saved.details);
      setFormData(saved.details);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save draft before submit",
      );
      return;
    }

    // Resubmission and already-paid flows go straight to submit
    if (paymentSuccessData && !isResubmit) {
      await runSubmit(paymentSuccessData);
      return;
    }

    if (feeConfig?.isActive && feeConfig.price > 0 && !isResubmit) {
      setIsSubmitting(true);
      try {
        const orderRes = await onboardingFeeAPI.createOrder({
          role: "DELIVERY_PARTNER",
          name: details.name || "Delivery Partner",
          phone: String(details.phone || "")
            .replace(/\D/g, "")
            .slice(0, 15),
          email: details.email || "",
        });
        const orderData = orderRes?.data?.data || orderRes?.data;
        if (!orderData)
          throw new Error("Failed to create onboarding payment order");

        if (orderData.alreadyPaid || orderData.bypassPayment) {
          setIsSubmitting(false);
          await runSubmit();
          return;
        }

        if (!orderData.orderId)
          throw new Error("Failed to create onboarding payment order");

        if (
          (orderData.isMock ||
            String(orderData.orderId).startsWith("mock_ord_")) &&
          import.meta.env.MODE !== "production"
        ) {
          setIsSubmitting(false);
          await runSubmit({
            razorpayOrderId: orderData.orderId,
            razorpayPaymentId: `mock_pay_${Date.now()}`,
            razorpaySignature: `mock_sig_${Date.now()}`,
          });
          return;
        }

        await initRazorpayPayment({
          key: orderData.keyId,
          amount: Math.round(feeConfig.price * 100),
          currency: orderData.currency || "INR",
          order_id: orderData.orderId,
          name: "Onboarding Fee Payment",
          description: `Onboarding fee for ${details.name}`,
          prefill: {
            name: details.name || "",
            email: details.email || "",
            contact: String(details.phone || "")
              .replace(/\D/g, "")
              .slice(0, 15),
          },
          handler: async (response) => {
            const payData = {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            };
            setPaymentSuccessData(payData);
            sessionStorage.setItem(
              "deliveryPaymentSuccessData",
              JSON.stringify(payData),
            );
            setIsSubmitting(false);
            await runSubmit(payData);
          },
          onError: (err) => {
            toast.error(
              err?.description || "Payment failed. Please try again.",
            );
            setIsSubmitting(false);
            submitLock.current = false;
          },
          onClose: () => {
            toast.error("Payment is required to complete signup.");
            setIsSubmitting(false);
            submitLock.current = false;
          },
        });
      } catch (error) {
        toast.error(getFriendlyRegistrationError(error));
        setIsSubmitting(false);
        submitLock.current = false;
      }
      return;
    }

    await runSubmit();
  };

  return (
    <div
      className="min-h-screen bg-slate-50 flex flex-col"
      style={{ paddingBottom: keyboardInset ? keyboardInset + 16 : undefined }}
    >
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
            Bank details & review
          </h1>
          <p className="text-xs text-gray-500 truncate">
            Step 4 of 4 · Almost done
          </p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <DeliveryStepper step={4} steps={ONBOARDING_STEPS} />

        {isResubmit && (
          <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-900">
            Your updated application will be sent for review again.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-2">
              Review your application
            </h2>
            <div className="divide-y divide-gray-50">
              <ReviewRow label="Name" value={formData.name} />
              <ReviewRow
                label="Mobile"
                value={`${formData.countryCode || "+91"} ${formData.phone || ""}`}
              />
              <ReviewRow
                label="Address"
                value={[formData.address, formData.city, formData.state]
                  .filter(Boolean)
                  .join(", ")}
              />
              {selectedModuleSummary.length > 0 ? (
                selectedModuleSummary.map((item) => (
                  <div key={item.key} className="py-1.5 space-y-0.5">
                    <ReviewRow
                      label={item.label}
                      value={item.vehicleName || "Vehicle selected"}
                    />
                    {item.vehicleNumber ? (
                      <ReviewRow
                        label={`${item.label} number`}
                        value={[
                          item.vehicleBrand,
                          item.vehicleModel,
                          item.vehicleNumber,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ) : null}
                  </div>
                ))
              ) : (
                <ReviewRow label="Vehicle" value={formData.vehicleType} />
              )}
              {!selectedModuleSummary.length && needsPlate ? (
                <ReviewRow
                  label="Vehicle number"
                  value={formData.vehicleNumber}
                />
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => navigate("/food/delivery/signup/documents")}
              className="mt-2 text-sm font-semibold text-primary-orange"
            >
              Edit vehicle & documents
            </button>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">
              Bank details
              {!needsBank && (
                <span className="ml-2 text-xs font-medium text-gray-400">
                  (optional)
                </span>
              )}
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account holder name{" "}
                {needsBank && <span className="text-red-500">*</span>}
              </label>
              <input
                name="bankAccountHolderName"
                value={formData.bankAccountHolderName}
                onChange={handleChange}
                className={fieldClass(
                  errors.bankAccountHolderName,
                  highlighted.has("bankAccountHolderName"),
                )}
                placeholder="Name as in bank account"
              />
              {errors.bankAccountHolderName && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.bankAccountHolderName}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account number{" "}
                {needsBank && <span className="text-red-500">*</span>}
              </label>
              <input
                name="bankAccountNumber"
                value={formData.bankAccountNumber}
                onChange={handleChange}
                className={fieldClass(
                  errors.bankAccountNumber,
                  highlighted.has("bankAccountNumber"),
                )}
                placeholder="9–18 digit account number"
                inputMode="numeric"
              />
              {errors.bankAccountNumber && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.bankAccountNumber}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IFSC code {needsBank && <span className="text-red-500">*</span>}
              </label>
              <input
                name="bankIfscCode"
                value={formData.bankIfscCode}
                onChange={handleChange}
                className={fieldClass(
                  errors.bankIfscCode,
                  highlighted.has("bankIfscCode"),
                )}
                placeholder="SBIN0001234"
              />
              {errors.bankIfscCode && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.bankIfscCode}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank name (optional)
              </label>
              <input
                name="bankName"
                value={formData.bankName}
                onChange={handleChange}
                className={fieldClass(false)}
                placeholder="e.g. State Bank of India"
              />
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-3 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">Agreements</h2>
            {[
              {
                name: "partnerAgreement",
                label: "I agree to the Driver Partner Agreement",
              },
              {
                name: "termsAccepted",
                label: "I accept the Terms & Conditions",
              },
              {
                name: "privacyAccepted",
                label: "I accept the Privacy Policy",
              },
            ].map((item) => (
              <label
                key={item.name}
                className="flex items-start gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  name={item.name}
                  checked={!!formData[item.name]}
                  onChange={handleChange}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-primary-orange focus:ring-primary-orange/30 shrink-0"
                />
                <span className="text-sm text-gray-700 leading-snug">
                  {item.label} <span className="text-red-500">*</span>
                  {errors[item.name] && (
                    <span className="block text-red-500 text-xs mt-0.5">
                      {errors[item.name]}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </section>

          {feeConfig?.isActive && feeConfig.price > 0 && !isResubmit && (
            <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-3 text-sm text-orange-900">
              Onboarding fee: ₹{feeConfig.price}
              {paymentSuccessData && (
                <span className="block text-xs mt-1 text-orange-700">
                  Payment captured — tap Submit to finish.
                </span>
              )}
            </div>
          )}

          <div className="h-24" />
        </form>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 px-3 sm:px-4 py-3">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full min-h-[52px] rounded-xl bg-primary-orange text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting
              ? "Submitting…"
              : isResubmit
                ? "Resubmit for verification"
                : "Submit for verification"}
          </button>
        </div>
      </div>
    </div>
  );
}
