import { useCallback, useEffect, useState } from "react";
import { Lock, Search } from "lucide-react";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS, CN_ADMIN_SELECT_CLASS } from "../utils/adminTheme";
import { dateTime } from "../../shared/format";

/**
 * BRD A10 — the full activity record.
 *
 * "A permanent, unchangeable record of every action taken on every project by
 * anyone, including your own staff. Your protection in any dispute, and a
 * requirement given that you are holding customer money."
 *
 * There is deliberately no edit or delete anywhere on this screen, and no
 * endpoint behind it that could do either — `platform_audit_logs` refuses
 * updates and deletes at the model. A record your own staff can quietly amend is
 * not protection in a dispute, it is the opposite.
 *
 * "Including your own staff" is why the actor column is prominent rather than
 * tucked away: the entries that matter most in an argument are the ones where
 * the platform itself did something.
 */
const ACTION_GROUPS = [
  ["", "Everything"],
  ["project.", "Projects"],
  ["stage.", "Stages and payments"],
  ["construction.dispute", "Disputes"],
  ["construction.document", "Documents"],
  ["contractor.", "Contractors"],
  ["enquiry.", "Enquiries"],
  ["quotation.", "Quotations"],
];

/** Actions that moved money get picked out — they are what a dispute turns on. */
const MONEY_ACTIONS = /release|refund|fund|payment|reassign|resolve/i;

export default function ActivityLog() {
  const [entries, setEntries] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await constructionAdminApi.getActivity({ page, limit: 50 });
      setEntries(result.entries || []);
      setMeta({
        total: result.total || 0,
        page: result.page || 1,
        totalPages: result.totalPages || 1,
      });
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load the activity record");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  // Filtering happens here rather than on the server: the endpoint pages by
  // 50 and these are cheap string checks, so a round trip per keystroke would
  // be slower and no more accurate.
  const visible = entries.filter((e) => {
    if (group && !String(e.action).startsWith(group)) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return String(e.action).toLowerCase().includes(q)
      || String(e.performedBy?.name || "").toLowerCase().includes(q)
      || JSON.stringify(e.metadata || e.meta || {}).toLowerCase().includes(q);
  });

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity record</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every action taken on every project, by anyone — including your own team.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions, people or references"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-gray-500"
          />
        </div>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className={`w-auto ${CN_ADMIN_SELECT_CLASS}`}
        >
          {ACTION_GROUPS.map(([v, l]) => <option key={v || "all"} value={v}>{l}</option>)}
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
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan={4} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                    {entries.length === 0
                      ? "Nothing recorded yet."
                      : "Nothing matches that filter."}
                  </td>
                </tr>
              ) : (
                visible.map((e) => {
                  const isMoney = MONEY_ACTIONS.test(e.action);
                  const details = e.metadata || e.meta || {};
                  return (
                    <tr key={e.id} className={isMoney ? "bg-amber-50/40" : ""}>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                        {dateTime(e.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-medium ${isMoney ? "text-amber-800" : "text-gray-900"}`}
                        >
                          {String(e.action).replace(/^construction\./, "").replace(/[._]/g, " ")}
                        </span>
                        {isMoney && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                            money
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-800">
                          {e.performedBy?.name || e.performedBy?.role || "System"}
                        </p>
                        {e.performedBy?.role && e.performedBy?.name && (
                          <p className="text-xs text-gray-400">{e.performedBy.role}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Details before={e.before} after={e.after} meta={details} />
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
              Page {meta.page} of {meta.totalPages} · {meta.total} entries
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

      <p className="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
        <span>
          This record cannot be edited or deleted — not from this screen, and not
          through any endpoint. The storage layer refuses both. That is what makes
          it worth anything in a dispute.
        </span>
      </p>
    </div>
  );
}

/**
 * Show what actually changed.
 *
 * A before/after pair is far more useful than a metadata blob, so where an entry
 * has one it is rendered as a transition and the blob is dropped.
 */
function Details({ before, after, meta }) {
  const [open, setOpen] = useState(false);

  const changed = before && after
    ? Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    : [];

  if (changed.length > 0) {
    return (
      <div className="space-y-0.5">
        {changed.slice(0, 3).map((k) => (
          <p key={k} className="text-xs text-gray-600">
            <span className="text-gray-400">{k}:</span>{" "}
            <span className="line-through opacity-60">{format(before[k])}</span>{" "}
            → <span className="font-medium text-gray-800">{format(after[k])}</span>
          </p>
        ))}
      </div>
    );
  }

  const keys = Object.keys(meta || {});
  if (keys.length === 0) return <span className="text-xs text-gray-400">—</span>;

  return (
    <div>
      <p className="text-xs text-gray-600">
        {keys.slice(0, 2).map((k) => `${k}: ${format(meta[k])}`).join(" · ")}
      </p>
      {keys.length > 2 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-[11px] font-medium text-blue-600"
        >
          {open ? "Hide" : `+${keys.length - 2} more`}
        </button>
      )}
      {open && (
        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-gray-50 p-2 text-[11px] text-gray-600">
          {JSON.stringify(meta, null, 2)}
        </pre>
      )}
    </div>
  );
}

const format = (v) => {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
};
