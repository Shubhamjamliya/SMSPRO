import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Scale } from "lucide-react";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS } from "../utils/adminTheme";
import { fullMoney, dateTime } from "../../shared/format";
import { DISPUTE_STATUS_LABEL, DISPUTE_STATUS_TONE } from "../../shared/DisputePanel";

/**
 * BRD Q15 — deciding a dispute.
 *
 * This is the only screen in Phase 6 that moves customer money, so it is built
 * the same way as the rest of the money paths in this module: the amount is
 * stated before the click, the split is computed and shown rather than trusted
 * to arithmetic in someone's head, and the confirmation says plainly that it
 * cannot be undone.
 *
 * The four outcomes are laid out as a choice between named consequences, not as
 * a dropdown of jargon. "Dismiss" and "pay the contractor" are very different
 * acts and should not look alike.
 */
const OUTCOMES = [
  {
    value: "dismissed",
    label: "Dismiss",
    detail: "No money moves. The stage goes back to where it was and work continues.",
    tone: "border-slate-300 hover:bg-slate-50",
  },
  {
    value: "released_to_contractor",
    label: "Pay the contractor",
    detail: "The whole frozen amount is released. The stage is marked paid.",
    tone: "border-emerald-300 hover:bg-emerald-50",
  },
  {
    value: "refunded_to_customer",
    label: "Return to the customer",
    detail: "The whole frozen amount goes back to the customer's wallet.",
    tone: "border-blue-300 hover:bg-blue-50",
  },
  {
    value: "split",
    label: "Split it",
    detail: "Divide the frozen amount between both sides. Must add up exactly.",
    tone: "border-amber-300 hover:bg-amber-50",
  },
];

export default function AdminDisputeDetail() {
  const { disputeId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const [outcome, setOutcome] = useState("");
  const [toContractor, setToContractor] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await constructionAdminApi.getDispute(disputeId));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load this dispute");
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className={CN_ADMIN_PAGE_CLASS}>
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const dispute = data?.dispute;
  if (!dispute) {
    return (
      <div className={CN_ADMIN_PAGE_CLASS}>
        <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || "Dispute not found"}
        </p>
      </div>
    );
  }

  const stage = data?.stage;
  const frozen = Number(dispute.frozenAmount) || 0;
  const isLive = ["open", "under_review"].includes(dispute.status);

  const contractorShare = outcome === "split" ? Number(toContractor) || 0 : 0;
  const customerShare = outcome === "split"
    ? Math.round((frozen - contractorShare) * 100) / 100
    : 0;
  const splitValid = outcome !== "split"
    || (contractorShare >= 0 && contractorShare <= frozen);
  const canResolve = outcome && resolutionNote.trim().length >= 10 && splitValid
    && (outcome === "dismissed" || frozen > 0);

  const act = async (key, fn) => {
    setBusy(key);
    setError("");
    try {
      setFlash((await fn()) || "Done");
      setConfirming(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "That did not go through");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <button
        type="button"
        onClick={() => navigate("/admin/construction/disputes")}
        className="mb-4 text-sm font-medium text-gray-500"
      >
        ← Disputes
      </button>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{dispute.disputeNumber}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {dispute.projectId?.projectNumber} · {dispute.projectId?.title || ""}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">
            {dispute.customerId?.name} ({dispute.customerId?.phone}) vs{" "}
            {dispute.contractorId?.businessName} ({dispute.contractorId?.phone})
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
          DISPUTE_STATUS_TONE[dispute.status]
        }`}>
          {DISPUTE_STATUS_LABEL[dispute.status]}
        </span>
      </header>

      {flash && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{flash}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {/* ---- the complaint ---- */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">
              What {dispute.raisedByType === "CUSTOMER" ? "the customer" : "the contractor"} says
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {String(dispute.reason || "").replace(/_/g, " ")} · {dateTime(dispute.createdAt)}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {dispute.description}
            </p>

            {dispute.evidence?.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-gray-500">
                  Evidence ({dispute.evidence.length})
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {dispute.evidence.map((url, i) => (
                    <a
                      key={`${url}-${i}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square overflow-hidden rounded-lg bg-gray-100"
                    >
                      <img src={url} alt={`Evidence ${i + 1}`} loading="lazy"
                        className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ---- history ---- */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">History</h2>
            <ol className="space-y-3 border-l-2 border-gray-100 pl-4">
              {(dispute.timeline || []).map((t, i) => (
                <li key={`${t.at}-${i}`}>
                  <p className="text-xs font-semibold text-gray-800">
                    {t.action.replace(/_/g, " ")}
                    <span className="ml-2 font-normal text-gray-400">
                      {t.byType.toLowerCase()} · {dateTime(t.at)}
                    </span>
                  </p>
                  {t.note && (
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{t.note}</p>
                  )}
                </li>
              ))}
            </ol>

            {isLive && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Add an internal note — both sides can see this."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                />
                <button
                  type="button"
                  disabled={note.trim().length < 3 || busy === "comment"}
                  onClick={() => act("comment", async () => {
                    await constructionAdminApi.commentOnDispute(disputeId, note.trim());
                    setNote("");
                    return "Note added";
                  })}
                  className="mt-2 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  Add note
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ---- decision panel ---- */}
        <aside className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">The money</h2>
            <p className={`mt-2 text-2xl font-bold ${frozen > 0 && isLive ? "text-rose-700" : "text-gray-900"}`}>
              {fullMoney(frozen)}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {isLive && frozen > 0 ? "frozen right now" : "was frozen"}
            </p>
            {stage && (
              <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
                Stage {stage.sequence}: <span className="font-medium">{stage.name}</span>
                <br />
                worth {fullMoney(stage.amount)} · currently {stage.status.replace(/_/g, " ")}
              </p>
            )}
            {!stage && (
              <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
                Raised against the project as a whole — no single payment is frozen.
              </p>
            )}
          </div>

          {dispute.status === "resolved" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h2 className="text-sm font-semibold text-emerald-900">Resolved</h2>
              <p className="mt-1 text-xs text-emerald-800">
                {fullMoney(dispute.amountToContractor)} to the contractor ·{" "}
                {fullMoney(dispute.amountToCustomer)} returned
              </p>
              <p className="mt-2 text-xs leading-relaxed text-emerald-800">
                {dispute.resolutionNote}
              </p>
            </div>
          )}

          {isLive && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              {dispute.status === "open" && (
                <button
                  type="button"
                  disabled={busy === "review"}
                  onClick={() => act("review", async () => {
                    await constructionAdminApi.startDisputeReview(disputeId);
                    return "Marked as under review";
                  })}
                  className="mb-4 w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-xs font-medium text-gray-700"
                >
                  {busy === "review" ? "Working…" : "Mark as under review"}
                </button>
              )}

              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <Scale className="h-4 w-4" /> Decide
              </h2>

              <div className="space-y-2">
                {OUTCOMES.map((o) => {
                  const disabled = o.value !== "dismissed" && frozen <= 0;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setOutcome(o.value)}
                      className={`w-full rounded-lg border-2 px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        outcome === o.value ? "border-gray-900 bg-gray-50" : o.tone
                      }`}
                    >
                      <span className="block text-xs font-bold text-gray-900">{o.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">
                        {disabled ? "Nothing is frozen, so this is not available." : o.detail}
                      </span>
                    </button>
                  );
                })}
              </div>

              {outcome === "split" && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3">
                  <label className="block text-[11px] font-bold text-amber-900" htmlFor="split-amount">
                    To the contractor
                  </label>
                  <input
                    id="split-amount"
                    type="number"
                    inputMode="decimal"
                    value={toContractor}
                    onChange={(e) => setToContractor(e.target.value)}
                    max={frozen}
                    min={0}
                    className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                  />
                  <p className="mt-2 text-[11px] font-semibold text-amber-900">
                    Customer gets back {fullMoney(customerShare)}
                  </p>
                  {!splitValid && (
                    <p className="mt-1 text-[11px] font-semibold text-rose-700">
                      Must be between ₹0 and {fullMoney(frozen)}.
                    </p>
                  )}
                </div>
              )}

              <label className="mt-3 block text-[11px] font-bold text-gray-700" htmlFor="resolution">
                Explain the decision
              </label>
              <textarea
                id="resolution"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                placeholder="Both sides see this. Say what you found and why you decided as you did."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none focus:border-gray-500"
              />

              <button
                type="button"
                disabled={!canResolve || Boolean(busy)}
                onClick={() => setConfirming(true)}
                className="mt-3 w-full rounded-lg bg-gray-900 px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Resolve dispute
              </button>
            </div>
          )}
        </aside>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirming(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm resolution"
          >
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Confirm the decision
            </h3>
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-gray-700">
              <p>
                {outcome === "dismissed"
                  ? "No money will move. The stage returns to where it was and work continues."
                  : outcome === "released_to_contractor"
                    ? `${fullMoney(frozen)} will be released to ${dispute.contractorId?.businessName}.`
                    : outcome === "refunded_to_customer"
                      ? `${fullMoney(frozen)} will be returned to ${dispute.customerId?.name}.`
                      : `${fullMoney(contractorShare)} to ${dispute.contractorId?.businessName}, `
                        + `${fullMoney(customerShare)} back to ${dispute.customerId?.name}.`}
              </p>
              <p className="text-gray-500">
                Both sides are told immediately. Money movements cannot be reversed.
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy === "resolve"}
                onClick={() => act("resolve", async () => {
                  const r = await constructionAdminApi.resolveDispute(disputeId, {
                    outcome,
                    resolutionNote: resolutionNote.trim(),
                    amountToContractor: outcome === "split" ? contractorShare : undefined,
                    amountToCustomer: outcome === "split" ? customerShare : undefined,
                  });
                  return r?.alreadyResolved
                    ? "This dispute had already been resolved."
                    : "Resolved. Both sides have been told.";
                })}
                className="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === "resolve" ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
