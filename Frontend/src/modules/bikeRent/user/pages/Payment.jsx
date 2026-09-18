import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Wallet, CreditCard } from "lucide-react";
import { initRazorpayPayment } from "@food/utils/razorpay";
import { userAPI } from "@/services/api";
import {
  BikeRentPageHeader,
  BikeRentPageShell,
  EmptyState,
  PrimaryButton,
} from "../components/ui";
import PickupLocationCard, {
  getPickupHub,
  getPickupZoneName,
} from "../components/PickupLocationCard";
import bikeRentUserApi from "../services/userApi";
import { getBikeRentBookingPath, getBikeRentPayPath } from "../utils/routes";
import {
  depositStatusLabel,
  formatRemainingTime,
  isAwaitingApprovalStatus,
  isPaymentPendingStatus,
} from "../utils/bookingDisplay";

/** Remove leftover Razorpay overlays that leave a black/white blocked screen. */
function cleanupRazorpayOverlay() {
  try {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.querySelectorAll(".razorpay-container, .razorpay-backdrop").forEach((node) => {
      node.remove();
    });
  } catch {
    /* ignore */
  }
}

function formatPhone(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

export default function Payment() {
  const navigate = useNavigate();
  const { bookingId: routeBookingIdParam } = useParams();
  const routeBookingId = (() => {
    const id = routeBookingIdParam == null ? "" : String(routeBookingIdParam).trim();
    if (!id || id === "undefined" || id === "null") return "";
    return id;
  })();
  const [checkout, setCheckout] = useState(null);
  const [booking, setBooking] = useState(null);
  const [method, setMethod] = useState("razorpay");
  const [walletBalance, setWalletBalance] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [payError, setPayError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (routeBookingId) {
          const existing = await bikeRentUserApi.getMyBookingById(routeBookingId);
          if (cancelled) return;
          if (existing.status === "reserved") {
            navigate(getBikeRentBookingPath(existing.id || existing._id), { replace: true });
            return;
          }
          if (isAwaitingApprovalStatus(existing.status)) {
            toast.message("This booking is awaiting admin approval");
            navigate(getBikeRentBookingPath(existing.id || existing._id), { replace: true });
            return;
          }
          if (existing.status === "rejected" || existing.status === "cancelled") {
            navigate(getBikeRentBookingPath(existing.id || existing._id), { replace: true });
            return;
          }
          setBooking(existing);
          setCheckout({
            bikeId: existing.bikeId?.id || existing.bikeId?._id || existing.bikeId,
            bike: existing.bikeSnapshot || existing.bikeId,
            startAt: existing.startAt,
            endAt: existing.endAt,
            quote: existing.money || existing.quoteSnapshot,
            customer: existing.riderSnapshot || existing.customer || {},
          });
        } else {
          const raw = sessionStorage.getItem("bikeRentCheckout");
          const parsed = raw ? JSON.parse(raw) : null;
          if (cancelled) return;
          setCheckout(parsed);
          if (parsed?.paymentMethod === "wallet" || parsed?.paymentMethod === "razorpay") {
            setMethod(parsed.paymentMethod);
          }
        }
        try {
          const walletRes = await userAPI.getWallet({ force: true });
          const data = walletRes?.data?.data || walletRes?.data || {};
          const balance =
            data?.wallet?.balance ??
            data?.balance ??
            data?.walletBalance ??
            0;
          if (!cancelled) setWalletBalance(Number(balance) || 0);
        } catch {
          if (!cancelled) setWalletBalance(0);
        }
      } catch {
        if (!cancelled) setCheckout(null);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
      cleanupRazorpayOverlay();
    };
  }, [routeBookingId, navigate]);

  // Wallet balance loads after the initial method selection and the real total can shift once
  // the booking is created server-side — fall back to online payment if wallet stops covering it.
  useEffect(() => {
    if (method !== "wallet") return;
    const total = Number(booking?.money?.totalPayable ?? checkout?.quote?.totalPayable ?? 0);
    if (walletBalance != null && walletBalance < total) {
      setMethod("razorpay");
    }
  }, [method, walletBalance, booking?.money?.totalPayable, checkout?.quote?.totalPayable]);

  const ensureBooking = async () => {
    if (booking?.id || booking?._id) {
      if (isAwaitingApprovalStatus(booking.status)) {
        const id = booking.id || booking._id;
        navigate(getBikeRentBookingPath(id), { replace: true });
        throw new Error("Booking is awaiting admin approval");
      }
      return booking;
    }
    if (!checkout) throw new Error("Checkout expired");
    const created = await bikeRentUserApi.createBooking({
      bikeId: checkout.bikeId,
      startAt: checkout.startAt,
      endAt: checkout.endAt,
      couponCode: checkout.couponCode || undefined,
      drivingLicenseNumber:
        checkout.customer?.drivingLicenseNumber
        || checkout.customer?.licenseNumber
        || undefined,
      customer: checkout.customer || undefined,
    });
    setBooking(created);
    sessionStorage.removeItem("bikeRentCheckout");
    const id = created.id || created._id;
    if (isAwaitingApprovalStatus(created.status)) {
      toast.success(
        "Your booking request has been submitted. It will be confirmed after admin approval.",
      );
      navigate(getBikeRentBookingPath(id), { replace: true });
      throw new Error("Awaiting approval");
    }
    // Keep a recoverable URL if Razorpay fails / page refreshes.
    navigate(getBikeRentPayPath(id), { replace: true });
    return created;
  };

  const finishUi = () => {
    cleanupRazorpayOverlay();
    setSubmitting(false);
  };

  const goConfirmed = (paidBooking) => {
    cleanupRazorpayOverlay();
    const id = paidBooking.id || paidBooking._id;
    toast.success("Payment successful — bike reserved");
    navigate(getBikeRentBookingPath(id), { replace: true });
  };

  const payWallet = async () => {
    setSubmitting(true);
    setPayError("");
    try {
      const current = await ensureBooking();
      const id = current.id || current._id;
      const paid = await bikeRentUserApi.payWithWallet(id);
      goConfirmed(paid);
    } catch (error) {
      const message = error?.response?.data?.message || "Wallet payment failed";
      setPayError(message);
      toast.error(message);
      finishUi();
    }
  };

  const payRazorpay = async () => {
    setSubmitting(true);
    setPayError("");
    let bookingId = null;
    try {
      const current = await ensureBooking();
      bookingId = current.id || current._id;
      const orderPayload = await bikeRentUserApi.createRazorpayOrder(bookingId);
      if (orderPayload?.free || !orderPayload?.razorpay) {
        goConfirmed(orderPayload.booking || current);
        return;
      }
      const razorpay = orderPayload.razorpay;
      if (!razorpay?.orderId || !razorpay?.key) {
        throw new Error("Razorpay is not configured");
      }

      const customer = checkout?.customer || {};
      const contact = formatPhone(customer.phone || customer.contact);

      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount,
        currency: razorpay.currency || "INR",
        order_id: razorpay.orderId,
        name: razorpay.name || "Bike Rent",
        description: razorpay.description || "Bike rental payment",
        notes: razorpay.notes,
        prefill: {
          name: customer.name || "",
          email: customer.email || "",
          contact,
        },
        handler: async (response) => {
          try {
            const paid = await bikeRentUserApi.verifyRazorpayPayment(bookingId, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            goConfirmed(paid);
          } catch (error) {
            const message =
              error?.response?.data?.message || "Payment verification failed";
            setPayError(message);
            toast.error(message);
            finishUi();
          }
        },
        onError: async (error) => {
          // Recoverable — user can pick another method inside Razorpay.
          if (error?.code === "METHOD_SELECTION_FAILED") {
            toast.error(error?.description || "Please select another payment method.");
            return;
          }
          try {
            await bikeRentUserApi.recordPaymentFailure(
              bookingId,
              error?.description || error?.message || "Payment failed",
            );
          } catch {
            /* ignore */
          }
          const message = error?.description || error?.message || "Payment failed";
          setPayError(message);
          toast.error(message);
          finishUi();
        },
        onClose: () => {
          finishUi();
        },
      });
    } catch (error) {
      const message =
        error?.response?.data?.message || error?.message || "Could not start payment";
      setPayError(message);
      toast.error(message);
      finishUi();
    }
  };

  const confirm = () => {
    if (method === "wallet") return payWallet();
    return payRazorpay();
  };

  if (bootstrapping) {
    return (
      <BikeRentPageShell className="!overflow-visible">
        <BikeRentPageHeader title="Payment" />
        <main className="px-4 py-4">
          <div className="h-64 animate-pulse rounded-2xl bg-gray-200" />
        </main>
      </BikeRentPageShell>
    );
  }

  if (!checkout) {
    return (
      <BikeRentPageShell className="!overflow-visible">
        <BikeRentPageHeader title="Payment" backTo="/bike-rent/browse" />
        <main className="px-4 py-4">
          <EmptyState
            title="Your checkout has expired"
            subtitle="Choose a bike and get a fresh quote to continue."
            action={
              <PrimaryButton onClick={() => navigate("/bike-rent/browse")}>
                Browse bikes
              </PrimaryButton>
            }
          />
        </main>
      </BikeRentPageShell>
    );
  }

  const money = checkout.quote || booking?.money || {};
  const total = Number(booking?.money?.totalPayable ?? money.totalPayable ?? 0);
  const depositInfo = booking?.securityDepositPayment || {};
  const depositAmount = Number(
    depositInfo.depositAmount ?? money.securityDeposit ?? 0,
  );
  const depositPendingPickup = depositInfo.depositStatus === "pending_collection";
  const walletInsufficient = walletBalance != null && walletBalance < total;
  const walletShort = method === "wallet" && walletInsufficient;
  const bookingId = booking?.id || booking?._id || routeBookingId;
  const holdRemaining =
    isPaymentPendingStatus(booking?.status) && booking?.expiresAt
      ? formatRemainingTime(booking.expiresAt)
      : "";

  return (
    <BikeRentPageShell className="!overflow-visible">
      <BikeRentPageHeader title="Payment" />
      <main className="space-y-4 px-4 py-4 pb-24 sm:pb-8">
        {holdRemaining ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-extrabold">Payment window</p>
            <p className="mt-1 text-xs">
              Complete payment to keep this bike · {holdRemaining}. You can also open this booking anytime from My Bookings.
            </p>
          </div>
        ) : null}

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h1 className="text-lg font-black">{checkout.bike?.name || "Bike rental"}</h1>
          {booking?.bookingNumber ? (
            <p className="mt-1 text-xs text-gray-500">Booking {booking.bookingNumber}</p>
          ) : null}
          <p className="mt-2 break-words text-sm text-gray-500">
            {new Date(checkout.startAt).toLocaleString()} —{" "}
            {new Date(checkout.endAt).toLocaleString()}
          </p>
          <p className="mt-4 flex justify-between border-t pt-3">
            <span>Rental</span>
            <b>₹{money.rentalFee ?? 0}</b>
          </p>
          <p className="mt-2 flex justify-between">
            <span>Tax</span>
            <b>₹{money.taxAmount ?? 0}</b>
          </p>
          <p className="mt-2 flex justify-between">
            <span>Security deposit</span>
            <b>₹{depositAmount}</b>
          </p>
          {depositAmount > 0 ? (
            <p className="mt-1 text-right text-[11px] font-semibold text-gray-500">
              {depositStatusLabel(depositInfo.depositStatus)}
              {depositInfo.depositPaymentMethod
                ? ` · ${String(depositInfo.depositPaymentMethod).replace(/_/g, " ")}`
                : ""}
            </p>
          ) : null}
          <p className="mt-2 flex justify-between border-t pt-3 text-base">
            <span>Pay now</span>
            <b>₹{total}</b>
          </p>
          {depositPendingPickup ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Security deposit ₹{depositAmount} will be collected at pickup. This payment covers the rental only.
            </p>
          ) : (
            <p className="mt-2 text-xs text-gray-500">
              Final amount is always recalculated on the server. Deposit is held until return inspection.
            </p>
          )}
        </section>

        <PickupLocationCard
          zoneName={
            checkout.zoneName
            || checkout.pickupLabel
            || getPickupZoneName(checkout.bike)
            || getPickupZoneName(booking)
          }
          pickupHub={
            checkout.pickupHub
            || getPickupHub(checkout.bike)
            || getPickupHub(booking?.zoneSnapshot)
            || getPickupHub(booking)
          }
        />

        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setMethod("razorpay")}
            className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${
              method === "razorpay" ? "border-[#FF6A00] bg-orange-50" : "border-gray-200 bg-white"
            }`}
          >
            <CreditCard className="h-5 w-5 text-[#FF6A00]" />
            <div>
              <b>Pay online</b>
              <p className="text-xs text-gray-500">Razorpay (UPI / card / netbanking)</p>
            </div>
          </button>
          <button
            type="button"
            disabled={walletInsufficient}
            onClick={() => setMethod("wallet")}
            className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${
              walletInsufficient
                ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60"
                : method === "wallet"
                  ? "border-[#FF6A00] bg-orange-50"
                  : "border-gray-200 bg-white"
            }`}
          >
            <Wallet className="h-5 w-5 text-[#FF6A00]" />
            <div>
              <b>Wallet</b>
              <p className={`text-xs ${walletInsufficient ? "font-semibold text-red-600" : "text-gray-500"}`}>
                {walletBalance == null
                  ? "Loading balance…"
                  : walletInsufficient
                    ? `Low balance — ₹${walletBalance} available`
                    : `Balance: ₹${walletBalance}`}
              </p>
            </div>
          </button>
        </section>

        {payError ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-bold">Payment not completed</p>
            <p className="mt-1 text-xs leading-relaxed">{payError}</p>
            {bookingId ? (
              <button
                type="button"
                className="mt-2 text-xs font-bold underline"
                onClick={() => {
                  setPayError("");
                  cleanupRazorpayOverlay();
                }}
              >
                Dismiss and try again
              </button>
            ) : null}
          </div>
        ) : null}

        <PrimaryButton disabled={submitting || walletShort} onClick={confirm}>
          {submitting
            ? "Processing…"
            : total <= 0
              ? "Confirm booking"
              : `Pay ₹${total}`}
        </PrimaryButton>
      </main>
    </BikeRentPageShell>
  );
}
