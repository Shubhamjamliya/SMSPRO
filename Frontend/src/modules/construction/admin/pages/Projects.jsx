import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS, CN_ADMIN_SELECT_CLASS } from "../utils/adminTheme";
import {
  fullMoney,
  shortDate,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
} from "../../shared/format";

/**
 * BRD A5 — the project register.
 *
 * The operational question this screen has to answer is not "how many projects
 * are there" but "how much customer money are we holding right now, and is any
 * of it stuck". So the header leads with the escrow position, and the table
 * surfaces held money and stalled approvals rather than vanity counts.
 */
export default function AdminProjects() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        constructionAdminApi.getProjects({
          page,
          limit: 20,
          ...(status ? { status } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        }),
        constructionAdminApi.getProjectStats().catch(() => null),
      ]);
      setRows(list.rows);
      setMeta(list.meta);
      setStats(s);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const FILTERS = [
    ["", "All"],
    ["awaiting_funding", "Awaiting funding"],
    ["active", "Active"],
    ["on_hold", "On hold"],
    ["handover_pending", "Handover pending"],
    ["completed", "Completed"],
    ["closed", "Closed"],
    ["cancelled", "Cancelled"],
  ];

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <p className="mt-1 text-sm text-gray-500">
          Live builds and the customer money held against them.
        </p>
      </header>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Held in escrow" value={fullMoney(stats.totalHeld)} tone="text-blue-700" />
          <Stat label="Released to date" value={fullMoney(stats.totalReleased)} tone="text-emerald-700" />
          <Stat label="Active projects" value={stats.active ?? 0} tone="text-gray-900" />
          <Stat
            label="Awaiting approval"
            value={stats.stagesAwaitingApproval ?? 0}
            tone={stats.stagesAwaitingApproval > 0 ? "text-amber-700" : "text-gray-900"}
            note="Stages a customer has not acted on"
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Project number, customer or contractor"
          className="min-w-[16rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className={`w-auto ${CN_ADMIN_SELECT_CLASS}`}
        >
          {FILTERS.map(([v, l]) => (
            <option key={v || "all"} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Contractor</th>
                <th className="px-4 py-3 text-right font-medium">Contract</th>
                <th className="px-4 py-3 text-right font-medium">Held</th>
                <th className="px-4 py-3 text-right font-medium">Released</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No projects match this filter.
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const held = Math.max(
                    0,
                    (Number(p.fundedAmount) || 0)
                      - (Number(p.releasedAmount) || 0)
                      - (Number(p.refundedAmount) || 0),
                  );
                  return (
                    <tr
                      key={p._id}
                      onClick={() => navigate(`/admin/construction/projects/${p._id}`)}
                      className="cursor-pointer transition hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.projectNumber}</p>
                        <p className="truncate text-xs text-gray-500">
                          {p.title || p.customerId?.name || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {p.contractorId?.businessName || "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {fullMoney(p.agreedValue)}
                      </td>
                      <td className={`px-4 py-3 text-right ${held > 0.005 ? "font-medium text-blue-700" : "text-gray-400"}`}>
                        {fullMoney(held)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-700">
                        {fullMoney(p.releasedAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
                            PROJECT_STATUS_TONE[p.status] || "bg-gray-100 text-gray-600 ring-gray-200"
                          }`}
                        >
                          {PROJECT_STATUS_LABEL[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {shortDate(p.lastActivityAt || p.updatedAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
            <span className="text-gray-500">
              Page {meta.page} of {meta.totalPages} · {meta.total} projects
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
