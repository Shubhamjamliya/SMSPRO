import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileText,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import contractorApi from "../services/contractorApi";
import { DocumentPicker } from "../../shared/FilePicker";
import { setContractorAuth, getContractorUser } from "../utils/authContractor";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const STEPS = [
  { n: 1, label: "Business" },
  { n: 2, label: "Work" },
  { n: 3, label: "Coverage" },
  { n: 4, label: "Identity" },
  { n: 5, label: "Licences" },
  { n: 6, label: "Bank" },
  { n: 7, label: "Review" },
];

const BUSINESS_TYPES = [
  { value: "individual", label: "Individual contractor" },
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership", label: "Partnership firm" },
  { value: "pvt_ltd", label: "Private limited" },
  { value: "llp", label: "LLP" },
  { value: "other", label: "Other" },
];

const DOCUMENT_TYPES = [
  { value: "contractor_license", label: "Contractor licence" },
  { value: "business_registration", label: "Business registration" },
  { value: "gst_certificate", label: "GST certificate" },
  { value: "labour_license", label: "Labour licence" },
  { value: "pf_registration", label: "PF registration" },
  { value: "esi_registration", label: "ESI registration" },
  { value: "insurance", label: "Insurance" },
  { value: "trade_certificate", label: "Trade certificate" },
  { value: "iso_certificate", label: "ISO certificate" },
  { value: "other", label: "Other" },
];

const EMPTY = {
  businessName: "", businessType: "individual", ownerName: "", email: "",
  profileImage: "", yearsExperience: "", about: "",
  trades: [], projectSizeMin: "", projectSizeMax: "", maxConcurrentProjects: 3,
  serviceAreas: [], travelRadiusKm: "",
  panNumber: "", panImage: "", aadhaarNumber: "", aadhaarImage: "",
  gstNumber: "", gstImage: "",
  bankName: "", accountHolderName: "", accountNumber: "", ifscCode: "",
  accountType: "current", upiId: "",
};

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[15px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:bg-gray-50";

function Field({ label, required, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-gray-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

/** Editor for a list of short strings — used for the areas a contractor covers. */
function ChipList({ values, onChange, placeholder, disabled }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) { setDraft(""); return; }
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || !draft.trim()}
          className="shrink-0 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 disabled:text-gray-400"
        >
          Add
        </button>
      </div>
      {values.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <li key={`${v}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1.5 text-xs text-gray-700">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                disabled={disabled}
                className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function ContractorRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [trades, setTrades] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [rejection, setRejection] = useState("");
  const [docForm, setDocForm] = useState({ type: "contractor_license", label: "", documentNumber: "", fileUrl: "", expiresAt: "" });
  const [addingDoc, setAddingDoc] = useState(false);

  const set = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => (p[k] ? { ...p, [k]: undefined } : p));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const draft = await contractorApi.getDraft();
      const c = draft.contractor || {};
      setForm({
        businessName: c.businessName === "New contractor" ? "" : c.businessName || "",
        businessType: c.businessType || "individual",
        ownerName: c.ownerName === "Contractor" ? "" : c.ownerName || "",
        email: c.email || "",
        profileImage: c.profileImage || "",
        yearsExperience: c.yearsExperience ?? "",
        about: c.about || "",
        trades: (c.trades || []).map((t) => t.id),
        projectSizeMin: c.projectSizeMin ?? "",
        projectSizeMax: c.projectSizeMax ?? "",
        maxConcurrentProjects: c.maxConcurrentProjects ?? 3,
        serviceAreas: c.serviceAreas || [],
        travelRadiusKm: c.travelRadiusKm ?? "",
        panNumber: c.documents?.panNumber || "",
        panImage: c.documents?.panImage || "",
        aadhaarNumber: c.documents?.aadhaarNumber || "",
        aadhaarImage: c.documents?.aadhaarImage || "",
        gstNumber: c.documents?.gstNumber || "",
        gstImage: c.documents?.gstImage || "",
        bankName: c.bank?.bankName || "",
        accountHolderName: c.bank?.accountHolderName || "",
        accountNumber: c.bank?.accountNumber || "",
        ifscCode: c.bank?.ifscCode || "",
        accountType: c.bank?.accountType || "current",
        upiId: c.bank?.upiId || "",
      });
      setTrades(draft.availableTrades || []);
      setDocuments(draft.documents || []);
      setRejection(c.rejectionReason || "");
      setStep(Math.min(draft.resumeStep || 1, 7));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load your registration"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Saves progress so a contractor can leave halfway and come back. */
  const persist = async (nextStep) => {
    try {
      await contractorApi.saveDraft({
        businessName: form.businessName || undefined,
        businessType: form.businessType,
        ownerName: form.ownerName || undefined,
        email: form.email || undefined,
        yearsExperience: form.yearsExperience === "" ? undefined : Number(form.yearsExperience),
        about: form.about || undefined,
        trades: form.trades.length ? form.trades : undefined,
        projectSizeMin: form.projectSizeMin === "" ? undefined : Number(form.projectSizeMin),
        projectSizeMax: form.projectSizeMax === "" ? undefined : Number(form.projectSizeMax),
        maxConcurrentProjects: Number(form.maxConcurrentProjects) || 3,
        serviceAreas: form.serviceAreas.length ? form.serviceAreas : undefined,
        travelRadiusKm: form.travelRadiusKm === "" ? undefined : Number(form.travelRadiusKm),
        panNumber: form.panNumber || undefined,
        panImage: form.panImage || undefined,
        aadhaarNumber: form.aadhaarNumber || undefined,
        aadhaarImage: form.aadhaarImage || undefined,
        gstNumber: form.gstNumber || undefined,
        gstImage: form.gstImage || undefined,
        bankName: form.bankName || undefined,
        accountHolderName: form.accountHolderName || undefined,
        accountNumber: form.accountNumber || undefined,
        ifscCode: form.ifscCode || undefined,
        accountType: form.accountType,
        upiId: form.upiId || undefined,
        onboardingStep: nextStep,
      });
    } catch {
      // Saving progress is best-effort — never block the contractor from moving on.
    }
  };

  const validateStep = () => {
    const e = {};
    if (step === 1) {
      if (!form.businessName.trim()) e.businessName = "Business name is required";
      if (!form.ownerName.trim()) e.ownerName = "Your name is required";
      if (form.yearsExperience === "") e.yearsExperience = "How many years have you been working?";
    }
    if (step === 2) {
      if (!form.trades.length) e.trades = "Select at least one kind of work";
      const min = form.projectSizeMin === "" ? null : Number(form.projectSizeMin);
      const max = form.projectSizeMax === "" ? null : Number(form.projectSizeMax);
      if (min != null && max != null && max < min) e.projectSizeMax = "Maximum cannot be less than the minimum";
    }
    if (step === 3 && !form.serviceAreas.length) e.serviceAreas = "Add at least one area you work in";
    if (step === 4) {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.panNumber.trim().toUpperCase())) e.panNumber = "PAN must look like ABCDE1234F";
      if (!form.panImage.trim()) e.panImage = "Upload a copy of your PAN";
      if (!/^[0-9]{12}$/.test(form.aadhaarNumber.replace(/\s/g, ""))) e.aadhaarNumber = "Aadhaar must be 12 digits";
      if (!form.aadhaarImage.trim()) e.aadhaarImage = "Upload a copy of your Aadhaar";
    }
    if (step === 5 && documents.length === 0) {
      e.documents = "Upload at least one licence or registration — your verification depends on it";
    }
    if (step === 6) {
      if (!form.bankName.trim()) e.bankName = "Bank name is required";
      if (!form.accountHolderName.trim()) e.accountHolderName = "Account holder name is required";
      if (form.accountNumber.trim().length < 6) e.accountNumber = "Enter a valid account number";
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode.trim().toUpperCase())) e.ifscCode = "IFSC must look like HDFC0001234";
    }
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0]);
      return false;
    }
    return true;
  };

  const next = async () => {
    if (!validateStep()) return;
    const nextStep = Math.min(step + 1, 7);
    await persist(nextStep);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addDocument = async () => {
    if (!docForm.fileUrl.trim()) { toast.error("Add the document file URL"); return; }
    if (docForm.type === "other" && !docForm.label.trim()) { toast.error("Name the document"); return; }
    setAddingDoc(true);
    try {
      await contractorApi.addDocument({
        type: docForm.type,
        label: docForm.label || undefined,
        documentNumber: docForm.documentNumber || undefined,
        fileUrl: docForm.fileUrl.trim(),
        expiresAt: docForm.expiresAt ? new Date(docForm.expiresAt).toISOString() : undefined,
      });
      setDocuments(await contractorApi.listDocuments());
      setDocForm({ type: "contractor_license", label: "", documentNumber: "", fileUrl: "", expiresAt: "" });
      setErrors((p) => ({ ...p, documents: undefined }));
      toast.success("Document added");
    } catch (error) {
      toast.error(errorMessage(error, "Could not add the document"));
    } finally {
      setAddingDoc(false);
    }
  };

  const removeDocument = async (id) => {
    try {
      await contractorApi.deleteDocument(id);
      setDocuments(await contractorApi.listDocuments());
      toast.success("Document removed");
    } catch (error) {
      toast.error(errorMessage(error, "Could not remove the document"));
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const result = await contractorApi.submit({
        businessName: form.businessName.trim(),
        businessType: form.businessType,
        ownerName: form.ownerName.trim(),
        email: form.email.trim(),
        profileImage: form.profileImage,
        yearsExperience: Number(form.yearsExperience) || 0,
        about: form.about.trim(),
        trades: form.trades,
        projectSizeMin: form.projectSizeMin === "" ? null : Number(form.projectSizeMin),
        projectSizeMax: form.projectSizeMax === "" ? null : Number(form.projectSizeMax),
        maxConcurrentProjects: Number(form.maxConcurrentProjects) || 3,
        serviceAreas: form.serviceAreas,
        travelRadiusKm: form.travelRadiusKm === "" ? null : Number(form.travelRadiusKm),
        panNumber: form.panNumber.trim().toUpperCase(),
        panImage: form.panImage.trim(),
        aadhaarNumber: form.aadhaarNumber.replace(/\s/g, ""),
        aadhaarImage: form.aadhaarImage.trim(),
        gstNumber: form.gstNumber.trim().toUpperCase(),
        gstImage: form.gstImage.trim(),
        bankName: form.bankName.trim(),
        accountHolderName: form.accountHolderName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifscCode: form.ifscCode.trim().toUpperCase(),
        accountType: form.accountType,
        upiId: form.upiId.trim(),
      });
      // A fresh token pair comes back, so a long registration does not end at
      // the login screen the moment it is finished.
      setContractorAuth(result.accessToken, result.contractor, result.refreshToken);
      toast.success("Registration submitted for verification");
      navigate("/contractor/status", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "Could not submit your registration"));
    } finally {
      setBusy(false);
    }
  };

  const selectedTradeNames = useMemo(
    () => trades.filter((t) => form.trades.includes(t._id)).map((t) => t.name),
    [trades, form.trades],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-white px-4 py-8">
        <div className="mx-auto max-w-lg space-y-4">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-2 w-full animate-pulse rounded bg-gray-100" />
          <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-3">
            {step > 1 ? (
              <button type="button" onClick={back} className="-ml-1.5 rounded-lg p-1.5 text-gray-600 hover:bg-gray-100" aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-600">
                Step {step} of 7
              </p>
              <h1 className="truncate text-[17px] font-bold tracking-tight text-gray-900">
                {STEPS[step - 1].label}
              </h1>
            </div>
          </div>
          <div className="mt-2.5 flex gap-1">
            {STEPS.map((s) => (
              <span
                key={s.n}
                className={`h-1 flex-1 rounded-full ${s.n <= step ? "bg-orange-500" : "bg-gray-200"}`}
              />
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-5">
        {rejection ? (
          <div className="mb-5 flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-900">Your last submission was not approved</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-red-700">{rejection}</p>
            </div>
          </div>
        ) : null}

        {/* ---- Step 1 : business ---- */}
        {step === 1 ? (
          <div className="space-y-4">
            <Field label="Business name" required error={errors.businessName}>
              <input className={inputClass} value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="e.g. Sharma Constructions" />
            </Field>
            <Field label="Type of business" required>
              <select className={inputClass} value={form.businessType} onChange={(e) => set("businessType", e.target.value)}>
                {BUSINESS_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </Field>
            <Field label="Your name" required error={errors.ownerName}>
              <input className={inputClass} value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} placeholder="Full name" />
            </Field>
            <Field label="Email" hint="Optional — we use it for quotes and settlement statements">
              <input className={inputClass} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
            </Field>
            <Field label="Years of experience" required error={errors.yearsExperience}>
              <input className={inputClass} type="number" min={0} max={100} value={form.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value)} />
            </Field>
            <Field label="About your work" hint="Shown on your public profile. What you are known for.">
              <textarea className={inputClass} rows={4} value={form.about} onChange={(e) => set("about", e.target.value)} />
            </Field>
          </div>
        ) : null}

        {/* ---- Step 2 : trades and capacity ---- */}
        {step === 2 ? (
          <div className="space-y-5">
            <Field label="What kinds of work do you take on?" required error={errors.trades} hint="Pick every trade you handle — you are not limited to one.">
              <div className="mt-1 grid gap-2">
                {trades.map((t) => {
                  const on = form.trades.includes(t._id);
                  return (
                    <button
                      key={t._id}
                      type="button"
                      onClick={() => set("trades", on ? form.trades.filter((x) => x !== t._id) : [...form.trades, t._id])}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${on ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:bg-gray-50"}`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? "border-orange-500 bg-orange-500 text-white" : "border-gray-300"}`}>
                        {on ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900">{t.name}</span>
                        {t.description ? <span className="block truncate text-xs text-gray-500">{t.description}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Smallest project (₹)" hint="Optional">
                <input className={inputClass} type="number" min={0} value={form.projectSizeMin} onChange={(e) => set("projectSizeMin", e.target.value)} />
              </Field>
              <Field label="Largest project (₹)" error={errors.projectSizeMax} hint="Optional">
                <input className={inputClass} type="number" min={0} value={form.projectSizeMax} onChange={(e) => set("projectSizeMax", e.target.value)} />
              </Field>
            </div>

            <Field
              label="How many projects can you run at once?"
              required
              hint="We will not send you new enquiries beyond this. You can change it later."
            >
              <input className={inputClass} type="number" min={1} max={100} value={form.maxConcurrentProjects} onChange={(e) => set("maxConcurrentProjects", e.target.value)} />
            </Field>
          </div>
        ) : null}

        {/* ---- Step 3 : coverage ---- */}
        {step === 3 ? (
          <div className="space-y-4">
            <Field label="Which areas do you work in?" required error={errors.serviceAreas} hint="Add each city or locality. Press Enter after each one.">
              <ChipList values={form.serviceAreas} onChange={(v) => set("serviceAreas", v)} placeholder="e.g. Indore" />
            </Field>
            <Field label="How far will you travel? (km)" hint="Optional — helps us match nearby enquiries first">
              <input className={inputClass} type="number" min={0} max={1000} value={form.travelRadiusKm} onChange={(e) => set("travelRadiusKm", e.target.value)} />
            </Field>
          </div>
        ) : null}

        {/* ---- Step 4 : identity ---- */}
        {step === 4 ? (
          <div className="space-y-4">
            <Field label="PAN number" required error={errors.panNumber}>
              <input className={`${inputClass} uppercase`} maxLength={10} value={form.panNumber} onChange={(e) => set("panNumber", e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
            </Field>
            <DocumentPicker
              label="PAN card copy"
              required
              error={errors.panImage}
              value={form.panImage}
              folder="construction/contractors/kyc"
              onChange={(url) => set("panImage", url)}
            />
            <Field label="Aadhaar number" required error={errors.aadhaarNumber}>
              <input className={inputClass} inputMode="numeric" maxLength={12} value={form.aadhaarNumber} onChange={(e) => set("aadhaarNumber", e.target.value.replace(/\D/g, ""))} placeholder="12 digits" />
            </Field>
            <DocumentPicker
              label="Aadhaar copy"
              required
              error={errors.aadhaarImage}
              value={form.aadhaarImage}
              folder="construction/contractors/kyc"
              onChange={(url) => set("aadhaarImage", url)}
            />
            <Field label="GST number" hint="Optional — required only if you are registered">
              <input className={`${inputClass} uppercase`} maxLength={15} value={form.gstNumber} onChange={(e) => set("gstNumber", e.target.value.toUpperCase())} />
            </Field>
          </div>
        ) : null}

        {/* ---- Step 5 : licences ---- */}
        {step === 5 ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5">
              <p className="text-[13px] leading-relaxed text-blue-900">
                Your licences are what customers actually trust. We check every one before
                approving you, and warn you before any of them expires.
              </p>
            </div>

            {documents.length ? (
              <ul className="space-y-2">
                {documents.map((d) => (
                  <li key={d._id} className="flex items-start gap-3 rounded-xl border border-gray-200 p-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {d.label || DOCUMENT_TYPES.find((t) => t.value === d.type)?.label || d.type}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {d.documentNumber ? `${d.documentNumber} · ` : ""}
                        {d.expiresAt ? `Expires ${new Date(d.expiresAt).toLocaleDateString("en-IN")}` : "No expiry"}
                        {" · "}
                        <span className={d.status === "verified" ? "text-emerald-600" : d.status === "rejected" ? "text-red-600" : "text-amber-600"}>
                          {d.status}
                        </span>
                      </p>
                    </div>
                    {d.status !== "verified" ? (
                      <button type="button" onClick={() => removeDocument(d._id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 py-6 text-center text-sm text-gray-500">
                No documents added yet
              </p>
            )}

            {errors.documents ? <p className="text-xs text-red-600">{errors.documents}</p> : null}

            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3.5">
              <p className="text-sm font-semibold text-gray-900">Add a document</p>
              <select className={inputClass} value={docForm.type} onChange={(e) => setDocForm((p) => ({ ...p, type: e.target.value }))}>
                {DOCUMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {docForm.type === "other" ? (
                <input className={inputClass} placeholder="Name of the document" value={docForm.label} onChange={(e) => setDocForm((p) => ({ ...p, label: e.target.value }))} />
              ) : null}
              <input className={inputClass} placeholder="Document number (optional)" value={docForm.documentNumber} onChange={(e) => setDocForm((p) => ({ ...p, documentNumber: e.target.value }))} />
              <DocumentPicker
                label=""
                value={docForm.fileUrl}
                folder="construction/contractors/documents"
                hint="PDF or a clear photo of the document"
                onChange={(url) => setDocForm((p) => ({ ...p, fileUrl: url }))}
              />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Expiry date (leave blank if it does not expire)</span>
                <input className={inputClass} type="date" value={docForm.expiresAt} onChange={(e) => setDocForm((p) => ({ ...p, expiresAt: e.target.value }))} />
              </label>
              <button
                type="button"
                onClick={addDocument}
                disabled={addingDoc}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-white py-2.5 text-sm font-semibold text-orange-600 hover:bg-orange-50 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> {addingDoc ? "Adding…" : "Add document"}
              </button>
            </div>
          </div>
        ) : null}

        {/* ---- Step 6 : bank ---- */}
        {step === 6 ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3.5">
              <p className="text-[13px] leading-relaxed text-gray-600">
                This is where your stage payments are sent. Money is released automatically
                once a stage is approved — you never have to chase it.
              </p>
            </div>
            <Field label="Bank name" required error={errors.bankName}>
              <input className={inputClass} value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
            </Field>
            <Field label="Account holder name" required error={errors.accountHolderName} hint="Exactly as it appears on your passbook">
              <input className={inputClass} value={form.accountHolderName} onChange={(e) => set("accountHolderName", e.target.value)} />
            </Field>
            <Field label="Account number" required error={errors.accountNumber}>
              <input className={inputClass} value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
            </Field>
            <Field label="IFSC code" required error={errors.ifscCode}>
              <input className={`${inputClass} uppercase`} maxLength={11} value={form.ifscCode} onChange={(e) => set("ifscCode", e.target.value.toUpperCase())} placeholder="HDFC0001234" />
            </Field>
            <Field label="Account type" required>
              <select className={inputClass} value={form.accountType} onChange={(e) => set("accountType", e.target.value)}>
                <option value="current">Current</option>
                <option value="savings">Savings</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="UPI ID" hint="Optional">
              <input className={inputClass} value={form.upiId} onChange={(e) => set("upiId", e.target.value)} />
            </Field>
          </div>
        ) : null}

        {/* ---- Step 7 : review ---- */}
        {step === 7 ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-gray-600">
              Check everything below, then submit. Our team verifies your licences before
              you start receiving enquiries — usually within a couple of working days.
            </p>
            {[
              ["Business", `${form.businessName} · ${BUSINESS_TYPES.find((b) => b.value === form.businessType)?.label}`],
              ["Owner", `${form.ownerName}${form.email ? ` · ${form.email}` : ""}`],
              ["Experience", `${form.yearsExperience} years`],
              ["Work you take on", selectedTradeNames.join(", ") || "—"],
              ["Areas", form.serviceAreas.join(", ") || "—"],
              ["Projects at once", String(form.maxConcurrentProjects)],
              ["PAN", form.panNumber],
              ["Documents", `${documents.length} uploaded`],
              ["Bank", `${form.bankName} · ${form.accountNumber.replace(/.(?=.{4})/g, "•")}`],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 border-b border-gray-100 pb-3 last:border-0">
                <span className="w-36 shrink-0 text-[13px] text-gray-500">{k}</span>
                <span className="min-w-0 flex-1 text-[14px] font-medium text-gray-900">{v}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-lg">
          {step < 7 ? (
            <button
              type="button"
              onClick={next}
              className="w-full rounded-xl bg-orange-500 py-3.5 text-[15px] font-semibold text-white hover:bg-orange-600"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full rounded-xl bg-orange-500 py-3.5 text-[15px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {busy ? "Submitting…" : "Submit for verification"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
