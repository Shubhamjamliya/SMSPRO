import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, FileSignature, GitCompare, Star, ChevronRight } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader, EmptyState } from "../components/ui";
import { fullMoney, shortDate, relativeDays, QUOTE_STATUS_LABEL } from "../../shared/format";

/**
 * BRD C10 — Customer Quotes Hub Page.
 */
export default function MyQuotes() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  // Contracts the office sent after a site visit: the quotation for a package booking.
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("live");

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([constructionApi.listQuotations(), constructionApi.listMySiteVisits()])
      .then(([enquiryQuotes, siteVisits]) => {
        if (cancelled) return;
        if (enquiryQuotes.status === "fulfilled") setQuotes(enquiryQuotes.value || []);
        else setError(enquiryQuotes.reason?.response?.data?.message || "Could not load your quotes");
        if (siteVisits.status === "fulfilled") {
          setContracts((siteVisits.value || []).filter((v) => v.contract));
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const LIVE = ["sent", "under_review", "revision_requested"];

  const filtered = useMemo(() => {
    if (filter === "live") return quotes.filter((q) => LIVE.includes(q.status));
    if (filter === "accepted") return quotes.filter((q) => q.status === "accepted");
    return quotes;
  }, [quotes, filter]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const q of filtered) {
      const enquiry = q.enquiryId;
      const key = String(enquiry?._id || enquiry || "unknown");
      if (!map.has(key)) map.set(key, { key, enquiry, quotes: [] });
      map.get(key).quotes.push(q);
    }
    return [...map.values()];
  }, [filtered]);

  // A contract still waiting on the customer, unless its offer has lapsed.
  const contractIsLive = (v) => v.contract.status === "sent" && !v.contract.expired;

  const filteredContracts = useMemo(() => {
    if (filter === "live") return contracts.filter(contractIsLive);
    if (filter === "accepted") return contracts.filter((v) => v.contract.status === "accepted");
    return contracts;
  }, [contracts, filter]);

  const liveCount =
    quotes.filter((q) => LIVE.includes(q.status)).length + contracts.filter(contractIsLive).length;
  const totalCount = quotes.length + contracts.length;

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title="My Quotations"
        subtitle={
          loading
            ? "Loading…"
            : liveCount
              ? `${liveCount} quote${liveCount === 1 ? "" : "s"} awaiting your decision`
              : `${totalCount} total quotes received`
        }
        backTo="/construction"
      />

      <div className="space-y-4 px-4 py-6">
        {/* Filter Pills */}
        <div className="flex gap-2 p-1 bg-slate-200/60 rounded-2xl w-fit">
          {[
            ["live", "Waiting on you"],
            ["accepted", "Accepted"],
            ["all", "All Quotes"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-all ${
                filter === value
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</p>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-200/80" />
            ))}
          </div>
        ) : groups.length === 0 && filteredContracts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={filter === "live" ? "No Quotes Pending" : "No Quotations Received"}
            detail={
              totalCount === 0
                ? "Submit an enquiry for your project to receive written, itemised quotes from verified contractors."
                : "No quotes matched the selected filter."
            }
            action={
              totalCount === 0 ? (
                <button
                  type="button"
                  onClick={() => navigate("/construction")}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800 transition-colors"
                >
                  Browse Services
                </button>
              ) : null
            }
          />
        ) : (
          <ul className="space-y-3">
            {filteredContracts.map((v) => {
              const c = v.contract;
              const live = contractIsLive(v);
              const statusText = c.expired
                ? "Expired"
                : { sent: "Awaiting your answer", accepted: "Accepted", rejected: "Declined" }[c.status] || c.status;
              return (
                <li key={`contract-${v.id}`}>
                  <button
                    type="button"
                    onClick={() => navigate(`/construction/quotations/visit/${v.id}`)}
                    className={`group flex w-full items-center gap-3.5 rounded-xl border bg-white p-4 text-left shadow-2xs transition-all hover:border-amber-400/80 active:scale-[0.99] ${
                      live ? "border-amber-300" : "border-slate-200"
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                      <FileSignature className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate-900 group-hover:text-amber-700 transition-colors">
                        {v.package?.name} · site visit contract
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">
                        {c.number} · {v.site?.city}
                        {c.sentAt ? ` · Sent ${shortDate(c.sentAt)}` : ""}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-medium">
                        <span className={`font-bold ${live ? "text-amber-700" : c.status === "accepted" ? "text-emerald-700" : "text-slate-600"}`}>
                          {statusText}
                        </span>
                        {live && c.validUntil ? (
                          <span className="font-semibold text-amber-700">· Valid until {shortDate(c.validUntil)}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-black tabular-nums text-slate-900">{fullMoney(c.price)}</span>
                      <ChevronRight className="ml-auto mt-0.5 h-4 w-4 text-slate-400 group-hover:text-amber-600" />
                    </span>
                  </button>
                </li>
              );
            })}
            {groups.map((group) => {
              const liveInGroup = group.quotes.filter((q) => LIVE.includes(q.status));
              const canCompare = liveInGroup.length > 1 && group.enquiry?._id;
              const cheapest = liveInGroup.length
                ? Math.min(...liveInGroup.map((q) => Number(q.total) || Infinity))
                : null;

              return (
                <li key={group.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        {group.enquiry?.serviceId?.name || "Enquiry Work"}
                      </p>
                      <p className="truncate text-[11px] font-medium text-slate-500">
                        Ref: {group.enquiry?.enquiryNumber}
                        {group.enquiry?.site?.city ? ` · ${group.enquiry.site.city}` : ""}
                        {` · ${group.quotes.length} quote${group.quotes.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    {canCompare && (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/construction/enquiries/${group.enquiry._id}/compare`)
                        }
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-1.5 text-xs font-extrabold text-amber-700 hover:bg-amber-500/20 transition-colors"
                      >
                        <GitCompare className="h-3.5 w-3.5 stroke-[2.5]" /> Compare Side-by-Side
                      </button>
                    )}
                  </div>

                  <ul className="space-y-2.5">
                    {group.quotes.map((q) => {
                      const total = Number(q.total) || 0;
                      const isLowest =
                        cheapest != null && total === cheapest && liveInGroup.length > 1;
                      const validUntil = q.validUntil ? new Date(q.validUntil) : null;
                      const showExpiry = LIVE.includes(q.status) && validUntil;
                      const stillValid = validUntil && validUntil.getTime() > Date.now();

                      return (
                        <li key={q._id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/construction/quotations/${q._id}`)}
                            className="group flex w-full items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-left transition-all hover:border-amber-400/60 hover:bg-white active:scale-[0.99]"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-extrabold text-slate-900 group-hover:text-amber-700 transition-colors">
                                  {q.contractorId?.businessName || "Contractor"}
                                </span>
                                {Number(q.contractorId?.rating) > 0 && (
                                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-amber-700">
                                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                    {Number(q.contractorId.rating).toFixed(1)}
                                  </span>
                                )}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-medium text-slate-500">
                                <span className="font-bold text-slate-700">{QUOTE_STATUS_LABEL[q.status] || q.status}</span>
                                {q.version > 1 && <span>· v{q.version}</span>}
                                {showExpiry && (
                                  <span className={stillValid ? "text-amber-700 font-semibold" : "text-rose-600 font-bold"}>
                                    · {stillValid ? "Expires" : "Expired"}{" "}
                                    {relativeDays(q.validUntil)}
                                  </span>
                                )}
                                {!showExpiry && q.sentAt && (
                                  <span>· Sent {shortDate(q.sentAt)}</span>
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block text-sm font-black tabular-nums text-slate-900">
                                {fullMoney(total)}
                              </span>
                              {isLowest && (
                                <span className="mt-0.5 inline-block rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                                  Lowest
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ConstructionPageShell>
  );
}

