import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Clock3,
  CheckCircle2,
  XCircle,
  FileWarning,
  Loader2,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { deliveryAPI } from "@food/api";
import { clearModuleAuth } from "@food/utils/auth";
import { toast } from "sonner";
import {
  emptySignupDetails,
  loadSignupDetails,
  saveSignupDetails,
} from "../../utils/signupDraft";
import {
  beginModuleEditResubmit,
  clearDeliveryOnboardingOnlyGate,
  enrollmentStatusLabel,
  formatModuleDate,
  getEnrollmentAppliedAt,
  getEnrollmentLastUpdated,
  getModuleDisplayName,
  normalizeDriverModuleKey,
} from "../../utils/driverModuleAccess";
import {
  DeliveryPage,
  DeliveryCard,
  DeliveryPrimaryButton,
  DeliverySecondaryButton,
} from "../../components/ui/deliveryUi";

const POLL_MS = 8000;

export default function PendingVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const phone =
    location.state?.phone ||
    sessionStorage.getItem("deliveryPendingPhone") ||
    "";
  const focusModule = normalizeDriverModuleKey(
    location.state?.focusModule || "",
  );

  const [status, setStatus] = useState("pending");
  const [message, setMessage] = useState(
    "Your onboarding is complete. Our team will verify your documents and activate your account after approval.",
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [documentsRequested, setDocumentsRequested] = useState([]);
  const [enrollments, setEnrollments] = useState(
    () => location.state?.enrollments || [],
  );
  const [hasApprovedModule, setHasApprovedModule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [resubmitting, setResubmitting] = useState("");

  const fetchStatus = useCallback(
    async ({ silent = false } = {}) => {
      const digits = String(phone || "")
        .replace(/\D/g, "")
        .slice(-10);
      if (!digits) {
        setLoading(false);
        return null;
      }
      if (!silent) setChecking(true);
      try {
        const res = await deliveryAPI.getOnboardingStatus(digits);
        const data = res?.data?.data || res?.data || {};
        if (data.found === false) {
          setStatus("pending");
          setMessage(
            data.message || "Registration received. Waiting for verification.",
          );
          return data;
        }
        const nextStatus = data.status || "pending";
        const nextEnrollments = Array.isArray(data.enrollments)
          ? data.enrollments
          : [];
        const approved =
          Boolean(data.hasApprovedModule) ||
          nextEnrollments.some((item) => item.status === "approved") ||
          (Array.isArray(data.authorizedServices) &&
            data.authorizedServices.length > 0);

        setStatus(nextStatus);
        setMessage(data.message || "");
        setRejectionReason(data.rejectionReason || "");
        setDocumentsRequested(
          Array.isArray(data.documentsRequested) ? data.documentsRequested : [],
        );
        if (Array.isArray(data.enrollments)) {
          setEnrollments(data.enrollments);
        }
        setHasApprovedModule(approved);

        if (approved) {
          sessionStorage.removeItem("deliveryIsRejected");
          sessionStorage.removeItem("deliveryRejectionReason");
          sessionStorage.removeItem("deliveryDocumentsRequested");
          sessionStorage.removeItem("deliveryDocumentsRequired");
          clearDeliveryOnboardingOnlyGate();
        }
        return data;
      } catch (err) {
        if (!silent) {
          toast.error(
            err?.response?.data?.message || "Could not refresh status",
          );
        }
        return null;
      } finally {
        setLoading(false);
        setChecking(false);
      }
    },
    [phone],
  );

  useEffect(() => {
    fetchStatus();
    const id = setInterval(() => fetchStatus({ silent: true }), POLL_MS);
    const onFocus = () => fetchStatus({ silent: true });
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchStatus({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchStatus]);

  const goLogin = () => {
    // Must clear auth first — AuthPageGuard sends authenticated users away from login,
    // then ProtectedRoute bounces onboarding-only drivers back to verification.
    clearModuleAuth("delivery");
    clearDeliveryOnboardingOnlyGate();
    sessionStorage.removeItem("deliveryPendingPhone");
    sessionStorage.removeItem("deliveryAuthData");
    sessionStorage.removeItem("deliveryNeedsRegistration");
    navigate("/food/delivery/login", { replace: true });
  };
  const goDashboard = () => {
    clearDeliveryOnboardingOnlyGate();
    navigate("/food/delivery", { replace: true });
  };

  const startEditResubmit = async (enrollment) => {
    if (resubmitting) return;
    setResubmitting(enrollment.module || "all");
    try {
      await beginModuleEditResubmit({
        enrollment,
        phone,
        navigate,
      });
    } finally {
      setResubmitting("");
    }
  };

  /** Legacy fallback when the backend returned no per-module enrollments */
  const goReupload = () => {
    const digits = String(phone || "")
      .replace(/\D/g, "")
      .slice(-10);
    sessionStorage.setItem("deliveryNeedsRegistration", "true");
    sessionStorage.setItem("deliveryIsRejected", "true");
    if (status === "documents_required") {
      sessionStorage.setItem("deliveryDocumentsRequired", "true");
      sessionStorage.setItem(
        "deliveryDocumentsRequested",
        JSON.stringify(documentsRequested || []),
      );
    }
    if (rejectionReason)
      sessionStorage.setItem("deliveryRejectionReason", rejectionReason);
    const existing = loadSignupDetails();
    if (!existing?.phone && digits) {
      saveSignupDetails(
        emptySignupDetails({ phone: digits, countryCode: "+91" }),
      );
    }
    if (status === "documents_required" && documentsRequested?.length) {
      navigate("/food/delivery/signup/documents", { replace: true });
    } else {
      navigate("/food/delivery/signup/details", { replace: true });
    }
  };

  // Prefer enrollments for the overall UI state when modules have mixed statuses
  const derivedStatus = useMemo(() => {
    if (hasApprovedModule) return "approved";
    if (!enrollments.length) return status;
    const statuses = enrollments.map((item) => item.status || "pending");
    if (statuses.includes("approved")) return "approved";
    if (statuses.includes("pending")) return "pending";
    if (statuses.includes("documents_required")) return "documents_required";
    if (statuses.includes("rejected")) return "rejected";
    return status;
  }, [enrollments, status, hasApprovedModule]);

  const isApproved = derivedStatus === "approved";
  const isRejected = derivedStatus === "rejected";
  const isDocsRequired = derivedStatus === "documents_required";
  const hasMixedModules =
    enrollments.length > 1 &&
    enrollments.some((item) => item.status === "approved") &&
    enrollments.some((item) =>
      ["pending", "rejected", "documents_required"].includes(item.status),
    );

  const resubmittableEnrollments = enrollments.filter((item) =>
    ["rejected", "documents_required"].includes(item.status),
  );

  const displayEnrollments = useMemo(() => {
    if (!focusModule || !enrollments.length) return enrollments;
    const focused = enrollments.filter(
      (item) => normalizeDriverModuleKey(item.module) === focusModule,
    );
    const rest = enrollments.filter(
      (item) => normalizeDriverModuleKey(item.module) !== focusModule,
    );
    return [...focused, ...rest];
  }, [enrollments, focusModule]);

  const iconWrapClass = isApproved
    ? "bg-orange-50 text-primary-orange"
    : isRejected
      ? "bg-red-50 text-red-600"
      : isDocsRequired
        ? "bg-amber-50 text-amber-600"
        : "bg-orange-50 text-primary-orange";

  const badgeClass = isApproved
    ? "bg-orange-50 text-primary-orange"
    : isRejected
      ? "bg-red-50 text-red-700"
      : isDocsRequired
        ? "bg-amber-50 text-amber-800"
        : "bg-orange-50 text-orange-800";

  const anyResubmissionPending = enrollments.some(
    (item) => item.status === "pending" && item.isResubmission,
  );

  useEffect(() => {
    if (!focusModule) return;
    const id = `module-status-${focusModule}`;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusModule, displayEnrollments]);

  return (
    <DeliveryPage className="justify-center">
      <DeliveryCard className="delivery-animate-in shadow-lg">
        <div
          className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${iconWrapClass}`}
        >
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : isApproved ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : isRejected ? (
            <XCircle className="h-8 w-8" />
          ) : isDocsRequired ? (
            <FileWarning className="h-8 w-8" />
          ) : (
            <ShieldCheck className="h-8 w-8" />
          )}
        </div>

        <div className="space-y-3">
          <p
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${badgeClass}`}
          >
            {isApproved ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : isRejected || isDocsRequired ? (
              <FileWarning className="h-3.5 w-3.5" />
            ) : (
              <Clock3 className="h-3.5 w-3.5" />
            )}
            {isApproved
              ? hasMixedModules
                ? "Partial Access Ready"
                : "Approved"
              : isRejected
                ? "Rejected"
                : isDocsRequired
                  ? "Documents Required"
                  : anyResubmissionPending
                    ? "Resubmission Under Review"
                    : "Verification In Progress"}
          </p>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isApproved
              ? hasMixedModules
                ? "Dashboard unlocked for approved modules"
                : "You're approved!"
              : isRejected
                ? "Application not approved"
                : isDocsRequired
                  ? "Re-upload required"
                  : "Your delivery profile is under review"}
          </h1>

          <p className="text-sm leading-6 text-slate-600">
            {hasMixedModules
              ? "You can use the Driver Dashboard for approved services. Pending or rejected modules stay inactive until approved."
              : message}
          </p>

          {displayEnrollments.length > 0 ? (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Module status
              </p>
              {focusModule ? (
                <p className="text-xs text-slate-500">
                  Showing{" "}
                  <span className="font-semibold text-slate-800">
                    {getModuleDisplayName(focusModule)}
                  </span>{" "}
                  — fix the details below and resubmit for admin review.
                </p>
              ) : null}
              {displayEnrollments.map((item) => {
                const itemStatus = item.status || "pending";
                const canResubmit = ["rejected", "documents_required"].includes(
                  itemStatus,
                );
                const appliedAt = formatModuleDate(getEnrollmentAppliedAt(item));
                const lastUpdated = formatModuleDate(
                  getEnrollmentLastUpdated(item),
                );
                const isFocused =
                  focusModule &&
                  normalizeDriverModuleKey(item.module) === focusModule;
                const tone =
                  itemStatus === "approved"
                    ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                    : itemStatus === "rejected"
                      ? "border-red-100 bg-red-50 text-red-800"
                      : itemStatus === "documents_required"
                        ? "border-amber-100 bg-amber-50 text-amber-900"
                        : "border-orange-100 bg-orange-50 text-orange-900";
                return (
                  <div
                    key={item.module}
                    id={`module-status-${normalizeDriverModuleKey(item.module)}`}
                    className={`rounded-xl border px-3 py-2.5 ${tone} ${
                      isFocused
                        ? "ring-2 ring-primary-orange ring-offset-2"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {getModuleDisplayName(item.module)}
                      </p>
                      <span className="text-[11px] font-bold uppercase text-right">
                        {enrollmentStatusLabel(item)}
                      </span>
                    </div>

                    <div className="mt-1 space-y-0.5 text-[11px] opacity-75">
                      {appliedAt ? <p>Applied: {appliedAt}</p> : null}
                      {lastUpdated ? <p>Last updated: {lastUpdated}</p> : null}
                    </div>

                    {canResubmit && item.rejectionReason ? (
                      <div className="mt-2 rounded-lg bg-white/70 border border-black/5 px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                          Rejection reason
                        </p>
                        <p className="mt-0.5 text-xs font-medium leading-snug">
                          {item.rejectionReason}
                        </p>
                      </div>
                    ) : null}
                    {itemStatus === "documents_required" &&
                    Array.isArray(item.documentsRequested) &&
                    item.documentsRequested.length ? (
                      <p className="mt-1 text-xs opacity-90">
                        Documents needed: {item.documentsRequested.join(", ")}
                      </p>
                    ) : null}
                    {itemStatus === "pending" && item.isResubmission ? (
                      <p className="mt-1 text-xs opacity-90">
                        Your updated application is being reviewed. Admin can
                        see which fields you changed.
                      </p>
                    ) : null}

                    {canResubmit ? (
                      <button
                        type="button"
                        onClick={() => startEditResubmit(item)}
                        disabled={Boolean(resubmitting)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/80 border border-black/10 px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                      >
                        {resubmitting === item.module ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Pencil className="h-3.5 w-3.5" />
                        )}
                        Edit details &amp; Resubmit
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {(isRejected || isDocsRequired) &&
          rejectionReason &&
          !enrollments.length ? (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-500">
                Reason
              </p>
              <p className="mt-1 text-sm font-medium text-red-800">
                {rejectionReason}
              </p>
            </div>
          ) : null}

          {isDocsRequired &&
          documentsRequested.length > 0 &&
          !enrollments.length ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                Documents to re-upload
              </p>
              <p className="mt-1 text-sm text-amber-900">
                {documentsRequested.join(", ")}
              </p>
            </div>
          ) : null}

          {phone ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Registered Number
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {phone}
              </p>
            </div>
          ) : (
            <p className="text-xs text-amber-700">
              No phone found in session. Sign in with OTP to check your status.
            </p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          {isApproved ? (
            <>
              <DeliveryPrimaryButton onClick={goDashboard}>
                Go to Driver Dashboard
              </DeliveryPrimaryButton>
              <DeliverySecondaryButton onClick={goLogin}>
                Sign in again
              </DeliverySecondaryButton>
            </>
          ) : isRejected || isDocsRequired ? (
            resubmittableEnrollments.length > 0 ? (
              <DeliveryPrimaryButton
                onClick={() => startEditResubmit(resubmittableEnrollments[0])}
                disabled={Boolean(resubmitting)}
              >
                {resubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Edit & Resubmit
              </DeliveryPrimaryButton>
            ) : (
              <DeliveryPrimaryButton onClick={goReupload}>
                Edit & Resubmit
              </DeliveryPrimaryButton>
            )
          ) : (
            <DeliveryPrimaryButton
              onClick={() => fetchStatus()}
              disabled={checking}
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh status
            </DeliveryPrimaryButton>
          )}
          {!isApproved ? (
            <DeliverySecondaryButton onClick={goLogin}>
              Back to login
            </DeliverySecondaryButton>
          ) : null}
        </div>
      </DeliveryCard>
    </DeliveryPage>
  );
}
