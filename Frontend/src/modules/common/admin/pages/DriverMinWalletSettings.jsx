import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@/services/api";

export default function DriverMinWalletSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [minWalletToReceiveOrders, setMinWalletToReceiveOrders] = useState("0");

  const fetchValue = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getBusinessSettings();
      const settings = response?.data?.data || response?.data || {};
      const value = settings.minWalletToReceiveOrders;
      setMinWalletToReceiveOrders(
        value !== undefined && value !== null ? String(value) : "0",
      );
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load minimum wallet amount");
      setMinWalletToReceiveOrders("0");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValue();
  }, []);

  const handleSave = async () => {
    const value = Number(minWalletToReceiveOrders);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Minimum wallet balance must be a number (>= 0)");
      return;
    }

    try {
      setSaving(true);
      const response = await adminAPI.updateBusinessSettings({
        minWalletToReceiveOrders: value,
      });
      const saved =
        response?.data?.data?.minWalletToReceiveOrders ??
        response?.data?.minWalletToReceiveOrders ??
        value;
      setMinWalletToReceiveOrders(String(saved));
      toast.success("Minimum wallet amount saved");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save minimum wallet amount");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-10 font-sans">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-[15px] font-black text-gray-800 uppercase tracking-widest">
          Driver Min Wallet
        </h1>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
          <span>Global Settings</span>
          <ChevronRight size={12} strokeWidth={3} />
          <span className="text-gray-600">Driver Min Wallet</span>
        </div>
      </div>

      <div className="max-w-3xl">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50/30 px-8 py-4">
            <h3 className="text-[13px] font-bold uppercase tracking-tight text-gray-700">
              Minimum wallet balance to receive orders
            </h3>
          </div>
          <div className="p-8">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <Wallet className="h-5 w-5" />
              </div>
              <p className="text-sm leading-relaxed text-gray-600">
                Every delivery partner must keep this amount in their pocket wallet.
                If the balance is lower, they will not receive food, taxi, or porter jobs.
                Set <strong>0</strong> to turn this off. New drivers can deposit this amount to start taking orders.
              </p>
            </div>

            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Amount (₹)
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="number"
                min="0"
                step="1"
                value={minWalletToReceiveOrders}
                onChange={(e) => setMinWalletToReceiveOrders(e.target.value)}
                placeholder={loading ? "Loading..." : "e.g. 500"}
                disabled={loading || saving}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={loading || saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00BFA5] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00AC95] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
            </div>
            {loading ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading current amount…
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
