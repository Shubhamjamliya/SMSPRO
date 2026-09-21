import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Check, FileSignature, HardHat, KeyRound, MapPin, Phone, RefreshCw,
} from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";
import { dateTime, fullMoney, shortDate } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const STEPS = [
  { key: "assigned", label: "Contractor assigned" },
  { key: "on_the_way", label: "On the way" },
  { key: "arrived", label: "At your site" },
  { key: "report_submitted", label: "Visit complete" },
];

/** What the customer is told at the top, from where the booking has got to. */
const headline = (request) => {
  if (request.payment?.status === "pending") {
    return { title: "Payment pending", detail: "Your booking starts once the visiting fee is paid.", tone: "amber" };
  }
  if (request.payment?.status === "refunded") {
    return { title: "Visiting fee refunded", detail: "This booking has been closed and the fee returned to your wallet.", tone: "slate" };
  }
  if (request.contract?.status === "accepted") {
    return { title: "Quotation accepted", detail: "Thank you. Our team will contact you about starting the work.", tone: "emerald" };
  }
  if (request.contract?.status === "sent") {
    return { title: "Your quotation is ready", detail: "Open the quotation to review the price and terms, then accept to go ahead.", tone: "amber" };
  }
  if (request.contract?.status === "rejected") {
    return { title: "Quotation declined", detail: "Our team will get in touch to talk it through.", tone: "slate" };
  }
  switch (request.visit?.stage) {
    case "on_the_way":
      return { title: "Your contractor is on the way", detail: "Give them the OTP below when they reach your site.", tone: "blue" };
    case "arrived":
      return { title: "Your site is being measured", detail: "The contractor is at your site recording the details.", tone: "blue" };
    case "report_submitted":
      return { title: "Site visit complete", detail: "Our team is preparing your quotation from the contractor's report.", tone: "emerald" };
    case "assigned":
      return { title: "Contractor assigned", detail: "They will start their journey to your site shortly.", tone: "emerald" };
    default:
      return request.dispatchState === "awaiting_admin"
        ? { title: "Assigning a contractor", detail: "Our team is choosing the right contractor for your site visit.", tone: "amber" }
        : { title: "Finding a contractor", detail: "Your request has gone to contractors near you. We will tell you as soon as one accepts.", tone: "amber" };
  }
};

const TONE = {
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
  emerald: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  blue: "bg-blue-50 text-blue-900 ring-blue-200",
  slate: "bg-slate-100 text-slate-800 ring-slate-200",
};

function Stepper({ stage }) {
  const current = STEPS.findIndex((s) => s.key === stage);
  return (
    <ol className="flex items-start">
      {STEPS.map((step, i) => {
        const done = i < current || stage === "report_submitted";
        const active = i === current && stage !== "report_submitted";
        return (
          <li key={step.key} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 ? (
              <span
                className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 ${
                  i <= current || stage === "report_submitted" ? "bg-amber-500" : "bg-slate-200"
                }`}
              />
            ) : null}
            <span
              className={`relative z-1 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                done
                  ? "bg-amber-500 text-white"
                  : active
                    ? "bg-white text-amber-600 ring-2 ring-amber-500"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`mt-1.5 px-0.5 text-[10px] font-bold leading-tight ${done || active ? "text-slate-800" : "text-slate-400"}`}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The customer's view of one booked site visit: who is coming, the OTP to give them on
 * arrival, and — once the office has read the contractor's report — a link to the quotation.
 */
export default function SiteVisitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setRequest(await constructionApi.getMySiteVisit(id));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load this booking"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // The OTP appears and the stages move while this screen is open: keep it live.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const run = async (name, fn, success) => {
    setBusy(name);
    try {
      setRequest(await fn());
      if (success) toast.success(success);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "That did not work. Please try again."));
      await load();
      return false;
    } finally {
      setBusy("");
    }
  };

  const newOtp = () => run("otp", () => constructionApi.regenerateVisitOtp(id), "New OTP generated");

  if (loading) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Site visit" backTo="/construction/site-visits" />
        <div className="space-y-3 px-4 py-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/80" />
          ))}
        </div>
      </ConstructionPageShell>
    );
  }

  if (!request) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Site visit" backTo="/construction/site-visits" />
        <p className="px-4 py-16 text-center text-sm text-slate-500">We could not find this booking.</p>
      </ConstructionPageShell>
    );
  }

  const info = headline(request);
  const visit = request.visit;
  const contract = request.contract;

  return (
    <ConstructionPageShell showBottomNav={false}>
      <ConstructionPageHeader
        title="Site visit"
        subtitle={`${request.reference} · ${request.package?.name || ""}`}
        backTo="/construction/site-visits"
      />

      <div className="space-y-4 px-4 py-5">
        <div className={`rounded-xl p-4 ring-1 ring-inset ${TONE[info.tone]}`}>
          <p className="text-base font-extrabold">{info.title}</p>
          <p className="mt-1 text-[13px] font-medium opacity-80">{info.detail}</p>
        </div>

        {visit ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <Stepper stage={visit.stage} />
          </div>
        ) : null}

        {/* The OTP — only while the contractor is travelling */}
        {visit?.stage === "on_the_way" ? (
          <div className="rounded-xl border-2 border-amber-400 bg-white p-4 text-center">
            <p className="flex items-center justify-center gap-1.5 text-[13px] font-extrabold text-slate-700">
              <KeyRound className="h-4 w-4 text-amber-500" /> Your visit OTP
            </p>
            {visit.otp && !visit.otpLocked ? (
              <p className="mt-2 font-mono text-[34px] font-black tracking-[0.35em] text-slate-900">{visit.otp}</p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-red-600">
                Too many wrong attempts — generate a new OTP.
              </p>
            )}
            <p className="mt-1.5 text-[12px] font-medium text-slate-500">
              Only tell this to your contractor when they are at your site. It confirms that they really visited.
            </p>
            <button
              type="button"
              onClick={newOtp}
              disabled={Boolean(busy)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy === "otp" ? "animate-spin" : ""}`} />
              Generate a new OTP
            </button>
          </div>
        ) : null}

        {/* The contractor */}
        {request.contractor ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Your contractor</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                <HardHat className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-slate-900">{request.contractor.name}</p>
                {request.contractor.owner ? (
                  <p className="truncate text-xs font-medium text-slate-500">{request.contractor.owner}</p>
                ) : null}
              </div>
              {request.contractor.phone ? (
                <a
                  href={`tel:${request.contractor.phone}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                >
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
              ) : null}
            </div>
            {visit?.startedAt || visit?.arrivedAt ? (
              <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">
                {visit.startedAt ? <li>Set off · {dateTime(visit.startedAt)}</li> : null}
                {visit.arrivedAt ? <li>Reached your site · {dateTime(visit.arrivedAt)}</li> : null}
                {visit.reportSubmittedAt ? <li>Report sent · {dateTime(visit.reportSubmittedAt)}</li> : null}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* The quotation — the full details, and the accept / decline, live on its own page */}
        {contract ? (
          <div className={`rounded-xl border bg-white p-4 ${contract.status === "sent" && !contract.expired ? "border-amber-300" : "border-slate-200"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[15px] font-extrabold text-slate-900">
                  <FileSignature className="h-4 w-4 text-amber-500" /> Quotation
                </p>
                <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-400">{contract.number}</p>
              </div>
              <span className="text-lg font-black tabular-nums text-slate-900">{fullMoney(contract.price)}</span>
            </div>
            <p className="mt-1.5 text-xs font-semibold text-slate-500">
              {contract.expired
                ? "Expired"
                : { sent: "Awaiting your answer", accepted: "You accepted this quotation", rejected: "You declined this quotation" }[contract.status]}
              {contract.status === "sent" && !contract.expired && contract.validUntil ? ` · valid until ${shortDate(contract.validUntil)}` : ""}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/construction/quotations/visit/${request.id}`)}
              className="mt-3 w-full rounded-lg bg-amber-500 py-2.5 text-sm font-extrabold text-white hover:bg-amber-600"
            >
              {contract.status === "sent" && !contract.expired ? "View quotation & respond" : "View quotation"}
            </button>
          </div>
        ) : null}

        {/* The booking itself */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Your booking</p>
          <div className="mt-2 space-y-1.5 text-slate-600">
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                {request.site?.address || [request.site?.area, request.site?.city].filter(Boolean).join(", ")}
                {request.site?.landmark ? <span className="block text-xs text-slate-500">Landmark: {request.site.landmark}</span> : null}
              </span>
            </p>
            <p>
              {Number(request.site?.totalBuiltUpArea || 0).toLocaleString("en-IN")} sq.ft · {request.package?.name} · ≈{" "}
              {fullMoney(request.estimatedCost)}
            </p>
            {request.visitingFee > 0 ? <p>Visiting fee paid: {fullMoney(request.visitingFee)}</p> : null}
            <p className="text-xs text-slate-400">Booked {dateTime(request.createdAt)}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/construction/site-visits")}
          className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-bold text-slate-700 hover:bg-white"
        >
          All my site visits
        </button>
      </div>
    </ConstructionPageShell>
  );
}
