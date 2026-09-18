import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  KeyRound,
  Loader2,
  MapPin,
  Star,
  User,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { userAPI } from "@/services/api";
import { initRazorpayPayment } from "@food/utils/razorpay";
import { ServiceProviderPageShell, ServiceProviderPageHeader } from "../components/ui";
import useBookingSocket from "../hooks/useBookingSocket";
import serviceProviderApi from "../../provider/services/providerApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const POLL_MS = 4000;
const TERMINAL_STATUSES = ["completed", "cancelled"];

const STATUS_LABELS = {
  requested: "Finding a provider…",
  assigned: "Provider assigned",
  provider_on_the_way: "Provider is on the way",
  provider_arrived: "Provider has arrived",
  service_started: "Service in progress",
  service_completed: "Service completed — awaiting your confirmation",
  customer_confirmed: "Confirmed — payment pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-600 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ServiceProviderRequestStatusPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [walletBalance, setWalletBalance] = useState(null);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("razorpay");
  const [payError, setPayError] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPreview, setCancelPreview] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  const [ratingStars, setRatingStars] = useState(0);
  const [ratingComment, setRatingComment] = useState("");

  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await serviceProviderApi.getBookingDetail(id);
      setBooking(data);
    } catch (error) {
      if (!silent) toast.error(error?.response?.data?.message || "Could not load this booking");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!booking || TERMINAL_STATUSES.includes(booking.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return undefined;
    }
    pollRef.current = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [booking, load]);

  // Instant push the moment the provider accepts/rejects, arrives, starts, completes,
  // or adds an extra charge — the poll interval above remains the DB-backed fallback
  // if the socket is ever unavailable.
  useBookingSocket(id, () => load(true));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await userAPI.getWallet({ force: true });
        const data = res?.data?.data || res?.data || {};
        const balance = data?.wallet?.balance ?? data?.balance ?? data?.walletBalance ?? 0;
        if (!cancelled) setWalletBalance(Number(balance) || 0);
      } catch {
        if (!cancelled) setWalletBalance(0);
      }
      try {
        const res = await userAPI.getProfile();
        const user = res?.data?.data?.user || {};
        if (!cancelled) setCustomerProfile(user);
      } catch {
        // best-effort prefill only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openCancelDialog = async () => {
    setCancelOpen(true);
    try {
      const preview = await serviceProviderApi.previewCancellation(id);
      setCancelPreview(preview);
    } catch {
      setCancelPreview(null);
    }
  };

  const confirmCancel = async () => {
    setBusy(true);
    try {
      const updated = await serviceProviderApi.cancelMyBooking(id, cancelReason);
      setBooking(updated);
      setCancelOpen(false);
      toast.success("Booking cancelled");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not cancel booking");
    } finally {
      setBusy(false);
    }
  };

  const respondExtraCharge = async (chargeId, approve) => {
    setBusy(true);
    try {
      const updated = await serviceProviderApi.respondToExtraCharge(id, chargeId, approve);
      setBooking(updated);
      toast.success(approve ? "Extra charge approved" : "Extra charge declined");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not respond to extra charge");
    } finally {
      setBusy(false);
    }
  };

  const confirmCompletion = async () => {
    setBusy(true);
    try {
      const updated = await serviceProviderApi.confirmCompletion(id);
      setBooking(updated);
      toast.success("Thanks for confirming");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not confirm completion");
    } finally {
      setBusy(false);
    }
  };

  const pay = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setPayError("");
    let result;
    try {
      result = await serviceProviderApi.payForBooking(id, paymentMethod);
    } catch (error) {
      const message = error?.response?.data?.message || "Could not process payment";
      setPayError(message);
      toast.error(message);
      setBusy(false);
      return;
    }

    if (!result.razorpay) {
      setBooking(result.booking);
      toast.success("Payment completed");
      setBusy(false);
      return;
    }

    const contact = String(customerProfile?.phone || "").replace(/\D/g, "").slice(-10);
    try {
      await initRazorpayPayment({
        key: result.razorpay.key,
        amount: result.razorpay.amount,
        currency: result.razorpay.currency || "INR",
        order_id: result.razorpay.orderId,
        name: "Home Services",
        description: booking?.serviceName || "Service payment",
        prefill: { name: customerProfile?.name || "", email: customerProfile?.email || "", contact },
        handler: async (response) => {
          try {
            const verified = await serviceProviderApi.verifyBookingPayment(id, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            setBooking(verified);
            toast.success("Payment successful");
          } catch (error) {
            const message = error?.response?.data?.message || "Payment verification failed. Contact support if money was deducted.";
            setPayError(message);
            toast.error(message);
          } finally {
            setBusy(false);
          }
        },
        onError: async (error) => {
          if (error?.code === "METHOD_SELECTION_FAILED") {
            toast.error(error?.description || "Please select another payment method.");
            return;
          }
          await serviceProviderApi.markBookingPaymentFailed(id).catch(() => {});
          const message = error?.description || error?.message || "Payment failed";
          setPayError(message);
          toast.error(message);
          setBusy(false);
        },
        onClose: async () => {
          await serviceProviderApi.markBookingPaymentFailed(id).catch(() => {});
          setBusy(false);
        },
      });
    } catch (error) {
      await serviceProviderApi.markBookingPaymentFailed(id).catch(() => {});
      const message = error?.message || "Could not start payment";
      setPayError(message);
      toast.error(message);
      setBusy(false);
    }
  }, [busy, id, paymentMethod, customerProfile, booking]);

  const submitRating = async () => {
    if (!ratingStars) {
      toast.error("Select a star rating");
      return;
    }
    setBusy(true);
    try {
      const updated = await serviceProviderApi.submitRating(id, { stars: ratingStars, comment: ratingComment });
      setBooking(updated);
      toast.success("Thanks for your feedback");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not submit rating");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F8]">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF6A00]" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F8] px-4">
        <div className="max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-700">This booking could not be found.</p>
          <button
            type="button"
            onClick={() => navigate("/services/bookings")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white"
          >
            <ArrowLeft className="h-4 w-4" /> My bookings
          </button>
        </div>
      </div>
    );
  }

  const pendingExtraCharges = (booking.extraCharges || []).filter((c) => c.status === "pending");
  const walletInsufficient = walletBalance != null && walletBalance < Number(booking.finalPayableAmount || 0);
  const canCancel = !["service_started", "service_completed", "customer_confirmed", "completed", "cancelled"].includes(booking.status);
  const canRate = booking.status === "completed" && !booking.rating?.stars;

  return (
    <ServiceProviderPageShell>
      <ServiceProviderPageHeader title="Booking status" backTo="/services/bookings" />

      <div className="px-4 py-4 sm:px-6">
        <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-gray-900">{booking.serviceName}</p>
              {booking.categoryName ? <p className="text-xs text-gray-400">{booking.categoryName}</p> : null}
            </div>
            {booking.status === "requested" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#FF6A00]" /> : null}
          </div>
          <p
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
              booking.status === "cancelled"
                ? "bg-red-50 text-red-600"
                : TERMINAL_STATUSES.includes(booking.status)
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-orange-50 text-[#FF6A00]"
            }`}
          >
            {STATUS_LABELS[booking.status] || booking.status}
          </p>

          <div className="mt-3 space-y-1.5 text-sm text-gray-600">
            <p className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-gray-400" /> {booking.date}
              <Clock className="ml-1.5 h-3.5 w-3.5 text-gray-400" /> {booking.startTime}
            </p>
            {booking.providerName ? (
              <p className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-gray-400" /> {booking.providerName}
              </p>
            ) : null}
            {booking.serviceLocation?.address ? (
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" /> {booking.serviceLocation.address}
              </p>
            ) : null}
          </div>
        </div>

        {booking.status === "cancelled" ? (
          <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-red-700">
              <XCircle className="h-4 w-4" /> Booking cancelled
            </p>
            {booking.cancelReason ? <p className="mt-1 text-xs text-red-600">{booking.cancelReason}</p> : null}
            {booking.cancellationCharge > 0 ? (
              <p className="mt-1 text-xs text-red-600">Cancellation charge: {money(booking.cancellationCharge)}</p>
            ) : null}
          </div>
        ) : null}

        {["assigned", "provider_on_the_way", "provider_arrived"].includes(booking.status) && booking.serviceOtp ? (
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-sm">
            <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
              <KeyRound className="h-3.5 w-3.5" /> Share this OTP with your provider to start the service
            </p>
            <p className="mt-2 text-3xl font-black tracking-[0.3em] text-[#FF6A00]">{booking.serviceOtp}</p>
          </div>
        ) : null}

        {["service_started", "service_completed"].includes(booking.status) && pendingExtraCharges.length > 0 ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-bold text-amber-900">Extra work requested</p>
            {pendingExtraCharges.map((charge) => (
              <div key={charge._id} className="mb-2 rounded-xl bg-white p-3 last:mb-0">
                <p className="text-sm text-gray-800">{charge.description}</p>
                <p className="mt-0.5 text-sm font-extrabold text-[#FF6A00]">{money(charge.amount)}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => respondExtraCharge(charge._id, false)}
                    className="flex-1 rounded-lg border border-gray-200 py-2 text-xs font-bold text-gray-600 disabled:opacity-60"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => respondExtraCharge(charge._id, true)}
                    className="flex-1 rounded-lg bg-[#FF6A00] py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {booking.status === "service_completed" ? (
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            {booking.afterPhotos?.length ? (
              <div className="mb-3 grid grid-cols-3 gap-2">
                {booking.afterPhotos.map((photo, i) => (
                  <img key={i} src={photo.url} alt="After service" className="h-20 w-full rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
            {booking.completionNotes ? <p className="mb-3 text-sm text-gray-600">{booking.completionNotes}</p> : null}
            {pendingExtraCharges.length > 0 ? (
              <p className="text-xs text-amber-600">Respond to the extra charge above before confirming.</p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={confirmCompletion}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm service is complete
              </button>
            )}
          </div>
        ) : null}

        {booking.status === "customer_confirmed" ? (
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Amount payable</p>
            <p className="mb-3 text-2xl font-black text-gray-900">{money(booking.finalPayableAmount)}</p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("razorpay")}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                  paymentMethod === "razorpay" ? "border-[#FF6A00] bg-orange-50/50" : "border-gray-200"
                }`}
              >
                <CreditCard className="h-5 w-5 text-[#FF6A00]" />
                <div>
                  <p className="text-sm font-bold text-gray-800">Pay online</p>
                  <p className="text-xs text-gray-500">UPI / card / netbanking</p>
                </div>
              </button>
              <button
                type="button"
                disabled={walletInsufficient}
                onClick={() => setPaymentMethod("wallet")}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                  walletInsufficient
                    ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60"
                    : paymentMethod === "wallet"
                      ? "border-[#FF6A00] bg-orange-50/50"
                      : "border-gray-200"
                }`}
              >
                <Wallet className="h-5 w-5 text-[#FF6A00]" />
                <div>
                  <p className="text-sm font-bold text-gray-800">Wallet</p>
                  <p className={`text-xs ${walletInsufficient ? "font-semibold text-red-600" : "text-gray-500"}`}>
                    {walletBalance == null
                      ? "Loading balance…"
                      : walletInsufficient
                        ? `Low balance — ${money(walletBalance)} available`
                        : `Balance: ${money(walletBalance)}`}
                  </p>
                </div>
              </button>
            </div>

            {payError ? <p className="mt-2 text-xs font-semibold text-red-600">{payError}</p> : null}

            <button
              type="button"
              disabled={busy || (paymentMethod === "wallet" && walletInsufficient)}
              onClick={pay}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Pay {money(booking.finalPayableAmount)}
            </button>
          </div>
        ) : null}

        {TERMINAL_STATUSES.includes(booking.status) && booking.status !== "cancelled" ? (
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-2 font-bold text-gray-900">Booking completed</p>
            <p className="text-sm text-gray-500">Total paid: {money(booking.finalPayableAmount)}</p>
          </div>
        ) : null}

        {canRate ? (
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Rate this service</p>
            <div className="mb-3 flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRatingStars(n)}>
                  <Star className={`h-7 w-7 ${n <= ratingStars ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Share your experience (optional)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15"
            />
            <button
              type="button"
              disabled={busy}
              onClick={submitRating}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              Submit rating
            </button>
          </div>
        ) : booking.rating?.stars ? (
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Your rating</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`h-5 w-5 ${n <= booking.rating.stars ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
              ))}
            </div>
            {booking.rating.comment ? <p className="mt-1 text-sm text-gray-600">{booking.rating.comment}</p> : null}
          </div>
        ) : null}

        {canCancel ? (
          <button
            type="button"
            onClick={openCancelDialog}
            className="w-full rounded-xl border border-red-200 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
          >
            Cancel booking
          </button>
        ) : null}
      </div>

      <Modal open={cancelOpen} title="Cancel this booking?" onClose={() => setCancelOpen(false)}>
        <div className="space-y-3">
          {cancelPreview ? (
            cancelPreview.free ? (
              <p className="flex items-start gap-2 text-sm text-gray-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                This cancellation is free.
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-gray-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                A cancellation charge of <strong className="font-bold text-gray-900">{money(cancelPreview.charge)}</strong> applies.
              </p>
            )
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          )}
          <textarea
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              disabled={busy}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-60"
            >
              Keep booking
            </button>
            <button
              type="button"
              onClick={confirmCancel}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Cancel booking
            </button>
          </div>
        </div>
      </Modal>
    </ServiceProviderPageShell>
  );
}
