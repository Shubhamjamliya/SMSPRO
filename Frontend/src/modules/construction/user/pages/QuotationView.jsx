import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Check, History, MessageCircleQuestion, Star, X, ShieldCheck, ChevronRight, FileText, CheckCircle2,
} from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";
import {
  fullMoney, shortDate, relativeDays, QUOTE_STATUS_LABEL, UNIT_LABEL,
} from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/**
 * BRD C10, C12, C13 — Detailed Quotation Inspector.
 */
export default function QuotationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // 'accept' | 'reject' | 'question' | 'revision'
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await constructionApi.getQuotation(id));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load this quotation"));
      navigate("/construction/enquiries", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn, message, closeAfter = true) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      if (closeAfter) { setDialog(null); setText(""); }
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "That did not go through"));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <div className="space-y-4 px-4 py-6">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-64 animate-pulse rounded-3xl bg-slate-200/80" />
        </div>
      </ConstructionPageShell>
    );
  }

  const { quotation: q, versions = [] } = data;
  const enquiryId = q.enquiryId?._id || q.enquiryId;
  const canDecide = ["sent", "under_review"].includes(q.status);
  const expired = q.validUntil && new Date(q.validUntil).getTime() < Date.now();
  const unanswered = (q.queries || []).filter((x) => !x.answeredAt);

  return (
    <ConstructionPageShell showBottomNav={false}>
      <ConstructionPageHeader
        title={q.contractorId?.businessName || "Contractor Quote"}
        subtitle={`Ref: ${q.quotationNumber || ""} · Version ${q.version}`}
        backTo={`/construction/enquiries/${enquiryId}`}
      />

      <div className="space-y-6 px-4 py-6 pb-36">
        {/* Status Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-slate-200/80 px-3 py-1 text-xs font-extrabold text-slate-800">
            {QUOTE_STATUS_LABEL[q.status] || q.status}
          </span>
          <div className="flex items-center gap-2">
            {q.contractorId?.rating > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-500/20">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {q.contractorId.rating.toFixed(1)}
              </span>
            ) : null}
            {q.contractorId?.completedProjects ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {q.contractorId.completedProjects} Done
              </span>
            ) : null}
          </div>
        </div>

        {expired ? (
          <div className="flex gap-3 rounded-3xl border border-amber-300/80 bg-amber-50 p-4 text-xs font-medium text-amber-900 shadow-2xs">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 stroke-[2.2]" />
            <p className="leading-relaxed">
              This quotation expired on {shortDate(q.validUntil)}. Contact the contractor to request an updated quotation.
            </p>
          </div>
        ) : null}

        {/* Total Grand Hero Card */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-4.5 shadow-2xs space-y-3.5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Total Quotation Value
            </p>
            <p className="mt-1 text-2xl font-black tracking-tight tabular-nums text-slate-900">
              {fullMoney(q.total)}
            </p>
          </div>

          <div className="space-y-1.5 border-t border-slate-200/70 pt-3 text-xs font-semibold text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums font-bold text-slate-800">{fullMoney(q.subtotal)}</span>
            </div>
            {q.taxMode !== "none" ? (
              <div className="flex justify-between">
                <span>{q.taxLabel} ({q.taxPercent}%{q.taxMode === "inclusive" ? ", included" : ""})</span>
                <span className="tabular-nums font-bold text-slate-800">{fullMoney(q.taxAmount)}</span>
              </div>
            ) : null}
          </div>

          {q.validUntil && !expired ? (
            <p className="text-xs font-semibold text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200/60">
              Valid until {shortDate(q.validUntil)} ({relativeDays(q.validUntil)})
            </p>
          ) : null}
        </div>

        {/* Itemized Line Items Sections */}
        {(q.sections || []).map((section, si) => (
          <section key={si} className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                {section.name}
              </h2>
              <span className="text-xs font-black tabular-nums text-slate-800">
                {fullMoney(section.subtotal)}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full min-w-[380px] text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase font-black tracking-wider text-slate-400">
                    <th className="px-3.5 py-2.5 text-left">Item Description</th>
                    <th className="px-2.5 py-2.5 text-right">Qty</th>
                    <th className="px-2.5 py-2.5 text-right">Rate</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(section.items || []).map((item, ii) => (
                    <tr key={ii} className="border-b border-slate-100/70 last:border-0 font-medium">
                      <td className="px-3.5 py-3 text-slate-900">
                        <span className="font-semibold">{item.description}</span>
                        {item.remarks ? (
                          <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{item.remarks}</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-3 text-right tabular-nums text-slate-600">
                        {item.quantity}
                        {item.unit ? <span className="text-slate-400"> {UNIT_LABEL[item.unit] || item.unit}</span> : null}
                      </td>
                      <td className="px-2.5 py-3 text-right tabular-nums text-slate-600 font-semibold">
                        ₹{Number(item.rate).toLocaleString("en-IN")}
                      </td>
                      <td className="px-3.5 py-3 text-right font-extrabold tabular-nums text-slate-900">
                        ₹{Number(item.amount).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {/* Proposed Payment Stages */}
        {q.proposedStages?.length ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Proposed Payment Milestones
            </h2>
            <ol className="space-y-2">
              {q.proposedStages.map((s, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-black text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold text-slate-900">{s.name}</p>
                    {s.description ? (
                      <p className="truncate text-[11px] text-slate-500 font-medium">{s.description}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-black tabular-nums text-slate-900">{s.percentage}%</p>
                    <p className="text-[11px] font-bold tabular-nums text-slate-500">
                      {fullMoney((q.total * s.percentage) / 100)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate-500 font-medium leading-relaxed bg-amber-50/60 p-2.5 rounded-lg border border-amber-200/60">
              Funds are safely held in SMS Pro escrow and released stage by stage only upon your manual approval.
            </p>
          </section>
        ) : null}

        {/* Terms & Exclusions */}
        {q.exclusions ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50/40 p-4.5 shadow-2xs space-y-2">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-amber-800">
              Not Included / Exclusions
            </h2>
            <p className="whitespace-pre-line text-xs font-semibold leading-relaxed text-slate-700">
              {q.exclusions}
            </p>
          </section>
        ) : null}

        {q.terms ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-2">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Contractor Terms & Conditions
            </h2>
            <p className="whitespace-pre-line text-xs font-medium leading-relaxed text-slate-600">
              {q.terms}
            </p>
          </section>
        ) : null}

        {/* Q&A Thread */}
        {q.queries?.length ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Questions & Clarifications
            </h2>
            <ul className="space-y-2.5">
              {q.queries.map((query) => (
                <li key={query._id} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-1.5">
                  <p className="text-xs font-extrabold text-slate-900">{query.question}</p>
                  {query.answer ? (
                    <p className="border-l-2 border-amber-500 pl-2.5 text-xs font-medium leading-relaxed text-slate-700">
                      {query.answer}
                    </p>
                  ) : (
                    <p className="text-[11px] italic font-semibold text-amber-600">Awaiting contractor response...</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Version History */}
        {versions?.length > 1 ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3">
            <h2 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
              <History className="h-4 w-4 stroke-[2]" /> Quotation Version History
            </h2>
            <ul className="space-y-2">
              {versions.map((v) => (
                <li
                  key={v._id}
                  className={`flex items-center justify-between rounded-2xl border px-3.5 py-2.5 text-xs font-medium ${
                    String(v._id) === String(q._id)
                      ? "border-amber-400/80 bg-amber-50/60 font-extrabold text-slate-900"
                      : "border-slate-200 text-slate-700"
                  }`}
                >
                  <span>
                    Version {v.version}
                    <span className="ml-2 text-[11px] font-normal text-slate-400">{shortDate(v.sentAt || v.createdAt)}</span>
                  </span>
                  <span className="font-black tabular-nums text-slate-900">{fullMoney(v.total)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* Sticky Bottom Action Toolbar */}
      {canDecide && !expired ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 px-4 py-3.5 backdrop-blur-xl shadow-lg">
          <div className="mx-auto max-w-lg space-y-2.5">
            <button
              type="button"
              onClick={() => setDialog("accept")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-extrabold text-slate-950 shadow-xs hover:bg-amber-400 active:scale-[0.98] transition-all"
            >
              Accept Quotation & Lock Price <ChevronRight className="h-4 w-4 stroke-[2.5]" />
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDialog("question")}
                className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-100/80 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <MessageCircleQuestion className="h-3.5 w-3.5 stroke-[2.2]" /> Ask
              </button>
              <button
                type="button"
                onClick={() => setDialog("revision")}
                className="rounded-lg border border-slate-200 bg-slate-100/80 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Request Revision
              </button>
              <button
                type="button"
                onClick={() => setDialog("reject")}
                className="rounded-lg border border-slate-200 bg-slate-100/80 py-2.5 text-xs font-extrabold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Action Dialog Modal */}
      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 backdrop-blur-xs sm:items-center sm:justify-center p-0 sm:p-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-3xl border border-slate-200">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-base font-extrabold text-slate-900">
                {dialog === "accept" ? "Accept this Quotation?"
                  : dialog === "reject" ? "Decline Quotation"
                    : dialog === "question" ? "Ask a Question"
                      : "Request Revision"}
              </h3>
              <button type="button" onClick={() => { setDialog(null); setText(""); }} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {dialog === "accept" ? (
              <>
                <p className="text-xs font-medium leading-relaxed text-slate-600">
                  Accepting locks the agreed project price at <strong className="text-slate-900 font-extrabold">{fullMoney(q.total)}</strong> and creates your live project workspace.
                </p>
                {unanswered.length ? (
                  <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 border border-amber-200">
                    You have {unanswered.length} question{unanswered.length === 1 ? "" : "s"} still pending contractor response.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => act(
                    () => constructionApi.acceptQuotation(enquiryId, q._id),
                    "Quotation accepted! Project created.",
                  )}
                  disabled={busy}
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 text-xs font-extrabold text-white shadow-md shadow-amber-500/25 hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  {busy ? "Accepting..." : "Yes, Accept & Proceed"}
                </button>
              </>
            ) : (
              <>
                <p className="mb-3 text-xs font-medium leading-relaxed text-slate-600">
                  {dialog === "reject"
                    ? "Provide a brief reason to help contractors improve future quotes."
                    : dialog === "question"
                      ? "The contractor will receive your question against this quote."
                      : "State what items or pricing you would like revised."}
                </p>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs outline-none focus:border-amber-500 font-medium"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={dialog === "question" ? "e.g. Does the tile rate include labour?" : "Enter details..."}
                />
                <button
                  type="button"
                  disabled={busy || (dialog !== "reject" && !text.trim())}
                  onClick={() => {
                    if (dialog === "reject") {
                      act(() => constructionApi.rejectQuotation(enquiryId, q._id, text), "Quotation declined");
                    } else if (dialog === "question") {
                      act(() => constructionApi.askQuestion(q._id, text), "Question sent to contractor");
                    } else {
                      act(() => constructionApi.requestRevision(q._id, text), "Revision requested from contractor");
                    }
                  }}
                  className="mt-4 w-full rounded-2xl bg-slate-900 py-3.5 text-xs font-extrabold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {busy ? "Sending..." : "Submit"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </ConstructionPageShell>
  );
}

