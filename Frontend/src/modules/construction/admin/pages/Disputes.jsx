import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS, CN_ADMIN_SELECT_CLASS } from "../utils/adminTheme";
import { fullMoney, dateTime } from "../../shared/format";
import {
  DISPUTE_STATUS_LABEL, DISPUTE_STATUS_TONE, DISPUTE_OUTCOME_LABEL,
} from "../../shared/DisputePanel";

/**
 * BRD Q15 — the support queue.
 *
 * The number that leads is MONEY FROZEN, not dispute count. Ten trivial
 * disagreements matter less than one that has ₹4L of a customer's money stuck
 * while nobody looks at it, and the queue is ordered oldest-untouched-first for
 * the same reason: a dispute nobody has picked up is the one about to become a
 * phone call.
 */
export default function AdminDisputes() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        constructionAdminApi.getDisputes({ page, limit: 20, ...(status ? { status } : {}) }),
        constructionAdminApi.getDisputeStats().catch(() => null),
      ]);
      setRows(list.rows);
      setMeta(list.meta);
      setStats(s);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load disputes");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const FILTERS = [
    ["", "All"],
    ["open", "Open"],
    ["under_review", "Under review"],
    ["resolved", "Resolved"],
    ["withdrawn", "Withdrawn"],
  ];

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Disputes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Disagreements waiting on a decision from your team.
        </p>
      </header>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Money frozen"
            value={fullMoney(stats.moneyFrozen)}
            tone={stats.moneyFrozen > 0 ? "text-rose-700" : "text-gray-900"}
            note="Held by live disputes"
          />
          <Stat
            label="Waiting for you"
            value={stats.open}
            tone={stats.open > 0 ? "text-amber-700" : "text-gray-900"}
            note="Nobody has picked these up"
          />
          <Stat label="Under review" value={stats.underReview} tone="text-blue-700" />
          <Stat label="Resolved" value={stats.resolved} tone="text-emerald-700" />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className={`w-auto ${CN_ADMIN_SELECT_CLASS}`}
        >
          {FILTERS.map(([v, l]) => <option key={v || "all"} value={v}>{l}</option>)}
        </select>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Dispute</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Raised by</th>
                <th className="px-4 py-3 text-right font-medium">Frozen</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Raised</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    Nothing here. Quiet is good.
                  </td>
                </tr>
              ) : (
                rows.map((d) => (
                  <tr
                    key={d._id}
                    onClick={() => navigate(`/admin/construction/disputes/${d._id}`)}
                    className="cursor-pointer transition hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{d.disputeNumber}</p>
                      <p className="truncate text-xs text-gray-500">
                        {String(d.reason || "").replace(/_/g, " ")}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{d.projectId?.projectNumber || "—"}</p>
                      <p className="truncate text-xs text-gray-500">
                        {d.contractorId?.businessName || ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {d.raisedByType === "CUSTOMER"
                        ? d.customerId?.name || "Customer"
                        : d.contractorId?.businessName || "Contractor"}
                      <span className="ml-1 text-xs text-gray-400">
                        ({d.raisedByType.toLowerCase()})
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right ${
                      Number(d.frozenAmount) > 0 && ["open", "under_review"].includes(d.status)
                        ? "font-semibold text-rose-700"
                        : "text-gray-400"
                    }`}>
                      {fullMoney(d.frozenAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
                        DISPUTE_STATUS_TONE[d.status] || "bg-gray-100 text-gray-600 ring-gray-200"
                      }`}>
                        {DISPUTE_STATUS_LABEL[d.status] || d.status}
                      </span>
                      {d.status === "resolved" && d.outcome && (
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {DISPUTE_OUTCOME_LABEL[d.outcome]}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{dateTime(d.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
            <span className="text-gray-500">
              Page {meta.page} of {meta.totalPages} · {meta.total} disputes
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, note }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-tight text-gray-400">{note}</p>}
    </div>
  );
}
