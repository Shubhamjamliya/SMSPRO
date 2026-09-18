import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Building2, Check, FileText, Image as ImageIcon, Lock, Pencil, X,
} from "lucide-react";
import contractorApi from "../services/contractorApi";
import ContractorShell from "../components/ContractorShell";
import { PhotoPicker } from "../../shared/FilePicker";
import { updateContractorUser, getContractorUser } from "../utils/authContractor";
import { fullMoney, shortDate } from "../../shared/format";

/**
 * The contractor's own profile (BRD W1–W5).
 *
 * Everything they submitted during registration, in one readable page, plus the
 * parts they are allowed to change afterwards.
 *
 * The split matters and the page says so out loud: business name, owner name and
 * trades were checked against documents before approval, so they are shown with
 * a lock and a short explanation rather than silently omitted. A contractor who
 * cannot see why a field is uneditable assumes the app is broken; one who is
 * told it was verified understands, and knows to contact support.
 */
const DOC_STATUS = {
  pending: { label: "Waiting for review", tone: "bg-amber-50 text-amber-700" },
  verified: { label: "Verified", tone: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", tone: "bg-rose-50 text-rose-700" },
};

const DOC_TYPE_LABEL = {
  contractor_license: "Contractor licence",
  business_registration: "Business registration",
  gst_certificate: "GST certificate",
  labour_license: "Labour licence",
  pf_registration: "PF registration",
  esi_registration: "ESI registration",
  insurance: "Insurance",
  trade_certificate: "Trade certificate",
  iso_certificate: "ISO certificate",
  other: "Other",
};

export default function Profile() {
  const [contractor, setContractor] = useState(getContractorUser());
  const [documents, setDocuments] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    try {
      const [me, docs, folio] = await Promise.all([
        contractorApi.getMe(),
        contractorApi.listDocuments().catch(() => []),
        contractorApi.listPortfolio().catch(() => []),
      ]);
      setContractor(me);
      setDocuments(docs);
      setPortfolio(folio);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load your profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEditing = () => {
    setForm({
      profileImage: contractor?.profileImage || "",
      about: contractor?.about || "",
      email: contractor?.email || "",
      serviceAreas: (contractor?.serviceAreas || []).join(", "),
      travelRadiusKm: contractor?.travelRadiusKm ?? "",
      projectSizeMin: contractor?.projectSizeMin ?? "",
      projectSizeMax: contractor?.projectSizeMax ?? "",
      maxConcurrentProjects: contractor?.maxConcurrentProjects ?? "",
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await contractorApi.updateProfile({
        profileImage: form.profileImage,
        about: form.about,
        email: form.email,
        serviceAreas: form.serviceAreas.split(",").map((a) => a.trim()).filter(Boolean),
        travelRadiusKm: form.travelRadiusKm === "" ? null : Number(form.travelRadiusKm),
        projectSizeMin: form.projectSizeMin === "" ? null : Number(form.projectSizeMin),
        projectSizeMax: form.projectSizeMax === "" ? null : Number(form.projectSizeMax),
        maxConcurrentProjects:
          form.maxConcurrentProjects === "" ? null : Number(form.maxConcurrentProjects),
      });
      setContractor(updated);
      // Keep the cached copy in step, or the sidebar and header show stale details.
      updateContractorUser(updated);
      setEditing(false);
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save your profile");
    } finally {
      setSaving(false);
    }
  };

  /** The photo saves on its own — nobody expects to press Save after a photo. */
  const savePhoto = async (url) => {
    try {
      const updated = await contractorApi.updateProfile({ profileImage: url });
      setContractor(updated);
      updateContractorUser(updated);
      toast.success(url ? "Photo updated" : "Photo removed");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save the photo");
    }
  };

  if (loading) {
    return (
      <ContractorShell title="My profile">
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </ContractorShell>
    );
  }

  return (
    <ContractorShell
      title="My profile"
      subtitle={contractor?.contractorCode || "Your details"}
      action={
        !editing ? (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-orange-600 hover:bg-orange-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        ) : null
      }
    >
      <div className="space-y-5">
        {/* ---- photo + identity ---- */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <div className="relative">
                <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
                  {contractor?.profileImage ? (
                    <img
                      src={contractor.profileImage}
                      alt="Your business"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-7 w-7 text-gray-300" />
                  )}
                </span>
                {contractor?.profileImage && (
                  <button
                    type="button"
                    onClick={() => savePhoto("")}
                    aria-label="Remove photo"
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-gray-500 shadow ring-1 ring-gray-200 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="mt-2 w-20">
                <PhotoPicker
                  values={[]}
                  onChange={(urls) => urls[0] && savePhoto(urls[0])}
                  max={1}
                  folder="construction/contractors/profile"
                  label={contractor?.profileImage ? "Change" : "Add photo"}
                />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <Locked label="Business name" value={contractor?.businessName} />
              <Locked label="Owner" value={contractor?.ownerName} className="mt-2.5" />
              <Locked
                label="Type"
                value={String(contractor?.businessType || "").replace(/_/g, " ")}
                className="mt-2.5"
              />
            </div>
          </div>

          <p className="mt-3 flex items-start gap-1.5 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-500">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              These were checked against your documents before you were verified, so
              they cannot be edited here. Contact support if anything is wrong.
            </span>
          </p>
        </section>

        {/* ---- editable details ---- */}
        {editing ? (
          <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
            <p className="text-sm font-bold text-gray-900">Edit your details</p>

            <Field label="About your business">
              <textarea
                rows={3}
                value={form.about}
                onChange={(e) => setForm((p) => ({ ...p, about: e.target.value }))}
                placeholder="What you do, and what you are known for."
                className={inputClass}
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className={inputClass}
              />
            </Field>

            <Field label="Cities you work in" hint="Separate with commas">
              <input
                value={form.serviceAreas}
                onChange={(e) => setForm((p) => ({ ...p, serviceAreas: e.target.value }))}
                placeholder="Indore, Bhopal"
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Travel radius (km)">
                <input
                  type="number"
                  value={form.travelRadiusKm}
                  onChange={(e) => setForm((p) => ({ ...p, travelRadiusKm: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Projects at once" hint="Your honest capacity">
                <input
                  type="number"
                  value={form.maxConcurrentProjects}
                  onChange={(e) => setForm((p) => ({ ...p, maxConcurrentProjects: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Smallest job (₹)">
                <input
                  type="number"
                  value={form.projectSizeMin}
                  onChange={(e) => setForm((p) => ({ ...p, projectSizeMin: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Largest job (₹)">
                <input
                  type="number"
                  value={form.projectSizeMax}
                  onChange={(e) => setForm((p) => ({ ...p, projectSizeMax: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-sm font-bold text-gray-900">Your details</p>
            <dl className="space-y-3">
              <Row label="About" value={contractor?.about || "Not added yet"} />
              <Row label="Email" value={contractor?.email || "—"} />
              <Row label="Phone" value={contractor?.phone || "—"} />
              <Row
                label="Cities"
                value={(contractor?.serviceAreas || []).join(", ") || "—"}
              />
              <Row
                label="Travel radius"
                value={contractor?.travelRadiusKm ? `${contractor.travelRadiusKm} km` : "—"}
              />
              <Row
                label="Projects at once"
                value={contractor?.maxConcurrentProjects || "—"}
              />
              <Row
                label="Job size"
                value={
                  contractor?.projectSizeMin || contractor?.projectSizeMax
                    ? `${fullMoney(contractor.projectSizeMin)} – ${fullMoney(contractor.projectSizeMax)}`
                    : "—"
                }
              />
              <Row
                label="Experience"
                value={contractor?.yearsExperience ? `${contractor.yearsExperience} years` : "—"}
              />
            </dl>
          </section>
        )}

        {/* ---- trades (locked) ---- */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <p className="text-sm font-bold text-gray-900">Trades you are approved for</p>
            <Lock className="h-3 w-3 text-gray-400" />
          </div>
          {(contractor?.trades || []).length === 0 ? (
            <p className="text-xs text-gray-500">None recorded.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {contractor.trades.map((t) => (
                <li
                  key={t.id || t}
                  className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700"
                >
                  {t.name || "Trade"}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2.5 text-[11px] leading-relaxed text-gray-500">
            To add a trade, contact support — a new trade has to be verified before
            customers see it.
          </p>
        </section>

        {/* ---- documents ---- */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-bold text-gray-900">
            Documents ({documents.length})
          </p>
          {documents.length === 0 ? (
            <p className="text-xs text-gray-500">No documents on file.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => {
                const status = DOC_STATUS[d.status] || DOC_STATUS.pending;
                const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
                return (
                  <li
                    key={d._id}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/60 p-2.5"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs font-semibold text-gray-900 hover:text-orange-600"
                      >
                        {d.label || DOC_TYPE_LABEL[d.type] || d.type}
                      </a>
                      <p className="mt-0.5 text-[10.5px] text-gray-500">
                        {d.documentNumber ? `${d.documentNumber} · ` : ""}
                        {d.expiresAt
                          ? `${expired ? "Expired" : "Valid until"} ${shortDate(d.expiresAt)}`
                          : "No expiry"}
                      </p>
                      {d.status === "rejected" && d.rejectionReason && (
                        <p className="mt-1 rounded bg-rose-50 px-2 py-1 text-[10.5px] text-rose-700">
                          {d.rejectionReason}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        expired ? "bg-rose-50 text-rose-700" : status.tone
                      }`}
                    >
                      {expired ? "Expired" : status.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---- portfolio ---- */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-bold text-gray-900">
            Past work ({portfolio.length})
          </p>
          {portfolio.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center">
              <ImageIcon className="mx-auto mb-1.5 h-6 w-6 text-gray-300" />
              <p className="text-xs font-semibold text-gray-700">Nothing added yet</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                Photographs of finished work are the first thing customers look at.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {portfolio.map((p) => (
                <li key={p._id} className="overflow-hidden rounded-lg border border-gray-100">
                  {p.images?.[0] && (
                    <img
                      src={p.images[0]}
                      alt={p.title}
                      loading="lazy"
                      className="h-24 w-full object-cover"
                    />
                  )}
                  <p className="truncate px-2 py-1.5 text-[11px] font-semibold text-gray-800">
                    {p.title}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- bank ---- */}
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <p className="text-sm font-bold text-gray-900">Where you get paid</p>
            <Lock className="h-3 w-3 text-gray-400" />
          </div>
          <dl className="space-y-2">
            <Row label="Account holder" value={contractor?.bank?.accountHolder || "—"} />
            <Row
              label="Account"
              value={
                contractor?.bank?.accountNumber
                  ? `•••• ${String(contractor.bank.accountNumber).slice(-4)}`
                  : "—"
              }
            />
            <Row label="IFSC" value={contractor?.bank?.ifsc || "—"} />
          </dl>
          <p className="mt-2.5 text-[11px] leading-relaxed text-gray-500">
            Changing where your money lands needs a word with support — that is
            deliberate, and it protects you.
          </p>
        </section>
      </div>
    </ContractorShell>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-500";

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-700">
        {label}
        {hint && <span className="ml-1 font-normal text-gray-400">— {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-xs text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right text-xs font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

function Locked({ label, value, className = "" }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="truncate text-sm font-bold text-gray-900">{value || "—"}</p>
    </div>
  );
}
