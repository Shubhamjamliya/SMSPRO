import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, BookmarkPlus, Check, MessageCircleQuestion, PartyPopper, Plus, Save, Send, Trash2, X,
} from "lucide-react";
import contractorApi from "../services/contractorApi";
import { fullMoney, shortDate, QUOTE_STATUS_LABEL } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const inputClass =
  "w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[14px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20";

const UNITS = ["", "sqft", "sqm", "rft", "rmt", "cuft", "cum", "nos", "lumpsum", "day"];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * BRD W10–W13 — the quotation builder.
 *
 * "This is the module's headline feature. It turns an informal estimate into a
 * professional document."
 *
 * Totals are shown live as the contractor types, but they are always recomputed
 * on the server when saved — this screen previews the maths, it does not own it.
 */
export default function QuotationBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [dialog, setDialog] = useState(null); // 'template' | 'decline' | { queryId }
  const [answer, setAnswer] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  const load = useCallback(async () => {
    try {
      const { quotation } = await contractorApi.getQuotation(id);
      setQ(quotation);
      setDirty(false);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load this quotation"));
      navigate("/contractor/quotations", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const editable = q?.status === "draft";

  const patch = (changes) => {
    setQ((prev) => ({ ...prev, ...changes }));
    setDirty(true);
  };

  const setSection = (si, changes) => {
    patch({ sections: q.sections.map((s, i) => (i === si ? { ...s, ...changes } : s)) });
  };

  const setItem = (si, ii, changes) => {
    setSection(si, {
      items: q.sections[si].items.map((it, i) => (i === ii ? { ...it, ...changes } : it)),
    });
  };

  /** Live preview only — the server recomputes every amount on save. */
  const totals = useMemo(() => {
    if (!q) return { subtotal: 0, tax: 0, total: 0, sectionTotals: [] };
    const sectionTotals = (q.sections || []).map((s) =>
      round2((s.items || []).reduce((sum, i) =>
        sum + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0)));
    const subtotal = round2(sectionTotals.reduce((a, b) => a + b, 0));
    const pct = Number(q.taxPercent) || 0;
    const tax = q.taxMode === "exclusive" ? round2(subtotal * (pct / 100))
      : q.taxMode === "inclusive" ? round2(subtotal - subtotal / (1 + pct / 100))
        : 0;
    const total = q.taxMode === "exclusive" ? round2(subtotal + tax) : subtotal;
    return { subtotal, tax, total, sectionTotals };
  }, [q]);

  const stageTotal = useMemo(
    () => round2((q?.proposedStages || []).reduce((s, x) => s + (Number(x.percentage) || 0), 0)),
    [q],
  );

  const save = async (silent = false) => {
    setBusy(true);
    try {
      const updated = await contractorApi.updateQuotation(id, {
        title: q.title,
        sections: (q.sections || []).map((s) => ({
          name: s.name,
          items: (s.items || []).map((i) => ({
            description: i.description,
            quantity: Number(i.quantity) || 0,
            unit: i.unit || "",
            rate: Number(i.rate) || 0,
            remarks: i.remarks || "",
          })),
        })),
        taxMode: q.taxMode,
        taxLabel: q.taxLabel,
        taxPercent: Number(q.taxPercent) || 0,
        terms: q.terms || "",
        exclusions: q.exclusions || "",
        proposedStages: (q.proposedStages || []).map((s) => ({
          name: s.name,
          description: s.description || "",
          percentage: Number(s.percentage) || 0,
          targetDays: s.targetDays ?? null,
        })),
      });
      setQ(updated);
      setDirty(false);
      if (!silent) toast.success("Saved");
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Could not save"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (dirty && !(await save(true))) return;
    setBusy(true);
    try {
      await contractorApi.sendQuotation(id);
      toast.success("Quotation sent to the customer");
      await load();
    } catch (error) {
      // The server enforces exclusions, stage guardrails and the quote cap —
      // surface exactly what it said rather than a generic failure.
      toast.error(errorMessage(error, "Could not send"));
    } finally {
      setBusy(false);
    }
  };

  const revise = async () => {
    setBusy(true);
    try {
      const rev = await contractorApi.reviseQuotation(id);
      toast.success(`Version ${rev.version} created`);
      navigate(`/contractor/quotations/${rev._id}`, { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "Could not create a revision"));
    } finally {
      setBusy(false);
    }
  };

  /** The customer accepted — this is the contractor's half of the handshake. */
  const confirmProject = async () => {
    setBusy(true);
    try {
      const result = await contractorApi.confirmQuotation(id);
      toast.success("Project started");
      if (result?.project?._id) {
        navigate(`/contractor/projects/${result.project._id}`);
      } else {
        await load();
      }
    } catch (error) {
      toast.error(errorMessage(error, "Could not confirm"));
    } finally {
      setBusy(false);
    }
  };

  const declineProject = async () => {
    setBusy(true);
    try {
      await contractorApi.declineQuotation(id, declineReason.trim());
      toast.success("Told the customer you can't take this on");
      setDialog(null);
      setDeclineReason("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not send"));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !q) {
    return (
      <div className="min-h-screen bg-white px-4 py-6">
        <div className="mx-auto max-w-lg space-y-4">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  const unanswered = (q.queries || []).filter((x) => !x.answeredAt);
  const confirmation = q.contractorConfirmation?.status;
  const needsConfirmation = q.status === "accepted" && (!confirmation || confirmation === "pending");
  const confirmed = q.status === "accepted" && confirmation === "accepted";
  const declined = q.status === "accepted" && confirmation === "declined";

  return (
    <div className="min-h-screen bg-white pb-32">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/contractor/quotations")}
            className="-ml-1.5 rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-gray-900">
              {q.enquiryId?.serviceId?.name || "Quotation"}
            </p>
            <p className="font-mono text-[11px] text-gray-400">
              {q.quotationNumber} · v{q.version} · {QUOTE_STATUS_LABEL[q.status]}
            </p>
          </div>
          {dirty ? (
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              Unsaved
            </span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-5">
        {/* BRD C12 — questions the customer asked against this quote. */}
        {unanswered.length ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
              <MessageCircleQuestion className="h-4 w-4" />
              {unanswered.length} question{unanswered.length === 1 ? "" : "s"} waiting
            </p>
            <ul className="mt-2 space-y-2">
              {unanswered.map((query) => (
                <li key={query._id} className="rounded-lg bg-white p-2.5">
                  <p className="text-[13px] text-gray-800">{query.question}</p>
                  <button
                    type="button"
                    onClick={() => { setDialog({ queryId: query._id }); setAnswer(""); }}
                    className="mt-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700"
                  >
                    Reply
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {q.revisionRequest ? (
          <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-3.5">
            <p className="text-sm font-bold text-blue-900">Customer asked for changes</p>
            <p className="mt-1 text-[13px] leading-relaxed text-blue-800">{q.revisionRequest}</p>
          </div>
        ) : null}

        {/* The customer accepted — this is the contractor's half of the handshake. */}
        {needsConfirmation ? (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
            <p className="text-sm font-bold text-emerald-900">Customer accepted this quotation</p>
            <p className="mt-1 text-[13px] leading-relaxed text-emerald-800">
              Locked at {fullMoney(q.total)}. Confirm to start the project, or let them know now if you
              can&apos;t take it on.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={confirmProject}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> {busy ? "…" : "Confirm & start project"}
              </button>
              <button
                type="button"
                onClick={() => setDialog("decline")}
                disabled={busy}
                className="shrink-0 rounded-lg border border-emerald-300 px-4 py-2.5 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Can&apos;t take it
              </button>
            </div>
          </div>
        ) : null}

        {confirmed ? (
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
            <PartyPopper className="h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-emerald-900">Project started</p>
              <p className="mt-0.5 text-[13px] text-emerald-800">This is now a live project.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/contractor/projects")}
              className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              View
            </button>
          </div>
        ) : null}

        {declined ? (
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-3.5">
            <p className="text-sm font-bold text-gray-900">You told the customer you can&apos;t take this on</p>
            {q.contractorConfirmation?.declineReason ? (
              <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
                {q.contractorConfirmation.declineReason}
              </p>
            ) : null}
          </div>
        ) : null}

        {!editable ? (
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-3.5">
            <p className="text-[13px] leading-relaxed text-gray-600">
              This version has been sent and can no longer be edited. Create a revision to
              change anything — the customer keeps both versions.
            </p>
            {q.status !== "accepted" ? (
              <button
                type="button"
                onClick={revise}
                disabled={busy}
                className="mt-2.5 rounded-lg border border-orange-300 px-4 py-2 text-[13px] font-semibold text-orange-600 hover:bg-orange-50"
              >
                Create revision v{q.version + 1}
              </button>
            ) : null}
          </div>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">Title</span>
          <input
            className={inputClass}
            value={q.title || ""}
            disabled={!editable}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>

        {/* Line items, grouped into sections (BRD W10) */}
        <div className="mt-5 space-y-4">
          {(q.sections || []).map((section, si) => (
            <div key={si} className="rounded-xl border border-gray-200">
              <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-900 outline-none"
                  value={section.name}
                  disabled={!editable}
                  onChange={(e) => setSection(si, { name: e.target.value })}
                  placeholder="Section name"
                />
                <span className="shrink-0 text-sm font-bold tabular-nums text-gray-700">
                  {fullMoney(totals.sectionTotals[si])}
                </span>
                {editable ? (
                  <button
                    type="button"
                    onClick={() => patch({ sections: q.sections.filter((_, i) => i !== si) })}
                    className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove section"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="divide-y divide-gray-50">
                {(section.items || []).map((item, ii) => (
                  <div key={ii} className="p-3">
                    <div className="flex gap-2">
                      <input
                        className={inputClass}
                        placeholder="What is being done"
                        value={item.description}
                        disabled={!editable}
                        onChange={(e) => setItem(si, ii, { description: e.target.value })}
                      />
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => setSection(si, {
                            items: section.items.filter((_, i) => i !== ii),
                          })}
                          className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove item"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        placeholder="Qty"
                        value={item.quantity ?? ""}
                        disabled={!editable}
                        onChange={(e) => setItem(si, ii, { quantity: e.target.value })}
                      />
                      <select
                        className={inputClass}
                        value={item.unit || ""}
                        disabled={!editable}
                        onChange={(e) => setItem(si, ii, { unit: e.target.value })}
                      >
                        {UNITS.map((u) => <option key={u} value={u}>{u || "unit"}</option>)}
                      </select>
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        placeholder="Rate"
                        value={item.rate ?? ""}
                        disabled={!editable}
                        onChange={(e) => setItem(si, ii, { rate: e.target.value })}
                      />
                      <div className="flex items-center justify-end px-1 text-[13px] font-semibold tabular-nums text-gray-800">
                        {((Number(item.quantity) || 0) * (Number(item.rate) || 0))
                          .toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {editable ? (
                <button
                  type="button"
                  onClick={() => setSection(si, {
                    items: [...(section.items || []), { description: "", quantity: 1, unit: "", rate: 0 }],
                  })}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-gray-100 py-2.5 text-[13px] font-semibold text-orange-600 hover:bg-orange-50/50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add line
                </button>
              ) : null}
            </div>
          ))}

          {editable ? (
            <button
              type="button"
              onClick={() => patch({ sections: [...(q.sections || []), { name: "New section", items: [] }] })}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-3 text-[13px] font-semibold text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" /> Add section
            </button>
          ) : null}
        </div>

        {/* Totals */}
        <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
          <div className="flex items-center justify-between text-[13px] text-gray-600">
            <span>Subtotal</span>
            <span className="tabular-nums">{fullMoney(totals.subtotal)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              className={`${inputClass} flex-1`}
              value={q.taxMode}
              disabled={!editable}
              onChange={(e) => patch({ taxMode: e.target.value })}
            >
              <option value="exclusive">Tax extra</option>
              <option value="inclusive">Tax included</option>
              <option value="none">No tax</option>
            </select>
            {q.taxMode !== "none" ? (
              <input
                className={`${inputClass} w-20`}
                type="number"
                min={0}
                max={100}
                value={q.taxPercent ?? 0}
                disabled={!editable}
                onChange={(e) => patch({ taxPercent: e.target.value })}
              />
            ) : null}
            <span className="w-24 text-right text-[13px] tabular-nums text-gray-600">
              {fullMoney(totals.tax)}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
            <span className="text-sm font-bold text-gray-900">Total</span>
            <span className="text-lg font-bold tabular-nums text-gray-900">
              {fullMoney(totals.total)}
            </span>
          </div>
        </div>

        {/* BRD W12 — payment stages */}
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-gray-500">
              Payment stages
            </h2>
            <span className={`text-[12px] font-bold tabular-nums ${
              stageTotal === 100 ? "text-emerald-600" : "text-red-600"}`}
            >
              {stageTotal}%{stageTotal === 100 ? "" : " — must be 100%"}
            </span>
          </div>
          <div className="space-y-2">
            {(q.proposedStages || []).map((s, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="Stage name"
                  value={s.name}
                  disabled={!editable}
                  onChange={(e) => patch({
                    proposedStages: q.proposedStages.map((x, ix) =>
                      (ix === i ? { ...x, name: e.target.value } : x)),
                  })}
                />
                <input
                  className={`${inputClass} w-20`}
                  type="number"
                  min={0}
                  max={100}
                  value={s.percentage ?? ""}
                  disabled={!editable}
                  onChange={(e) => patch({
                    proposedStages: q.proposedStages.map((x, ix) =>
                      (ix === i ? { ...x, percentage: e.target.value } : x)),
                  })}
                />
                {editable ? (
                  <button
                    type="button"
                    onClick={() => patch({
                      proposedStages: q.proposedStages.filter((_, ix) => ix !== i),
                    })}
                    className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove stage"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {editable ? (
            <button
              type="button"
              onClick={() => patch({
                proposedStages: [...(q.proposedStages || []), { name: "", percentage: 0 }],
              })}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add stage
            </button>
          ) : null}
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            The customer's money is held and released to you as each stage is approved.
          </p>
        </section>

        {/* BRD W11 — exclusions */}
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">
            What is NOT included<span className="ml-0.5 text-red-500">*</span>
          </span>
          <textarea
            className={inputClass}
            rows={3}
            placeholder="Land cost, government approvals, furniture…"
            value={q.exclusions || ""}
            disabled={!editable}
            onChange={(e) => patch({ exclusions: e.target.value })}
          />
          <span className="mt-1 block text-xs text-gray-500">
            Nearly every dispute starts with something the customer assumed was included.
          </span>
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-gray-700">Terms</span>
          <textarea
            className={inputClass}
            rows={3}
            value={q.terms || ""}
            disabled={!editable}
            onChange={(e) => patch({ terms: e.target.value })}
          />
        </label>

        {q.validUntil ? (
          <p className="mt-4 text-xs text-gray-500">
            Valid until {shortDate(q.validUntil)}
          </p>
        ) : null}
      </div>

      {editable ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-2xl gap-2">
            <button
              type="button"
              onClick={() => save()}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-4 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Save
            </button>
            <button
              type="button"
              onClick={() => { setDialog("template"); setTemplateName(q.title || ""); }}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-3 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50"
              aria-label="Save as template"
            >
              <BookmarkPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-3 text-[15px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
            >
              <Send className="h-4 w-4" /> {busy ? "…" : "Send to customer"}
            </button>
          </div>
        </div>
      ) : null}

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-sm sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-gray-900">
                {dialog === "template" ? "Save as a template"
                  : dialog === "decline" ? "Tell the customer why"
                    : "Reply to the customer"}
              </h3>
              <button
                type="button"
                onClick={() => { setDialog(null); setDeclineReason(""); }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {dialog === "decline" ? (
              <>
                <p className="mb-2.5 text-[13px] leading-relaxed text-gray-600">
                  This tells the customer you can&apos;t take on {q.quotationNumber}. It does not undo
                  their acceptance — they will need to sort out a new quote.
                </p>
                <textarea
                  className={inputClass}
                  rows={3}
                  placeholder="Reason (optional)"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={declineProject}
                  className="mt-3 w-full rounded-xl bg-red-600 py-3 text-[15px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "…" : "Send"}
                </button>
              </>
            ) : dialog === "template" ? (
              <>
                <p className="mb-2.5 text-[13px] leading-relaxed text-gray-600">
                  Reuse these sections, rates and stages next time — a similar job then takes
                  minutes to quote.
                </p>
                <input
                  className={inputClass}
                  placeholder="Template name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !templateName.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await contractorApi.saveAsTemplate(id, templateName.trim());
                      toast.success("Template saved");
                      setDialog(null);
                    } catch (error) {
                      toast.error(errorMessage(error, "Could not save the template"));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-[15px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  Save template
                </button>
              </>
            ) : (
              <>
                <textarea
                  className={inputClass}
                  rows={3}
                  placeholder="Your answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !answer.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await contractorApi.answerQuery(id, dialog.queryId, answer.trim());
                      toast.success("Answer sent");
                      setDialog(null);
                      await load();
                    } catch (error) {
                      toast.error(errorMessage(error, "Could not send the answer"));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-[15px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  Send answer
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
