import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight, BadgeCheck, Building2, CalendarClock, ChevronRight, ClipboardCheck, FileText, HardHat,
  Inbox, KeyRound, MapPin, Navigation, ShieldCheck, Sparkles, Star, TrendingUp, Wallet, Wrench,
} from "lucide-react";
import contractorApi from "../services/contractorApi";
import ContractorShell from "../components/ContractorShell";
import { getContractorUser } from "../utils/authContractor";
import { fullMoney, shortMoney } from "../../shared/format";

/**
 * Approved-contractor landing page.
 *
 * It answers three questions in order: how am I doing (hero: wallet and trust), what needs me
 * right now (the work queue), and what is on my plate overall (the colour-coded counts).
 * Everything is a live figure that links to the screen where the work is done.
 *
 * Each block loads on its own and fails on its own: `null` means "still loading", an empty
 * value means "loaded, nothing there". A contractor whose earnings call errors still sees
 * their waiting visits, so nothing is fetched as a set.
 */

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

/** Where a booked site visit is, in the contractor's words, with the screen action it needs. */
const VISIT_TODO = {
  assigned: { label: "Start journey", hint: "Tell the customer you are on the way", icon: Navigation, tone: "bg-orange-500", rank: 1 },
  on_the_way: { label: "Enter customer OTP", hint: "Confirm you have reached the site", icon: KeyRound, tone: "bg-blue-500", rank: 0 },
  arrived: { label: "Fill the site report", hint: "Measurements and photos for the office", icon: ClipboardCheck, tone: "bg-amber-500", rank: 2 },
};

const BAND = {
  new: "New contractor",
  building: "Building reputation",
  good: "Good standing",
  excellent: "Excellent",
};

/** Colour families for the stat cards: soft gradient tile, a solid icon chip, deep number. */
const TONES = {
  blue: { tile: "from-blue-50 to-blue-100/70 ring-blue-200/80", chip: "bg-blue-500 shadow-blue-500/30", num: "text-blue-950", sub: "text-blue-700/80" },
  orange: { tile: "from-orange-50 to-orange-100/70 ring-orange-200/80", chip: "bg-orange-500 shadow-orange-500/30", num: "text-orange-950", sub: "text-orange-700/80" },
  teal: { tile: "from-teal-50 to-teal-100/70 ring-teal-200/80", chip: "bg-teal-500 shadow-teal-500/30", num: "text-teal-950", sub: "text-teal-700/80" },
  violet: { tile: "from-violet-50 to-violet-100/70 ring-violet-200/80", chip: "bg-violet-500 shadow-violet-500/30", num: "text-violet-950", sub: "text-violet-700/80" },
  emerald: { tile: "from-emerald-50 to-emerald-100/70 ring-emerald-200/80", chip: "bg-emerald-500 shadow-emerald-500/30", num: "text-emerald-950", sub: "text-emerald-700/80" },
  amber: { tile: "from-amber-50 to-amber-100/70 ring-amber-200/80", chip: "bg-amber-500 shadow-amber-500/30", num: "text-amber-950", sub: "text-amber-700/80" },
};

export default function ContractorDashboard() {
  const navigate = useNavigate();
  const [contractor, setContractor] = useState(getContractorUser());
  const [leads, setLeads] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [projects, setProjects] = useState(null);
  const [visits, setVisits] = useState(null); // package site-visit requests
  const [quotes, setQuotes] = useState(null);
  const [upcoming, setUpcoming] = useState(null); // enquiry site visits coming up
  const [score, setScore] = useState(null);

  const load = useCallback(() => {
    contractorApi.getMe().then(setContractor).catch(() => {});
    contractorApi.leadStats().then(setLeads).catch(() => setLeads({}));
    contractorApi.getEarnings().then(setEarnings).catch(() => setEarnings({}));
    contractorApi.listProjects({ limit: 5, status: "active" }).then((r) => setProjects(r.rows)).catch(() => setProjects([]));
    contractorApi.listPackageRequests({ limit: 50 }).then((r) => setVisits(r.rows)).catch(() => setVisits([]));
    contractorApi.listQuotations().then((rows) => setQuotes(rows || [])).catch(() => setQuotes([]));
    contractorApi.listVisits({ upcoming: "true" }).then((rows) => setUpcoming(rows || [])).catch(() => setUpcoming([]));
    contractorApi.getMyScore().then(setScore).catch(() => setScore({}));
  }, []);

  useEffect(() => {
    load();
    // Work arrives while the app sits open: refresh quietly on a timer and when it regains focus.
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const waiting = useMemo(() => (visits || []).filter((v) => v.canRespond), [visits]);
  // The visits this contractor has taken and still has something to do on, most urgent first.
  const todo = useMemo(
    () => (visits || [])
      .filter((v) => v.assignedToMe && VISIT_TODO[v.visitStage])
      .sort((a, b) => VISIT_TODO[a.visitStage].rank - VISIT_TODO[b.visitStage].rank),
    [visits],
  );
  const quotesOut = useMemo(
    () => (quotes || []).filter((q) => ["sent", "under_review", "revision_requested"].includes(q.status)),
    [quotes],
  );
  const quoteDrafts = useMemo(() => (quotes || []).filter((q) => q.status === "draft").length, [quotes]);

  const newLeads = leads?.newLeads;
  const attention = (waiting.length || 0) + (newLeads || 0) + todo.length;

  return (
    <ContractorShell
      title={contractor?.businessName || "Contractor"}
      subtitle={contractor?.contractorCode ? `Contractor · ${contractor.contractorCode}` : "Contractor"}
      action={
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
          <BadgeCheck className="h-3.5 w-3.5" /> Verified
        </span>
      }
    >
      <div className="space-y-6">
        {/* ------------------------------------------------------------ Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950 p-5 text-white shadow-xl shadow-slate-900/20">
          <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-orange-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-slate-300">{greeting()},</p>
              <p className="mt-0.5 truncate text-xl font-extrabold tracking-tight">
                {contractor?.ownerName || contractor?.businessName || "Contractor"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/contractor/score")}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-left ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15"
            >
              <ShieldCheck className="h-5 w-5 text-orange-300" />
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">Trust score</span>
                <span className="block text-sm font-extrabold leading-tight tabular-nums">
                  {score === null ? "…" : score?.band === "new" || score?.score == null ? "New" : `${score.score}/100`}
                </span>
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/contractor/earnings")}
            className="relative mt-5 block w-full text-left"
          >
            <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-300">
              <Wallet className="h-3.5 w-3.5" /> Wallet balance
              <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
            </span>
            <span className="mt-1 block text-[34px] font-extrabold leading-none tracking-tight tabular-nums">
              {earnings === null ? <span className="inline-block h-8 w-40 animate-pulse rounded-lg bg-white/15" /> : fullMoney(earnings?.walletBalance)}
            </span>
          </button>

          <div className="relative mt-5 grid grid-cols-3 gap-2">
            {[
              ["Total earned", earnings?.totalEarned, TrendingUp],
              ["Held in escrow", earnings?.heldAgainstYourProjects, HardHat],
              ["To be approved", earnings?.awaitingApproval, Sparkles],
            ].map(([label, value, Icon]) => (
              <div key={label} className="rounded-2xl bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10">
                <Icon className="h-3.5 w-3.5 text-orange-300" />
                <p className="mt-1.5 text-[15px] font-bold tabular-nums">
                  {earnings === null ? "…" : shortMoney(value || 0)}
                </p>
                <p className="text-[10.5px] font-medium text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          {contractor?.rating > 0 ? (
            <p className="relative mt-4 flex items-center gap-1.5 text-[12px] font-medium text-slate-300">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-bold text-white">{Number(contractor.rating).toFixed(1)}</span>
              {contractor.totalRatings ? `from ${contractor.totalRatings} review${contractor.totalRatings === 1 ? "" : "s"}` : "customer rating"}
              {score?.band && BAND[score.band] ? ` · ${BAND[score.band]}` : ""}
            </p>
          ) : null}
        </section>

        {/* ------------------------------------------- What needs you right now */}
        {attention > 0 ? (
          <section>
            <SectionTitle title="Needs you now" badge={attention} />
            <div className="space-y-2.5">
              {waiting.length > 0 && (
                <Alert
                  icon={Building2}
                  tone="bg-orange-500"
                  ring="border-orange-200 bg-orange-50"
                  title={waiting.length === 1 ? "1 paid site visit is waiting" : `${waiting.length} paid site visits are waiting`}
                  detail="The visiting fee is paid. The first contractor to accept gets it."
                  cta="Take it"
                  onClick={() => navigate("/contractor/package-requests")}
                />
              )}
              {newLeads > 0 && (
                <Alert
                  icon={Inbox}
                  tone="bg-blue-500"
                  ring="border-blue-200 bg-blue-50"
                  title={newLeads === 1 ? "1 new enquiry matched to you" : `${newLeads} new enquiries matched to you`}
                  detail="A fast reply wins more work than a good price."
                  cta="Reply"
                  onClick={() => navigate("/contractor/leads")}
                />
              )}
              {todo.map((v) => {
                const step = VISIT_TODO[v.visitStage];
                return (
                  <Alert
                    key={v.id}
                    icon={step.icon}
                    tone={step.tone}
                    ring="border-slate-200 bg-white"
                    title={step.label}
                    detail={`${v.package?.name || "Site visit"} · ${v.site?.city || ""} · ${v.reference}`}
                    sub={step.hint}
                    cta="Open"
                    onClick={() => navigate(`/contractor/package-requests/${v.id}`)}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ------------------------------------------------- Colour-coded counts */}
        <section>
          <SectionTitle title="Your work at a glance" />
          <div className="grid grid-cols-2 gap-3">
            <StatCard tone="blue" icon={Inbox} label="New enquiries" value={leads === null ? null : (leads.newLeads || 0)} caption={leads?.accepted ? `${leads.accepted} accepted` : "Matched to you"} onClick={() => navigate("/contractor/leads")} />
            <StatCard tone="orange" icon={Building2} label="Site visits open" value={visits === null ? null : waiting.length} caption={todo.length ? `${todo.length} in progress` : "Paid, waiting for you"} onClick={() => navigate("/contractor/package-requests")} />
            <StatCard tone="teal" icon={CalendarClock} label="Upcoming visits" value={upcoming === null ? null : upcoming.length} caption="Scheduled with customers" onClick={() => navigate("/contractor/visits")} />
            <StatCard tone="violet" icon={FileText} label="Quotes out" value={quotes === null ? null : quotesOut.length} caption={quoteDrafts ? `${quoteDrafts} draft${quoteDrafts === 1 ? "" : "s"} to send` : "With customers"} onClick={() => navigate("/contractor/quotations")} />
            <StatCard tone="emerald" icon={HardHat} label="Active projects" value={projects === null ? null : projects.length} caption="Stages under way" onClick={() => navigate("/contractor/projects")} />
            <StatCard tone="amber" icon={Wallet} label="Awaiting approval" value={earnings === null ? null : shortMoney(earnings?.awaitingApproval || 0)} caption="Released once approved" onClick={() => navigate("/contractor/earnings")} />
          </div>
        </section>

        {/* ------------------------------------------------------ Live projects */}
        {projects?.length > 0 && (
          <section>
            <SectionTitle title="Live projects" action="See all" onAction={() => navigate("/contractor/projects")} />
            <ul className="space-y-2.5">
              {projects.map((p) => {
                const funded = Number(p.fundedAmount) || 0;
                const released = Number(p.releasedAmount) || 0;
                const pct = funded > 0 ? Math.min(100, Math.round((released / funded) * 100)) : 0;
                return (
                  <li key={p._id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/contractor/projects/${p._id}`)}
                      className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-bold text-slate-900">{p.title || p.projectNumber}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {p.customerId?.name || "Customer"} · {p.projectNumber}
                          </span>
                        </span>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-emerald-500" />
                      </span>
                      <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="mt-2 flex items-center justify-between text-[11.5px] font-medium">
                        <span className="text-slate-500">Paid out {fullMoney(released)}</span>
                        <span className="text-emerald-700">{funded > 0 ? `${pct}% of ${shortMoney(funded)}` : "Awaiting funding"}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ---------------------------------------------------- Recent payouts */}
        {earnings?.recentStages?.filter((s) => s.releasedAt).length > 0 && (
          <section>
            <SectionTitle title="Recent payouts" action="Earnings" onAction={() => navigate("/contractor/earnings")} />
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {earnings.recentStages.filter((s) => s.releasedAt).slice(0, 3).map((s) => (
                <li key={s._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-slate-900">{s.name}</span>
                      <span className="block text-[11px] text-slate-500">
                        {new Date(s.releasedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-bold tabular-nums text-emerald-700">+{fullMoney(s.releasedAmount || s.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ------------------------------------------------------- Shortcuts */}
        <section>
          <SectionTitle title="Quick access" />
          <ul className="grid grid-cols-4 gap-2.5">
            {[
              ["Visits", Building2, "bg-orange-100 text-orange-600", "/contractor/package-requests"],
              ["Enquiries", Inbox, "bg-blue-100 text-blue-600", "/contractor/leads"],
              ["Jobs", Wrench, "bg-slate-200 text-slate-700", "/contractor/jobs"],
              ["Schedule", CalendarClock, "bg-teal-100 text-teal-600", "/contractor/visits"],
              ["Quotes", FileText, "bg-violet-100 text-violet-600", "/contractor/quotations"],
              ["Projects", HardHat, "bg-emerald-100 text-emerald-600", "/contractor/projects"],
              ["Earnings", Wallet, "bg-amber-100 text-amber-600", "/contractor/earnings"],
              ["Trust", ShieldCheck, "bg-rose-100 text-rose-600", "/contractor/score"],
            ].map(([title, Icon, tone, to]) => (
              <li key={to}>
                <button type="button" onClick={() => navigate(to)} className="group flex w-full flex-col items-center gap-1.5">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl transition group-active:scale-95 group-hover:shadow-md ${tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600">{title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {contractor?.serviceAreas?.length > 0 && (
          <p className="flex items-start justify-center gap-1.5 pb-2 text-center text-[11.5px] font-medium text-slate-400">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            You receive work in {contractor.serviceAreas.slice(0, 3).join(", ")}
            {contractor.serviceAreas.length > 3 ? ` and ${contractor.serviceAreas.length - 3} more` : ""}
          </p>
        )}
      </div>
    </ContractorShell>
  );
}

function SectionTitle({ title, action, onAction, badge }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-slate-900">
        {title}
        {badge ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{badge}</span>
        ) : null}
      </h2>
      {action ? (
        <button type="button" onClick={onAction} className="text-xs font-bold text-orange-600 hover:text-orange-700">
          {action}
        </button>
      ) : null}
    </div>
  );
}

/** A priority row: coloured icon, what it is, and one clear action. */
function Alert({ icon: Icon, tone, ring, title, detail, sub, cta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left shadow-sm transition active:scale-[0.99] ${ring}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold leading-snug text-slate-900">{title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-slate-600">{detail}</span>
        {sub ? <span className="block truncate text-[11px] text-slate-400">{sub}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-slate-900 px-3 py-1.5 text-[11.5px] font-bold text-white">
        {cta} <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

/** One colour-coded count. `value === null` means still loading, and shows a shimmer. */
function StatCard({ tone, icon: Icon, label, value, caption, onClick }) {
  const t = TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] ${t.tile}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg ${t.chip}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className={`mt-3 block text-[28px] font-extrabold leading-none tracking-tight tabular-nums ${t.num}`}>
        {value === null || value === undefined ? (
          value === null ? <span className="inline-block h-7 w-12 animate-pulse rounded-md bg-black/10" /> : "0"
        ) : value}
      </span>
      <span className="mt-1.5 block text-[12.5px] font-bold text-slate-800">{label}</span>
      <span className={`mt-0.5 block truncate text-[11px] font-medium ${t.sub}`}>{caption}</span>
      <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-slate-400 opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}
