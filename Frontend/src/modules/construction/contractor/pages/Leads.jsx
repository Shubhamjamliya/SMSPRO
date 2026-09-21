import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Clock, Inbox, MapPin, X } from "lucide-react";
import contractorApi from "../services/contractorApi";
import { budgetRange, shortDate, hoursLeft } from "../../shared/format";
import ContractorShell from "../components/ContractorShell";
import usePackageVisitCount from "../utils/usePackageVisitCount";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const DECLINE_REASONS = [
  { value: "too_far", label: "Too far from me" },
  { value: "outside_my_trade", label: "Not my kind of work" },
  { value: "too_small", label: "Too small" },
  { value: "too_large", label: "Too large" },
  { value: "no_capacity", label: "No capacity right now" },
  { value: "budget_unrealistic", label: "Budget is unrealistic" },
  { value: "other", label: "Another reason" },
];

const URGENCY_LABEL = {
  flexible: "Flexible",
  within_month: "Within a month",
  within_week: "Within a week",
  immediate: "Urgent",
};

/**
 * BRD W6 / W7 — the contractor's enquiry feed.
 *
 * "A steady flow of genuine leads is the single biggest reason a contractor
 * joins." Each card shows enough to judge the job — trade, area, size, budget,
 * urgency — plus why it was matched and how long is left to answer, because
 * "a fast decline is far better for the customer than a slow non-answer".
 */
export default function Leads() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [declineReason, setDeclineReason] = useState("too_far");
  const [declineNote, setDeclineNote] = useState("");
  const waitingVisits = usePackageVisitCount();

  const load = useCallback(async () => {
    try {
      const [feed, s] = await Promise.all([
        contractorApi.listLeads({ status: "offered" }),
        contractorApi.leadStats().catch(() => null),
      ]);
      setRows(feed.rows);
      if (s) setStats(s);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load your enquiries"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const accept = async (lead) => {
    setBusy(lead.id);
    try {
      await contractorApi.acceptLead(lead.id);
      toast.success("Enquiry accepted — you can now arrange a site visit");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not accept this enquiry"));
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    setBusy(declining.id);
    try {
      await contractorApi.declineLead(declining.id, { reason: declineReason, note: declineNote });
      toast.success("Declined — it will go to another contractor");
      setDeclining(null);
      setDeclineNote("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not decline this enquiry"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ContractorShell title="New enquiries" subtitle={stats ? `${stats.newLeads} waiting` : ""}>
      {waitingVisits > 0 ? (
        <button
          type="button"
          onClick={() => navigate("/contractor/package-requests")}
          className="mb-4 w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left"
        >
          <span className="block text-[14px] font-semibold text-orange-900">
            {waitingVisits === 1 ? "1 paid site visit is waiting" : `${waitingVisits} paid site visits are waiting`}
          </span>
          <span className="mt-0.5 block text-[12px] text-orange-800">
            Package bookings near you — the first contractor to accept gets the visit. Tap to view.
          </span>
        </button>
      ) : null}

      {stats ? (
        <div className="mb-5 grid grid-cols-3 gap-2.5">
          {[
            ["New", stats.newLeads, "bg-orange-50 text-orange-700"],
            ["Taken on", stats.accepted, "bg-emerald-50 text-emerald-700"],
            ["Live projects", `${stats.liveProjects}`, "bg-blue-50 text-blue-700"],
          ].map(([label, value, tone]) => (
            <div key={label} className={`rounded-xl px-3 py-2.5 ${tone}`}>
              <p className="text-xl font-bold tabular-nums">{value}</p>
              <p className="mt-0.5 text-[11px] font-medium">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <Inbox className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">No new enquiries</h2>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">
            We'll notify you as soon as an enquiry matches your trades and areas.
          </p>
          <button
            type="button"
            onClick={() => navigate("/contractor/jobs")}
            className="mt-5 rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            View your jobs
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((lead) => {
            const e = lead.enquiry;
            const budget = budgetRange({ min: e.budgetMin, max: e.budgetMax });
            const left = hoursLeft(lead.expiresAt);
            return (
              <li key={lead.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-gray-900">{e.service}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-400">{e.enquiryNumber}</p>
                  </div>
                  {left != null ? (
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      left <= 6 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      <Clock className="h-3 w-3" />
                      {left === 0 ? "Expiring" : `${left}h left`}
                    </span>
                  ) : null}
                </div>

                {e.description ? (
                  <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-gray-600">
                    {e.description}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    {[e.site?.area, e.site?.city].filter(Boolean).join(", ")}
                  </span>
                  {e.site?.plotArea ? (
                    <span>{e.site.plotArea} {e.site.areaUnit} plot</span>
                  ) : null}
                  {e.site?.floors != null ? <span>{e.site.floors} floor(s)</span> : null}
                  {budget ? <span className="font-semibold text-gray-800">{budget}</span> : null}
                  <span>{URGENCY_LABEL[e.urgency] || e.urgency}</span>
                  {e.attachmentCount ? <span>{e.attachmentCount} photo(s)</span> : null}
                </div>

                {/* Transparency about the match — the contractor can see why it reached them. */}
                {lead.matchReasons?.length ? (
                  <p className="mt-2.5 text-[11px] leading-relaxed text-gray-400">
                    Matched because: {lead.matchReasons.join(" · ")}
                  </p>
                ) : null}

                <p className="mt-2 text-[11px] text-gray-400">
                  Sent {shortDate(e.createdAt)} · full address shared once you accept
                </p>

                <div className="mt-3.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => accept(lead)}
                    disabled={busy === lead.id}
                    className="flex-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    {busy === lead.id ? "…" : "Take it on"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeclining(lead)}
                    disabled={busy === lead.id}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Pass
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {declining ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-sm sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">Pass on this enquiry?</h3>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  It goes to another contractor straight away.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeclining(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              {DECLINE_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setDeclineReason(r.value)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                    declineReason === r.value
                      ? "border-orange-500 bg-orange-50 text-orange-800"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {declineReason === "other" ? (
              <textarea
                rows={2}
                className="mt-2.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[14px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                placeholder="Tell us why (optional)"
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
              />
            ) : null}

            <button
              type="button"
              onClick={decline}
              disabled={Boolean(busy)}
              className="mt-3 w-full rounded-xl bg-gray-900 py-3 text-[15px] font-semibold text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {busy ? "…" : "Confirm"}
            </button>
          </div>
        </div>
      ) : null}
    </ContractorShell>
  );
}
