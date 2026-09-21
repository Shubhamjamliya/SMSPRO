import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, ChevronRight, Clock, MapPin, Phone, X } from "lucide-react";
import contractorApi from "../services/contractorApi";
import { fullMoney, hoursLeft, shortDate } from "../../shared/format";
import ContractorShell from "../components/ContractorShell";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const DECLINE_REASONS = [
  { value: "too_far", label: "Too far from me" },
  { value: "no_capacity", label: "No capacity right now" },
  { value: "not_my_type", label: "Not my kind of work" },
  { value: "other", label: "Another reason" },
];

const TABS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Taken by me" },
  { key: "closed", label: "Closed" },
];

/**
 * Which tab a request belongs in, from what the server says about it:
 * still open to me, mine after accepting, or over (taken by someone else,
 * declined, or expired).
 */
const tabOf = (request) => {
  if (request.assignedToMe) return "mine";
  if (request.canRespond) return "open";
  return "closed";
};

/** Where the site visit is, for a request the contractor already has. */
const VISIT_STAGE_LABEL = {
  assigned: { text: "Start journey", tone: "bg-orange-50 text-orange-700" },
  on_the_way: { text: "On the way", tone: "bg-blue-50 text-blue-700" },
  arrived: { text: "Report due", tone: "bg-amber-50 text-amber-700" },
  report_submitted: { text: "Report sent", tone: "bg-emerald-50 text-emerald-700" },
};

const closedReason = (request) => {
  if (request.takenByOther) return "Taken by another contractor";
  if (request.myStatus === "declined") return "You passed on this";
  if (request.myStatus === "expired") return "Expired";
  if (request.myStatus === "withdrawn") return "No longer available";
  return "Closed";
};

/**
 * Paid site-visit requests sent to the contractor because they work near the
 * customer. The customer has already paid the visiting fee, so these are real
 * bookings; the first contractor to accept gets the visit.
 *
 * The customer's name and number are deliberately withheld until the contractor
 * accepts — the server does not send them at all before that.
 */
export default function PackageRequests() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("open");
  const [busy, setBusy] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [declineReason, setDeclineReason] = useState("too_far");
  const [declineNote, setDeclineNote] = useState("");

  const load = useCallback(async () => {
    try {
      const feed = await contractorApi.listPackageRequests({ limit: 50 });
      setRows(feed.rows);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load your requests"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A new offer arrives as a push; opening it should show the request, and an app left
  // open should not sit on a stale list while other contractors race for the same visit.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const counts = useMemo(() => {
    const c = { open: 0, mine: 0, closed: 0 };
    rows.forEach((r) => {
      c[tabOf(r)] += 1;
    });
    return c;
  }, [rows]);

  const visible = useMemo(() => rows.filter((r) => tabOf(r) === tab), [rows, tab]);

  const accept = async (request) => {
    setBusy(request.id);
    try {
      await contractorApi.acceptPackageRequest(request.id);
      toast.success("It's yours — the customer's details are now shown");
      setTab("mine");
      await load();
    } catch (error) {
      // "Another contractor has already taken this request" is the common, expected one.
      toast.error(errorMessage(error, "Could not accept this request"));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    setBusy(declining.id);
    try {
      await contractorApi.declinePackageRequest(declining.id, { reason: declineReason, note: declineNote });
      toast.success("Declined — it will go to other contractors");
      setDeclining(null);
      setDeclineNote("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not decline this request"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ContractorShell title="Site visit requests" subtitle={counts.open ? `${counts.open} waiting` : ""}>
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              tab === t.key
                ? "border-orange-500 bg-orange-50 text-orange-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <Building2 className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">
            {tab === "open" ? "No requests waiting" : tab === "mine" ? "Nothing taken yet" : "Nothing here"}
          </h2>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">
            {tab === "open"
              ? "When a customer near you books a package and pays the visiting fee, it appears here and we'll notify you."
              : tab === "mine"
                ? "Requests you accept, or that the office assigns to you, are kept here with the customer's details."
                : "Requests that were taken by someone else, declined or expired show up here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((request) => {
            const left = hoursLeft(request.expiresAt);
            return (
              <li
                key={request.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/contractor/package-requests/${request.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/contractor/package-requests/${request.id}`);
                }}
                className="cursor-pointer rounded-xl border border-gray-200 p-4 transition-colors hover:border-orange-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-gray-900">{request.package?.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-400">{request.reference}</p>
                  </div>
                  {request.canRespond && left != null ? (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        left <= 6 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      <Clock className="h-3 w-3" />
                      {left === 0 ? "Expiring" : `${left}h left`}
                    </span>
                  ) : request.assignedToMe && VISIT_STAGE_LABEL[request.visitStage] ? (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${VISIT_STAGE_LABEL[request.visitStage].tone}`}
                    >
                      {VISIT_STAGE_LABEL[request.visitStage].text}
                    </span>
                  ) : tab === "closed" ? (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                      {closedReason(request)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    {[request.site?.area, request.site?.city].filter(Boolean).join(", ")}
                  </span>
                  <span>
                    {Number(request.site?.totalBuiltUpArea || 0).toLocaleString("en-IN")} sq.ft
                    {request.site?.floors ? ` · ${request.site.floors} floor${request.site.floors === 1 ? "" : "s"}` : ""}
                  </span>
                  <span className="font-semibold text-gray-800">≈ {fullMoney(request.estimatedCost)}</span>
                  <span>Wants to start: {request.startWindow}</span>
                </div>

                {request.visitingFee > 0 ? (
                  <p className="mt-2 text-[12px] text-emerald-700">
                    Customer has paid a {fullMoney(request.visitingFee)} visiting fee.
                  </p>
                ) : null}

                {request.notes ? (
                  <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-gray-600">{request.notes}</p>
                ) : null}

                {request.assignedToMe && request.customer ? (
                  <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2.5">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-emerald-800">Customer</p>
                    <p className="mt-0.5 text-[14px] font-semibold text-gray-900">{request.customer.name}</p>
                    <a
                      href={`tel:${request.customer.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-orange-600"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {request.customer.phone}
                    </a>
                  </div>
                ) : request.canRespond ? (
                  <p className="mt-2 text-[11px] text-gray-400">
                    Sent {shortDate(request.offeredAt)} · the customer's name and number are shown once you accept
                  </p>
                ) : null}

                {request.canRespond ? (
                  <div className="mt-3.5 flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        accept(request);
                      }}
                      disabled={busy === request.id}
                      className="flex-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                    >
                      {busy === request.id ? "…" : "Take this visit"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeclining(request);
                      }}
                      disabled={busy === request.id}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Pass
                    </button>
                  </div>
                ) : null}

                {request.assignedToMe ? (
                  <p className="mt-3 flex items-center justify-end gap-0.5 text-[13px] font-semibold text-orange-600">
                    Open booking <ChevronRight className="h-4 w-4" />
                  </p>
                ) : null}
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
                <h3 className="text-base font-bold text-gray-900">Pass on this request?</h3>
                <p className="mt-0.5 text-[13px] text-gray-500">It goes to other contractors near the customer.</p>
              </div>
              <button
                type="button"
                onClick={() => setDeclining(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
                aria-label="Close"
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
