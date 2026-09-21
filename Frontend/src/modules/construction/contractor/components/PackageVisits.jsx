import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, ChevronDown, ChevronRight, MapPin, Navigation, Phone } from "lucide-react";
import contractorApi from "../services/contractorApi";
import { dateTime, fullMoney, shortMoney } from "../../shared/format";
import ContractorShell from "./ContractorShell";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const yesNo = (v) => (v === true ? "Yes" : v === false ? "No" : "—");

/** Where a visit stands, in the contractor's words. */
const STAGE = {
  assigned: { label: "Start journey", tone: "bg-orange-50 text-orange-700 ring-orange-200" },
  on_the_way: { label: "On the way", tone: "bg-blue-50 text-blue-700 ring-blue-200" },
  arrived: { label: "Report due", tone: "bg-amber-50 text-amber-700 ring-amber-200" },
  report_submitted: { label: "Completed", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

const QUOTE = {
  sent: { label: "Quotation sent", tone: "text-blue-700" },
  accepted: { label: "Quotation accepted", tone: "text-emerald-700" },
  rejected: { label: "Quotation declined", tone: "text-red-600" },
};

const TABS = [
  { key: "active", label: "Assigned" },
  { key: "done", label: "Completed" },
  { key: "all", label: "All" },
];

const isDone = (v) => v.visit?.stage === "report_submitted";

/**
 * The contractor's package site visits — every request assigned to them, in progress and finished.
 *
 * Each card carries the whole record: the customer and the exact place, the booking's figures, the
 * timeline (assigned → journey → arrival confirmed → report → quotation), and the site report they
 * sent, with its photos. Nothing here needs a second screen to see; "Open booking" is only for
 * doing the next step on one that is still in progress.
 */
export default function PackageVisits({ switcher }) {
  const navigate = useNavigate();
  const [visits, setVisits] = useState(null);
  const [tab, setTab] = useState("active");
  const [open, setOpen] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      setVisits(await contractorApi.listPackageVisits());
    } catch (error) {
      toast.error(errorMessage(error, "Could not load your site visits"));
      setVisits((current) => current || []);
    }
  }, []);

  useEffect(() => {
    load();
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = setInterval(refresh, 45000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const counts = useMemo(() => {
    const list = visits || [];
    return {
      active: list.filter((v) => !isDone(v)).length,
      done: list.filter(isDone).length,
      all: list.length,
    };
  }, [visits]);

  const won = useMemo(
    () => (visits || []).filter((v) => v.contract?.status === "accepted").reduce((s, v) => s + (v.contract.price || 0), 0),
    [visits],
  );

  const shown = useMemo(() => {
    const list = visits || [];
    if (tab === "active") return list.filter((v) => !isDone(v));
    if (tab === "done") return list.filter(isDone);
    return list;
  }, [visits, tab]);

  const toggle = (id) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ContractorShell title="Site visits" subtitle={visits ? `${counts.active} assigned · ${counts.done} completed` : ""}>
      {switcher}

      {/* Headline numbers */}
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <Tile label="Assigned" value={visits ? counts.active : "…"} tone="bg-orange-50 text-orange-900 ring-orange-200" />
        <Tile label="Completed" value={visits ? counts.done : "…"} tone="bg-emerald-50 text-emerald-900 ring-emerald-200" />
        <Tile label="Quotes won" value={visits ? shortMoney(won) : "…"} tone="bg-violet-50 text-violet-900 ring-violet-200" />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              tab === t.key ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {visits === null ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <Building2 className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">
            {tab === "done" ? "No completed visits yet" : tab === "active" ? "No visits assigned right now" : "No site visits yet"}
          </h2>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">
            Paid site visits you accept, or that the office assigns to you, appear here with everything about them.
          </p>
          <button
            type="button"
            onClick={() => navigate("/contractor/package-requests")}
            className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            See open requests
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((v) => (
            <VisitCard
              key={v.id}
              visit={v}
              expanded={open.has(v.id)}
              onToggle={() => toggle(v.id)}
              onOpen={() => navigate(`/contractor/package-requests/${v.id}`)}
            />
          ))}
        </ul>
      )}
    </ContractorShell>
  );
}

function Tile({ label, value, tone }) {
  return (
    <div className={`rounded-xl px-3 py-3 ring-1 ring-inset ${tone}`}>
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
      <p className="text-[11px] font-semibold opacity-80">{label}</p>
    </div>
  );
}

function Line({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[13px]">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{children}</span>
    </div>
  );
}

/** One row of the visit's history; a step that has not happened yet is greyed out. */
function Step({ done, label, at, note }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${done ? "bg-emerald-500" : "bg-gray-300"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-semibold ${done ? "text-gray-900" : "text-gray-400"}`}>{label}</span>
        {done && (at || note) ? (
          <span className="block text-[11.5px] text-gray-500">{[at ? dateTime(at) : null, note].filter(Boolean).join(" · ")}</span>
        ) : null}
      </span>
    </li>
  );
}

function VisitCard({ visit: v, expanded, onToggle, onOpen }) {
  const stage = STAGE[v.visit?.stage] || STAGE.assigned;
  const quote = v.contract ? QUOTE[v.contract.status] : null;
  const exact = v.siteExact || {};
  const report = v.visit?.report;
  const submitted = report?.status === "submitted";
  const done = isDone(v);
  const hasPin = Number.isFinite(exact.lat) && Number.isFinite(exact.lng);
  const mapsUrl = hasPin
    ? `https://www.google.com/maps/dir/?api=1&destination=${exact.lat},${exact.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exact.address || [v.site?.area, v.site?.city].filter(Boolean).join(", "))}`;

  return (
    <li className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-gray-900">{v.package?.name}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              <span className="font-mono">{v.reference}</span> · <span className="capitalize">{v.package?.segment}</span>
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${stage.tone}`}>{stage.label}</span>
        </div>

        {/* The customer and the place */}
        {v.customer ? (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-[14px] font-semibold text-gray-900">{v.customer.name}</p>
              <a href={`tel:${v.customer.phone}`} className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-orange-600">
                <Phone className="h-3.5 w-3.5" /> {v.customer.phone}
              </a>
            </div>
            <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-gray-600">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span>
                {exact.address || [v.site?.area, v.site?.city].filter(Boolean).join(", ")}
                {exact.landmark ? <span className="block text-gray-500">Landmark: {exact.landmark}</span> : null}
              </span>
            </p>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-orange-600"
            >
              <Navigation className="h-3.5 w-3.5" /> {hasPin ? "Directions to the pin" : "Open in maps"}
            </a>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-gray-600">
          <span>
            {Number(v.site?.totalBuiltUpArea || 0).toLocaleString("en-IN")} sq.ft
            {v.site?.floors ? ` · ${v.site.floors} floor${v.site.floors === 1 ? "" : "s"}` : ""}
          </span>
          <span className="font-semibold text-gray-800">≈ {fullMoney(v.estimatedCost)}</span>
          {quote ? (
            <span className={`font-semibold ${quote.tone}`}>
              {quote.label} · {fullMoney(v.contract.price)}
            </span>
          ) : done ? (
            <span className="font-semibold text-gray-500">Waiting for the office to quote</span>
          ) : null}
        </div>

        <div className="mt-3 flex gap-2">
          {!done ? (
            <button
              type="button"
              onClick={onOpen}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              {v.visit?.stage === "assigned" ? "Start journey" : v.visit?.stage === "on_the_way" ? "Enter customer OTP" : "Fill the site report"}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className={`flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 ${done ? "flex-1" : ""}`}
          >
            {expanded ? "Hide details" : "All details"}
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-gray-100 bg-gray-50/50 px-4 py-4">
          {/* Timeline */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">Timeline</p>
            <ol className="space-y-2.5">
              <Step done label="Assigned to you" at={v.assignedAt} note={v.assignedBy === "admin" ? "by the office" : "you accepted it"} />
              <Step done={Boolean(v.visit?.startedAt)} label="Journey started" at={v.visit?.startedAt} />
              <Step done={Boolean(v.visit?.arrivedAt)} label="Arrival confirmed with the customer's OTP" at={v.visit?.arrivedAt} />
              <Step done={submitted} label="Site report sent to the office" at={report?.submittedAt} />
              <Step done={Boolean(v.contract)} label="Quotation sent to the customer" at={v.contract?.sentAt} note={v.contract?.number} />
              <Step
                done={["accepted", "rejected"].includes(v.contract?.status)}
                label={v.contract?.status === "rejected" ? "Customer declined the quotation" : "Customer accepted the quotation"}
                at={v.contract?.respondedAt}
              />
            </ol>
          </div>

          {/* Booking */}
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">Booking</p>
            <div className="divide-y divide-gray-100 rounded-lg bg-white px-3 ring-1 ring-gray-200">
              <Line label="City / area">{[v.site?.city, v.site?.area].filter(Boolean).join(" · ")}</Line>
              {exact.pincode ? <Line label="Pincode">{exact.pincode}</Line> : null}
              <Line label="Package rate">{v.package?.name}</Line>
              <Line label="Wants to start">{v.startWindow}</Line>
              {v.visitingFee > 0 ? (
                <Line label="Visiting fee">
                  {fullMoney(v.visitingFee)}
                  {v.payment?.status === "paid" ? " · paid" : ""}
                </Line>
              ) : null}
              {v.notes ? <Line label="Customer's note">{v.notes}</Line> : null}
            </div>
          </div>

          {/* The report */}
          {report ? (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Site report {submitted ? "" : "(draft)"}
              </p>
              <div className="divide-y divide-gray-100 rounded-lg bg-white px-3 ring-1 ring-gray-200">
                <Line label="Plot area">{report.plotAreaSqft ? `${report.plotAreaSqft} sq.ft` : "—"}</Line>
                <Line label="Built-up area">{report.builtUpAreaSqft ? `${report.builtUpAreaSqft} sq.ft` : "—"}</Line>
                <Line label="Floors planned">{report.floorsPlanned ?? "—"}</Line>
                <Line label="Access"><span className="capitalize">{report.access || "—"}</span></Line>
                <Line label="Water">{yesNo(report.waterAvailable)}</Line>
                <Line label="Electricity">{yesNo(report.electricityAvailable)}</Line>
                <Line label="Duration estimate">{report.estimatedDurationDays ? `${report.estimatedDurationDays} days` : "—"}</Line>
              </div>
              {[
                ["Measurements", report.measurements],
                ["Site condition", report.siteCondition],
                ["Recommended scope", report.recommendedScope],
                ["Observations", report.observations],
                ["Note for the office", report.notesForOffice],
              ].map(([label, value]) =>
                value ? (
                  <div key={label} className="mt-2.5">
                    <p className="text-[11.5px] font-semibold text-gray-500">{label}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800">{value}</p>
                  </div>
                ) : null,
              )}
              {report.photos?.length ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11.5px] font-semibold text-gray-500">Photos ({report.photos.length})</p>
                  <div className="grid grid-cols-4 gap-2">
                    {report.photos.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="Site" className="h-16 w-full rounded-lg border border-gray-200 object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* The quotation */}
          {v.contract ? (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">Quotation</p>
              <div className="divide-y divide-gray-100 rounded-lg bg-white px-3 ring-1 ring-gray-200">
                <Line label="Number">{v.contract.number}</Line>
                <Line label="Price">{fullMoney(v.contract.price)}</Line>
                {v.contract.advanceAmount > 0 ? <Line label="Advance">{fullMoney(v.contract.advanceAmount)}</Line> : null}
                {v.contract.durationDays ? <Line label="Duration">{v.contract.durationDays} days</Line> : null}
                <Line label="Status">{QUOTE[v.contract.status]?.label}</Line>
                {v.contract.validUntil && v.contract.status === "sent" ? <Line label="Valid until">{dateTime(v.contract.validUntil)}</Line> : null}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onOpen}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Open the full booking page
          </button>
        </div>
      ) : null}
    </li>
  );
}
