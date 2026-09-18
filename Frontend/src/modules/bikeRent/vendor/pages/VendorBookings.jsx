import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Eye, FileText, IdCard, Mail, Phone, X } from "lucide-react";
import { FilterBar, AdminTable, StatusBadge } from "@/shared/components/admin";
import VendorLayout from "../components/VendorLayout";
import VendorModal from "../components/VendorModal";
import InspectionMediaForm, {
  InspectionMediaGallery,
} from "../../shared/components/InspectionMediaForm";
import PickupCountdown from "../../shared/components/PickupCountdown";
import { bikeVendorApi } from "../services/vendorApi";
import { BIKE_RENT_ADMIN_SELECT_CLASS } from "../../admin/utils/adminTheme";

const STATUS_OPTIONS = [
  "pending_approval",
  "requested",
  "payment_pending",
  "reserved",
  "pickup_completed",
  "rental_started",
  "active",
  "return_requested",
  "inspection",
  "completed",
  "refund_processing",
  "deposit_refunded",
  "cancelled",
  "rejected",
  "expired",
  "no_show",
];

const STATUS_LABELS = {
  pending_approval: "Pending Approval",
  requested: "Pending Approval",
  payment_pending: "Payment pending",
  reserved: "Confirmed / Reserved",
  pickup_completed: "Pickup Inspection Completed",
  rental_started: "Bike Handed Over",
  active: "Ride Active",
  return_requested: "Return Inspection Pending",
  inspection: "Return Inspection",
  completed: "Completed",
  refund_processing: "Refund processing",
  deposit_refunded: "Deposit refunded",
  cancelled: "Cancelled",
  rejected: "Rejected",
  expired: "Expired",
  no_show: "Missed pickup",
};

const OPS_OPTIONS = [
  { value: "", label: "All queues" },
  { value: "live", label: "Live rentals" },
  { value: "pickups", label: "Upcoming pickups (24h)" },
  { value: "returns", label: "Upcoming returns (24h)" },
  { value: "late", label: "Late returns" },
  { value: "extensions", label: "Extension requests" },
  { value: "refunds", label: "Pending refunds" },
];

const CANCELLABLE_STATUSES = ["requested", "pending_approval", "payment_pending", "reserved"];

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const when = (value) => (value ? new Date(value).toLocaleString() : "—");
const text = (value) => (value === 0 || value ? String(value) : "—");

function getCustomer(booking) {
  const rider = booking?.riderSnapshot || {};
  const customer = booking?.customer || {};
  const docs = customer.documents || {};
  return {
    id: customer.id || booking?.userId || "",
    name: customer.name || rider.name || booking?.customerName || "",
    phone: customer.phone || rider.phone || "",
    email: customer.email || rider.email || "",
    profileImage: customer.profileImage || "",
    drivingLicenseNumber: customer.drivingLicenseNumber || rider.drivingLicenseNumber || "",
    aadhaarNumber: customer.aadhaarNumber || "",
    documents: {
      drivingLicenseFront: docs.drivingLicenseFront || "",
      drivingLicenseBack: docs.drivingLicenseBack || "",
      aadhaarFront: docs.aadhaarFront || "",
      aadhaarBack: docs.aadhaarBack || "",
    },
  };
}

function bikePrimaryImage(bike = {}) {
  if (bike.primaryImage) return bike.primaryImage;
  const images = bike.images || [];
  const primary = images.find((item) => item?.isPrimary && item?.url);
  return primary?.url || images[0]?.url || "";
}

function Section({ title, children }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (!items.length) return null;
  return (
    <section className="just-order-card p-3.5">
      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">{items}</div>
    </section>
  );
}

function Field({ label, value, full = false }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className={full ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-0.5 break-words text-sm font-semibold text-gray-800">{value}</div>
    </div>
  );
}

export default function VendorBookings() {
  const [bookings, setBookings] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [ops, setOps] = useState(searchParams.get("ops") || "");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = { limit: 20, page };
        if (status) params.status = status;
        if (ops) params.ops = ops;
        if (search.trim()) params.search = search.trim();
        const data = await bikeVendorApi.getBookings(params);
        setBookings(data.records || []);
        setMeta((current) => ({ ...current, ...data }));
      } catch {
        toast.error("Could not load bookings");
      } finally {
        setLoading(false);
      }
    },
    [status, ops, search],
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, ops, search]);

  const openDetail = async (booking) => {
    try {
      const full = await bikeVendorApi.getBookingById(booking.id);
      setSelected(full);
    } catch {
      toast.error("Could not load booking");
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    try {
      const full = await bikeVendorApi.getBookingById(selected.id);
      setSelected(full);
    } catch {
      /* keep stale view on refresh failure */
    }
  };

  const runAction = async (fn, successMessage) => {
    if (!selected) return;
    setActing(true);
    try {
      await fn();
      toast.success(successMessage || "Booking updated");
      await refreshSelected();
      load(meta.page);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Action failed");
    } finally {
      setActing(false);
    }
  };

  const renderBookingMobileCard = (b) => (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{b.bookingNumber}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {b.bikeName} · {b.customerName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openDetail(b)}
          className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <StatusBadge status={b.status} label={STATUS_LABELS[b.status] || b.status} />
        <div className="mt-1">
          <PickupCountdown booking={b} />
        </div>
        {b.pendingExtension?.status === "requested" && (
          <span className="ml-1.5 inline-block rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase text-[#FF6A00]">
            Extension
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="col-span-2 min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Location</span>
          <span className="block truncate font-medium text-foreground">{b.hubName || b.zoneName || "—"}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Start</span>
          <span className="font-medium text-foreground">{when(b.startAt)}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Amount</span>
          <span className="font-semibold text-foreground">{money(b.money?.totalPaid)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <VendorLayout title="Bookings" subtitle="Manage rider bookings across every stage of the rental lifecycle.">
      <FilterBar
        start={
          <>
            <select value={ops} onChange={(e) => setOps(e.target.value)} className={BIKE_RENT_ADMIN_SELECT_CLASS}>
              {OPS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={BIKE_RENT_ADMIN_SELECT_CLASS}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking #, rider, bike…"
              className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </>
        }
      />

      <div className="mt-4">
        <AdminTable
          columns={[
            { key: "bookingNumber", header: "Booking", cell: (b) => <span className="font-semibold">{b.bookingNumber}</span> },
            { key: "bikeName", header: "Bike" },
            { key: "customerName", header: "Rider" },
            { key: "location", header: "Location", cell: (b) => b.hubName || b.zoneName || "—" },
            { key: "startAt", header: "Start", cell: (b) => when(b.startAt) },
            {
              key: "status",
              header: "Status",
              cell: (b) => (
                <div>
                  <StatusBadge status={b.status} label={STATUS_LABELS[b.status] || b.status} />
                  <div className="mt-1">
                    <PickupCountdown booking={b} />
                  </div>
                  {b.pendingExtension?.status === "requested" && (
                    <span className="ml-1.5 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase text-[#FF6A00]">
                      Extension
                    </span>
                  )}
                </div>
              ),
            },
            { key: "amount", header: "Amount", cell: (b) => money(b.money?.totalPaid) },
            {
              key: "actions",
              header: "",
              align: "right",
              cell: (b) => (
                <button
                  type="button"
                  onClick={() => openDetail(b)}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              ),
            },
          ]}
          data={bookings}
          loading={loading}
          skeletonRows={6}
          getRowId={(b) => b.id}
          renderMobileCard={renderBookingMobileCard}
          emptyState={{ title: "No bookings found", description: "Try adjusting your filters." }}
          pagination={{
            page: meta.page,
            totalPages: meta.pages,
            total: meta.total,
            pageSize: meta.limit,
            onPageChange: (page) => load(page),
          }}
        />
      </div>

      <VendorModal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.bookingNumber || "Booking"} size="xl">
        {selected && <BookingDetail booking={selected} acting={acting} runAction={runAction} />}
      </VendorModal>
    </VendorLayout>
  );
}

function DocThumb({ label, url }) {
  if (!url) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-2 text-center text-[10px] text-gray-400">
        {label} not uploaded
      </div>
    );
  }
  const isPdf = /\.pdf($|\?)/i.test(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
    >
      {isPdf ? (
        <div className="flex h-16 flex-col items-center justify-center gap-1 text-gray-500">
          <FileText className="h-4 w-4" />
          <span className="text-[10px] font-bold">{label}</span>
        </div>
      ) : (
        <img src={url} alt={label} className="h-16 w-full object-cover" />
      )}
    </a>
  );
}

function BookingDetail({ booking, acting, runAction }) {
  const [note, setNote] = useState("");
  const [damageFee, setDamageFee] = useState("0");
  const [lateFee, setLateFee] = useState("");
  const [inspectionImages, setInspectionImages] = useState([]);
  const [inspectionVideos, setInspectionVideos] = useState([]);
  const [latePreview, setLatePreview] = useState(null);
  const [previewingLate, setPreviewingLate] = useState(false);
  const [cancelPreview, setCancelPreview] = useState(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignBikeId, setReassignBikeId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [availableBikes, setAvailableBikes] = useState([]);
  const [extensionReason, setExtensionReason] = useState("");
  const [handoverCode, setHandoverCode] = useState("");
  const [pickupImages, setPickupImages] = useState([]);
  const [pickupVideos, setPickupVideos] = useState([]);
  const [pickupNotes, setPickupNotes] = useState("");
  const [pickupMediaError, setPickupMediaError] = useState("");
  const [depositMethod, setDepositMethod] = useState("cash");
  const [depositTxnId, setDepositTxnId] = useState("");
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [financeDetail, setFinanceDetail] = useState(null);
  const [financeLoading, setFinanceLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFinanceDetail(null);
    setFinanceLoading(true);
    (async () => {
      const [invoiceRes, settlementRes, transactionsRes] = await Promise.allSettled([
        bikeVendorApi.getInvoiceByBooking(booking.id),
        bikeVendorApi.getBookingSettlement(booking.id),
        bikeVendorApi.getBookingTransactions(booking.id),
      ]);
      if (cancelled) return;
      setFinanceDetail({
        invoice: invoiceRes.status === "fulfilled" ? invoiceRes.value?.invoice : null,
        extensions: invoiceRes.status === "fulfilled" ? invoiceRes.value?.extensions || [] : [],
        settlement: settlementRes.status === "fulfilled" ? settlementRes.value : null,
        transactions: transactionsRes.status === "fulfilled" ? transactionsRes.value : [],
      });
      setFinanceLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  const status = booking.status;
  const isCancellable = CANCELLABLE_STATUSES.includes(status);
  const hasPendingExtension = booking.pendingExtension?.status === "requested";
  const canReassign = ["reserved", "pickup_completed", "rental_started", "active"].includes(status);
  const depositRefundReady = booking.depositRefund?.status === "processing";
  const needsDepositAtHandover =
    booking.securityDepositPayment?.depositStatus === "pending_collection";
  const canOverrideNoShow = status === "no_show";

  // Auto-unlock the pickup form once the scheduled time arrives, without needing to reopen the modal.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "reserved") return undefined;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [status]);
  const pickupTimeReached = !booking.startAt || now >= new Date(booking.startAt).getTime();

  const startRide = async () => {
    if (booking.startAt && Date.now() < new Date(booking.startAt).getTime()) {
      return toast.error("Bike pickup is not allowed before the scheduled pickup time.");
    }
    if (!handoverCode.trim()) {
      return toast.error("Ask the rider for their pickup code and enter it");
    }
    const hasPickupMedia = Boolean(booking.pickupInspectionId) || pickupImages.length > 0;
    if (!hasPickupMedia) {
      setPickupMediaError("Capture at least one inspection photo with the camera");
      return toast.error("Capture at least one inspection photo before handover");
    }
    setPickupMediaError("");
    await runAction(
      () =>
        bikeVendorApi.startRide(booking.id, {
          pickupCode: handoverCode.trim(),
          collectDeposit: needsDepositAtHandover,
          depositCollectionMethod: needsDepositAtHandover ? depositMethod : undefined,
          depositTransactionId: needsDepositAtHandover ? (depositTxnId.trim() || undefined) : undefined,
          images: pickupImages,
          videos: pickupVideos.slice(0, 1),
          conditionNotes: pickupNotes,
        }),
      "Pickup inspection saved — rental started",
    );
    setHandoverCode("");
  };

  const previewLate = async () => {
    setPreviewingLate(true);
    try {
      const preview = await bikeVendorApi.previewLateCharges(booking.id, {
        damageFee: Number(damageFee) || 0,
        ...(lateFee !== "" ? { lateFee: Number(lateFee) } : {}),
      });
      setLatePreview(preview);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load charge preview");
    } finally {
      setPreviewingLate(false);
    }
  };

  const openCancelConfirm = async () => {
    try {
      const preview = await bikeVendorApi.previewCancellation(booking.id);
      setCancelPreview(preview);
      setShowCancelConfirm(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load cancellation preview");
    }
  };

  const openReassign = async () => {
    setReassignOpen(true);
    try {
      const list = await bikeVendorApi.getBikeDropdown({ zoneId: booking.zoneId });
      setAvailableBikes((list || []).filter((b) => b.id !== booking.bikeId));
    } catch {
      setAvailableBikes([]);
    }
  };

  const customer = getCustomer(booking);
  const bike = booking.bike || booking.bikeSnapshot || {};
  const zone = booking.zoneSnapshot || {};
  const hub = zone.pickupHub || booking.bike?.pickupHub || booking.bike?.hub || {};
  const categoryName =
    booking.categoryName || bike.categoryName || booking.bikeSnapshot?.categoryName || "";
  const zoneName = booking.zoneName || zone.name || bike.zoneName || "";
  const hubName = booking.hubName || hub.name || zone.hubName || bike.hubName || "";
  const bikeImage = bikePrimaryImage(bike) || bikePrimaryImage(booking.bikeSnapshot || {});
  const docs = customer.documents || {};
  const hasAnyDoc = Boolean(
    docs.drivingLicenseFront || docs.drivingLicenseBack || docs.aadhaarFront || docs.aadhaarBack,
  );
  const pay = booking.money || {};
  const depositPay = booking.securityDepositPayment || {};
  const payment = booking.payment || {};
  const persistedLate = booking.lateReturn || null;

  return (
    <div className="space-y-4 text-sm">
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white">
        <div className="grid gap-0 sm:grid-cols-[120px_1fr]">
          <div className="flex h-28 w-full items-center justify-center overflow-hidden bg-gray-100 sm:h-full sm:min-h-[128px]">
            {bikeImage ? (
              <img src={bikeImage} alt={bike.name || "Bike"} className="h-full w-full object-cover" />
            ) : (
              <FileText className="h-8 w-8 text-gray-300" />
            )}
          </div>
          <div className="flex flex-col gap-2.5 p-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Vehicle</p>
              <h3 className="truncate text-base font-black text-gray-900">
                {text(bike.name || booking.bikeName)}
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {[
                  bike.registrationNumber || booking.bikeSnapshot?.registrationNumber,
                  categoryName,
                  zoneName,
                  hubName,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
            <div className="flex items-center gap-2.5 border-t border-gray-100 pt-2.5">
              {customer.profileImage ? (
                <img
                  src={customer.profileImage}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-sm font-bold text-[#FF6A00]">
                  {String(customer.name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-900">{text(customer.name)}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-gray-500">
                  {customer.phone ? (
                    <a
                      href={`tel:${customer.phone}`}
                      className="inline-flex items-center gap-1 hover:text-[#FF6A00]"
                    >
                      <Phone className="h-3 w-3" /> {customer.phone}
                    </a>
                  ) : null}
                  {customer.email ? (
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{customer.email}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <PickupCountdown booking={booking} />
      </div>

      <Section title="Booking info">
        <Field label="Booking number" value={text(booking.bookingNumber)} />
        <Field label="Booking ID" value={<span className="font-mono text-xs">{text(booking.id)}</span>} />
        <Field label="Status" value={STATUS_LABELS[status] || status} />
        <Field label="Booked on" value={when(booking.createdAt)} />
        <Field label="Source" value={text(booking.bookingSource)} />
        {booking.couponCode ? <Field label="Coupon" value={text(booking.couponCode)} /> : null}
      </Section>

      <Section title="Customer">
        <Field label="Name" value={text(customer.name)} />
        <Field
          label="Phone"
          value={
            customer.phone ? (
              <a href={`tel:${customer.phone}`} className="text-[#FF6A00] hover:underline">
                {customer.phone}
              </a>
            ) : (
              "—"
            )
          }
        />
        <Field label="Email" value={text(customer.email)} />
        <Field label="License no." value={text(customer.drivingLicenseNumber)} />
        <Field label="Aadhaar no." value={text(customer.aadhaarNumber)} />
        {customer.id ? (
          <Field label="Customer ID" value={<span className="font-mono text-xs">{customer.id}</span>} />
        ) : null}
      </Section>

      {hasAnyDoc && (
        <section className="just-order-card p-3.5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
            <IdCard className="h-3.5 w-3.5" /> KYC documents
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DocThumb label="License front" url={docs.drivingLicenseFront} />
            <DocThumb label="License back" url={docs.drivingLicenseBack} />
            <DocThumb label="Aadhaar front" url={docs.aadhaarFront} />
            <DocThumb label="Aadhaar back" url={docs.aadhaarBack} />
          </div>
        </section>
      )}

      <Section title="Bike & location">
        <Field label="Bike" value={text(bike.name || booking.bikeName)} />
        <Field
          label="Brand / model"
          value={[bike.brand, bike.model].filter(Boolean).join(" ") || text(booking.bikeSnapshot?.brand)}
        />
        <Field
          label="Registration"
          value={text(bike.registrationNumber || booking.bikeSnapshot?.registrationNumber)}
        />
        <Field label="Category" value={text(categoryName)} />
        <Field label="Zone" value={text(zoneName)} />
        <Field label="Hub" value={text(hubName)} />
        <Field label="Address" value={text(hub.address)} full />
      </Section>

      <Section title="Schedule">
        <Field label="Pickup" value={when(booking.startAt)} />
        <Field label="Return" value={when(booking.endAt)} />
        <Field label="Actual pickup" value={when(booking.actualStartAt)} />
        <Field label="Actual return" value={when(booking.actualEndAt)} />
        <Field
          label="Duration"
          value={booking.rentalDurationHours ? `${booking.rentalDurationHours} hrs` : ""}
        />
      </Section>

      <Section title="Payment & pricing breakdown">
        <Field label="Rental fee" value={money(pay.rentalFee)} />
        {Number(pay.discountAmount || 0) > 0 ? (
          <Field label="Discount" value={`- ${money(pay.discountAmount)}`} />
        ) : null}
        {Number(pay.platformFee || 0) > 0 ? (
          <Field
            label={`Platform fee${pay.platformFeePayer ? ` (${pay.platformFeePayer})` : ""}`}
            value={money(pay.platformFee)}
          />
        ) : null}
        {Number(pay.taxAmount || 0) > 0 ? (
          <Field label={`GST${pay.gstRate ? ` (${pay.gstRate}%)` : ""}`} value={money(pay.taxAmount)} />
        ) : null}
        <Field label="Security deposit" value={money(pay.securityDeposit)} />
        <Field label="Total payable" value={money(pay.totalPayable)} />
        <Field label="Total paid" value={money(pay.totalPaid)} />
        <Field
          label="Payment status"
          value={text(payment.status || (pay.totalPaid > 0 ? "paid" : "unpaid"))}
        />
        <Field label="Deposit status" value={text(depositPay.depositStatus)} />
        <Field label="Deposit method" value={text(depositPay.depositPaymentMethod)} />
      </Section>

      {financeLoading ? (
        <div className="h-16 animate-pulse rounded-xl border border-gray-100 bg-gray-50" />
      ) : null}

      {financeDetail?.invoice ? (
        <Section title="Invoice">
          <Field label="Invoice number" value={text(financeDetail.invoice.invoiceNumber)} />
          <Field label="Issued" value={when(financeDetail.invoice.createdAt)} />
          <Field label="Taxable amount" value={money(financeDetail.invoice.taxableAmount)} />
          <Field
            label={`GST${financeDetail.invoice.gstRate ? ` (${financeDetail.invoice.gstRate}%)` : ""}`}
            value={money(financeDetail.invoice.gstAmount)}
          />
          <Field label="Total payable" value={money(financeDetail.invoice.totalPayable)} />
          {financeDetail.extensions?.length ? (
            <Field
              label="Extension invoices"
              value={financeDetail.extensions.map((ext) => ext.invoiceNumber).join(", ")}
              full
            />
          ) : null}
        </Section>
      ) : null}

      {financeDetail?.settlement ? (
        <Section title="Vendor settlement">
          <Field label="Gross amount" value={money(financeDetail.settlement.grossAmount)} />
          <Field label="GST" value={money(financeDetail.settlement.taxAmount)} />
          <Field label="Commission" value={money(financeDetail.settlement.commissionAmount)} />
          <Field label="Status" value={text(financeDetail.settlement.status)} />
          <Field label="Settlement amount" value={money(financeDetail.settlement.vendorSettlementAmount)} />
          {financeDetail.settlement.adjustments?.length ? (
            <Field
              label="After adjustments"
              value={money(financeDetail.settlement.effectiveVendorSettlementAmount)}
            />
          ) : null}
        </Section>
      ) : null}

      {financeDetail?.transactions?.length ? (
        <section className="just-order-card p-3.5">
          <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-gray-400">Transactions</h3>
          <div className="space-y-2">
            {financeDetail.transactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-bold capitalize text-gray-800">
                    {String(txn.transactionType || "").replace(/_/g, " ")}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {txn.paymentMode} · {when(txn.createdAt)}
                  </p>
                </div>
                <p className="shrink-0 font-bold text-gray-900">{money(txn.amount)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {booking.depositRefund?.status || status === "refund_processing" ? (
        <Section title="Deposit refund">
          <Field label="Refundable amount" value={money(booking.depositRefund?.amount)} />
          <Field label="Status" value={text(booking.depositRefund?.status || status)} />
          <Field label="Eligible at" value={when(booking.depositRefund?.eligibleAt)} />
        </Section>
      ) : null}

      {persistedLate ? (
        <Section title="Late / extra charges">
          <Field label="Extra charge" value={money(persistedLate.totalLateCharge ?? persistedLate.chargeAmount)} />
          {Number(persistedLate.damageFee || 0) > 0 ? (
            <Field label="Damage fee" value={money(persistedLate.damageFee)} />
          ) : null}
          <Field
            label="From deposit"
            value={money(persistedLate.depositDeduction ?? persistedLate.deductedFromDeposit)}
          />
          <Field label="Refundable" value={money(persistedLate.refundableAmount)} />
          <Field
            label="Remaining payable"
            value={money(persistedLate.remainingAmount ?? persistedLate.remainingPayable)}
          />
          <Field label="Payment status" value={text(persistedLate.paymentStatus)} />
        </Section>
      ) : null}

      {status === "no_show" || booking.noShow?.refundProcessed ? (
        <Section title="No-show settlement">
          <Field label="Deduction" value={money(booking.noShow?.deductionAmount)} />
          <Field label="Deposit refunded" value={money(booking.noShow?.depositRefund)} />
          <Field label="Wallet credit" value={money(booking.noShow?.walletCreditAmount)} />
        </Section>
      ) : null}

      {booking.cancellationReason || booking.rejectionReason || status === "cancelled" ? (
        <Section title="Cancellation / rejection">
          {status === "cancelled" || booking.cancellationReason ? (
            <>
              <Field
                label="Cancelled by"
                value={
                  booking.cancelledBy === "admin"
                    ? "Admin"
                    : booking.cancelledBy === "vendor"
                      ? "Vendor"
                      : booking.cancelledBy === "user"
                        ? "User"
                        : booking.cancelledBy === "system"
                          ? "System"
                          : text(booking.cancelledBy)
                }
              />
              <Field label="Cancelled date" value={when(booking.cancelledAt)} />
              <Field label="Reason" value={text(booking.cancellationReason)} full />
            </>
          ) : null}
          {booking.rejectionReason ? (
            <Field label="Rejection reason" value={text(booking.rejectionReason)} full />
          ) : null}
        </Section>
      ) : null}

      {booking.pendingExtension
        && booking.pendingExtension.status
        && booking.pendingExtension.status !== "none" ? (
        <Section title="Extension request">
          <Field label="Status" value={text(booking.pendingExtension.status)} />
          <Field label="Requested until" value={when(booking.pendingExtension.requestedEndAt)} />
          <Field label="Fee estimate" value={money(booking.pendingExtension.feeEstimate)} />
          {booking.pendingExtension.reason ? (
            <Field label="Note" value={text(booking.pendingExtension.reason)} full />
          ) : null}
        </Section>
      ) : null}

      {booking.pickupInspection || booking.returnInspection ? (
        <section className="just-order-card p-3.5">
          <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-gray-400">Inspections</h3>
          <div className="space-y-3">
            {booking.pickupInspection ? (
              <InspectionMediaGallery title="Pickup condition" inspection={booking.pickupInspection} />
            ) : null}
            {booking.returnInspection ? (
              <InspectionMediaGallery title="Return condition" inspection={booking.returnInspection} />
            ) : null}
          </div>
        </section>
      ) : null}

      {Array.isArray(booking.statusHistory) && booking.statusHistory.length > 0 ? (
        <section className="just-order-card p-3.5">
          <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-gray-400">Booking timeline</h3>
          <ol className="space-y-2.5">
            {[...booking.statusHistory].reverse().map((entry, index) => (
              <li key={`${entry.status}-${entry.changedAt}-${index}`} className="flex gap-2.5 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF6A00]" />
                <div className="min-w-0">
                  <p className="font-bold text-gray-800">
                    {STATUS_LABELS[entry.status] || entry.status}
                    <span className="ml-2 font-normal text-gray-400">{when(entry.changedAt)}</span>
                  </p>
                  {entry.changedBy?.name || entry.note ? (
                    <p className="mt-0.5 text-gray-500">
                      {entry.changedBy?.name ? `By ${entry.changedBy.name}` : ""}
                      {entry.changedBy?.name && entry.note ? " · " : ""}
                      {entry.note || ""}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {hasPendingExtension && (
        <div className="space-y-2 rounded-xl border border-orange-100 bg-orange-50/60 p-3">
          <p className="text-xs font-bold text-[#FF6A00]">
            Extension requested — new end time {when(booking.pendingExtension.requestedEndAt)}
            {booking.pendingExtension.feeEstimate ? ` · Fee estimate ${money(booking.pendingExtension.feeEstimate)}` : ""}
          </p>
          <input
            value={extensionReason}
            onChange={(e) => setExtensionReason(e.target.value)}
            placeholder="Note (optional for approve, required for reject)"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={acting}
              onClick={() =>
                runAction(
                  () => bikeVendorApi.resolveExtension(booking.id, { action: "approve", reason: extensionReason }),
                  "Extension approved",
                )
              }
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              Approve extension
            </button>
            <button
              type="button"
              disabled={acting || !extensionReason.trim()}
              onClick={() =>
                runAction(
                  () => bikeVendorApi.resolveExtension(booking.id, { action: "reject", reason: extensionReason }),
                  "Extension rejected",
                )
              }
              className="flex-1 rounded-lg bg-red-500 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              Reject extension
            </button>
          </div>
        </div>
      )}

      {(status === "requested" || status === "pending_approval") && (
        <div className="space-y-2 rounded-xl border border-gray-100 p-3">
          <p className="text-xs font-bold text-gray-600">Approve or reject this request</p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note / reason"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={acting}
              onClick={() => runAction(() => bikeVendorApi.approveBooking(booking.id, { note }), "Booking approved")}
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => runAction(() => bikeVendorApi.rejectBooking(booking.id, { reason: note }), "Booking rejected")}
              className="flex-1 rounded-lg bg-red-500 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {status === "reserved" && (
        <div className="space-y-3 rounded-xl border border-gray-100 p-3">
          <p className="text-xs font-bold text-gray-600">Bike inspection & hub handover</p>
          <p className="text-[11px] text-gray-500">
            Capture bike condition photos with the camera, then ask the rider for their pickup
            code. Video is optional.
          </p>
          {!pickupTimeReached ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              <p className="font-bold">Pickup opens at {when(booking.startAt)}</p>
              <p className="mt-0.5 text-amber-800">
                The rider can arrive early, but the bike cannot be handed over or the pickup code
                verified until the scheduled pickup time.
              </p>
            </div>
          ) : null}
          {!booking.pickupInspectionId ? (
            <InspectionMediaForm
              images={pickupImages}
              videos={pickupVideos}
              onImagesChange={(images) => {
                setPickupMediaError("");
                setPickupImages(images);
              }}
              onVideosChange={(videos) => {
                setPickupMediaError("");
                setPickupVideos(videos.slice(0, 1));
              }}
              disabled={acting}
              cameraOnlyImages
              requireImages
              error={pickupMediaError}
            />
          ) : (
            <InspectionMediaGallery title="Pickup inspection saved" inspection={booking.pickupInspection} />
          )}
          <input
            value={pickupNotes}
            onChange={(e) => setPickupNotes(e.target.value)}
            placeholder="Notes (optional) — existing scratches or remarks"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
          />
          {needsDepositAtHandover && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={depositMethod}
                onChange={(e) => setDepositMethod(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="cod">COD</option>
              </select>
              <input
                value={depositTxnId}
                onChange={(e) => setDepositTxnId(e.target.value)}
                placeholder="Reference (optional)"
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
              />
            </div>
          )}
          <input
            value={handoverCode}
            onChange={(e) => setHandoverCode(e.target.value)}
            placeholder={
              pickupTimeReached
                ? "Ask rider and enter their pickup code"
                : "Available once the pickup time is reached"
            }
            disabled={!pickupTimeReached}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs tracking-widest disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
          />
          <p className="text-[11px] text-gray-400">
            Only use the code the rider shows or tells you — never a code from this screen.
          </p>
          <ActionButton
            label={
              !pickupTimeReached
                ? "Pickup not yet open"
                : needsDepositAtHandover
                  ? "Inspect, collect deposit & start ride"
                  : "Complete inspection & start ride"
            }
            acting={acting || !pickupTimeReached}
            onClick={startRide}
          />
          <ActionButton
            label="Mark as no-show"
            variant="outline"
            acting={acting}
            onClick={() => runAction(() => bikeVendorApi.markNoShow(booking.id, { note }), "Marked as no-show")}
          />
        </div>
      )}

      {(status === "pickup_completed" || status === "rental_started") && (
        <ActionButton
          label="Collect security deposit"
          acting={acting}
          onClick={() => runAction(() => bikeVendorApi.collectDeposit(booking.id, {}), "Deposit collected")}
        />
      )}

      {status === "return_requested" && (
        <div className="space-y-2 rounded-xl border border-gray-100 p-3">
          <p className="text-xs font-bold text-gray-600">Return inspection & settlement</p>
          <InspectionMediaForm
            images={inspectionImages}
            videos={inspectionVideos}
            onImagesChange={setInspectionImages}
            onVideosChange={setInspectionVideos}
            disabled={acting}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={damageFee}
              onChange={(e) => setDamageFee(e.target.value)}
              placeholder="Damage fee (₹)"
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
            <input
              value={lateFee}
              onChange={(e) => setLateFee(e.target.value)}
              placeholder="Late fee override (optional)"
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
          </div>
          <button
            type="button"
            disabled={previewingLate}
            onClick={previewLate}
            className="w-full rounded-lg border border-gray-200 py-2 text-xs font-bold text-gray-600 disabled:opacity-60"
          >
            {previewingLate ? "Calculating…" : "Preview late/damage charges"}
          </button>
          {latePreview && (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
              <p>Late fee: {money(latePreview.totalLateCharge)}</p>
              <p>Damage fee: {money(latePreview.damageFee)}</p>
              <p>Deducted from deposit: {money(latePreview.depositDeduction)}</p>
              <p className="font-bold text-gray-800">Remaining payable: {money(latePreview.remainingPayable)}</p>
            </div>
          )}
          <ActionButton
            label="Complete inspection & settle"
            acting={acting}
            onClick={() =>
              runAction(
                () =>
                  bikeVendorApi.inspectBooking(booking.id, {
                    damageFee: Number(damageFee) || 0,
                    ...(lateFee !== "" ? { lateFee: Number(lateFee) } : {}),
                    images: inspectionImages,
                    videos: inspectionVideos,
                  }),
                "Inspection completed",
              )
            }
          />
        </div>
      )}

      {booking.lateReturn?.remainingAmount > 0 && (
        <ActionButton
          label={`Collect remaining late balance (${money(booking.lateReturn.remainingAmount)})`}
          acting={acting}
          onClick={() => runAction(() => bikeVendorApi.collectLateBalance(booking.id, { method: "cash" }), "Late balance collected")}
        />
      )}

      {depositRefundReady && (
        <ActionButton
          label={`Release deposit refund to wallet (${money(booking.depositRefund?.amount)})`}
          acting={acting}
          onClick={() => runAction(() => bikeVendorApi.releaseDepositRefund(booking.id, {}), "Deposit refund released")}
        />
      )}

      {canReassign && (
        <button
          type="button"
          onClick={openReassign}
          className="w-full rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
        >
          Reassign to a different bike
        </button>
      )}

      {isCancellable && (
        <button
          type="button"
          onClick={openCancelConfirm}
          className="w-full rounded-xl border border-red-100 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50"
        >
          Cancel booking
        </button>
      )}

      {canOverrideNoShow && (
        <button
          type="button"
          onClick={() => {
            setOverrideReason("");
            setShowOverrideConfirm(true);
          }}
          className="w-full rounded-xl border border-purple-200 py-2.5 text-xs font-bold text-purple-700 hover:bg-purple-50"
        >
          Override No-Show
        </button>
      )}

      {["completed", "deposit_refunded", "cancelled", "rejected", "expired"].includes(status)
        && !depositRefundReady && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">No further action needed for this booking.</p>
      )}

      {showCancelConfirm && cancelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900">Confirm cancellation</h3>
              <button type="button" onClick={() => setShowCancelConfirm(false)}>
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <p>Cancellation charge: {money(cancelPreview.cancellationCharge)}</p>
              <p>Refundable to wallet: {money(cancelPreview.walletCreditAmount)}</p>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cancellation reason (required)"
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600"
              >
                Back
              </button>
              <button
                type="button"
                disabled={acting || !note.trim()}
                onClick={() =>
                  runAction(() => bikeVendorApi.cancelBooking(booking.id, { reason: note }), "Booking cancelled").then(() =>
                    setShowCancelConfirm(false),
                  )
                }
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                Confirm cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showOverrideConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900">Override no-show</h3>
              <button type="button" onClick={() => setShowOverrideConfirm(false)}>
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Restores this booking to awaiting-pickup with a fresh pickup window so the rider can
              still be checked in and the ride started. This is logged with your name and reason.
            </p>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={3}
              placeholder="Reason (required) — e.g. rider was delayed, confirmed by phone"
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOverrideConfirm(false)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600"
              >
                Back
              </button>
              <button
                type="button"
                disabled={acting || !overrideReason.trim()}
                onClick={() =>
                  runAction(
                    () => bikeVendorApi.overrideNoShow(booking.id, { reason: overrideReason.trim() }),
                    "No-show overridden — booking restored",
                  ).then(() => setShowOverrideConfirm(false))
                }
                className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                Confirm override
              </button>
            </div>
          </div>
        </div>
      )}

      {reassignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900">Reassign bike</h3>
              <button type="button" onClick={() => setReassignOpen(false)}>
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            {availableBikes.length === 0 ? (
              <p className="text-xs text-gray-500">No other available bikes in this zone.</p>
            ) : (
              <select
                value={reassignBikeId}
                onChange={(e) => setReassignBikeId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
              >
                <option value="">Select a bike…</option>
                {availableBikes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.registrationNumber}
                  </option>
                ))}
              </select>
            )}
            <input
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="Reason (optional)"
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReassignOpen(false)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={acting || !reassignBikeId}
                onClick={() =>
                  runAction(
                    () => bikeVendorApi.reassignBooking(booking.id, { newBikeId: reassignBikeId, reason: reassignReason }),
                    "Booking reassigned",
                  ).then(() => setReassignOpen(false))
                }
                className="rounded-lg bg-[#FF6A00] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, acting, onClick, variant = "solid" }) {
  return (
    <button
      type="button"
      disabled={acting}
      onClick={onClick}
      className={`w-full rounded-xl py-2.5 text-xs font-bold disabled:opacity-60 ${
        variant === "outline"
          ? "border border-gray-200 text-gray-600 hover:bg-gray-50"
          : "bg-[#FF6A00] text-white"
      }`}
    >
      {label}
    </button>
  );
}
