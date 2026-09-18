import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import VendorLayout from "../components/VendorLayout";
import { bikeVendorApi } from "../services/vendorApi";

const message = (error, fallback) => error?.response?.data?.message || fallback;

const inputClass =
  "h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";
const hintClass = "mt-1.5 text-xs text-slate-500";
const errorClass = "mt-1.5 text-xs font-medium text-rose-600";

const EMPTY = {
  isGstRegistered: false,
  gstin: "",
  legalBusinessName: "",
  registeredAddress: { line1: "", line2: "", city: "", state: "", pincode: "" },
  panNumber: "",
};

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export default function VendorTaxBilling() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await bikeVendorApi.getTaxProfile();
      setForm({ ...EMPTY, ...profile, registeredAddress: { ...EMPTY.registeredAddress, ...profile?.registeredAddress } });
    } catch (error) {
      toast.error(message(error, "Failed to load tax profile"));
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const setAddress = (key, value) =>
    setForm((current) => ({
      ...current,
      registeredAddress: { ...current.registeredAddress, [key]: value },
    }));

  const save = async (event) => {
    event?.preventDefault?.();
    const next = {};
    if (form.isGstRegistered && !form.gstin.trim()) {
      next.gstin = "GSTIN is required when GST registered is on";
    }
    if (form.gstin && !GSTIN_REGEX.test(form.gstin.trim().toUpperCase())) {
      next.gstin = "Enter a valid GSTIN";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    setSaving(true);
    try {
      const saved = await bikeVendorApi.updateTaxProfile(form);
      setForm({ ...EMPTY, ...saved, registeredAddress: { ...EMPTY.registeredAddress, ...saved?.registeredAddress } });
      toast.success("Tax & billing details saved");
    } catch (error) {
      toast.error(message(error, "Failed to save tax & billing details"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <VendorLayout
      title="Tax & Billing"
      subtitle="Your GST registration and billing identity — shown on invoices for your bookings"
    >
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : !form ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-900">Could not load tax profile</p>
          <p className="mt-1 text-xs text-slate-500">Check your connection and try again.</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-4 pb-24 md:pb-4">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500">
            These are your business identity details for GST invoicing. The platform controls GST
            rates and platform fees — that isn&apos;t configurable here.
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF6A00]"
                checked={form.isGstRegistered}
                disabled={saving}
                onChange={(event) => set("isGstRegistered", event.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">I am GST registered</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Turn on if you have a GSTIN. Your GSTIN will then appear on customer invoices.
                </span>
              </span>
            </label>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={labelClass}>GSTIN</label>
                <input
                  className={inputClass}
                  value={form.gstin}
                  disabled={saving || !form.isGstRegistered}
                  placeholder="22AAAAA0000A1Z5"
                  onChange={(event) => set("gstin", event.target.value.toUpperCase())}
                />
                {errors.gstin ? <p className={errorClass}>{errors.gstin}</p> : null}
              </div>
              <div className="min-w-0">
                <label className={labelClass}>PAN number</label>
                <input
                  className={inputClass}
                  value={form.panNumber}
                  disabled={saving}
                  placeholder="ABCDE1234F"
                  onChange={(event) => set("panNumber", event.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className={labelClass}>Legal business name</label>
              <input
                className={inputClass}
                value={form.legalBusinessName}
                disabled={saving}
                placeholder="As registered with GST/PAN"
                onChange={(event) => set("legalBusinessName", event.target.value)}
              />
              <p className={hintClass}>Shown on invoices instead of your display business name, if set.</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="min-w-0">
                <label className={labelClass}>Registered address line 1</label>
                <input
                  className={inputClass}
                  value={form.registeredAddress.line1}
                  disabled={saving}
                  onChange={(event) => setAddress("line1", event.target.value)}
                />
              </div>
              <div className="min-w-0">
                <label className={labelClass}>Registered address line 2</label>
                <input
                  className={inputClass}
                  value={form.registeredAddress.line2}
                  disabled={saving}
                  onChange={(event) => setAddress("line2", event.target.value)}
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0">
                <label className={labelClass}>City</label>
                <input
                  className={inputClass}
                  value={form.registeredAddress.city}
                  disabled={saving}
                  onChange={(event) => setAddress("city", event.target.value)}
                />
              </div>
              <div className="min-w-0">
                <label className={labelClass}>State</label>
                <input
                  className={inputClass}
                  value={form.registeredAddress.state}
                  disabled={saving}
                  onChange={(event) => setAddress("state", event.target.value)}
                />
              </div>
              <div className="min-w-0">
                <label className={labelClass}>Pincode</label>
                <input
                  className={inputClass}
                  value={form.registeredAddress.pincode}
                  disabled={saving}
                  onChange={(event) => setAddress("pincode", event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="hidden gap-2 md:flex md:justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={load}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e65f00] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save details"}
            </button>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
            <div className="mx-auto flex max-w-6xl gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={load}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-[1.4] rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e65f00] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save details"}
              </button>
            </div>
          </div>
        </form>
      )}
    </VendorLayout>
  );
}
