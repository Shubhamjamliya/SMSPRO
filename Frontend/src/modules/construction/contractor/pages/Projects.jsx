import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import contractorApi from "../services/contractorApi";
import ContractorShell from "../components/ContractorShell";
import {
  fullMoney,
  shortDate,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
} from "../../shared/format";

/**
 * BRD W14 — the contractor's live projects.
 *
 * The number a contractor actually cares about is not the contract value, it is
 * "how much of my money is sitting there waiting for me to finish something", so
 * that is what each row leads with.
 */
export default function ContractorProjects() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [cashRequests, setCashRequests] = useState([]);
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [projRes, cashRes, quoteRes] = await Promise.all([
        contractorApi.listProjects({ limit: 50, ...(status ? { status } : {}) }).catch((err) => {
          console.error("Failed to load contractor projects:", err);
          return { rows: [] };
        }),
        contractorApi.listContractorCashRequests().catch((err) => {
          console.error("Failed to load contractor cash requests:", err);
          return [];
        }),
        // A customer accepted, waiting on us to confirm before it becomes a project.
        contractorApi.listQuotations().catch(() => []),
      ]);
      const rowsList = projRes?.rows || (Array.isArray(projRes) ? projRes : (projRes?.data || []));
      setRows(rowsList);
      setCashRequests(Array.isArray(cashRes) ? cashRes : (cashRes?.requests || []));
      setPendingConfirmations((quoteRes || []).filter(
        (q) => q.status === "accepted" && (!q.contractorConfirmation || q.contractorConfirmation.status === "pending"),
      ));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load your projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [status]);

  const handleApproveCash = async (requestId) => {
    setProcessingId(requestId);
    try {
      await contractorApi.approveCashPayment(requestId);
      loadData();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not approve cash payment");
    } finally {
      setProcessingId("");
    }
  };

  const FILTERS = [
    ["", "All"],
    ["awaiting_funding", "Awaiting payment"],
    ["active", "In progress"],
    ["handover_pending", "Ready for handover"],
    ["completed", "Completed"],
  ];

  return (
    <ContractorShell
      title="Projects"
      subtitle={rows.length ? `${rows.length} total` : "Work you have won"}
      action={
        <button
          type="button"
          onClick={() => navigate("/contractor/earnings")}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-orange-600"
        >
          Earnings
        </button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setStatus(value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              status === value
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {/* Customers who accepted a quotation — these become projects only once we confirm. */}
      {pendingConfirmations.length > 0 && (
        <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 space-y-3 shadow-xs">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-950">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Waiting on your confirmation ({pendingConfirmations.length})
          </h3>
          <div className="space-y-2">
            {pendingConfirmations.map((q) => (
              <button
                key={q._id}
                type="button"
                onClick={() => navigate(`/contractor/quotations/${q._id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white p-3.5 text-left shadow-2xs hover:border-emerald-300"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {q.enquiryId?.serviceId?.name || q.title || "Quotation"}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-gray-400">{q.quotationNumber}</p>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">{fullMoney(q.total)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Pending Cash Payment Requests from Customers */}
      {cashRequests.filter(c => c.status === "pending_contractor_approval").length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Pending Cash Receipt Confirmations ({cashRequests.filter(c => c.status === "pending_contractor_approval").length})
            </h3>
          </div>
          <div className="space-y-2">
            {cashRequests.filter(c => c.status === "pending_contractor_approval").map((req) => (
              <div key={req._id} className="rounded-xl border border-amber-200 bg-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900">
                      {fullMoney(req.amount)}
                    </span>
                    <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                      Commission Paid: ₹{req.commissionAmount}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium">
                    Customer: <strong className="text-slate-900 font-bold">{req.customerId?.name || "Customer"}</strong> ({req.customerId?.phone || ""})
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Project: {req.projectId?.title || req.projectId?.projectNumber || "Construction"}
                    {req.stageId?.name ? ` · Stage: ${req.stageId.name}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={processingId === req._id}
                  onClick={() => handleApproveCash(req._id)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all shadow-2xs active:scale-95 disabled:opacity-50 shrink-0"
                >
                  {processingId === req._id ? "Confirming…" : "Confirm Cash Received"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No projects here yet. When a customer accepts your quotation, confirm it to turn it into a project.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => {
            const held = Math.max(
              0,
              (Number(p.fundedAmount) || 0) - (Number(p.releasedAmount) || 0) - (Number(p.refundedAmount) || 0),
            );
            return (
              <li key={p._id}>
                <button
                  type="button"
                  onClick={() => navigate(`/contractor/projects/${p._id}`)}
                  className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">
                        {p.title || p.projectNumber}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {p.projectNumber}
                        {p.customerId?.name ? ` · ${p.customerId.name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
                        PROJECT_STATUS_TONE[p.status] || "bg-gray-100 text-gray-600 ring-gray-200"
                      }`}
                    >
                      {PROJECT_STATUS_LABEL[p.status] || p.status}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-3">
                    <div>
                      <dt className="text-[11px] text-gray-500">Contract</dt>
                      <dd className="text-sm font-semibold text-gray-900">
                        {fullMoney(p.agreedValue)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Paid to you</dt>
                      <dd className="text-sm font-semibold text-emerald-700">
                        {fullMoney(p.releasedAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-gray-500">Held for you</dt>
                      <dd className="text-sm font-semibold text-blue-700">{fullMoney(held)}</dd>
                    </div>
                  </dl>

                  {p.status === "awaiting_funding" && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                      Do not start work yet — the customer has not paid the money in.
                    </p>
                  )}
                  {p.targetCompletionDate && p.status === "active" && (
                    <p className="mt-2.5 text-xs text-gray-500">
                      Target completion {shortDate(p.targetCompletionDate)}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ContractorShell>
  );
}
