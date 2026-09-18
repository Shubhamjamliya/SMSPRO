import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { toast } from "sonner";
import { initRazorpayPayment } from "@food/utils/razorpay";
import bikeRentUserApi from "../services/userApi";
import PickupLocationCard, {
  getPickupHub,
  getPickupZoneName,
} from "../components/PickupLocationCard";
import LateReturnBillingCard from "../components/LateReturnBillingCard";
import BookingPaymentSummaryCard from "../components/BookingPaymentSummaryCard";
import BookingRefundDetailsCard from "../components/BookingRefundDetailsCard";
import NoShowPolicyCard from "../components/NoShowPolicyCard";
import { CancellationDetailsCard } from "../components/CancellationRefundCard";
import PickupCountdown from "../../shared/components/PickupCountdown";
import { BikeRentPageShell, BikeRentPageHeader, EmptyState, PrimaryButton } from "../components/ui";
import {
  getBikeRentBookingsPath,
  getBikeRentActivePath,
  getBikeRentPayPath,
} from "../utils/routes";
import {
  bookingStatusLabel,
  depositStatusLabel,
  formatRemainingTime,
  isAwaitingApprovalStatus,
  isPaymentPendingStatus,
} from "../utils/bookingDisplay";
import { formatInr } from "../utils/format";

function NoShowBookingCard({ booking }) {
  const noShow = booking?.noShow;
  const isNoShow = booking?.status === "no_show";
  const graceMinutes = noShow?.graceMinutes
    || (booking?.pickupWindowEndsAt && booking?.startAt
      ? Math.round((new Date(booking.pickupWindowEndsAt) - new Date(booking.startAt)) / 60000)
      : null);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm">
      <h2 className="text-sm font-black text-gray-900">Pickup & no-show</h2>
      <div className="mt-3 space-y-2 text-sm">
        <p className="flex justify-between gap-3">
          <span className="text-gray-500">Pickup time</span>
          <b>{booking?.startAt ? new Date(booking.startAt).toLocaleString() : "—"}</b>
        </p>
        <p className="flex justify-between gap-3">
          <span className="text-gray-500">Grace period</span>
          <b>{graceMinutes != null ? `${graceMinutes} minutes` : "—"}</b>
        </p>
        <p className="flex justify-between gap-3">
          <span className="text-gray-500">No show status</span>
          <b className={isNoShow ? "text-rose-600" : "text-gray-800"}>
            {isNoShow ? "Completed" : "Not applicable"}
          </b>
        </p>
        {isNoShow ? (
          <>
            <p className="flex justify-between gap-3">
              <span className="text-gray-500">Deduction</span>
              <b>{formatInr(noShow?.deductionAmount || noShow?.depositCaptured || 0)}</b>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-gray-500">Wallet refund</span>
              <b className="text-emerald-600">
                {formatInr(noShow?.walletCreditAmount || noShow?.depositRefund || 0)}
              </b>
            </p>
          </>
        ) : null}
        {isNoShow && noShow?.walletReference ? (
          <p className="text-[11px] text-gray-400">Ref · {noShow.walletReference}</p>
        ) : null}
      </div>
    </section>
  );
}

export default function BookingConfirmation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payingLate, setPayingLate] = useState(false);
  const [, setTick] = useState(0);

  const refresh = () =>
    bikeRentUserApi
      .getMyBookingById(id)
      .then(setBooking)
      .catch(() => setBooking(null));

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const status = booking?.status;
    if (!isAwaitingApprovalStatus(status) && !isPaymentPendingStatus(status)) {
      return undefined;
    }
    const timer = setInterval(() => {
      setTick((value) => value + 1);
      refresh();
    }, 8000);
    return () => clearInterval(timer);
  }, [booking?.status, id]);

  const payLateOnline = async () => {
    setPayingLate(true);
    try {
      const orderPayload = await bikeRentUserApi.createLateBalanceRazorpayOrder(id);
      const rz = orderPayload.razorpay || {};
      if (!rz.orderId || !rz.key) throw new Error("Razorpay is not configured");
      await initRazorpayPayment({
        key: rz.key,
        amount: rz.amount,
        currency: rz.currency || "INR",
        name: rz.name || "Bike Rent",
        description: rz.description || "Late charges",
        order_id: rz.orderId,
        handler: async (response) => {
          const paid = await bikeRentUserApi.verifyLateBalanceRazorpayPayment(id, {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setBooking(paid);
          toast.success("Late balance paid");
        },
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Payment failed");
    } finally {
      setPayingLate(false);
    }
  };

  const payLateWallet = async () => {
    setPayingLate(true);
    try {
      const paid = await bikeRentUserApi.payLateBalanceWithWallet(id);
      setBooking(paid);
      toast.success("Late balance paid from wallet");
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Wallet payment failed");
    } finally {
      setPayingLate(false);
    }
  };

  if (loading) {
    return (
      <BikeRentPageShell>
        <BikeRentPageHeader title="Booking" backTo={getBikeRentBookingsPath()} />
        <main className="px-4 py-4">
          <div className="h-64 animate-pulse rounded-2xl bg-gray-200" />
        </main>
      </BikeRentPageShell>
    );
  }

  if (!booking) {
    return (
      <BikeRentPageShell>
        <BikeRentPageHeader title="Booking" backTo={getBikeRentBookingsPath()} />
        <main className="px-4 py-4">
          <EmptyState title="Booking not found" subtitle="It may no longer be available." />
        </main>
      </BikeRentPageShell>
    );
  }

  const bike = booking.bikeSnapshot || booking.bikeId || {};
  const awaitingApproval = isAwaitingApprovalStatus(booking.status);
  const needsPayment = isPaymentPendingStatus(booking.status);
  const isRejected = booking.status === "rejected";
  const isCancelled = booking.status === "cancelled";
  const isReservedOrActive = [
    "reserved",
    "pickup_completed",
    "rental_started",
    "active",
    "return_requested",
    "inspection",
  ].includes(booking.status);
  const needsLatePay =
    booking.status === "completed"
    && Number(booking.lateReturn?.remainingAmount || 0) > 0
    && booking.lateReturn?.paymentStatus === "pending";

  const title = awaitingApproval
    ? "Request submitted"
    : needsPayment
      ? "Booking confirmed — complete payment"
      : isRejected
        ? "Booking rejected"
        : isCancelled
          ? "Booking cancelled"
          : needsLatePay
            ? "Extra charges due"
            : booking.status === "reserved"
              ? "Bike reserved"
              : "Booking update";

  const subtitle = awaitingApproval
    ? "Your booking request has been submitted. It will be confirmed after admin approval."
    : needsPayment
      ? "Your bike booking has been confirmed. Please complete payment to reserve the bike."
      : isRejected
        ? (booking.rejectionReason
          ? `Your bike booking request has been rejected. Reason: ${booking.rejectionReason}`
          : "Your bike booking request has been rejected.")
        : isCancelled
          ? (booking.cancellationReason
            ? `This booking was cancelled. Reason: ${booking.cancellationReason}`
            : "This booking was cancelled.")
          : needsLatePay
            ? "Your return had extra hour charges beyond the security deposit. Pay the remaining balance to finish settlement."
            : "Show your pickup code to hub staff. They will verify it and start your ride.";

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title={booking.bookingNumber || "Booking"}
        subtitle={bookingStatusLabel(booking.status)}
        backTo={getBikeRentBookingsPath()}
      />
      <main className="space-y-5 px-4 py-8 text-center sm:py-12">
        {isRejected || isCancelled ? (
          <XCircle className="mx-auto h-16 w-16 text-rose-500" />
        ) : (
          <CheckCircle2 className="mx-auto h-16 w-16 text-[#FF6A00]" />
        )}
        <h1 className="text-xl font-black sm:text-2xl">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{subtitle}</p>
        {(awaitingApproval || needsPayment) && booking.expiresAt ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
            <Clock3 className="h-3.5 w-3.5" />
            Hold · {formatRemainingTime(booking.expiresAt)}
          </p>
        ) : null}
        <CancellationDetailsCard booking={booking} className="mt-4" />
        <section className="mt-6 rounded-2xl bg-white p-5 text-left shadow-sm">
          <p className="text-xs text-gray-500">BOOKING NUMBER</p>
          <b>{booking.bookingNumber}</b>
          <p className="mt-4 text-xs text-gray-500">STATUS</p>
          <b className="text-[#FF6A00]">{bookingStatusLabel(booking.status)}</b>
          <div className="mt-1.5">
            <PickupCountdown booking={booking} />
          </div>
          <p className="mt-4 text-xs text-gray-500">PICKUP CODE</p>
          <b className="text-lg">
            {awaitingApproval || needsPayment || isRejected || isCancelled
              ? "Issued after payment"
              : booking.pickupCode || "—"}
          </b>
          {booking.status === "reserved" && booking.startAt ? (
            <p className="mt-1 text-xs text-gray-500">
              {new Date(booking.startAt).getTime() > Date.now()
                ? `Hub staff can verify this code and hand over the bike from ${new Date(booking.startAt).toLocaleString()} onward — not before.`
                : "You can show this code to hub staff now."}
            </p>
          ) : null}
          <p className="mt-4 text-sm">{bike.name || "Bike rental"}</p>
          <p className="mt-1 break-words text-sm text-gray-500">
            {new Date(booking.startAt).toLocaleString()} —{" "}
            {new Date(booking.endAt).toLocaleString()}
          </p>
          {booking.startAt && booking.endAt ? (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Rental window
              </p>
              <div className="relative h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[#FF6A00]/70"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        ((Date.now() - new Date(booking.startAt).getTime())
                          / Math.max(
                            1,
                            new Date(booking.endAt).getTime()
                              - new Date(booking.startAt).getTime(),
                          ))
                          * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                {Date.now() < new Date(booking.startAt).getTime()
                  ? `Starts in ${Math.max(0, Math.round((new Date(booking.startAt).getTime() - Date.now()) / 60000))} min`
                  : Date.now() > new Date(booking.endAt).getTime()
                    ? "Past scheduled return"
                    : `Ends in ${Math.max(0, Math.round((new Date(booking.endAt).getTime() - Date.now()) / 60000))} min`}
              </p>
            </div>
          ) : null}
          {booking.pendingExtension?.status === "requested" ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Extension pending admin review
            </p>
          ) : null}
          {booking.bikeSnapshot?.name && booking.reassignmentHistory?.length ? (
            <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
              Bike reassigned · now {booking.bikeSnapshot.name}
            </p>
          ) : null}
          {booking.securityDepositPayment?.depositStatus === "pending_collection" ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Security deposit ({formatInr(
                booking.securityDepositPayment?.depositAmount
                  ?? booking.money?.securityDeposit
                  ?? 0,
              )}
              ) · {depositStatusLabel(booking.securityDepositPayment?.depositStatus)}. Pay at pickup before handover.
            </p>
          ) : null}
          {booking.pickupInspection ? (
            <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-left text-xs text-emerald-900">
              <p className="font-bold">Bike inspected before handover</p>
              <p className="mt-1">
                {booking.pickupInspection.imageCount || 0} photos
                {booking.pickupInspection.videoCount
                  ? ` · ${booking.pickupInspection.videoCount} videos`
                  : ""}
                {booking.pickupInspection.meterReading != null
                  ? ` · meter ${booking.pickupInspection.meterReading}`
                  : ""}
                {booking.pickupInspection.fuelLevel
                  ? ` · fuel ${booking.pickupInspection.fuelLevel}`
                  : ""}
              </p>
              {booking.pickupInspection.conditionNotes ? (
                <p className="mt-1 text-emerald-800">{booking.pickupInspection.conditionNotes}</p>
              ) : null}
            </div>
          ) : null}
          {booking.returnInspection ? (
            <div className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-left text-xs text-sky-900">
              <p className="font-bold">Return inspection recorded</p>
              <p className="mt-1 capitalize">
                {(booking.returnInspection.returnCondition || "").replace(/_/g, " ") || "Completed"}
                {booking.returnInspection.repairCharges
                  ? ` · repair ₹${booking.returnInspection.repairCharges}`
                  : ""}
              </p>
            </div>
          ) : null}
        </section>

        <NoShowBookingCard booking={booking} />

        <BookingPaymentSummaryCard booking={booking} />

        {["reserved", "pending_approval", "payment_pending"].includes(booking.status) ? (
          <NoShowPolicyCard
            enabled
            graceMinutes={
              booking.noShow?.graceMinutes
              || (booking.pickupWindowEndsAt && booking.startAt
                ? Math.round(
                  (new Date(booking.pickupWindowEndsAt) - new Date(booking.startAt)) / 60000,
                )
                : 30)
            }
            compact
          />
        ) : null}

        <LateReturnBillingCard
          booking={booking}
          paying={payingLate}
          onPayOnline={needsLatePay ? payLateOnline : undefined}
          onPayWallet={needsLatePay ? payLateWallet : undefined}
        />

        <BookingRefundDetailsCard booking={booking} />

        <div className="mt-4 text-left">
          <PickupLocationCard
            zoneName={getPickupZoneName(booking) || booking.zoneSnapshot?.name}
            pickupHub={getPickupHub(booking.zoneSnapshot) || getPickupHub(booking)}
          />
        </div>
        <div className="mt-5 space-y-3">
          {needsPayment ? (
            <PrimaryButton onClick={() => navigate(getBikeRentPayPath(id))}>
              Continue to payment
            </PrimaryButton>
          ) : null}
          {isReservedOrActive ? (
            <PrimaryButton onClick={() => navigate(getBikeRentActivePath(id))}>
              Open rental
            </PrimaryButton>
          ) : null}
          <Link className="block" to={getBikeRentBookingsPath()}>
            <PrimaryButton className="bg-white text-[#FF6A00] ring-1 ring-orange-200">
              View my bookings
            </PrimaryButton>
          </Link>
        </div>
      </main>
    </BikeRentPageShell>
  );
}
