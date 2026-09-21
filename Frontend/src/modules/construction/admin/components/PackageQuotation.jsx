import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import constructionAdminApi from "../services/adminApi";
import { dateTime, fullMoney } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

export const VISIT_STAGE_TEXT = {
  assigned: "Visit not started",
  on_the_way: "On the way",
  arrived: "At the site",
  report_submitted: "Report received",
};

const DEFAULT_TERMS =
  "1. The price above is for the scope of work described and is fixed unless the scope changes in writing.\n" +
  "2. The advance is due before work starts; the balance is paid in stages as work is completed.\n" +
  "3. Any change to the scope is agreed in writing before it is carried out.\n" +
  "4. The contractor is responsible for materials and labour unless stated otherwise.";

/** What the quotation form starts with: the contractor's own scope and duration, and the package estimate as a price to adjust. */
const contractDefaults = (row) => ({
  price: String(row.contract?.price || Math.round(row.estimatedCost || 0) || ""),
  advanceAmount: row.contract?.advanceAmount ? String(row.contract.advanceAmount) : "",
  durationDays: String(row.contract?.durationDays || row.visit?.report?.estimatedDurationDays || ""),
  scope: row.contract?.scope || row.visit?.report?.recommendedScope || "",
  terms: row.contract?.terms || DEFAULT_TERMS,
  validDays: "7",
});

const yesNo = (v) => (v === true ? "Yes" : v === false ? "No" : "—");

/** Where the site visit is, and what the contractor reported. */
export function SiteVisitSection({ request }) {
  const selected = request;
  return (
    <>
              {/* Site visit: where it is, and what the contractor reported */}
              {selected.assignedContractorId ? (
                <div className="overflow-hidden rounded-xl border border-gray-200 text-sm">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="font-semibold text-gray-700">Site visit</span>
                    <span className="text-xs font-semibold text-[#FF6A00]">
                      {VISIT_STAGE_TEXT[selected.visit?.stage || "assigned"]}
                    </span>
                  </div>
                  {selected.visit?.startedAt ? (
                    <div className="flex justify-between border-t border-gray-100 px-3 py-2">
                      <span className="text-gray-500">Journey started</span>
                      <span className="text-gray-900">{dateTime(selected.visit.startedAt)}</span>
                    </div>
                  ) : null}
                  {selected.visit?.arrivedAt ? (
                    <div className="flex justify-between border-t border-gray-100 px-3 py-2">
                      <span className="text-gray-500">Arrival confirmed (OTP)</span>
                      <span className="text-gray-900">{dateTime(selected.visit.arrivedAt)}</span>
                    </div>
                  ) : null}

                  {selected.visit?.report && selected.visit.stage !== "assigned" ? (
                    <div className="space-y-2 border-t border-gray-100 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Site visit report {selected.visit.report.status === "submitted" ? "" : "(draft — not sent yet)"}
                      </p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div><dt className="text-gray-500">Plot area</dt><dd className="text-gray-900">{selected.visit.report.plotAreaSqft ?? "—"} sq.ft</dd></div>
                        <div><dt className="text-gray-500">Built-up area</dt><dd className="text-gray-900">{selected.visit.report.builtUpAreaSqft ?? "—"} sq.ft</dd></div>
                        <div><dt className="text-gray-500">Floors planned</dt><dd className="text-gray-900">{selected.visit.report.floorsPlanned ?? "—"}</dd></div>
                        <div><dt className="text-gray-500">Access</dt><dd className="capitalize text-gray-900">{selected.visit.report.access || "—"}</dd></div>
                        <div><dt className="text-gray-500">Water</dt><dd className="text-gray-900">{yesNo(selected.visit.report.waterAvailable)}</dd></div>
                        <div><dt className="text-gray-500">Electricity</dt><dd className="text-gray-900">{yesNo(selected.visit.report.electricityAvailable)}</dd></div>
                        <div><dt className="text-gray-500">Contractor's duration estimate</dt><dd className="text-gray-900">{selected.visit.report.estimatedDurationDays ?? "—"} days</dd></div>
                      </dl>
                      {[
                        ["Measurements", selected.visit.report.measurements],
                        ["Site condition", selected.visit.report.siteCondition],
                        ["Recommended scope", selected.visit.report.recommendedScope],
                        ["Observations", selected.visit.report.observations],
                        ["Note for the office", selected.visit.report.notesForOffice],
                      ].map(([label, value]) =>
                        value ? (
                          <div key={label}>
                            <p className="text-xs text-gray-500">{label}</p>
                            <p className="whitespace-pre-wrap text-gray-900">{value}</p>
                          </div>
                        ) : null
                      )}
                      {selected.visit.report.photos?.length ? (
                        <div>
                          <p className="mb-1 text-xs text-gray-500">Photos ({selected.visit.report.photos.length})</p>
                          <div className="grid grid-cols-4 gap-2">
                            {selected.visit.report.photos.map((url) => (
                              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt="Site" className="h-16 w-full rounded-lg border border-gray-200 object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

    </>
  );
}

const CONTRACT_STATE = {
  sent: { label: "Awaiting customer", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Declined", tone: "danger" },
};

const hasQuotation = (request) => Boolean(request.contract?.status && request.contract.status !== "none");

function DetailRow({ label, children, strong }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-gray-100 px-3 py-2.5 first:border-t-0">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right ${strong ? "font-bold tabular-nums text-gray-900" : "text-gray-900"}`}>{children}</span>
    </div>
  );
}

/** Everything about the quotation that was sent: the money, the dates, the customer's answer, the words. */
export function QuotationDetails({ request }) {
  const c = request.contract;
  if (!hasQuotation(request)) return null;

  const expired = c.status === "sent" && c.validUntil && new Date(c.validUntil) < new Date();
  const state = CONTRACT_STATE[c.status];
  const balance = Math.max(0, (c.price || 0) - (c.advanceAmount || 0));

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <span className="font-semibold text-gray-700">
          Quotation {c.number}
          {c.revision > 1 ? <span className="ml-1.5 text-xs font-normal text-gray-400">revision {c.revision}</span> : null}
        </span>
        <StatusBadge tone={expired ? "neutral" : state?.tone} label={expired ? "Expired" : state?.label} />
      </div>

      <div className="border-t border-gray-100">
        <DetailRow label="Quoted price" strong>{fullMoney(c.price)}</DetailRow>
        <DetailRow label="Package estimate at booking">{fullMoney(request.estimatedCost)}</DetailRow>
        {c.advanceAmount > 0 ? <DetailRow label="Advance to start">{fullMoney(c.advanceAmount)}</DetailRow> : null}
        {c.advanceAmount > 0 ? <DetailRow label="Balance, paid in stages">{fullMoney(balance)}</DetailRow> : null}
        {c.durationDays ? <DetailRow label="Duration">{c.durationDays} days</DetailRow> : null}
        {request.visitingFee > 0 ? <DetailRow label="Visiting fee paid">{fullMoney(request.visitingFee)}</DetailRow> : null}
        <DetailRow label="Sent">{c.sentAt ? dateTime(c.sentAt) : "—"}</DetailRow>
        <DetailRow label="Valid until">{c.validUntil ? dateTime(c.validUntil) : "—"}</DetailRow>
        {c.respondedAt ? (
          <DetailRow label={c.status === "accepted" ? "Accepted on" : "Declined on"}>{dateTime(c.respondedAt)}</DetailRow>
        ) : null}
      </div>

      {c.status === "rejected" && c.responseNote ? (
        <div className="border-t border-gray-100 bg-red-50/60 px-3 py-2.5 text-xs text-red-800">
          Customer's reason: {c.responseNote}
        </div>
      ) : null}
      {c.status === "accepted" ? (
        <div className="border-t border-gray-100 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-800">
          The customer accepted this quotation. The request is marked Won.
        </div>
      ) : null}

      {c.scope ? (
        <div className="border-t border-gray-100 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scope of work</p>
          <p className="mt-1 whitespace-pre-wrap text-gray-900">{c.scope}</p>
        </div>
      ) : null}
      <div className="border-t border-gray-100 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Terms</p>
        <p className="mt-1 whitespace-pre-wrap text-gray-900">{c.terms}</p>
      </div>
    </div>
  );
}

/**
 * The quotation for a request: its full details once one has been sent, and the form to write
 * or revise it. Give it a `key` that changes when the request or its revision does, so the
 * form starts from the right values.
 *
 * Nothing shows until the contractor's site visit report is in — there is nothing to price yet.
 */
export function ContractPanel({ request, onChanged }) {
  const selected = request;
  const existing = hasQuotation(selected);
  const [contractForm, setContractForm] = useState(contractDefaults(request));
  const [contractBusy, setContractBusy] = useState(false);
  // With no quotation yet the form is the whole point; once one exists it is opened on purpose.
  const [editing, setEditing] = useState(false);

  if (!selected.assignedContractorId || selected.visit?.stage !== "report_submitted") return null;

  const sendContract = async () => {
    setContractBusy(true);
    try {
      await constructionAdminApi.sendPackageContract(selected._id, {
        price: contractForm.price,
        advanceAmount: contractForm.advanceAmount,
        durationDays: contractForm.durationDays,
        scope: contractForm.scope,
        terms: contractForm.terms,
        validDays: contractForm.validDays,
      });
      toast.success("Quotation sent to the customer");
      setEditing(false);
      await onChanged?.();
    } catch (error) {
      toast.error(errorMessage(error, "Could not send the quotation"));
    } finally {
      setContractBusy(false);
    }
  };

  const canEdit = selected.contract?.status !== "accepted";
  const showForm = canEdit && (!existing || editing);

  return (
    <div className="space-y-3">
      <QuotationDetails request={selected} />

      {showForm ? (
        <div className="space-y-3 rounded-xl border border-gray-200 px-3 py-3 text-sm">
          <p className="font-semibold text-gray-700">{existing ? "Revise the quotation" : "Write the quotation"}</p>
          <p className="text-xs text-gray-500">
            {existing
              ? "Sending again replaces the quotation above with a revised one and restarts its validity."
              : "Review the site visit report, set the price and terms, and send it to the customer to accept."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Agreed price (₹)"
              inputMode="decimal"
              value={contractForm.price}
              onChange={(e) => setContractForm((f) => ({ ...f, price: e.target.value }))}
            />
            <Input
              label="Advance to start (₹)"
              inputMode="decimal"
              value={contractForm.advanceAmount}
              onChange={(e) => setContractForm((f) => ({ ...f, advanceAmount: e.target.value }))}
            />
            <Input
              label="Duration (days)"
              inputMode="numeric"
              value={contractForm.durationDays}
              onChange={(e) => setContractForm((f) => ({ ...f, durationDays: e.target.value }))}
            />
            <Input
              label="Offer valid for (days)"
              inputMode="numeric"
              value={contractForm.validDays}
              onChange={(e) => setContractForm((f) => ({ ...f, validDays: e.target.value }))}
            />
          </div>
          <label className="block text-sm">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Scope of work</span>
            <Textarea
              rows={3}
              value={contractForm.scope}
              onChange={(e) => setContractForm((f) => ({ ...f, scope: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Terms</span>
            <Textarea
              rows={6}
              value={contractForm.terms}
              onChange={(e) => setContractForm((f) => ({ ...f, terms: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <Button size="sm" isLoading={contractBusy} onClick={sendContract}>
              {existing ? "Send revised quotation" : "Send quotation to customer"}
            </Button>
            {existing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={contractBusy}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : canEdit && existing ? (
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Revise and resend
        </Button>
      ) : null}
    </div>
  );
}
