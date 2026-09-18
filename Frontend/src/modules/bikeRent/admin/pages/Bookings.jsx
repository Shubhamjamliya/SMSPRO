import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bike,
  Eye,
  ExternalLink,
  FileText,
  IdCard,
  Mail,
  Phone,
  Search,
  X,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  AdminTable,
  FilterBar,
  FormLayout,
  FormSection,
  FormRow,
  FormField,
  StatusBadge,
  EmptyState,
  TableSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import InspectionMediaForm, {
  InspectionMediaGallery,
} from "../../shared/components/InspectionMediaForm";
import PickupCountdown from "../../shared/components/PickupCountdown";
import {
  BIKE_RENT_ADMIN_PAGE_CLASS,
  BIKE_RENT_ADMIN_SELECT_CLASS,
  BIKE_RENT_STAT_GRID_3_CLASS,
} from "../utils/adminTheme";
import { cn } from "@/lib/utils";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const bookingId = (booking) => booking?.id || booking?._id;

function toLocalInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

const DIALOG_CLASS =
  "just-order-theme-scope !flex w-[calc(100vw-0.75rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 "
  + "max-h-[min(96dvh,960px)] rounded-2xl sm:w-[calc(100vw-2rem)] sm:rounded-3xl";

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

const statusLabel = (status) => STATUS_LABELS[status] || status;

const OPS_OPTIONS = [
  { value: "", label: "All queues" },
  { value: "live", label: "Live rentals" },
  { value: "pickups", label: "Upcoming pickups (24h)" },
  { value: "returns", label: "Upcoming returns (24h)" },
  { value: "late", label: "Late returns" },
  { value: "extensions", label: "Extension requests" },
  { value: "refunds", label: "Pending refunds" },
];

const OPS_TITLES = {
  live: "Live Rentals",
  pickups: "Upcoming Pickups",
  returns: "Upcoming Returns",
  late: "Late Returns",
  extensions: "Extension Requests",
  refunds: "Pending Refunds",
};

const money = (value) => `₹${Number(value || 0).toLocaleString()}`;
const when = (value) => (value ? new Date(value).toLocaleString() : "—");
const text = (value) => (value === 0 || value ? String(value) : "—");

function formatRemaining(expiresAt) {
  if (!expiresAt) return "";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "Expired";
  const mins = Math.ceil(ms / 60000);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m left`;
  }
  return `${mins} min left`;
}

function getCustomer(booking) {
  const rider = booking?.riderSnapshot || {};
  const customer = booking?.customer || {};
  const docs = customer.documents || {};
  return {
    name: customer.name || rider.name || booking?.customerName || "",
    phone: customer.phone || rider.phone || "",
    email: customer.email || rider.email || "",
    profileImage: customer.profileImage || "",
    drivingLicenseNumber:
      customer.drivingLicenseNumber || rider.drivingLicenseNumber || "",
    aadhaarNumber: customer.aadhaarNumber || "",
    documents: {
      drivingLicenseFront: docs.drivingLicenseFront || "",
      drivingLicenseBack: docs.drivingLicenseBack || "",
      aadhaarFront: docs.aadhaarFront || "",
      aadhaarBack: docs.aadhaarBack || "",
    },
    id: customer.id || booking?.userId || "",
  };
}

function isPdfUrl(url = "") {
  return /\.pdf($|\?)/i.test(String(url)) || String(url).includes("/raw/");
}

function bikePrimaryImage(bike = {}) {
  if (bike.primaryImage) return bike.primaryImage;
  const images = bike.images || [];
  const primary = images.find((item) => item?.isPrimary && item?.url);
  return primary?.url || images[0]?.url || "";
}

function DetailCard({ title, children, className }) {
  const items = Array.isArray(children)
    ? children.filter(Boolean)
    : children
      ? [children]
      : [];
  if (!items.length) return null;
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5", className)}>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">{items}</div>
    </section>
  );
}

function DetailItem({ label, value, full = false }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className={full ? "sm:col-span-2 min-w-0" : "min-w-0"}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 break-words text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function DocThumb({ label, url, onPreview }) {
  const has = Boolean(url);
  return (
    <button
      type="button"
      disabled={!has}
      onClick={() => has && onPreview?.({ url, label })}
      className={cn(
        "group min-w-0 overflow-hidden rounded-xl border text-left transition",
        has
          ? "border-slate-200 bg-white hover:border-orange-300 hover:shadow-sm"
          : "cursor-not-allowed border-dashed border-slate-200 bg-slate-50",
      )}
    >
      <div className="relative flex h-24 items-center justify-center overflow-hidden bg-slate-100 sm:h-28">
        {has ? (
          isPdfUrl(url) ? (
            <div className="flex flex-col items-center gap-1 text-slate-500">
              <FileText className="h-7 w-7 text-[#FF6A00]" />
              <span className="text-[10px] font-bold">PDF</span>
            </div>
          ) : (
            <img src={url} alt={label} className="h-full w-full object-cover" />
          )
        ) : (
          <span className="text-[11px] font-medium text-slate-400">Not uploaded</span>
        )}
        {has ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-800">
              <Eye className="h-3 w-3" /> View
            </span>
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <p className="truncate text-[11px] font-semibold text-slate-700">{label}</p>
        {has ? <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" /> : null}
      </div>
    </button>
  );
}

function isPendingApproval(status) {
  return ["pending_approval", "requested"].includes(String(status || ""));
}

export default function Bookings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";
  const initialDepositStatus = searchParams.get("depositStatus") || "all";
  const initialOps = searchParams.get("ops") || "";
  const [bookings, setBookings] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(
    STATUS_OPTIONS.includes(initialStatus) ? initialStatus : "all",
  );
  const [depositStatus, setDepositStatus] = useState(initialDepositStatus);
  const [ops, setOps] = useState(
    OPS_OPTIONS.some((row) => row.value === initialOps) ? initialOps : "",
  );
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [extensionReason, setExtensionReason] = useState("");
  const [reassignBikeId, setReassignBikeId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [bikeOptions, setBikeOptions] = useState([]);
  const [inspection, setInspection] = useState({
    inspectionNotes: "",
    damageFee: "",
    lateFee: "",
  });
  const [actualReturnAt, setActualReturnAt] = useState("");
  const [latePreview, setLatePreview] = useState(null);
  const [latePreviewLoading, setLatePreviewLoading] = useState(false);
  const [lateBalanceMethod, setLateBalanceMethod] = useState("cash");
  const [lateBalanceTxn, setLateBalanceTxn] = useState("");
  const [handoverCode, setHandoverCode] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [depositCollectionMethod, setDepositCollectionMethod] = useState("cash");
  const [depositTransactionId, setDepositTransactionId] = useState("");
  const [pickupInspectionForm, setPickupInspectionForm] = useState({
    images: [],
    videos: [],
    conditionNotes: "",
    fuelLevel: "",
    meterReading: "",
  });
  const [returnInspectionForm, setReturnInspectionForm] = useState({
    images: [],
    videos: [],
    conditionNotes: "",
    fuelLevel: "",
    meterReading: "",
    returnCondition: "same_condition",
    damages: [],
    damageFee: "",
  });
  const [saving, setSaving] = useState(false);
  const [pickupMediaError, setPickupMediaError] = useState("");
  const [returnMediaError, setReturnMediaError] = useState("");
  const [docPreview, setDocPreview] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [financeDetail, setFinanceDetail] = useState(null);
  const [financeLoading, setFinanceLoading] = useState(false);

  // Auto-unlock the pickup form once the scheduled time arrives, without needing to reopen the dialog.
  useEffect(() => {
    if (!detail || detail.status !== "reserved") return undefined;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [detail]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeRentAdminApi.getBookings({
        page: meta.page,
        limit: meta.limit,
        search: search.trim() || undefined,
        status: ops ? undefined : (status === "all" ? undefined : status),
        depositStatus: depositStatus === "all" ? undefined : depositStatus,
        ops: ops || undefined,
      });
      setBookings(result.records);
      setMeta((current) => ({ ...current, ...result }));
    } catch (error) {
      toast.error(message(error, "Failed to load bookings"));
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, status, depositStatus, ops]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const fromUrl = searchParams.get("status");
    const depositFromUrl = searchParams.get("depositStatus");
    const opsFromUrl = searchParams.get("ops") || "";
    if (fromUrl && STATUS_OPTIONS.includes(fromUrl) && fromUrl !== status) {
      setStatus(fromUrl);
      setMeta((value) => ({ ...value, page: 1 }));
    }
    if (depositFromUrl && depositFromUrl !== depositStatus) {
      setDepositStatus(depositFromUrl);
      setMeta((value) => ({ ...value, page: 1 }));
    }
    if (opsFromUrl !== ops && OPS_OPTIONS.some((row) => row.value === opsFromUrl)) {
      setOps(opsFromUrl);
      setMeta((value) => ({ ...value, page: 1 }));
    }
    if (!opsFromUrl && ops) {
      setOps("");
      setMeta((value) => ({ ...value, page: 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync URL → filter only
  }, [searchParams]);

  const syncUrlFilters = (nextStatus, nextDepositStatus, nextOps = ops) => {
    const params = {};
    if (nextOps) params.ops = nextOps;
    if (!nextOps && nextStatus && nextStatus !== "all") params.status = nextStatus;
    if (nextDepositStatus && nextDepositStatus !== "all") {
      params.depositStatus = nextDepositStatus;
    }
    setSearchParams(params);
  };

  const openDetail = async (row) => {
    setDocPreview(null);
    setDetail(row);
    setDetailLoading(true);
    try {
      const result = await bikeRentAdminApi.getBookingById(bookingId(row));
      setDetail(result);
      setHandoverCode("");
      setRejectReason("");
      setExtensionReason("");
      setReassignBikeId("");
      setReassignReason("");
      setDepositCollectionMethod("cash");
      setDepositTransactionId("");
      setPickupInspectionForm({
        images: [],
        videos: [],
        conditionNotes: "",
        fuelLevel: "",
        meterReading: "",
      });
      setReturnInspectionForm({
        images: [],
        videos: [],
        conditionNotes: "",
        fuelLevel: "",
        meterReading: "",
        returnCondition: "same_condition",
        damages: [],
        damageFee: "",
      });
      setInspection({
        inspectionNotes: result.inspectionNotes || "",
        damageFee: String(result.money?.damageFee ?? ""),
        lateFee: "",
      });
      setActualReturnAt(toLocalInputValue(result.actualEndAt || new Date().toISOString()));
      setLatePreview(result.lateReturn || null);
      setLateBalanceMethod("cash");
      setLateBalanceTxn("");
      setFinanceDetail(null);
      setFinanceLoading(true);
      Promise.allSettled([
        bikeRentAdminApi.getBookingInvoice(bookingId(row)),
        bikeRentAdminApi.getBookingSettlement(bookingId(row)),
        bikeRentAdminApi.getBookingTransactions(bookingId(row)),
      ])
        .then(([invoiceRes, settlementRes, txnRes]) => {
          setFinanceDetail({
            invoice: invoiceRes.status === "fulfilled" ? invoiceRes.value?.invoice : null,
            extensions: invoiceRes.status === "fulfilled" ? (invoiceRes.value?.extensions || []) : [],
            settlement: settlementRes.status === "fulfilled" ? settlementRes.value : null,
            transactions: txnRes.status === "fulfilled" ? (txnRes.value || []) : [],
          });
        })
        .finally(() => setFinanceLoading(false));
      try {
        const bikes = await bikeRentAdminApi.getBikeDropdown({
          zoneId: result.zoneId?.id || result.zoneId || result.zoneSnapshot?.id,
        });
        setBikeOptions(bikes || []);
      } catch {
        setBikeOptions([]);
      }
    } catch (error) {
      toast.error(message(error, "Failed to load booking details"));
    } finally {
      setDetailLoading(false);
    }
  };

  const resolveExtension = async (action) => {
    if (!detail) return;
    if (action === "reject" && !String(extensionReason || "").trim()) {
      return toast.error("Enter a rejection reason");
    }
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.resolveExtension(bookingId(detail), {
        action,
        reason: String(extensionReason || "").trim() || undefined,
      });
      setDetail(result);
      setExtensionReason("");
      toast.success(action === "reject" ? "Extension rejected" : "Extension approved");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to resolve extension"));
    } finally {
      setSaving(false);
    }
  };

  const reassignBike = async () => {
    if (!detail) return;
    if (!String(reassignBikeId || "").trim()) {
      return toast.error("Select a replacement bike");
    }
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.reassignBooking(bookingId(detail), {
        newBikeId: String(reassignBikeId).trim(),
        reason: String(reassignReason || "").trim() || undefined,
      });
      setDetail(result);
      setReassignBikeId("");
      setReassignReason("");
      toast.success("Booking reassigned");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to reassign bike"));
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (value, note = "") => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.updateBookingStatus(bookingId(detail), {
        status: value,
        ...(note ? { note } : {}),
      });
      setDetail(result);
      toast.success(
        value === "cancelled" ? "Booking cancelled" : "Booking status updated",
      );
      load();
      return true;
    } catch (error) {
      toast.error(message(error, "Failed to update booking"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openCancelModal = () => {
    setCancelReason("");
    setCancelModalOpen(true);
  };

  const confirmCancelBooking = async () => {
    const reason = String(cancelReason || "").trim();
    if (!reason) {
      toast.error("Please enter a cancellation reason");
      return;
    }
    const ok = await updateStatus("cancelled", reason);
    if (ok) {
      setCancelModalOpen(false);
      setCancelReason("");
    }
  };

  const openOverrideModal = () => {
    setOverrideReason("");
    setOverrideModalOpen(true);
  };

  const confirmOverrideNoShow = async () => {
    if (!detail) return;
    const reason = String(overrideReason || "").trim();
    if (!reason) {
      toast.error("Please enter a reason for restoring this booking");
      return;
    }
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.overrideNoShow(bookingId(detail), { reason });
      setDetail(result);
      setOverrideModalOpen(false);
      setOverrideReason("");
      toast.success("No-show overridden — booking restored to awaiting pickup");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to override no-show"));
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.approveBooking(bookingId(detail), {
        note: "Approved by admin",
      });
      setDetail(result);
      toast.success("Booking approved — user can complete payment");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to approve booking"));
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (!detail) return;
    const reason = String(rejectReason || "").trim();
    if (!reason) {
      return toast.error("Enter a rejection reason");
    }
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.rejectBooking(bookingId(detail), {
        reason,
      });
      setDetail(result);
      setRejectReason("");
      toast.success("Booking rejected");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to reject booking"));
    } finally {
      setSaving(false);
    }
  };

  const startRide = async () => {
    if (!detail) return;
    if (detail.startAt && Date.now() < new Date(detail.startAt).getTime()) {
      return toast.error("Bike pickup is not allowed before the scheduled pickup time.");
    }
    if (!String(handoverCode || "").trim()) {
      return toast.error("Ask the rider for their pickup code and enter it");
    }
    const hasPickupMedia =
      Boolean(detail.pickupInspectionId)
      || pickupInspectionForm.images.length > 0;
    if (!hasPickupMedia) {
      setPickupMediaError("Capture at least one inspection photo with the camera");
      return toast.error("Capture at least one inspection photo before handover");
    }
    setPickupMediaError("");
    const needsDeposit =
      detail.securityDepositPayment?.depositStatus === "pending_collection";
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.startRide(bookingId(detail), {
        pickupCode: String(handoverCode).trim(),
        collectDeposit: needsDeposit,
        depositCollectionMethod: needsDeposit ? depositCollectionMethod : undefined,
        depositTransactionId: needsDeposit
          ? String(depositTransactionId || "").trim() || undefined
          : undefined,
        images: pickupInspectionForm.images,
        videos: pickupInspectionForm.videos.slice(0, 1),
        conditionNotes: pickupInspectionForm.conditionNotes,
      });
      setDetail(result);
      setHandoverCode("");
      setPickupMediaError("");
      toast.success("Pickup inspection saved — rental started");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to start ride"));
    } finally {
      setSaving(false);
    }
  };

  const collectDeposit = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.collectDeposit(bookingId(detail), {
        method: depositCollectionMethod,
        transactionId: String(depositTransactionId || "").trim() || undefined,
        note: "Collected by admin",
      });
      setDetail(result);
      toast.success("Security deposit marked as collected");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to collect deposit"));
    } finally {
      setSaving(false);
    }
  };

  const inspect = async () => {
    if (Number(inspection.damageFee || 0) < 0 || Number(inspection.lateFee || 0) < 0) {
      return toast.error("Inspection fees cannot be negative");
    }
    if (!returnInspectionForm.images.length) {
      setReturnMediaError("Upload at least one inspection photo");
      return toast.error("Upload at least one inspection photo for return");
    }
    setReturnMediaError("");
    setSaving(true);
    try {
      const damageFeeValue =
        returnInspectionForm.returnCondition === "damage_found"
          ? Number(returnInspectionForm.damageFee || inspection.damageFee || 0)
          : Number(inspection.damageFee || 0);
      const result = await bikeRentAdminApi.inspectBooking(bookingId(detail), {
        inspectionNotes: inspection.inspectionNotes || returnInspectionForm.conditionNotes,
        damageFee: damageFeeValue,
        lateFee: inspection.lateFee === "" ? undefined : Number(inspection.lateFee || 0),
        actualReturnAt: fromLocalInputValue(actualReturnAt),
        images: returnInspectionForm.images,
        videos: returnInspectionForm.videos.slice(0, 1),
        conditionNotes: returnInspectionForm.conditionNotes || inspection.inspectionNotes,
        returnCondition: returnInspectionForm.returnCondition,
        repairCharges: damageFeeValue,
        damages: returnInspectionForm.returnCondition === "damage_found"
          ? [{
            description: returnInspectionForm.conditionNotes || inspection.inspectionNotes || "Damage noted at return",
            estimatedCost: damageFeeValue,
            images: returnInspectionForm.images,
          }]
          : [],
      });
      setDetail(result);
      setLatePreview(result.lateReturn || result.lateBilling || null);
      setReturnMediaError("");
      const remaining = Number(result.lateReturn?.remainingAmount || 0);
      toast.success(
        remaining > 0
          ? `Return settled — ₹${remaining} remaining payable`
          : "Return inspection completed and deposit settled",
      );
      load();
    } catch (error) {
      toast.error(message(error, "Failed to submit inspection"));
    } finally {
      setSaving(false);
    }
  };

  const collectLateBalance = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.collectLateBalance(bookingId(detail), {
        method: lateBalanceMethod,
        transactionId: String(lateBalanceTxn || "").trim() || undefined,
        note: "Late balance collected by admin",
      });
      setDetail(result);
      setLatePreview(result.lateReturn || null);
      toast.success("Remaining late balance collected");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to collect late balance"));
    } finally {
      setSaving(false);
    }
  };

  const releaseDepositRefund = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await bikeRentAdminApi.releaseDepositRefund(bookingId(detail), {
        force: true,
        note: "Refund released by admin",
      });
      setDetail(result);
      toast.success("Security deposit refunded to wallet");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to release deposit refund"));
    } finally {
      setSaving(false);
    }
  };

  const canApproveReject = isPendingApproval(detail?.status);
  const canResolveExtension = detail?.pendingExtension?.status === "requested";
  const canReassignBike = Boolean(detail)
    && !["cancelled", "rejected", "expired", "completed", "deposit_refunded", "no_show"].includes(
      detail?.status,
    );
  const canStartRide = detail?.status === "reserved";
  const pickupTimeReached = !detail?.startAt || now >= new Date(detail.startAt).getTime();
  const canSubmitStartRide = canStartRide && pickupTimeReached;
  const canCollectDeposit =
    detail?.status === "reserved"
    && detail?.securityDepositPayment?.depositStatus === "pending_collection";
  const canEndInspect = [
    "active",
    "rental_started",
    "pickup_completed",
    "return_requested",
    "inspection",
  ].includes(detail?.status);
  const canCollectLateBalance =
    detail?.status === "completed"
    && Number(detail?.lateReturn?.remainingAmount || 0) > 0
    && detail?.lateReturn?.paymentStatus === "pending";
  const canReleaseDepositRefund =
    ["refund_processing", "completed"].includes(detail?.status)
    && detail?.depositRefund?.status === "processing"
    && Number(detail?.depositRefund?.amount || 0) > 0
    && !(
      Number(detail?.lateReturn?.remainingAmount || 0) > 0
      && detail?.lateReturn?.paymentStatus === "pending"
    );
  const canCancel = [
    "pending_approval",
    "requested",
    "payment_pending",
    "reserved",
  ].includes(detail?.status);
  const canOverrideNoShow = detail?.status === "no_show";
  const customer = getCustomer(detail);
  const bike = detail?.bike || detail?.bikeSnapshot || {};
  const zone = detail?.zoneSnapshot || {};
  const hub = zone.pickupHub || detail?.bike?.pickupHub || detail?.bike?.hub || {};
  const categoryName =
    detail?.categoryName
    || bike.categoryName
    || detail?.bikeSnapshot?.categoryName
    || bike.category?.name
    || "";
  const zoneName = detail?.zoneName || zone.name || bike.zoneName || bike.zone?.name || "";
  const hubName =
    detail?.hubName
    || hub.name
    || zone.hubName
    || bike.hubName
    || bike.hub?.name
    || "";
  const bikeImage = bikePrimaryImage(bike) || bikePrimaryImage(detail?.bikeSnapshot || {});
  const bikeGallery = (
    Array.isArray(bike.images) && bike.images.length
      ? bike.images
      : Array.isArray(detail?.bikeSnapshot?.images)
        ? detail.bikeSnapshot.images
        : []
  )
    .map((item) => (typeof item === "string" ? item : item?.url))
    .filter(Boolean);
  const docs = customer.documents || {};
  const hasAnyDoc = Boolean(
    docs.drivingLicenseFront
    || docs.drivingLicenseBack
    || docs.aadhaarFront
    || docs.aadhaarBack,
  );
  const pay = detail?.money || {};
  const payment = detail?.payment || {};
  const depositPay = detail?.securityDepositPayment || {};
  const lateBilling = latePreview || detail?.lateReturn || null;
  const pendingCount = bookings.filter((item) => isPendingApproval(item.status)).length;
  const pendingDepositCount = bookings.filter(
    (item) => item.securityDepositPayment?.depositStatus === "pending_collection",
  ).length;

  useEffect(() => {
    if (!detail || !canEndInspect) return undefined;
    const id = bookingId(detail);
    if (!id) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLatePreviewLoading(true);
      try {
        const damageFeeValue =
          returnInspectionForm.returnCondition === "damage_found"
            ? Number(returnInspectionForm.damageFee || inspection.damageFee || 0)
            : Number(inspection.damageFee || 0);
        const preview = await bikeRentAdminApi.previewLateCharges(id, {
          actualReturnAt: fromLocalInputValue(actualReturnAt) || new Date().toISOString(),
          damageFee: damageFeeValue,
          lateFee: inspection.lateFee === "" ? undefined : Number(inspection.lateFee),
        });
        if (!cancelled) setLatePreview(preview);
      } catch {
        if (!cancelled) setLatePreview(detail.lateReturn || null);
      } finally {
        if (!cancelled) setLatePreviewLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    detail,
    canEndInspect,
    actualReturnAt,
    inspection.damageFee,
    inspection.lateFee,
    returnInspectionForm.returnCondition,
    returnInspectionForm.damageFee,
  ]);

  const columns = [
    {
      key: "bookingNumber",
      header: "Booking",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.bookingNumber || row.id}</p>
          <p className="text-xs text-muted-foreground">{when(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (row) => {
        const c = getCustomer(row);
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{c.name || "—"}</p>
            <p className="truncate text-xs text-muted-foreground">{c.phone || c.email || "—"}</p>
          </div>
        );
      },
    },
    {
      key: "bike",
      header: "Bike",
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-medium">
              {row.bike?.name || row.bikeName || row.bikeSnapshot?.name || "—"}
            </p>
            {row.ownerType === "vendor" && (
              <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-600">
                Vendor
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {row.categoryName
              || row.bike?.categoryName
              || row.bikeSnapshot?.categoryName
              || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      cell: (row) => {
        const zoneLabel = row.zoneName || row.zoneSnapshot?.name || row.bike?.zoneName || "";
        const hubLabel =
          row.hubName
          || row.zoneSnapshot?.hubName
          || row.zoneSnapshot?.pickupHub?.name
          || row.bike?.hubName
          || "";
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{hubLabel || zoneLabel || "—"}</p>
            {hubLabel && zoneLabel ? (
              <p className="truncate text-xs text-muted-foreground">{zoneLabel}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "startAt",
      header: "Start",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs sm:text-sm">{when(row.startAt)}</span>
      ),
    },
    {
      key: "totalAmount",
      header: "Total",
      cell: (row) => money(row.money?.totalPaid || row.money?.totalPayable),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <div className="min-w-0">
          <StatusBadge status={row.status} label={statusLabel(row.status)} />
          <div className="mt-1">
            <PickupCountdown booking={row} />
          </div>
          {row.pendingExtension?.status === "requested" ? (
            <p className="mt-1 text-[10px] font-semibold text-amber-700">
              Extension requested
            </p>
          ) : null}
          {(row.status === "payment_pending" || isPendingApproval(row.status)) && row.expiresAt ? (
            <p className="mt-1 text-[10px] font-medium text-amber-700">
              Hold: {formatRemaining(row.expiresAt)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => openDetail(row)}>
          <Eye size={16} />
        </Button>
      ),
    },
  ];

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title={ops ? OPS_TITLES[ops] || "Bike Rental Booking Management" : "Bike Rental Booking Management"}
        description={
          ops
            ? "Ops queue filtered from the dashboard / sidebar presets"
            : "Review booking requests, approve or reject, then manage payments and hub handover"
        }
      />
      <div className={BIKE_RENT_STAT_GRID_3_CLASS}>
        <StatCard title="Total Bookings" value={String(meta.total)} />
        <StatCard title="Pending Approval (page)" value={String(pendingCount)} />
        <StatCard title="Pending Deposits (page)" value={String(pendingDepositCount)} />
      </div>

      <SectionCard flush>
        <div className="space-y-4 p-3 sm:p-4">
          <FilterBar
            start={
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search booking #, name, phone..."
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setMeta((value) => ({ ...value, page: 1 }));
                    }}
                  />
                </div>
                <select
                  className={`${BIKE_RENT_ADMIN_SELECT_CLASS} sm:w-52`}
                  value={ops}
                  onChange={(event) => {
                    const next = event.target.value;
                    setOps(next);
                    setMeta((value) => ({ ...value, page: 1 }));
                    syncUrlFilters(status, depositStatus, next);
                  }}
                >
                  {OPS_OPTIONS.map((item) => (
                    <option key={item.value || "all"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  className={`${BIKE_RENT_ADMIN_SELECT_CLASS} sm:w-48`}
                  value={status}
                  disabled={Boolean(ops)}
                  onChange={(event) => {
                    const next = event.target.value;
                    setStatus(next);
                    setMeta((value) => ({ ...value, page: 1 }));
                    syncUrlFilters(next, depositStatus);
                  }}
                >
                  <option value="all">All statuses</option>
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {statusLabel(item)}
                    </option>
                  ))}
                </select>
                <select
                  className={`${BIKE_RENT_ADMIN_SELECT_CLASS} sm:w-52`}
                  value={depositStatus}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDepositStatus(next);
                    setMeta((value) => ({ ...value, page: 1 }));
                    syncUrlFilters(status, next);
                  }}
                >
                  <option value="all">All deposit statuses</option>
                  <option value="pending_collection">Pending collection</option>
                  <option value="pending_online">Pending online</option>
                  <option value="paid">Deposit paid</option>
                  <option value="not_required">Not required</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
            }
          />
          {loading ? (
            <TableSkeleton rows={5} columns={8} />
          ) : bookings.length ? (
            <AdminTable
              columns={columns}
              data={bookings}
              getRowId={bookingId}
              pagination={{
                page: meta.page,
                totalPages: meta.pages,
                total: meta.total,
                pageSize: meta.limit,
                onPageChange: (page) => setMeta((value) => ({ ...value, page })),
                onPageSizeChange: (limit) =>
                  setMeta((value) => ({ ...value, limit, page: 1 })),
              }}
            />
          ) : (
            <EmptyState
              title="No bookings found"
              description="Bookings matching the selected filters will appear here."
            />
          )}
        </div>
      </SectionCard>

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            setDocPreview(null);
          }
        }}
      >
        <DialogContent className={DIALOG_CLASS}>
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base sm:text-lg">Booking Details</DialogTitle>
            {detail ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-800">
                  {detail.bookingNumber || detail.id}
                </span>
                <StatusBadge status={detail.status} label={statusLabel(detail.status)} />
                <PickupCountdown booking={detail} />
              </div>
            ) : null}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
            {detailLoading ? (
              <TableSkeleton rows={5} columns={2} />
            ) : detail ? (
              <div className="space-y-3">
                {/* Summary strip: bike + customer at a glance */}
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
                  <div className="grid gap-0 sm:grid-cols-[140px_1fr]">
                    <button
                      type="button"
                      disabled={!bikeImage}
                      onClick={() => bikeImage && setDocPreview({
                        url: bikeImage,
                        label: bike.name || detail.bikeName || "Bike",
                      })}
                      className={cn(
                        "relative flex h-36 w-full items-center justify-center overflow-hidden bg-slate-100 sm:h-full sm:min-h-[148px]",
                        bikeImage && "cursor-zoom-in",
                      )}
                    >
                      {bikeImage ? (
                        <img
                          src={bikeImage}
                          alt={bike.name || "Bike"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Bike className="h-10 w-10 text-slate-300" />
                      )}
                    </button>
                    <div className="flex flex-col gap-3 p-3 sm:p-4">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Vehicle
                        </p>
                        <h3 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                          {text(bike.name || detail.bikeName)}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {[
                            bike.registrationNumber || detail.bikeSnapshot?.registrationNumber,
                            categoryName,
                            zoneName,
                            hubName,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
                        {customer.profileImage ? (
                          <img
                            src={customer.profileImage}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-sm font-bold text-[#FF6A00] ring-2 ring-white">
                            {String(customer.name || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {text(customer.name)}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                            {customer.phone ? (
                              <a
                                href={`tel:${customer.phone}`}
                                className="inline-flex items-center gap-1 hover:text-[#FF6A00]"
                              >
                                <Phone className="h-3 w-3" />
                                {customer.phone}
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
                  {bikeGallery.length > 1 ? (
                    <div className="flex gap-2 overflow-x-auto border-t border-slate-100 px-3 py-2 sm:px-4">
                      {bikeGallery.slice(0, 8).map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setDocPreview({
                            url,
                            label: bike.name || "Bike photo",
                          })}
                          className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <DetailCard title="Customer">
                  <DetailItem label="Name" value={text(customer.name)} />
                  <DetailItem label="Phone" value={
                    customer.phone ? (
                      <a href={`tel:${customer.phone}`} className="text-[#FF6A00] hover:underline">
                        {customer.phone}
                      </a>
                    ) : "—"
                  } />
                  <DetailItem label="Email" value={text(customer.email)} />
                  <DetailItem label="License no." value={text(customer.drivingLicenseNumber)} />
                  <DetailItem label="Aadhaar no." value={text(customer.aadhaarNumber)} />
                  {customer.id ? (
                    <DetailItem label="Customer ID" value={<span className="font-mono text-xs">{customer.id}</span>} />
                  ) : null}
                </DetailCard>

                <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <IdCard className="h-3.5 w-3.5" />
                      KYC documents
                    </h3>
                    {!hasAnyDoc ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        Incomplete
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Uploaded
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-600">
                        Driving license
                        {customer.drivingLicenseNumber
                          ? ` · ${customer.drivingLicenseNumber}`
                          : ""}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <DocThumb
                          label="DL front"
                          url={docs.drivingLicenseFront}
                          onPreview={setDocPreview}
                        />
                        <DocThumb
                          label="DL back"
                          url={docs.drivingLicenseBack}
                          onPreview={setDocPreview}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-600">
                        Aadhaar
                        {customer.aadhaarNumber ? ` · ${customer.aadhaarNumber}` : ""}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <DocThumb
                          label="Aadhaar front"
                          url={docs.aadhaarFront}
                          onPreview={setDocPreview}
                        />
                        <DocThumb
                          label="Aadhaar back"
                          url={docs.aadhaarBack}
                          onPreview={setDocPreview}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <DetailCard title="Bike & location">
                  <DetailItem label="Bike" value={text(bike.name || detail.bikeName)} />
                  <DetailItem
                    label="Brand / model"
                    value={
                      [bike.brand, bike.model].filter(Boolean).join(" ")
                      || text(detail.bikeSnapshot?.brand)
                    }
                  />
                  <DetailItem
                    label="Registration"
                    value={text(bike.registrationNumber || detail.bikeSnapshot?.registrationNumber)}
                  />
                  <DetailItem label="Category" value={text(categoryName)} />
                  <DetailItem label="Zone" value={text(zoneName)} />
                  <DetailItem label="Hub" value={text(hubName)} />
                  <DetailItem label="Address" value={text(hub.address)} full />
                </DetailCard>

                <DetailCard title="Schedule">
                  <DetailItem label="Pickup" value={when(detail.startAt)} />
                  <DetailItem label="Return" value={when(detail.endAt)} />
                  <DetailItem
                    label="Duration"
                    value={
                      detail.rentalDurationHours
                        ? `${detail.rentalDurationHours} hrs`
                        : ""
                    }
                  />
                  {(detail.status === "payment_pending" || canApproveReject) ? (
                    <DetailItem
                      label="Hold remaining"
                      value={formatRemaining(detail.expiresAt) || ""}
                    />
                  ) : null}
                </DetailCard>

                <DetailCard title="Payment">
                  <DetailItem label="Rental fee" value={money(pay.rentalFee)} />
                  {Number(pay.discountAmount || 0) > 0 ? (
                    <DetailItem label="Discount" value={money(pay.discountAmount)} />
                  ) : null}
                  {Number(pay.platformFee || 0) > 0 ? (
                    <DetailItem
                      label={`Platform fee${pay.platformFeePayer ? ` (${pay.platformFeePayer})` : ""}`}
                      value={money(pay.platformFee)}
                    />
                  ) : null}
                  {Number(pay.taxAmount || 0) > 0 ? (
                    <DetailItem
                      label={`GST${pay.gstRate ? ` (${pay.gstRate}%)` : ""}`}
                      value={money(pay.taxAmount)}
                    />
                  ) : null}
                  <DetailItem label="Security deposit" value={money(pay.securityDeposit)} />
                  <DetailItem label="Total payable" value={money(pay.totalPayable)} />
                  <DetailItem label="Total paid" value={money(pay.totalPaid)} />
                  <DetailItem
                    label="Payment status"
                    value={text(payment.status || (pay.totalPaid > 0 ? "paid" : "unpaid"))}
                  />
                  <DetailItem
                    label="Deposit status"
                    value={text(depositPay.depositStatus)}
                  />
                  <DetailItem
                    label="Deposit method"
                    value={text(depositPay.depositPaymentMethod)}
                  />
                  {detail.couponCode ? (
                    <DetailItem label="Coupon" value={text(detail.couponCode)} />
                  ) : null}
                </DetailCard>

                {financeLoading ? (
                  <TableSkeleton rows={3} columns={2} />
                ) : (
                  <>
                    {financeDetail?.invoice ? (
                      <DetailCard title="Invoice">
                        <DetailItem label="Invoice number" value={text(financeDetail.invoice.invoiceNumber)} />
                        <DetailItem label="Issued" value={when(financeDetail.invoice.issuedAt)} />
                        <DetailItem label="Taxable amount" value={money(financeDetail.invoice.taxableAmount)} />
                        <DetailItem
                          label={`GST${financeDetail.invoice.gstRate ? ` (${financeDetail.invoice.gstRate}%)` : ""}`}
                          value={money(financeDetail.invoice.gstAmount)}
                        />
                        <DetailItem label="Total payable" value={money(financeDetail.invoice.totalPayable)} />
                        {financeDetail.invoice.vendorSnapshot?.gstin ? (
                          <DetailItem label="Vendor GSTIN" value={text(financeDetail.invoice.vendorSnapshot.gstin)} />
                        ) : null}
                        {financeDetail.extensions?.length ? (
                          <DetailItem
                            label="Extension invoices"
                            value={financeDetail.extensions
                              .map((ext) => `${ext.invoiceNumber} (${money(ext.totalPayable)})`)
                              .join(", ")}
                            full
                          />
                        ) : null}
                      </DetailCard>
                    ) : null}

                    {financeDetail?.settlement ? (
                      <DetailCard title="Vendor settlement">
                        <DetailItem label="Gross amount" value={money(financeDetail.settlement.grossAmount)} />
                        <DetailItem label="GST (pass-through)" value={money(financeDetail.settlement.taxAmount)} />
                        <DetailItem
                          label={`Commission (${financeDetail.settlement.commissionRate}%)`}
                          value={money(financeDetail.settlement.commissionAmount)}
                        />
                        <DetailItem label="Status" value={text(financeDetail.settlement.status)} />
                        <DetailItem
                          label="Vendor settlement amount"
                          value={money(financeDetail.settlement.vendorSettlementAmount)}
                        />
                        {financeDetail.settlement.adjustments?.length ? (
                          <DetailItem
                            label="Effective (after adjustments)"
                            value={money(financeDetail.settlement.effectiveVendorSettlementAmount)}
                          />
                        ) : null}
                      </DetailCard>
                    ) : null}

                    {financeDetail?.transactions?.length ? (
                      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5">
                        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Transactions
                        </h3>
                        <div className="space-y-1.5">
                          {financeDetail.transactions.map((txn) => (
                            <div
                              key={txn.id}
                              className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 pb-1.5 text-xs last:border-0 last:pb-0"
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800">
                                  {txn.transactionType.replace(/_/g, " ")}
                                  <span className="ml-1.5 font-normal text-slate-400">· {txn.paymentMode}</span>
                                </p>
                                <p className="text-slate-400">
                                  {txn.transactionId} · {when(txn.createdAt)}
                                </p>
                              </div>
                              <span className="shrink-0 font-semibold text-slate-900">{money(txn.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </>
                )}

                {(detail?.depositRefund?.status || detail?.status === "refund_processing") ? (
                  <DetailCard title="Deposit refund">
                    <DetailItem
                      label="Refundable amount"
                      value={money(detail.depositRefund?.amount)}
                    />
                    <DetailItem
                      label="Status"
                      value={text(detail.depositRefund?.status || detail.status)}
                    />
                    <DetailItem
                      label="Eligible at"
                      value={when(detail.depositRefund?.eligibleAt)}
                    />
                  </DetailCard>
                ) : null}

                {(lateBilling || detail?.lateReturn) ? (
                  <DetailCard title="Late / extra charges">
                    <DetailItem
                      label="Late duration"
                      value={text(lateBilling?.lateDurationLabel || lateBilling?.billableDurationLabel)}
                    />
                    <DetailItem
                      label="Extra charge"
                      value={money(lateBilling?.totalLateCharge ?? lateBilling?.chargeAmount)}
                    />
                    {Number(lateBilling?.damageFee || 0) > 0 ? (
                      <DetailItem label="Damage fee" value={money(lateBilling.damageFee)} />
                    ) : null}
                    <DetailItem
                      label="From deposit"
                      value={money(lateBilling?.depositDeduction ?? lateBilling?.deductedFromDeposit)}
                    />
                    <DetailItem
                      label="Refundable"
                      value={money(lateBilling?.refundableAmount)}
                    />
                    <DetailItem
                      label="Remaining payable"
                      value={money(lateBilling?.remainingPayable ?? lateBilling?.remainingAmount)}
                    />
                  </DetailCard>
                ) : null}

                {(detail.status === "no_show" || detail.noShow?.refundProcessed) ? (
                  <DetailCard title="No-show settlement">
                    <DetailItem label="Deduction" value={money(detail.noShow?.deductionAmount)} />
                    <DetailItem label="Deposit refunded" value={money(detail.noShow?.depositRefund)} />
                    <DetailItem label="Wallet credit" value={money(detail.noShow?.walletCreditAmount)} />
                  </DetailCard>
                ) : null}

                {(detail.cancellationReason || detail.rejectionReason || detail.status === "cancelled") ? (
                  <DetailCard title="Cancellation / rejection">
                    {detail.status === "cancelled" || detail.cancellationReason ? (
                      <>
                        <DetailItem
                          label="Cancelled by"
                          value={
                            detail.cancelledBy === "admin"
                              ? "Admin"
                              : detail.cancelledBy === "user"
                                ? "User"
                                : detail.cancelledBy === "system"
                                  ? "System"
                                  : text(detail.cancelledBy)
                          }
                        />
                        <DetailItem
                          label="Cancelled date"
                          value={when(detail.cancelledAt)}
                        />
                        <DetailItem
                          label="Cancellation reason"
                          value={text(detail.cancellationReason)}
                          full
                        />
                      </>
                    ) : null}
                    {detail.rejectionReason ? (
                      <DetailItem
                        label="Rejection reason"
                        value={text(detail.rejectionReason)}
                        full
                      />
                    ) : null}
                  </DetailCard>
                ) : null}

                {detail.pendingExtension
                  && detail.pendingExtension.status
                  && detail.pendingExtension.status !== "none" ? (
                  <DetailCard title="Extension request">
                    <DetailItem
                      label="Status"
                      value={text(detail.pendingExtension.status)}
                    />
                    <DetailItem
                      label="Requested until"
                      value={when(detail.pendingExtension.requestedEndAt)}
                    />
                    <DetailItem
                      label="Fee estimate"
                      value={money(detail.pendingExtension.feeEstimate)}
                    />
                    {detail.pendingExtension.conflictBookingId ? (
                      <DetailItem
                        label="Conflict booking"
                        value={text(detail.pendingExtension.conflictBookingId)}
                      />
                    ) : null}
                    {detail.pendingExtension.reason ? (
                      <DetailItem
                        label="Note"
                        value={text(detail.pendingExtension.reason)}
                        full
                      />
                    ) : null}
                  </DetailCard>
                ) : null}

                {canResolveExtension || canReassignBike ? (
                  <FormLayout>
                    {canResolveExtension ? (
                      <FormSection
                        title="Resolve extension"
                        className="border-0 bg-transparent p-0 shadow-none"
                      >
                        <p className="mb-2 text-xs text-muted-foreground">
                          Approve only when the window is free (reassign the conflicting booking first if needed).
                        </p>
                        <FormField label="Note / rejection reason">
                          <Input
                            value={extensionReason}
                            onChange={(event) => setExtensionReason(event.target.value)}
                            placeholder="Optional note, required when rejecting"
                          />
                        </FormField>
                      </FormSection>
                    ) : null}
                    {canReassignBike ? (
                      <FormSection
                        title="Reassign bike"
                        className="border-0 bg-transparent p-0 shadow-none"
                      >
                        <FormField label="Replacement bike (same zone)">
                          <select
                            className={BIKE_RENT_ADMIN_SELECT_CLASS}
                            value={reassignBikeId}
                            onChange={(event) => setReassignBikeId(event.target.value)}
                          >
                            <option value="">Select bike</option>
                            {bikeOptions
                              .filter((bike) => {
                                const id = bike.id || bike._id;
                                const current =
                                  detail.bikeId?.id || detail.bikeId || detail.bikeSnapshot?.id;
                                return String(id) !== String(current);
                              })
                              .map((bike) => {
                                const id = bike.id || bike._id;
                                return (
                                  <option key={id} value={id}>
                                    {bike.name || bike.registrationNumber || id}
                                  </option>
                                );
                              })}
                          </select>
                        </FormField>
                        <FormField label="Reason (optional)">
                          <Input
                            value={reassignReason}
                            onChange={(event) => setReassignReason(event.target.value)}
                            placeholder="e.g. Extension blocked by next booking"
                          />
                        </FormField>
                      </FormSection>
                    ) : null}
                  </FormLayout>
                ) : null}

                {canApproveReject ? (
                  <FormLayout>
                    <FormSection
                      title="Approve or reject"
                      className="border-0 bg-transparent p-0 shadow-none"
                    >
                      <FormField label="Rejection reason (needed to reject)">
                        <Input
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          placeholder="e.g. Documents incomplete"
                        />
                      </FormField>
                    </FormSection>
                  </FormLayout>
                ) : null}

                {canCollectDeposit ? (
                  <FormLayout>
                    <FormSection
                      title="Collect security deposit"
                      className="border-0 bg-transparent p-0 shadow-none"
                    >
                      <FormRow>
                        <FormField label="Method">
                          <select
                            className={BIKE_RENT_ADMIN_SELECT_CLASS}
                            value={depositCollectionMethod}
                            onChange={(event) => setDepositCollectionMethod(event.target.value)}
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="cod">COD</option>
                          </select>
                        </FormField>
                        <FormField label="Reference (optional)">
                          <Input
                            value={depositTransactionId}
                            onChange={(event) => setDepositTransactionId(event.target.value)}
                            placeholder="UPI ref / receipt #"
                          />
                        </FormField>
                      </FormRow>
                    </FormSection>
                  </FormLayout>
                ) : null}

                {canStartRide ? (
                  <FormLayout>
                    <FormSection
                      title="Start bike inspection & handover"
                      className="border-0 bg-transparent p-0 shadow-none"
                    >
                      <p className="mb-3 text-xs text-muted-foreground">
                        Capture bike condition photos with the camera (gallery upload disabled),
                        then ask the rider for their pickup code. Video is optional.
                      </p>
                      {!pickupTimeReached ? (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                          <p className="font-semibold">
                            Pickup opens at {when(detail.startAt)}
                          </p>
                          <p className="mt-0.5 text-amber-800">
                            The rider can arrive early, but the bike cannot be handed over or the
                            pickup code verified until the scheduled pickup time.
                          </p>
                        </div>
                      ) : null}
                      {!detail.pickupInspectionId ? (
                        <div className="space-y-3">
                          <InspectionMediaForm
                            images={pickupInspectionForm.images}
                            videos={pickupInspectionForm.videos}
                            onImagesChange={(images) => {
                              setPickupMediaError("");
                              setPickupInspectionForm((current) => ({ ...current, images }));
                            }}
                            onVideosChange={(videos) => {
                              setPickupMediaError("");
                              setPickupInspectionForm((current) => ({
                                ...current,
                                videos: videos.slice(0, 1),
                              }));
                            }}
                            disabled={saving}
                            cameraOnlyImages
                            requireImages
                            error={pickupMediaError}
                          />
                          <FormField label="Notes (optional)">
                            <Input
                              value={pickupInspectionForm.conditionNotes}
                              onChange={(event) =>
                                setPickupInspectionForm((current) => ({
                                  ...current,
                                  conditionNotes: event.target.value,
                                }))
                              }
                              placeholder="Any existing scratches or remarks"
                            />
                          </FormField>
                        </div>
                      ) : (
                        <InspectionMediaGallery
                          title="Pickup inspection saved"
                          inspection={detail.pickupInspection}
                        />
                      )}
                      <FormField label="Pickup code from rider" className="mt-3">
                        <Input
                          value={handoverCode}
                          onChange={(event) => setHandoverCode(event.target.value)}
                          placeholder={
                            pickupTimeReached
                              ? "Ask rider and enter their code"
                              : "Available once the pickup time is reached"
                          }
                          disabled={!pickupTimeReached}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          className="tracking-widest"
                        />
                      </FormField>
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        Do not use a code from this screen — only the code the rider shows/tells you.
                      </p>
                    </FormSection>
                  </FormLayout>
                ) : null}

                {canEndInspect ? (
                  <FormLayout>
                    <FormSection
                      title="Return inspection & settle"
                      className="border-0 bg-transparent p-0 shadow-none"
                    >
                      <p className="mb-3 text-xs text-muted-foreground">
                        Upload return media, set condition, then settle fees from deposit.
                      </p>
                      {detail.pickupInspection ? (
                        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <InspectionMediaGallery
                            title="Pickup condition"
                            inspection={detail.pickupInspection}
                          />
                        </div>
                      ) : null}
                      <InspectionMediaForm
                        images={returnInspectionForm.images}
                        videos={returnInspectionForm.videos}
                        onImagesChange={(images) => {
                          setReturnMediaError("");
                          setReturnInspectionForm((current) => ({ ...current, images }));
                        }}
                        onVideosChange={(videos) => {
                          setReturnMediaError("");
                          setReturnInspectionForm((current) => ({
                            ...current,
                            videos: videos.slice(0, 1),
                          }));
                        }}
                        disabled={saving}
                        requireImages
                        error={returnMediaError}
                      />
                      <FormField label="Return condition" className="mt-3">
                        <select
                          className={BIKE_RENT_ADMIN_SELECT_CLASS}
                          value={returnInspectionForm.returnCondition}
                          onChange={(event) =>
                            setReturnInspectionForm((current) => ({
                              ...current,
                              returnCondition: event.target.value,
                            }))
                          }
                        >
                          <option value="same_condition">Same condition</option>
                          <option value="damage_found">Damage found</option>
                        </select>
                      </FormField>
                      <FormField label="Notes (optional)">
                        <Input
                          value={inspection.inspectionNotes}
                          onChange={(event) =>
                            setInspection({
                              ...inspection,
                              inspectionNotes: event.target.value,
                            })
                          }
                          placeholder="Return remarks"
                        />
                      </FormField>
                      <FormField label="Actual return time">
                        <Input
                          type="datetime-local"
                          value={actualReturnAt}
                          onChange={(event) => setActualReturnAt(event.target.value)}
                        />
                      </FormField>
                      <FormRow>
                        <FormField label="Late fee (blank = auto)">
                          <Input
                            type="number"
                            min="0"
                            value={inspection.lateFee}
                            onChange={(event) =>
                              setInspection({ ...inspection, lateFee: event.target.value })
                            }
                          />
                        </FormField>
                        <FormField label="Damage fee">
                          <Input
                            type="number"
                            min="0"
                            value={
                              returnInspectionForm.returnCondition === "damage_found"
                                ? returnInspectionForm.damageFee
                                : inspection.damageFee
                            }
                            onChange={(event) => {
                              const value = event.target.value;
                              setInspection({ ...inspection, damageFee: value });
                              setReturnInspectionForm((current) => ({
                                ...current,
                                damageFee: value,
                              }));
                            }}
                          />
                        </FormField>
                      </FormRow>
                      {lateBilling ? (
                        <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-xs">
                          <p className="font-semibold text-orange-950">Billing estimate</p>
                          <div className="mt-2 grid grid-cols-2 gap-1.5 text-orange-900">
                            <span>Extra charge</span>
                            <b className="text-right">
                              {money(lateBilling.totalLateCharge ?? lateBilling.chargeAmount)}
                            </b>
                            <span>From deposit</span>
                            <b className="text-right">
                              {money(lateBilling.depositDeduction ?? lateBilling.deductedFromDeposit)}
                            </b>
                            <span>Refundable</span>
                            <b className="text-right">{money(lateBilling.refundableAmount)}</b>
                            <span>Remaining</span>
                            <b className="text-right">
                              {money(lateBilling.remainingPayable ?? lateBilling.remainingAmount)}
                            </b>
                          </div>
                        </div>
                      ) : null}
                    </FormSection>
                  </FormLayout>
                ) : null}

                {canCollectLateBalance ? (
                  <FormLayout>
                    <FormSection title="Collect remaining balance">
                      <FormRow>
                        <FormField label="Method">
                          <select
                            className={BIKE_RENT_ADMIN_SELECT_CLASS}
                            value={lateBalanceMethod}
                            onChange={(event) => setLateBalanceMethod(event.target.value)}
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                          </select>
                        </FormField>
                        <FormField label="Reference (optional)">
                          <Input
                            value={lateBalanceTxn}
                            onChange={(event) => setLateBalanceTxn(event.target.value)}
                          />
                        </FormField>
                      </FormRow>
                      <p className="text-sm font-semibold text-orange-950">
                        Amount due: {money(detail.lateReturn?.remainingAmount)}
                      </p>
                    </FormSection>
                  </FormLayout>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:justify-end sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDetail(null)}
              disabled={saving}
            >
              Close
            </Button>
            {canApproveReject ? (
              <>
                <Button
                  disabled={saving}
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={reject}
                >
                  Reject Booking
                </Button>
                <Button
                  disabled={saving}
                  className="w-full sm:w-auto"
                  onClick={approve}
                >
                  {saving ? "Saving…" : "Approve Booking"}
                </Button>
              </>
            ) : null}
            {canResolveExtension ? (
              <>
                <Button
                  disabled={saving}
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => resolveExtension("reject")}
                >
                  Reject Extension
                </Button>
                <Button
                  disabled={saving}
                  className="w-full sm:w-auto"
                  onClick={() => resolveExtension("approve")}
                >
                  Approve Extension
                </Button>
              </>
            ) : null}
            {canReassignBike && reassignBikeId ? (
              <Button
                disabled={saving}
                variant="outline"
                className="w-full sm:w-auto"
                onClick={reassignBike}
              >
                Reassign Bike
              </Button>
            ) : null}
            {canCancel && !canApproveReject ? (
              <Button
                disabled={saving}
                variant="outline"
                className="w-full sm:w-auto"
                onClick={openCancelModal}
              >
                Cancel booking
              </Button>
            ) : null}
            {detail?.status === "reserved" ? (
              <Button
                disabled={saving}
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => updateStatus("no_show")}
              >
                Mark as missed pickup
              </Button>
            ) : null}
            {canOverrideNoShow ? (
              <Button
                disabled={saving}
                variant="outline"
                className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 sm:w-auto"
                onClick={openOverrideModal}
              >
                Override No-Show
              </Button>
            ) : null}
            {detail?.status === "payment_pending" ? (
              <Button
                disabled={saving}
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => updateStatus("expired")}
              >
                Release reservation
              </Button>
            ) : null}
            {canCollectDeposit ? (
              <Button
                disabled={saving}
                variant="outline"
                className="w-full sm:w-auto"
                onClick={collectDeposit}
              >
                Mark deposit collected
              </Button>
            ) : null}
            {canStartRide ? (
              <Button
                disabled={saving || !canSubmitStartRide}
                className="w-full sm:w-auto"
                onClick={startRide}
                title={canSubmitStartRide ? undefined : `Pickup opens at ${when(detail?.startAt)}`}
              >
                {saving
                  ? "Starting…"
                  : !canSubmitStartRide
                    ? "Pickup not yet open"
                    : canCollectDeposit
                      ? "Inspect, collect deposit & start ride"
                      : "Complete inspection & start ride"}
              </Button>
            ) : null}
            {canEndInspect ? (
              <Button
                disabled={saving}
                className="w-full sm:w-auto"
                onClick={inspect}
              >
                {saving ? "Settling…" : "Confirm return & settle"}
              </Button>
            ) : null}
            {canCollectLateBalance ? (
              <Button
                disabled={saving}
                className="w-full sm:w-auto"
                onClick={collectLateBalance}
              >
                {saving ? "Collecting…" : "Collect pending amount"}
              </Button>
            ) : null}
            {canReleaseDepositRefund ? (
              <Button
                disabled={saving}
                className="w-full sm:w-auto"
                onClick={releaseDepositRefund}
              >
                {saving ? "Releasing…" : "Release Refund"}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelModalOpen}
        onOpenChange={(open) => {
          if (saving) return;
          setCancelModalOpen(open);
          if (!open) setCancelReason("");
        }}
      >
        <DialogContent className="just-order-theme-scope w-[calc(100vw-1.5rem)] max-w-md gap-3 rounded-2xl p-4 sm:rounded-3xl sm:p-5">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-base">Cancel booking</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enter a reason for cancelling
            {detail?.bookingNumber ? (
              <>
                {" "}
                <span className="font-semibold text-slate-800">{detail.bookingNumber}</span>
              </>
            ) : null}
            . The customer will see this reason.
          </p>
          <FormField label="Cancellation reason *">
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Bike is unavailable"
              className={cn(
                BIKE_RENT_ADMIN_SELECT_CLASS,
                "min-h-[5.5rem] resize-y py-2.5",
              )}
              disabled={saving}
            />
          </FormField>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setCancelModalOpen(false);
                setCancelReason("");
              }}
            >
              Keep booking
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={confirmCancelBooking}
            >
              {saving ? "Cancelling…" : "Confirm cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={overrideModalOpen}
        onOpenChange={(open) => {
          if (saving) return;
          setOverrideModalOpen(open);
          if (!open) setOverrideReason("");
        }}
      >
        <DialogContent className="just-order-theme-scope w-[calc(100vw-1.5rem)] max-w-md gap-3 rounded-2xl p-4 sm:rounded-3xl sm:p-5">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-base">Override no-show</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Restore
            {detail?.bookingNumber ? (
              <>
                {" "}
                <span className="font-semibold text-slate-800">{detail.bookingNumber}</span>
              </>
            ) : null}
            {" "}to awaiting-pickup with a fresh pickup window, allowing OTP verification and ride
            start again. This is logged with your name and the reason below.
          </p>
          <FormField label="Reason *">
            <textarea
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Rider was delayed by traffic, arrived shortly after and confirmed by phone"
              className={cn(
                BIKE_RENT_ADMIN_SELECT_CLASS,
                "min-h-[5.5rem] resize-y py-2.5",
              )}
              disabled={saving}
            />
          </FormField>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setOverrideModalOpen(false);
                setOverrideReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !overrideReason.trim()}
              onClick={confirmOverrideNoShow}
            >
              {saving ? "Restoring…" : "Confirm override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {docPreview?.url ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={docPreview.label || "Document preview"}
          onClick={() => setDocPreview(null)}
        >
          <div
            className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {docPreview.label || "Preview"}
                </p>
                <a
                  href={docPreview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[#FF6A00] hover:underline"
                >
                  Open in new tab <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <button
                type="button"
                onClick={() => setDocPreview(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-slate-50 p-3 sm:p-4">
              {isPdfUrl(docPreview.url) ? (
                <iframe
                  title={docPreview.label || "Document"}
                  src={docPreview.url}
                  className="h-[min(70vh,640px)] w-full rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={docPreview.url}
                  alt={docPreview.label || "Document"}
                  className="max-h-[min(75vh,720px)] max-w-full rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
