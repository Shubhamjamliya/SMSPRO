import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, FileText, HardHat, Building2 } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader, EmptyState } from "../components/ui";
import {
  budgetRange, shortDate, ENQUIRY_STATUS_LABEL, ENQUIRY_STATUS_TONE,
} from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/**
 * BRD C5 — Customer Enquiries List Page.
 */
export default function MyEnquiries() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .listEnquiries()
      .then((r) => { if (!cancelled) setRows(r.rows || []); })
      .catch((e) => { if (!cancelled) toast.error(errorMessage(e, "Could not load your enquiries")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title="My Enquiries"
        subtitle={loading ? "Loading…" : `${rows.length} total enquiries`}
        backTo="/construction"
        right={
          <button
            type="button"
            onClick={() => navigate("/construction/projects")}
            className="rounded-xl bg-amber-500/10 px-3 py-1.5 text-xs font-extrabold text-amber-700 hover:bg-amber-500/20 transition-colors"
          >
            My Projects
          </button>
        }
      />

      <div className="px-4 py-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/80" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No Enquiries Submitted Yet"
            detail="Browse construction & interior services to submit your first enquiry. It's 100% free with no obligation."
            action={
              <button
                type="button"
                onClick={() => navigate("/construction")}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800 transition-colors"
              >
                Browse Services
              </button>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {rows.map((e) => {
              const budget = budgetRange({ min: e.budgetMin, max: e.budgetMax });
              return (
                <li key={e._id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/construction/enquiries/${e._id}`)}
                    className="group flex w-full items-start gap-3.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-2xs hover:border-amber-400/80 transition-all active:scale-[0.99]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200 group-hover:scale-105 transition-transform">
                      <Building2 className="h-5 w-5 stroke-[2]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-extrabold text-slate-900 group-hover:text-amber-700 transition-colors">
                          {e.serviceId?.name || "Construction Work"}
                        </p>
                        <span className="font-mono text-[11px] font-bold text-slate-400">
                          {e.enquiryNumber}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ring-1 ring-inset ${ENQUIRY_STATUS_TONE[e.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                          {ENQUIRY_STATUS_LABEL[e.status] || e.status}
                        </span>
                        {e.pendingQuoteCount > 0 ? (
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700 ring-1 ring-emerald-500/20">
                            {e.pendingQuoteCount} quote{e.pendingQuoteCount === 1 ? "" : "s"} ready
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs font-medium text-slate-500">
                        {e.site?.city}
                        {budget ? ` · ${budget}` : ""}
                        {` · ${shortDate(e.createdAt)}`}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-amber-600 transition-colors stroke-[2.5]" />
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

