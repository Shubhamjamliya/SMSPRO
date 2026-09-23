import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, HardHat, ShieldCheck, AlertCircle, Building2 } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader, EmptyState } from "../components/ui";
import { fullMoney, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/**
 * BRD C14, C17 — Active Customer Construction Projects Workspace List.
 */
export default function MyProjects() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, pending, quotes] = await Promise.all([
          constructionApi.listProjects({ limit: 50 }),
          constructionApi.listPendingApprovals().catch(() => []),
          // Accepted, but not yet a project — the contractor still has to confirm.
          constructionApi.listQuotations().catch(() => []),
        ]);
        if (cancelled) return;
        setRows(list.rows || []);
        setApprovals(pending || []);
        setPendingConfirmations((quotes || []).filter(
          (q) => q.status === "accepted" && (!q.contractorConfirmation || q.contractorConfirmation.status === "pending"),
        ));
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Could not load your projects"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title="My Projects"
        subtitle={loading ? "Loading…" : `${rows.length} active project workspace${rows.length === 1 ? "" : "s"}`}
        backTo="/construction"
      />

      <div className="space-y-6 px-4 py-6">
        {error && (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</p>
        )}

        {/* Pending Action Hero Alert */}
        {approvals.length > 0 ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 shadow-2xs space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-slate-950 shadow-2xs">
                <AlertCircle className="h-5 w-5 stroke-[2.5]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900">
                  {approvals.length === 1
                    ? "1 Stage Approval Requested"
                    : `${approvals.length} Stage Approvals Requested`}
                </p>
                <p className="text-[11px] font-medium text-slate-600">
                  Contractor has submitted milestone verification for your physical approval & payment release.
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {approvals.map((stage) => (
                <li key={stage._id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/construction/projects/${stage.projectId?._id || stage.projectId}?stage=${stage._id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg bg-white p-3 text-left border border-amber-200 shadow-2xs hover:border-amber-400 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-slate-900">{stage.name}</p>
                      <p className="truncate text-[11px] font-medium text-slate-500">
                        {stage.projectId?.title || stage.projectId?.projectNumber || "Project"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-black tabular-nums text-emerald-700">{fullMoney(stage.amount)}</p>
                      <span className="text-[10px] font-bold text-amber-700">Approve →</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Accepted, waiting on the contractor to confirm before it becomes a project */}
        {pendingConfirmations.length > 0 ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-2xs space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white shadow-2xs">
                <HardHat className="h-5 w-5 stroke-[2.5]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900">
                  {pendingConfirmations.length === 1
                    ? "Waiting for the contractor to confirm"
                    : `${pendingConfirmations.length} quotations waiting for the contractor to confirm`}
                </p>
                <p className="text-[11px] font-medium text-slate-600">
                  You accepted the price — the project opens here as soon as they do.
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {pendingConfirmations.map((q) => (
                <li key={q._id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/construction/quotations/${q._id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg bg-white p-3 text-left border border-blue-200 shadow-2xs hover:border-blue-400 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-slate-900">
                        {q.enquiryId?.serviceId?.name || q.title || "Quotation"}
                      </p>
                      <p className="truncate text-[11px] font-medium text-slate-500">{q.contractorId?.businessName}</p>
                    </div>
                    <p className="shrink-0 text-xs font-black tabular-nums text-blue-700">{fullMoney(q.total)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-200/80" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No Active Projects Yet"
            detail="Your active construction projects appear here once a contractor confirms a quotation you've accepted."
            action={
              <button
                type="button"
                onClick={() => navigate("/construction/enquiries")}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800 transition-colors"
              >
                View My Enquiries
              </button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((p) => {
              const pendingApprovalStage = (p.stages || []).find(
                (s) => s.status === "completed_pending_approval"
              );
              const progressPct = Math.round(Number(p.progressPercentage) || 0);

              return (
                <li key={p._id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/construction/projects/${p._id}`)}
                    className="group flex w-full flex-col gap-3.5 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-amber-400/80 transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-slate-900 group-hover:text-amber-700 transition-colors">
                          {p.title || p.serviceId?.name || "Construction Work"}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-400">
                          {p.projectNumber} · {p.contractorId?.businessName}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ring-1 ring-inset ${PROJECT_STATUS_TONE[p.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                        {PROJECT_STATUS_LABEL[p.status] || p.status}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span>Project Progress</span>
                        <span className="tabular-nums text-amber-700 font-extrabold">{progressPct}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Financial Summary Row */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3.5 text-xs font-semibold text-slate-600">
                      <div>
                        <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Agreed Value</span>
                        <span className="font-extrabold text-slate-900">{fullMoney(p.agreedTotal)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Released</span>
                        <span className="font-extrabold text-emerald-600">{fullMoney(p.financials?.totalReleased)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">In Escrow</span>
                        <span className="font-extrabold text-amber-700">{fullMoney(p.financials?.totalHeld)}</span>
                      </div>
                    </div>

                    {/* Pending Action Banner */}
                    {pendingApprovalStage ? (
                      <div className="flex items-center justify-between rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
                        <span>Stage Approval Needed: {pendingApprovalStage.name}</span>
                        <span className="flex items-center gap-1 text-amber-700 font-extrabold">
                          Inspect & Approve <ChevronRight className="h-4 w-4 stroke-[2.5]" />
                        </span>
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ConstructionPageShell>
  );
}
