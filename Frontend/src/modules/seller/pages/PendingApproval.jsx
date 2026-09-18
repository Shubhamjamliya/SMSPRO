import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { motion } from "framer-motion";
import { CheckCircle2, Clock3, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";
import { formatOpeningHoursAMPM } from "@shared/utils/timeFormat";

const asDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-IN");
};

const hasValue = (value) => String(value ?? "").trim().length > 0;

/**
 * Read-only recap of what the seller submitted. While an application is under review the
 * details are locked, so this is a plain summary with no inputs — re-applying after a
 * rejection is the only way back into the editable form.
 */
const buildSubmittedSections = (profile) => {
  if (!profile) return [];

  const { shopInfo = {}, documents = {}, bankInfo = {}, location = {} } = profile;
  const address =
    profile.address ||
    location.formattedAddress ||
    location.address ||
    "";
  const lat = location.latitude ?? location.lat;
  const lng = location.longitude ?? location.lng;

  const sections = [
    {
      title: "Store details",
      rows: [
        ["Business type", shopInfo.businessType === "Pharmacy" ? "Quick Commerce" : shopInfo.businessType],
        ["Shop name", profile.shopName],
        ["Owner name", profile.name],
        ["Email", profile.email],
        ["Primary phone", profile.phone],
        ["Alternate phone", shopInfo.alternatePhone],
        ["Support email", shopInfo.supportEmail],
        ["Service zone", shopInfo.zoneName],
        ["Opening hours", shopInfo.openingHours ? formatOpeningHoursAMPM(shopInfo.openingHours) : ""],
        ["Store address", address],
        [
          "Map pin",
          Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
            ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`
            : "",
        ],
      ],
    },
    {
      title: "Compliance",
      rows: [
        ["PAN number", documents.panNumber],
        ["GST registered", documents.gstRegistered ? "Yes" : "No"],
        ["GST number", documents.gstNumber],
        ["GST legal name", documents.gstLegalName],
        ["FSSAI number", documents.fssaiNumber],
        ["FSSAI expiry", asDate(documents.fssaiExpiry)],
        ["Shop license", documents.shopLicenseNumber],
        ["Shop license expiry", asDate(documents.shopLicenseExpiry)],
      ],
    },
    {
      title: "Bank & UPI",
      rows: [
        ["Bank name", bankInfo.bankName],
        ["Account holder", bankInfo.accountHolderName],
        ["Account number", bankInfo.accountNumber],
        ["IFSC code", bankInfo.ifscCode],
        ["Account type", bankInfo.accountType],
        ["UPI ID", bankInfo.upiId],
      ],
    },
  ];

  const documentImages = [
    ["Shop photo", shopInfo.shopImage],
    ["FSSAI image", documents.fssaiImage],
    ["Shop license image", documents.shopLicenseImage],
    ["UPI QR image", bankInfo.upiQrImage],
  ].filter((entry) => entry && hasValue(entry[1]));

  return [
    ...sections
      .map((section) => ({
        ...section,
        rows: section.rows.filter(([, value]) => hasValue(value)),
        images: [],
      }))
      .filter((section) => section.rows.length > 0),
    ...(documentImages.length
      ? [
          {
            title: "Uploaded documents",
            rows: [],
            images: documentImages,
          },
        ]
      : []),
  ];
};

export default function SellerPendingApproval() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(user || null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // AuthContext already loads `/seller/profile` for the route guard — reuse it so this
  // page does not fire a second identical request on mount.
  useEffect(() => {
    if (user) setProfile(user);
  }, [user]);

  const loadProfile = useCallback(async () => {
    const sellerToken = localStorage.getItem("auth_seller");
    if (!sellerToken) {
      navigate("/seller/auth", { replace: true });
      return;
    }

    setIsRefreshing(true);
    try {
      const response = await sellerApi.getProfile();
      const data = response?.data?.result || {};
      setProfile(data);

      const isApproved =
        data.approved !== false &&
        (!data.approvalStatus || data.approvalStatus === "approved");

      if (isApproved) {
        await refreshUser();
        toast.success("Your seller account has been approved!");
        navigate("/seller", { replace: true });
      }
    } catch (error) {
      if (error?.response?.status !== 401) {
        toast.error("Failed to load approval status");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [navigate, refreshUser]);

  const isRejected = profile?.approvalStatus === "rejected";
  const submittedSections = useMemo(() => buildSubmittedSections(profile), [profile]);

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans seller-theme-scope overflow-hidden relative">
      {/* Decorative background blobs */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
      <div className="absolute -top-48 -right-48 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-48 -left-48 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex w-full flex-col px-4 py-12 lg:px-12 mx-auto justify-center relative z-10">
        <div className="mx-auto w-full max-w-2xl">
          
          <div className="mb-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl shadow-xl ${
              isRejected ? "bg-rose-500 shadow-rose-500/20" : "bg-primary shadow-primary/20"
            }`}>
              {isRejected ? (
                <ShieldAlert className="h-10 w-10 text-white" />
              ) : (
                <Clock3 className="h-10 w-10 text-white animate-pulse" />
              )}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              {isRejected
                ? "Action Needed"
                : "Approval in Progress"}
            </h1>
            <p className="mt-3 text-base font-medium text-slate-500 max-w-md mx-auto">
              {isRejected
                ? "Your seller request needs some updates. Please review the admin notes below."
                : "Your seller request is now in queue. Our team is reviewing your details."}
            </p>
          </div>

          <section className="rounded-3xl border border-white/50 bg-white/70 backdrop-blur-xl p-6 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 relative overflow-hidden">
            
            {/* Soft decorative inner glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-white/10 pointer-events-none" />

            <div className="relative z-10">
              <p className="text-sm font-medium leading-relaxed text-slate-600 border-b border-slate-100 pb-6 text-center">
                {isRejected
                  ? "Admin has not approved the current submission yet. Update the onboarding form and send a cleaner application."
                  : "We saved your onboarding details and raised a joining request in quick-commerce admin. As soon as it gets approved, this seller account can enter the dashboard."}
              </p>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "Shop Name", value: profile?.shopName || "Store" },
                  { label: "Owner", value: profile?.name || "Seller" },
                  { label: "Status", value: isRejected ? "Rejected" : "Pending review", isStatus: true },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col justify-center rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition hover:bg-slate-50">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                      {item.label}
                    </p>
                    <p className={`text-sm font-bold ${item.isStatus && isRejected ? "text-rose-600" : item.isStatus ? "text-amber-600" : "text-slate-800"}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className={`rounded-2xl border p-5 ${isRejected ? "bg-rose-50/50 border-rose-100" : "bg-blue-50/50 border-blue-100"}`}>
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 shrink-0 rounded-full p-2 ${isRejected ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"}`}>
                    {isRejected ? <ShieldAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className={`text-xs font-black uppercase tracking-widest ${isRejected ? "text-rose-800" : "text-blue-800"}`}>
                      {isRejected ? "Admin note" : "What happens next"}
                    </p>
                    <p className={`mt-1.5 text-sm font-medium leading-relaxed ${isRejected ? "text-rose-700" : "text-blue-700"}`}>
                      {profile?.approvalNotes ||
                        (isRejected
                          ? "Please revisit onboarding, correct the details, and submit again for review."
                          : "Admin can now review your identity, payment details, and shop compliance docs from the quick-commerce panel.")}
                    </p>
                  </div>
                </div>
              </div>

            {submittedSections.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-5 border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-slate-400" />
                    Submitted Application
                  </p>
                  <span className="rounded-full bg-slate-200/50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Locked
                  </span>
                </div>

                <div className="p-5 space-y-6">
                  {submittedSections.map((section) => (
                    <div key={section.title}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">
                        {section.title}
                      </p>
                      {section.rows.length > 0 && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {section.rows.map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 hover:bg-slate-50 transition-colors">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                {label}
                              </p>
                              <p className="mt-1 break-words text-sm font-bold text-slate-800">{value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {section.images?.length > 0 && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {section.images.map(([label, url]) => (
                            <a
                              key={label}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-primary/20"
                            >
                              <div className="aspect-[4/3] bg-slate-50">
                                <img
                                  src={url}
                                  alt={label}
                                  className="h-full w-full object-contain p-2"
                                />
                              </div>
                              <p className="border-t border-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-primary transition-colors text-center bg-slate-50">
                                {label}
                              </p>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100">
              <p className="mb-4 text-xs font-medium text-slate-500 text-center">
                {isRejected
                  ? "Your saved application can be edited and submitted again for admin review."
                  : "Use refresh to check if approval has been granted."}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                {isRejected && (
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem("sellerReonboard", "true");
                      navigate("/seller/onboarding");
                    }}
                    className="rounded-2xl bg-rose-600 px-8 py-3.5 text-sm font-black tracking-wide text-white transition-all hover:bg-rose-700 shadow-lg shadow-rose-600/20 active:scale-95 sm:w-auto w-full"
                  >
                    EDIT & RE-APPLY
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => loadProfile()}
                  disabled={isRefreshing}
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-3.5 text-sm font-black tracking-wide transition-all active:scale-95 sm:w-auto w-full ${
                    isRejected
                      ? "border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                      : "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20"
                  } ${isRefreshing ? "opacity-70 cursor-not-allowed" : ""}`}
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "CHECKING..." : "REFRESH STATUS"}
                </button>
              </div>
              </div>
            </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
