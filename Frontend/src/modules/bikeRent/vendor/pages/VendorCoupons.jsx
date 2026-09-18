import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Tag } from "lucide-react";
import VendorLayout from "../components/VendorLayout";
import VendorModal from "../components/VendorModal";
import { bikeVendorApi } from "../services/vendorApi";

const emptyForm = {
  code: "",
  name: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  minimumAmount: "",
  maximumDiscount: "",
  usageLimit: "",
  perUserLimit: "1",
  validFrom: "",
  validTill: "",
};

const STATUS_STYLES = {
  approved: "bg-emerald-50 text-emerald-600",
  pending: "bg-amber-50 text-amber-600",
  rejected: "bg-red-50 text-red-600",
};

const HISTORY_LABELS = {
  submitted: "Submitted",
  rejected: "Rejected",
  resubmitted: "Resubmitted",
  approved: "Approved",
};

const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

export default function VendorCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bikeVendorApi.getCoupons({ limit: 100 });
      setCoupons(data.records || []);
    } catch {
      toast.error("Could not load coupons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setEditingCoupon(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openResubmit = (coupon) => {
    setEditingId(coupon.id);
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code || "",
      name: coupon.name || "",
      description: coupon.description || "",
      discountType: coupon.discountType || "percentage",
      discountValue: coupon.discountValue ?? "",
      minimumAmount: coupon.minimumAmount ?? "",
      maximumDiscount: coupon.maximumDiscount ?? "",
      usageLimit: coupon.usageLimit ?? "",
      perUserLimit: coupon.perUserLimit ?? "1",
      validFrom: toDateInput(coupon.validFrom),
      validTill: toDateInput(coupon.validTill),
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.code.trim()) return toast.error("Coupon code is required");
    if (!form.name.trim()) return toast.error("Coupon name is required");
    if (!form.discountValue) return toast.error("Discount value is required");
    if (!form.validFrom || !form.validTill) return toast.error("Valid from/till dates are required");

    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      applicableOn: "rental",
      minimumAmount: form.minimumAmount === "" ? 0 : Number(form.minimumAmount),
      maximumDiscount: form.maximumDiscount === "" ? 0 : Number(form.maximumDiscount),
      usageLimit: form.usageLimit === "" ? 0 : Number(form.usageLimit),
      perUserLimit: form.perUserLimit === "" ? 1 : Number(form.perUserLimit),
      validFrom: new Date(form.validFrom).toISOString(),
      validTill: new Date(form.validTill).toISOString(),
    };

    setSaving(true);
    try {
      if (editingId && editingCoupon?.approvalStatus === "rejected") {
        await bikeVendorApi.resubmitCoupon(editingId, payload);
        toast.success("Coupon resubmitted for admin approval");
      } else {
        await bikeVendorApi.createCoupon(payload);
        toast.success("Coupon submitted for admin approval");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not submit coupon");
    } finally {
      setSaving(false);
    }
  };

  return (
    <VendorLayout
      title="Coupons"
      subtitle="Create promo codes for your own bikes. The discount comes out of your wallet earnings, so admin reviews every coupon before it goes live."
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-3 py-2 text-xs font-bold text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          New coupon
        </button>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading coupons…</p>
      ) : coupons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No coupons yet. Create one to offer a discount on your bikes.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((c) => (
            <div key={c.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-[#FF6A00]" />
                  <p className="text-sm font-bold text-gray-900">{c.code}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    STATUS_STYLES[c.approvalStatus] || "bg-gray-100 text-gray-500"
                  }`}
                >
                  {c.approvalStatus}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{c.name}</p>
              <p className="mt-2 text-xs font-semibold text-gray-700">
                {c.discountType === "fixed" ? `₹${c.discountValue} off` : `${c.discountValue}% off`}
                {c.minimumAmount ? ` · min ₹${c.minimumAmount}` : ""}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">
                Valid {c.validFrom ? new Date(c.validFrom).toLocaleDateString() : "—"} –{" "}
                {c.validTill ? new Date(c.validTill).toLocaleDateString() : "—"}
              </p>
              {c.approvalStatus === "rejected" && c.rejectionReason && (
                <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-600">
                  {c.rejectionReason}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                {c.approvalStatus === "rejected" && (
                  <button
                    type="button"
                    onClick={() => openResubmit(c)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50"
                  >
                    Edit & resubmit
                  </button>
                )}
                {c.approvalHistory?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHistoryFor(historyFor === c.id ? null : c.id)}
                    className="text-[11px] font-bold text-gray-400 hover:text-gray-600"
                  >
                    {historyFor === c.id ? "Hide history" : "View history"}
                  </button>
                )}
              </div>
              {historyFor === c.id && c.approvalHistory?.length > 0 && (
                <ol className="mt-2 space-y-1 border-l border-gray-100 pl-3">
                  {c.approvalHistory.map((h, i) => (
                    <li key={i} className="text-[11px] text-gray-500">
                      <span className="font-bold text-gray-700">{HISTORY_LABELS[h.status] || h.status}</span>
                      {h.changedAt ? ` · ${new Date(h.changedAt).toLocaleString()}` : ""}
                      {h.reason ? ` — ${h.reason}` : ""}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}

      <VendorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit & resubmit coupon" : "New coupon"}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Coupon code" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} />
          <Field label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold text-gray-600">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <Select
            label="Discount type"
            value={form.discountType}
            onChange={(v) => setForm((f) => ({ ...f, discountType: v }))}
            options={[
              { value: "percentage", label: "Percentage (%)" },
              { value: "fixed", label: "Fixed amount (₹)" },
            ]}
          />
          <Field
            label={form.discountType === "fixed" ? "Discount amount (₹)" : "Discount percent (%)"}
            value={form.discountValue}
            onChange={(v) => setForm((f) => ({ ...f, discountValue: v }))}
          />
          <Field
            label="Minimum booking amount (₹)"
            value={form.minimumAmount}
            onChange={(v) => setForm((f) => ({ ...f, minimumAmount: v }))}
            required={false}
          />
          <Field
            label="Maximum discount cap (₹, 0 = no cap)"
            value={form.maximumDiscount}
            onChange={(v) => setForm((f) => ({ ...f, maximumDiscount: v }))}
            required={false}
          />
          <Field
            label="Total usage limit (0 = unlimited)"
            value={form.usageLimit}
            onChange={(v) => setForm((f) => ({ ...f, usageLimit: v }))}
            required={false}
          />
          <Field
            label="Per-customer limit"
            value={form.perUserLimit}
            onChange={(v) => setForm((f) => ({ ...f, perUserLimit: v }))}
            required={false}
          />
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">
              Valid from <span className="text-[#FF6A00]">*</span>
            </label>
            <input
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">
              Valid till <span className="text-[#FF6A00]">*</span>
            </label>
            <input
              type="date"
              value={form.validTill}
              onChange={(e) => setForm((f) => ({ ...f, validTill: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          The discount is deducted from your wallet earnings for each booking that uses this coupon,
          on top of the normal commission — it only applies to your own bikes.
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-3 w-full rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Submitting…" : editingId ? "Resubmit for approval" : "Submit for approval"}
        </button>
      </VendorModal>
    </VendorLayout>
  );
}

function Field({ label, value, onChange, required = true }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-gray-600">
        {label}
        {required && <span className="text-[#FF6A00]"> *</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-gray-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
