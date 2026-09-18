import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, FileText, MapPin, Phone, Wrench } from "lucide-react";
import contractorApi from "../services/contractorApi";
import { budgetRange, fullMoney, shortDate, QUOTE_STATUS_LABEL } from "../../shared/format";
import ContractorShell from "../components/ContractorShell";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/**
 * The enquiries this contractor has taken on — their working list.
 *
 * Each row shows the single next action rather than a status soup: no visit yet
 * means book one, visit done and no quote means quote it, quote sent means wait.
 * "Most contractors currently track several projects entirely in their head."
 */
export default function Jobs() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await contractorApi.listJobs();
      setRows(result.rows);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load your jobs"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startQuote = async (enquiryId) => {
    setBusy(enquiryId);
    try {
      const quotation = await contractorApi.createQuotation({ enquiryId });
      navigate(`/contractor/quotations/${quotation._id}`);
    } catch (error) {
      toast.error(errorMessage(error, "Could not start the quotation"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ContractorShell title="Your jobs" subtitle={`${rows.length} taken on`}>
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <Wrench className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">No jobs yet</h2>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">
            Enquiries you take on appear here, with the site details and everything you need
            to quote.
          </p>
          <button
            type="button"
            onClick={() => navigate("/contractor/leads")}
            className="mt-5 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            See new enquiries
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((job) => {
            const e = job.enquiry;
            const q = job.myQuotation;
            const budget = budgetRange({ min: e.budgetMin, max: e.budgetMax });
            return (
              <li key={job.leadId} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-gray-900">
                      {e.serviceId?.name || "Construction work"}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-400">{e.enquiryNumber}</p>
                  </div>
                  {q ? (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                      {QUOTE_STATUS_LABEL[q.status] || q.status}
                    </span>
                  ) : null}
                </div>

                {/* Full address is available now that the lead is accepted. */}
                <div className="mt-2.5 space-y-1 text-[12px] text-gray-600">
                  <p className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span>
                      {[e.site?.addressLine, e.site?.area, e.site?.city].filter(Boolean).join(", ")}
                      {e.site?.landmark ? ` (near ${e.site.landmark})` : ""}
                    </span>
                  </p>
                  {e.customerId?.phone ? (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      <a href={`tel:${e.customerId.phone}`} className="text-orange-600 hover:underline">
                        {e.customerId.name || "Customer"} · {e.customerId.phone}
                      </a>
                    </p>
                  ) : null}
                  {budget ? <p className="pl-5">Budget {budget}</p> : null}
                  <p className="pl-5 text-gray-400">Accepted {shortDate(job.acceptedAt)}</p>
                </div>

                {q ? (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                    <span className="text-[13px] text-gray-600">
                      {q.quotationNumber} · v{q.version}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums text-gray-900">
                      {fullMoney(q.total)}
                    </span>
                  </div>
                ) : null}

                <div className="mt-3.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/contractor/visits?enquiry=${e._id}`)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <CalendarClock className="h-4 w-4" /> Site visit
                  </button>
                  {q ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/contractor/quotations/${q._id}`)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 py-2.5 text-[13px] font-semibold text-white hover:bg-orange-600"
                    >
                      <FileText className="h-4 w-4" /> Open quote
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startQuote(e._id)}
                      disabled={busy === e._id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 py-2.5 text-[13px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                    >
                      <FileText className="h-4 w-4" /> {busy === e._id ? "…" : "Build quote"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ContractorShell>
  );
}
