import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ShieldAlert } from "lucide-react";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS } from "../utils/adminTheme";
import { fullMoney, shortDate, dateTime } from "../../shared/format";

/**
 * BRD A7 — payment control.
 *
 * "Oversight of all held money and all releases, with the power to block or
 * approve a release. A necessary safeguard whenever the platform is holding
 * customers' money."
 *
 * The power to BLOCK already exists in two forms, and this screen links to both
 * rather than inventing a third: putting a project on hold stops every release
 * on it, and a dispute freezes one stage. Adding a separate "block payment"
 * switch would mean three ways to stop money with three different sets of rules
 * — which is how a release gets let through because someone used the wrong one.
 *
 * So this is the oversight half, done properly: every rupee held, every stage
 * waiting on a decision, everything already paid out, and everything frozen.
 */
export default function PaymentControl() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [cashRequests, setCashRequests] = useState([]);
  const [tab, setTab] = useState("held");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pcRes, cashRes] = await Promise.all([
        constructionAdminApi.getPaymentControl({ limit: 100 }),
        constructionAdminApi.listCashPayments().catch(() => []),
      ]);
      setData(pcRes);
      setCashRequests(cashRes || []);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load payment control");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  const TABS = [
    ["held", "Held", data?.held?.length],
    ["awaiting", "Awaiting approval", data?.awaitingApproval?.length],
    ["cash", "Cash Payments & Commissions", cashRequests.length],
    ["frozen", "Frozen by disputes", data?.frozen?.length],
    ["released", "Recent releases", data?.recentReleases?.length],
  ];

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payment control</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every rupee the platform is holding, and where it is going.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {s && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Held in escrow"
            value={fullMoney(s.totalHeld)}
            note={`Across ${s.projectsHoldingMoney} project${s.projectsHoldingMoney === 1 ? "" : "s"}`}
            tone="text-blue-700"
          />
          <Stat
            label="Awaiting approval"
            value={fullMoney(s.valueAwaitingApproval)}
            note={`${s.stagesAwaitingApproval} stage${s.stagesAwaitingApproval === 1 ? "" : "s"} claimed`}
            tone={s.stagesAwaitingApproval > 0 ? "text-amber-700" : "text-gray-900"}
          />
          <Stat
            label="Frozen by disputes"
            value={fullMoney(s.valueFrozen)}
            note={`${s.disputesFreezing} live dispute${s.disputesFreezing === 1 ? "" : "s"}`}
            tone={s.valueFrozen > 0 ? "text-rose-700" : "text-gray-900"}
          />
          <Stat
            label="Free to release"
            value={fullMoney(Math.max(0, (s.totalHeld || 0) - (s.valueFrozen || 0)))}
            note="Held, and not under dispute"
            tone="text-gray-900"
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`relative px-4 py-2.5 text-sm font-medium transition ${
              tab === value ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {count > 0 && (
              <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 text-[11px] text-gray-600">
                {count}
              </span>
            )}
            {tab === value && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gray-900" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            {tab === "held" && (
              <Table
                head={["Project", "Contractor", "Contract", "Held", "Released", "Status"]}
                rows={(data?.held || []).map((p) => ({
                  key: p._id,
                  onClick: () => navigate(`/admin/construction/projects/${p._id}`),
                  cells: [
                    <Two key="p" top={p.projectNumber} bottom={p.title || p.customerId?.name} />,
                    p.contractorId?.businessName || "—",
                    <Right key="c">{fullMoney(p.agreedValue)}</Right>,
                    <Right key="h" tone="font-semibold text-blue-700">{fullMoney(p.heldAmount)}</Right>,
                    <Right key="r" tone="text-emerald-700">{fullMoney(p.releasedAmount)}</Right>,
                    <span key="s" className="text-xs text-gray-600">
                      {String(p.status).replace(/_/g, " ")}
                    </span>,
                  ],
                }))}
                empty="No project is holding money."
              />
            )}

            {tab === "awaiting" && (
              <Table
                head={["Stage", "Project", "Amount", "Claimed", ""]}
                rows={(data?.awaitingApproval || []).map((st) => ({
                  key: st._id,
                  onClick: () => st.projectId?._id
                    && navigate(`/admin/construction/projects/${st.projectId._id}`),
                  cells: [
                    <Two key="s" top={st.name} bottom={`Stage ${st.sequence}`} />,
                    st.projectId?.projectNumber || "—",
                    <Right key="a" tone="font-semibold">{fullMoney(st.amount)}</Right>,
                    <span key="d" className="text-xs text-gray-500">{dateTime(st.submittedAt)}</span>,
                    <span key="x" className="text-xs font-medium text-amber-700">
                      Waiting on the customer
                    </span>,
                  ],
                }))}
                empty="No stage is waiting for a decision."
              />
            )}

            {tab === "cash" && (
              <Table
                head={["Project", "Customer", "Contractor", "Cash Amount", "Wallet Commission", "Status", "Date"]}
                rows={(cashRequests || []).map((c) => ({
                  key: c._id,
                  onClick: () => c.projectId?._id && navigate(`/admin/construction/projects/${c.projectId._id}`),
                  cells: [
                    <Two key="p" top={c.projectId?.projectNumber || "Project"} bottom={c.projectId?.title || "Construction"} />,
                    <Two key="c" top={c.customerId?.name || "Customer"} bottom={c.customerId?.phone || ""} />,
                    c.contractorId?.businessName || c.contractorId?.name || "—",
                    <Right key="a" tone="font-bold text-gray-900">{fullMoney(c.amount)}</Right>,
                    <Right key="cm" tone="font-bold text-emerald-700">₹{c.commissionAmount} ({c.commissionPercent}%)</Right>,
                    <span key="st" className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      c.status === "approved"
                        ? "bg-emerald-100 text-emerald-800"
                        : c.status === "pending_contractor_approval"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                    }`}>
                      {String(c.status).replace(/_/g, " ")}
                    </span>,
                    <span key="dt" className="text-xs text-gray-500">{dateTime(c.createdAt)}</span>,
                  ],
                }))}
                empty="No cash payment requests logged."
              />
            )}

            {tab === "frozen" && (
              <Table
                head={["Dispute", "Project", "Frozen", "Status", "Raised"]}
                rows={(data?.frozen || []).map((d) => ({
                  key: d._id,
                  onClick: () => navigate(`/admin/construction/disputes/${d._id}`),
                  cells: [
                    <span key="n" className="inline-flex items-center gap-1.5 font-medium text-gray-900">
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                      {d.disputeNumber}
                    </span>,
                    d.projectId?.projectNumber || "—",
                    <Right key="f" tone="font-semibold text-rose-700">{fullMoney(d.frozenAmount)}</Right>,
                    <span key="s" className="text-xs text-gray-600">
                      {String(d.status).replace(/_/g, " ")}
                    </span>,
                    <span key="c" className="text-xs text-gray-500">{shortDate(d.createdAt)}</span>,
                  ],
                }))}
                empty="Nothing is frozen. Good."
              />
            )}

            {tab === "released" && (
              <Table
                head={["Stage", "Project", "Contractor", "Released", "Retention", "When"]}
                rows={(data?.recentReleases || []).map((r) => ({
                  key: r._id,
                  onClick: () => r.projectId?._id
                    && navigate(`/admin/construction/projects/${r.projectId._id}`),
                  cells: [
                    <Two key="s" top={r.name} bottom={r.approvedVia ? `via ${r.approvedVia}` : ""} />,
                    r.projectId?.projectNumber || "—",
                    r.contractorId?.businessName || "—",
                    <Right key="a" tone="font-semibold text-emerald-700">
                      {fullMoney(r.releasedAmount)}
                    </Right>,
                    <Right key="t" tone="text-gray-500">
                      {Number(r.retainedAmount) > 0 ? fullMoney(r.retainedAmount) : "—"}
                    </Right>,
                    <span key="w" className="text-xs text-gray-500">{shortDate(r.releasedAt)}</span>,
                  ],
                }))}
                empty="No payments have been released yet."
              />
            )}
          </div>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
        <span>
          To stop a payment, put the project on hold from its own screen, or resolve
          the dispute that is freezing it. Those are the only two ways money is
          blocked, deliberately — a third switch here would be a third set of rules
          to get wrong.
        </span>
      </p>
    </div>
  );
}

function Table({ head, rows, empty }) {
  return (
    <table className="w-full min-w-[52rem] text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
        <tr>
          {head.map((h, i) => (
            <th key={h || i} className={`px-4 py-3 font-medium ${i >= 2 ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className="px-4 py-12 text-center text-gray-500">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr
              key={r.key}
              onClick={r.onClick}
              className="cursor-pointer transition hover:bg-gray-50"
            >
              {r.cells.map((c, i) => (
                <td key={i} className="px-4 py-3">{c}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function Two({ top, bottom }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-gray-900">{top}</p>
      {bottom && <p className="truncate text-xs text-gray-500">{bottom}</p>}
    </div>
  );
}

function Right({ children, tone = "text-gray-900" }) {
  return <div className={`text-right ${tone}`}>{children}</div>;
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
