import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BookmarkPlus, ChevronRight, FileText, Trash2 } from "lucide-react";
import contractorApi from "../services/contractorApi";
import { fullMoney, shortDate, QUOTE_STATUS_LABEL } from "../../shared/format";
import ContractorShell from "../components/ContractorShell";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const STATUS_TONE = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-50 text-blue-700",
  under_review: "bg-blue-50 text-blue-700",
  revision_requested: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-gray-100 text-gray-600",
  withdrawn: "bg-gray-100 text-gray-600",
  superseded: "bg-gray-100 text-gray-500",
};

/** The contractor's quotations, plus their saved templates (BRD W13). */
export default function Quotations() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("quotes");
  const [quotations, setQuotations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [q, t] = await Promise.all([
        contractorApi.listQuotations(),
        contractorApi.listTemplates().catch(() => []),
      ]);
      setQuotations(q);
      setTemplates(t);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load your quotations"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeTemplate = async (id) => {
    try {
      await contractorApi.deleteTemplate(id);
      toast.success("Template removed");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not remove the template"));
    }
  };

  return (
    <ContractorShell title="Quotations" subtitle={`${quotations.length} total`}>
      <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
        {[["quotes", `Quotations (${quotations.length})`], ["templates", `Templates (${templates.length})`]]
          .map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors ${
                tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {label}
            </button>
          ))}
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : tab === "quotes" ? (
        quotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              <FileText className="h-7 w-7" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">No quotations yet</h2>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">
              Take on an enquiry, visit the site, then build a proper itemised quote.
            </p>
            <button
              type="button"
              onClick={() => navigate("/contractor/jobs")}
              className="mt-5 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Go to your jobs
            </button>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {quotations.map((q) => (
              <li key={q._id}>
                <button
                  type="button"
                  onClick={() => navigate(`/contractor/quotations/${q._id}`)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3.5 text-left hover:border-gray-300 hover:bg-gray-50/70"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {q.enquiryId?.serviceId?.name || q.title || "Quotation"}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                      {q.quotationNumber} · v{q.version}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[q.status] || "bg-gray-100 text-gray-600"}`}>
                        {QUOTE_STATUS_LABEL[q.status] || q.status}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {q.enquiryId?.site?.city} · {shortDate(q.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-gray-900">
                      {fullMoney(q.total)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <BookmarkPlus className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">No templates saved</h2>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">
            Save a finished quote as a template and a similar job takes minutes to price
            instead of hours.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {templates.map((t) => (
            <li key={t._id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{t.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t.sections?.length || 0} section(s)
                  {t.proposedStages?.length ? ` · ${t.proposedStages.length} stages` : ""}
                  {t.useCount ? ` · used ${t.useCount}×` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeTemplate(t._id)}
                className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove template"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </ContractorShell>
  );
}
