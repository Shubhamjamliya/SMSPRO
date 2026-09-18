import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Scale, ShieldAlert, X } from "lucide-react";
import { PhotoPicker } from "./FilePicker";
import { fullMoney, dateTime } from "./format";

/**
 * Disputes (BRD open question 15).
 *
 * "There is no dispute process anywhere in the platform today. With projects
 * worth lakhs, we strongly recommend building one."
 *
 * The screen's job is to make raising one feel serious without making it feel
 * punitive, and to be completely honest about the consequence: naming a stage
 * FREEZES that stage's money until support decides. A customer who does not
 * realise that will raise one casually and then ring up furious that their
 * contractor stopped work; a contractor who does not realise it will not
 * understand why their payment vanished.
 *
 * So the form states the frozen amount before submission, not after.
 */

export const DISPUTE_REASONS = [
  ["work_quality", "Quality of the work"],
  ["work_incomplete", "Work not finished"],
  ["delay", "Delay"],
  ["scope_disagreement", "Disagreement about what was included"],
  ["payment_withheld", "Payment being withheld"],
  ["materials", "Materials"],
  ["site_access", "Site access"],
  ["other", "Something else"],
];

const STATUS_LABEL = {
  open: "Waiting for our team",
  under_review: "Being reviewed",
  resolved: "Resolved",
  withdrawn: "Withdrawn",
};

const STATUS_TONE = {
  open: "bg-amber-50 text-amber-800 ring-amber-200",
  under_review: "bg-blue-50 text-blue-800 ring-blue-200",
  resolved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  withdrawn: "bg-slate-100 text-slate-600 ring-slate-200",
};

const OUTCOME_LABEL = {
  released_to_contractor: "Paid to the contractor",
  refunded_to_customer: "Returned to the customer",
  split: "Split between both sides",
  dismissed: "Dismissed — work continues",
};

export default function DisputePanel({ projectId, api, stages = [], side = "customer" }) {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [raising, setRaising] = useState(false);

  const load = useCallback(async () => {
    try {
      setDisputes(await api.listDisputes(projectId));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load disputes");
    } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => { load(); }, [load]);

  // A stage that is already settled or already disputed cannot be disputed again.
  const disputableStages = stages.filter(
    (s) => !["payment_released", "disputed"].includes(s.status),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900">Disputes</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            If the two sides disagree, our team decides.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRaising(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
        >
          <ShieldAlert className="h-3.5 w-3.5" /> Raise
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="h-20 animate-pulse rounded-xl bg-slate-200/70" />
      ) : disputes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
          <Scale className="mx-auto mb-2 h-7 w-7 text-slate-300" />
          <p className="text-xs font-bold text-slate-800">No disputes</p>
          <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-slate-500">
            Try talking it through in the project messages first — most
            disagreements settle there.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {disputes.map((d) => (
            <li key={d._id}>
              <DisputeCard
                dispute={d}
                side={side}
                onChanged={load}
                api={api}
                onError={setError}
              />
            </li>
          ))}
        </ul>
      )}

      {raising && (
        <RaiseDialog
          stages={disputableStages}
          onClose={() => setRaising(false)}
          onSubmit={async (body) => {
            await api.raiseDispute(projectId, body);
            setRaising(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function DisputeCard({ dispute, side, api, onChanged, onError }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isLive = ["open", "under_review"].includes(dispute.status);
  const mine = dispute.raisedByType === (side === "contractor" ? "CONTRACTOR" : "CUSTOMER");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-900">{dispute.disputeNumber}</p>
          <p className="mt-0.5 text-[10.5px] text-slate-500">
            Raised by {dispute.raisedByType.toLowerCase()} · {dateTime(dispute.createdAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${
            STATUS_TONE[dispute.status]
          }`}
        >
          {STATUS_LABEL[dispute.status]}
        </span>
      </div>

      <p className="mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-slate-700">
        {dispute.description}
      </p>

      {Number(dispute.frozenAmount) > 0 && isLive && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[10.5px] font-semibold text-amber-800">
          {fullMoney(dispute.frozenAmount)} is held while this is reviewed. Nobody can
          release it until our team decides.
        </p>
      )}

      {dispute.status === "resolved" && (
        <div className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2">
          <p className="text-[10.5px] font-bold text-emerald-900">
            {OUTCOME_LABEL[dispute.outcome] || dispute.outcome}
          </p>
          {dispute.outcome !== "dismissed" && (
            <p className="mt-0.5 text-[10.5px] text-emerald-800">
              {fullMoney(dispute.amountToContractor)} to the contractor ·{" "}
              {fullMoney(dispute.amountToCustomer)} returned
            </p>
          )}
          {dispute.resolutionNote && (
            <p className="mt-1 text-[10.5px] leading-relaxed text-emerald-800">
              {dispute.resolutionNote}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 text-[10.5px] font-bold text-slate-500 hover:text-slate-800"
      >
        {expanded ? "Hide history" : `History (${dispute.timeline?.length || 0})`}
      </button>

      {expanded && (
        <>
          <ol className="mt-2 space-y-1.5 border-l-2 border-slate-100 pl-3">
            {(dispute.timeline || []).map((t, i) => (
              <li key={`${t.at}-${i}`}>
                <p className="text-[10.5px] font-bold text-slate-700">
                  {t.action.replace(/_/g, " ")}
                  <span className="ml-1.5 font-normal text-slate-400">
                    {t.byType.toLowerCase()} · {dateTime(t.at)}
                  </span>
                </p>
                {t.note && (
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-600">{t.note}</p>
                )}
              </li>
            ))}
          </ol>

          {isLive && (
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Add anything our team should know…"
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-[11px] outline-none focus:border-slate-500"
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={note.trim().length < 3 || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.commentOnDispute(dispute._id, note.trim());
                      setNote("");
                      await onChanged();
                    } catch (err) {
                      onError(err?.response?.data?.message || "Could not add that");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10.5px] font-bold text-white disabled:opacity-40"
                >
                  Add note
                </button>
                {mine && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api.withdrawDispute(dispute._id, note.trim() || "Withdrawn");
                        await onChanged();
                      } catch (err) {
                        onError(err?.response?.data?.message || "Could not withdraw it");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-[10.5px] font-bold text-slate-700"
                  >
                    Withdraw dispute
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RaiseDialog({ stages, onClose, onSubmit }) {
  const [stageId, setStageId] = useState("");
  const [reason, setReason] = useState("work_quality");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chosen = stages.find((s) => String(s._id) === String(stageId));
  const valid = description.trim().length >= 20;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Raise a dispute"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-black text-slate-900">Raise a dispute</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
          Our team reads what you write here and decides from it, along with the
          photographs, messages and documents already on the project. Most
          disagreements are quicker to settle in the project messages first.
        </p>

        <label className="block text-[11px] font-bold text-slate-700" htmlFor="dispute-stage">
          Which stage is this about?
        </label>
        <select
          id="dispute-stage"
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
        >
          <option value="">The project as a whole</option>
          {stages.map((s) => (
            <option key={s._id} value={s._id}>
              {s.sequence}. {s.name} — {fullMoney(s.amount)}
            </option>
          ))}
        </select>

        {/* The consequence, stated BEFORE they commit to it. */}
        {chosen ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-bold">{fullMoney(chosen.amount)} will be frozen.</span>{" "}
              This stage cannot be approved or paid until our team decides.
            </span>
          </p>
        ) : (
          <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-600">
            A project-level dispute does not freeze any payment on its own. Pick a
            stage if a specific payment is in question.
          </p>
        )}

        <label className="mt-3 block text-[11px] font-bold text-slate-700" htmlFor="dispute-reason">
          What is the disagreement about?
        </label>
        <select
          id="dispute-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
        >
          {DISPUTE_REASONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <label className="mt-3 block text-[11px] font-bold text-slate-700" htmlFor="dispute-desc">
          What happened?
        </label>
        <textarea
          id="dispute-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Be specific — dates, what was expected, what was found."
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
        />
        <p className={`mt-1 text-[10px] ${valid ? "text-slate-400" : "text-amber-700"}`}>
          {description.trim().length}/20 characters minimum
        </p>

        <div className="mt-3">
          <p className="text-[11px] font-bold text-slate-700">
            Photographs <span className="font-normal text-slate-500">— optional but persuasive</span>
          </p>
          <div className="mt-1">
            <PhotoPicker
              values={evidence}
              onChange={setEvidence}
              max={12}
              folder="construction/disputes"
              label="Add evidence"
            />
          </div>
        </div>

        {error && (
          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onSubmit({
                  stageId: stageId || undefined,
                  reason,
                  description: description.trim(),
                  evidence,
                });
              } catch (err) {
                setError(err?.response?.data?.message || "Could not raise it");
              } finally {
                setBusy(false);
              }
            }}
            className="flex-1 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Raise dispute"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { STATUS_LABEL as DISPUTE_STATUS_LABEL, STATUS_TONE as DISPUTE_STATUS_TONE, OUTCOME_LABEL as DISPUTE_OUTCOME_LABEL };
