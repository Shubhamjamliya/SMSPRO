import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, X, MapPin, Building2, Calendar, Wallet, Camera, ChevronRight, CheckCircle2 } from "lucide-react";
import constructionApi from "../services/api";
import { PhotoPicker } from "../../shared/FilePicker";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const inputClass =
  "w-full rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-2xs outline-none transition-all placeholder:text-slate-400 focus:border-amber-500/70 focus:ring-4 focus:ring-amber-500/10 font-medium";

const CONDITIONS = [
  { value: "empty_plot", label: "Empty plot" },
  { value: "existing_structure", label: "Existing structure" },
  { value: "partially_built", label: "Partially built" },
  { value: "demolition_needed", label: "Needs demolition" },
  { value: "other", label: "Something else" },
];

const URGENCY = [
  { value: "flexible", label: "I'm flexible" },
  { value: "within_month", label: "Within a month" },
  { value: "within_week", label: "Within a week" },
  { value: "immediate", label: "As soon as possible" },
];

const ATTACHMENT_KINDS = [
  { value: "site_photo", label: "Site photo", hint: "What the place looks like now" },
  { value: "drawing", label: "Drawing", hint: "Plans you already have" },
  { value: "reference", label: "Reference", hint: "What you want it to look like" },
];

function Field({ label, required, hint, error, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1 text-xs font-bold text-slate-800">
        {label}
        {required ? <span className="text-amber-600 font-extrabold">*</span> : null}
      </span>
      {children}
      {hint && !error ? <span className="block text-[11px] font-medium text-slate-500">{hint}</span> : null}
      {error ? <span className="block text-[11px] font-bold text-rose-600">{error}</span> : null}
    </label>
  );
}

/**
 * BRD C3 + C4 — Enquiry Form Page.
 * Multi-section interactive form to capture job specifications & photos.
 */
export default function EnquiryForm() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [attachDraft, setAttachDraft] = useState({ kind: "site_photo" });

  const [form, setForm] = useState({
    description: "",
    addressLine: "", area: "", city: "", state: "", pincode: "", landmark: "",
    plotArea: "", builtUpArea: "", areaUnit: "sqft", floors: "", currentCondition: "",
    budgetMin: "", budgetMax: "",
    urgency: "flexible", preferredStartDate: "",
    attachments: [],
  });

  const set = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => (p[k] ? { ...p, [k]: undefined } : p));
  };

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .getServiceDetail(serviceId)
      .then((s) => { if (!cancelled) setService(s); })
      .catch((error) => {
        if (!cancelled) {
          toast.error(errorMessage(error, "Could not load this service"));
          navigate("/construction", { replace: true });
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [serviceId, navigate]);

  const submit = async () => {
    const e = {};
    if (!form.city.trim()) e.city = "Which city is the site located in?";
    const min = form.budgetMin === "" ? null : Number(form.budgetMin);
    const max = form.budgetMax === "" ? null : Number(form.budgetMax);
    if (min != null && max != null && max < min) e.budgetMax = "Maximum budget cannot be less than minimum";
    setErrors(e);
    if (Object.keys(e).length) { toast.error(Object.values(e)[0]); return; }

    setBusy(true);
    try {
      const enquiry = await constructionApi.createEnquiry({
        serviceId: service._id || service.id,
        description: form.description.trim(),
        site: {
          addressLine: form.addressLine.trim(),
          area: form.area.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          pincode: form.pincode.trim(),
          landmark: form.landmark.trim(),
          plotArea: form.plotArea === "" ? null : Number(form.plotArea),
          builtUpArea: form.builtUpArea === "" ? null : Number(form.builtUpArea),
          areaUnit: form.areaUnit,
          floors: form.floors === "" ? null : Number(form.floors),
          currentCondition: form.currentCondition,
        },
        budgetMin: min,
        budgetMax: max,
        urgency: form.urgency,
        preferredStartDate: form.preferredStartDate
          ? new Date(form.preferredStartDate).toISOString()
          : null,
        attachments: form.attachments,
      });
      toast.success(`Enquiry ${enquiry.enquiryNumber} submitted successfully!`);
      navigate(`/construction/enquiries/${enquiry._id}`, { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "Could not submit your enquiry"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <div className="space-y-4 px-4 py-6">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-64 animate-pulse rounded-3xl bg-slate-200/80" />
        </div>
      </ConstructionPageShell>
    );
  }

  return (
    <ConstructionPageShell showBottomNav={false}>
      <ConstructionPageHeader
        title={`Enquiry for ${service?.name || "Service"}`}
        subtitle="100% Free · Verified contractors will contact you"
        backTo={`/construction/services/${service?.slug || serviceId}`}
      />

      <div className="space-y-6 px-4 py-6 pb-28">
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 via-amber-50/30 to-white p-3.5 shadow-2xs text-xs font-medium leading-relaxed text-amber-900">
          Tell us about your project requirements. Only the <strong className="font-extrabold text-amber-950">City</strong> is strictly required — adding details helps contractors produce accurate, competitive quotes.
        </div>

        {/* Section 1: Project Description */}
        <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3.5">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-amber-600" /> What do you need done?
          </h2>
          <Field label="Description" hint="Describe your project, desired layout, or key requirements">
            <textarea
              className={inputClass}
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Build a 3BHK duplex on a 1200 sqft plot, modern elevation with terrace garden..."
            />
          </Field>
        </section>

        {/* Section 2: Site Location */}
        <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3.5">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-amber-600" /> Site Location
          </h2>
          <Field label="City" required error={errors.city}>
            <input className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Indore, Bhopal, Mumbai" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area / Locality">
              <input className={inputClass} value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Vijay Nagar" />
            </Field>
            <Field label="Pincode">
              <input className={inputClass} inputMode="numeric" maxLength={6} value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} placeholder="452010" />
            </Field>
          </div>
          <Field label="Full Address" hint="Shared with matched contractors only after they accept your enquiry">
            <input className={inputClass} value={form.addressLine} onChange={(e) => set("addressLine", e.target.value)} placeholder="Plot No / Street name" />
          </Field>
          <Field label="Landmark">
            <input className={inputClass} value={form.landmark} onChange={(e) => set("landmark", e.target.value)} placeholder="Near city mall" />
          </Field>
        </section>

        {/* Section 3: Property Specs */}
        <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3.5">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-amber-600" /> Property Details
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Plot Area">
              <input className={inputClass} type="number" min={0} value={form.plotArea} onChange={(e) => set("plotArea", e.target.value)} placeholder="1200" />
            </Field>
            <Field label="Built-up Area">
              <input className={inputClass} type="number" min={0} value={form.builtUpArea} onChange={(e) => set("builtUpArea", e.target.value)} placeholder="1800" />
            </Field>
            <Field label="Unit">
              <select className={inputClass} value={form.areaUnit} onChange={(e) => set("areaUnit", e.target.value)}>
                <option value="sqft">sq ft</option>
                <option value="sqm">sq m</option>
                <option value="sqyd">sq yd</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Number of Floors">
              <input className={inputClass} type="number" min={0} value={form.floors} onChange={(e) => set("floors", e.target.value)} placeholder="G+1" />
            </Field>
            <Field label="Current Site Condition">
              <select className={inputClass} value={form.currentCondition} onChange={(e) => set("currentCondition", e.target.value)}>
                <option value="">Select condition</option>
                {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          </div>
        </section>

        {/* Section 4: Budget & Timing */}
        <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3.5">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Wallet className="h-4 w-4 text-amber-600" /> Budget & Timeline
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget Min (₹)" hint="Optional">
              <input className={inputClass} type="number" min={0} value={form.budgetMin} onChange={(e) => set("budgetMin", e.target.value)} placeholder="5,00,000" />
            </Field>
            <Field label="Budget Max (₹)" error={errors.budgetMax} hint="Optional">
              <input className={inputClass} type="number" min={0} value={form.budgetMax} onChange={(e) => set("budgetMax", e.target.value)} placeholder="20,00,000" />
            </Field>
          </div>
          <Field label="Start Timeline">
            <select className={inputClass} value={form.urgency} onChange={(e) => set("urgency", e.target.value)}>
              {URGENCY.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </Field>
          <Field label="Preferred Target Date" hint="Optional">
            <input className={inputClass} type="date" value={form.preferredStartDate} onChange={(e) => set("preferredStartDate", e.target.value)} />
          </Field>
        </section>

        {/* Section 5: Photos & Drawings */}
        <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3.5">
          <div className="flex items-center gap-1.5">
            <Camera className="h-4 w-4 text-amber-600" />
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Photos & Drawings
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Attach photographs of the existing site, floor plans, or reference design photos.
          </p>

          {form.attachments.length ? (
            <ul className="space-y-2">
              {form.attachments.map((a, i) => (
                <li key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5">
                  <img src={a.url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {ATTACHMENT_KINDS.find((k) => k.value === a.kind)?.label}
                    </p>
                    {a.caption ? <p className="truncate text-[11px] text-slate-500">{a.caption}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => set("attachments", form.attachments.filter((_, idx) => idx !== i))}
                    className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    aria-label="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="space-y-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
            <div className="flex gap-2">
              {ATTACHMENT_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setAttachDraft((p) => ({ ...p, kind: k.value }))}
                  className={`flex-1 rounded-xl border py-2 text-[11px] font-extrabold transition-all ${
                    attachDraft.kind === k.value
                      ? "border-amber-500 bg-amber-500/10 text-amber-800 shadow-2xs"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] font-medium text-slate-500">
              {ATTACHMENT_KINDS.find((k) => k.value === attachDraft.kind)?.hint}
            </p>
            <PhotoPicker
              label=""
              values={[]}
              max={20 - form.attachments.length}
              folder="construction/enquiries"
              onChange={(urls) => set("attachments", [
                ...form.attachments,
                ...urls.map((url) => ({ url, kind: attachDraft.kind, caption: "" })),
              ])}
            />
          </div>
        </section>
      </div>

      {/* Sticky Submit Bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 px-4 py-3.5 backdrop-blur-xl shadow-lg">
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-extrabold text-slate-950 shadow-xs hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busy ? "Submitting Enquiry..." : "Submit Free Enquiry"} <ChevronRight className="h-4 w-4 stroke-[2.5]" />
          </button>
          <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
            Immediate confirmation & reference number issued upon submit
          </p>
        </div>
      </div>
    </ConstructionPageShell>
  );
}

