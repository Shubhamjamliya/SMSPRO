import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, Eye, MapPin, Phone, RotateCcw, UserCheck } from "lucide-react";
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
import { SiteVisitSection, VISIT_STAGE_TEXT } from "../components/PackageQuotation";
import { dateTime, fullMoney } from "../../shared/format";
import {
  CN_ADMIN_PAGE_CLASS,
  CN_ADMIN_SELECT_CLASS,
  CN_DIALOG_CONTENT_CLASS,
} from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const PAGE_SIZE = 20;

/**
 * `awaiting_payment` comes first: it is a booking that has been started but not paid
 * for, so it has not been sent to anyone and the office has nothing to do with it yet.
 */
const STATUSES = [
  { value: "awaiting_payment", label: "Awaiting payment", tone: "neutral" },
  { value: "new", label: "New", tone: "warning" },
  { value: "contacted", label: "Contacted", tone: "info" },
  { value: "quoted", label: "Quoted", tone: "primary" },
  { value: "won", label: "Won", tone: "success" },
  { value: "lost", label: "Lost", tone: "danger" },
];

const OFFER_LABEL = {
  offered: "Waiting",
  accepted: "Accepted",
  declined: "Declined",
  expired: "No answer",
  withdrawn: "Withdrawn",
};
const OFFER_TONE = {
  offered: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-gray-100 text-gray-600",
  expired: "bg-gray-100 text-gray-500",
  withdrawn: "bg-gray-100 text-gray-500",
};

const OFFICE_STATUSES = STATUSES.filter((s) => s.value !== "awaiting_payment");

const statusMeta = (value) => STATUSES.find((s) => s.value === value) || STATUSES[1];

/** A short reference the office can read out over the phone. */
const shortRef = (row) => `#${String(row._id).slice(-6).toUpperCase()}`;

const segmentLabel = (segment) => (segment === "commercial" ? "Commercial" : "Residential");

/** Whether the visiting fee is settled, in words the office can act on. */
const paymentChip = (row) => {
  const payment = row.payment || {};
  if (payment.status === "paid") return <StatusBadge tone="success" label={`Paid ${fullMoney(payment.amount)}`} />;
  if (payment.status === "pending") return <StatusBadge tone="warning" label={`Unpaid ${fullMoney(payment.amount)}`} />;
  if (payment.status === "refunded") return <StatusBadge tone="neutral" label="Refunded" />;
  return <span className="text-xs text-gray-500">Free visit</span>;
};

/** Where the site visit has got to, as one short phrase. Quotations are handled on their own page. */
const visitStageLabel = (row) => VISIT_STAGE_TEXT[row.visit?.stage || "assigned"];

/** Who has the request, or why nobody does. */
const contractorCell = (row) => {
  const assigned = row.assignedContractorId;
  if (assigned?.businessName) {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{assigned.businessName}</p>
        <p className="text-xs text-gray-500">{row.assignedBy === "admin" ? "Assigned by office" : "Accepted"}</p>
        <p className="text-xs font-medium text-[#FF6A00]">{visitStageLabel(row)}</p>
      </div>
    );
  }
  if (row.status === "awaiting_payment") return <span className="text-xs text-gray-400">Not sent yet</span>;
  const state = row.dispatch?.state;
  if (state === "awaiting_admin") {
    return <span className="text-xs font-medium text-[#FF6A00]">Assign a contractor</span>;
  }
  if (state === "no_contractors") {
    return <span className="text-xs font-medium text-red-600">No contractor covers this area</span>;
  }
  if (state === "unassigned") {
    return <span className="text-xs font-medium text-amber-600">Nobody accepted</span>;
  }
  if (state === "sent") {
    const s = row.offerSummary || {};
    return (
      <span className="text-xs text-gray-600">
        Sent to {s.total || 0} · {s.offered || 0} waiting
      </span>
    );
  }
  return <span className="text-xs text-gray-400">—</span>;
};

const REQUEST_PAGES = [
  { segment: "residential", label: "Residential Requests", path: "/admin/construction/end-to-end/residential/requests" },
  { segment: "commercial", label: "Commercial Requests", path: "/admin/construction/end-to-end/commercial/requests" },
];

/** One page per segment (see the routes): residential and commercial requests never share a list. */
export default function PackageRequests({ segment = "residential" }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState("");
  const [needsAssignment, setNeedsAssignment] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState(null);
  const [nextStatus, setNextStatus] = useState("new");
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignable, setAssignable] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [assigningId, setAssigningId] = useState("");

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await constructionAdminApi.getPackageRequests({
        status: status || undefined,
        segment,
        needsAssignment: needsAssignment ? "true" : undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(result.rows);
      setMeta(result.meta);
      setCounts(result.counts);
      // Keep an open dialog in step with what just changed under it.
      setSelected((current) => (current ? result.rows.find((r) => r._id === current._id) || current : current));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load package requests"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, segment, needsAssignment, page]);

  // `needsAssignment` is a cut across the statuses, not another status, so it is not added in.
  const totalAll = STATUSES.reduce((sum, s) => sum + (counts[s.value] || 0), 0);

  const openAssign = async () => {
    if (!selected) return;
    setAssignOpen(true);
    setAssignSearch("");
    setAssignable([]);
    setAssignLoading(true);
    try {
      setAssignable(await constructionAdminApi.getAssignableContractors(selected._id));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load contractors"));
    } finally {
      setAssignLoading(false);
    }
  };

  const assign = async (contractor) => {
    if (!selected) return;
    setAssigningId(contractor.id);
    try {
      await constructionAdminApi.assignPackageRequest(selected._id, contractor.id);
      toast.success(`Assigned to ${contractor.businessName}. They have been notified.`);
      setAssignOpen(false);
      setSelected(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not assign the contractor"));
      load();
    } finally {
      setAssigningId("");
    }
  };

  const openRequest = (row) => {
    setSelected(row);
    setNextStatus(row.status === "awaiting_payment" ? "new" : row.status);
    setAdminNote(row.adminNote || "");
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await constructionAdminApi.updatePackageRequestStatus(selected._id, {
        status: nextStatus,
        adminNote,
      });
      toast.success("Request updated");
      setSelected(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the request"));
    } finally {
      setSaving(false);
    }
  };

  const resend = async () => {
    if (!selected) return;
    setResending(true);
    try {
      const result = await constructionAdminApi.redispatchPackageRequest(selected._id);
      const city = selected.site?.city || "this area";
      if (result?.sent > 0) {
        const parts = [];
        if (result.newlyAsked) parts.push(`${result.newlyAsked} new`);
        if (result.reminded) parts.push(`${result.reminded} reminded`);
        toast.success(
          `Sent to ${result.sent} contractor${result.sent === 1 ? "" : "s"}${parts.length ? ` (${parts.join(", ")})` : ""}` +
            (result.declined ? `. ${result.declined} declined earlier and were not asked again.` : "")
        );
      } else if (result?.reason === "all_declined") {
        toast.error(
          `All ${result.declined} contractor${result.declined === 1 ? "" : "s"} covering ${city} have declined this request, so there is nobody left to send it to.`
        );
      } else if (result?.reason === "no_coverage") {
        // Nobody works there at all: a data problem the office can fix.
        toast.error(
          `No approved contractor lists ${city} as an area they work in. Approve a contractor who covers it, or ask one to add ${city} to their areas.`
        );
      } else {
        toast.error(
          `Nobody new to send it to: all ${result?.coverage ?? 0} contractor${result?.coverage === 1 ? "" : "s"} covering ${city} have already been asked.`
        );
      }
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not send the request again"));
    } finally {
      setResending(false);
    }
  };

  const confirmRefund = async () => {
    if (!selected) return;
    setRefundBusy(true);
    try {
      await constructionAdminApi.refundPackageRequest(selected._id, refundReason.trim());
      toast.success("Visiting fee refunded to the customer's wallet");
      setRefundOpen(false);
      setRefundReason("");
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not refund the visiting fee"));
    } finally {
      setRefundBusy(false);
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
    {
      key: "package",
      header: "Package",
      cell: (row) => (
        <div>
          <p className="text-sm text-gray-900">{row.package?.name}</p>
          <p className="text-xs text-gray-500">
            {segmentLabel(row.package?.segment)} · {row.site?.city}
          </p>
        </div>
      ),
    },
    { key: "payment", header: "Visit fee", cell: paymentChip },
    { key: "contractor", header: "Contractor", cell: contractorCell },
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
            {dateTime(row.createdAt)} · {row.site?.city}
          </p>
        </div>
        {statusChip(row)}
      </div>
      <p className="mt-2 text-xs text-gray-600">
        {row.package?.name} · ≈ {fullMoney(row.estimatedCost)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {paymentChip(row)}
        {contractorCell(row)}
      </div>
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

  // What the office can do with the open request.
  const isUnpaid = selected?.status === "awaiting_payment";
  const isCommercialRequest = selected?.package?.segment === "commercial";
  const canAssign =
    selected &&
    !selected.assignedContractorId &&
    !isUnpaid &&
    selected.payment?.status !== "pending" &&
    selected.payment?.status !== "refunded" &&
    selected.status !== "lost";
  // Commercial visits are never broadcast, so there is nothing to "send again".
  const canResend = canAssign && !isCommercialRequest;
  const filteredAssignable = assignable.filter((c) => {
    const q = assignSearch.trim().toLowerCase();
    return !q || `${c.businessName} ${c.ownerName} ${c.phone} ${c.contractorCode}`.toLowerCase().includes(q);
  });
  const canRefund = selected?.payment?.status === "paid" && selected?.payment?.amount > 0;

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <PageHeader
        eyebrow="Construction · End to End"
        title={segment === "commercial" ? "Commercial Requests" : "Residential Requests"}
        description={
          segment === "commercial"
            ? "Commercial site visits are not sent to contractors automatically. Once the visiting fee is paid, each request waits here for you to assign a contractor. The estimate is at the package rate; agree the real price with the customer."
            : "Residential site visits go straight to nearby contractors once the visiting fee is paid, and the first to accept gets the visit. If nobody accepts, assign one yourself. The estimate is at the package rate; agree the real price with the customer."
        }
        actions={
          <div className="flex gap-2">
            {REQUEST_PAGES.map((p) => (
              <button
                key={p.segment}
                type="button"
                onClick={() => navigate(p.path)}
                className={tabClass(p.segment === segment)}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          className={tabClass(status === "" && !needsAssignment)}
          onClick={() => {
            setStatus("");
            setNeedsAssignment(false);
            setPage(1);
          }}
        >
          All ({totalAll})
        </button>
        <button
          type="button"
          className={tabClass(needsAssignment)}
          onClick={() => {
            setStatus("");
            setNeedsAssignment(true);
            setPage(1);
          }}
        >
          Needs contractor ({counts.needsAssignment || 0})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={tabClass(status === s.value)}
            onClick={() => {
              setStatus(s.value);
              setNeedsAssignment(false);
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
          icon: <ClipboardList className="h-10 w-10" />,
          title: status ? `No ${statusMeta(status).label.toLowerCase()} requests` : "No requests yet",
          description: status
            ? "Try another status."
            : "When a customer books a package, it appears here.",
        }}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-2xl`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">Request {selected ? shortRef(selected) : ""}</DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {isUnpaid ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
                  The customer has not paid the {fullMoney(selected.payment?.amount)} visiting fee yet, so this
                  has not been sent to any contractor. It will go out automatically once they pay.
                </div>
              ) : null}

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
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Site</p>
                  <p className="mt-1 flex items-start gap-1.5 text-gray-900">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span>
                      {selected.site?.address || [selected.site?.city, selected.site?.area].filter(Boolean).join(" · ")}
                      {selected.site?.landmark ? <span className="block text-xs text-gray-500">Landmark: {selected.site.landmark}</span> : null}
                    </span>
                  </p>
                  {selected.site?.location?.coordinates?.length === 2 ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selected.site.location.coordinates[1]},${selected.site.location.coordinates[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-[#FF6A00] hover:underline"
                    >
                      Open the pin in maps
                    </a>
                  ) : null}
                  <p className="mt-0.5 text-xs text-gray-500">Wants to start: {selected.startWindow}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 text-sm">
                <div className="flex justify-between border-b border-gray-100 px-3 py-2.5">
                  <span className="text-gray-500">Package</span>
                  <span className="font-medium text-gray-900">
                    {selected.package?.name} · {segmentLabel(selected.package?.segment)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 px-3 py-2.5">
                  <span className="text-gray-500">Rate when requested</span>
                  <span className="tabular-nums text-gray-900">
                    {fullMoney(selected.package?.price)} {selected.package?.unit}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 px-3 py-2.5">
                  <span className="text-gray-500">Area</span>
                  <span className="tabular-nums text-gray-900">
                    {Number(selected.site?.areaPerFloor || 0).toLocaleString("en-IN")} sq.ft ×{" "}
                    {selected.site?.floors} floor{selected.site?.floors === 1 ? "" : "s"} ={" "}
                    {Number(selected.site?.totalBuiltUpArea || 0).toLocaleString("en-IN")} sq.ft
                  </span>
                </div>
                <div className="flex justify-between bg-gray-50 px-3 py-2.5">
                  <span className="font-semibold text-gray-700">Estimated cost</span>
                  <span className="font-bold tabular-nums text-gray-900">{fullMoney(selected.estimatedCost)}</span>
                </div>
              </div>

              {/* Visiting fee */}
              <div className="overflow-hidden rounded-xl border border-gray-200 text-sm">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-gray-500">Visiting fee</span>
                  <span className="flex items-center gap-2">
                    {paymentChip(selected)}
                  </span>
                </div>
                {selected.payment?.paidAt ? (
                  <div className="flex justify-between border-t border-gray-100 px-3 py-2.5">
                    <span className="text-gray-500">Paid on</span>
                    <span className="text-gray-900">{dateTime(selected.payment.paidAt)}</span>
                  </div>
                ) : null}
                {selected.payment?.status === "refunded" ? (
                  <div className="border-t border-gray-100 px-3 py-2.5 text-xs text-gray-600">
                    Refunded {selected.payment.refundedAt ? dateTime(selected.payment.refundedAt) : ""}
                    {selected.payment.refundNote ? ` — ${selected.payment.refundNote}` : ""}
                  </div>
                ) : null}
                {canRefund ? (
                  <div className="border-t border-gray-100 px-3 py-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setRefundReason("");
                        setRefundOpen(true);
                      }}
                    >
                      Refund visiting fee
                    </Button>
                    <p className="mt-1.5 text-xs text-gray-500">
                      Credits the customer's wallet and closes this request. It cannot be undone.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Contractor */}
              {!isUnpaid ? (
                <div className="overflow-hidden rounded-xl border border-gray-200 text-sm">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-gray-500">Contractor</span>
                    <span className="text-right">{contractorCell(selected)}</span>
                  </div>
                  {selected.assignedContractorId?.phone ? (
                    <div className="flex justify-between border-t border-gray-100 px-3 py-2.5">
                      <span className="text-gray-500">Contractor phone</span>
                      <a
                        href={`tel:${selected.assignedContractorId.phone}`}
                        className="text-[#FF6A00] hover:underline"
                      >
                        {selected.assignedContractorId.phone}
                      </a>
                    </div>
                  ) : null}
                  {selected.offers?.length ? (
                    <div className="border-t border-gray-100 px-3 py-2.5">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Offered to {selected.offers.length}
                      </p>
                      <ul className="space-y-1">
                        {selected.offers.map((offer, index) => (
                          <li key={offer.contractorId?._id || index} className="flex items-center justify-between gap-3 text-xs">
                            <span className="truncate text-gray-800">
                              {offer.contractorId?.businessName || "Contractor"}
                              {offer.contractorId?.phone ? (
                                <span className="text-gray-400"> · {offer.contractorId.phone}</span>
                              ) : null}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${OFFER_TONE[offer.status] || OFFER_TONE.withdrawn}`}
                            >
                              {OFFER_LABEL[offer.status] || offer.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {!selected.offers?.length && selected.dispatch?.state === "no_contractors" ? (
                    <div className="border-t border-gray-100 bg-red-50/60 px-3 py-2.5 text-xs text-red-800">
                      No approved contractor lists {selected.site?.city}{selected.site?.area ? ` (or ${selected.site.area})` : ""} as
                      somewhere they work, so nobody was asked. Approve a contractor who covers it, or ask one to add it to
                      their areas, then press “Send to all contractors again”.
                    </div>
                  ) : null}
                  {selected.dispatch?.state === "awaiting_admin" && !selected.assignedContractorId ? (
                    <div className="border-t border-gray-100 bg-orange-50/70 px-3 py-2.5 text-xs text-orange-900">
                      This is a commercial visit and has not been sent to any contractor. Choose the contractor who
                      should take it.
                    </div>
                  ) : null}
                  {["unassigned", "no_contractors"].includes(selected.dispatch?.state) && !selected.assignedContractorId ? (
                    <div className="border-t border-gray-100 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900">
                      Contractors were asked but nobody accepted. Assign one yourself, or send it out again.
                    </div>
                  ) : null}
                  {canAssign ? (
                    <div className="border-t border-gray-100 px-3 py-2.5">
                      <Button size="sm" onClick={openAssign}>
                        <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Assign a contractor
                      </Button>
                      <p className="mt-1.5 text-xs text-gray-500">
                        The contractor and the customer are both notified straight away, and any other open offer is
                        withdrawn.
                      </p>
                    </div>
                  ) : null}
                  {canResend ? (
                    <div className="border-t border-gray-100 px-3 py-2.5">
                      <Button variant="outline" size="sm" isLoading={resending} onClick={resend}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Send to all contractors again
                      </Button>
                      <p className="mt-1.5 text-xs text-gray-500">
                        Sends it again to every contractor covering {selected.site?.city}: new ones are asked, and
                        those who have not answered are reminded with a fresh deadline. Contractors who declined are
                        left alone.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <SiteVisitSection request={selected} />

              {selected.notes ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Customer's note</p>
                  <p className="mt-1 whitespace-pre-wrap text-gray-800">{selected.notes}</p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">Status</span>
                  <select
                    className={CN_ADMIN_SELECT_CLASS}
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    disabled={saving || isUnpaid}
                  >
                    {OFFICE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Internal note</span>
                <Textarea
                  placeholder="Agreed price, site visit date, who spoke to the customer… (never shown to the customer)"
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setSelected(null)}
              disabled={saving}
            >
              Close
            </Button>
            <Button className="w-full sm:w-auto" isLoading={saving} onClick={save} disabled={isUnpaid}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={(open) => !open && !assigningId && setAssignOpen(false)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-lg`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              Assign a contractor{selected ? ` · ${shortRef(selected)}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
            <Input
              placeholder="Search by name, phone or code"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
            />
            {assignLoading ? (
              <p className="py-6 text-center text-sm text-gray-500">Loading contractors…</p>
            ) : filteredAssignable.length ? (
              <ul className="space-y-2">
                {filteredAssignable.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{c.businessName}</p>
                      <p className="truncate text-xs text-gray-500">
                        {[c.ownerName, c.phone].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                        {c.nearby ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                            Covers {selected?.site?.city}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-500">
                            Other area
                          </span>
                        )}
                        {c.offerStatus ? (
                          <span className={`rounded-full px-2 py-0.5 font-medium ${OFFER_TONE[c.offerStatus] || OFFER_TONE.withdrawn}`}>
                            {OFFER_LABEL[c.offerStatus] || c.offerStatus}
                          </span>
                        ) : null}
                        {c.rating > 0 ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                            ★ {Number(c.rating).toFixed(1)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      isLoading={assigningId === c.id}
                      disabled={Boolean(assigningId)}
                      onClick={() => assign(c)}
                    >
                      Assign
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-gray-500">No approved contractors found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={refundOpen}
        onOpenChange={(open) => {
          if (!open && !refundBusy) setRefundOpen(false);
        }}
      >
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Refund visiting fee
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-4 py-4 sm:px-5">
            <p className="text-sm text-gray-600">
              Give <strong className="text-gray-900">{fullMoney(selected?.payment?.amount)}</strong> back to{" "}
              <strong className="text-gray-900">{selected?.contact?.name}</strong> as a wallet credit. This
              closes the request and stops contractors seeing it. It cannot be undone.
            </p>
            <Input
              label="Reason"
              placeholder="e.g. No contractor available in their area"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              disabled={refundBusy}
            />
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setRefundOpen(false)}
              disabled={refundBusy}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="w-full sm:w-auto"
              isLoading={refundBusy}
              disabled={refundReason.trim().length < 3}
              onClick={confirmRefund}
            >
              Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
