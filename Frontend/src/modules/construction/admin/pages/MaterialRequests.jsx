import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, MapPin, Phone, ShoppingBasket, Truck } from "lucide-react";
import { PageHeader, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import constructionAdminApi from "../services/adminApi";
import { dateTime, fullMoney } from "../../shared/format";
import {
  CN_ADMIN_PAGE_CLASS,
  CN_DIALOG_CONTENT_CLASS,
} from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const PAGE_SIZE = 20;

/** The order a request normally travels in. Cancelled can happen from anywhere before delivered. */
const STATUSES = [
  { value: "new", label: "New", tone: "warning" },
  { value: "quoted", label: "Quoted", tone: "primary" },
  { value: "accepted", label: "Accepted", tone: "success" },
  { value: "rejected", label: "Declined", tone: "danger" },
  { value: "dispatched", label: "Dispatched", tone: "info" },
  { value: "delivered", label: "Delivered", tone: "success" },
  { value: "cancelled", label: "Cancelled", tone: "danger" },
];

const statusMeta = (value) => STATUSES.find((s) => s.value === value) || STATUSES[0];

/** Total to show for a row: the office's quoted price once there is one, otherwise the list-price estimate. */
const displayTotal = (row) =>
  row.quotation?.status && row.quotation.status !== "none" ? row.quotation.grandTotal : row.estimatedTotal;

/** A short reference the office can read out over the phone. */
const shortRef = (row) => `#${String(row._id).slice(-6).toUpperCase()}`;

const itemCount = (row) => {
  const n = row.items?.length || 0;
  return `${n} item${n === 1 ? "" : "s"}`;
};

const EMPTY_QUOTE_FORM = { transportCharge: "0", otherCharges: "0", otherChargesNote: "", notes: "", validUntil: "" };

export default function MaterialRequests() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [quoteForm, setQuoteForm] = useState(EMPTY_QUOTE_FORM);
  const [sendingQuote, setSendingQuote] = useState(false);

  const [trackingNote, setTrackingNote] = useState("");
  const [deliveryBusy, setDeliveryBusy] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await constructionAdminApi.getMaterialRequests({
        status: status || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(result.rows);
      setMeta(result.meta);
      setCounts(result.counts);
      setSelected((current) => (current ? result.rows.find((r) => r._id === current._id) || current : current));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load material requests"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page]);

  const totalAll = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const openRequest = (row) => {
    setSelected(row);
    setAdminNote(row.adminNote || "");
    setQuoteForm(EMPTY_QUOTE_FORM);
    setTrackingNote(row.delivery?.trackingNote || "");
    setCancelOpen(false);
    setCancelReason("");
  };

  const closeDialog = () => {
    setSelected(null);
    setCancelOpen(false);
  };

  const saveNote = async () => {
    if (!selected) return;
    setSavingNote(true);
    try {
      await constructionAdminApi.updateMaterialRequestNote(selected._id, adminNote);
      toast.success("Note saved");
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not save the note"));
    } finally {
      setSavingNote(false);
    }
  };

  const itemsTotal = selected?.estimatedTotal || 0;
  const quoteGrandTotal = itemsTotal + (Number(quoteForm.transportCharge) || 0) + (Number(quoteForm.otherCharges) || 0);

  const sendQuotation = async () => {
    if (!selected) return;
    setSendingQuote(true);
    try {
      const request = await constructionAdminApi.sendMaterialQuotation(selected._id, {
        transportCharge: Number(quoteForm.transportCharge) || 0,
        otherCharges: Number(quoteForm.otherCharges) || 0,
        otherChargesNote: quoteForm.otherChargesNote.trim(),
        notes: quoteForm.notes.trim(),
        validUntil: quoteForm.validUntil || undefined,
      });
      toast.success("Quotation sent to the customer");
      setSelected(request);
      setQuoteForm(EMPTY_QUOTE_FORM);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not send the quotation"));
    } finally {
      setSendingQuote(false);
    }
  };

  const markDispatched = async () => {
    if (!selected) return;
    setDeliveryBusy("dispatch");
    try {
      const request = await constructionAdminApi.dispatchMaterialRequest(selected._id, trackingNote.trim());
      toast.success("Marked as dispatched");
      setSelected(request);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the request"));
    } finally {
      setDeliveryBusy("");
    }
  };

  const markDelivered = async () => {
    if (!selected) return;
    setDeliveryBusy("deliver");
    try {
      const request = await constructionAdminApi.deliverMaterialRequest(selected._id, trackingNote.trim());
      toast.success("Marked as delivered");
      setSelected(request);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the request"));
    } finally {
      setDeliveryBusy("");
    }
  };

  const cancelRequest = async () => {
    if (!selected || cancelReason.trim().length < 3) {
      toast.error("Give a short reason for cancelling");
      return;
    }
    setCancelling(true);
    try {
      await constructionAdminApi.cancelMaterialRequest(selected._id, cancelReason.trim());
      toast.success("Request cancelled");
      closeDialog();
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not cancel the request"));
    } finally {
      setCancelling(false);
    }
  };

  const statusChip = (row) => {
    const info = statusMeta(row.status);
    return <StatusBadge tone={info.tone} label={info.label} />;
  };

  const columns = [
    {
      key: "ref",
      header: "Request",
      cell: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{shortRef(row)}</p>
          <p className="text-xs text-gray-500">{dateTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{row.contact?.name}</p>
          <a
            href={`tel:${row.contact?.phone}`}
            className="text-xs text-[#FF6A00] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.contact?.phone}
          </a>
        </div>
      ),
    },
    { key: "city", header: "Deliver to", cell: (row) => row.delivery?.city || "—" },
    {
      key: "items",
      header: "Items",
      cell: (row) => (
        <div>
          <p className="text-sm text-gray-900">{itemCount(row)}</p>
          <p className="text-xs tabular-nums text-gray-500">
            {row.quotation?.status && row.quotation.status !== "none" ? "" : "≈ "}
            {fullMoney(displayTotal(row))}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: statusChip },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button variant="outline" size="sm" onClick={() => openRequest(row)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View
        </Button>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">
            {shortRef(row)} · {row.contact?.name}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {dateTime(row.createdAt)} · {row.delivery?.city}
          </p>
        </div>
        {statusChip(row)}
      </div>
      <p className="mt-2 text-xs text-gray-600">
        {itemCount(row)} · {fullMoney(displayTotal(row))}
      </p>
      <div className="mt-3 border-t border-gray-200/80 pt-2">
        <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => openRequest(row)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View request
        </Button>
      </div>
    </div>
  );

  const tabClass = (active) =>
    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
    (active
      ? "border-[#FF6A00] bg-[#FFF3EB] text-[#FF6A00]"
      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50");

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <PageHeader
        eyebrow="Construction · Material Services"
        title="Material Requests"
        description="Quote requests customers send from the Materials section of the app. Review each one, send a quotation with the transport and other charges, and once the customer accepts, arrange delivery."
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          className={tabClass(status === "")}
          onClick={() => {
            setStatus("");
            setPage(1);
          }}
        >
          All ({totalAll})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={tabClass(status === s.value)}
            onClick={() => {
              setStatus(s.value);
              setPage(1);
            }}
          >
            {s.label} ({counts[s.value] || 0})
          </button>
        ))}
      </div>

      <AdminTable
        columns={columns}
        data={rows}
        loading={loading}
        skeletonRows={6}
        getRowId={(row) => row._id}
        renderMobileCard={renderMobileCard}
        pagination={{
          page: meta.page,
          totalPages: meta.totalPages,
          total: meta.total,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
        }}
        emptyState={{
          icon: <ShoppingBasket className="h-10 w-10" />,
          title: status ? `No ${statusMeta(status).label.toLowerCase()} requests` : "No requests yet",
          description: status
            ? "Try another status."
            : "When a customer asks for a quote on materials, it appears here.",
        }}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-2xl`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              Request {selected ? shortRef(selected) : ""}
            </DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</p>
                  <p className="mt-1 font-semibold text-gray-900">{selected.contact?.name}</p>
                  <a
                    href={`tel:${selected.contact?.phone}`}
                    className="mt-0.5 inline-flex items-center gap-1.5 text-[#FF6A00] hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {selected.contact?.phone}
                  </a>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Deliver to</p>
                  <p className="mt-1 flex items-start gap-1.5 text-gray-900">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span>
                      {[
                        selected.delivery?.address,
                        selected.delivery?.landmark,
                        selected.delivery?.city,
                        selected.delivery?.state,
                        selected.delivery?.pincode,
                      ].filter(Boolean).join(", ")}
                    </span>
                  </p>
                </div>
              </div>

              {selected.notes ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Customer's note
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-gray-800">{selected.notes}</p>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Materials requested
                </p>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  {(selected.items || []).map((line, index) => (
                    <div
                      key={`${line.materialId}-${index}`}
                      className="flex items-start justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-sm last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{line.name}</p>
                        <p className="text-xs text-gray-500">
                          {[line.brand, line.category].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-gray-600">
                          {line.quantity} × {fullMoney(line.price)} {line.unit}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums text-gray-900">
                        {fullMoney(line.lineTotal)}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-2.5 text-sm">
                    <span className="font-semibold text-gray-700">Estimated total (at list price)</span>
                    <span className="font-bold tabular-nums text-gray-900">
                      {fullMoney(selected.estimatedTotal)}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  Prices are the ones the customer was shown when they sent this — later price
                  changes do not affect it.
                </p>
              </div>

              {/* The quotation already sent, if any — read-only once the customer has answered. */}
              {selected.quotation?.status && selected.quotation.status !== "none" ? (
                <div className="rounded-xl border border-gray-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {selected.quotation.status === "sent" ? "Quotation sent — awaiting customer" : `Quotation ${selected.quotation.status}`}
                    </p>
                    {statusChip({ status: selected.status })}
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Materials</span>
                      <span className="tabular-nums">{fullMoney(selected.quotation.itemsTotal)}</span>
                    </div>
                    {selected.quotation.transportCharge > 0 ? (
                      <div className="flex justify-between text-gray-600">
                        <span>Transport / delivery</span>
                        <span className="tabular-nums">{fullMoney(selected.quotation.transportCharge)}</span>
                      </div>
                    ) : null}
                    {selected.quotation.otherCharges > 0 ? (
                      <div className="flex justify-between text-gray-600">
                        <span>{selected.quotation.otherChargesNote || "Other charges"}</span>
                        <span className="tabular-nums">{fullMoney(selected.quotation.otherCharges)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-t border-gray-100 pt-1 font-bold text-gray-900">
                      <span>Grand total</span>
                      <span className="tabular-nums">{fullMoney(selected.quotation.grandTotal)}</span>
                    </div>
                  </div>
                  {selected.quotation.status === "rejected" && selected.quotation.responseNote ? (
                    <p className="mt-2 text-xs text-gray-500">Customer said: “{selected.quotation.responseNote}”</p>
                  ) : null}
                </div>
              ) : null}

              {/* Send / revise a quotation — before the customer has accepted. */}
              {["new", "quoted", "rejected"].includes(selected.status) ? (
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {selected.status === "new" ? "Send a quotation" : "Send a revised quotation"}
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Transport / delivery charge (₹)"
                      type="number"
                      min={0}
                      step={1}
                      value={quoteForm.transportCharge}
                      onChange={(e) => setQuoteForm((f) => ({ ...f, transportCharge: e.target.value }))}
                      disabled={sendingQuote}
                    />
                    <Input
                      label="Other charges (₹)"
                      type="number"
                      min={0}
                      step={1}
                      value={quoteForm.otherCharges}
                      onChange={(e) => setQuoteForm((f) => ({ ...f, otherCharges: e.target.value }))}
                      disabled={sendingQuote}
                    />
                    <Input
                      label="What the other charge is for"
                      placeholder="e.g. Loading/unloading"
                      value={quoteForm.otherChargesNote}
                      onChange={(e) => setQuoteForm((f) => ({ ...f, otherChargesNote: e.target.value }))}
                      disabled={sendingQuote}
                    />
                    <Input
                      label="Quote valid until (optional)"
                      type="date"
                      value={quoteForm.validUntil}
                      onChange={(e) => setQuoteForm((f) => ({ ...f, validUntil: e.target.value }))}
                      disabled={sendingQuote}
                    />
                  </div>
                  <label className="mt-3 block text-sm">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Notes to the customer</span>
                    <Textarea
                      placeholder="Delivery timeline, payment terms… (shown to the customer)"
                      rows={2}
                      value={quoteForm.notes}
                      onChange={(e) => setQuoteForm((f) => ({ ...f, notes: e.target.value }))}
                      disabled={sendingQuote}
                    />
                  </label>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-gray-700">Grand total</span>
                    <span className="font-bold tabular-nums text-gray-900">{fullMoney(quoteGrandTotal)}</span>
                  </div>
                  <Button className="mt-3 w-full" isLoading={sendingQuote} onClick={sendQuotation}>
                    Send quotation
                  </Button>
                </div>
              ) : null}

              {/* Delivery — once the customer has accepted the quotation. */}
              {["accepted", "dispatched", "delivered"].includes(selected.status) ? (
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <Truck className="h-3.5 w-3.5" /> Delivery
                  </p>
                  <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                    {selected.delivery?.dispatchedAt ? <p>Dispatched {dateTime(selected.delivery.dispatchedAt)}</p> : null}
                    {selected.delivery?.deliveredAt ? <p>Delivered {dateTime(selected.delivery.deliveredAt)}</p> : null}
                  </div>
                  {selected.status !== "delivered" ? (
                    <>
                      <label className="mt-2 block text-sm">
                        <span className="mb-1.5 block text-sm font-medium text-gray-700">
                          Vehicle / tracking note (optional)
                        </span>
                        <Input
                          placeholder="e.g. Truck MP-09-1234, driver 98xxxxxxx"
                          value={trackingNote}
                          onChange={(e) => setTrackingNote(e.target.value)}
                          disabled={Boolean(deliveryBusy)}
                        />
                      </label>
                      {selected.status === "accepted" ? (
                        <Button className="mt-2 w-full" isLoading={deliveryBusy === "dispatch"} onClick={markDispatched}>
                          Mark dispatched
                        </Button>
                      ) : (
                        <Button className="mt-2 w-full" isLoading={deliveryBusy === "deliver"} onClick={markDelivered}>
                          Mark delivered
                        </Button>
                      )}
                    </>
                  ) : (
                    selected.delivery?.trackingNote ? (
                      <p className="mt-1 text-xs text-gray-600">{selected.delivery.trackingNote}</p>
                    ) : null
                  )}
                </div>
              ) : null}

              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Internal note
                </span>
                <Textarea
                  placeholder="Who spoke to the customer, anything else the office should know… (never shown to the customer)"
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  disabled={savingNote}
                />
                <Button variant="outline" size="sm" className="mt-2" isLoading={savingNote} onClick={saveNote}>
                  Save note
                </Button>
              </label>

              {!["delivered", "cancelled"].includes(selected.status) ? (
                cancelOpen ? (
                  <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-sm font-medium text-gray-700">Reason for cancelling</span>
                      <Textarea
                        rows={2}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        disabled={cancelling}
                      />
                    </label>
                    <div className="mt-2 flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setCancelOpen(false)} disabled={cancelling}>
                        Back
                      </Button>
                      <Button variant="danger" className="flex-1" isLoading={cancelling} onClick={cancelRequest}>
                        Cancel request
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Cancel this request
                  </button>
                )
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={closeDialog}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
