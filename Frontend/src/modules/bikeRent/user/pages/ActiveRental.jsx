import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Clock3, ShieldCheck } from "lucide-react";
import { initRazorpayPayment } from "@food/utils/razorpay";
import bikeRentUserApi from "../services/userApi";
import PickupLocationCard, {
  getPickupHub,
  getPickupZoneName,
} from "../components/PickupLocationCard";
import CancellationRefundCard from "../components/CancellationRefundCard";
import ReturnSettlementSummaryCard from "../components/ReturnSettlementSummaryCard";
import {
  BikeRentPageHeader,
  BikeRentPageShell,
  EmptyState,
  PrimaryButton,
} from "../components/ui";
import { getBikeRentReturnPath, getBikeRentBookingsPath } from "../utils/routes";
import { bookingStatusLabel } from "../utils/bookingDisplay";
import PickupCountdown from "../../shared/components/PickupCountdown";

export default function ActiveRental() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extendAt, setExtendAt] = useState("");
  const [extendQuote, setExtendQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cancelPreview, setCancelPreview] = useState(null);
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState(false);
  const [showCancelSheet, setShowCancelSheet] = useState(false);
  const [returnPreview, setReturnPreview] = useState(null);
  const [returnPreviewLoading, setReturnPreviewLoading] = useState(false);

  const reload = async () => {
    const data = await bikeRentUserApi.getMyBookingById(id);
    setBooking(data);
    return data;
  };

  useEffect(() => {
    setLoading(true);
    reload()
      .catch(() => setBooking(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Poll while waiting for hub handover (or awaiting a no-show override) so status flips
  // automatically — no manual refresh needed.
  useEffect(() => {
    if (!["reserved", "no_show"].includes(booking?.status)) return undefined;
    const timer = setInterval(() => {
      reload().catch(() => {});
    }, 12000);
    return () => clearInterval(timer);
  }, [booking?.status, id]);

  useEffect(() => {
    if (searchParams.get("extend") !== "1") return undefined;
    if (!["active", "rental_started", "pickup_completed"].includes(booking?.status)) {
      return undefined;
    }
    const timer = setTimeout(() => {
      document.getElementById("extend-rental")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchParams, booking?.status]);

  useEffect(() => {
    const status = String(booking?.status || "").toLowerCase();
    const showReturnSettlement = [
      "active",
      "rental_started",
      "pickup_completed",
      "return_requested",
      "inspection",
      "completed",
      "refund_processing",
      "deposit_refunded",
    ].includes(status);
    if (!showReturnSettlement || !id) {
      setReturnPreview(null);
      return undefined;
    }
    let cancelled = false;
    setReturnPreviewLoading(true);
    bikeRentUserApi
      .previewReturnSettlement(id)
      .then((data) => {
        if (!cancelled) setReturnPreview(data);
      })
      .catch(() => {
        if (!cancelled) setReturnPreview(null);
      })
      .finally(() => {
        if (!cancelled) setReturnPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [booking?.status, id]);

  const quoteExtend = async () => {
    if (!extendAt) return toast.error("Choose a new end time");
    setBusy(true);
    try {
      const data = await bikeRentUserApi.requestExtension(id, {
        newEndAt: new Date(extendAt).toISOString(),
      });
      if (data.canExtendImmediately) {
        setExtendQuote(data.quote || data);
        toast.success("Extension available — complete payment");
      } else {
        setExtendQuote(null);
        await reload();
        toast.message("Extension sent for admin review", {
          description: data.conflict?.message
            || "Another booking overlaps this window. We'll notify you after review.",
        });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not request extension");
    } finally {
      setBusy(false);
    }
  };

  const payExtendWallet = async () => {
    if (!extendQuote) return;
    setBusy(true);
    try {
      const updated = await bikeRentUserApi.extendRental(id, {
        newEndAt: extendQuote.newEndAt,
        paymentMethod: "wallet",
      });
      setBooking(updated);
      setExtendQuote(null);
      toast.success("Rental extended");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Extension failed");
    } finally {
      setBusy(false);
    }
  };

  const payExtendRazorpay = async () => {
    if (!extendQuote) return;
    setBusy(true);
    try {
      const order = await bikeRentUserApi.createExtensionRazorpayOrder(id, {
        newEndAt: extendQuote.newEndAt,
      });
      if (order.free || !order.razorpay) {
        const updated = await bikeRentUserApi.extendRental(id, {
          newEndAt: extendQuote.newEndAt,
          paymentMethod: "wallet",
        });
        setBooking(updated);
        setExtendQuote(null);
        toast.success("Rental extended");
        return;
      }
      await initRazorpayPayment({
        key: order.razorpay.key,
        amount: order.razorpay.amount,
        currency: order.razorpay.currency || "INR",
        order_id: order.razorpay.orderId,
        name: "Bike Rent",
        description: "Rental extension",
        handler: async (response) => {
          try {
            const updated = await bikeRentUserApi.extendRental(id, {
              newEndAt: extendQuote.newEndAt,
              paymentMethod: "razorpay",
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            setBooking(updated);
            setExtendQuote(null);
            toast.success("Rental extended");
          } catch (error) {
            toast.error(error?.response?.data?.message || "Extension verification failed");
          } finally {
            setBusy(false);
          }
        },
        onError: (error) => {
          if (error?.code === "METHOD_SELECTION_FAILED") {
            toast.error(error?.description || "Please select another payment method.");
            return;
          }
          toast.error(error?.description || error?.message || "Extension payment failed");
          setBusy(false);
        },
        onClose: () => setBusy(false),
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not start extension payment");
      setBusy(false);
    }
  };

  const openCancel = async () => {
    setShowCancelSheet(true);
    setCancelPreviewLoading(true);
    try {
      const preview = await bikeRentUserApi.previewCancellation(id);
      setCancelPreview(preview);
    } catch (error) {
      setShowCancelSheet(false);
      toast.error(error?.response?.data?.message || "Could not load cancellation preview");
    } finally {
      setCancelPreviewLoading(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await bikeRentUserApi.cancelBooking(id, "Cancelled by user");
      toast.success("Booking cancelled — refund credited to wallet");
      navigate(getBikeRentBookingsPath());
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not cancel");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <BikeRentPageShell>
        <BikeRentPageHeader title="Rental" />
        <main className="px-4 py-4">
          <div className="h-48 animate-pulse rounded-2xl bg-gray-200" />
        </main>
      </BikeRentPageShell>
    );
  }

  if (!booking) {
    return (
      <BikeRentPageShell>
        <BikeRentPageHeader title="Rental" />
        <main className="px-4 py-4">
          <EmptyState title="Rental not found" />
        </main>
      </BikeRentPageShell>
    );
  }

  const bike = booking.bikeSnapshot || booking.bikeId || {};
  const isReserved = booking.status === "reserved";
  const isActive = ["active", "rental_started", "pickup_completed"].includes(booking.status);
  const isNoShow = booking.status === "no_show";

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader title="Active rental" />
      <main className="space-y-4 px-4 py-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h1 className="text-lg font-black">{bike.name || "Bike rental"}</h1>
          <p className="mt-2 text-sm text-gray-500">
            Pickup: {new Date(booking.startAt).toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Return: {new Date(booking.endAt).toLocaleString()}
          </p>
          <p className="mt-3 text-sm font-bold text-[#FF6A00]">
            {bookingStatusLabel(booking.status)}
          </p>
          {booking.pendingExtension?.status === "requested" ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Extension requested until{" "}
              {booking.pendingExtension.requestedEndAt
                ? new Date(booking.pendingExtension.requestedEndAt).toLocaleString()
                : "—"}
              {" "}· awaiting admin review
            </p>
          ) : null}
          {booking.pendingExtension?.status === "approved" ? (
            <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
              Extension approved — complete payment below if a fee applies.
            </p>
          ) : null}
          <PickupCountdown booking={booking} className="mt-2" />
          {isActive && booking.startAt && booking.endAt ? (
            <div className="mt-3">
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
                {Date.now() > new Date(booking.endAt).getTime()
                  ? "Return overdue — please return the bike"
                  : `Return in ${Math.max(0, Math.round((new Date(booking.endAt).getTime() - Date.now()) / 60000))} min`}
              </p>
            </div>
          ) : null}
          {isActive && booking.endAt && new Date(booking.endAt).getTime() < Date.now() ? (
            <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              Delay notice: scheduled return time has passed. Late fees may apply.
            </p>
          ) : null}
        </section>

        <PickupLocationCard
          zoneName={getPickupZoneName(booking) || booking.zoneSnapshot?.name}
          pickupHub={getPickupHub(booking.zoneSnapshot) || getPickupHub(booking)}
        />

        {isReserved ? (
          <section className="space-y-3 rounded-2xl border border-orange-100 bg-orange-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00] text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-extrabold text-gray-900">Show this code at the hub</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Hub staff will verify your ID and this code, then start your ride. You cannot start
                  the rental yourself.
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-white px-4 py-5 text-center shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Pickup code
              </p>
              <p className="mt-2 text-3xl font-black tracking-[0.35em] text-[#FF6A00]">
                {booking.pickupCode || "————"}
              </p>
            </div>
            {booking.startAt && new Date(booking.startAt).getTime() > Date.now() ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                You&apos;ve arrived early — the bike can only be handed over from{" "}
                {new Date(booking.startAt).toLocaleString()} onward, even with this code.
              </p>
            ) : null}
            <p className="flex items-center gap-2 text-xs text-amber-800">
              <Clock3 className="h-3.5 w-3.5" />
              This screen refreshes automatically after staff starts your ride.
            </p>
            <PrimaryButton
              className="bg-white text-[#FF6A00] ring-1 ring-orange-200"
              disabled={busy || cancelPreviewLoading}
              onClick={openCancel}
            >
              Cancel booking
            </PrimaryButton>
          </section>
        ) : null}

        {isNoShow ? (
          <section className="space-y-2 rounded-2xl border border-red-100 bg-red-50 p-4 shadow-sm">
            <h2 className="font-extrabold text-red-900">Marked as no-show</h2>
            <p className="text-sm text-red-800">
              This booking was marked as a missed pickup because it wasn&apos;t collected within
              the pickup window. If you&apos;re still at the hub, ask the vendor or admin to
              restore it — they can override the no-show and reopen pickup for you.
            </p>
          </section>
        ) : null}

        {showCancelSheet ? (
          <CancellationRefundCard
            preview={cancelPreview}
            loading={cancelPreviewLoading}
            confirming={busy}
            onConfirm={cancel}
            onDismiss={() => {
              setShowCancelSheet(false);
              setCancelPreview(null);
            }}
          />
        ) : null}

        {isActive ? (
          <>
            <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
              Ride is active. Enjoy your trip. Return the bike to the same hub before your end time.
              Hub staff will end the ride and complete inspection.
            </section>
            <section
              id="extend-rental"
              className="space-y-3 rounded-2xl bg-white p-4 shadow-sm scroll-mt-20"
            >
              <h2 className="font-bold">Extend rental</h2>
              <input
                type="datetime-local"
                className="w-full max-w-full rounded-xl border p-3 text-sm"
                value={extendAt}
                onChange={(e) => setExtendAt(e.target.value)}
              />
              <PrimaryButton
                className="bg-white text-[#FF6A00] ring-1 ring-orange-200"
                disabled={busy}
                onClick={quoteExtend}
              >
                Get extension quote
              </PrimaryButton>
              {extendQuote ? (
                <div className="space-y-2 rounded-xl bg-orange-50 p-3 text-sm">
                  <p>
                    New end: {new Date(extendQuote.newEndAt).toLocaleString()}
                  </p>
                  <p>
                    Fee: <b>₹{extendQuote.extensionFee}</b>
                  </p>
                  <div className="flex flex-col gap-2">
                    <PrimaryButton disabled={busy} onClick={payExtendWallet}>
                      Pay with wallet
                    </PrimaryButton>
                    <PrimaryButton
                      className="bg-white text-[#FF6A00] ring-1 ring-orange-200"
                      disabled={busy}
                      onClick={payExtendRazorpay}
                    >
                      Pay with Razorpay
                    </PrimaryButton>
                  </div>
                </div>
              ) : null}
            </section>
            <PrimaryButton onClick={() => navigate(getBikeRentReturnPath(id))}>
              I’ve arrived to return
            </PrimaryButton>
            <p className="text-center text-[11px] text-gray-500">
              This notifies the hub. Staff will still inspect the bike and end the ride.
            </p>
          </>
        ) : null}

        {booking.status === "return_requested" || booking.status === "inspection" ? (
          <section className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-900">
            Bike returned / return requested. Waiting for hub inspection and deposit settlement.
          </section>
        ) : null}

        {(returnPreview || returnPreviewLoading) ? (
          <ReturnSettlementSummaryCard
            preview={returnPreview}
            loading={returnPreviewLoading}
          />
        ) : null}
      </main>
    </BikeRentPageShell>
  );
}
