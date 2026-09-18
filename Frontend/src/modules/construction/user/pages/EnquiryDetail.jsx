import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, BadgeCheck, CalendarClock, Check, ChevronRight, GitCompare,
  MapPin, Star, Users, X, Building2, ShieldCheck, Clock, CheckCircle2,
} from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";
import {
  budgetRange, fullMoney, shortDate, dateTime, relativeDays,
  ENQUIRY_STATUS_LABEL, ENQUIRY_STATUS_TONE,
} from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const VISIT_LABEL = {
  proposed: "Awaiting confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Not attended",
};

function Section({ title, count, children, action }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
          {title}
          {count != null ? <span className="ml-1.5 font-bold text-slate-400">({count})</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * BRD C6, C7, C9, C10, C13 — Customer Enquiry Detail Page.
 * Matched contractors, site visit scheduler, and quote inspector.
 */
export default function EnquiryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [visitFor, setVisitFor] = useState(null);
  const [visitAt, setVisitAt] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await constructionApi.getEnquiry(id));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load this enquiry"));
      navigate("/construction/enquiries", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  /**
   * BRD C6 asks for four things on each contractor card: rating, verification
   * status, specialisation, and how many SIMILAR projects they have completed.
   * The enquiry payload carries the first three; `listEnquiryContractors` adds
   * the similar-project count and the reasons they were matched.
   *
   * This sits with the other hooks, ABOVE the loading early-return. React counts
   * hooks per render: a `useState` below that return runs on the loaded render
   * but not the loading one, and the mismatch crashes the page the moment the
   * fetch resolves.
   *
   * It fails quietly — a card missing its "3 similar jobs" badge is a much
   * smaller problem than a blank screen.
   */
  const [matchInfo, setMatchInfo] = useState({});
  useEffect(() => {
    if (!id) return;
    constructionApi
      .listEnquiryContractors(id)
      .then((r) => {
        const byId = {};
        for (const c of r?.contractors || []) byId[String(c.id)] = c;
        setMatchInfo(byId);
      })
      .catch(() => {});
  }, [id]);

  const proposeVisit = async () => {
    if (!visitAt) { toast.error("Please pick a date and time"); return; }
    setBusy(true);
    try {
      await constructionApi.proposeVisit({
        enquiryId: id,
        contractorId: visitFor._id,
        scheduledAt: new Date(visitAt).toISOString(),
      });
      toast.success("Site visit proposed to contractor");
      setVisitFor(null);
      setVisitAt("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not propose the site visit"));
    } finally {
      setBusy(false);
    }
  };

  const confirmVisit = async (visitId) => {
    setBusy(true);
    try {
      await constructionApi.confirmVisit(visitId);
      toast.success("Site visit confirmed!");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not confirm the visit"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ConstructionPageShell>
        <div className="space-y-4 px-4 py-6">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-32 animate-pulse rounded-3xl bg-slate-200/80" />
          <div className="h-48 animate-pulse rounded-3xl bg-slate-200/80" />
        </div>
      </ConstructionPageShell>
    );
  }

  const { enquiry, siteVisits = [], quotations = [], interestedContractors = [] } = data || {};
  const budget = budgetRange({ min: enquiry?.budgetMin, max: enquiry?.budgetMax });
  const liveQuotes = quotations.filter((q) =>
    ["sent", "under_review", "revision_requested"].includes(q.status));
  const acceptedQuote = quotations.find((q) => q.status === "accepted");

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title={enquiry?.serviceId?.name || "Construction Work"}
        subtitle={`Ref: ${enquiry?.enquiryNumber || ""}`}
        backTo="/construction/enquiries"
      />

      <div className="space-y-6 px-4 py-6">
        {/* Status Header Pill */}
        <div className="flex items-center justify-between gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ring-1 ring-inset ${ENQUIRY_STATUS_TONE[enquiry?.status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
            {ENQUIRY_STATUS_LABEL[enquiry?.status] || enquiry?.status}
          </span>
          <span className="text-xs font-medium text-slate-400">
            Sent {shortDate(enquiry?.createdAt)}
          </span>
        </div>

        {enquiry?.description ? (
          <p className="text-sm font-medium leading-relaxed text-slate-700 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            {enquiry.description}
          </p>
        ) : null}

        {/* Site Details Card */}
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs font-medium text-slate-600 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 stroke-[2.2]" />
            <span className="text-slate-800 font-semibold">
              {[enquiry?.site?.area, enquiry?.site?.city].filter(Boolean).join(", ")}
              {enquiry?.site?.plotArea ? ` · ${enquiry.site.plotArea} ${enquiry.site.areaUnit} plot` : ""}
              {enquiry?.site?.floors != null ? ` · ${enquiry.site.floors} floor(s)` : ""}
            </span>
          </div>
          {budget ? (
            <p className="pl-6.5 text-slate-500">
              Budget Range: <strong className="text-slate-900 font-extrabold">{budget}</strong>
            </p>
          ) : null}
        </div>

        {/* Accepted Quote Banner */}
        {acceptedQuote ? (
          <div className="rounded-xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100/40 p-4.5 shadow-2xs">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 stroke-[2.5]" />
              <p className="text-sm font-extrabold">
                Accepted Quote from {acceptedQuote.contractorId?.businessName}
              </p>
            </div>
            <p className="mt-2 text-xs font-bold text-emerald-900">
              {fullMoney(acceptedQuote.total)} · Quote Ref: {acceptedQuote.quotationNumber}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-emerald-700 font-medium">
              Your project workspace is live under the <strong>Projects</strong> tab to track stage approvals and escrow releases.
            </p>
          </div>
        ) : null}

        {/* Live Received Quotations */}
        {liveQuotes.length ? (
          <Section
            title="Received Quotations"
            count={liveQuotes.length}
            action={liveQuotes.length > 1 ? (
              <button
                type="button"
                onClick={() => navigate(`/construction/enquiries/${id}/compare`)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1 text-xs font-extrabold text-amber-700 hover:bg-amber-500/20 transition-colors"
              >
                <GitCompare className="h-3.5 w-3.5 stroke-[2.5]" /> Compare Quotes Side-by-Side
              </button>
            ) : null}
          >
            <ul className="space-y-2.5">
              {liveQuotes.map((q) => (
                <li key={q._id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/construction/quotations/${q._id}`)}
                    className="group flex w-full items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-2xs hover:border-amber-400/80 transition-all active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-slate-900 group-hover:text-amber-700 transition-colors">
                        {q.contractorId?.businessName}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 font-medium">
                        {q.contractorId?.rating > 0 ? (
                          <span className="inline-flex items-center gap-0.5 font-bold text-amber-700">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {q.contractorId.rating.toFixed(1)}
                          </span>
                        ) : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">New</span>}
                        <span>·</span>
                        <span>v{q.version}</span>
                        {q.validUntil ? <><span>·</span><span className="text-amber-700 font-semibold">Valid {relativeDays(q.validUntil)}</span></> : null}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black tabular-nums text-slate-900">
                        {fullMoney(q.total)}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Incl. Tax</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-amber-600 transition-colors stroke-[2.5]" />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Site Visits */}
        {siteVisits.length ? (
          <Section title="Scheduled Site Visits" count={siteVisits.length}>
            <ul className="space-y-3">
              {siteVisits.map((v) => (
                <li key={v._id} className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-900">
                        {v.contractorId?.businessName}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <CalendarClock className="h-3.5 w-3.5 text-amber-600 stroke-[2.2]" />
                        {dateTime(v.scheduledAt)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ring-inset ${
                      v.status === "completed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : v.status === "confirmed" ? "bg-blue-50 text-blue-700 ring-blue-200"
                          : v.status === "cancelled" ? "bg-slate-100 text-slate-600 ring-slate-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200"}`}
                    >
                      {VISIT_LABEL[v.status] || v.status}
                    </span>
                  </div>

                  {v.status === "proposed" && v.proposedBy === "contractor" ? (
                    <button
                      type="button"
                      onClick={() => confirmVisit(v._id)}
                      disabled={busy}
                      className="w-full rounded-2xl bg-amber-500 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-amber-600 disabled:opacity-50 transition-all"
                    >
                      Confirm Scheduled Visit Time
                    </button>
                  ) : null}
                  {v.status === "proposed" && v.proposedBy === "customer" ? (
                    <p className="text-xs text-slate-500 font-medium">
                      Waiting for the contractor to confirm your proposed visit time.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Matched Contractors */}
        {!acceptedQuote && interestedContractors.length ? (
          <Section title="Interested Verified Contractors" count={interestedContractors.length}>
            <ul className="space-y-3">
              {interestedContractors.map((c) => (
                <li key={c._id} className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-start gap-3">
                    {c.profileImage ? (
                      <img src={c.profileImage} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 font-extrabold">
                        {String(c.businessName || "C").charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/construction/contractors/${c._id}`)}
                        className="flex w-full items-center gap-1.5 text-left"
                      >
                        <span className="truncate text-sm font-extrabold text-slate-900">
                          {c.businessName}
                        </span>
                        {/* BRD C6 — verification status, always shown, not only
                            as a fallback for a missing rating. */}
                        <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-blue-500 text-white" />
                      </button>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-medium">
                        {c.rating > 0 ? (
                          <span className="inline-flex items-center gap-0.5 font-bold text-amber-700">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {c.rating.toFixed(1)} ({c.totalRatings})
                          </span>
                        ) : <span>No ratings yet</span>}
                        {c.yearsExperience ? <span>· {c.yearsExperience} yrs exp</span> : null}
                        {c.completedProjects ? <span>· {c.completedProjects} projects</span> : null}
                      </p>

                      {/* BRD C6 — "how many similar projects they have completed". */}
                      {matchInfo[String(c._id)]?.similarProjectsCompleted > 0 && (
                        <p className="mt-1 inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          {matchInfo[String(c._id)].similarProjectsCompleted} similar job
                          {matchInfo[String(c._id)].similarProjectsCompleted === 1 ? "" : "s"} done
                        </p>
                      )}

                      {c.about ? (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{c.about}</p>
                      ) : null}

                      {/* Transparent matching — why this firm is in front of you. */}
                      {matchInfo[String(c._id)]?.matchReasons?.length > 0 && (
                        <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
                          Matched because: {matchInfo[String(c._id)].matchReasons.join(" · ")}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => navigate(`/construction/contractors/${c._id}`)}
                        className="mt-1.5 text-[11px] font-bold text-amber-700"
                      >
                        See their work and reviews →
                      </button>
                    </div>
                  </div>

                  {!siteVisits.some((v) =>
                    String(v.contractorId?._id) === String(c._id)
                    && ["proposed", "confirmed", "completed"].includes(v.status)) ? (
                      <button
                        type="button"
                        onClick={() => setVisitFor(c)}
                        className="w-full rounded-2xl border border-amber-300/80 bg-amber-50/50 py-2.5 text-xs font-extrabold text-amber-800 hover:bg-amber-100/60 transition-colors"
                      >
                        Book Site Visit
                      </button>
                    ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {!liveQuotes.length && !interestedContractors.length && !acceptedQuote ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-2xs space-y-2">
            <Building2 className="mx-auto h-8 w-8 text-amber-600/70" />
            <p className="text-sm font-extrabold text-slate-900">Matching Contractors in Your Area</p>
            <p className="text-xs leading-relaxed text-slate-500 font-medium">
              We've notified verified contractors in {enquiry?.site?.city || "your location"}. You will be alerted as soon as a contractor reviews your enquiry.
            </p>
          </div>
        ) : null}
      </div>

      {/* Book Site Visit Modal */}
      {visitFor ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 backdrop-blur-xs sm:items-center sm:justify-center p-0 sm:p-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-3xl border border-slate-200">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Schedule Site Visit</h3>
                <p className="mt-0.5 text-xs font-bold text-amber-700">{visitFor.businessName}</p>
              </div>
              <button type="button" onClick={() => setVisitFor(null)} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-slate-600 font-medium">
              A physical site visit lets the contractor record exact measurements & site conditions to produce an accurate, binding quote.
            </p>
            <input
              type="datetime-local"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none focus:border-amber-500 font-medium"
              value={visitAt}
              min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)}
              onChange={(e) => setVisitAt(e.target.value)}
            />
            <button
              type="button"
              onClick={proposeVisit}
              disabled={busy || !visitAt}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 text-xs font-extrabold text-white shadow-md shadow-amber-500/25 hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {busy ? "Proposing Time..." : "Propose Visit Time"}
            </button>
          </div>
        </div>
      ) : null}
    </ConstructionPageShell>
  );
}

