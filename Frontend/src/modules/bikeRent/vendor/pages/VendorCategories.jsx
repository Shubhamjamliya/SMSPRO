import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Store, Tag } from "lucide-react";
import VendorLayout from "../components/VendorLayout";
import VendorModal from "../components/VendorModal";
import { bikeVendorApi } from "../services/vendorApi";

const emptyForm = { name: "", description: "", defaultSecurityDeposit: "" };

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

export default function VendorCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bikeVendorApi.getCategories({ limit: 100 });
      setCategories(data.records || []);
    } catch {
      toast.error("Could not load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const adminCategories = useMemo(
    () => categories.filter((cat) => cat.ownerType === "admin"),
    [categories],
  );
  const myCategories = useMemo(
    () => categories.filter((cat) => cat.ownerType !== "admin"),
    [categories],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openResubmit = (cat) => {
    setEditingId(cat.id);
    setForm({
      name: cat.name || "",
      description: cat.description || "",
      defaultSecurityDeposit: cat.defaultSecurityDeposit ?? "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Category name is required");
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      defaultSecurityDeposit: form.defaultSecurityDeposit === "" ? 0 : Number(form.defaultSecurityDeposit),
    };
    try {
      if (editingId) {
        await bikeVendorApi.resubmitCategory(editingId, payload);
        toast.success("Category resubmitted for admin approval");
      } else {
        await bikeVendorApi.createCategory(payload);
        toast.success("Category submitted for admin approval");
      }
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not submit category");
    } finally {
      setSaving(false);
    }
  };

  const renderCard = (cat, variant) => {
    const isAdmin = variant === "admin";
    return (
      <div
        key={cat.id}
        className={`rounded-2xl border p-4 shadow-sm ${
          isAdmin ? "border-blue-100 bg-blue-50/40" : "border-gray-100 bg-white"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Building2 className="h-4 w-4 text-blue-500" />
            ) : (
              <Tag className="h-4 w-4 text-[#FF6A00]" />
            )}
            <p className="text-sm font-bold text-gray-900">{cat.name}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              STATUS_STYLES[cat.approvalStatus] || "bg-gray-100 text-gray-500"
            }`}
          >
            {cat.approvalStatus}
          </span>
        </div>
        {cat.description && <p className="mt-2 text-xs text-gray-500">{cat.description}</p>}
        {isAdmin ? (
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600">
            <Building2 className="h-3 w-3" />
            Platform category · shared with every vendor
          </p>
        ) : (
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF6A00]">
            <Store className="h-3 w-3" />
            Created by you
          </p>
        )}
        {cat.approvalStatus === "rejected" && cat.rejectionReason && (
          <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-600">
            {cat.rejectionReason}
          </p>
        )}
        {!isAdmin && (
          <div className="mt-3 flex items-center gap-2">
            {cat.approvalStatus === "rejected" && (
              <button
                type="button"
                onClick={() => openResubmit(cat)}
                className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50"
              >
                Edit & resubmit
              </button>
            )}
            {cat.approvalHistory?.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryFor(historyFor === cat.id ? null : cat.id)}
                className="text-[11px] font-bold text-gray-400 hover:text-gray-600"
              >
                {historyFor === cat.id ? "Hide history" : "View history"}
              </button>
            )}
          </div>
        )}
        {historyFor === cat.id && cat.approvalHistory?.length > 0 && (
          <ol className="mt-2 space-y-1 border-l border-gray-100 pl-3">
            {cat.approvalHistory.map((h, i) => (
              <li key={i} className="text-[11px] text-gray-500">
                <span className="font-bold text-gray-700">{HISTORY_LABELS[h.status] || h.status}</span>
                {h.changedAt ? ` · ${new Date(h.changedAt).toLocaleString()}` : ""}
                {h.reason ? ` — ${h.reason}` : ""}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  };

  return (
    <VendorLayout
      title="Categories"
      subtitle="Pick from the shared catalog, or propose a new category for admin approval."
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-3 py-2 text-xs font-bold text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Propose category
        </button>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading categories…</p>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500" />
              <div>
                <h2 className="text-sm font-extrabold text-gray-900">Admin Categories</h2>
                <p className="text-xs text-gray-500">
                  Shared/default categories every vendor can use on their bikes.
                </p>
              </div>
            </div>
            {adminCategories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-100 bg-blue-50/30 p-6 text-center text-sm text-gray-500">
                No admin categories available yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {adminCategories.map((cat) => renderCard(cat, "admin"))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Store className="h-4 w-4 text-[#FF6A00]" />
              <div>
                <h2 className="text-sm font-extrabold text-gray-900">My Categories</h2>
                <p className="text-xs text-gray-500">
                  Categories you've proposed — pending, approved, or rejected by admin.
                </p>
              </div>
            </div>
            {myCategories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                You haven't proposed any categories yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {myCategories.map((cat) => renderCard(cat, "vendor"))}
              </div>
            )}
          </section>
        </div>
      )}

      <VendorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit & resubmit category" : "Propose a new category"}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">
              Category name <span className="text-[#FF6A00]">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">Default security deposit (₹)</label>
            <input
              value={form.defaultSecurityDeposit}
              onChange={(e) => setForm((f) => ({ ...f, defaultSecurityDeposit: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {editingId
              ? "Fix the issue admin flagged, then resubmit — it goes back to admin for review."
              : "New categories are reviewed by admin before they become visible to customers or usable on your bikes."}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? "Submitting…" : editingId ? "Resubmit for approval" : "Submit for approval"}
          </button>
        </div>
      </VendorModal>
    </VendorLayout>
  );
}
