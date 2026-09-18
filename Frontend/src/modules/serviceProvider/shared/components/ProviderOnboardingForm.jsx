import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CreditCard,
  FileBadge2,
  Loader2,
  MapPin,
  ShieldCheck,
  User,
  Wrench,
} from "lucide-react";
import MediaUploadField from "@/modules/bikeRent/shared/components/MediaUploadField";

const STEPS = [
  { id: 1, label: "Basic Info", icon: User },
  { id: 2, label: "Professional", icon: Briefcase },
  { id: 3, label: "Documents", icon: FileBadge2 },
  { id: 4, label: "Bank Details", icon: CreditCard },
  { id: 5, label: "Category & Services", icon: Wrench },
  { id: 6, label: "Review", icon: ShieldCheck },
];
const LAST_STEP = STEPS[STEPS.length - 1].id;

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

/**
 * The ONE onboarding wizard used by both flows — the copy/behavior below is the
 * single source of truth for what each mode says, so "self-registration" text
 * (Pending Approval / admin approval required) can never leak into an admin-created
 * provider's flow (or vice versa) the way it could with two independently-edited pages.
 *
 *  - self:        provider self-registration (OTP session) — submits for admin approval.
 *  - adminCreate: admin fills the same form for a brand-new provider — created directly
 *                 Approved/Active, no approval request.
 *  - adminEdit:   admin edits an existing provider's profile — saved immediately.
 */
const MODE_COPY = {
  self: {
    title: "Service Provider registration",
    subtitle: "Complete your profile. Admin approval is required before dashboard access.",
    reviewTitle: "Ready to submit",
    reviewDescription: "Review your details below, then submit your application for admin approval.",
    reviewNote: "After submit, status becomes Pending Approval. Dashboard access unlocks once an admin approves your profile.",
    submitLabel: "Submit for approval",
  },
  adminCreate: {
    title: "Add service provider",
    subtitle:
      "Enter the same details a provider fills in during self-registration. The provider is created already approved and active — no separate approval step needed.",
    reviewTitle: "Ready to create",
    reviewDescription: "Review the details below before continuing.",
    reviewNote: "The provider is created directly as Approved & Active — no separate approval request needed.",
    submitLabel: "Create provider",
  },
  adminEdit: {
    title: "Edit service provider",
    subtitle: "Update this provider's profile, documents, zone, and services.",
    reviewTitle: "Ready to save",
    reviewDescription: "Review the details below before continuing.",
    reviewNote: "Changes are saved immediately — no re-approval needed.",
    submitLabel: "Save changes",
  },
};

export const emptyProviderOnboardingForm = {
  ownerName: "",
  email: "",
  phone: "",
  zoneId: "",
  profileImage: "",
  experience: "",
  skillsText: "",
  about: "",
  panNumber: "",
  panImage: "",
  aadhaarNumber: "",
  aadhaarImage: "",
  addressProofUrl: "",
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  ifscCode: "",
  accountType: "savings",
  upiId: "",
  categoryId: "",
  /** {[serviceId]: {price, name, basePrice, categoryId, categoryName}} — carries enough
   *  detail to render a pre-filled (admin-edit) selection even if it's no longer in the
   *  freshly-fetched zone catalog, so an unrelated edit elsewhere never silently drops it. */
  selectedServices: {},
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

/**
 * @param {Object} props
 * @param {'self'|'adminCreate'|'adminEdit'} props.mode
 * @param {Object} props.initialForm - shape of emptyProviderOnboardingForm
 * @param {() => Promise<Array<{_id:string,name:string}>>} props.fetchZones
 * @param {() => Promise<Array<{_id:string,name:string}>>} props.fetchCategories
 * @param {(zoneId: string) => Promise<Array<Object>>} props.fetchServices - active services
 *   mapped to the given zone (each populated with categoryId {_id,name})
 * @param {(payload: Object) => Promise<void>} props.onSubmit - owns its own success/error
 *   toast + navigation; should not rethrow (this component just resets `saving` after).
 * @param {string} [props.rejectionReason]
 */
export default function ProviderOnboardingForm({
  mode,
  initialForm,
  fetchZones,
  fetchCategories,
  fetchServices,
  onSubmit,
  rejectionReason = "",
}) {
  const copy = MODE_COPY[mode];
  const phoneEditable = mode === "adminCreate";
  const phoneRequired = mode === "adminCreate";

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(initialForm);

  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [zoneServices, setZoneServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchZones();
        if (!cancelled) setZones(list || []);
      } catch {
        if (!cancelled) setZones([]);
      } finally {
        if (!cancelled) setZonesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchCategories();
        if (!cancelled) setCategories(list || []);
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Services are zone-scoped — refetch whenever the selected zone changes (including
  // going back to step 1 and picking a different one).
  useEffect(() => {
    if (!form.zoneId) {
      setZoneServices([]);
      return undefined;
    }
    let cancelled = false;
    setServicesLoading(true);
    (async () => {
      try {
        const list = await fetchServices(form.zoneId);
        if (!cancelled) setZoneServices(list || []);
      } catch {
        if (!cancelled) setZoneServices([]);
      } finally {
        if (!cancelled) setServicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.zoneId]);

  const noZonesAvailable = !zonesLoading && zones.length === 0;

  // Zone catalog UNIONED with whatever is already selected (even if it's gone stale —
  // deactivated, re-zoned, etc. since this was first saved) — so a pre-filled selection
  // (admin-edit) is always visible and explicitly kept-or-removed, never silently dropped
  // just because an unrelated field was the only thing actually being edited.
  const displayServices = useMemo(() => {
    const byId = new Map(zoneServices.map((s) => [s._id, s]));
    Object.entries(form.selectedServices).forEach(([id, info]) => {
      if (!byId.has(id)) {
        byId.set(id, {
          _id: id,
          name: info.name,
          basePrice: info.basePrice,
          categoryId: { _id: info.categoryId, name: info.categoryName },
          status: "inactive",
          stale: true,
        });
      }
    });
    return [...byId.values()];
  }, [zoneServices, form.selectedServices]);

  const servicesInCategory = useMemo(
    () => displayServices.filter((svc) => (svc.categoryId?._id || svc.categoryId) === form.categoryId),
    [displayServices, form.categoryId],
  );

  const selectedCount = Object.keys(form.selectedServices).length;
  const selectedCategory = useMemo(() => categories.find((c) => c._id === form.categoryId) || null, [categories, form.categoryId]);
  const selectedZone = useMemo(() => zones.find((z) => z._id === form.zoneId) || null, [zones, form.zoneId]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const changeCategory = (nextCategoryId) => {
    setForm((prev) => ({ ...prev, categoryId: nextCategoryId, selectedServices: {} }));
    setErrors((prev) => ({ ...prev, categoryId: undefined, services: undefined }));
  };

  const toggleService = (svc) => {
    setForm((prev) => {
      const next = { ...prev.selectedServices };
      if (svc._id in next) {
        delete next[svc._id];
      } else {
        next[svc._id] = {
          price: "",
          name: svc.name,
          basePrice: svc.basePrice,
          categoryId: svc.categoryId?._id || svc.categoryId,
          categoryName: svc.categoryId?.name || "",
        };
      }
      return { ...prev, selectedServices: next };
    });
    setErrors((prev) => ({ ...prev, services: undefined }));
  };

  const setServicePrice = (serviceId, price) => {
    setForm((prev) => ({
      ...prev,
      selectedServices: {
        ...prev.selectedServices,
        [serviceId]: { ...prev.selectedServices[serviceId], price },
      },
    }));
  };

  const validateStepFields = (current) => {
    const errs = {};
    if (current === 1) {
      if (!form.ownerName.trim()) errs.ownerName = "Full name is required";
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        errs.email = "Enter a valid email address";
      }
      if (phoneRequired && !/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) {
        errs.phone = "Enter a valid 10-digit mobile number";
      }
      if (!form.zoneId) errs.zoneId = "Select a service zone";
    }
    if (current === 3) {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(form.panNumber.trim())) {
        errs.panNumber = "Enter a valid PAN, e.g. ABCDE1234F";
      }
      if (!form.panImage) errs.panImage = "Upload the PAN document";
      if (!/^\d{12}$/.test(form.aadhaarNumber.replace(/\s/g, ""))) {
        errs.aadhaarNumber = "Aadhaar must be exactly 12 digits";
      }
      if (!form.aadhaarImage) errs.aadhaarImage = "Upload the Aadhaar document";
    }
    if (current === 4) {
      if (!form.accountHolderName.trim()) errs.accountHolderName = "Account holder name is required";
      if (!form.accountNumber.trim()) errs.accountNumber = "Account number is required";
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(form.ifscCode.trim())) {
        errs.ifscCode = "Enter a valid IFSC code, e.g. HDFC0001234";
      }
    }
    if (current === 5) {
      if (!form.categoryId) errs.categoryId = "Select a category";
      const entries = Object.entries(form.selectedServices);
      if (!entries.length) {
        errs.services = "Select at least one service";
      } else if (entries.some(([, info]) => info.price === "" || Number.isNaN(Number(info.price)) || Number(info.price) <= 0)) {
        errs.services = "Enter your price (greater than ₹0) for every selected service";
      }
    }
    return errs;
  };

  const goNext = () => {
    const stepErrors = validateStepFields(step);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) {
      toast.error("Please fix the highlighted fields before continuing");
      return;
    }
    setStep((s) => Math.min(LAST_STEP, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    let allErrors = {};
    let firstInvalidStep = null;
    for (let s = 1; s <= LAST_STEP - 1; s += 1) {
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

    const documents = [];
    if (form.addressProofUrl) {
      documents.push({ documentType: "address_proof", label: "Address proof", documentUrl: form.addressProofUrl });
    }

    const payload = {
      ownerName: form.ownerName.trim(),
      email: form.email.trim(),
      zoneId: form.zoneId,
      profileImage: form.profileImage,
      experience: form.experience.trim(),
      skills: form.skillsText.split(",").map((s) => s.trim()).filter(Boolean),
      about: form.about.trim(),
      panNumber: form.panNumber.trim().toUpperCase(),
      panImage: form.panImage,
      aadhaarNumber: form.aadhaarNumber.replace(/\s/g, ""),
      aadhaarImage: form.aadhaarImage,
      documents,
      bankName: form.bankName.trim(),
      accountHolderName: form.accountHolderName.trim(),
      accountNumber: form.accountNumber.trim(),
      ifscCode: form.ifscCode.trim().toUpperCase(),
      accountType: form.accountType,
      upiId: form.upiId.trim(),
      categoryId: form.categoryId,
      services: Object.entries(form.selectedServices).map(([serviceId, info]) => ({
        serviceId,
        price: Number(info.price),
      })),
    };
    if (phoneEditable) payload.phone = form.phone.replace(/\D/g, "");

    setSaving(true);
    await onSubmit(payload);
    setSaving(false);
  };

  const stepMeta = useMemo(() => STEPS.find((item) => item.id === step) || STEPS[0], [step]);

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF6A00]/12 text-[#FF6A00]">
          <User className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-black text-gray-900">{copy.title}</h1>
          <p className="mt-1 text-sm text-gray-500">{copy.subtitle}</p>
        </div>
      </div>

      {rejectionReason ? (
        <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-bold">Previous submission rejected</p>
          <p className="mt-1">{rejectionReason}</p>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
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
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#FF6A00]" : "text-gray-400"}`} />
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
          <Field label="Full name" required error={errors.ownerName}>
            <input
              className={inputClass(Boolean(errors.ownerName))}
              value={form.ownerName}
              onChange={(e) => setField("ownerName", e.target.value)}
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
          <Field
            label="Mobile number"
            required={phoneRequired}
            error={errors.phone}
            hint={phoneEditable ? "10-digit mobile number" : mode === "adminEdit" ? "Phone number can't be changed here" : "Verified via OTP"}
          >
            <input
              className={inputClass(Boolean(errors.phone))}
              value={form.phone}
              disabled={!phoneEditable}
              onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder={phoneEditable ? "9876543210" : undefined}
            />
          </Field>

          {zonesLoading ? (
            <Field label="Service Zone" required>
              <div className={`${inputClass(false)} flex items-center gap-2 text-gray-400`}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading available zones…
              </div>
            </Field>
          ) : noZonesAvailable ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 sm:col-span-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-bold">
                  {mode === "self" ? "Service is currently not available in your area." : "No active zones yet."}
                </span>{" "}
                {mode === "self"
                  ? "There are no active service zones yet — please check back later or contact support."
                  : "Create and activate a zone before adding a provider."}
              </p>
            </div>
          ) : (
            <Field label="Service Zone" required error={errors.zoneId} hint="Only one active zone can be assigned">
              <select
                className={inputClass(Boolean(errors.zoneId))}
                value={form.zoneId}
                onChange={(e) => setField("zoneId", e.target.value)}
              >
                <option value="">Select a zone</option>
                {zones.map((zone) => (
                  <option key={zone._id} value={zone._id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="sm:col-span-2">
            <MediaUploadField
              label="Profile photo"
              value={form.profileImage}
              onChange={(url) => setField("profileImage", url)}
              folder="service-provider"
              imageOnly
            />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Experience" hint="e.g. 5 years">
            <input
              className={inputClass(false)}
              value={form.experience}
              onChange={(e) => setField("experience", e.target.value)}
            />
          </Field>
          <Field label="Skills" hint="Comma separated, e.g. AC repair, Wiring">
            <input
              className={inputClass(false)}
              value={form.skillsText}
              onChange={(e) => setField("skillsText", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="About">
              <textarea
                rows={3}
                className={inputClass(false)}
                value={form.about}
                onChange={(e) => setField("about", e.target.value)}
              />
            </Field>
          </div>
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
                placeholder="ABCDE1234F"
              />
            </Field>
            <Field label="Aadhaar" required error={errors.aadhaarNumber}>
              <input
                className={inputClass(Boolean(errors.aadhaarNumber))}
                value={form.aadhaarNumber}
                onChange={(e) => setField("aadhaarNumber", e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="12-digit Aadhaar number"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <MediaUploadField
                label="PAN document"
                value={form.panImage}
                onChange={(url) => setField("panImage", url)}
                folder="service-provider/kyc"
              />
              {errors.panImage ? (
                <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {errors.panImage}
                </span>
              ) : null}
            </div>
            <div>
              <MediaUploadField
                label="Aadhaar document"
                value={form.aadhaarImage}
                onChange={(url) => setField("aadhaarImage", url)}
                folder="service-provider/kyc"
              />
              {errors.aadhaarImage ? (
                <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {errors.aadhaarImage}
                </span>
              ) : null}
            </div>
          </div>
          <MediaUploadField
            label="Address proof (optional)"
            value={form.addressProofUrl}
            onChange={(url) => setField("addressProofUrl", url)}
            folder="service-provider/kyc"
          />
        </div>
      ) : null}

      {step === 4 ? (
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
          <Field label="UPI ID" hint="Optional">
            <input
              className={inputClass(false)}
              value={form.upiId}
              onChange={(e) => setField("upiId", e.target.value)}
            />
          </Field>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-4">
          {selectedZone ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
              <MapPin className="h-3.5 w-3.5 text-[#FF6A00]" />
              Showing services available in {selectedZone.name}
            </p>
          ) : null}

          {categoriesLoading ? (
            <p className="text-sm text-gray-400">Loading categories…</p>
          ) : categories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
              No active categories yet — contact admin.
            </p>
          ) : (
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-gray-700">
                Category<span className="ml-0.5 text-red-500"> *</span>
              </span>
              {errors.categoryId ? (
                <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {errors.categoryId}
                </span>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat._id}
                    type="button"
                    onClick={() => changeCategory(cat._id)}
                    className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                      form.categoryId === cat._id
                        ? "bg-[#FF6A00] text-white"
                        : "bg-gray-50 text-gray-700 hover:bg-orange-50 hover:text-[#FF6A00]"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.categoryId ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-700">
                  Services<span className="ml-0.5 text-red-500"> *</span>
                </span>
                <span className="text-xs text-gray-400">
                  {selectedCount} selected
                </span>
              </div>
              {errors.services ? (
                <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {errors.services}
                </span>
              ) : null}

              {servicesLoading ? (
                <p className="text-sm text-gray-400">Loading services…</p>
              ) : servicesInCategory.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
                  No services available in this category for your zone yet.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {servicesInCategory.map((svc) => {
                    const checked = svc._id in form.selectedServices;
                    const info = form.selectedServices[svc._id];
                    const disabledForNewPick = svc.stale && !checked;
                    return (
                      <div
                        key={svc._id}
                        className={`rounded-xl border p-3 transition-colors ${
                          checked ? (svc.stale ? "border-red-200 bg-red-50/40" : "border-[#FF6A00] bg-orange-50/40") : "border-gray-100"
                        }`}
                      >
                        <label className={`flex items-start gap-2.5 ${disabledForNewPick ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabledForNewPick}
                            onChange={() => toggleService(svc)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF6A00]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-gray-800">{svc.name}</span>
                            <span className="block text-xs text-gray-400">Admin price: {money(svc.basePrice)}</span>
                            {svc.stale ? (
                              <span className="mt-0.5 block text-[11px] font-semibold text-red-600">
                                No longer active in this zone — remove it
                              </span>
                            ) : null}
                          </span>
                        </label>
                        {checked ? (
                          <div className="mt-2.5 border-t border-orange-100/80 pt-2.5">
                            <span className="mb-1 block text-[11px] font-bold text-[#FF6A00]">Provider price</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="₹ — required"
                              className={inputClass(false)}
                              value={info?.price ?? ""}
                              onChange={(e) => setServicePrice(svc._id, e.target.value)}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-[11px] text-gray-400">
                Admin price is what customers see. Provider price is separate and only visible to you and admin.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 6 ? (
        <div className="space-y-4">
          <div className="space-y-3 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500" />
            <h2 className="text-sm font-black text-gray-900">{copy.reviewTitle}</h2>
            <p className="text-xs text-gray-500">{copy.reviewDescription}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Zone</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">{selectedZone?.name || "—"}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Category</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">{selectedCategory?.name || "—"}</p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Selected services ({selectedCount})
            </p>
            <div className="space-y-1.5">
              {Object.entries(form.selectedServices).map(([serviceId, info]) => (
                <div key={serviceId} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2 text-sm">
                  <span className="truncate font-semibold text-gray-800">{info.name}</span>
                  <span className="shrink-0 text-xs text-gray-500">
                    Admin: {money(info.basePrice)} · Your price: {info.price ? money(info.price) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-3 text-left text-sm text-emerald-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{copy.reviewNote}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          disabled={step === 1}
          onClick={goBack}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {step < LAST_STEP ? (
          <button
            type="button"
            disabled={noZonesAvailable}
            onClick={goNext}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={saving || noZonesAvailable}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {copy.submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}
