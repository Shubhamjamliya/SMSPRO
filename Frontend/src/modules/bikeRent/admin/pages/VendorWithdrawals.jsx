import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-600",
  approved: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-600",
};

export default function VendorWithdrawals() {
  const [records, setRecords] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [transactionId, setTransactionId] = useState("");
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await bikeRentAdminApi.getVendorWithdrawals({ status: statusFilter, limit: 100 });
      setRecords(data?.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load withdrawals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const approve = async () => {
    setProcessing(true);
    try {
      await bikeRentAdminApi.approveVendorWithdrawal(approving.id, { transactionId: transactionId.trim() });
      toast.success("Withdrawal approved");
      setApproving(null);
      setTransactionId("");
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
      await bikeRentAdminApi.rejectVendorWithdrawal(rejecting.id, reason.trim());
      toast.success("Withdrawal rejected");
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
        <h1 className="text-2xl font-black text-gray-900">Vendor withdrawals</h1>
        <p className="mt-1 text-sm text-gray-500">Review and process vendor payout requests.</p>
      </div>

      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
      >
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="all">All</option>
      </select>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No withdrawal requests</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Bank details</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((item) => (
                  <tr key={item.id} className="border-t border-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{item.vendor?.businessName || "—"}</p>
                      <p className="text-xs text-gray-400">{item.vendor?.vendorCode || ""}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800">₹{item.amount}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {item.bankDetails?.accountHolderName || "—"} · {item.bankDetails?.accountNumber || "—"}
                      <br />
                      {item.bankDetails?.ifscCode || ""}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${STATUS_STYLES[item.status] || "bg-gray-100 text-gray-500"}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {item.status === "pending" ? (
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setApproving(item);
                              setTransactionId("");
                            }}
                            className="rounded-lg bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100"
                            title="Approve"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejecting(item);
                              setReason("");
                            }}
                            className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100"
                            title="Reject"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-right text-xs text-gray-400">{item.rejectionReason || item.transactionId || "—"}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approving ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="mb-3 text-lg font-black text-gray-900">Approve ₹{approving.amount} payout</h2>
            <input
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="Bank transaction ID (optional)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApproving(null)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={approve}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                Confirm approve
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejecting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="mb-3 text-lg font-black text-gray-900">Reject ₹{rejecting.amount} payout</h2>
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
