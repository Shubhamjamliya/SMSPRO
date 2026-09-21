import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, ClipboardList, FileText, Building2, MapPin } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader, EmptyState } from "../components/ui";
import {
  budgetRange, fullMoney, shortDate, siteVisitStatus, ENQUIRY_STATUS_LABEL, ENQUIRY_STATUS_TONE,
} from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/**
 * BRD C5 — the customer's construction requests in one place: the enquiries they
 * raised, and the package site visits they booked (with the contractor, OTP and
 * contract that follow). `?tab=visits` opens the site-visit list directly.
 */
export default function MyEnquiries() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const tab = searchParams.get("tab") === "visits" ? "visits" : "enquiries";
  const setTab = (next) => setSearchParams(next === "visits" ? { tab: "visits" } : {}, { replace: true });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([constructionApi.listEnquiries(), constructionApi.listMySiteVisits()])
      .then(([enquiries, siteVisits]) => {
        if (cancelled) return;
        const enquiryRows = enquiries.status === "fulfilled" ? enquiries.value.rows || [] : [];
        const visitRows = siteVisits.status === "fulfilled" ? siteVisits.value || [] : [];
        if (enquiries.status === "rejected") toast.error(errorMessage(enquiries.reason, "Could not load your enquiries"));
        if (siteVisits.status === "rejected") toast.error(errorMessage(siteVisits.reason, "Could not load your site visits"));
        setRows(enquiryRows);
        setVisits(visitRows);
        // Someone who has only booked site visits should not land on an empty enquiries list.
        if (!enquiryRows.length && visitRows.length && !searchParams.get("tab")) {
          setSearchParams({ tab: "visits" }, { replace: true });
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabClass = (active) =>
    `flex-1 rounded-lg py-2 text-xs font-extrabold transition-colors ${
      active ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title="My Enquiries"
        subtitle={loading ? "Loading…" : `${rows.length} enquiries · ${visits.length} site visits`}
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
        <div className="mb-4 flex gap-1 rounded-xl bg-slate-200/70 p-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "enquiries"} onClick={() => setTab("enquiries")} className={tabClass(tab === "enquiries")}>
            Enquiries ({loading ? "…" : rows.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === "visits"} onClick={() => setTab("visits")} className={tabClass(tab === "visits")}>
            Site Visits ({loading ? "…" : visits.length})
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/80" />
            ))}
          </div>
        ) : tab === "visits" ? (
          visits.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No Site Visits Yet"
              detail="Choose a residential or commercial package and book a site visit. You can follow the contractor, OTP and contract here."
              action={
                <button
                  type="button"
                  onClick={() => navigate("/construction")}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800 transition-colors"
                >
                  Browse Packages
                </button>
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {visits.map((v) => {
                const status = siteVisitStatus(v);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/construction/site-visits/${v.id}`)}
                      className="group flex w-full items-start gap-3.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-2xs hover:border-amber-400/80 transition-all active:scale-[0.99]"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200 group-hover:scale-105 transition-transform">
                        <ClipboardList className="h-5 w-5 stroke-2" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-extrabold text-slate-900 group-hover:text-amber-700 transition-colors">
                            {v.package?.name}
                          </p>
                          <span className="font-mono text-[11px] font-bold text-slate-400">{v.reference}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${status.tone}`}>
                            {status.text}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-extrabold capitalize text-slate-600">
                            {v.package?.segment}
                          </span>
                        </div>
                        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-500">
                          <MapPin className="h-3 w-3" />
                          {v.site?.city} · ≈ {fullMoney(v.estimatedCost)} · {shortDate(v.createdAt)}
                        </p>
                        {v.contractor ? (
                          <p className="mt-1 text-xs font-medium text-slate-500">Contractor: {v.contractor.name}</p>
                        ) : null}
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-amber-600 transition-colors stroke-[2.5]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )
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
                      <Building2 className="h-5 w-5 stroke-2" />
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
