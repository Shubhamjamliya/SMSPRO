import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, MapPin, Truck, XCircle } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";
import { dateTime, fullMoney, shortDate } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;
const shortRef = (id) => `#${String(id).slice(-6).toUpperCase()}`;

const STATUS = {
  new: { label: "Sent — awaiting review", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  quoted: { label: "Quote ready — respond", tone: "bg-blue-50 text-blue-800 ring-blue-200" },
  accepted: { label: "Accepted — preparing delivery", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  rejected: { label: "Quote declined", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  dispatched: { label: "On the way", tone: "bg-blue-50 text-blue-800 ring-blue-200" },
  delivered: { label: "Delivered", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  cancelled: { label: "Cancelled", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
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
 * One material request in full — what was asked for, the office's quotation (once
 * sent) and where it stands. The customer accepts or declines the quotation here,
 * the same shape of screen `SiteQuotationDetail.jsx` uses for a package quotation.
 */
export default function MaterialRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState("");

  const load = useCallback(async () => {
    try {
      setRequest(await constructionApi.getMyMaterialRequest(id));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load this request"));
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

  const accept = () => run("accept", () => constructionApi.acceptMaterialQuotation(id), "Accepted — our team will arrange delivery");
  const decline = async () => {
    const ok = await run("decline", () => constructionApi.rejectMaterialQuotation(id, declineNote.trim()), "Quotation declined");
    if (ok) {
      setDeclining(false);
      setDeclineNote("");
    }
  };

  const back = "/construction/material-requests";

  if (loading) {
    return (
      <ConstructionPageShell showBottomNav={false}>
        <ConstructionPageHeader title="Material request" backTo={back} />
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
        <ConstructionPageHeader title="Material request" backTo={back} />
        <p className="px-4 py-16 text-center text-sm text-slate-500">We could not find this request.</p>
      </ConstructionPageShell>
    );
  }

  const quotation = request.quotation;
  const hasQuotation = quotation && quotation.status !== "none";
  const canAnswer = quotation?.status === "sent" && !quotation.expired && request.status === "quoted";
  const status = STATUS[request.status] || STATUS.new;
  const delivery = request.delivery || {};

  return (
    <ConstructionPageShell showBottomNav={false}>
      <ConstructionPageHeader title="Material request" subtitle={shortRef(request._id)} backTo={back} />

      <div className="space-y-4 px-4 py-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-extrabold text-slate-500">
                {hasQuotation ? "Total quoted" : "Estimated total (list price)"}
              </p>
              <p className="mt-1 text-[30px] font-black leading-none tabular-nums text-slate-900">
                {fullMoney(hasQuotation ? quotation.grandTotal : request.estimatedTotal)}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ring-inset ${status.tone}`}>
              {status.label}
            </span>
          </div>
          <p className="mt-3 text-[12px] font-medium text-slate-500">
            Sent {shortDate(request.createdAt)}
            {canAnswer && quotation.validUntil ? ` · quote valid until ${shortDate(quotation.validUntil)}` : ""}
          </p>
        </div>

        <Block title="Materials requested">
          <div className="overflow-hidden rounded-lg border border-slate-200 text-sm">
            {(request.items || []).map((line, index) => (
              <div key={`${line.materialId}-${index}`} className="flex items-start justify-between gap-3 border-t border-slate-100 px-3 py-2.5 first:border-t-0">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{line.name}</p>
                  <p className="text-xs text-slate-500">{[line.brand, line.category].filter(Boolean).join(" · ")}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-slate-600">
                    {line.quantity} × {fullMoney(line.price)} {line.unit}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-slate-900">{fullMoney(line.lineTotal)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between bg-slate-50 px-3 py-2.5">
              <span className="font-semibold text-slate-700">Estimated total (at list price)</span>
              <span className="font-bold tabular-nums text-slate-900">{fullMoney(request.estimatedTotal)}</span>
            </div>
          </div>
        </Block>

        {hasQuotation ? (
          <Block title="Quotation breakdown">
            <div className="overflow-hidden rounded-lg border border-slate-200 text-sm">
              <Row label="Materials">{fullMoney(quotation.itemsTotal)}</Row>
              {quotation.transportCharge > 0 ? <Row label="Transport / delivery">{fullMoney(quotation.transportCharge)}</Row> : null}
              {quotation.otherCharges > 0 ? (
                <Row label={quotation.otherChargesNote || "Other charges"}>{fullMoney(quotation.otherCharges)}</Row>
              ) : null}
              <Row label="Grand total" strong>{fullMoney(quotation.grandTotal)}</Row>
            </div>
            {quotation.notes ? (
              <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{quotation.notes}</p>
            ) : null}
          </Block>
        ) : null}

        <Block title="Deliver to">
          <p className="flex items-start gap-1.5 text-sm text-slate-700">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              {[delivery.address, delivery.landmark, delivery.city, delivery.state, delivery.pincode]
                .filter(Boolean)
                .join(", ")}
            </span>
          </p>
        </Block>

        {["dispatched", "delivered"].includes(request.status) ? (
          <Block title="Delivery">
            <div className="flex items-start gap-2 text-sm text-slate-700">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <div>
                {delivery.dispatchedAt ? <p>Dispatched {dateTime(delivery.dispatchedAt)}</p> : null}
                {delivery.deliveredAt ? <p>Delivered {dateTime(delivery.deliveredAt)}</p> : null}
                {delivery.trackingNote ? <p className="mt-1 text-slate-600">{delivery.trackingNote}</p> : null}
              </div>
            </div>
          </Block>
        ) : null}

        {request.notes ? (
          <Block title="Your note">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{request.notes}</p>
          </Block>
        ) : null}

        {request.status === "new" ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-800">
            Our team is reviewing your request. You will be told as soon as a quotation is ready.
          </p>
        ) : null}
        {quotation?.status === "accepted" && request.status === "accepted" ? (
          <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> You accepted this quotation on {dateTime(quotation.respondedAt)}. Our team is arranging delivery.
          </p>
        ) : null}
        {quotation?.status === "rejected" ? (
          <p className="flex items-start gap-1.5 rounded-xl bg-slate-100 px-4 py-3 text-[13px] font-bold text-slate-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              You declined this quotation on {dateTime(quotation.respondedAt)}.
              {quotation.responseNote ? ` “${quotation.responseNote}”` : ""} Our team may send you a revised quote.
            </span>
          </p>
        ) : null}
        {quotation?.expired ? (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-[13px] font-bold text-slate-700">
            This quotation has expired. Our team can send you a fresh one.
          </p>
        ) : null}
        {request.status === "cancelled" ? (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-[13px] font-bold text-slate-700">
            This request was cancelled.
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[14px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
              <button type="button" onClick={accept} disabled={Boolean(busy)} className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-extrabold text-white hover:bg-blue-500 disabled:opacity-50">
                {busy === "accept" ? "…" : `Accept · ${fullMoney(quotation.grandTotal)}`}
              </button>
            </div>
          )
        ) : null}

        <button
          type="button"
          onClick={() => navigate("/construction/materials")}
          className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700"
        >
          Back to materials
        </button>
      </div>
    </ConstructionPageShell>
  );
}
