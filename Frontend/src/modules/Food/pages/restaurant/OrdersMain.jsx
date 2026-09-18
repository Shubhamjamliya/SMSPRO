import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useOrderEventRefresh } from "@core/sync/useOrderEventRefresh";
import {
  checkOnboardingStatus,
  isRestaurantOnboardingComplete,
} from "@food/utils/onboardingUtils";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Loader2,
  Calendar,
  Clock,
  Users,
  MessageSquare,
  Check,
  Phone,
  Hash,
  User,
  Lock,
  Unlock,
  Star,
  X,
  Minus,
  Plus,
  Inbox,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell";
import { restaurantAPI, diningAPI } from "@food/api";
import { useRestaurantRealtime } from "@food/context/RestaurantRealtimeContext";
import LiveOrderDetailsModal from "@food/components/restaurant/LiveOrderDetailsModal";
import NewOrderAcceptCard from "@food/components/restaurant/NewOrderAcceptCard";
import ResendNotificationButton from "@food/components/restaurant/ResendNotificationButton";
import { getRestaurantCookingNote } from "@food/utils/orderCookingNote";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
const debugLog = (...args) => { };
const debugWarn = (...args) => { };
const debugError = (...args) => { };

const STORAGE_KEY = "restaurant_online_status";

// Live Orders only — history lives on All Orders page
const filterTabs = [
  { id: "new", label: "New Orders" },
  { id: "all", label: "All live" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "out-for-delivery", label: "Out for delivery" },
  { id: "scheduled", label: "Scheduled" },
  { id: "table-booking", label: "Table Booking" },
];

const LIVE_ORDER_STATUSES = new Set([
  "pending",
  "created",
  "confirmed",
  "preparing",
  "ready",
  "ready_for_pickup",
  "assigned",
  "picked_up",
  "out_for_delivery",
]);

const allOrdersStatusPriority = {
  pending: 0,
  created: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  ready_for_pickup: 3,
  assigned: 4,
  picked_up: 5,
  out_for_delivery: 5,
  scheduled: 6,
};

const getAllOrdersTimestamp = (order) =>
  order?.cancelledAt ||
  order?.deliveredAt ||
  order?.updatedAt ||
  order?.createdAt ||
  new Date().toISOString();

const getRestaurantVisibleItems = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const foodItems = normalizedItems.filter((item) => {
    const itemType = String(item?.type || item?.orderType || "food").toLowerCase();
    return itemType !== "quick";
  });
  return foodItems.length ? foodItems : normalizedItems;
};

const buildOrderItemsSummary = (items = []) =>
  getRestaurantVisibleItems(items)
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(", ") || "No items";

const getOrderPreviewItem = (items = []) =>
  getRestaurantVisibleItems(items)[0] || null;

const normalizeLiveStatus = (orderOrStatus) => {
  const raw =
    typeof orderOrStatus === "string"
      ? orderOrStatus
      : orderOrStatus?.orderStatus || orderOrStatus?.status || "pending";
  const key = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (key === "ready_for_pickup") return "ready";
  return key;
};

const isLiveOrder = (order) => LIVE_ORDER_STATUSES.has(normalizeLiveStatus(order));

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const formatLiveAddress = (order) => {
  const addr = order?.deliveryAddress || order?.address || null;
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  return (
    addr.formattedAddress ||
    addr.address ||
    [addr.street, addr.area, addr.city, addr.state, addr.zipCode || addr.pincode]
      .filter(Boolean)
      .join(", ")
  );
};

const resolveDeliveryPartner = (order) => {
  const partner =
    order?.deliveryPartnerId ||
    order?.dispatch?.deliveryPartnerId ||
    null;
  if (!partner) return null;
  if (typeof partner === "object") {
    const name = String(partner.name || partner.fullName || "").trim();
    const phone = String(partner.phone || "").trim();
    return {
      ...partner,
      name: name || "Delivery partner",
      phone,
      rating: partner.rating,
    };
  }
  return { _id: partner, name: "Delivery partner", phone: "" };
};

const paymentMethodLabel = (method) => {
  const m = String(method || "").toLowerCase();
  if (m === "cash" || m === "cod") return "Cash on Delivery";
  if (m === "wallet") return "Wallet";
  if (m === "razorpay" || m === "online") return "Paid online";
  if (!m) return "—";
  return String(method);
};

const transformOrderForList = (order) => {
  const status = normalizeLiveStatus(order);
  const visibleItems = getRestaurantVisibleItems(order.items).map((item) => ({
    name: item.name || "Item",
    quantity: item.quantity || 1,
    price: item.price || 0,
  }));
  const partner = resolveDeliveryPartner(order);

  return {
    orderId: order.orderId || order._id,
    mongoId: order._id,
    status,
    customerName: order.userId?.name || order.customerName || "Customer",
    customerPhone: order.userId?.phone || order.customerPhone || "",
    type:
      String(order.deliveryFleet || "").toLowerCase() === "express"
        ? "Express Delivery"
        : "Home Delivery",
    tableOrToken: null,
    timePlaced: new Date(getAllOrdersTimestamp(order)).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    eta: null,
    itemsSummary: buildOrderItemsSummary(order.items),
    items: visibleItems,
    photoUrl: getOrderPreviewItem(order.items)?.image || null,
    photoAlt: getOrderPreviewItem(order.items)?.name || "Order",
    paymentMethod: order.paymentMethod || order.payment?.method || null,
    paymentLabel: paymentMethodLabel(order.paymentMethod || order.payment?.method),
    amount: Number(order.pricing?.total ?? order.total ?? 0) || 0,
    address: formatLiveAddress(order) || "Address not available",
    deliveryPartnerId: partner,
    dispatchStatus: order.dispatch?.status || null,
    note: getRestaurantCookingNote(order),
    preparingTimestamp: order.tracking?.preparing?.timestamp
      ? new Date(order.tracking.preparing.timestamp)
      : new Date(order.createdAt || Date.now()),
    initialETA:
      Number(order.preparationTime) > 0
        ? Number(order.preparationTime)
        : order.estimatedDeliveryTime || 30,
    preparationTime:
      Number(order.preparationTime) > 0 ? Number(order.preparationTime) : null,
    sortTimestamp: new Date(getAllOrdersTimestamp(order)).getTime(),
  };
};

// Completed Orders List Component
function CompletedOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const completedOrders = response.data.data.orders.filter(
            (order) =>
              order.status === "delivered" || order.status === "completed",
          );

          const transformedOrders = completedOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "delivered",
            customerName: order.userId?.name || order.customerName || "Customer",
            type: "Home Delivery",
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            deliveredAt:
              order.deliveredAt || order.updatedAt || order.createdAt,
            itemsSummary: buildOrderItemsSummary(order.items),
            photoUrl: getOrderPreviewItem(order.items)?.image || null,
            photoAlt: getOrderPreviewItem(order.items)?.name || "Order",
            amount: order.pricing?.total || order.total || 0,
            paymentMethod: order.paymentMethod || order.payment?.method || null,
          }));

          transformedOrders.sort((a, b) => {
            const dateA = new Date(a.deliveredAt);
            const dateB = new Date(b.deliveredAt);
            return dateB - dateA;
          });

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching completed orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Completed orders
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Completed orders</h2>
        <span className="text-xs text-gray-500">{orders.length} total</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No completed orders yet
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const deliveredDate = order.deliveredAt
              ? new Date(order.deliveredAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
              : "N/A";

            return (
              <div
                key={order.orderId || order.mongoId}
                className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      status: "Delivered",
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: deliveredDate,
                      itemsSummary: order.itemsSummary,
                      paymentMethod: order.paymentMethod,
                    })
                  }
                  className="w-full text-left flex gap-3 items-stretch">
                  <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
                    {order.photoUrl ? (
                      <img
                        src={order.photoUrl}
                        alt={order.photoAlt}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
                        <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                          {order.photoAlt}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-black leading-tight">
                          Order #{order.orderId}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {order.customerName}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border border-[#FF6A00]/40 text-[#FF6A00]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00]" />
                          Delivered
                        </span>
                        <span className="text-[11px] text-gray-500 text-right">
                          {deliveredDate}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {order.itemsSummary}
                      </p>
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-gray-500">
                          {order.type}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] text-gray-500">
                          Amount
                        </span>
                        <span className="text-xs font-medium text-black">
                          ₹{order.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Cancelled Orders List Component
function CancelledOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          // Filter cancelled orders (both restaurant and user cancelled)
          const cancelledOrders = response.data.data.orders.filter(
            (order) => order.status === "cancelled",
          );

          const transformedOrders = cancelledOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "cancelled",
            customerName: order.userId?.name || order.customerName || "Customer",
            type: "Home Delivery",
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            cancelledAt:
              order.cancelledAt || order.updatedAt || order.createdAt,
            cancelledBy: order.cancelledBy || "unknown",
            cancellationReason:
              order.cancellationReason || "No reason provided",
            itemsSummary: buildOrderItemsSummary(order.items),
            photoUrl: getOrderPreviewItem(order.items)?.image || null,
            photoAlt: getOrderPreviewItem(order.items)?.name || "Order",
            amount: order.pricing?.total || order.total || 0,
            paymentMethod: order.paymentMethod || order.payment?.method || null,
          }));

          transformedOrders.sort((a, b) => {
            const dateA = new Date(a.cancelledAt);
            const dateB = new Date(b.cancelledAt);
            return dateB - dateA;
          });

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching cancelled orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Cancelled orders
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Cancelled orders</h2>
        <span className="text-xs text-gray-500">{orders.length} total</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No cancelled orders yet
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const cancelledDate = order.cancelledAt
              ? new Date(order.cancelledAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
              : "N/A";

            const cancelledByText =
              order.cancelledBy === "user"
                ? "Cancelled by User"
                : order.cancelledBy === "restaurant"
                  ? "Cancelled by Restaurant"
                  : "Cancelled";

            return (
              <div
                key={order.orderId || order.mongoId}
                className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      status: "Cancelled",
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: cancelledDate,
                      itemsSummary: order.itemsSummary,
                      paymentMethod: order.paymentMethod,
                    })
                  }
                  className="w-full text-left flex gap-3 items-stretch">
                  <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
                    {order.photoUrl ? (
                      <img
                        src={order.photoUrl}
                        alt={order.photoAlt}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
                        <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                          {order.photoAlt}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-black leading-tight">
                          Order #{order.orderId}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {order.customerName}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${order.cancelledBy === "user"
                            ? "border-red-500 text-red-600"
                            : "border-red-500 text-red-600"
                            }`}>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${order.cancelledBy === "user"
                              ? "bg-red-500"
                              : "bg-red-500"
                              }`}
                          />
                          {cancelledByText}
                        </span>
                        <span className="text-[11px] text-gray-500 text-right">
                          {cancelledDate}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {order.itemsSummary}
                      </p>
                      {order.cancellationReason && (
                        <p className="text-[10px] text-red-600 mt-1 line-clamp-1">
                          Reason: {order.cancellationReason}
                        </p>
                      )}
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-gray-500">
                          {order.type}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] text-gray-500">
                          Amount
                        </span>
                        <span className="text-xs font-medium text-black">
                          ₹{order.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Table Bookings List Component
function TableBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    try {
      const res = await restaurantAPI.getCurrentRestaurant();
      const restaurant =
        res.data?.data?.restaurant || res.data?.restaurant || res.data?.data;
      const restaurantId = restaurant?._id || restaurant?.id;

      if (restaurantId) {
        const response = await diningAPI.getRestaurantBookings(restaurant);
        if (response.data.success) {
          setBookings(response.data.data);
        }
      }
    } catch (error) {
      debugError("Error fetching table bookings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (bookingId, nextStatus) => {
    try {
      await diningAPI.updateBookingStatusRestaurant(bookingId, nextStatus);
      toast.success(`Booking ${nextStatus}`);
      fetchBookings();
    } catch (error) {
      toast.error("Failed to update booking status");
    }
  };

  if (loading)
    return (
      <div className="text-center py-10 text-gray-400">Loading bookings...</div>
    );

  return (
    <div className="pt-4 pb-6 px-1">
      <div className="flex items-baseline justify-between mb-4 px-1">
        <h2 className="text-base font-semibold text-black">Table Bookings</h2>
        <span className="text-xs text-gray-500">{bookings.length} total</span>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
          <p className="text-gray-400 text-sm">No table bookings yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <div
              key={booking._id}
              className="bg-white rounded-[2rem] p-5 border border-gray-100 shadow-sm transition-all hover:shadow-md">
              {/* Header: Avatar, Name, ID and Status */}
              <div className="flex justify-between items-start mb-5">
                <div className="flex gap-3 items-center">
                  <div className="h-12 w-12 rounded-full bg-[#111827] flex items-center justify-center text-white text-lg font-bold">
                    {booking.user?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-gray-900 leading-tight">
                      {booking.user?.name}
                    </h3>
                    <p className="text-[11px] font-bold text-[#94A3B8] flex items-center gap-0.5 mt-0.5">
                      <Hash className="w-3 h-3" />
                      {booking.bookingId || booking._id?.slice(-8).toUpperCase()}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${booking.status === "confirmed"
                    ? "bg-[#FF6A00] text-white"
                    : booking.status === "pending"
                      ? "bg-[#FFF9E7] text-[#D97706]"
                      : booking.status === "checked-in"
                        ? "bg-red-100 text-red-700"
                        : booking.status === "completed"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                    }`}>
                  {booking.status === "pending" ? "Pending" : booking.status}
                </span>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-[#F8FAFC] p-4 rounded-2xl border border-gray-50 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                    <Calendar className="w-3.5 h-3.5 text-[#3B82F6]" />
                  </div>
                  <span className="text-[12px] font-semibold text-gray-700">
                    {new Date(booking.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                    <Clock className="w-3.5 h-3.5 text-[#3B82F6]" />
                  </div>
                  <span className="text-[12px] font-semibold text-gray-700">
                    {booking.timeSlot}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                    <Users className="w-3.5 h-3.5 text-[#3B82F6]" />
                  </div>
                  <span className="text-[12px] font-semibold text-gray-700">
                    {booking.guests} Guests
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                    <Phone className="w-3.5 h-3.5 text-[#3B82F6]" />
                  </div>
                  <span className="text-[12px] font-semibold text-gray-700">
                    {booking.user?.phone || "No phone"}
                  </span>
                </div>
              </div>

              {booking.specialRequest && (
                <div className="mb-5 p-3 bg-blue-50/50 rounded-xl border border-blue-100/30">
                  <p className="text-[11px] text-blue-700 italic flex items-start gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{booking.specialRequest}</span>
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {String(booking.status || "").toLowerCase() === "pending" && (
                  <button
                    onClick={() => handleUpdateStatus(booking._id, "confirmed")}
                    className="flex-1 bg-[#FF6A00] text-white py-3 rounded-2xl text-[13px] font-bold hover:bg-[#E64D02] transition-all active:scale-[0.98] shadow-sm shadow-[#FF6A00]/10 uppercase tracking-wide">
                    Accept
                  </button>
                )}
                {String(booking.status || "").toLowerCase() === "pending" && (
                  <button
                    onClick={() => handleUpdateStatus(booking._id, "cancelled")}
                    className="flex-1 bg-[#F1F5F9] text-[#64748B] py-3 rounded-2xl text-[13px] font-bold hover:bg-gray-200 transition-all active:scale-[0.98] uppercase tracking-wide">
                    Decline
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AllOrders({ onSelectOrder, onCancel, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [markingReadyOrderIds, setMarkingReadyOrderIds] = useState({});

  useEffect(() => {
    let isMounted = true;
    let countdownIntervalId = null;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const transformedOrders = response.data.data.orders
            .filter(isLiveOrder)
            .map(transformOrderForList)
            .sort((a, b) => {
              const priorityDiff =
                (allOrdersStatusPriority[a.status] ?? 999) -
                (allOrdersStatusPriority[b.status] ?? 999);
              if (priorityDiff !== 0) return priorityDiff;
              return b.sortTimestamp - a.sortTimestamp;
            });

          setOrders(transformedOrders);
        } else {
          setOrders([]);
        }
      } catch (error) {
        if (!isMounted) return;

        if (
          error.code !== "ERR_NETWORK" &&
          error.response?.status !== 404 &&
          error.response?.status !== 401
        ) {
          debugError("Error fetching all orders:", error);
        }

        setOrders([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchOrders();
    countdownIntervalId = setInterval(() => {
      if (isMounted) {
        setCurrentTime(new Date());
      }
    }, 1000);

    return () => {
      isMounted = false;
      if (countdownIntervalId) clearInterval(countdownIntervalId);
    };
  }, [refreshToken]);

  const handleMarkReady = async ({ orderId, mongoId }) => {
    const orderKey = mongoId || orderId;
    if (!orderKey || markingReadyOrderIds[orderKey]) return;

    try {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.markOrderReady(orderKey);
      setOrders((prev) =>
        prev.map((order) =>
          (order.mongoId || order.orderId) === orderKey
            ? {
              ...order,
              status: "ready",
              eta: null,
              sortTimestamp: Date.now(),
            }
            : order,
        ),
      );
      toast.success("Order marked as ready");
    } catch (error) {
      debugError("Error marking order as ready from All orders:", error);
      toast.error(
        error.response?.data?.message || "Failed to mark order as ready",
      );
    } finally {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: false }));
    }
  };

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Live orders</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Live orders</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No live orders right now
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const normalizedStatus = String(order.status || "").toLowerCase();
            let etaDisplay = order.eta;

            if (normalizedStatus === "preparing" && order.preparingTimestamp) {
              const elapsedMs = currentTime - order.preparingTimestamp;
              const elapsedMinutes = Math.floor(elapsedMs / 60000);
              const remainingMinutes = Math.max(
                0,
                order.initialETA - elapsedMinutes,
              );

              if (remainingMinutes <= 0) {
                const remainingSeconds = Math.max(
                  0,
                  Math.floor(order.initialETA * 60 - elapsedMs / 1000),
                );
                etaDisplay =
                  remainingSeconds > 0 ? `${remainingSeconds} secs` : "0 mins";
              } else {
                etaDisplay = `${remainingMinutes} mins`;
              }
            }

            return (
              <OrderCard
                key={order.orderId || order.mongoId}
                {...order}
                eta={etaDisplay}
                onSelect={onSelectOrder}
                onCancel={
                  normalizedStatus === "preparing" ? onCancel : undefined
                }
                onMarkReady={
                  normalizedStatus === "preparing" ? handleMarkReady : undefined
                }
                isMarkingReady={Boolean(
                  markingReadyOrderIds[order.mongoId || order.orderId],
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OrdersMain() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("new");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const contentRef = useRef(null);
  const filterBarRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);
  const mouseStartX = useRef(0);
  const mouseEndX = useRef(0);
  const isMouseDown = useRef(false);

  // Cancel-order sheet (preparing orders) + decline sheet (new orders)
  const [showCancelPopup, setShowCancelPopup] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [showRejectPopup, setShowRejectPopup] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [orderToReject, setOrderToReject] = useState(null);
  const [restaurantStatus, setRestaurantStatus] = useState({
    isActive: null,
    rejectionReason: null,
    onboarding: null,
    isLoading: true,
  });
  const [isReverifying, setIsReverifying] = useState(false);

  // Shared realtime (queue + ring owned by RestaurantLayout provider)
  const {
    refreshOrdersToken,
    bumpRefresh,
    queue: pendingNewOrders,
    queueLength,
    acceptQueuedOrder,
    rejectQueuedOrder,
    isMuted,
    toggleMute,
    restaurantName,
  } = useRestaurantRealtime();
  const ordersRefreshToken = refreshOrdersToken;
  const requestOrdersRefresh = bumpRefresh;

  // Event-driven refresh (replaces the 30s order poll): refetch on a new order/status event
  // or when the tab becomes visible again, via the shared refresh token.
  useOrderEventRefresh(requestOrdersRefresh);

  // Auto-switch to New Orders when something lands in the accept queue
  useEffect(() => {
    const onQueueUpdated = () => {
      setActiveFilter((current) => (current === "new" ? current : "new"));
    };
    window.addEventListener("restaurant:incoming_queue_updated", onQueueUpdated);
    return () =>
      window.removeEventListener(
        "restaurant:incoming_queue_updated",
        onQueueUpdated,
      );
  }, []);

  const rejectReasons = [
    "Restaurant is too busy",
    "Item not available",
    "Outside delivery area",
    "Kitchen closing soon",
    "Technical issue",
    "Other reason",
  ];

  const handleAcceptQueuedOrder = useCallback(
    async (orderToAccept, prepTime = 11) => {
      try {
        await acceptQueuedOrder(orderToAccept, prepTime);
        requestOrdersRefresh();
        setActiveFilter("preparing");
      } catch (error) {
        const errorMessage =
          error.response?.data?.message ||
          error.message ||
          "Failed to accept order. Please try again.";
        toast.error(errorMessage);
        throw error;
      }
    },
    [acceptQueuedOrder, requestOrdersRefresh],
  );

  const handleRejectQueuedClick = useCallback((order) => {
    setOrderToReject(order);
    setShowRejectPopup(true);
  }, []);

  const handleRejectConfirm = async () => {
    if (!rejectReason || !orderToReject) return;
    try {
      await rejectQueuedOrder(orderToReject, rejectReason);
      setShowRejectPopup(false);
      setOrderToReject(null);
      setRejectReason("");
      requestOrdersRefresh();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to reject order. Please try again.",
      );
    }
  };

  const handleRejectCancel = () => {
    setShowRejectPopup(false);
    setOrderToReject(null);
    setRejectReason("");
  };

  const handleQueuedOrderExpired = useCallback(() => {
    requestOrdersRefresh();
  }, [requestOrdersRefresh]);

  const handlePrintOrder = useCallback(
    async (orderToPrint) => {
      if (!orderToPrint) return;
      try {
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`Order ${orderToPrint.orderId || ""}`, 14, 16);
        const name =
          orderToPrint.restaurantName || restaurantName || "Restaurant";
        doc.text(String(name), 14, 24);
        const customer =
          orderToPrint.customerName ||
          orderToPrint.userId?.name ||
          orderToPrint.user?.name ||
          "";
        if (customer) doc.text(`Customer: ${customer}`, 14, 32);

        const items = Array.isArray(orderToPrint.items)
          ? orderToPrint.items
          : [];
        autoTable(doc, {
          startY: 40,
          head: [["Item", "Qty", "Price"]],
          body: items.map((item) => [
            item.name || "Item",
            String(item.quantity || 1),
            String(item.price || 0),
          ]),
        });
        doc.save(`order-${orderToPrint.orderId || "print"}.pdf`);
      } catch {
        toast.error("Unable to print order");
      }
    },
    [restaurantName],
  );

  // Fetch restaurant verification status
  useEffect(() => {
    const fetchRestaurantStatus = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        const restaurant =
          response?.data?.data?.restaurant || response?.data?.restaurant;
        if (restaurant) {
          setRestaurantStatus({
            isActive: restaurant.isActive,
            rejectionReason: restaurant.rejectionReason || null,
            onboarding: restaurant.onboarding || null,
            isLoading: false,
          });

          // Check if onboarding is incomplete and redirect if needed
          if (!isRestaurantOnboardingComplete(restaurant)) {
            // Onboarding is incomplete, redirect to onboarding page
            const incompleteStep = await checkOnboardingStatus();
            if (incompleteStep) {
              navigate(`/restaurant/onboarding?step=${incompleteStep}`, {
                replace: true,
              });
              return;
            }
          }
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (
          error.code !== "ERR_NETWORK" &&
          error.code !== "ECONNABORTED" &&
          !error.message?.includes("timeout")
        ) {
          debugError("Error fetching restaurant status:", error);
        }
        // Set loading to false so UI doesn't stay in loading state
        setRestaurantStatus((prev) => ({ ...prev, isLoading: false }));
      }
    };

    fetchRestaurantStatus();

    // Listen for restaurant profile updates
    const handleProfileRefresh = () => {
      fetchRestaurantStatus();
    };

    window.addEventListener("restaurantProfileRefresh", handleProfileRefresh);

    return () => {
      window.removeEventListener(
        "restaurantProfileRefresh",
        handleProfileRefresh,
      );
    };
  }, [navigate]);

  // Handle reverify (resubmit for approval)
  const handleReverify = async () => {
    try {
      setIsReverifying(true);
      await restaurantAPI.reverify();

      // Refresh restaurant status
      const response = await restaurantAPI.getCurrentRestaurant();
      const restaurant =
        response?.data?.data?.restaurant || response?.data?.restaurant;
      if (restaurant) {
        setRestaurantStatus({
          isActive: restaurant.isActive,
          rejectionReason: restaurant.rejectionReason || null,
          onboarding: restaurant.onboarding || null,
          isLoading: false,
        });
      }

      // Trigger profile refresh event
      window.dispatchEvent(new Event("restaurantProfileRefresh"));

      alert(
        "Restaurant reverified successfully! Verification will be done in 24 hours.",
      );
    } catch (error) {
      // Don't log network/timeout errors (backend might be down)
      if (
        error.code !== "ERR_NETWORK" &&
        error.code !== "ECONNABORTED" &&
        !error.message?.includes("timeout")
      ) {
        debugError("Error reverifying restaurant:", error);
      }

      // Handle 401 Unauthorized errors (token expired/invalid)
      if (error.response?.status === 401) {
        const errorMessage =
          error.response?.data?.message ||
          "Your session has expired. Please login again.";
        alert(errorMessage);
        // The axios interceptor should handle redirecting to login
        // But if it doesn't, we can manually redirect
        if (!error.response?.data?.message?.includes("inactive")) {
          // Only redirect if it's not an "inactive" error (which we handle differently)
          setTimeout(() => {
            window.location.href = "/restaurant/login";
          }, 1500);
        }
      } else {
        // Other errors (400, 500, etc.)
        const errorMessage =
          error.response?.data?.message ||
          "Failed to reverify restaurant. Please try again.";
        alert(errorMessage);
      }
    } finally {
      setIsReverifying(false);
    }
  };

  // Handle cancel order (for preparing orders)
  const handleCancelClick = useCallback((order) => {
    setOrderToCancel(order);
    setShowCancelPopup(true);
  }, []);

  const handleCancelConfirm = async () => {
    if (!cancelReason.trim() || !orderToCancel) return;

    try {
      const orderId = orderToCancel.mongoId || orderToCancel.orderId;
      await restaurantAPI.rejectOrder(orderId, cancelReason.trim());
      toast.success("Order cancelled successfully");
      requestOrdersRefresh();
      setShowCancelPopup(false);
      setOrderToCancel(null);
      setCancelReason("");
    } catch (error) {
      debugError("Error cancelling order:", error);
      toast.error(error.response?.data?.message || "Failed to cancel order");
    }
  };

  const handleCancelPopupClose = () => {
    setShowCancelPopup(false);
    setOrderToCancel(null);
    setCancelReason("");
  };

  // Handle swipe gestures with smooth animations
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
    isSwiping.current = false;
  };

  const handleTouchMove = (e) => {
    if (!isSwiping.current) {
      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);

      // Determine if this is a horizontal swipe
      if (deltaX > deltaY && deltaX > 10) {
        isSwiping.current = true;
      }
    }

    if (isSwiping.current) {
      touchEndX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping.current) {
      touchStartX.current = 0;
      touchEndX.current = 0;
      return;
    }

    const swipeDistance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;
    const swipeVelocity = Math.abs(swipeDistance);

    if (swipeVelocity > minSwipeDistance && !isTransitioning) {
      const currentIndex = filterTabs.findIndex(
        (tab) => tab.id === activeFilter,
      );
      let newIndex = currentIndex;

      if (swipeDistance > 0 && currentIndex < filterTabs.length - 1) {
        // Swipe left - go to next filter (right side)
        newIndex = currentIndex + 1;
      } else if (swipeDistance < 0 && currentIndex > 0) {
        // Swipe right - go to previous filter (left side)
        newIndex = currentIndex - 1;
      }

      if (newIndex !== currentIndex) {
        setIsTransitioning(true);

        // Smooth transition with animation
        setTimeout(() => {
          setActiveFilter(filterTabs[newIndex].id);
          scrollToFilter(newIndex);

          // Reset transition state after animation
          setTimeout(() => {
            setIsTransitioning(false);
          }, 300);
        }, 50);
      }
    }

    // Reset touch positions
    touchStartX.current = 0;
    touchEndX.current = 0;
    touchStartY.current = 0;
    isSwiping.current = false;
  };

  // Scroll filter bar to show active button with smooth animation
  const scrollToFilter = (index) => {
    if (filterBarRef.current) {
      const buttons = filterBarRef.current.querySelectorAll("button");
      if (buttons[index]) {
        const button = buttons[index];
        const container = filterBarRef.current;
        const buttonLeft = button.offsetLeft;
        const buttonWidth = button.offsetWidth;
        const containerWidth = container.offsetWidth;
        const scrollLeft = buttonLeft - containerWidth / 2 + buttonWidth / 2;

        container.scrollTo({
          left: scrollLeft,
          behavior: "smooth",
        });
      }
    }
  };

  // Scroll to active filter on change with smooth animation
  useEffect(() => {
    const index = filterTabs.findIndex((tab) => tab.id === activeFilter);
    if (index >= 0) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        scrollToFilter(index);
      });
    }
  }, [activeFilter]);

  const handleSelectOrder = useCallback((order) => {
    setSelectedOrder(order);
    // Bottom sheet / modal is mobile-only; desktop uses the right detail pane
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;
    setIsSheetOpen(!isDesktop);
  }, []);

  const handleCloseOrderModal = useCallback(() => {
    setIsSheetOpen(false);
    setSelectedOrder(null);
  }, []);

  const openSelectedOrderFullPage = useCallback(() => {
    if (!selectedOrder) return;
    const id = selectedOrder.mongoId || selectedOrder.orderId;
    if (!id) return;
    setIsSheetOpen(false);
    navigate(`/food/restaurant/orders/${id}`);
  }, [navigate, selectedOrder]);

  const renderContent = () => {
    switch (activeFilter) {
      case "new":
        return (
          <div className="pt-4 pb-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-base font-semibold text-black dark:text-white">
                New orders
              </h2>
              <span className="text-xs text-gray-500">
                {pendingNewOrders.length} pending
              </span>
            </div>
            {pendingNewOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                No new orders waiting for acceptance
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {pendingNewOrders.map((order) => (
                  <NewOrderAcceptCard
                    key={
                      order.orderMongoId ||
                      order.orderId ||
                      order._id ||
                      order.id
                    }
                    order={order}
                    isMuted={isMuted}
                    onToggleMute={toggleMute}
                    onPrint={handlePrintOrder}
                    onAccept={handleAcceptQueuedOrder}
                    onReject={handleRejectQueuedClick}
                    onExpired={handleQueuedOrderExpired}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        );
      case "all":
        return (
          <AllOrders
            onSelectOrder={handleSelectOrder}
            onCancel={handleCancelClick}
            refreshToken={ordersRefreshToken}
          />
        );
      case "preparing":
        return (
          <PreparingOrders
            onSelectOrder={handleSelectOrder}
            onCancel={handleCancelClick}
            refreshToken={ordersRefreshToken}
            onStatusChanged={requestOrdersRefresh}
          />
        );
      case "ready":
        return (
          <ReadyOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      case "out-for-delivery":
        return (
          <OutForDeliveryOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      case "scheduled":
        return (
          <ScheduledOrders
            onSelectOrder={handleSelectOrder}
            refreshToken={ordersRefreshToken}
          />
        );
      case "table-booking":
        return <TableBookings />;
      default:
        return <EmptyState />;
    }
  };

  return (
    <RestaurantPageShell title="Live Orders" flush maxWidth="full">
      {/* Top Filter Bar */}
      <div className="sticky top-0 z-40 pb-2 bg-gray-50 dark:bg-[#0a0a0a] px-3 sm:px-4">
        <div
          ref={filterBarRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide bg-transparent rounded-full px-3 py-2 mt-2"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
          }}>
          <style>{`
            .scrollbar-hide::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {filterTabs.map((tab, index) => {
            const isActive = activeFilter === tab.id;

            return (
              <motion.button
                key={tab.id}
                onClick={() => {
                  if (!isTransitioning) {
                    setIsTransitioning(true);
                    setActiveFilter(tab.id);
                    scrollToFilter(index);
                    setTimeout(() => setIsTransitioning(false), 300);
                  }
                }}
                className={`shrink-0 px-6 py-3.5 rounded-full font-medium text-sm whitespace-nowrap relative overflow-hidden ${isActive ? "text-white" : "bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-300"
                  }`}
                animate={{
                  scale: isActive ? 1.05 : 1,
                  opacity: isActive ? 1 : 0.7,
                }}
                transition={{
                  duration: 0.3,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
                whileTap={{ scale: 0.95 }}>
                {isActive && (
                  <motion.div
                    layoutId="activeFilterBackground"
                    className="absolute inset-0 bg-[#FF6A00] rounded-full -z-10"
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30,
                    }}
                  />
                )}
                <span className="relative z-10">
                  {tab.label}
                  {tab.id === "new" && queueLength > 0
                    ? ` (${queueLength})`
                    : ""}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Main layout: list + desktop right details pane */}
      <div className="flex flex-col md:flex-row md:gap-5 md:items-start px-4 pb-24 md:pb-6">
      <div
        ref={contentRef}
        className="flex-1 min-w-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => {
          mouseStartX.current = e.clientX;
          mouseEndX.current = e.clientX;
          isMouseDown.current = true;
          isSwiping.current = false;
        }}
        onMouseMove={(e) => {
          if (isMouseDown.current) {
            if (!isSwiping.current) {
              const deltaX = Math.abs(e.clientX - mouseStartX.current);
              if (deltaX > 10) {
                isSwiping.current = true;
              }
            }
            if (isSwiping.current) {
              mouseEndX.current = e.clientX;
            }
          }
        }}
        onMouseUp={() => {
          if (isMouseDown.current && isSwiping.current) {
            const swipeDistance = mouseStartX.current - mouseEndX.current;
            const minSwipeDistance = 50;

            if (
              Math.abs(swipeDistance) > minSwipeDistance &&
              !isTransitioning
            ) {
              const currentIndex = filterTabs.findIndex(
                (tab) => tab.id === activeFilter,
              );
              let newIndex = currentIndex;

              if (swipeDistance > 0 && currentIndex < filterTabs.length - 1) {
                newIndex = currentIndex + 1;
              } else if (swipeDistance < 0 && currentIndex > 0) {
                newIndex = currentIndex - 1;
              }

              if (newIndex !== currentIndex) {
                setIsTransitioning(true);
                setTimeout(() => {
                  setActiveFilter(filterTabs[newIndex].id);
                  scrollToFilter(newIndex);
                  setTimeout(() => setIsTransitioning(false), 300);
                }, 50);
              }
            }
          }

          isMouseDown.current = false;
          isSwiping.current = false;
          mouseStartX.current = 0;
          mouseEndX.current = 0;
        }}
        onMouseLeave={() => {
          isMouseDown.current = false;
          isSwiping.current = false;
        }}>
        {/* Verification Pending Card - Show if onboarding is complete (all 4 steps) and restaurant is not active */}
        {!restaurantStatus.isLoading &&
          !restaurantStatus.isActive &&
          restaurantStatus.onboarding?.completedSteps === 4 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className={`mt-4 mb-4 rounded-2xl shadow-sm px-6 py-4 ${restaurantStatus.rejectionReason
                ? "bg-white border border-red-200"
                : "bg-white border border-yellow-200"
                }`}>
              {restaurantStatus.rejectionReason ? (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-shrink-0 rounded-full p-2 bg-red-100">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-red-600 mb-2">
                        Denied Verification
                      </h3>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-red-800 mb-2">
                          Reason for Rejection:
                        </p>
                        <div className="text-xs text-red-700 space-y-1">
                          {restaurantStatus.rejectionReason
                            .split("\n")
                            .filter((line) => line.trim()).length > 1 ? (
                            <ul className="space-y-1 list-disc list-inside">
                              {restaurantStatus.rejectionReason
                                .split("\n")
                                .map(
                                  (point, index) =>
                                    point.trim() && (
                                      <li key={index}>{point.trim()}</li>
                                    ),
                                )}
                            </ul>
                          ) : (
                            <p className="text-red-700">
                              {restaurantStatus.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">
                    Please correct the above issues and click "Reverify" to
                    resubmit your request for approval.
                  </p>
                  <button
                    onClick={handleReverify}
                    disabled={isReverifying}
                    className="w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {isReverifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Reverify"
                    )}
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    Verification Done in 24 Hours
                  </h3>
                  <p className="text-sm text-gray-600">
                    Your account is under verification. You'll be notified once
                    approved.
                  </p>
                </>
              )}
            </motion.div>
          )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeFilter}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}>
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>

        {/* Desktop right details sidebar */}
        <aside className="hidden md:flex flex-col bg-white rounded-2xl border border-gray-100/80 shadow-sm overflow-hidden w-[360px] lg:w-[400px] shrink-0 sticky top-20 max-h-[calc(100vh-6.5rem)]">
          {selectedOrder ? (
            <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col min-h-0">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-black truncate">
                    Order #{selectedOrder.orderId}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {selectedOrder.customerName}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {selectedOrder.type || "Home Delivery"}
                    {selectedOrder.tableOrToken
                      ? ` • ${selectedOrder.tableOrToken}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
                      String(selectedOrder.status).toLowerCase() === "ready" ||
                      String(selectedOrder.status).toLowerCase() ===
                        "ready_for_pickup"
                        ? "border-green-500 text-green-600"
                        : "border-[#FF6A00]/40 text-[#FF6A00]"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        String(selectedOrder.status).toLowerCase() === "ready" ||
                        String(selectedOrder.status).toLowerCase() ===
                          "ready_for_pickup"
                          ? "bg-green-500"
                          : "bg-[#FF6A00]"
                      }`}
                    />
                    {String(selectedOrder.status || "")
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {selectedOrder.timePlaced}
                  </span>
                  {(String(selectedOrder.status).toLowerCase() === "preparing" ||
                    String(selectedOrder.status).toLowerCase() === "ready" ||
                    String(selectedOrder.status).toLowerCase() ===
                      "ready_for_pickup") &&
                    !selectedOrder.deliveryPartnerId && (
                      <div className="mt-1">
                        <ResendNotificationButton
                          orderId={selectedOrder.orderId}
                          mongoId={selectedOrder.mongoId}
                          onSuccess={() => {}}
                        />
                      </div>
                    )}
                </div>
              </div>

              <div className="border-t border-gray-100 my-3" />

              <div className="mb-3">
                <p className="text-[11px] font-semibold text-gray-700 mb-1">
                  Items
                </p>
                <p className="text-xs text-gray-800 leading-relaxed">
                  {selectedOrder.itemsSummary || "No items"}
                </p>
                {selectedOrder.amount != null && selectedOrder.amount > 0 ? (
                  <p className="text-sm font-black text-gray-900 mt-2">
                    {formatMoney(selectedOrder.amount)}
                  </p>
                ) : null}
              </div>

              {selectedOrder.note?.trim() ? (
                <div className="mb-3 rounded-xl border border-[#FF6A00]/20 bg-[#FFF3EB] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#FF6A00] mb-1">
                    Cooking Requests
                  </p>
                  <p className="text-xs text-gray-800 italic">
                    &ldquo;{selectedOrder.note.trim()}&rdquo;
                  </p>
                </div>
              ) : null}

              {selectedOrder.address ? (
                <div className="mb-3">
                  <p className="text-[11px] font-semibold text-gray-700 mb-1">
                    Delivery address
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {selectedOrder.address}
                  </p>
                </div>
              ) : null}

              <div className="flex items-center justify-between text-xs text-gray-500 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                {String(selectedOrder.status).toLowerCase() !== "ready" &&
                String(selectedOrder.status).toLowerCase() !==
                  "ready_for_pickup" &&
                selectedOrder.eta ? (
                  <span className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-gray-400">
                      ETA
                    </span>
                    <span className="font-bold text-gray-900 text-sm">
                      {selectedOrder.eta}
                    </span>
                  </span>
                ) : (
                  <span />
                )}
                {(() => {
                  const raw = selectedOrder.paymentMethod;
                  const normalized =
                    raw != null ? String(raw).toLowerCase().trim() : "";
                  const isCod = normalized === "cash" || normalized === "cod";
                  return (
                    <span className="flex flex-col gap-1 text-right ml-auto">
                      <span className="text-[10px] uppercase font-bold text-gray-400">
                        Payment
                      </span>
                      <span
                        className={`font-bold text-sm ${
                          isCod ? "text-amber-600" : "text-gray-900"
                        }`}
                      >
                        {isCod
                          ? "Cash on Delivery"
                          : selectedOrder.paymentLabel || "Paid online"}
                      </span>
                    </span>
                  );
                })()}
              </div>

              {selectedOrder.deliveryPartnerId &&
              typeof selectedOrder.deliveryPartnerId === "object" ? (
                <div className="mb-2 pt-3 border-t border-gray-100 mt-auto">
                  <p className="text-[11px] font-bold text-gray-700 mb-2">
                    Delivery Partner details
                  </p>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {selectedOrder.deliveryPartnerId.name}
                        </p>
                        {selectedOrder.deliveryPartnerId.rating > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span className="text-xs font-semibold text-gray-600">
                              {selectedOrder.deliveryPartnerId.rating}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-gray-200/60 pt-2 flex flex-col gap-2">
                      {selectedOrder.deliveryPartnerId.phone ===
                        "Hidden until photo upload" ||
                      !selectedOrder.deliveryPartnerId.phone ? (
                        <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200/50 rounded-xl p-2.5">
                          <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-[11px] font-bold text-amber-800">
                              Phone Hidden
                            </p>
                            <p className="text-[10px] text-amber-700 leading-tight mt-0.5">
                              Phone number will be shown once rider arrives at
                              your shop and uploads photo.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-green-50 border border-green-200/50 rounded-xl p-2.5">
                          <div className="flex items-start gap-1.5">
                            <Unlock className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[11px] font-bold text-green-800">
                                Phone Unlocked
                              </p>
                              <p className="text-xs font-bold text-gray-900 mt-0.5">
                                {selectedOrder.deliveryPartnerId.phone}
                              </p>
                            </div>
                          </div>
                          <a
                            href={`tel:${selectedOrder.deliveryPartnerId.phone}`}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-green-600 text-white text-[11px] font-bold rounded-lg shadow-sm hover:bg-green-700 transition-colors shrink-0"
                          >
                            <Phone className="w-3 h-3" />
                            Call
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={openSelectedOrderFullPage}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open full details
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center min-h-[320px]">
              <div className="w-20 h-20 bg-[#FFF3EB] rounded-full flex items-center justify-center mb-6 border border-[#FF6A00]/15">
                <Inbox className="w-8 h-8 text-[#FF6A00]/50" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                No order selected
              </h3>
              <p className="text-sm text-gray-500 max-w-[250px]">
                Select an order from the list to view detailed information,
                items, and status
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Cancel Order Popup */}
      <AnimatePresence>
        {showCancelPopup && orderToCancel && (
          <>
            <motion.div
              className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancelPopupClose}>
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">
                    Cancel Order {orderToCancel.orderId || "#Order"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Please provide a reason for cancelling this order
                  </p>
                </div>

                {/* Content */}
                <div className="px-4 py-4">
                  <div className="space-y-3">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setCancelReason(reason)}
                        className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${cancelReason === reason
                          ? "border-red-500 bg-red-50"
                          : "border-gray-200 hover:border-gray-300"
                          }`}>
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${cancelReason === reason
                              ? "border-red-500 bg-red-500"
                              : "border-gray-300"
                              }`}>
                            {cancelReason === reason && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <span
                            className={`text-sm font-medium ${cancelReason === reason
                              ? "text-red-700"
                              : "text-gray-700"
                              }`}>
                            {reason}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-4 border-t border-gray-200 flex gap-3">
                  <button
                    type="button"
                    onClick={handleCancelPopupClose}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50">
                    Keep Order
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelConfirm}
                    disabled={!cancelReason.trim()}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    Confirm Cancel
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Decline New Order Popup */}
      <AnimatePresence>
        {showRejectPopup && orderToReject && (
          <>
            <motion.div
              className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleRejectCancel}
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
                    Decline Order {orderToReject.orderId || "#Order"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Please provide a reason for declining this order
                  </p>
                </div>

                <div className="px-4 py-4">
                  <div className="space-y-3">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setRejectReason(reason)}
                        className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                          rejectReason === reason
                            ? "border-[#FF6A00] bg-[#FFF3EB]"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              rejectReason === reason
                                ? "border-[#FF6A00] bg-[#FF6A00]"
                                : "border-gray-300"
                            }`}
                          >
                            {rejectReason === reason && (
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <span
                            className={`text-sm font-medium ${
                              rejectReason === reason
                                ? "text-[#E85D04]"
                                : "text-gray-700"
                            }`}
                          >
                            {reason}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-4 py-4 border-t border-gray-200 flex gap-3">
                  <button
                    type="button"
                    onClick={handleRejectCancel}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50"
                  >
                    Keep Order
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectConfirm}
                    disabled={!rejectReason}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-[#FF6A00] text-white font-semibold text-sm hover:bg-[#E85D04] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirm Decline
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <LiveOrderDetailsModal
        open={isSheetOpen && !!selectedOrder}
        orderId={selectedOrder?.orderId}
        mongoId={selectedOrder?.mongoId}
        onClose={handleCloseOrderModal}
      />
    </RestaurantPageShell>
  );
}


// Compact live-order card — click opens details (sidebar on desktop, modal on mobile)
const OrderCard = memo(function OrderCard({
  orderId,
  mongoId,
  status,
  customerName,
  timePlaced,
  preparationTime,
  itemsSummary,
  items = [],
  amount = 0,
  type,
  tableOrToken,
  paymentMethod,
  paymentLabel,
  deliveryPartnerId,
  eta,
  note,
  address,
  customerPhone,
  onSelect,
  onCancel,
  onMarkReady,
  onUpdatePrepTime,
  isMarkingReady = false,
  isUpdatingPrep = false,
  isSelected = false,
}) {
  const normalizedStatus = String(status || "").toLowerCase();
  const isReady = normalizedStatus === "ready" || normalizedStatus === "ready_for_pickup";
  const isPreparing = normalizedStatus === "preparing";
  const statusLabel = String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const itemsLine =
    Array.isArray(items) && items.length
      ? items
          .slice(0, 2)
          .map((item) => `${item.quantity}× ${item.name}`)
          .join(", ") + (items.length > 2 ? ` +${items.length - 2}` : "")
      : itemsSummary || "—";

  const showActions =
    isPreparing && (onCancel || onMarkReady || onUpdatePrepTime);

  const handleCardSelect = () => {
    onSelect?.({
      orderId,
      mongoId,
      status,
      customerName,
      timePlaced,
      preparationTime,
      itemsSummary,
      items,
      amount,
      type,
      tableOrToken,
      paymentMethod,
      paymentLabel,
      deliveryPartnerId,
      eta,
      note,
      address,
      customerPhone,
    });
  };

  return (
    <div
      className={`w-full bg-white rounded-xl px-3.5 py-3 mb-2.5 border shadow-sm transition-all cursor-pointer ${
        isSelected
          ? "border-[#FF6A00] shadow-md ring-2 ring-[#FF6A00]/15"
          : "border-gray-100 hover:border-gray-200 hover:shadow-md"
      }`}
      onClick={handleCardSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-gray-900 tracking-tight">
              #{orderId}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                isReady
                  ? "bg-green-50 text-green-700"
                  : isPreparing
                    ? "bg-amber-50 text-amber-700"
                    : "bg-gray-100 text-gray-700"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isReady ? "bg-green-500" : isPreparing ? "bg-amber-500" : "bg-gray-500"
                }`}
              />
              {statusLabel}
            </span>
          </div>
          <p className="text-sm font-bold text-gray-900 mt-1 truncate">
            {customerName}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{itemsLine}</p>
        </div>
        <div className="flex flex-col items-end shrink-0 gap-0.5">
          <p className="text-sm font-extrabold tabular-nums text-gray-900">
            {formatMoney(amount)}
          </p>
          <p className="text-[10px] text-gray-400">{timePlaced}</p>
        </div>
      </div>

      {showActions ? (
        <div
          className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-gray-50"
          onClick={(e) => e.stopPropagation()}
        >
          {preparationTime != null && onUpdatePrepTime ? (
            <div className="flex items-center gap-1 bg-gray-50 p-0.5 rounded-lg border border-gray-100">
              <button
                type="button"
                disabled={isUpdatingPrep}
                onClick={() =>
                  onUpdatePrepTime({
                    orderId,
                    mongoId,
                    preparationTime: Math.max(1, Number(preparationTime) - 1),
                  })
                }
                className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm disabled:opacity-50"
                aria-label="Decrease prep time"
              >
                <Minus className="w-3 h-3 text-gray-700" />
              </button>
              <span className="text-xs font-black text-gray-900 w-9 text-center">
                {preparationTime}m
              </span>
              <button
                type="button"
                disabled={isUpdatingPrep}
                onClick={() =>
                  onUpdatePrepTime({
                    orderId,
                    mongoId,
                    preparationTime: Math.min(180, Number(preparationTime) + 1),
                  })
                }
                className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm disabled:opacity-50"
                aria-label="Increase prep time"
              >
                <Plus className="w-3 h-3 text-gray-700" />
              </button>
            </div>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-1.5">
            {onCancel ? (
              <button
                type="button"
                onClick={() => onCancel({ orderId, mongoId, customerName })}
                className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                title="Cancel Order"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
            {onMarkReady ? (
              <button
                type="button"
                onClick={() => onMarkReady({ orderId, mongoId, customerName })}
                disabled={isMarkingReady}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#FF6A00] hover:bg-red-600 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {isMarkingReady ? "Marking..." : "Mark Ready"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});

// Preparing Orders List
function PreparingOrders({
  onSelectOrder,
  onCancel,
  refreshToken = 0,
  onStatusChanged,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [markingReadyOrderIds, setMarkingReadyOrderIds] = useState({});
  const [updatingPrepOrderIds, setUpdatingPrepOrderIds] = useState({});

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'preparing' status on frontend
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const preparingOrders = response.data.data.orders.filter(
            (order) => normalizeLiveStatus(order) === "preparing",
          );

          const transformedOrders = preparingOrders.map((order) => {
            const base = transformOrderForList(order);
            const prepMins = Number(order.preparationTime);
            const initialETA =
              Number.isFinite(prepMins) && prepMins > 0
                ? prepMins
                : order.estimatedDeliveryTime || 30;
            const preparingTimestamp = order.tracking?.preparing?.timestamp
              ? new Date(order.tracking.preparing.timestamp)
              : new Date(order.createdAt || Date.now());

            return {
              ...base,
              status: "preparing",
              initialETA,
              preparationTime: initialETA,
              preparingTimestamp,
            };
          });

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        // Don't log network errors, 404, or 401 errors
        // 401 is handled by axios interceptor (token refresh/redirect)
        // 404 means no orders found (normal)
        // ERR_NETWORK means backend is down (expected in dev)
        if (
          error.code !== "ERR_NETWORK" &&
          error.response?.status !== 404 &&
          error.response?.status !== 401
        ) {
          debugError("Error fetching preparing orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    // Update countdown every second
    const countdownIntervalId = setInterval(() => {
      if (isMounted) {
        setCurrentTime(new Date());
      }
    }, 1000);

    return () => {
      isMounted = false;
      if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
      }
    };
  }, [refreshToken]); // Re-fetch only when parent requests it

  // Track which orders have been marked as ready to avoid duplicate API calls
  const markedReadyOrdersRef = useRef(new Set());

  // Auto-mark orders as ready when ETA reaches 0
  useEffect(() => {
    if (!currentTime || orders.length === 0) return;

    const checkAndMarkReady = async () => {
      for (const order of orders) {
        const orderKey = order.mongoId || order.orderId;

        // Skip if already marked as ready
        if (markedReadyOrdersRef.current.has(orderKey)) {
          continue;
        }

        // Calculate remaining ETA
        const elapsedMs = currentTime - order.preparingTimestamp;
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const remainingMinutes = Math.max(0, order.initialETA - elapsedMinutes);

        // If ETA has reached 0 (or slightly past), mark as ready
        if (remainingMinutes <= 0 && order.status === "preparing") {
          const elapsedSeconds = Math.floor(elapsedMs / 1000);
          const totalETASeconds = order.initialETA * 60;

          // Mark as ready when ETA time has elapsed (with 2 second buffer)
          if (elapsedSeconds >= totalETASeconds - 2) {
            try {
              debugLog(
                `?? Auto-marking order ${order.orderId} as ready (ETA reached 0)`,
              );
              markedReadyOrdersRef.current.add(orderKey); // Mark as processing
              await restaurantAPI.markOrderReady(
                order.mongoId || order.orderId,
              );
              debugLog(`? Order ${order.orderId} marked as ready`);
              onStatusChanged?.();
              // Order will be removed from preparing list on next fetch
            } catch (error) {
              const status = error.response?.status;
              const msg = (
                error.response?.data?.message ||
                error.message ||
                ""
              ).toLowerCase();
              // If 400 and message says order cannot be marked ready (e.g. already ready),
              // treat as idempotent - backend cron or another client already marked it.
              if (
                status === 400 &&
                (msg.includes("cannot be marked as ready") ||
                  msg.includes("current status"))
              ) {
                // Keep in markedReadyOrdersRef so we don't retry; order will disappear on next fetch
              } else {
                debugError(
                  `? Failed to auto-mark order ${order.orderId} as ready:`,
                  error,
                );
                markedReadyOrdersRef.current.delete(orderKey);
              }
              // Don't show error toast - it will retry on next check (for non-idempotent errors)
            }
          }
        }
      }
    };

    // Check every 2 seconds for orders that need to be marked ready
    const readyCheckInterval = setInterval(checkAndMarkReady, 2000);

    return () => {
      clearInterval(readyCheckInterval);
    };
  }, [currentTime, orders]);

  // Clear marked orders when orders list changes (orders moved to ready)
  useEffect(() => {
    const currentOrderKeys = new Set(orders.map((o) => o.mongoId || o.orderId));
    // Remove keys that are no longer in the preparing orders list
    for (const key of markedReadyOrdersRef.current) {
      if (!currentOrderKeys.has(key)) {
        markedReadyOrdersRef.current.delete(key);
      }
    }
  }, [orders]);

  const handleMarkReady = async ({ orderId, mongoId, customerName }) => {
    const orderKey = mongoId || orderId;
    if (!orderKey || markingReadyOrderIds[orderKey]) return;

    try {
      setMarkingReadyOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.markOrderReady(orderKey);
      setOrders((prev) =>
        prev.filter((order) => (order.mongoId || order.orderId) !== orderKey),
      );
      toast.success(
        `Order ${orderId} marked ready${customerName ? ` for ${customerName}` : ""}`,
      );
      onStatusChanged?.();
    } catch (error) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message || "Failed to mark order as ready";
      if (
        status === 400 &&
        String(message).toLowerCase().includes("current status")
      ) {
        setOrders((prev) =>
          prev.filter((order) => (order.mongoId || order.orderId) !== orderKey),
        );
        toast.success(`Order ${orderId} is already ready`);
        onStatusChanged?.();
      } else {
        toast.error(message);
      }
    } finally {
      setMarkingReadyOrderIds((prev) => {
        const next = { ...prev };
        delete next[orderKey];
        return next;
      });
    }
  };

  const handleUpdatePrepTime = async ({ orderId, mongoId, preparationTime }) => {
    const orderKey = mongoId || orderId;
    const nextPrep = Math.min(180, Math.max(1, Math.round(Number(preparationTime))));
    if (!orderKey || !Number.isFinite(nextPrep) || updatingPrepOrderIds[orderKey]) return;

    try {
      setUpdatingPrepOrderIds((prev) => ({ ...prev, [orderKey]: true }));
      await restaurantAPI.updatePreparationTime(orderKey, nextPrep);
      setOrders((prev) =>
        prev.map((order) =>
          (order.mongoId || order.orderId) === orderKey
            ? {
                ...order,
                preparationTime: nextPrep,
                initialETA: nextPrep,
              }
            : order,
        ),
      );
      toast.success(`Prep time updated to ${nextPrep} min`);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to update preparation time",
      );
    } finally {
      setUpdatingPrepOrderIds((prev) => {
        const next = { ...prev };
        delete next[orderKey];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Preparing orders
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Preparing orders</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No orders in preparation
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            // Calculate remaining ETA (countdown)
            const elapsedMs = currentTime - order.preparingTimestamp;
            const elapsedMinutes = Math.floor(elapsedMs / 60000);
            const remainingMinutes = Math.max(
              0,
              order.initialETA - elapsedMinutes,
            );

            // Format ETA display
            let etaDisplay = "";
            if (remainingMinutes <= 0) {
              const remainingSeconds = Math.max(
                0,
                Math.floor(order.initialETA * 60 - elapsedMs / 1000),
              );
              if (remainingSeconds > 0) {
                etaDisplay = `${remainingSeconds} secs`;
              } else {
                etaDisplay = "0 mins";
              }
            } else {
              etaDisplay = `${remainingMinutes} mins`;
            }

            return (
              <OrderCard
                key={order.orderId || order.mongoId}
                {...order}
                eta={etaDisplay}
                onSelect={onSelectOrder}
                onCancel={onCancel}
                onMarkReady={handleMarkReady}
                onUpdatePrepTime={handleUpdatePrepTime}
                isMarkingReady={Boolean(
                  markingReadyOrderIds[order.mongoId || order.orderId],
                )}
                isUpdatingPrep={Boolean(
                  updatingPrepOrderIds[order.mongoId || order.orderId],
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Ready Orders List
function ReadyOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'ready' status on frontend
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const readyOrders = response.data.data.orders.filter((order) => {
            const status = normalizeLiveStatus(order);
            return status === "ready";
          });

          const transformedOrders = readyOrders.map((order) => ({
            ...transformOrderForList(order),
            status: "ready",
            eta: null,
          }));

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        // Don't log network errors repeatedly - they're expected if backend is down
        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching ready orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]); // Re-fetch only when parent requests it

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Ready for pickup
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Ready for pickup</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No orders ready for pickup
        </div>
      ) : (
        <div>
          {orders.map((order) => (
            <OrderCard
              key={order.orderId || order.mongoId}
              {...order}
              onSelect={onSelectOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Out for Delivery Orders List
const OutForDeliveryOrders = ({ onSelectOrder, refreshToken = 0 }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'out_for_delivery' status on frontend
        const response = await restaurantAPI.getOrders();

        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const outForDeliveryOrders = response.data.data.orders.filter(
            (order) => {
              const status = normalizeLiveStatus(order);
              return status === "out_for_delivery" || status === "picked_up";
            },
          );

          const transformedOrders = outForDeliveryOrders.map((order) => ({
            ...transformOrderForList(order),
            status:
              normalizeLiveStatus(order) === "picked_up"
                ? "picked_up"
                : "out_for_delivery",
            eta: null,
          }));

          if (isMounted) {
            setOrders(transformedOrders);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
        }
      } catch (error) {
        if (!isMounted) return;

        // Don't log network errors repeatedly - they're expected if backend is down
        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching out for delivery orders:", error);
        }

        if (isMounted) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [refreshToken]); // Re-fetch only when parent requests it

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">
            Out for delivery
          </h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Out for delivery</h2>
        <span className="text-xs text-gray-500">{orders.length} active</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No orders out for delivery
        </div>
      ) : (
        <div>
          {orders.map((order) => (
            <OrderCard
              key={order.orderId || order.mongoId}
              {...order}
              onSelect={onSelectOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Scheduled Orders List
function ScheduledOrders({ onSelectOrder, refreshToken = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      try {
        const response = await restaurantAPI.getOrders();
        if (!isMounted) return;

        if (response.data?.success && response.data.data?.orders) {
          const scheduledOrders = response.data.data.orders.filter(
            (order) => order.status === "scheduled",
          );

          const transformedOrders = scheduledOrders.map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "scheduled",
            customerName: order.userId?.name || "Customer",
            type: order.deliveryFleet === "standard" ? "Home Delivery" : "Express Delivery",
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            scheduledAt: order.scheduledAt,
            itemsSummary: buildOrderItemsSummary(order.items),
            photoUrl: getOrderPreviewItem(order.items)?.image || null,
            photoAlt: getOrderPreviewItem(order.items)?.name || "Order",
            paymentMethod: order.paymentMethod || order.payment?.method || null,
          }));

          setOrders(transformedOrders);
        } else {
          setOrders([]);
        }
      } catch (error) {
        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          debugError("Error fetching scheduled orders:", error);
        }
        setOrders([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders();
    // Timer poll removed — this component refetches when `refreshToken` bumps, which the
    // parent drives from order events + tab visibility via useOrderEventRefresh.
    return () => {
      isMounted = false;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Scheduled orders</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Scheduled orders</h2>
        <span className="text-xs text-gray-500">{orders.length} total</span>
      </div>
      {orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200 flex flex-col items-center">
          <Calendar className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">Scheduled orders will appear here</p>
        </div>
      ) : (
        <div>
          {orders.map((order) => {
            const scheduledTime = new Date(order.scheduledAt).toLocaleString("en-US", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <OrderCard
                key={order.orderId || order.mongoId}
                {...order}
                timePlaced={`For: ${scheduledTime}`}
                onSelect={onSelectOrder}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Empty State Component
function EmptyState({ message = "Temporarily closed" }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12">
      {/* Store Illustration */}
      <div className="mb-6">
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          className="text-gray-300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          {/* Storefront */}
          <rect
            x="40"
            y="80"
            width="120"
            height="80"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          {/* Awning */}
          <path
            d="M30 80 L100 50 L170 80"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          {/* Doors */}
          <rect
            x="60"
            y="100"
            width="30"
            height="60"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          <rect
            x="110"
            y="100"
            width="30"
            height="60"
            stroke="currentColor"
            strokeWidth="2"
            fill="white"
          />
          {/* Laptop */}
          <rect
            x="70"
            y="140"
            width="40"
            height="25"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="white"
          />
          <text
            x="85"
            y="155"
            fontSize="8"
            fill="currentColor"
            textAnchor="middle">
            CLOSED
          </text>
          {/* Sign */}
          <rect
            x="80"
            y="170"
            width="40"
            height="20"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="white"
          />
        </svg>
      </div>

      {/* Message */}
      <h2 className="text-lg font-semibold text-gray-600 mb-4 text-center">
        {message}
      </h2>

      {/* View Status Button */}
      <button className="bg-black text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors">
        View status
      </button>
    </div>
  );
}
