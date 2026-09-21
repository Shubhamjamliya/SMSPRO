import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, ClipboardList, MapPin } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader, EmptyState } from "../components/ui";
import { fullMoney, shortDate, siteVisitStatus } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/** Every package the customer has booked a site visit for, newest first. */
export default function MySiteVisits() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .listMySiteVisits()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => { if (!cancelled) toast.error(errorMessage(e, "Could not load your site visits")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title="My Site Visits"
        subtitle={loading ? "Loading…" : `${rows.length} booking${rows.length === 1 ? "" : "s"}`}
        backTo="/construction"
      />
      <div className="px-4 py-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/80" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No site visits yet"
            detail="Choose a residential or commercial package and book a site visit. You can follow it here."
            action={
              <button
                type="button"
                onClick={() => navigate("/construction")}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white"
              >
                Browse packages
              </button>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const status = siteVisitStatus(r);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/construction/site-visits/${r.id}`)}
                    className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-2xs transition-all hover:border-amber-400/80 active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-extrabold text-slate-900">{r.package?.name}</p>
                        <span className="font-mono text-[11px] font-bold text-slate-400">{r.reference}</span>
                      </div>
                      <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${status.tone}`}>
                        {status.text}
                      </span>
                      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-500">
                        <MapPin className="h-3 w-3" />
                        {r.site?.city} · ≈ {fullMoney(r.estimatedCost)} · {shortDate(r.createdAt)}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-amber-600" />
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
