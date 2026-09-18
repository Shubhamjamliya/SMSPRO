import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bike,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Minus,
  Plus,
  Printer,
  Store,
  Tag,
  User,
  Utensils,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import notificationSound from "@food/assets/audio/alert.mp3";
import { ActionSlider } from "@/modules/DeliveryV2/components/ui/ActionSlider";
import { useRestaurantRealtime } from "@food/context/RestaurantRealtimeContext";

const REJECT_REASONS = [
  "Restaurant is too busy",
  "Item not available",
  "Outside delivery area",
  "Kitchen closing soon",
  "Technical issue",
  "Other reason",
];

const AUTO_ACCEPT_SECONDS = 240;

const firstText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatMoney = (value) => {
  const n = toNumber(value);
  if (n === null) return null;
  return `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
};

const formatDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const getRestaurantVisibleItems = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const foodItems = normalizedItems.filter((item) => {
    const itemType = String(item?.type || item?.orderType || "food").toLowerCase();
    return itemType !== "quick";
  });
  return foodItems.length ? foodItems : normalizedItems;
};

const formatAddress = (order) => {
  const addr =
    order?.deliveryAddress || order?.customerAddress || order?.address || null;
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  if (addr.formattedAddress) return addr.formattedAddress;
  return [
    addr.street,
    addr.additionalDetails,
    addr.landmark,
    addr.area,
    addr.city,
    addr.state,
    addr.zipCode,
  ]
    .filter(Boolean)
    .join(", ");
};

const getCustomerName = (order) =>
  firstText(
    order?.customerName,
    order?.userName,
    order?.userId?.name,
    order?.user?.name,
  );

const getCustomerPhone = (order) =>
  firstText(
    order?.customerPhone,
    order?.userPhone,
    order?.userId?.phone,
    order?.user?.phone,
    order?.deliveryAddress?.phone,
    order?.customerAddress?.phone,
  );

const getItemAddons = (item) => {
  const list = Array.isArray(item?.addons)
    ? item.addons
    : Array.isArray(item?.addOns)
      ? item.addOns
      : [];
  return list
    .map((a) => ({
      name: firstText(a?.name, a?.title, a?.label),
      quantity: Math.max(1, toNumber(a?.quantity) ?? 1),
      price: Math.max(0, toNumber(a?.price) ?? 0),
    }))
    .filter((a) => a.name);
};

const paymentMethodLabel = (method) => {
  const m = String(method || "").toLowerCase();
  if (m === "cash" || m === "cod") return "Cash on Delivery";
  if (m === "wallet") return "Wallet";
  if (m === "razorpay") return "Online (Razorpay)";
  if (m === "razorpay_qr") return "QR (Razorpay)";
  if (m === "upi") return "UPI";
  if (m === "card") return "Card";
  return method ? String(method) : "";
};

const paymentStatusMeta = (status, method) => {
  const s = String(status || "").toLowerCase();
  const m = String(method || "").toLowerCase();
  if (["paid", "captured", "authorized", "settled"].includes(s)) {
    return { label: "Paid", className: "bg-green-50 text-green-700 border-green-200" };
  }
  if (s === "refunded") {
    return { label: "Refunded", className: "bg-purple-50 text-purple-700 border-purple-200" };
  }
  if (["failed", "cancelled"].includes(s)) {
    return { label: "Failed", className: "bg-red-50 text-red-700 border-red-200" };
  }
  if (m === "cash" || m === "cod" || s === "cod_pending") {
    return { label: "Pending (COD)", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (["created", "pending_qr", "pending"].includes(s) || !s) {
    return { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return { label: String(status), className: "bg-gray-50 text-gray-700 border-gray-200" };
};

const orderStatusMeta = (status) => {
  const s = String(status || "").toLowerCase();
  if (["created", "placed", "pending"].includes(s)) {
    return { label: s || "created", className: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (["preparing", "accepted", "confirmed"].includes(s)) {
    return { label: s, className: "bg-orange-50 text-orange-700 border-orange-200" };
  }
  if (["ready", "out_for_delivery", "picked_up"].includes(s)) {
    return { label: s.replaceAll("_", " "), className: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  }
  if (["delivered", "completed"].includes(s)) {
    return { label: s, className: "bg-green-50 text-green-700 border-green-200" };
  }
  if (s.includes("cancel")) {
    return { label: s.replaceAll("_", " "), className: "bg-red-50 text-red-700 border-red-200" };
  }
  return { label: s || "—", className: "bg-gray-50 text-gray-700 border-gray-200" };
};

const getPopupOrderTotal = (orderLike, visibleItems) => {
  if (!orderLike) return 0;
  const rawItems = Array.isArray(orderLike.items) ? orderLike.items : [];
  const hasFilteredMixedItems =
    visibleItems.length > 0 && visibleItems.length !== rawItems.length;

  if (hasFilteredMixedItems) {
    return visibleItems.reduce((sum, item) => {
      const price = toNumber(item?.price) ?? 0;
      const qty = toNumber(item?.quantity) ?? 0;
      return sum + price * qty;
    }, 0);
  }

  return (
    toNumber(orderLike.pricing?.total) ??
    toNumber(orderLike.total) ??
    toNumber(orderLike.payment?.amountDue) ??
    visibleItems.reduce((sum, item) => {
      const price = toNumber(item?.price) ?? 0;
      const qty = toNumber(item?.quantity) ?? 0;
      return sum + price * qty;
    }, 0)
  );
};

const getInitialCountdown = (orderId) => {
  if (!orderId) return AUTO_ACCEPT_SECONDS;
  const storageKey = `order_timer_${orderId}`;
  const startTime = localStorage.getItem(storageKey);
  if (startTime) {
    const elapsed = Math.floor((Date.now() - parseInt(startTime, 10)) / 1000);
    const remaining = AUTO_ACCEPT_SECONDS - elapsed;
    return remaining > 0 ? remaining : 0;
  }
  localStorage.setItem(storageKey, Date.now().toString());
  return AUTO_ACCEPT_SECONDS;
};

const clearOrderTimer = (orderId) => {
  if (orderId) localStorage.removeItem(`order_timer_${orderId}`);
};

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

function Section({ title, icon: Icon, children }) {
  if (!children) return null;
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50/80">
        {Icon ? <Icon className="w-3.5 h-3.5 text-[#FF6A00]" /> : null}
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
          {title}
        </h4>
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </section>
  );
}

function DetailRow({ label, value, mono = false }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span
        className={`text-right text-gray-900 font-medium break-words ${
          mono ? "font-mono text-[11px]" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Badge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${className}`}
    >
      {children}
    </span>
  );
}

export default function RestaurantIncomingOrderPopup() {
  const location = useLocation();
  const {
    incomingOrder,
    queueLength,
    acceptOrder,
    rejectOrder,
    clearIncoming,
    isMuted,
    toggleMute,
    restaurantName,
  } = useRestaurantRealtime();

  // Live Orders page shows NewOrderAcceptCard queue — keep ring only, hide modal.
  const isLiveOrdersPage = String(location.pathname || "").includes(
    "/live-orders",
  );

  const [prepTime, setPrepTime] = useState(15);
  const [countdown, setCountdown] = useState(AUTO_ACCEPT_SECONDS);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const audioRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const activeOrderIdRef = useRef(null);

  const order = incomingOrder;
  const hasQueuedOrders = queueLength > 0;
  const visibleItems = useMemo(
    () => getRestaurantVisibleItems(order?.items || []),
    [order],
  );

  const addressText = formatAddress(order);
  const customerName = getCustomerName(order);
  const customerPhone = getCustomerPhone(order);
  const pricing = order?.pricing || {};
  const payment = order?.payment || {};
  const distanceKm = toNumber(pricing.deliveryDistanceKm);
  const deliveryNote = firstText(order?.note, order?.deliveryInstructions);
  const paymentMethod = firstText(order?.paymentMethod, payment?.method);
  const paymentStatus = firstText(payment?.status);
  const payBadge = paymentStatusMeta(paymentStatus, paymentMethod);
  const statusBadge = orderStatusMeta(order?.orderStatus || order?.status);
  const grandTotal = getPopupOrderTotal(order, visibleItems);
  const isScheduled = Boolean(order?.scheduledAt);
  const fulfillmentType = firstText(
    order?.fulfillmentType,
    order?.deliveryType,
    "Delivery",
  );

  const etaMin = toNumber(pricing?.deliverySpeed?.etaMinutesMin);
  const etaMax = toNumber(pricing?.deliverySpeed?.etaMinutesMax);
  const etaLabel =
    etaMin != null && etaMax != null
      ? `${etaMin}–${etaMax} min`
      : etaMin != null
        ? `${etaMin} min`
        : firstText(pricing?.deliverySpeed?.label);

  const transactionId = firstText(
    payment?.razorpay?.paymentId,
    order?.transactionId,
  );
  const gatewayOrderId = firstText(payment?.razorpay?.orderId);
  const paymentGateway =
    String(paymentMethod || "").toLowerCase().includes("razorpay")
      ? "Razorpay"
      : String(paymentMethod || "").toLowerCase() === "wallet"
        ? "Wallet"
        : String(paymentMethod || "").toLowerCase() === "cash" ||
            String(paymentMethod || "").toLowerCase() === "cod"
          ? "COD"
          : "";

  const paidAmount =
    ["paid", "captured", "authorized", "settled"].includes(
      String(paymentStatus || "").toLowerCase(),
    )
      ? toNumber(payment?.amountDue) ?? toNumber(pricing?.total) ?? grandTotal
      : null;

  const addonTotal = useMemo(
    () =>
      visibleItems.reduce((sum, item) => {
        const qty = toNumber(item?.quantity) ?? 1;
        return (
          sum +
          getItemAddons(item).reduce(
            (s, a) => s + a.price * a.quantity * qty,
            0,
          )
        );
      }, 0),
    [visibleItems],
  );

  const itemSubtotal =
    toNumber(pricing.subtotal) ??
    visibleItems.reduce((sum, item) => {
      const price = toNumber(item?.price) ?? 0;
      const qty = toNumber(item?.quantity) ?? 0;
      return sum + price * qty;
    }, 0);

  const displayRestaurantName = firstText(
    order?.restaurantName,
    order?.sourceName,
    restaurantName,
    order?.items?.[0]?.sourceName,
  );
  const outletName = firstText(order?.outletName, displayRestaurantName);

  const driverName = firstText(
    order?.driverName,
    order?.deliveryPartner?.name,
    order?.dispatch?.deliveryPartnerId?.name,
  );
  const driverPhone = firstText(
    order?.driverPhone,
    order?.deliveryPartner?.phone,
    order?.dispatch?.deliveryPartnerId?.phone,
  );
  const driverStatus = firstText(
    order?.driverStatus,
    order?.deliveryPartner?.status,
    order?.dispatch?.status,
    order?.deliveryState?.currentPhase,
  );

  const acceptedAt = firstText(
    order?.acceptedAt,
    order?.dispatch?.acceptedAt,
  );
  const createdAt = formatDateTime(order?.createdAt);
  const acceptedAtLabel = formatDateTime(acceptedAt);
  const couponCode = firstText(pricing?.couponCode, order?.couponCode);
  const couponDiscount =
    toNumber(pricing?.couponDiscount) ?? toNumber(pricing?.discount);
  const orderSource = firstText(order?.orderSource, order?.source);

  useEffect(() => {
    if (!order) {
      activeOrderIdRef.current = null;
      setShowRejectPopup(false);
      setRejectReason("");
      setIsAcceptingOrder(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      return;
    }

    const orderId =
      order.orderMongoId || order._id || order.orderId || order.id || null;
    if (String(orderId) !== String(activeOrderIdRef.current)) {
      activeOrderIdRef.current = orderId;
      setCountdown(getInitialCountdown(orderId));
      const seedPrep = toNumber(order.preparationTime);
      setPrepTime(
        seedPrep != null && seedPrep >= 1
          ? Math.min(180, Math.round(seedPrep))
          : 15,
      );
      setIsDetailsExpanded(true);
      setShowRejectPopup(false);
      setRejectReason("");
      setIsAcceptingOrder(false);
    }
  }, [order]);

  useEffect(() => {
    const unlockAudio = async () => {
      if (audioUnlockedRef.current || !audioRef.current) return;
      try {
        audioRef.current.muted = true;
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        audioUnlockedRef.current = true;
        if (hasQueuedOrders && !isMuted) {
          audioRef.current.loop = true;
          audioRef.current.play().catch(() => {});
        }
      } catch {
        if (audioRef.current) audioRef.current.muted = false;
      }
    };

    window.addEventListener("pointerdown", unlockAudio, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [hasQueuedOrders, order, isMuted]);

  useEffect(() => {
    if (hasQueuedOrders && !isMuted && audioRef.current) {
      audioRef.current.loop = true;
      audioRef.current.muted = false;
      audioRef.current.volume = 1;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [hasQueuedOrders, order, isMuted]);

  useEffect(() => {
    // On Live Orders, cards own the countdown UI — do not auto-reject from the popup.
    if (!order || isLiveOrdersPage) return undefined;
    if (countdown <= 0) {
      (async () => {
        try {
          await rejectOrder("Auto-rejected: response timeout");
        } catch {
          clearIncoming(order);
        } finally {
          const orderId =
            order.orderMongoId || order._id || order.orderId || order.id;
          clearOrderTimer(orderId);
        }
      })();
      return undefined;
    }
    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [order, countdown, rejectOrder, clearIncoming, isLiveOrdersPage]);

  const handleAccept = async () => {
    if (isAcceptingOrder || !order) return;
    setIsAcceptingOrder(true);
    try {
      await acceptOrder(prepTime);
      const orderId =
        order.orderMongoId || order._id || order.orderId || order.id;
      clearOrderTimer(orderId);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to accept order");
    } finally {
      setIsAcceptingOrder(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason || !order) return;
    try {
      await rejectOrder(rejectReason);
      const orderId =
        order.orderMongoId || order._id || order.orderId || order.id;
      clearOrderTimer(orderId);
      setShowRejectPopup(false);
      setRejectReason("");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reject order");
    }
  };

  const handlePrint = async () => {
    if (!order) return;
    try {
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text(`Order ${order.orderId || ""}`, 14, 16);
      if (displayRestaurantName) doc.text(String(displayRestaurantName), 14, 24);
      if (customerName) doc.text(`Customer: ${customerName}`, 14, 32);
      if (customerPhone) doc.text(`Phone: ${customerPhone}`, 14, 40);
      let y = 48;
      if (addressText) {
        const lines = doc.splitTextToSize(`Address: ${addressText}`, 180);
        doc.text(lines, 14, y);
        y += lines.length * 6 + 4;
      }
      autoTable(doc, {
        startY: y,
        head: [["Item", "Variant", "Qty", "Price"]],
        body: visibleItems.map((item) => [
          item.name || "Item",
          item.variantName || item.variant || item.size || "—",
          String(item.quantity || 1),
          String(item.price || 0),
        ]),
      });
      doc.save(`order-${order.orderId || "print"}.pdf`);
    } catch {
      toast.error("Unable to print order");
    }
  };

  const hasCustomerSection =
    customerName || customerPhone || addressText || deliveryNote || distanceKm != null;
  const hasDeliverySection = driverName || driverPhone || driverStatus;
  const hasCouponSection =
    couponCode || (couponDiscount != null && couponDiscount > 0);

  return (
    <>
      <audio
        ref={audioRef}
        src={notificationSound}
        preload="auto"
        aria-label="New order notification sound"
      />

      <AnimatePresence>
        {order && !isLiveOrdersPage && (
          <motion.div
            className="fixed inset-0 z-[200] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-2xl max-h-[92vh] bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-[#FF6A00] px-5 py-4 flex justify-between items-center text-white border-b border-red-600/20 shrink-0">
                <div className="min-w-0">
                  <p className="text-white/90 text-[10px] font-bold uppercase tracking-widest mb-0.5">
                    Incoming Order
                  </p>
                  <h3 className="text-xl font-bold text-white tracking-tight truncate">
                    {order.orderId || "—"}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Badge className="bg-white/15 text-white border-white/30">
                      {statusBadge.label}
                    </Badge>
                    <Badge className="bg-white/15 text-white border-white/30">
                      {payBadge.label}
                    </Badge>
                    {isScheduled ? (
                      <Badge className="bg-white/15 text-white border-white/30">
                        Scheduled
                      </Badge>
                    ) : (
                      <Badge className="bg-white/15 text-white border-white/30">
                        Instant
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="p-2 hover:bg-white/20 active:scale-95 rounded-full transition-all"
                    aria-label="Print"
                  >
                    <Printer className="w-5 h-5 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-2 hover:bg-white/20 active:scale-95 rounded-full transition-all"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5 text-white" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-white" />
                    )}
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="px-4 pt-4 pb-3 flex-1 overflow-y-auto min-h-0 bg-gray-50 space-y-3 overscroll-contain">
                {isScheduled && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-[#FF6A00] uppercase tracking-wider">
                        Scheduled Order
                      </p>
                      <p className="text-sm font-bold text-[#FF6A00]">
                        For {formatDateTime(order.scheduledAt)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Customer */}
                {hasCustomerSection && (
                  <Section title="Customer" icon={User}>
                    <DetailRow label="Name" value={customerName} />
                    <DetailRow label="Phone" value={customerPhone} />
                    <DetailRow label="Delivery Address" value={addressText} />
                    <DetailRow label="Delivery Instructions" value={deliveryNote} />
                    <DetailRow
                      label="Distance"
                      value={
                        distanceKm != null && distanceKm >= 0
                          ? `${distanceKm.toFixed(1)} km`
                          : ""
                      }
                    />
                  </Section>
                )}

                {/* Order */}
                <Section title="Order" icon={Clock}>
                  <DetailRow label="Order ID" value={order.orderId} mono />
                  <DetailRow
                    label="Order Number"
                    value={firstText(order.orderMongoId, order._id, order.id)}
                    mono
                  />
                  <DetailRow label="Date & Time" value={createdAt} />
                  <DetailRow label="Order Type" value={fulfillmentType} />
                  <DetailRow
                    label="Timing"
                    value={isScheduled ? "Scheduled" : "Instant"}
                  />
                  <DetailRow label="Est. Delivery" value={etaLabel} />
                  <DetailRow
                    label="Est. Preparation"
                    value={
                      toNumber(order.preparationTime) != null
                        ? `${toNumber(order.preparationTime)} min`
                        : ""
                    }
                  />
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-xs text-gray-500">Status</span>
                    <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
                  </div>
                  <DetailRow label="Created" value={createdAt} />
                  <DetailRow label="Accepted" value={acceptedAtLabel} />
                  <DetailRow label="Order Source" value={orderSource} />
                  <DetailRow
                    label="Response Timer"
                    value={`${formatTime(countdown)} remaining`}
                  />
                </Section>

                {/* Restaurant */}
                {(displayRestaurantName || outletName) && (
                  <Section title="Restaurant" icon={Store}>
                    <DetailRow label="Restaurant Name" value={displayRestaurantName} />
                    <DetailRow label="Outlet Name" value={outletName} />
                  </Section>
                )}

                {/* Items */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-3 border-b border-gray-100 flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 tracking-tight">
                        Items ({visibleItems.length})
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Food items for this restaurant
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDetailsExpanded((v) => !v)}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50"
                    >
                      {isDetailsExpanded ? "Hide" : "Show"}
                      {isDetailsExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <AnimatePresence>
                    {isDetailsExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 py-3 space-y-3 max-h-64 overflow-y-auto border-t border-gray-100 bg-gray-50/40">
                          {visibleItems.length > 0 ? (
                            visibleItems.map((item, index) => {
                              const qty = toNumber(item.quantity) ?? 1;
                              const unitPrice = toNumber(item.price) ?? 0;
                              const lineTotal = unitPrice * qty;
                              const variant = firstText(
                                item.variantName,
                                item.variant,
                                item.size,
                              );
                              const addons = getItemAddons(item);
                              const itemNote = firstText(item.notes, item.note);
                              const category = firstText(
                                item.categoryName,
                                item.category,
                              );
                              const imageUrl = firstText(
                                item.image,
                                item.imageUrl,
                              );

                              return (
                                <div
                                  key={`${item.itemId || item.name}-${index}`}
                                  className="bg-white rounded-xl border border-gray-100 p-2.5"
                                >
                                  <div className="flex gap-2.5">
                                    {imageUrl ? (
                                      <img
                                        src={imageUrl}
                                        alt=""
                                        className="w-12 h-12 rounded-lg object-cover shrink-0 bg-gray-100"
                                      />
                                    ) : (
                                      <div
                                        className={`w-3 h-3 rounded-sm mt-1.5 shrink-0 border ${
                                          item.isVeg
                                            ? "border-green-600"
                                            : "border-red-600"
                                        }`}
                                      >
                                        <div
                                          className={`w-1.5 h-1.5 rounded-full m-[3px] ${
                                            item.isVeg ? "bg-green-600" : "bg-red-600"
                                          }`}
                                        />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0 space-y-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold text-gray-900 leading-snug">
                                            {qty} × {item.name || "Item"}
                                          </p>
                                          {category ? (
                                            <p className="text-[10px] text-gray-500 mt-0.5">
                                              {category}
                                            </p>
                                          ) : null}
                                          {variant ? (
                                            <p className="text-[10px] text-gray-500">
                                              Size/Variant: {variant}
                                            </p>
                                          ) : null}
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="text-xs font-bold text-gray-900">
                                            {formatMoney(lineTotal)}
                                          </p>
                                          <p className="text-[10px] text-gray-500">
                                            {formatMoney(unitPrice)} each
                                          </p>
                                        </div>
                                      </div>

                                      {addons.length > 0 ? (
                                        <div className="mt-1.5 rounded-lg bg-gray-50 border border-gray-100 px-2 py-1.5 space-y-1">
                                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                            Add-ons
                                          </p>
                                          {addons.map((addon, ai) => (
                                            <div
                                              key={`${addon.name}-${ai}`}
                                              className="flex justify-between gap-2 text-[11px] text-gray-700"
                                            >
                                              <span>
                                                {addon.quantity} × {addon.name}
                                              </span>
                                              <span className="font-medium">
                                                {formatMoney(
                                                  addon.price * addon.quantity,
                                                )}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}

                                      {itemNote ? (
                                        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                                          Item note: {itemNote}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-xs text-gray-500 text-center py-2">
                              No items on this order
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Payment */}
                <Section title="Payment" icon={CreditCard}>
                  <DetailRow
                    label="Method"
                    value={paymentMethodLabel(paymentMethod)}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500">Status</span>
                    <Badge className={payBadge.className}>{payBadge.label}</Badge>
                  </div>
                  <DetailRow
                    label="Received?"
                    value={
                      ["paid", "captured", "authorized", "settled"].includes(
                        String(paymentStatus || "").toLowerCase(),
                      )
                        ? "Yes — payment received"
                        : String(paymentMethod || "").toLowerCase() === "cash" ||
                            String(paymentMethod || "").toLowerCase() === "cod"
                          ? "No — collect on delivery"
                          : "Pending"
                    }
                  />
                  <DetailRow
                    label="Paid Amount"
                    value={paidAmount != null ? formatMoney(paidAmount) : ""}
                  />
                  <DetailRow label="Total Amount" value={formatMoney(grandTotal)} />
                  <DetailRow label="Transaction / Payment ID" value={transactionId} mono />
                  <DetailRow label="Gateway Order ID" value={gatewayOrderId} mono />
                  <DetailRow label="Payment Gateway" value={paymentGateway} />
                </Section>

                {/* Coupon */}
                {hasCouponSection && (
                  <Section title="Coupon" icon={Tag}>
                    <DetailRow label="Coupon Code" value={couponCode} mono />
                    <DetailRow
                      label="Discount Amount"
                      value={
                        couponDiscount != null && couponDiscount > 0
                          ? `−${formatMoney(couponDiscount)}`
                          : ""
                      }
                    />
                    {pricing.couponFreeDelivery ? (
                      <DetailRow label="Benefit" value="Free delivery" />
                    ) : null}
                  </Section>
                )}

                {/* Pricing */}
                <Section title="Pricing Breakdown" icon={Tag}>
                  <DetailRow label="Item Subtotal" value={formatMoney(itemSubtotal)} />
                  <DetailRow
                    label="Add-on Total"
                    value={addonTotal > 0 ? formatMoney(addonTotal) : ""}
                  />
                  <DetailRow
                    label="Coupon Discount"
                    value={
                      toNumber(pricing.couponDiscount) > 0
                        ? `−${formatMoney(pricing.couponDiscount)}`
                        : ""
                    }
                  />
                  <DetailRow
                    label="Other Discount"
                    value={
                      toNumber(pricing.discount) > 0 &&
                      toNumber(pricing.discount) !== toNumber(pricing.couponDiscount)
                        ? `−${formatMoney(pricing.discount)}`
                        : ""
                    }
                  />
                  <DetailRow
                    label="Delivery Charges"
                    value={formatMoney(
                      pricing.userDeliveryFee ?? pricing.deliveryFee,
                    )}
                  />
                  <DetailRow
                    label="Packaging Charges"
                    value={formatMoney(pricing.packagingFee)}
                  />
                  <DetailRow label="Taxes (GST)" value={formatMoney(pricing.tax)} />
                  <DetailRow
                    label="Platform Fee"
                    value={formatMoney(pricing.platformFee)}
                  />
                  <DetailRow
                    label="Delivery Speed Fee"
                    value={formatMoney(pricing.deliverySpeedFee)}
                  />
                  <DetailRow
                    label="Tip"
                    value={formatMoney(pricing.tip ?? order?.tip)}
                  />
                  <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-100">
                    <span className="text-sm font-bold text-gray-900">Grand Total</span>
                    <span className="text-base font-black text-gray-900">
                      {formatMoney(grandTotal)}
                    </span>
                  </div>
                </Section>

                {/* Delivery partner */}
                {hasDeliverySection && (
                  <Section title="Delivery" icon={Bike}>
                    <DetailRow label="Partner Name" value={driverName} />
                    <DetailRow label="Partner Phone" value={driverPhone} />
                    <DetailRow label="Partner Status" value={driverStatus} />
                  </Section>
                )}

                {/* Cutlery + prep controls */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between p-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <Utensils
                        className={`w-4 h-4 ${
                          order?.sendCutlery === false
                            ? "text-red-500"
                            : "text-gray-400"
                        }`}
                      />
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider ${
                          order?.sendCutlery === false
                            ? "text-red-600"
                            : "text-gray-600"
                        }`}
                      >
                        {order?.sendCutlery === false ? "No Cutlery" : "Send Cutlery"}
                      </span>
                    </div>
                    <Badge className={payBadge.className}>{payBadge.label}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div>
                        <span className="text-sm font-semibold text-gray-700 block">
                          Estimated Preparation Time
                        </span>
                        <span className="text-[10px] text-gray-400">
                          1–180 minutes
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-100">
                      <button
                        type="button"
                        onClick={() => setPrepTime((t) => Math.max(1, t - 1))}
                        className="w-7 h-7 flex items-center justify-center bg-white hover:bg-gray-100 rounded shadow-sm transition-colors active:scale-95"
                      >
                        <Minus className="w-3.5 h-3.5 text-gray-700" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={prepTime}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n)) return;
                          setPrepTime(Math.min(180, Math.max(1, Math.round(n))));
                        }}
                        className="text-sm font-bold text-gray-900 w-12 text-center bg-transparent outline-none"
                      />
                      <span className="text-xs font-semibold text-gray-500 pr-1">
                        min
                      </span>
                      <button
                        type="button"
                        onClick={() => setPrepTime((t) => Math.min(180, t + 1))}
                        className="w-7 h-7 flex items-center justify-center bg-white hover:bg-gray-100 rounded shadow-sm transition-colors active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5 text-gray-700" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-b-xl">
                    <span className="text-sm font-bold text-gray-900">Total Bill</span>
                    <span className="text-lg font-black text-gray-900">
                      {formatMoney(grandTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-gray-100 bg-white shrink-0">
                <div className="space-y-3">
                  <ActionSlider
                    label={
                      isAcceptingOrder
                        ? "Accepting..."
                        : `Slide to accept (${formatTime(countdown)})`
                    }
                    lockedLabel="Accepting..."
                    onConfirm={handleAccept}
                    disabled={isAcceptingOrder}
                    color="bg-[#FF6A00]"
                    successLabel="Accepted ✓"
                    timeProgress={(countdown / AUTO_ACCEPT_SECONDS) * 100}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRejectPopup(true)}
                    disabled={isAcceptingOrder}
                    className="w-full py-3 bg-white border border-[#FF6A00]/20 text-[#FF6A00] rounded-xl font-bold text-sm hover:bg-red-50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reject Order
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRejectPopup && order && (
          <motion.div
            className="fixed inset-0 z-[210] bg-black/60 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowRejectPopup(false)}
          >
            <motion.div
              className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">
                  Reject Order {order.orderId || ""}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Please select a reason for rejecting this order
                </p>
              </div>
              <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  {REJECT_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setRejectReason(reason)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        rejectReason === reason
                          ? "border-black bg-black/5"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <span
                        className={`text-sm font-medium ${
                          rejectReason === reason ? "text-black" : "text-gray-900"
                        }`}
                      >
                        {reason}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowRejectPopup(false)}
                  className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRejectConfirm}
                  disabled={!rejectReason}
                  className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
                    rejectReason
                      ? "!bg-black !text-white"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  Confirm Rejection
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
