import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CreditCard,
  FileBadge2,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  ShieldCheck,
  Upload,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { bikeVendorApi } from "../services/vendorApi";
import {
  clearBikeVendorAuth,
  getBikeVendorToken,
  getBikeVendorUser,
  setBikeVendorAuth,
  setBikeVendorPendingPhone,
} from "../utils/authVendor";

const STEPS = [
  { id: 1, label: "Business", icon: Building2 },
  { id: 2, label: "Location", icon: MapPin },
  { id: 3, label: "Documents", icon: FileBadge2 },
  { id: 4, label: "Bank & Photos", icon: CreditCard },
];

const emptyForm = {
  ownerName: "",
  businessName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  panNumber: "",
  aadhaarNumber: "",
  drivingLicenseNumber: "",
  gstNumber: "",
  businessRegistrationNumber: "",
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  ifscCode: "",
  accountType: "savings",
  upiId: "",
  profilePhoto: "",
  panImage: "",
  aadhaarImage: "",
  drivingLicenseImage: "",
  gstImage: "",
  businessRegistrationImage: "",
  shopImages: [],
};

const hydrateFromVendor = (vendor, phone) => {
  if (!vendor) {
    return { ...emptyForm, phone: phone || "" };
  }
  return {
    ...emptyForm,
    ownerName: vendor.ownerName || "",
    businessName: vendor.businessName || "",
    email: vendor.email || "",
    phone: vendor.phone || phone || "",
    address: vendor.address || "",
    city: vendor.city || "",
    state: vendor.state || "",
    pincode: vendor.pincode || "",
    landmark: vendor.landmark || "",
    panNumber: vendor.documents?.panNumber || "",
    aadhaarNumber: vendor.documents?.aadhaarNumber || "",
    drivingLicenseNumber: vendor.documents?.drivingLicenseNumber || "",
    gstNumber: vendor.documents?.gstNumber || "",
    businessRegistrationNumber: vendor.documents?.businessRegistrationNumber || "",
    bankName: vendor.bank?.bankName || "",
    accountHolderName: vendor.bank?.accountHolderName || "",
    accountNumber: vendor.bank?.accountNumber || "",
    ifscCode: vendor.bank?.ifscCode || "",
    accountType: vendor.bank?.accountType || "savings",
    upiId: vendor.bank?.upiId || "",
    profilePhoto: vendor.profilePhoto || "",
    panImage: vendor.documents?.panImage || "",
    aadhaarImage: vendor.documents?.aadhaarImage || "",
    drivingLicenseImage: vendor.documents?.drivingLicenseImage || "",
    gstImage: vendor.documents?.gstImage || "",
    businessRegistrationImage: vendor.documents?.businessRegistrationImage || "",
    shopImages: Array.isArray(vendor.shopImages) ? vendor.shopImages : [],
  };
};

function Field({ label, required, children, hint, error }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-gray-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs text-gray-400">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass = (hasError) =>
  `w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${
    hasError
      ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
      : "border-gray-200 focus:border-[#FF6A00] focus:ring-[#FF6A00]/15"
  }`;

function UploadTile({ label, value, onUploaded, accept = "image/*,application/pdf", error }) {
  const [uploading, setUploading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
  }, [value]);

  const onChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await bikeVendorApi.uploadImage(file, "bike-rent/vendors/docs");
      if (!url) throw new Error("Upload failed");
      onUploaded(url);
      toast.success(`${label} uploaded`);
    } catch (err) {
      toast.error(err?.response?.data?.message || `Failed to upload ${label}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`rounded-xl border border-dashed p-3 ${
        error ? "border-red-300 bg-red-50/40" : "border-gray-200 bg-gray-50/70"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold text-[#FF6A00]"
          >
            Open full size
          </a>
        ) : null}
      </div>

      {value ? (
        <div className="mb-2 h-28 w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
          {previewFailed ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-400">
              <FileText className="h-6 w-6" />
              <span className="text-[11px] font-semibold">Document uploaded</span>
            </div>
          ) : (
            <img
              src={value}
              alt={label}
              className="h-full w-full object-cover"
              onError={() => setPreviewFailed(true)}
            />
          )}
        </div>
      ) : null}

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
        <input type="file" accept={accept} className="hidden" onChange={onChange} disabled={uploading} />
      </label>

      {error ? (
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function VendorOnboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const existing = getBikeVendorUser();
  const [step, setStep] = useState(location.state?.resumeStep || existing?.onboardingStep || 1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(() =>
    hydrateFromVendor(
      location.state?.vendor || existing,
      location.state?.phone || existing?.phone || "",
    ),
  );

  const rejectionReason =
    location.state?.rejectionReason || existing?.rejectionReason || "";

  const hasToken = Boolean(getBikeVendorToken());

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateStepFields = (current) => {
    const errs = {};
    if (current === 1) {
      if (!form.ownerName.trim()) errs.ownerName = "Owner name is required";
      if (!form.businessName.trim()) errs.businessName = "Business name is required";
      if (String(form.phone).replace(/\D/g, "").slice(-10).length !== 10) {
        errs.phone = "Enter a valid 10-digit mobile number";
      }
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        errs.email = "Enter a valid email address";
      }
    }
    if (current === 2) {
      if (!form.address.trim()) errs.address = "Address is required";
      if (!form.city.trim()) errs.city = "City is required";
      if (!form.state.trim()) errs.state = "State is required";
      if (!/^\d{6}$/.test(form.pincode.trim())) errs.pincode = "PIN code must be exactly 6 digits";
    }
    if (current === 3) {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(form.panNumber.trim())) {
        errs.panNumber = "Enter a valid PAN, e.g. ABCDE1234F";
      }
      if (!/^\d{12}$/.test(form.aadhaarNumber.replace(/\s/g, ""))) {
        errs.aadhaarNumber = "Aadhaar must be exactly 12 digits";
      }
      if (
        form.gstNumber &&
        !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(form.gstNumber.trim())
      ) {
        errs.gstNumber = "Enter a valid 15-character GST number";
      }
      if (!form.panImage) errs.panImage = "Upload your PAN document";
      if (!form.aadhaarImage) errs.aadhaarImage = "Upload your Aadhaar document";
    }
    if (current === 4) {
      if (!form.accountHolderName.trim()) errs.accountHolderName = "Account holder name is required";
      if (!form.accountNumber.trim()) errs.accountNumber = "Account number is required";
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(form.ifscCode.trim())) {
        errs.ifscCode = "Enter a valid IFSC code, e.g. HDFC0001234";
      }
      if (!form.upiId.trim()) {
        errs.upiId = "UPI ID is required";
      } else if (!/^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test(form.upiId.trim())) {
        errs.upiId = "Enter a valid UPI ID, e.g. name@bank";
      }
      if (!form.profilePhoto) errs.profilePhoto = "Upload a profile photo";
    }
    return errs;
  };

  const goNext = () => {
    if (step === 1 && !hasToken) {
      toast.error("Please verify OTP from the vendor login page first");
      return;
    }
    const stepErrors = validateStepFields(step);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) {
      toast.error("Please fix the highlighted fields before continuing");
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const uploadShopImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (form.shopImages.length >= 6) {
      toast.error("Maximum 6 shop images");
      return;
    }
    try {
      const url = await bikeVendorApi.uploadImage(file, "bike-rent/vendors/shop");
      if (!url) throw new Error("Upload failed");
      setForm((prev) => ({ ...prev, shopImages: [...prev.shopImages, url] }));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Shop image upload failed");
    }
  };

  const submit = async () => {
    if (!hasToken) {
      toast.error("Session expired. Please login again.");
      navigate("/bike-rent/vendor/login");
      return;
    }

    let allErrors = {};
    let firstInvalidStep = null;
    for (let s = 1; s <= 4; s += 1) {
      const stepErrors = validateStepFields(s);
      if (Object.keys(stepErrors).length > 0) {
        allErrors = { ...allErrors, ...stepErrors };
        if (firstInvalidStep === null) firstInvalidStep = s;
      }
    }
    if (firstInvalidStep !== null) {
      setStep(firstInvalidStep);
      setErrors(allErrors);
      toast.error("Please fix the highlighted fields before submitting");
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        phone: String(form.phone).replace(/\D/g, "").slice(-10),
        submitForApproval: true,
      };

      const data = await bikeVendorApi.resubmit(payload);

      if (data?.accessToken && data?.vendor) {
        setBikeVendorAuth(data.accessToken, data.vendor, data.refreshToken);
      }
      setBikeVendorPendingPhone(payload.phone);
      toast.success("Submitted for admin approval");
      navigate("/bike-rent/vendor/pending", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const stepMeta = useMemo(() => STEPS.find((item) => item.id === step) || STEPS[0], [step]);

  return (
    <div className="min-h-screen bg-[#F7F7F8] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/bike-rent/vendor/login"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500"
          >
            <ArrowLeft className="h-4 w-4" />
            Vendor login
          </Link>
          <button
            type="button"
            className="text-xs font-semibold text-gray-400"
            onClick={() => {
              clearBikeVendorAuth();
              navigate("/bike-rent/vendor/login");
            }}
          >
            Start over
          </button>
        </div>

        <div className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF6A00]/12 text-[#FF6A00]">
              <User className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-black text-gray-900">Vendor registration</h1>
              <p className="mt-1 text-sm text-gray-500">
                Link your business to your shared Appzeto account. Admin approval is required before dashboard access.
              </p>
            </div>
          </div>

          {rejectionReason ? (
            <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-bold">Previous submission rejected</p>
              <p className="mt-1">{rejectionReason}</p>
            </div>
          ) : null}

          <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STEPS.map((item) => {
              const Icon = item.icon;
              const active = item.id === step;
              const done = item.id < step;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border px-3 py-2.5 ${
                    active
                      ? "border-[#FF6A00] bg-orange-50"
                      : done
                        ? "border-emerald-200 bg-emerald-50/60"
                        : "border-gray-100 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${active ? "text-[#FF6A00]" : "text-gray-400"}`} />
                    <span className="text-xs font-bold text-gray-700">{item.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mb-4 text-sm font-bold text-gray-800">
            Step {step}: {stepMeta.label}
          </p>

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner name" required error={errors.ownerName}>
                <input
                  className={inputClass(Boolean(errors.ownerName))}
                  value={form.ownerName}
                  onChange={(e) => setField("ownerName", e.target.value)}
                />
              </Field>
              <Field label="Business name" required error={errors.businessName}>
                <input
                  className={inputClass(Boolean(errors.businessName))}
                  value={form.businessName}
                  onChange={(e) => setField("businessName", e.target.value)}
                />
              </Field>
              <Field
                label="Mobile number"
                required
                hint="Same number links your shared user wallet"
                error={errors.phone}
              >
                <input
                  className={inputClass(Boolean(errors.phone))}
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                  disabled={Boolean(existing?.phone)}
                />
              </Field>
              <Field label="Email" error={errors.email}>
                <input
                  className={inputClass(Boolean(errors.email))}
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </Field>
              {hasToken ? (
                <div className="sm:col-span-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  Phone verified — continue the form and submit for admin approval.
                </div>
              ) : (
                <div className="sm:col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Session missing. Please{" "}
                  <Link to="/bike-rent/vendor/login" className="underline">
                    verify OTP
                  </Link>{" "}
                  first.
                </div>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Address" required error={errors.address}>
                  <textarea
                    className={inputClass(Boolean(errors.address))}
                    rows={3}
                    value={form.address}
                    onChange={(e) => setField("address", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="City" required error={errors.city}>
                <input
                  className={inputClass(Boolean(errors.city))}
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                />
              </Field>
              <Field label="State" required error={errors.state}>
                <input
                  className={inputClass(Boolean(errors.state))}
                  value={form.state}
                  onChange={(e) => setField("state", e.target.value)}
                />
              </Field>
              <Field label="PIN code" required error={errors.pincode}>
                <input
                  className={inputClass(Boolean(errors.pincode))}
                  value={form.pincode}
                  onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </Field>
              <Field label="Landmark">
                <input
                  className={inputClass(false)}
                  value={form.landmark}
                  onChange={(e) => setField("landmark", e.target.value)}
                />
              </Field>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="PAN" required error={errors.panNumber}>
                  <input
                    className={inputClass(Boolean(errors.panNumber))}
                    value={form.panNumber}
                    onChange={(e) => setField("panNumber", e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Aadhaar" required error={errors.aadhaarNumber}>
                  <input
                    className={inputClass(Boolean(errors.aadhaarNumber))}
                    value={form.aadhaarNumber}
                    onChange={(e) => setField("aadhaarNumber", e.target.value.replace(/\D/g, "").slice(0, 12))}
                  />
                </Field>
                <Field label="Driving license">
                  <input
                    className={inputClass(false)}
                    value={form.drivingLicenseNumber}
                    onChange={(e) => setField("drivingLicenseNumber", e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="GST (optional)" error={errors.gstNumber}>
                  <input
                    className={inputClass(Boolean(errors.gstNumber))}
                    value={form.gstNumber}
                    onChange={(e) => setField("gstNumber", e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Business registration (optional)">
                  <input
                    className={inputClass(false)}
                    value={form.businessRegistrationNumber}
                    onChange={(e) => setField("businessRegistrationNumber", e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <UploadTile
                  label="PAN document"
                  value={form.panImage}
                  onUploaded={(url) => setField("panImage", url)}
                  error={errors.panImage}
                />
                <UploadTile
                  label="Aadhaar document"
                  value={form.aadhaarImage}
                  onUploaded={(url) => setField("aadhaarImage", url)}
                  error={errors.aadhaarImage}
                />
                <UploadTile
                  label="Driving license"
                  value={form.drivingLicenseImage}
                  onUploaded={(url) => setField("drivingLicenseImage", url)}
                />
                <UploadTile
                  label="GST certificate"
                  value={form.gstImage}
                  onUploaded={(url) => setField("gstImage", url)}
                />
                <UploadTile
                  label="Business registration"
                  value={form.businessRegistrationImage}
                  onUploaded={(url) => setField("businessRegistrationImage", url)}
                />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bank name">
                  <input
                    className={inputClass(false)}
                    value={form.bankName}
                    onChange={(e) => setField("bankName", e.target.value)}
                  />
                </Field>
                <Field label="Account holder" required error={errors.accountHolderName}>
                  <input
                    className={inputClass(Boolean(errors.accountHolderName))}
                    value={form.accountHolderName}
                    onChange={(e) => setField("accountHolderName", e.target.value)}
                  />
                </Field>
                <Field label="Account number" required error={errors.accountNumber}>
                  <input
                    className={inputClass(Boolean(errors.accountNumber))}
                    value={form.accountNumber}
                    onChange={(e) => setField("accountNumber", e.target.value)}
                  />
                </Field>
                <Field label="IFSC" required error={errors.ifscCode}>
                  <input
                    className={inputClass(Boolean(errors.ifscCode))}
                    value={form.ifscCode}
                    onChange={(e) => setField("ifscCode", e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Account type">
                  <select
                    className={inputClass(false)}
                    value={form.accountType}
                    onChange={(e) => setField("accountType", e.target.value)}
                  >
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="UPI ID" required error={errors.upiId}>
                  <input
                    className={inputClass(Boolean(errors.upiId))}
                    value={form.upiId}
                    onChange={(e) => setField("upiId", e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <UploadTile
                  label="Profile photo"
                  value={form.profilePhoto}
                  onUploaded={(url) => setField("profilePhoto", url)}
                  accept="image/*"
                  error={errors.profilePhoto}
                />
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      Shop / business images
                    </p>
                    <span className="text-[11px] font-semibold text-gray-400">
                      {form.shopImages.length}/6
                    </span>
                  </div>
                  <label
                    className={`inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm ring-1 ring-gray-200 ${
                      form.shopImages.length >= 6 ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-gray-50"
                    }`}
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Add image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={uploadShopImage}
                      disabled={form.shopImages.length >= 6}
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.shopImages.map((url) => (
                      <div key={url} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200">
                        <a href={url} target="_blank" rel="noreferrer" className="block h-full w-full">
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              shopImages: prev.shopImages.filter((img) => img !== url),
                            }))
                          }
                          className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/60 p-0.5 text-white group-hover:block"
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  After submit, status becomes <strong>Pending Approval</strong>. Bike inventory tools stay locked until an admin approves your vendor profile.
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Submit for approval
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
