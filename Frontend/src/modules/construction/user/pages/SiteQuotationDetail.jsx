import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, FileSignature, HardHat, MapPin, Phone, XCircle } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";
import { dateTime, fullMoney, shortDate } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const yesNo = (v) => (v === true ? "Yes" : v === false ? "No" : "—");

const STATUS = {
  sent: { label: "Awaiting your answer", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  accepted: { label: "Accepted", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  rejected: { label: "Declined", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  expired: { label: "Expired", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
};

function Row({ label, children, strong }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-slate-100 px-3 py-2.5 first:border-t-0">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right ${strong ? "font-black tabular-nums text-slate-900" : "text-slate-900"}`}>{children}</span>
    </div>
  );
}

function Block({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * One quotation in full — the price and terms the office sent after the site visit, and
 * the site findings they are based on. The customer accepts or declines it here.
 */
export default function SiteQuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState("");

  const load = useCallback(async () => {
    try {
      setRequest(await constructionApi.getMySiteVisit(id));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load this quotation"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (name, fn, success) => {
    setBusy(name);
    try {
      setRequest(await fn());
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "That did not work. Please try again."));
      await load();
      return false;
    } finally {
      setBusy("");
    }
  };

  const accept = () => run("accept", () => constructionApi.acceptSiteVisitContract(id), "Quotation accepted");
  const decline = async () => {
    const ok = await run("decline", () => constructionApi.declineSiteVisitContract(id, declineNote.trim()), "Quotation declined");
    if (ok) {
      setDeclining(false);
      setDeclineNote("");
    }
  };

  const back = "/construction/quotations";

  if (loading) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Quotation" backTo={back} />
        <div className="space-y-3 px-4 py-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/80" />
          ))}
        </div>
      </ConstructionPageShell>
    );
  }

  const contract = request?.contract;
  if (!request || !contract) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Quotation" backTo={back} />
        <p className="px-4 py-16 text-center text-sm text-slate-500">
          {request ? "The office has not sent a quotation for this booking yet." : "We could not find this quotation."}
        </p>
      </ConstructionPageShell>
    );
  }

  const state = contract.expired ? "expired" : contract.status;
  const status = STATUS[state] || STATUS.sent;
  const canAnswer = contract.status === "sent" && !contract.expired;
  const report = request.visit?.report;
  const balance = Math.max(0, (contract.price || 0) - (contract.advanceAmount || 0));

  return (
    <ConstructionPageShell showBottomNav={false}>
      <ConstructionPageHeader title="Quotation" subtitle={`${contract.number} · ${request.package?.name || ""}`} backTo={back} />

      <div className="space-y-4 px-4 py-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-slate-500">
                <FileSignature className="h-4 w-4 text-amber-500" /> Total quoted price
              </p>
              <p className="mt-1 text-[30px] font-black leading-none tabular-nums text-slate-900">{fullMoney(contract.price)}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ring-inset ${status.tone}`}>
              {status.label}
            </span>
          </div>
          <p className="mt-3 text-[12px] font-medium text-slate-500">
            {contract.revision > 1 ? `Revision ${contract.revision} · ` : ""}Sent {contract.sentAt ? dateTime(contract.sentAt) : "—"}
            {canAnswer && contract.validUntil ? ` · valid until ${shortDate(contract.validUntil)}` : ""}
          </p>
        </div>

        <Block title="Price breakdown">
          <div className="overflow-hidden rounded-lg border border-slate-200 text-sm">
            <Row label="Package estimate at booking">{fullMoney(request.estimatedCost)}</Row>
            <Row label="Quoted price" strong>{fullMoney(contract.price)}</Row>
            {contract.advanceAmount > 0 ? <Row label="Advance to start work">{fullMoney(contract.advanceAmount)}</Row> : null}
            {contract.advanceAmount > 0 ? <Row label="Balance, paid in stages">{fullMoney(balance)}</Row> : null}
            {request.visitingFee > 0 ? <Row label="Visiting fee already paid">{fullMoney(request.visitingFee)}</Row> : null}
            {contract.durationDays ? <Row label="Estimated duration">{contract.durationDays} days</Row> : null}
          </div>
        </Block>

        {contract.scope ? (
          <Block title="Scope of work">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{contract.scope}</p>
          </Block>
        ) : null}

        <Block title="Terms">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{contract.terms}</p>
        </Block>

        {report ? (
          <Block title="Site visit findings">
            <div className="overflow-hidden rounded-lg border border-slate-200 text-sm">
              {report.plotAreaSqft ? <Row label="Plot area">{report.plotAreaSqft} sq.ft</Row> : null}
              {report.builtUpAreaSqft ? <Row label="Built-up area">{report.builtUpAreaSqft} sq.ft</Row> : null}
              {report.floorsPlanned ? <Row label="Floors planned">{report.floorsPlanned}</Row> : null}
              {report.access ? <Row label="Site access"><span className="capitalize">{report.access}</span></Row> : null}
              <Row label="Water available">{yesNo(report.waterAvailable)}</Row>
              <Row label="Electricity available">{yesNo(report.electricityAvailable)}</Row>
              {report.estimatedDurationDays ? <Row label="Contractor's duration estimate">{report.estimatedDurationDays} days</Row> : null}
            </div>
            {[
              ["Measurements", report.measurements],
              ["Site condition", report.siteCondition],
              ["Recommended scope", report.recommendedScope],
              ["Observations", report.observations],
            ].map(([label, value]) =>
              value ? (
                <div key={label} className="mt-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{value}</p>
                </div>
              ) : null
            )}
            {report.photos?.length ? (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Site photos</p>
                <div className="grid grid-cols-3 gap-2">
                  {report.photos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="Site" className="h-20 w-full rounded-lg border border-slate-200 object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </Block>
        ) : null}

        {request.contractor ? (
          <Block title="Prepared for your visit by">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                <HardHat className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-slate-900">{request.contractor.name}</p>
                {request.visit?.reportSubmittedAt ? (
                  <p className="text-xs font-medium text-slate-500">Report sent {dateTime(request.visit.reportSubmittedAt)}</p>
                ) : null}
              </div>
              {request.contractor.phone ? (
                <a href={`tel:${request.contractor.phone}`} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
              ) : null}
            </div>
          </Block>
        ) : null}

        <Block title="Your booking">
          <div className="space-y-1.5 text-sm text-slate-600">
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{[request.site?.area, request.site?.city].filter(Boolean).join(", ")}</span>
            </p>
            <p>
              {request.package?.name} · {Number(request.site?.totalBuiltUpArea || 0).toLocaleString("en-IN")} sq.ft · ref {request.reference}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/construction/site-visits/${request.id}`)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-700 hover:underline"
          >
            <ClipboardList className="h-3.5 w-3.5" /> View site visit
          </button>
        </Block>

        {contract.status === "accepted" ? (
          <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> You accepted this quotation on {dateTime(contract.respondedAt)}. Our team will contact you about starting the work.
          </p>
        ) : null}
        {contract.status === "rejected" ? (
          <p className="flex items-start gap-1.5 rounded-xl bg-slate-100 px-4 py-3 text-[13px] font-bold text-slate-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              You declined this quotation on {dateTime(contract.respondedAt)}.
              {contract.responseNote ? ` “${contract.responseNote}”` : ""} Our team will get in touch.
            </span>
          </p>
        ) : null}
        {contract.expired ? (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-[13px] font-bold text-slate-700">
            This quotation has expired. Our team can send you a fresh one.
          </p>
        ) : null}

        {canAnswer ? (
          declining ? (
            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4">
              <textarea
                rows={3}
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                placeholder="What would you like changed? (optional)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[14px] outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setDeclining(false)} disabled={Boolean(busy)} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-bold text-slate-700">
                  Back
                </button>
                <button type="button" onClick={decline} disabled={Boolean(busy)} className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  {busy === "decline" ? "…" : "Decline quotation"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeclining(true)} disabled={Boolean(busy)} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Decline
              </button>
              <button type="button" onClick={accept} disabled={Boolean(busy)} className="flex-1 rounded-lg bg-amber-500 py-3 text-sm font-extrabold text-white hover:bg-amber-600 disabled:opacity-50">
                {busy === "accept" ? "…" : `Accept · ${fullMoney(contract.price)}`}
              </button>
            </div>
          )
        ) : null}
      </div>
    </ConstructionPageShell>
  );
}
