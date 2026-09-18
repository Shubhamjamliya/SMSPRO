import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, ShieldCheck, AlertCircle, HardHat, Camera, Star, ChevronRight, X, Clock,
} from "lucide-react";
import constructionApi from "../services/api";
import MoneyBar from "../../shared/MoneyBar";
import StageTimeline from "../../shared/StageTimeline";
import DocumentVault from "../../shared/DocumentVault";
import MessageThread from "../../shared/MessageThread";
import DisputePanel from "../../shared/DisputePanel";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";
import {
  fullMoney, dateTime, shortDate, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE,
} from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/**
 * BRD C15–C17, C21–C23 — Customer Construction Project Workspace.
 */
export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [cashRequests, setCashRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState("");
  const [activeStageId, setActiveStageId] = useState(params.get("stage") || null);
  // Phase 6 tabs. The URL carries the tab so a notification can deep-link
  // straight to the conversation or the document that prompted it.
  const [tab, setTab] = useState(params.get("tab") || "overview");
  const [unread, setUnread] = useState(0);
  const [dialog, setDialog] = useState(null); // { kind: 'approve' | 'reject', stage }

  const load = useCallback(async () => {
    try {
      const [result, cashRes] = await Promise.all([
        constructionApi.getProject(id),
        constructionApi.listCustomerCashRequests().catch(() => []),
      ]);
      setData(result);
      setCashRequests(
        (cashRes || []).filter(
          (c) => String(c.projectId?._id || c.projectId) === String(id),
        ),
      );
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Could not load this project"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // The message badge is the only thing on this screen that changes without
  // the customer doing anything, so it is fetched on its own and never blocks
  // the project from rendering.
  useEffect(() => {
    constructionApi.unreadMessages(id).then(setUnread).catch(() => {});
  }, [id, tab]);

  const selectTab = (next) => {
    setTab(next);
    const p = new URLSearchParams(params);
    if (next === "overview") p.delete("tab"); else p.set("tab", next);
    setParams(p, { replace: true });
  };

  const project = data?.project;
  const stages = useMemo(() => data?.stages || [], [data]);
  const activeStage = useMemo(
    () => stages.find((s) => String(s._id) === String(activeStageId)) || null,
    [stages, activeStageId],
  );

  const selectStage = (stage) => {
    const next = String(stage._id) === String(activeStageId) ? null : String(stage._id);
    setActiveStageId(next);
    const p = new URLSearchParams(params);
    if (next) p.set("stage", next); else p.delete("stage");
    setParams(p, { replace: true });
  };

  const act = async (label, fn) => {
    setBusy(label);
    setError("");
    try {
      const message = await fn();
      setFlash(message || "Done");
      setDialog(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Action could not be completed"));
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <div className="space-y-4 px-4 py-6">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-44 animate-pulse rounded-xl bg-slate-200/80" />
          <div className="h-64 animate-pulse rounded-xl bg-slate-200/80" />
        </div>
      </ConstructionPageShell>
    );
  }

  if (!project) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Project Workspace" backTo="/construction/projects" />
        <div className="px-4 py-8">
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error || "Project not found"}
          </p>
        </div>
      </ConstructionPageShell>
    );
  }

  const outstanding = Number(project.outstandingToFund) || 0;

  return (
    <ConstructionPageShell showBottomNav={false}>
      <ConstructionPageHeader
        title={project.title || project.serviceId?.name || "Construction Project"}
        subtitle={`Ref: ${project.projectNumber || ""} · ${project.contractorId?.businessName || ""}`}
        backTo="/construction/projects"
      />

      <ProjectTabs active={tab} unread={unread} onChange={selectTab} />

      <div className="space-y-6 px-4 py-6 pb-28">
        {tab === "documents" && (
          <DocumentVault projectId={id} api={constructionApi} side="customer" />
        )}

        {tab === "messages" && (
          <MessageThread
            projectId={id}
            api={constructionApi}
            side="customer"
            peerName={project.contractorId?.businessName || "your contractor"}
          />
        )}

        {tab === "disputes" && (
          <DisputePanel
            projectId={id}
            api={constructionApi}
            stages={stages}
            side="customer"
          />
        )}

        {tab === "overview" && (
        <>
        {/* Status Header Bar */}
        <div className="flex items-center justify-between gap-3">
          <span className={`rounded-full px-3.5 py-1 text-xs font-extrabold ring-1 ring-inset ${PROJECT_STATUS_TONE[project.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
            {PROJECT_STATUS_LABEL[project.status] || project.status}
          </span>
          {project.targetCompletionDate && (
            <span className="text-xs font-bold text-slate-500">
              Target Completion: {shortDate(project.targetCompletionDate)}
            </span>
          )}
        </div>

        {flash && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 shadow-2xs">
            {flash}
          </p>
        )}
        {error && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 shadow-2xs">
            {error}
          </p>
        )}

        {project.status === "on_hold" && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs font-medium text-amber-900 shadow-2xs">
            <strong className="font-extrabold text-amber-950">Project On Hold:</strong>{" "}
            {project.holdReason || "This project is currently paused. Milestone releases are on hold."}
          </div>
        )}

        {/* Financial Escrow Bar Component */}
        <MoneyBar
          money={{
            agreedValue: project.agreedValue,
            fundedAmount: project.fundedAmount,
            releasedAmount: project.releasedAmount,
            refundedAmount: project.refundedAmount,
            retentionHeld: project.retentionHeld,
            retentionDueAt: project.retentionDueAt,
          }}
          side="customer"
        />

        {/* Cash Request Status Banner */}
        <CashRequestStatusCard
          requests={cashRequests}
          contractorName={project.contractorId?.businessName || "Contractor"}
        />

        {/* Escrow Funding Form Card */}
        {outstanding > 0.005 && project.status !== "cancelled" && (
          <FundCard
            project={project}
            activeStageId={activeStageId}
            outstanding={outstanding}
            busy={busy === "fund"}
            onFund={(amount, mode) =>
              act("fund", async () => {
                if (mode === "cash") {
                  const r = await constructionApi.requestCashPayment(id, { stageId: activeStageId, amount });
                  return r?.message || "Cash payment request raised successfully.";
                }
                const r = await constructionApi.fundProject(id, amount);
                return r?.alreadyProcessed
                  ? "Payment was already recorded."
                  : `${fullMoney(amount)} is now locked in Escrow.`;
              })
            }
          />
        )}

        {/* Stage Timeline Section */}
        <section className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
            Project Milestone Stages
          </h2>
          <StageTimeline
            stages={stages}
            side="customer"
            activeId={activeStageId}
            onSelect={selectStage}
          />
        </section>

        {/* Active Selected Stage Inspector */}
        {activeStage && (
          <StagePanel
            stage={activeStage}
            busy={busy}
            disabled={project.status === "on_hold"}
            retentionPercent={project.retentionPercent}
            onApprove={() => setDialog({ kind: "approve", stage: activeStage })}
            onReject={() => setDialog({ kind: "reject", stage: activeStage })}
          />
        )}

        {/* Handover & Review Section */}
        {project.status === "handover_pending" && (
          <HandoverCard
            project={project}
            busy={busy === "handover"}
            onConfirm={(body) =>
              act("handover", async () => {
                await constructionApi.confirmHandover(id, body);
                return "Handover confirmed! Project completed successfully.";
              })
            }
          />
        )}

        {(project.status === "completed" || project.status === "closed") && (
          <section className="rounded-3xl border border-emerald-300/80 bg-gradient-to-br from-emerald-50 to-emerald-100/40 p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 stroke-[2.5]" />
              Project Completed & Handed Over
            </div>
            <p className="text-xs font-medium leading-relaxed text-emerald-800">
              {project.status === "closed"
                ? "All milestone stages and retention amounts have been fully released."
                : `Handover confirmed. ${
                    Number(project.retentionHeld) > 0.005
                      ? `${fullMoney(project.retentionHeld)} retention will automatically release ${
                          project.retentionDueAt
                            ? `on ${shortDate(project.retentionDueAt)}`
                            : "after defect liability expiry"
                        }.`
                      : ""
                  }`}
            </p>
          </section>
        )}

        {/* Site Progress Photo Gallery */}
        {data?.gallery?.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
              <Camera className="h-4 w-4 stroke-[2]" /> Site Progress Gallery ({data.gallery.length})
            </h2>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {data.gallery.map((photo, i) => (
                <a
                  key={`${photo.url}-${i}`}
                  href={photo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group aspect-square overflow-hidden rounded-2xl bg-slate-100 shadow-2xs ring-1 ring-slate-200"
                >
                  <img
                    src={photo.url}
                    alt={photo.caption || "Site photograph"}
                    loading="lazy"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Modal Dialogs */}
          </>
        )}

      {dialog?.kind === "approve" && (
          <ConfirmDialog
            title="Approve Stage Milestone?"
            tone="emerald"
            confirmLabel={`Approve & Release ${fullMoney(payableOf(dialog.stage, project))}`}
            busy={busy === "approve"}
            onClose={() => setDialog(null)}
            onConfirm={() =>
              act("approve", async () => {
                const r = await constructionApi.approveStage(dialog.stage._id);
                return r?.alreadyReleased
                  ? "This stage was already released."
                  : "Approved! Escrow funds released to contractor.";
              })
            }
          >
            <p className="text-xs font-medium leading-relaxed text-slate-700">
              You are approving <strong className="text-slate-900 font-extrabold">{dialog.stage.name}</strong>.{" "}
              <strong className="text-emerald-700 font-black">{fullMoney(payableOf(dialog.stage, project))}</strong> will be immediately transferred from Escrow to{" "}
              {project.contractorId?.businessName || "the contractor"}.
            </p>
            {Number(project.retentionPercent) > 0 && !dialog.stage.isRetention && (
              <p className="text-[11px] font-semibold text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                {fullMoney(retentionOf(dialog.stage, project))} ({project.retentionPercent}%) is retained in Escrow until defect liability expiry.
              </p>
            )}
          </ConfirmDialog>
        )}

        {dialog?.kind === "reject" && (
          <ReasonDialog
            title="Request Stage Corrections"
            confirmLabel="Send Back to Contractor"
            placeholder="Specify what work remains incomplete or needs rectifying..."
            busy={busy === "reject"}
            onClose={() => setDialog(null)}
            onConfirm={(reason) =>
              act("reject", async () => {
                await constructionApi.rejectStage(dialog.stage._id, reason);
                return "Stage sent back to contractor for corrections.";
              })
            }
          >
            No funds will be released. The contractor will fix the specified work and resubmit.
          </ReasonDialog>
        )}
      </div>
    </ConstructionPageShell>
  );
}

/**
 * Project tabs (BRD C16-C20).
 *
 * Overview is first and default because most visits are "how far along is it".
 * Messages carries an unread badge — it is the only tab whose contents change
 * without the customer having done anything.
 */
function ProjectTabs({ active, unread, onChange }) {
  const TABS = [
    ["overview", "Overview"],
    ["documents", "Documents"],
    ["messages", "Messages"],
    ["disputes", "Disputes"],
  ];

  return (
    <div className="sticky top-[3.25rem] z-30 border-b border-slate-200 bg-white/95 px-2 backdrop-blur">
      <div className="flex gap-0.5 overflow-x-auto">
        {TABS.map(([value, label]) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              aria-current={isActive ? "page" : undefined}
              className={`relative shrink-0 px-3.5 py-2.5 text-xs font-extrabold transition-colors ${
                isActive ? "text-amber-700" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
              {value === "messages" && unread > 0 && (
                <span className="ml-1.5 inline-flex min-w-[1.1rem] justify-center rounded-full bg-amber-500 px-1 text-[10px] leading-[1.1rem] text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
              {isActive && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const retentionOf = (stage, project) => {
  if (stage.isRetention) return 0;
  const pct = Number(project.retentionPercent) || 0;
  return Math.round(((Number(stage.amount) || 0) * pct) / 100 * 100) / 100;
};
const payableOf = (stage, project) =>
  Math.round(((Number(stage.amount) || 0) - retentionOf(stage, project)) * 100) / 100;

function FundCard({ project, activeStageId, outstanding, busy, onFund }) {
  const [amount, setAmount] = useState(String(outstanding));
  const [paymentMode, setPaymentMode] = useState("online");
  const value = Number(amount) || 0;
  const valid = value > 0 && value <= outstanding;

  const agreedValue = Number(project?.agreedValue) || 0;
  const isCashAllowed = agreedValue >= 100000; // Threshold: 1 Lakh (₹1,00,000)
  const commPercent = Number(project?.commission?.value) || 3;
  const requiredCommission = Math.round((value * commPercent) / 100);

  return (
    <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-amber-100/30 p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-600 stroke-[2.2]" />
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">Project Stage Funding</h2>
        </div>
        {!isCashAllowed && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-600 border border-slate-200">
            Online Only (&lt; ₹1,00,000)
          </span>
        )}
      </div>

      <p className="text-xs font-medium leading-relaxed text-slate-700">
        <strong className="font-black text-slate-950">{fullMoney(outstanding)}</strong> remaining to fund into project. Select your preferred payment method.
      </p>

      {/* Payment Method Selector */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setPaymentMode("online")}
          className={`py-2 px-3 rounded-xl border text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            paymentMode === "online"
              ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <span>Online Escrow</span>
        </button>

        <button
          type="button"
          disabled={!isCashAllowed}
          onClick={() => isCashAllowed && setPaymentMode("cash")}
          className={`py-2 px-3 rounded-xl border text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
            !isCashAllowed
              ? "opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200"
              : paymentMode === "cash"
                ? "bg-amber-500 text-slate-950 border-amber-500 shadow-2xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <span>Cash Payment</span>
        </button>
      </div>

      {/* Mode Details Info Box */}
      {paymentMode === "cash" && isCashAllowed ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-1.5 text-xs text-amber-950 font-medium">
          <div className="flex items-center justify-between font-bold">
            <span>Admin Commission Fee ({commPercent}%):</span>
            <span className="font-black text-amber-900">₹{requiredCommission.toLocaleString("en-IN")}</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-tight">
            * Minimum commission fee (₹{requiredCommission.toLocaleString("en-IN")}) will be deducted from your wallet to raise the Cash Payment Request. Contractor will manually confirm cash receipt offline.
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          max={outstanding}
          min={1}
          className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-xs outline-none focus:border-amber-500 font-bold text-slate-900 shadow-2xs"
          placeholder="Amount"
        />
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => onFund(value, paymentMode)}
          className={`rounded-xl px-4 py-2.5 text-xs font-black shadow-2xs transition-all ${
            paymentMode === "cash"
              ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
              : "bg-slate-900 text-white hover:bg-slate-800"
          } disabled:opacity-50`}
        >
          {busy
            ? "Processing…"
            : paymentMode === "cash"
              ? `Raise Cash Request (Pay ₹${requiredCommission} Fee)`
              : "Deposit to Escrow"}
        </button>
      </div>

      {!valid && amount !== "" && (
        <p className="text-[11px] font-bold text-rose-600">
          Enter an amount between ₹1 and {fullMoney(outstanding)}.
        </p>
      )}
    </section>
  );
}

function StagePanel({ stage, busy, disabled, onApprove, onReject }) {
  const submission = stage.submissions?.[0];
  const awaiting = stage.status === "submitted_for_approval";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3.5">
      <div>
        <h2 className="text-sm font-extrabold text-slate-900">{stage.name}</h2>
        {stage.description && (
          <p className="mt-1 text-xs leading-relaxed text-slate-600 font-medium">{stage.description}</p>
        )}
      </div>

      {submission ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-[11px] font-bold text-slate-400">
            Submitted {dateTime(submission.createdAt)}
            {submission.attempt > 1 ? ` · Attempt ${submission.attempt}` : ""}
          </p>
          {submission.notes && (
            <p className="text-xs leading-relaxed font-medium text-slate-700">
              "{submission.notes}"
            </p>
          )}
          {submission.photos?.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {submission.photos.map((p, i) => (
                <a
                  key={`${p.url}-${i}`}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square overflow-hidden rounded-xl bg-white ring-1 ring-slate-200"
                >
                  <img
                    src={p.url}
                    alt={p.caption || `Evidence ${i + 1}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs font-medium text-slate-400 italic">
          No work evidence submitted for this stage yet.
        </p>
      )}

      {awaiting && (
        <div className="space-y-3 pt-2">
          {disabled ? (
            <p className="rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              Project is on hold — approvals are temporarily paused.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={onApprove}
                className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-xs font-extrabold text-white shadow-md shadow-emerald-500/20 hover:brightness-110 disabled:opacity-50 transition-all"
              >
                Approve & Release Payment
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={onReject}
                className="rounded-2xl border border-slate-200 bg-slate-100 py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
              >
                Request Correction
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function HandoverCard({ project, busy, onConfirm }) {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");

  return (
    <section className="rounded-3xl border border-amber-300/80 bg-gradient-to-br from-amber-50 to-amber-100/40 p-5 shadow-xs space-y-4">
      <div>
        <h2 className="text-sm font-extrabold text-slate-900">Confirm Work Handover & Rating</h2>
        <p className="mt-1 text-xs font-medium leading-relaxed text-amber-900">
          All stages complete. Confirming handover marks the project finished.
          {Number(project.retentionHeld) > 0.005 && (
            <> <strong className="font-black text-amber-950">{fullMoney(project.retentionHeld)}</strong> retention stays held until the defect period ends.</>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-extrabold text-slate-800">Rate Contractor Performance</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl text-base transition-all ${
                n <= rating ? "bg-amber-500 text-white shadow-xs" : "bg-white text-slate-300 ring-1 ring-slate-200"
              }`}
            >
              <Star className="h-5 w-5 fill-current" />
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={review}
        onChange={(e) => setReview(e.target.value)}
        rows={3}
        placeholder="Share your experience working with this contractor..."
        className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-xs outline-none focus:border-amber-500 font-medium"
      />

      <button
        type="button"
        disabled={busy || rating === 0}
        onClick={() => onConfirm({ rating, review: review.trim() })}
        className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 text-xs font-extrabold text-white shadow-md shadow-amber-500/25 hover:brightness-110 disabled:opacity-50 transition-all"
      >
        {busy ? "Confirming..." : "Confirm Handover & Submit Rating"}
      </button>
    </section>
  );
}

function ConfirmDialog({ title, children, confirmLabel, busy, tone = "gray", onClose, onConfirm }) {
  return (
    <Modal onClose={onClose} title={title}>
      <div className="space-y-3">{children}</div>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-xs font-extrabold text-white shadow-md shadow-emerald-500/20 hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {busy ? "Processing…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function ReasonDialog({ title, children, confirmLabel, placeholder, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 5;

  return (
    <Modal onClose={onClose} title={title}>
      <p className="text-xs font-medium leading-relaxed text-slate-600">{children}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        placeholder={placeholder}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs outline-none focus:border-amber-500 font-medium"
      />
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason.trim())}
          disabled={!valid || busy}
          className="flex-1 rounded-2xl bg-slate-900 py-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {busy ? "Sending…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-xs p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-t-xl bg-white p-5 shadow-2xl sm:rounded-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function CashRequestStatusCard({ requests, contractorName }) {
  if (!requests || requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
        Cash Payment Requests Status
      </h3>
      {requests.map((req) => {
        const isPending = req.status === "pending_contractor_approval";
        const isApproved = req.status === "approved";
        const isRejected = req.status === "rejected";

        return (
          <div
            key={req._id}
            className={`relative overflow-hidden rounded-2xl border p-4 sm:p-4.5 shadow-xs transition-all space-y-3 ${
              isPending
                ? "border-amber-300 bg-gradient-to-br from-amber-500/10 via-amber-50 to-orange-50/60 text-amber-950"
                : isApproved
                  ? "border-emerald-300 bg-gradient-to-br from-emerald-500/10 via-emerald-50 to-teal-50/60 text-emerald-950"
                  : "border-rose-300 bg-rose-50 text-rose-950"
            }`}
          >
            {/* Top Row: Status Badge & Date */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold shadow-2xs shrink-0 ${
                    isPending
                      ? "bg-amber-500 text-slate-950"
                      : isApproved
                        ? "bg-emerald-500 text-white"
                        : "bg-rose-500 text-white"
                  }`}
                >
                  <Clock className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div>
                  <h4 className="text-xs font-black tracking-tight text-slate-900">
                    {isPending
                      ? "Cash Request Raised — Awaiting Contractor Approval"
                      : isApproved
                        ? "Cash Payment Approved & Paid"
                        : "Cash Payment Request Declined"}
                  </h4>
                  <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                    <span>Raised on:</span>
                    <strong className="text-slate-800">{dateTime(req.createdAt)}</strong>
                  </p>
                </div>
              </div>

              {/* Status Pill */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shrink-0 ${
                  isPending
                    ? "bg-amber-100 text-amber-900 border border-amber-300 ring-2 ring-amber-400/20"
                    : isApproved
                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                      : "bg-rose-100 text-rose-900 border border-rose-300"
                }`}
              >
                {isPending && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
                {isPending ? "Waiting Contractor" : isApproved ? "Paid" : "Declined"}
              </span>
            </div>

            {/* Financial Details Row */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/90 p-3 border border-slate-200/80 shadow-2xs text-xs">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Requested Cash Amount</span>
                <span className="text-sm font-black text-slate-900">{fullMoney(req.amount)}</span>
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Admin Commission Fee</span>
                <span className="text-xs font-black text-emerald-700">₹{req.commissionAmount} ({req.commissionPercent}%)</span>
              </div>
            </div>

            {/* Meaningful Status Explanatory Note */}
            <p className="text-xs leading-relaxed font-medium text-slate-700 bg-white/50 p-2.5 rounded-lg border border-slate-200/50">
              {isPending && (
                <>
                  You raised a cash payment request on <strong className="font-bold text-slate-900">{dateTime(req.createdAt)}</strong> for <strong className="font-bold text-slate-900">{fullMoney(req.amount)}</strong>. Platform commission of <strong className="font-bold text-emerald-800">₹{req.commissionAmount}</strong> has been debited from your wallet. Waiting for contractor <strong className="font-bold text-slate-900">{contractorName}</strong> to manually confirm cash receipt.
                </>
              )}
              {isApproved && (
                <>
                  Contractor <strong className="font-bold text-slate-900">{contractorName}</strong> confirmed cash receipt of <strong className="font-bold text-slate-900">{fullMoney(req.amount)}</strong> on <strong className="font-bold text-slate-900">{dateTime(req.contractorApprovedAt)}</strong>. Payment is now marked completed.
                </>
              )}
              {isRejected && (
                <>
                  Contractor <strong className="font-bold text-slate-900">{contractorName}</strong> declined cash receipt request. {req.rejectionReason ? `Reason: ${req.rejectionReason}` : ""}
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
