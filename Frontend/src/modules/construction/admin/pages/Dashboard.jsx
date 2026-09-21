import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Building2, Briefcase, CheckCircle2, ClipboardList, FileSignature,
  HardHat, Inbox, Package, PiggyBank, RefreshCw, Receipt, ShieldCheck, UserPlus, Users, Wallet,
} from "lucide-react";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS, CN_ADMIN_SELECT_CLASS } from "../utils/adminTheme";
import { fullMoney, shortDate, shortMoney } from "../../shared/format";
import { CONSTRUCTION_FONT } from "../../shared/fonts";

/**
 * BRD A1 — the construction dashboard.
 *
 * "The whole picture at a glance… the screen your operations team will keep open all day."
 *
 * So it is a WORK QUEUE first and a report second. Top to bottom:
 *   1. Headline cards   — the six numbers that say how the site visit business is doing.
 *   2. Needs attention  — what will become a phone call if nobody touches it today.
 *   3. Bookings trend   — how many paid site visits came in, day by day.
 *   4. The funnel       — for Residential and Commercial separately, how far bookings get:
 *                         booked → contractor → report → quotation → accepted.
 *   5. Everything else  — budget and material requests, enquiries, projects, contractors,
 *                         money held in escrow, stages due, top contractors.
 *
 * When there is nothing to do the queue says so plainly rather than showing a grid of zeroes.
 */

const BRAND = "#FF6A00";

/** Severity is reserved for the queue: it always ships with a label, never colour alone. */
const SEVERITY = {
  critical: { ring: "border-rose-200 bg-rose-50", dot: "bg-rose-500", count: "text-rose-700", tag: "Urgent" },
  high: { ring: "border-amber-200 bg-amber-50", dot: "bg-amber-500", count: "text-amber-700", tag: "High" },
  medium: { ring: "border-blue-200 bg-blue-50", dot: "bg-blue-500", count: "text-blue-700", tag: "Medium" },
  low: { ring: "border-gray-200 bg-gray-50", dot: "bg-gray-400", count: "text-gray-700", tag: "Low" },
};

/** Colour families for the headline cards: a soft tile, a solid icon chip, a deep number. */
const TONES = {
  orange: { tile: "from-orange-50 to-orange-100/60 ring-orange-200/80", chip: "bg-orange-500 shadow-orange-500/30", num: "text-orange-950", sub: "text-orange-800/70" },
  amber: { tile: "from-amber-50 to-amber-100/60 ring-amber-200/80", chip: "bg-amber-500 shadow-amber-500/30", num: "text-amber-950", sub: "text-amber-800/70" },
  violet: { tile: "from-violet-50 to-violet-100/60 ring-violet-200/80", chip: "bg-violet-500 shadow-violet-500/30", num: "text-violet-950", sub: "text-violet-800/70" },
  blue: { tile: "from-blue-50 to-blue-100/60 ring-blue-200/80", chip: "bg-blue-500 shadow-blue-500/30", num: "text-blue-950", sub: "text-blue-800/70" },
  emerald: { tile: "from-emerald-50 to-emerald-100/60 ring-emerald-200/80", chip: "bg-emerald-500 shadow-emerald-500/30", num: "text-emerald-950", sub: "text-emerald-800/70" },
  teal: { tile: "from-teal-50 to-teal-100/60 ring-teal-200/80", chip: "bg-teal-500 shadow-teal-500/30", num: "text-teal-950", sub: "text-teal-800/70" },
};

/** One hue, light to dark, for the funnel: later steps are a stronger version of the same colour. */
const FUNNEL_SHADES = ["#FFD9BF", "#FFBC8C", "#FF9A55", "#FF6A00", "#B84A00"];

const num = (v) => Number(v) || 0;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await constructionAdminApi.getDashboard({ days }));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // The screen is kept open all day: refresh quietly every couple of minutes.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 120000);
    return () => clearInterval(timer);
  }, [load]);

  const packages = data?.packages;
  const totals = packages?.totals;
  const segments = packages?.segments;
  const attention = data?.attention || [];

  if (loading && !data) {
    return (
      <div className={CN_ADMIN_PAGE_CLASS}>
        <div className="space-y-4">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-gray-100" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
          <div className="h-56 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${CN_ADMIN_PAGE_CLASS} space-y-8`} style={{ fontFamily: CONSTRUCTION_FONT }}>
      {/* ------------------------------------------------------------ header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#FF6A00]">Construction</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-[28px]">Operations overview</h1>
          <p className="mt-1 text-sm text-gray-500">
            Site visits, quotations and money — what needs your team today, and how the module is performing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className={`w-auto ${CN_ADMIN_SELECT_CLASS}`}
            aria-label="Period"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {data && !packages ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The site visit figures are not in this response. Restart the backend so it serves the latest dashboard, then refresh.
        </p>
      ) : null}

      {/* -------------------------------------------------- headline cards */}
      <section aria-label="Headline figures">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            tone="orange" icon={ClipboardList} label="Site visits booked"
            value={num(totals?.inPeriod)}
            caption={`${num(totals?.booked)} all time · last ${data?.periodDays ?? days} days`}
            onClick={() => navigate("/admin/construction/end-to-end/residential/requests")}
          />
          <StatCard
            tone="amber" icon={UserPlus} label="Need a contractor"
            value={num(totals?.needsContractor)}
            caption={num(totals?.needsContractor) ? "Paid — waiting for your team" : "Every visit has someone"}
            onClick={() => navigate("/admin/construction/end-to-end/commercial/requests")}
          />
          <StatCard
            tone="violet" icon={FileSignature} label="Reports to quote"
            value={num(totals?.toQuote)}
            caption={num(totals?.toQuote) ? "Customer waiting for a price" : "Nothing waiting"}
            onClick={() => navigate("/admin/construction/end-to-end/residential/quotations")}
          />
          <StatCard
            tone="blue" icon={Receipt} label="Quotations out"
            value={num(totals?.quotesSent)}
            caption={`${shortMoney(num(totals?.quotesSentValue))} awaiting customers`}
            onClick={() => navigate("/admin/construction/end-to-end/residential/quotations")}
          />
          <StatCard
            tone="emerald" icon={CheckCircle2} label="Quotations accepted"
            value={num(totals?.accepted)}
            caption={`${shortMoney(num(totals?.acceptedValue))} won`}
            onClick={() => navigate("/admin/construction/end-to-end/residential/quotations")}
          />
          <StatCard
            tone="teal" icon={PiggyBank} label="Held in escrow"
            value={shortMoney(num(data?.money?.currentlyHeld))}
            caption="Customer funds, not yet released"
            onClick={() => navigate("/admin/construction/payments")}
          />
        </div>
      </section>

      {/* ---------------------------------------------------- needs attention */}
      <section>
        <SectionTitle icon={AlertTriangle} iconTone="text-amber-600" title="Needs attention" count={attention.length || null} />
        {attention.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-7 text-center">
            <ShieldCheck className="mx-auto h-6 w-6 text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-emerald-900">Nothing waiting</p>
            <p className="mt-1 text-xs text-emerald-800">
              No visits without a contractor, no reports to quote, no open disputes, no unverified contractors.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {attention.map((item) => {
              const tone = SEVERITY[item.severity] || SEVERITY.low;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => navigate(item.link)}
                    className={`group flex h-full w-full items-start gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${tone.ring}`}
                  >
                    <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-2xl font-extrabold tabular-nums ${tone.count}`}>{item.count}</span>
                        <span className="text-sm font-semibold leading-snug text-gray-900">{item.label}</span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-gray-600">{item.detail}</span>
                      {item.amount > 0 ? (
                        <span className="mt-1 block text-xs font-semibold text-rose-700">{fullMoney(item.amount)}</span>
                      ) : null}
                      <span className={`mt-2 inline-block rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.count}`}>
                        {tone.tag}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-gray-500" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------- trend */}
      <section>
        <SectionTitle icon={ClipboardList} iconTone="text-[#FF6A00]" title="Site visit bookings" note={`Paid bookings per day · last ${data?.periodDays ?? days} days`} />
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <BookingsChart trend={packages?.trend || []} />
        </div>
      </section>

      {/* ------------------------------------------------------------ funnels */}
      <section>
        <SectionTitle icon={Building2} iconTone="text-[#FF6A00]" title="From booking to accepted quotation" note="How far each segment's bookings get" />
        <div className="grid gap-4 lg:grid-cols-2">
          {["residential", "commercial"].map((key) => (
            <SegmentFunnel
              key={key}
              segment={key}
              figures={segments?.[key]}
              onRequests={() => navigate(`/admin/construction/end-to-end/${key}/requests`)}
              onQuotations={() => navigate(`/admin/construction/end-to-end/${key}/quotations`)}
            />
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- other pipelines */}
      <section>
        <SectionTitle icon={Inbox} iconTone="text-blue-600" title="Other requests and pipeline" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat
            icon={Package} tone="bg-emerald-100 text-emerald-700" label="Budget Friendly requests"
            value={num(data?.budget?.total)}
            note={`${num(data?.budget?.open)} open · ${num(data?.budget?.inPeriod)} new in period`}
            onClick={() => navigate("/admin/construction/budget-requests")}
          />
          <MiniStat
            icon={Briefcase} tone="bg-amber-100 text-amber-700" label="Material quote requests"
            value={num(data?.materials?.total)}
            note={`${num(data?.materials?.new)} new`}
            onClick={() => navigate("/admin/construction/material-requests")}
          />
          <MiniStat
            icon={Inbox} tone="bg-blue-100 text-blue-700" label="Enquiries"
            value={num(data?.enquiries?.total)}
            note={`${num(data?.enquiries?.inPeriod)} in period · ${num(data?.enquiries?.conversionRate)}% become projects`}
            onClick={() => navigate("/admin/construction/enquiries")}
          />
          <MiniStat
            icon={HardHat} tone="bg-violet-100 text-violet-700" label="Active projects"
            value={num(data?.projects?.active)}
            note={`${num(data?.projects?.completed)} completed`}
            onClick={() => navigate("/admin/construction/projects")}
          />
        </div>
      </section>

      {/* -------------------------------------------------------------- money */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div>
          <SectionTitle icon={Wallet} iconTone="text-teal-600" title="Money" note="Held funds are customers' money, not platform revenue" />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Held right now" value={fullMoney(data?.money?.currentlyHeld)} tone="text-blue-700" note="Customer funds in escrow" />
            <Stat label="Released to date" value={fullMoney(data?.money?.totalReleased)} tone="text-emerald-700" />
            <Stat label="Returned to customers" value={fullMoney(data?.money?.totalRefunded)} />
            <Stat label="Visiting fees collected" value={fullMoney(totals?.feesCollected)} tone="text-[#FF6A00]" note="From site visit bookings" />
          </div>
        </div>
        <div>
          <SectionTitle icon={Users} iconTone="text-violet-600" title="Contractors" />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Approved" value={data?.contractors?.approved ?? 0} tone="text-emerald-700" />
            <Stat
              label="Awaiting verification"
              value={data?.contractors?.pendingApproval ?? 0}
              tone={data?.contractors?.pendingApproval > 0 ? "text-amber-700" : "text-gray-900"}
              note={data?.contractors?.pendingApproval > 0 ? "They cannot receive work yet" : undefined}
            />
            <Stat label="Suspended" value={data?.contractors?.suspended ?? 0} tone="text-rose-700" />
            <Stat label="Rejected" value={data?.contractors?.rejected ?? 0} />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- lists */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div>
          <SectionTitle icon={HardHat} iconTone="text-amber-600" title="Stages due in the next week" />
          {(data?.stagesDueSoon || []).length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-7 text-center text-sm text-gray-500">
              Nothing falls due this week.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {data.stagesDueSoon.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => s.projectId && navigate(`/admin/construction/projects/${s.projectId}`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">{s.name}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {s.projectNumber} · due {shortDate(s.targetDate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-700">{fullMoney(s.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle icon={ShieldCheck} iconTone="text-emerald-600" title="Top contractors by value" />
          {(data?.topContractors || []).length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-7 text-center text-sm text-gray-500">
              No completed projects yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {data.topContractors.map((c, i) => (
                <li key={c.contractorId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/construction/contractors/${c.contractorId}`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{c.businessName}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {c.projects} completed{c.rating > 0 ? ` · ${c.rating.toFixed(1)}★` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-700">{fullMoney(c.value)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="text-xs text-gray-400">
        {data?.generatedAt ? `Figures as at ${new Date(data.generatedAt).toLocaleString("en-IN")}. ` : ""}
        Computed live from the records — there is no cached rollup to go stale.
      </p>
    </div>
  );
}

/* ================================================================ pieces */

function SectionTitle({ icon: Icon, iconTone = "text-gray-500", title, note, count }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-gray-900">
        {Icon ? <Icon className={`h-4 w-4 ${iconTone}`} /> : null}
        {title}
        {count ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{count}</span>
        ) : null}
      </h2>
      {note ? <p className="text-xs text-gray-500">{note}</p> : null}
    </div>
  );
}

/** A colour-coded headline number that opens the screen where it is worked. */
function StatCard({ tone, icon: Icon, label, value, caption, onClick }) {
  const t = TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-lg ${t.tile}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg ${t.chip}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className={`mt-3 block text-[28px] font-extrabold leading-none tracking-tight tabular-nums ${t.num}`}>{value}</span>
      <span className="mt-1.5 block text-[13px] font-bold text-gray-800">{label}</span>
      <span className={`mt-0.5 block text-[11.5px] font-medium leading-snug ${t.sub}`}>{caption}</span>
      <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-gray-400 opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

function MiniStat({ icon: Icon, tone, label, value, note, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300 hover:shadow-md"
    >
      <span className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-gray-300 transition group-hover:text-gray-500" />
      </span>
      <span className="mt-3 text-2xl font-extrabold tabular-nums text-gray-900">{value}</span>
      <span className="text-[13px] font-semibold text-gray-700">{label}</span>
      <span className="mt-0.5 text-[11.5px] leading-snug text-gray-500">{note}</span>
    </button>
  );
}

function Stat({ label, value, tone = "text-gray-900", note }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      {note ? <p className="mt-0.5 text-[11px] leading-tight text-gray-400">{note}</p> : null}
    </div>
  );
}

/**
 * Bookings per day. One series, so no legend: the section title names it. Thin bars with
 * rounded tops anchored on the baseline, a recessive grid, and only the axis extremes labelled.
 * Each column is a full-height hit target so a short bar is still easy to hover, and a screen
 * reader gets the same numbers as a table.
 */
function BookingsChart({ trend }) {
  const [hover, setHover] = useState(null);

  const { max, ticks } = useMemo(() => {
    const peak = Math.max(0, ...trend.map((d) => d.total));
    // A "nice" ceiling so the top gridline is a round number and small counts do not fill the plot.
    const ceiling = peak <= 4 ? 4 : Math.ceil(peak / 5) * 5;
    return { max: ceiling, ticks: [0, ceiling / 2, ceiling] };
  }, [trend]);

  const total = trend.reduce((s, d) => s + d.total, 0);
  if (!trend.length || total === 0) {
    return (
      <div className="flex h-44 flex-col items-center justify-center text-center">
        <ClipboardList className="h-7 w-7 text-gray-300" />
        <p className="mt-2 text-sm font-semibold text-gray-700">No paid bookings in this period</p>
        <p className="mt-0.5 text-xs text-gray-500">They appear here as customers book and pay for a site visit.</p>
      </div>
    );
  }

  const labelEvery = trend.length > 45 ? 14 : trend.length > 20 ? 7 : trend.length > 10 ? 3 : 1;
  const active = hover !== null ? trend[hover] : null;

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tabular-nums text-gray-900">{total}</span>
        <span className="text-xs font-medium text-gray-500">bookings in this period</span>
      </div>

      <div className="relative flex gap-3">
        {/* y axis: 0, half, top only */}
        <div className="flex h-44 flex-col-reverse justify-between text-[10px] font-medium tabular-nums text-gray-400">
          {ticks.map((t) => (
            <span key={t} className="leading-none">{t}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-44 flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className={`border-t ${t === 0 ? "border-gray-300" : "border-dashed border-gray-200"}`} />
            ))}
          </div>

          <div className="relative flex h-44 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
            {trend.map((d, i) => (
              <button
                key={d.date}
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${shortDate(d.date)}: ${d.total} booking${d.total === 1 ? "" : "s"}`}
                className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
              >
                <span
                  className="block w-full max-w-[18px] rounded-t-[4px] transition-opacity"
                  style={{
                    height: `${(d.total / max) * 100}%`,
                    minHeight: d.total > 0 ? 3 : 0,
                    backgroundColor: BRAND,
                    opacity: hover === null || hover === i ? 1 : 0.45,
                  }}
                />
              </button>
            ))}
          </div>

          {active ? (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
              style={{
                left: `${((hover + 0.5) / trend.length) * 100}%`,
                transform: `translate(${hover > trend.length * 0.7 ? "-100%" : hover < trend.length * 0.3 ? "0%" : "-50%"}, -100%)`,
              }}
            >
              <p className="font-bold text-gray-900">{shortDate(active.date)}</p>
              <p className="mt-1 text-gray-700">
                Residential <span className="font-semibold tabular-nums">{active.residential}</span>
                {" · "}
                Commercial <span className="font-semibold tabular-nums">{active.commercial}</span>
              </p>
              <p className="text-gray-500">
                Total <span className="font-semibold tabular-nums text-gray-900">{active.total}</span>
              </p>
            </div>
          ) : null}

          <div className="mt-1.5 flex gap-[2px] text-[10px] font-medium text-gray-400">
            {trend.map((d, i) => (
              <span key={d.date} className="min-w-0 flex-1 text-center">
                {i % labelEvery === 0 || i === trend.length - 1
                  ? new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                  : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The same numbers for screen readers. */}
      <table className="sr-only">
        <caption>Paid site visit bookings per day</caption>
        <thead>
          <tr><th>Date</th><th>Residential</th><th>Commercial</th><th>Total</th></tr>
        </thead>
        <tbody>
          {trend.map((d) => (
            <tr key={d.date}><td>{d.date}</td><td>{d.residential}</td><td>{d.commercial}</td><td>{d.total}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One segment's journey: how many bookings reach each step, as bars of a single hue. */
function SegmentFunnel({ segment, figures, onRequests, onQuotations }) {
  const f = figures || {};
  const isCommercial = segment === "commercial";
  const quoted = num(f.quotesSent) + num(f.accepted) + num(f.declined);
  const steps = [
    { label: "Booked & paid", value: num(f.booked) },
    { label: "Contractor assigned", value: num(f.assigned) },
    { label: "Site report received", value: num(f.reportsIn) },
    { label: "Quotation sent", value: quoted },
    { label: "Quotation accepted", value: num(f.accepted) },
  ];
  const top = Math.max(1, steps[0].value);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isCommercial ? "bg-slate-800 text-white" : "bg-orange-100 text-orange-700"}`}>
            {isCommercial ? <Briefcase className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
          </span>
          <div>
            <h3 className="text-[15px] font-extrabold text-gray-900">{isCommercial ? "Commercial" : "Residential"}</h3>
            <p className="text-xs text-gray-500">
              {isCommercial ? "Your team assigns every contractor" : "Broadcast to nearby contractors"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold tabular-nums text-gray-900">{shortMoney(num(f.acceptedValue))}</p>
          <p className="text-[11px] font-medium text-gray-500">accepted value</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {steps.map((s, i) => (
          <li key={s.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-gray-700">{s.label}</span>
              <span className="tabular-nums text-gray-500">
                <span className="text-[13px] font-bold text-gray-900">{s.value}</span>
                {i > 0 && steps[0].value > 0 ? ` · ${pct(s.value, steps[0].value)}%` : ""}
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${s.value > 0 ? Math.max(3, (s.value / top) * 100) : 0}%`, backgroundColor: FUNNEL_SHADES[i] }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center">
        <Chip label="Need contractor" value={num(f.needsContractor)} alert={num(f.needsContractor) > 0} />
        <Chip label="Visit in progress" value={num(f.inProgress)} />
        <Chip label="To quote" value={num(f.toQuote)} alert={num(f.toQuote) > 0} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onRequests} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          View requests
        </button>
        <button type="button" onClick={onQuotations} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          View quotations
        </button>
        <span className="ml-auto self-center text-[11px] font-medium text-gray-400">
          Fees collected {shortMoney(num(f.feesCollected))}
        </span>
      </div>
    </div>
  );
}

function Chip({ label, value, alert }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${alert ? "bg-amber-50" : "bg-gray-50"}`}>
      <p className={`text-lg font-extrabold tabular-nums ${alert ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
      <p className="text-[10.5px] font-medium leading-tight text-gray-500">{label}</p>
    </div>
  );
}
