import { useEffect, useState } from "react";
import { Check, Loader2, Tag, X } from "lucide-react";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";

export default function CategoryApprovals() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await bikeRentAdminApi.getPendingCategories({ limit: 100 });
      setRecords(data?.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load pending categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (category) => {
    setProcessing(true);
    try {
      await bikeRentAdminApi.approveCategory(category.id);
      toast.success("Category approved");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Approve failed");
    } finally {
      setProcessing(false);
    }
  };

  const reject = async () => {
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setProcessing(true);
    try {
      await bikeRentAdminApi.rejectCategory(rejecting.id, reason.trim());
      toast.success("Category rejected");
      setRejecting(null);
      setReason("");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Reject failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Category approvals</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vendor-proposed categories need approval before they become usable and visible to customers.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No pending categories</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((item) => (
                  <tr key={item.id} className="border-t border-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-[#FF6A00]" />
                        <span className="font-bold text-gray-900">{item.name}</span>
                        {item.approvalHistory?.some((h) => h.status === "resubmitted") && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">
                            Resubmitted
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.vendor?.businessName || "—"}
                      <p className="text-xs text-gray-400">{item.vendor?.vendorCode || ""}</p>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-gray-500">{item.description || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => approve(item)}
                          className="rounded-lg bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                          title="Approve"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => {
                            setRejecting(item);
                            setReason("");
                          }}
                          className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:opacity-60"
                          title="Reject"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejecting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="mb-3 text-lg font-black text-gray-900">Reject &quot;{rejecting.name}&quot;</h2>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Rejection reason (required)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={reject}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
