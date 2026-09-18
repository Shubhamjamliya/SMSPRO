import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Minus, Star, ChevronRight, AlertCircle, Building2 } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader, EmptyState } from "../components/ui";
import { fullMoney, shortMoney, relativeDays } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/**
 * BRD C11 — Side-by-Side Quotation Comparison Matrix.
 */
export default function CompareQuotes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .compareQuotations(id)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => {
        if (!cancelled) {
          toast.error(errorMessage(e, "Could not load the comparison"));
          navigate(`/construction/enquiries/${id}`, { replace: true });
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, navigate]);

  if (loading) {
    return (
      <ConstructionPageShell>
        <div className="space-y-4 px-4 py-6">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-72 animate-pulse rounded-xl bg-slate-200/80" />
        </div>
      </ConstructionPageShell>
    );
  }

  const { quotations = [], sections = [], cheapestId } = data || {};

  if (quotations.length < 2) {
    return (
      <ConstructionPageShell>
        <ConstructionPageHeader
          title="Compare Quotations"
          subtitle="Side-by-side bid comparison"
          backTo={`/construction/enquiries/${id}`}
        />
        <div className="px-4 py-8">
          <EmptyState
            icon={AlertCircle}
            title="At Least 2 Quotes Needed to Compare"
            detail="Once you receive multiple contractor bids on this enquiry, this view will show an itemised comparison."
            action={
              <button
                type="button"
                onClick={() => navigate(`/construction/enquiries/${id}`)}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800 transition-colors"
              >
                Back to Enquiry
              </button>
            }
          />
        </div>
      </ConstructionPageShell>
    );
  }

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title="Compare Quotations"
        subtitle={`${quotations.length} competing contractor bids`}
        backTo={`/construction/enquiries/${id}`}
      />

      <div className="space-y-4 px-4 py-6">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <table className="w-full min-w-[540px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white pb-3 pr-3 text-left align-bottom border-b border-slate-200">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Contractor / Spec
                  </span>
                </th>
                {quotations.map((q) => (
                  <th key={q._id} className="min-w-[160px] px-3 pb-3 text-left align-bottom border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => navigate(`/construction/quotations/${q._id}`)}
                      className="w-full text-left group"
                    >
                      <p className="truncate text-xs font-extrabold text-slate-900 group-hover:text-amber-600 transition-colors">
                        {q.contractorId?.businessName}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                        {q.contractorId?.rating > 0 ? (
                          <span className="inline-flex items-center gap-0.5 font-bold text-amber-700">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {q.contractorId.rating.toFixed(1)}
                          </span>
                        ) : "New"}
                        {q.contractorId?.completedProjects
                          ? ` · ${q.contractorId.completedProjects} done` : ""}
                      </p>
                      {String(q._id) === String(cheapestId) ? (
                        <span className="mt-1.5 inline-block rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                          Lowest Price
                        </span>
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Total Price Row */}
              <tr>
                <td className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50/90 py-3 pr-3 text-xs font-black uppercase tracking-wider text-slate-700">
                  Total Quote Value
                </td>
                {quotations.map((q) => (
                  <td key={q._id} className="border-b border-slate-200 bg-slate-50/90 px-3 py-3">
                    <span className="text-base font-black tabular-nums text-slate-900">
                      {fullMoney(q.total)}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Sections Breakdown */}
              {sections.map((section) => (
                <tr key={section.name}>
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white py-3 pr-3 text-xs font-bold text-slate-800">
                    {section.name}
                  </td>
                  {section.byQuotation.map((cell) => (
                    <td key={cell.quotationId} className="border-b border-slate-100 px-3 py-3 font-medium">
                      {cell.subtotal == null ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                          <Minus className="h-3 w-3 stroke-[2.5]" /> Not Quoted
                        </span>
                      ) : (
                        <span className="text-xs tabular-nums text-slate-800 font-extrabold">
                          {shortMoney(cell.subtotal)}
                          <span className="ml-1 text-[10px] font-normal text-slate-400">({cell.itemCount} items)</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Stage Count Row */}
              <tr>
                <td className="sticky left-0 z-10 border-b border-slate-100 bg-white py-3 pr-3 text-xs font-bold text-slate-700">
                  Milestone Stages
                </td>
                {quotations.map((q) => (
                  <td key={q._id} className="border-b border-slate-100 px-3 py-3 text-xs font-semibold text-slate-800">
                    {q.proposedStages?.length ? `${q.proposedStages.length} Stages` : "—"}
                  </td>
                ))}
              </tr>

              {/* Validity Row */}
              <tr>
                <td className="sticky left-0 z-10 border-b border-slate-100 bg-white py-3 pr-3 text-xs font-bold text-slate-700">
                  Quote Validity
                </td>
                {quotations.map((q) => (
                  <td key={q._id} className="border-b border-slate-100 px-3 py-3 text-xs font-semibold text-slate-600">
                    {q.validUntil ? relativeDays(q.validUntil) : "—"}
                  </td>
                ))}
              </tr>

              {/* View Buttons Row */}
              <tr>
                <td className="sticky left-0 z-10 bg-white py-3 pr-3" />
                {quotations.map((q) => (
                  <td key={q._id} className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/construction/quotations/${q._id}`)}
                      className="w-full rounded-xl border border-amber-400/80 bg-amber-50/50 py-2 text-xs font-extrabold text-amber-800 hover:bg-amber-100/60 transition-colors"
                    >
                      Inspect Quote
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 text-xs leading-relaxed text-amber-900 font-medium">
          <strong>Tip:</strong> The lowest total quote value is not always the best overall deal — review what each contractor has <strong className="font-extrabold">Excluded</strong> before accepting.
        </div>
      </div>
    </ConstructionPageShell>
  );
}

