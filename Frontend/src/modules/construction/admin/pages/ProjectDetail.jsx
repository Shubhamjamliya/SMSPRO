import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS } from "../utils/adminTheme";
import MoneyBar from "../../shared/MoneyBar";
import {
  fullMoney,
  shortDate,
  dateTime,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  STAGE_STATUS_LABEL,
  STAGE_STATUS_TONE,
} from "../../shared/format";

/**
 * BRD A6, A7 — the project a support operator has been called about.
 *
 * Every action here touches somebody's money, so each one is behind a confirm
 * that names the amount and states plainly what cannot be undone:
 *
 *   Hold      pauses approvals. Reversible, and the least destructive tool.
 *   Cancel    returns every held rupee to the customer. Not reversible.
 *   Approve   pays a contractor when the customer has gone quiet (Q13).
 *   Reconcile recomputes the money cache from the escrow ledger. Read-only by
 *             default — repair is a separate, explicit choice, because silently
 *             rewriting money totals is how drift becomes invisible.
 */
export default function AdminProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState("");
  const [recon, setRecon] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await constructionAdminApi.getProject(id));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load this project");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (key, fn) => {
    setBusy(key);
    setError("");
    try {
      setFlash((await fn()) || "Done");
      setDialog(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "That action did not go through");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className={CN_ADMIN_PAGE_CLASS}>
        <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const project = data?.project;
  if (!project) {
    return (
      <div className={CN_ADMIN_PAGE_CLASS}>
        <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || "Project not found"}
        </p>
        <button
          type="button"
          onClick={() => navigate("/admin/construction/projects")}
          className="mt-4 text-sm font-medium text-blue-700"
        >
          ← Back to projects
        </button>
      </div>
    );
  }

  const stages = data?.stages || [];
  const held = Math.max(
    0,
    (Number(project.fundedAmount) || 0)
      - (Number(project.releasedAmount) || 0)
      - (Number(project.refundedAmount) || 0),
  );
  const terminal = ["cancelled", "closed"].includes(project.status);

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <button
        type="button"
        onClick={() => navigate("/admin/construction/projects")}
        className="mb-4 text-sm font-medium text-gray-500"
      >
        ← Projects
      </button>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{project.projectNumber}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {project.title || "—"}
            {project.customerId?.name ? ` · ${project.customerId.name}` : ""}
            {project.customerId?.phone ? ` (${project.customerId.phone})` : ""}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Contractor: {project.contractorId?.businessName || "—"}
            {project.contractorId?.phone ? ` · ${project.contractorId.phone}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
            PROJECT_STATUS_TONE[project.status] || "bg-gray-100 text-gray-600 ring-gray-200"
          }`}
        >
          {PROJECT_STATUS_LABEL[project.status] || project.status}
        </span>
      </header>

      {flash && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{flash}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {project.status === "on_hold" && project.holdReason && (
        <p className="mb-4 rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <span className="font-medium">On hold:</span> {project.holdReason}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
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

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
              Stages
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">Stage</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5 text-right font-medium">Released</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stages.map((s) => (
                    <tr key={s._id}>
                      <td className="px-4 py-3 text-gray-400">{s.sequence}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{s.name}</p>
                        {s.targetDate && (
                          <p className="text-xs text-gray-500">
                            Target {shortDate(s.targetDate)}
                          </p>
                        )}
                        {s.submittedAt && s.status === "submitted_for_approval" && (
                          <p className="text-xs text-amber-700">
                            Submitted {dateTime(s.submittedAt)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {fullMoney(s.amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-700">
                        {Number(s.releasedAmount) > 0 ? fullMoney(s.releasedAmount) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
                            STAGE_STATUS_TONE[s.status] || "bg-gray-100 text-gray-600 ring-gray-200"
                          }`}
                        >
                          {STAGE_STATUS_LABEL[s.status] || s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.status === "submitted_for_approval" && !terminal && (
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: "approveStage", stage: s })}
                            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {recon && (
            <section
              className={`rounded-xl border p-4 ${
                recon.inSync
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-rose-200 bg-rose-50"
              }`}
            >
              <h2 className={`text-sm font-semibold ${recon.inSync ? "text-emerald-900" : "text-rose-900"}`}>
                {recon.inSync ? "Money reconciles with the ledger" : "Drift detected"}
              </h2>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-white/70 p-3 text-xs text-gray-700">
                {JSON.stringify(recon.drift || recon, null, 2)}
              </pre>
              {!recon.inSync && (
                <button
                  type="button"
                  disabled={busy === "repair"}
                  onClick={() => setDialog({ kind: "repair" })}
                  className="mt-3 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-medium text-white"
                >
                  Repair the cache from the ledger
                </button>
              )}
            </section>
          )}
        </div>

        {/* ---- intervention panel ---- */}
        <aside className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Actions</h2>

            {project.status === "on_hold" ? (
              <Action
                label="Resume project"
                hint="Approvals and payments start working again."
                busy={busy === "resume"}
                onClick={() =>
                  act("resume", async () => {
                    await constructionAdminApi.resumeProject(id);
                    return "Project resumed.";
                  })
                }
              />
            ) : (
              !terminal && (
                <Action
                  label="Put on hold"
                  hint="Pauses all approvals and payments. Reversible."
                  onClick={() => setDialog({ kind: "hold" })}
                />
              )
            )}

            {!terminal && (
              <Action
                label="Cancel project"
                hint={
                  held > 0.005
                    ? `Returns ${fullMoney(held)} to the customer. Cannot be undone.`
                    : "Closes the project. Cannot be undone."
                }
                tone="danger"
                onClick={() => setDialog({ kind: "cancel" })}
              />
            )}

            {!terminal && (
              <Action
                label="Change the contractor"
                hint="Unpaid stages move to a new firm. Paid work stays with whoever did it."
                onClick={() => setDialog({ kind: "reassign" })}
              />
            )}

            <Action
              label="Check against the ledger"
              hint="Read-only. Compares the stored totals with the escrow ledger."
              busy={busy === "recon"}
              onClick={() =>
                act("recon", async () => {
                  const r = await constructionAdminApi.reconcileProject(id, false);
                  setRecon(r);
                  return r.inSync ? "Money reconciles." : "Drift found — see below.";
                })
              }
            />

            {project.status === "completed" && Number(project.retentionHeld) > 0.005 && (
              <Action
                label="Release retention now"
                hint={`Pays ${fullMoney(project.retentionHeld)} before the defect period ends.`}
                onClick={() => setDialog({ kind: "retention" })}
              />
            )}
          </div>

          <dl className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 text-sm">
            <Row label="Retention" value={`${project.retentionPercent || 0}%`} />
            <Row label="Defect liability" value={`${project.defectLiabilityDays || 0} days`} />
            {project.retentionDueAt && (
              <Row label="Retention due" value={shortDate(project.retentionDueAt)} />
            )}
            <Row label="Started" value={shortDate(project.startDate || project.createdAt)} />
            {project.targetCompletionDate && (
              <Row label="Target completion" value={shortDate(project.targetCompletionDate)} />
            )}
            <Row label="Last activity" value={shortDate(project.lastActivityAt)} />
          </dl>
        </aside>
      </div>

      {dialog?.kind === "hold" && (
        <ReasonDialog
          title="Put this project on hold"
          body="No stage can be approved and no payment released until it is resumed. Both sides are told."
          confirmLabel="Put on hold"
          busy={busy === "hold"}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            act("hold", async () => {
              await constructionAdminApi.holdProject(id, reason);
              return "Project put on hold.";
            })
          }
        />
      )}

      {dialog?.kind === "cancel" && (
        <ReasonDialog
          title="Cancel this project"
          body={
            held > 0.005
              ? `${fullMoney(held)} still held will be returned to the customer immediately. Money already released to the contractor is NOT recovered. This cannot be undone.`
              : "This closes the project permanently. It cannot be undone."
          }
          confirmLabel="Cancel the project"
          danger
          busy={busy === "cancel"}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            act("cancel", async () => {
              await constructionAdminApi.cancelProject(id, reason);
              return "Project cancelled and held money returned.";
            })
          }
        />
      )}

      {dialog?.kind === "approveStage" && (
        <ReasonDialog
          title={`Approve "${dialog.stage.name}" on the customer's behalf`}
          body={`This releases ${fullMoney(dialog.stage.amount)} (less retention) to the contractor and cannot be reversed. Use this only when the customer has not responded and you have checked the evidence.`}
          confirmLabel="Approve and release"
          optional
          placeholder="Why is a supervisor approving this? (recorded in the audit log)"
          busy={busy === "approveStage"}
          onClose={() => setDialog(null)}
          onConfirm={(note) =>
            act("approveStage", async () => {
              const r = await constructionAdminApi.approveStage(dialog.stage._id, note);
              return r?.alreadyReleased
                ? "That stage had already been paid."
                : "Approved and payment released.";
            })
          }
        />
      )}

      {dialog?.kind === "retention" && (
        <ReasonDialog
          title="Release retention early"
          body={`${fullMoney(project.retentionHeld)} will be paid to the contractor before the defect liability period ends. The customer loses that protection.`}
          confirmLabel="Release retention"
          danger
          optional
          busy={busy === "retention"}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            act("retention", async () => {
              await constructionAdminApi.releaseRetention(id, true);
              return "Retention released.";
            })
          }
        />
      )}

      {dialog?.kind === "reassign" && (
        <ReassignDialog
          project={project}
          busy={busy === "reassign"}
          onClose={() => setDialog(null)}
          onConfirm={(contractorId, reason) =>
            act("reassign", async () => {
              const r = await constructionAdminApi.reassignContractor(id, contractorId, reason);
              return `Moved to ${r.newContractor}. `
                + `${r.stagesTransferred} stage(s) transferred, `
                + `${r.stagesRetainedByOutgoing} stayed with ${r.outgoingContractor}.`;
            })
          }
        />
      )}

      {dialog?.kind === "repair" && (
        <ReasonDialog
          title="Repair the money cache"
          body="The stored totals will be overwritten with the values computed from the escrow ledger. The ledger is not modified. Do this only after you understand why the drift happened."
          confirmLabel="Repair from the ledger"
          danger
          optional
          busy={busy === "repair"}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            act("repair", async () => {
              const r = await constructionAdminApi.reconcileProject(id, true);
              setRecon(r);
              return "Totals recomputed from the ledger.";
            })
          }
        />
      )}
    </div>
  );
}

/**
 * BRD A6 — changing the contractor on a live project.
 *
 * The screen has to be honest about the one thing an operator will get wrong if
 * nobody tells them: money already released is NOT clawed back. It was paid
 * against work the outgoing contractor actually did and a customer actually
 * approved, so it stays with them. Only unpaid stages move.
 *
 * The server enforces the rest — no reassigning while a stage is disputed or
 * awaiting approval, and not to an unverified or over-capacity firm — and
 * returns a plain-English refusal, which is shown as-is rather than translated.
 */
function ReassignDialog({ project, busy, onClose, onConfirm }) {
  const [contractors, setContractors] = useState(null);
  const [contractorId, setContractorId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    constructionAdminApi
      .getContractors({ status: "approved", limit: 200 })
      .then((r) => setContractors(
        (r.rows || []).filter((c) => String(c._id) !== String(project.contractorId?._id
          || project.contractorId)),
      ))
      .catch(() => setContractors([]));
  }, [project.contractorId]);

  const released = Number(project.releasedAmount) || 0;
  const valid = contractorId && reason.trim().length >= 10;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Change the contractor"
      >
        <h3 className="text-base font-semibold text-gray-900">Change the contractor</h3>

        <div className="mt-3 space-y-2 rounded-lg bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
          <p>
            <span className="font-semibold">Unpaid stages</span> move to the new
            contractor. Anything part-done is reset, because the new firm has not
            done that work.
          </p>
          {released > 0 && (
            <p>
              <span className="font-semibold">{fullMoney(released)}</span> already
              released stays with {project.contractorId?.businessName || "the current contractor"}.
              It was paid for approved work and is not recovered.
            </p>
          )}
          <p>The project is left on hold afterwards, so the new firm is not held
            to dates agreed with someone else.</p>
        </div>

        <label className="mt-4 block text-xs font-medium text-gray-700" htmlFor="new-contractor">
          New contractor
        </label>
        {contractors === null ? (
          <div className="mt-1 h-10 animate-pulse rounded-lg bg-gray-100" />
        ) : (
          <select
            id="new-contractor"
            value={contractorId}
            onChange={(e) => setContractorId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          >
            <option value="">Choose a verified contractor…</option>
            {contractors.map((c) => (
              <option key={c._id} value={c._id}>
                {c.businessName}
                {c.contractorCode ? ` (${c.contractorCode})` : ""}
              </option>
            ))}
          </select>
        )}

        <label className="mt-3 block text-xs font-medium text-gray-700" htmlFor="reassign-reason">
          Why is it changing?
        </label>
        <textarea
          id="reassign-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Both sides see this, and it goes into the permanent record."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
        />

        {error && (
          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={async () => {
              setError("");
              try {
                await onConfirm(contractorId, reason.trim());
              } catch (err) {
                setError(err?.response?.data?.message || "Could not reassign");
              }
            }}
            className="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Working…" : "Change contractor"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Action({ label, hint, onClick, busy, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`mt-3 w-full rounded-lg border px-3.5 py-2.5 text-left transition disabled:opacity-50 ${
        tone === "danger"
          ? "border-rose-200 hover:bg-rose-50"
          : "border-gray-200 hover:bg-gray-50"
      }`}
    >
      <span className={`block text-sm font-medium ${tone === "danger" ? "text-rose-700" : "text-gray-900"}`}>
        {busy ? "Working…" : label}
      </span>
      <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{hint}</span>
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function ReasonDialog({
  title, body, confirmLabel, placeholder, busy, danger, optional, onClose, onConfirm,
}) {
  const [reason, setReason] = useState("");
  const valid = optional || reason.trim().length >= 5;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{body}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={placeholder || "Reason (shown to both sides and kept in the audit log)"}
          className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500"
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={!valid || busy}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              danger ? "bg-rose-600" : "bg-gray-900"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}