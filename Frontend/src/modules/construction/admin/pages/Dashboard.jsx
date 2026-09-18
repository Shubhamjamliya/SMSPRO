import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS, CN_ADMIN_SELECT_CLASS } from "../utils/adminTheme";
import { fullMoney, shortDate } from "../../shared/format";

/**
 * BRD A1 — the construction dashboard.
 *
 * "The whole picture at a glance… the screen your operations team will keep open
 * all day."
 *
 * That last phrase is the design brief, and it means this is a WORK QUEUE rather
 * than a report. What needs a person today is at the top, sorted by consequence
 * and rendered as things you can click into. The counts and totals sit below it,
 * because they are context for the queue rather than the reason to open the page.
 *
 * When there is nothing to do, the queue says so plainly instead of showing a
 * grid of zeroes — a dashboard full of noughts trains people to stop reading it.
 */
const SEVERITY = {
  critical: {
    ring: "border-rose-200 bg-rose-50",
    dot: "bg-rose-500",
    count: "text-rose-700",
  },
  high: {
    ring: "border-amber-200 bg-amber-50",
    dot: "bg-amber-500",
    count: "text-amber-700",
  },
  medium: {
    ring: "border-blue-200 bg-blue-50",
    dot: "bg-blue-500",
    count: "text-blue-700",
  },
  low: {
    ring: "border-gray-200 bg-gray-50",
    dot: "bg-gray-400",
    count: "text-gray-700",
  },
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await constructionAdminApi.getDashboard({ days }));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className={CN_ADMIN_PAGE_CLASS}>
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  const attention = data?.attention || [];

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Construction</h1>
          <p className="mt-1 text-sm text-gray-500">
            What needs your team today, and how the module is performing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className={`w-auto ${CN_ADMIN_SELECT_CLASS}`}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {/* ---- the work queue ---- */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Needs attention
        </h2>

        {attention.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
            <p className="text-sm font-semibold text-emerald-900">Nothing waiting</p>
            <p className="mt-1 text-xs text-emerald-800">
              No stalled approvals, no open disputes, no unverified contractors.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((item) => {
              const tone = SEVERITY[item.severity] || SEVERITY.low;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => navigate(item.link)}
                    className={`group flex w-full items-start gap-3 rounded-xl border p-4 text-left transition hover:shadow-sm ${tone.ring}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-xl font-bold ${tone.count}`}>{item.count}</span>
                        <span className="truncate text-sm font-medium text-gray-900">
                          {item.label}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-gray-600">
                        {item.detail}
                      </span>
                      {item.amount > 0 && (
                        <span className="mt-1 block text-xs font-semibold text-rose-700">
                          {fullMoney(item.amount)}
                        </span>
                      )}
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-gray-500" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- money ---- */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Money</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Held right now"
            value={fullMoney(data?.money?.currentlyHeld)}
            tone="text-blue-700"
            note="Customer funds in escrow"
          />
          <Stat
            label="Released to date"
            value={fullMoney(data?.money?.totalReleased)}
            tone="text-emerald-700"
          />
          <Stat
            label="Returned to customers"
            value={fullMoney(data?.money?.totalRefunded)}
            tone="text-gray-900"
          />
          <Stat
            label="Contract value"
            value={fullMoney(data?.money?.totalAgreedValue)}
            tone="text-gray-900"
            note="Not platform revenue"
          />
        </div>
      </section>

      {/* ---- pipeline ---- */}
      <section className="mb-8 grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Pipeline</h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Enquiries"
              value={data?.enquiries?.total ?? 0}
              note={`${data?.enquiries?.inPeriod ?? 0} in the last ${data?.periodDays ?? 30} days`}
              tone="text-gray-900"
            />
            <Stat
              label="Conversion"
              value={`${data?.enquiries?.conversionRate ?? 0}%`}
              note="Enquiries that became projects"
              tone="text-gray-900"
            />
            <Stat
              label="Active projects"
              value={data?.projects?.active ?? 0}
              tone="text-blue-700"
            />
            <Stat
              label="Completed"
              value={data?.projects?.completed ?? 0}
              tone="text-emerald-700"
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Contractors</h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Approved" value={data?.contractors?.approved ?? 0} tone="text-emerald-700" />
            <Stat
              label="Awaiting verification"
              value={data?.contractors?.pendingApproval ?? 0}
              tone={data?.contractors?.pendingApproval > 0 ? "text-amber-700" : "text-gray-900"}
            />
            <Stat label="Suspended" value={data?.contractors?.suspended ?? 0} tone="text-rose-700" />
            <Stat label="Rejected" value={data?.contractors?.rejected ?? 0} tone="text-gray-900" />
          </div>
        </div>
      </section>

      {/* ---- stages due ---- */}
      <section className="mb-8 grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Stages due in the next week</h2>
          {(data?.stagesDueSoon || []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
              Nothing falls due this week.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {data.stagesDueSoon.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => s.projectId && navigate(`/admin/construction/projects/${s.projectId}`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {s.name}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {s.projectNumber} · due {shortDate(s.targetDate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-gray-700">
                      {fullMoney(s.amount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Top contractors by value</h2>
          {(data?.topContractors || []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
              No completed projects yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {data.topContractors.map((c) => (
                <li key={c.contractorId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/construction/contractors/${c.contractorId}`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {c.businessName}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {c.projects} completed
                        {c.rating > 0 ? ` · ${c.rating.toFixed(1)}★` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-gray-700">
                      {fullMoney(c.value)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="text-xs text-gray-400">
        {data?.generatedAt
          ? `Figures as at ${new Date(data.generatedAt).toLocaleString("en-IN")}.`
          : ""}{" "}
        Computed live from the records — there is no cached rollup to go stale.
      </p>
    </div>
  );
}

function Stat({ label, value, tone = "text-gray-900", note }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-tight text-gray-400">{note}</p>}
    </div>
  );
}
