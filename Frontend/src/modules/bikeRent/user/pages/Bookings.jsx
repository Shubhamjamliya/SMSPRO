import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Clock3, Wallet } from "lucide-react";
import { toast } from "sonner";
import bikeRentUserApi from "../services/userApi";
import PickupLocationCard, {
  getPickupHub,
  getPickupZoneName,
} from "../components/PickupLocationCard";
import {
  BikeRentPageHeader,
  BikeRentPageShell,
  EmptyState,
  PrimaryButton,
} from "../components/ui";
import {
  getBikeRentActivePath,
  getBikeRentBookingPath,
  getBikeRentInvoicePath,
  getBikeRentPayPath,
  getBikeRentReviewPath,
} from "../utils/routes";
import CancellationRefundCard from "../components/CancellationRefundCard";
import PickupCountdown from "../../shared/components/PickupCountdown";
import {
  bookingIdOf,
  bookingMoneySummary,
  bookingStatusLabel,
  bookingStatusTone,
  cancelledByLabel,
  depositStatusLabel,
  formatCancellationDate,
  formatRemainingTime,
  isAwaitingApprovalStatus,
  isPaymentPendingStatus,
} from "../utils/bookingDisplay";
import { formatInr } from "../utils/format";
import { cn } from "@/lib/utils";

const TONE = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-sky-50 text-sky-700",
  danger: "bg-rose-50 text-rose-700",
  muted: "bg-gray-100 text-gray-600",
};

const activeStatuses = [
  "requested",
  "pending_approval",
  "payment_pending",
  "reserved",
  "pickup_completed",
  "rental_started",
  "active",
  "return_requested",
  "inspection",
];

function StatusPill({ status }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] font-bold capitalize",
        TONE[bookingStatusTone(status)],
      )}
    >
      {bookingStatusLabel(status)}
    </span>
  );
}

function BookingCard({
  booking,
  onCancel,
  cancellingId,
}) {
  const navigate = useNavigate();
  const id = bookingIdOf(booking);
  const bike = booking.bikeSnapshot || booking.bikeId || {};
  const money = bookingMoneySummary(booking);
  const awaitingApproval = isAwaitingApprovalStatus(booking.status);
  const pendingPay = isPaymentPendingStatus(booking.status);
  const active = activeStatuses.includes(booking.status)
    && !awaitingApproval
    && !pendingPay;
  const remaining = (awaitingApproval || pendingPay)
    ? formatRemainingTime(booking.expiresAt)
    : "";

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-50 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-gray-900">
            {bike.name || booking.bookingNumber}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {booking.bookingNumber}
            {bike.brand || bike.model
              ? ` · ${[bike.brand, bike.model].filter(Boolean).join(" ")}`
              : ""}
          </p>
        </div>
        <StatusPill status={booking.status} />
      </div>

      <div className="space-y-2 px-4 py-3 text-sm">
        <PickupCountdown booking={booking} />
        <p className="flex items-start gap-2 text-gray-600">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" />
          <span>
            {new Date(booking.startAt).toLocaleString()} —{" "}
            {new Date(booking.endAt).toLocaleString()}
          </span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-gray-500">Amount</span>
          <b className="text-[#FF6A00]">{formatInr(money.totalPayable)}</b>
        </p>
        <p className="flex items-center justify-between gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5" /> Deposit
          </span>
          <span>
            {formatInr(money.securityDeposit)}
            {money.depositStatus
              ? ` · ${depositStatusLabel(money.depositStatus)}`
              : ""}
          </span>
        </p>
        {awaitingApproval ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            Awaiting admin approval
            {remaining ? ` · hold ${remaining}` : ""}
          </p>
        ) : null}
        {pendingPay && remaining ? (
          <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
            Complete payment soon · {remaining}
          </p>
        ) : null}
        {booking.pendingExtension?.status === "requested" ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Extension pending admin review
            {booking.pendingExtension.requestedEndAt
              ? ` · until ${new Date(booking.pendingExtension.requestedEndAt).toLocaleString()}`
              : ""}
          </p>
        ) : null}
        {booking.pendingExtension?.status === "approved" ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
            Extension approved — pay fee if required
          </p>
        ) : null}
        {booking.depositRefund?.status === "processing" ? (
          <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
            Deposit refund processing
            {booking.depositRefund.amount
              ? ` · ${formatInr(booking.depositRefund.amount)}`
              : ""}
          </p>
        ) : null}
        {booking.depositRefund?.status === "completed" ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            Deposit refunded
            {booking.depositRefund.amount
              ? ` · ${formatInr(booking.depositRefund.amount)}`
              : ""}
          </p>
        ) : null}
        {["active", "rental_started", "pickup_completed"].includes(booking.status)
          && booking.endAt
          && new Date(booking.endAt).getTime() < Date.now() ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            Return overdue — late fees may apply
          </p>
        ) : null}
        {booking.status === "rejected" && booking.rejectionReason ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {booking.rejectionReason}
          </p>
        ) : null}
        {booking.status === "cancelled" ? (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 space-y-1">
            <p>Cancelled by {cancelledByLabel(booking.cancelledBy)}</p>
            {booking.cancellationReason ? (
              <p className="font-medium text-rose-800">Reason: {booking.cancellationReason}</p>
            ) : null}
            {booking.cancelledAt ? (
              <p className="font-medium text-rose-700/90">
                Date: {formatCancellationDate(booking.cancelledAt)}
              </p>
            ) : null}
          </div>
        ) : null}
        {booking.status === "completed"
          && Number(booking.lateReturn?.remainingAmount || 0) > 0
          && booking.lateReturn?.paymentStatus === "pending" ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Extra charges due · {formatInr(booking.lateReturn.remainingAmount)}
          </p>
        ) : null}
      </div>

      <div className="px-4 pb-3">
        <PickupLocationCard
          zoneName={getPickupZoneName(booking) || booking.zoneSnapshot?.name}
          pickupHub={getPickupHub(booking.zoneSnapshot) || getPickupHub(booking)}
          compact
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-gray-50 px-4 py-3">
        {awaitingApproval ? (
          <>
            <Link
              to={getBikeRentBookingPath(id)}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[#FF6A00] px-4 py-2.5 text-xs font-extrabold text-white"
            >
              View request
            </Link>
            <button
              type="button"
              disabled={cancellingId === id}
              onClick={() => onCancel?.(booking)}
              className="rounded-2xl border border-gray-200 px-4 py-2.5 text-xs font-bold text-gray-700"
            >
              {cancellingId === id ? "Cancelling…" : "Cancel request"}
            </button>
          </>
        ) : pendingPay ? (
          <>
            <PrimaryButton
              className="w-auto flex-1 px-4 py-2.5 text-xs"
              onClick={() => navigate(getBikeRentPayPath(id))}
            >
              Complete payment
            </PrimaryButton>
            <button
              type="button"
              disabled={cancellingId === id}
              onClick={() => onCancel?.(booking)}
              className="rounded-2xl border border-gray-200 px-4 py-2.5 text-xs font-bold text-gray-700"
            >
              {cancellingId === id ? "Cancelling…" : "Cancel booking"}
            </button>
            <Link
              to={getBikeRentBookingPath(id)}
              className="w-full text-center text-[11px] font-bold text-[#FF6A00]"
            >
              View booking details
            </Link>
          </>
        ) : (
          <>
            <Link
              to={
                active
                  ? getBikeRentActivePath(id)
                  : getBikeRentBookingPath(id)
              }
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[#FF6A00] px-4 py-2.5 text-xs font-extrabold text-white"
            >
              {booking.status === "completed"
                && Number(booking.lateReturn?.remainingAmount || 0) > 0
                && booking.lateReturn?.paymentStatus === "pending"
                ? "Pay extra charges"
                : active
                  ? "Open rental"
                  : "View booking"}
            </Link>
            {!active && !["rejected", "cancelled", "expired"].includes(booking.status) ? (
              <Link
                to={getBikeRentInvoicePath(id)}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-4 py-2.5 text-xs font-bold text-gray-700"
              >
                Invoice
              </Link>
            ) : null}
            {["completed", "refund_processing", "deposit_refunded"].includes(booking.status)
              && !booking.rating?.stars
              && !(
                Number(booking.lateReturn?.remainingAmount || 0) > 0
                && booking.lateReturn?.paymentStatus === "pending"
              ) ? (
                <Link
                  to={getBikeRentReviewPath(id)}
                  className="w-full text-center text-[11px] font-bold text-[#FF6A00]"
                >
                  Leave a review
                </Link>
              ) : null}
          </>
        )}
      </div>
    </article>
  );
}

export default function Bookings() {
  const [scope, setScope] = useState("active");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState("");
  const [cancelPreview, setCancelPreview] = useState(null);
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    bikeRentUserApi
      .getMyBookings({ scope, limit: 50 })
      .then((data) => setBookings(data.records || []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const hasLive =
      bookings.some(
        (booking) =>
          isAwaitingApprovalStatus(booking.status)
          || isPaymentPendingStatus(booking.status),
      );
    if (!hasLive) return undefined;
    const timer = setInterval(() => {
      setTick((value) => value + 1);
      load();
    }, 10000);
    return () => clearInterval(timer);
  }, [bookings, load]);

  const approvalBookings = useMemo(
    () => bookings.filter((booking) => isAwaitingApprovalStatus(booking.status)),
    [bookings],
  );
  const pendingPayBookings = useMemo(
    () => bookings.filter((booking) => isPaymentPendingStatus(booking.status)),
    [bookings],
  );
  const otherActive = useMemo(
    () =>
      scope === "active"
        ? bookings.filter(
          (booking) =>
            !isAwaitingApprovalStatus(booking.status)
            && !isPaymentPendingStatus(booking.status),
        )
        : bookings,
    [bookings, scope],
  );

  const cancelBooking = async (booking) => {
    const id = bookingIdOf(booking);
    if (!id) return;
    setCancelPreviewLoading(true);
    setCancelPreview(null);
    try {
      const preview = await bikeRentUserApi.previewCancellation(id);
      setCancelPreview({ ...preview, _bookingId: id });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load cancellation preview");
    } finally {
      setCancelPreviewLoading(false);
    }
  };

  const confirmCancel = async () => {
    const id = cancelPreview?._bookingId;
    if (!id) return;
    setCancellingId(id);
    try {
      await bikeRentUserApi.cancelBooking(id, "Cancelled by user from My Bookings");
      toast.success("Booking cancelled — refund credited to wallet");
      setCancelPreview(null);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not cancel booking");
    } finally {
      setCancellingId("");
    }
  };

  return (
    <BikeRentPageShell showBottomNav>
      <BikeRentPageHeader title="My bookings" backTo="/bike-rent" />
      <main className="space-y-4 px-4 py-4 pb-6">
        {(cancelPreview || cancelPreviewLoading) ? (
          <CancellationRefundCard
            preview={cancelPreview}
            loading={cancelPreviewLoading}
            confirming={Boolean(cancellingId)}
            onConfirm={confirmCancel}
            onDismiss={() => setCancelPreview(null)}
          />
        ) : null}
        <div className="grid grid-cols-2 rounded-xl bg-gray-200 p-1">
          {["active", "history"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={`rounded-lg py-2 text-sm font-bold capitalize ${
                scope === value ? "bg-white text-[#FF6A00] shadow-sm" : "text-gray-500"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-gray-200" />
            ))}
          </div>
        ) : !bookings.length ? (
          <EmptyState
            icon={ClipboardList}
            title={`No ${scope} bookings`}
            subtitle={
              scope === "active"
                ? "Pending approvals, payments, and current rentals will appear here."
                : "Completed, rejected, cancelled, and expired rentals will appear here."
            }
          />
        ) : (
          <div className="space-y-5">
            {scope === "active" && approvalBookings.length ? (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-gray-900">
                    Pending Approval
                  </h2>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    {approvalBookings.length}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Your request is with the admin. You will be able to pay once it is confirmed.
                </p>
                {approvalBookings.map((booking) => (
                  <BookingCard
                    key={bookingIdOf(booking)}
                    booking={booking}
                    onCancel={cancelBooking}
                    cancellingId={cancellingId}
                  />
                ))}
              </section>
            ) : null}

            {scope === "active" && pendingPayBookings.length ? (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-gray-900">
                    Confirmed — payment
                  </h2>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                    {pendingPayBookings.length}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Finish payment to reserve the bike, or cancel to free the hold.
                </p>
                {pendingPayBookings.map((booking) => (
                  <BookingCard
                    key={bookingIdOf(booking)}
                    booking={booking}
                    onCancel={cancelBooking}
                    cancellingId={cancellingId}
                  />
                ))}
              </section>
            ) : null}

            {otherActive.length ? (
              <section className="space-y-3">
                {scope === "active"
                && (approvalBookings.length || pendingPayBookings.length) ? (
                  <h2 className="text-sm font-extrabold text-gray-900">
                    Confirmed & ongoing
                  </h2>
                  ) : null}
                {otherActive.map((booking) => (
                  <BookingCard
                    key={bookingIdOf(booking)}
                    booking={booking}
                    onCancel={cancelBooking}
                    cancellingId={cancellingId}
                  />
                ))}
              </section>
            ) : null}
          </div>
        )}
      </main>
    </BikeRentPageShell>
  );
}
