import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import Badge from "@shared/components/ui/Badge";
import Input from "@shared/components/ui/Input";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineEye,
  HiOutlinePrinter,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineTruck,
  HiOutlineBanknotes,
  HiOutlineClock,
  HiOutlineArchiveBoxXMark,
  HiOutlineChartBar,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineInboxStack,
  HiOutlineMapPin,
  HiOutlinePhone,
  HiOutlineCalendarDays,
  HiOutlineArrowUturnLeft,
} from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Orders Page

import { MagicCard } from "@/components/ui/magic-card";
import { BlurFade } from "@/components/ui/blur-fade";
import ShimmerButton from "@/components/ui/shimmer-button";
import { sellerApi } from "../services/sellerApi";
import { useToast } from "@shared/components/ui/Toast";
import {
  getLegacyStatusFromOrder,
  getRefundStatusLabel,
  getRefundStatusVariant,
  getReturnStatusLabel,
  getReturnStatusVariant,
  buildReturnProgressSteps,
} from "@/shared/utils/orderStatus";
import { Loader2 } from "lucide-react";
import Pagination from "@shared/components/ui/Pagination";
import { DatePicker } from "@/components/ui/date-picker";
import {
  joinOrderRoom,
  onOrderStatusUpdate,
} from "@/core/services/orderSocket";

const AUTO_REFRESH_INTERVAL_MS = 30000;

const formatSellerAddress = (address) => {
  if (!address) return "";
  if (typeof address === "string") return address.trim();
  return [
    address.address || address.street || address.line1,
    address.landmark || address.additionalDetails || address.line2,
    address.city,
    address.state,
    address.zipCode || address.pincode,
  ]
    .filter(Boolean)
    .join(", ");
};

const resolveSellerReceivable = (order) => {
  const status = String(order?.status || order?.orderStatus || "").toLowerCase();
  const packing = Number(order?.pricing?.packingAmount || 0);
  if (status.includes("cancel")) {
    const receivable = Number(order?.pricing?.receivable);
    return Number.isFinite(receivable) ? Math.max(0, receivable) : 0;
  }

  const receivable = Number(order?.pricing?.receivable);
  if (Number.isFinite(receivable)) return receivable;

  const subtotal = Number(order?.pricing?.subtotal);
  const commission = Number(order?.pricing?.commission);
  if (Number.isFinite(subtotal) && Number.isFinite(commission)) {
    return Math.max(0, subtotal - commission + (Number.isFinite(packing) ? packing : 0));
  }

  const fallback = Number(order?.pricing?.total ?? order?.total);
  return Number.isFinite(fallback) ? fallback : 0;
};

const formatMoney = (value) =>
  `Rs ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const EMPTY_RETURN_SUMMARY = { hasReturn: false };
const RETURNED_TAB = "Returned";

/** Compact "Returned / Refunded" chip shown next to the fulfilment status. */
const ReturnBadge = ({ summary, className = "" }) => {
  if (!summary?.hasReturn) return null;
  return (
    <Badge
      variant={getReturnStatusVariant(summary.returnStatus)}
      className={cn(
        "text-[10px] font-black uppercase tracking-wider px-2 py-0",
        className,
      )}>
      {getReturnStatusLabel(summary.returnStatus)}
    </Badge>
  );
};

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("en-IN") : "—";

/**
 * Full return + refund breakdown for one order: lifecycle progress, returned
 * lines, and exactly how the refund changed what the seller receives.
 */
const ReturnDetailPanel = ({ order }) => {
  const summary = order?.returnSummary;
  if (!summary?.hasReturn) return null;

  const steps = buildReturnProgressSteps(summary.returnStatus);
  const receivable = Number(order?.pricing?.receivable || 0);
  const deducted = Number(summary.sellerDeductedAmount || 0);
  const netReceivable = Number(summary.netReceivable || receivable - deducted);
  const refundSettled = String(summary.refundStatus || "") === "completed";

  return (
    <div className="mt-6 rounded-3xl border border-rose-100 bg-rose-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-black text-rose-700 uppercase tracking-widest flex items-center gap-2">
          <HiOutlineArrowUturnLeft className="h-4 w-4" />
          Return &amp; Refund
        </h4>
        <div className="flex items-center gap-2">
          <Badge
            variant={getReturnStatusVariant(summary.returnStatus)}
            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5">
            {getReturnStatusLabel(summary.returnStatus)}
          </Badge>
          <Badge
            variant={getRefundStatusVariant(summary.refundStatus)}
            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5">
            {getRefundStatusLabel(summary.refundStatus)}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {steps.map((step) => (
          <span
            key={step.status}
            className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
              step.current
                ? "bg-rose-600 text-white"
                : step.reached
                  ? "bg-rose-200 text-rose-800"
                  : "bg-white text-slate-400 ring-1 ring-slate-200",
            )}>
            {step.label}
          </span>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
          <dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Refund to customer
          </dt>
          <dd className="mt-1 text-sm font-black text-slate-900">
            {formatMoney(summary.refundAmount)}
          </dd>
          <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
            via {summary.refundMethod || "—"}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
          <dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Deducted from you
          </dt>
          <dd
            className={cn(
              "mt-1 text-sm font-black",
              deducted > 0 ? "text-rose-600" : "text-slate-900",
            )}>
            {deducted > 0 ? `-${formatMoney(deducted)}` : formatMoney(0)}
          </dd>
          <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
            {refundSettled ? "Settled" : "Applies once refund clears"}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
          <dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Net for this order
          </dt>
          <dd className="mt-1 text-sm font-black text-primary">
            {formatMoney(netReceivable)}
          </dd>
          <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
            was {formatMoney(receivable)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
          <dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Pickup fee
          </dt>
          <dd className="mt-1 text-sm font-black text-emerald-600">
            {formatMoney(summary.pickupFeeAdminExpense)}
          </dd>
          <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
            Paid by platform
          </p>
        </div>
      </dl>

      <div className="mt-3 grid gap-1 text-[11px] font-semibold text-slate-600 sm:grid-cols-2">
        <p>Reason: {summary.returnReason || "—"}</p>
        <p>Requested: {formatDateTime(summary.requestedAt)}</p>
        <p>Returned to you: {formatDateTime(summary.returnedAt)}</p>
        <p>Refunded: {formatDateTime(summary.refundedAt)}</p>
        {summary.returnRejectedReason ? (
          <p className="sm:col-span-2 text-rose-600">
            Rejection reason: {summary.returnRejectedReason}
          </p>
        ) : null}
      </div>

      {order.returnItems?.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
            Returned items ({order.returnItems.length})
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {order.returnItems.map((line, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white p-2.5 ring-1 ring-slate-100">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {line.name || "Item"}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500">
                    {line.variantName ? `${line.variantName} · ` : ""}
                    {formatMoney(line.unitPrice)} × {line.quantity}
                  </p>
                </div>
                <p className="text-xs font-black text-rose-600 whitespace-nowrap">
                  -{formatMoney(line.refundAmount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {order.returnTimeline?.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
            Return history
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {[...order.returnTimeline].reverse().map((entry, idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-white p-2.5 ring-1 ring-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-black text-slate-900 uppercase">
                    {String(entry.action || entry.toStatus || "update").replace(
                      /_/g,
                      " ",
                    )}
                  </p>
                  <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
                    {formatDateTime(entry.at)}
                  </span>
                </div>
                <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
                  {entry.note || `By ${entry.byRole || "SYSTEM"}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const OrderMobileCard = React.memo(({
  order,
  handleViewDetails,
  getStatusColor,
  canResendDispatch,
  handleResendDispatch,
  handleStatusUpdate,
  setCancellingOrder,
  setCancelReasonPreset,
  setCancelReason,
  setIsCancelModalOpen,
  formatMoney
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm active:bg-slate-50/50">
      <div className="flex items-start justify-between gap-3">
        <div
          className="min-w-0 flex-1"
          onClick={() => handleViewDetails(order)}>
          <p className="text-xs font-black text-slate-900 truncate">
            #{order.id}
          </p>
          <div className="mt-1">
            <Badge
              variant={
                order.orderType === "mixed"
                  ? "secondary"
                  : "primary"
              }
              className="text-[10px] px-2 py-0 font-black uppercase tracking-wider">
              {order.orderType}
            </Badge>
          </div>
          <p className="text-xs font-semibold text-slate-600 mt-0.5 flex items-center gap-1">
            <HiOutlineCalendarDays className="h-3 w-3 shrink-0" />
            {order.date} • {order.time}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-7 w-7 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-white shrink-0">
              {order.customer.avatar}
            </div>
            <p className="text-xs font-bold text-slate-800 truncate">
              {order.customer.name}
            </p>
          </div>
          <p className="text-[11px] font-bold mt-2 text-slate-600">
            {order.deliveryPartner
              ? `${order.dispatchStatus === "accepted" ? "Rider accepted" : "Rider notified"}: ${order.deliveryPartner.name} ${order.deliveryPartner.phone === "Hidden until photo upload" ? "(🔒 Phone Hidden)" : ""}`
              : order.dispatchStatus === "assigned"
                ? "Closest rider notified, waiting for acceptance"
                : "No rider accepted yet"}
          </p>
          <p className="text-sm font-black text-slate-900 mt-2">
            {formatMoney(order.total)}
          </p>
          {order.returnSummary?.hasReturn &&
            order.returnSummary.sellerDeductedAmount > 0 && (
              <p className="text-[11px] font-bold text-rose-600 mt-0.5">
                -{formatMoney(order.returnSummary.sellerDeductedAmount)} refunded
                • net {formatMoney(order.returnSummary.netReceivable)}
              </p>
            )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge
            variant={getStatusColor(order.status)}
            className="text-[10px] font-black uppercase px-2 py-0">
            {order.status.replace(/_/g, " ")}
          </Badge>
          <ReturnBadge summary={order.returnSummary} />
          <button
            onClick={() => handleViewDetails(order)}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <HiOutlineEye className="h-4 w-4" />
          </button>
          {canResendDispatch(order) && (
            <button
              onClick={() => handleResendDispatch(order.id)}
              className="px-2.5 py-1.5 rounded-lg bg-primary/5 text-primary text-[10px] font-black uppercase tracking-wider">
              Resend Rider
            </button>
          )}
        </div>
      </div>
      {/* Accept / Cancel actions for Pending orders on mobile */}
      {order.status.toLowerCase() === "pending" && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
            handleStatusUpdate(order.id, "confirmed");
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-500/20 active:scale-95 transition-all">
            <HiOutlineCheck className="h-3.5 w-3.5" />
            Accept Order
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCancellingOrder(order);
              setCancelReasonPreset("Out of stock");
              setCancelReason("");
              setIsCancelModalOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-black uppercase tracking-wider active:scale-95 transition-all">
            <HiOutlineXMark className="h-3.5 w-3.5" />
            Reject
          </button>
        </div>
      )}
    </motion.div>
  );
});
OrderMobileCard.displayName = "OrderMobileCard";

const OrderRow = React.memo(({
  order,
  handleViewDetails,
  getStatusColor,
  canResendDispatch,
  handleResendDispatch,
  handleStatusUpdate,
  setCancellingOrder,
  setCancelReasonPreset,
  setCancelReason,
  setIsCancelModalOpen,
  formatMoney
}) => {
  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="hover:bg-slate-50/50 transition-colors group">
      <td className="px-4 lg:px-6 py-3 lg:py-4">
        <div>
          <span
            className="text-xs font-bold text-slate-900 group-hover:text-primary transition-colors cursor-pointer"
            onClick={() => handleViewDetails(order)}>
            #{order.id}
          </span>
          <div className="mt-1">
            <Badge
              variant={
                order.orderType === "mixed"
                  ? "secondary"
                  : "primary"
              }
              className="text-[10px] px-2 py-0 font-black uppercase tracking-wider">
              {order.orderType}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mt-1">
            <HiOutlineCalendarDays className="h-3 w-3" />
            {order.date} • {order.time}
          </div>
        </div>
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-white shadow-sm ring-2 ring-white">
            {order.customer.avatar}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">
              {order.customer.name}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4">
        {order.deliveryPartner ? (
          <div className="flex flex-col">
            <span className="text-xs font-bold text-emerald-700">
              {order.deliveryPartner.name}
            </span>
            <span className="text-xs font-semibold text-slate-600">
              {order.deliveryPartner.phone === "Hidden until photo upload"
                ? "🔒 Phone Hidden"
                : (order.deliveryPartner.phone ||
                  (order.dispatchStatus === "accepted"
                    ? "Accepted"
                    : "Notified"))}
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-700">
              {order.dispatchStatus === "assigned"
                ? "Waiting for acceptance"
                : "No driver yet"}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {order.dispatchStatus.replaceAll("_", " ")}
            </span>
          </div>
        )}
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-900">
            {formatMoney(order.total)}
          </span>
          <span className="text-xs font-semibold text-slate-600">
            {order.items.length} items
          </span>
          {order.returnSummary?.hasReturn &&
            order.returnSummary.sellerDeductedAmount > 0 && (
              <span className="text-[11px] font-bold text-rose-600 mt-0.5">
                -{formatMoney(order.returnSummary.sellerDeductedAmount)} refunded
              </span>
            )}
        </div>
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4">
        <div className="flex flex-col items-stretch gap-1">
          <Badge
            variant={getStatusColor(order.status)}
            className="w-full text-[10px] py-1.5 font-black uppercase tracking-widest justify-center border-none shadow-sm">
            {order.status.replace(/_/g, " ")}
          </Badge>
          {order.returnSummary?.hasReturn && (
            <Badge
              variant={getReturnStatusVariant(order.returnSummary.returnStatus)}
              className="w-full text-[10px] py-1 font-black uppercase tracking-wider justify-center border-none">
              {getReturnStatusLabel(order.returnSummary.returnStatus)}
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4 text-right">
        <div className="flex items-center justify-end space-x-1.5 flex-wrap">
          {canResendDispatch(order) && (
            <button
              onClick={() =>
                handleResendDispatch(order.id)
              }
              className="px-3 py-1.5 rounded-lg bg-primary/5 text-primary hover:bg-primary/10 transition-all text-[10px] font-black uppercase tracking-wider">
              Resend Rider
            </button>
          )}
          <button
            onClick={() => handleViewDetails(order)}
            className="p-1.5 hover:bg-white hover:text-primary rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100">
            <HiOutlineEye className="h-4 w-4" />
          </button>
          {order.status === "Pending" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusUpdate(
                    order.id,
                    "confirmed",
                  );
                }}
                className="p-1.5 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100">
                <HiOutlineCheck className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCancellingOrder(order);
                  setCancelReasonPreset("Out of stock");
                  setCancelReason("");
                  setIsCancelModalOpen(true);
                }}
                className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-all text-slate-600 shadow-sm ring-1 ring-slate-100">
                <HiOutlineXMark className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </td>
    </motion.tr>
  );
});
OrderRow.displayName = "OrderRow";

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isQuickViewModalOpen, setIsQuickViewModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [cancelReasonPreset, setCancelReasonPreset] = useState("Out of stock");
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const canCancelOrder = useCallback((order) => {
    if (!order) return false;
    const sellerStatus = String(order.status || "").toLowerCase();
    return ["pending", "confirmed", "packed", "ready_for_pickup"].includes(sellerStatus);
  }, []);
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const hasMountedRef = useRef(false);
  const statusHandlerRef = useRef(null);

  const getToken = () =>
    localStorage.getItem("auth_seller") ||
    localStorage.getItem("seller_accessToken") ||
    localStorage.getItem("accessToken") ||
    "";

  useEffect(() => {
    // Live updates for seller room + tracking room events.
    const off = onOrderStatusUpdate(getToken, (payload) => {
      const orderId = String(payload?.orderId || "").trim();
      if (!orderId) return;
      const nextWorkflow = String(
        payload?.sellerWorkflowStatus || payload?.workflowStatus || "",
      ).trim();

      setOrders((prev) =>
        (Array.isArray(prev) ? prev : []).map((order) => {
          if (String(order?.orderId || order?.id || "") === orderId) {
            const updatedOrder = {
              ...order,
              ...(payload?.sellerStatus
                ? { status: payload.sellerStatus }
                : {}),
              ...(payload?.orderStatus ? { status: payload.orderStatus } : {}),
              ...(payload?.sellerWorkflowStatus
                ? { workflowStatus: payload.sellerWorkflowStatus }
                : {}),
              ...(payload?.workflowStatus
                ? { workflowStatus: payload.workflowStatus }
                : {}),
              ...(payload?.deliveredAt
                ? { deliveredAt: payload.deliveredAt }
                : {}),
              ...(payload?.deliveryState
                ? { deliveryState: payload.deliveryState }
                : {}),
              ...(payload?.dispatchStatus
                ? { dispatchStatus: payload.dispatchStatus }
                : {}),
              ...(payload?.deliveryPartner !== undefined
                ? { deliveryPartner: payload.deliveryPartner }
                : {}),
            };
            return {
              ...updatedOrder,
              status: getLegacyStatusFromOrder(updatedOrder),
            };
          }
          return order;
        }),
      );

      setSelectedOrder((prev) => {
        if (!prev || String(prev?.orderId || prev?.id || "") !== orderId)
          return prev;
        const updatedOrder = {
          ...prev,
          ...(payload?.sellerStatus ? { status: payload.sellerStatus } : {}),
          ...(payload?.orderStatus ? { status: payload.orderStatus } : {}),
          ...(payload?.sellerWorkflowStatus
            ? { workflowStatus: payload.sellerWorkflowStatus }
            : {}),
          ...(payload?.workflowStatus
            ? { workflowStatus: payload.workflowStatus }
            : {}),
          ...(payload?.deliveredAt ? { deliveredAt: payload.deliveredAt } : {}),
          ...(payload?.deliveryState
            ? { deliveryState: payload.deliveryState }
            : {}),
          ...(payload?.dispatchStatus
            ? { dispatchStatus: payload.dispatchStatus }
            : {}),
          ...(payload?.deliveryPartner !== undefined
            ? { deliveryPartner: payload.deliveryPartner }
            : {}),
        };
        return {
          ...updatedOrder,
          status: getLegacyStatusFromOrder(updatedOrder),
        };
      });
    });
    statusHandlerRef.current = off;
    return () => {
      if (typeof statusHandlerRef.current === "function")
        statusHandlerRef.current();
      statusHandlerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh fallback (like Admin)
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (hasMountedRef.current) {
        fetchOrders(page, false);
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, startDate, endDate, activeTab]);

  // Reactive load: fetch orders when page or filters change
  useEffect(() => {
    fetchOrders(page, !hasMountedRef.current).finally(() => {
      hasMountedRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, startDate, endDate, activeTab]);



  const fetchOrders = async (requestedPage = 1, showPageLoader = false) => {
    try {
      if (showPageLoader) {
        setLoading(true);
      }
      const params = { page: requestedPage, limit: pageSize };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      // Ask the API to paginate over returned orders only, so the Returned tab
      // isn't limited to whatever returns happen to land on the current page.
      if (activeTab === RETURNED_TAB) params.returnsOnly = true;

      const response = await sellerApi.getOrders(params);

      // Backend returns handleResponse(..., { items, page, limit, total, totalPages })
      const payload = response.data.result || response.data.data || {};
      const rawOrders = Array.isArray(payload.orders)
        ? payload.orders
        : Array.isArray(payload.items)
          ? payload.items
          : response.data.results || [];

      const formattedOrders = (rawOrders || []).map((order) => ({
        id: order.orderId,
        _id: order._id,
        orderId: order.orderId,
        customer: {
          name: order.customer?.name || "Unknown",
          phone: order.customer?.phone || order.address?.phone || "",
          avatar: (order.customer?.name || "U").charAt(0),
        },
        items: (order.items || []).map((item) => ({
          name: item.name,
          price: item.price,
          qty: item.quantity,
          image: item.image,
          variantName: item.variantName || item.notes || "",
          packingAmount: Number(item.packingAmount || 0),
        })),
        total: resolveSellerReceivable(order),
        pricing: {
          subtotal: Number(order.pricing?.subtotal || 0),
          packingAmount: Number(order.pricing?.packingAmount || 0),
          commission: Number(order.pricing?.commission || 0),
          couponDiscount: Number(order.pricing?.couponDiscount || 0),
          couponSource: String(order.pricing?.couponSource || "").toLowerCase(),
          total: Number(order.pricing?.total || 0),
          receivable: resolveSellerReceivable(order),
          returnRefundDeducted: Number(order.pricing?.returnRefundDeducted || 0),
          netReceivable: Number(
            order.pricing?.netReceivable ?? resolveSellerReceivable(order),
          ),
        },
        returnSummary: order.returnSummary?.hasReturn
          ? {
            hasReturn: true,
            returnId: order.returnSummary.returnId || "",
            returnStatus: order.returnSummary.returnStatus || "",
            refundStatus: order.returnSummary.refundStatus || "",
            refundMethod: order.returnSummary.refundMethod || "",
            returnReason: order.returnSummary.returnReason || "",
            returnRejectedReason: order.returnSummary.returnRejectedReason || "",
            refundAmount: Number(order.returnSummary.refundAmount || 0),
            refundedAmount: Number(order.returnSummary.refundedAmount || 0),
            sellerDeductedAmount: Number(
              order.returnSummary.sellerDeductedAmount || 0,
            ),
            pickupFeeAdminExpense: Number(
              order.returnSummary.pickupFeeAdminExpense || 0,
            ),
            returnedItemCount: Number(order.returnSummary.returnedItemCount || 0),
            returnedQuantity: Number(order.returnSummary.returnedQuantity || 0),
            netReceivable: Number(order.returnSummary.netReceivable || 0),
            requestedAt: order.returnSummary.requestedAt || null,
            returnedAt: order.returnSummary.returnedAt || null,
            refundedAt: order.returnSummary.refundedAt || null,
          }
          : EMPTY_RETURN_SUMMARY,
        returnTimeline: Array.isArray(order.returnTimeline)
          ? order.returnTimeline
          : [],
        returnItems: Array.isArray(order.returnItems) ? order.returnItems : [],
        statusHistory: Array.isArray(order.statusHistory) ? order.statusHistory : [],
        orderStatus: order.orderStatus || order.status,
        orderType: String(order.orderType || "quick").toLowerCase(),
        status: getLegacyStatusFromOrder(order),
        workflowStatus: order.workflowStatus,
        workflowVersion: order.workflowVersion,
        date: order.createdAt
          ? new Date(order.createdAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
          : "",
        time: order.createdAt
          ? new Date(order.createdAt).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })
          : "",
        address: formatSellerAddress(order.address),
        location: order.address?.location || null,
        dispatchStatus: String(
          order.dispatchStatus || "unassigned",
        ).toLowerCase(),
        deliveryPartner: order.deliveryPartner
          ? {
            name: order.deliveryPartner.name || "Delivery Partner",
            phone: order.deliveryPartner.phone || "",
            vehicleType: order.deliveryPartner.vehicleType || "",
            vehicleNumber: order.deliveryPartner.vehicleNumber || "",
          }
          : null,
        payment:
          order.payment?.method === "cash" || order.payment?.method === "cod"
            ? "Cash on Delivery"
            : "Online Paid",
        cancellationReason: order.cancellationReason || "",
      }));

      setOrders(formattedOrders);

      // Join tracking rooms for real-time updates
      formattedOrders.forEach((o) => {
        if (o.id) joinOrderRoom(o.id, getToken);
      });
      if (typeof payload.total === "number") {
        setTotal(payload.total);
      } else if (typeof payload.pagination?.total === "number") {
        setTotal(payload.pagination.total);
      } else {
        setTotal(rawOrders.length);
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      showToast("Failed to fetch orders", "error");
    } finally {
      if (showPageLoader) {
        setLoading(false);
      }
    }
  };

  const tabs = [
    "All",
    "Pending",
    "Confirmed",
    "Packed",
    "Ready for Pickup",
    "Out for Delivery",
    "Delivered",
    RETURNED_TAB,
    "Cancelled",
  ];
  const todayStr = new Date().toISOString().split("T")[0];

  const safeOrders = useMemo(
    () => (Array.isArray(orders) ? orders : []),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    return safeOrders.filter((order) => {
      const matchesSearch =
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer.name.toLowerCase().includes(searchTerm.toLowerCase());

      if (activeTab === RETURNED_TAB) {
        return matchesSearch && Boolean(order.returnSummary?.hasReturn);
      }

      const statusToMatch =
        activeTab === "Out for Delivery"
          ? "out_for_delivery"
          : activeTab === "Ready for Pickup"
            ? "ready_for_pickup"
            : activeTab.toLowerCase();
      const matchesTab =
        activeTab === "All" || order.status.toLowerCase() === statusToMatch;
      return matchesSearch && matchesTab;
    });
  }, [safeOrders, searchTerm, activeTab]);

  const stats = useMemo(
    () => [
      {
        label: "Total Orders",
        value: safeOrders.length,
        icon: HiOutlineArchiveBoxXMark,
        color: "text-primary",
        bg: "bg-primary/5",
      },
      {
        label: "Pending",
        value: safeOrders.filter((o) => o.status.toLowerCase() === "pending")
          .length,
        icon: HiOutlineClock,
        color: "text-amber-600",
        bg: "bg-amber-50",
      },
      {
        label: "Confirmed",
        value: safeOrders.filter((o) => o.status.toLowerCase() === "confirmed")
          .length,
        icon: HiOutlineCheck,
        color: "text-primary",
        bg: "bg-primary/5",
      },
      {
        label: "Delivered",
        value: safeOrders.filter((o) => o.status.toLowerCase() === "delivered")
          .length,
        icon: HiOutlineCheck,
        color: "text-emerald-600",
        bg: "bg-emerald-50",
      },
      {
        label: "Returned",
        value: safeOrders.filter((o) => o.returnSummary?.hasReturn).length,
        icon: HiOutlineArrowUturnLeft,
        color: "text-rose-600",
        bg: "bg-rose-50",
      },
    ],
    [safeOrders],
  );

  const getStatusColor = useCallback((status) => {
    const s = status.toLowerCase();
    switch (s) {
      case "pending":
        return "warning";
      case "confirmed":
        return "info";
      case "packed":
        return "primary";
      case "ready_for_pickup":
        return "info";
      case "out_for_delivery":
        return "secondary";
      case "delivered":
        return "success";
      case "cancelled":
        return "error";
      default:
        return "secondary";
    }
  }, []);

  const handleViewDetails = useCallback((order) => {
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  }, []);

  const handleStatusUpdate = useCallback(async (orderId, newStatus) => {
    try {
      await sellerApi.updateOrderStatus(orderId, {
        status: newStatus.toLowerCase(),
      });
      const normalizedStatus = String(newStatus || "").toLowerCase();

      setOrders((prev) =>
        (Array.isArray(prev) ? prev : []).map((order) =>
          order.id === orderId
            ? {
              ...order,
              status: normalizedStatus,
            }
            : order,
        ),
      );

      setSelectedOrder((prev) => {
        if (prev && prev.id === orderId)
          return { ...prev, status: normalizedStatus };
        return prev;
      });

      const nextTabLabel =
        normalizedStatus === "out_for_delivery"
          ? "Out for Delivery"
          : normalizedStatus
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");

      setActiveTab((prevTab) => {
        if (prevTab !== "All" && prevTab !== nextTabLabel) {
          return nextTabLabel;
        }
        return prevTab;
      });

      showToast(`Order status updated to ${nextTabLabel}`, "success");
      fetchOrders(page, false);
    } catch (error) {
      console.error("Failed to update status:", error);
      showToast("Failed to update status", "error");
    }
  }, [page]);

  const handleResendDispatch = useCallback(async (orderId) => {
    try {
      const response = await sellerApi.resendOrderDispatch(orderId);
      const partner = response?.data?.result?.notifiedPartner;
      setSelectedOrder((prev) =>
        prev && prev.id === orderId
          ? {
            ...prev,
            dispatchStatus: "assigned",
            deliveryPartner: null,
          }
          : prev,
      );
      showToast(
        partner?.name
          ? `Sent again to ${partner.name}`
          : "Driver notification sent again",
        "success",
      );
      fetchOrders(page, false);
    } catch (error) {
      console.error("Failed to resend dispatch:", error);
      showToast(
        error?.response?.data?.message ||
        "Failed to resend driver notification",
        "error",
      );
    }
  }, [page]);

  const canResendDispatch = useCallback((order) => {
    const sellerStatus = String(order?.status || "").toLowerCase();
    const dispatchStatus = String(order?.dispatchStatus || "").toLowerCase();

    if (order?.deliveryPartner && dispatchStatus === "accepted") return false;
    if (["delivered", "cancelled"].includes(sellerStatus)) return false;

    return ["confirmed", "packed", "out_for_delivery"].includes(sellerStatus);
  }, []);

  const exportOrders = () => {
    const data = filteredOrders;
    if (!data.length) {
      showToast("No orders to export", "warning");
      return;
    }
    const escapeCsv = (v) => {
      const s = String(v ?? "").replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };
    const headers = [
      "Order ID",
      "Customer",
      "Phone",
      "Date",
      "Time",
      "Earnings",
      "Status",
      "Address",
      "Payment",
    ];
    const rows = data.map((o) => [
      o.id,
      o.customer?.name ?? "",
      o.customer?.phone ?? "",
      o.date,
      o.time,
      o.total,
      o.status,
      o.address ?? "",
      o.payment ?? "",
    ]);
    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${data.length} order(s) as CSV`, "success");
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-16">
      <BlurFade delay={0.1}>
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex flex-wrap items-center gap-2">
              Order Management
              <Badge
                variant="primary"
                className="text-[10px] px-1.5 py-0 font-bold tracking-wider uppercase bg-primary/10 text-primary">
                Real-time
              </Badge>
            </h1>
            <p className="text-slate-600 text-sm sm:text-base mt-0.5 font-medium">
              Process and track your customer orders with ease.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              onClick={exportOrders}
              variant="outline"
              className="flex items-center space-x-1.5 sm:space-x-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-slate-600 bg-white hover:bg-slate-50 border-slate-200">
              <HiOutlinePrinter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">EXPORT ALL</span>
            </Button>
            <Button
              onClick={() => setIsQuickViewModalOpen(true)}
              className="bg-primary px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-white shadow-xl flex items-center space-x-1.5 sm:space-x-2">
              <HiOutlineEye className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-0" />
              <span className="hidden sm:inline">QUICK VIEW</span>
            </Button>
          </div>
        </div>
      </BlurFade>

      {/* Quick Stats */}
      {loading ? (
        <div className="min-h-[400px] flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-slate-600 font-bold mt-4 uppercase tracking-widest text-xs">
            Fetching Active Orders...
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {stats.map((stat, i) => (
              <BlurFade key={i} delay={0.1 + i * 0.05}>
                <MagicCard
                  className="border-none shadow-sm ring-1 ring-slate-100 p-0 overflow-hidden group bg-white"
                  gradientColor={
                    stat.bg.includes("orange")
                      ? "#eef2ff"
                      : stat.bg.includes("amber")
                        ? "#fffbeb"
                        : stat.bg.includes("emerald")
                          ? "#ecfdf5"
                          : "#fff1f2"
                  }>
                  <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 relative z-10">
                    <div
                      className={cn(
                        "h-10 w-10 sm:h-12 sm:w-12 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 duration-300 shadow-sm shrink-0",
                        stat.bg,
                        stat.color,
                      )}>
                      <stat.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest truncate">
                        {stat.label}
                      </p>
                      <h4 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                        {stat.value}
                      </h4>
                    </div>
                  </div>
                </MagicCard>
              </BlurFade>
            ))}
          </div>

          {/* Main Content Area */}
          <BlurFade delay={0.3}>
            <Card className="border-none shadow-xl ring-1 ring-slate-100 rounded-lg bg-white overflow-visible">
              {/* Tabs */}
              <div className="border-b border-slate-100 bg-slate-50/30 overflow-x-auto scrollbar-hide">
                <div className="flex px-3 sm:px-6 items-center min-w-max">
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab);
                        setPage(1);
                      }}
                      className={cn(
                        "relative py-3 sm:py-4 px-2.5 sm:px-4 text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-300",
                        activeTab === tab
                          ? "text-primary scale-105"
                          : "text-slate-600 hover:text-slate-700",
                      )}>
                      {tab}
                      {activeTab === tab && (
                        <motion.div
                          layoutId="tab-underline"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full mx-2 sm:mx-4"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toolbox */}
              <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                <div className="relative flex-1 group w-full">
                  <HiOutlineMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-600 group-focus-within:text-primary transition-all" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by Order ID or Customer Name..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 border-none rounded-lg text-sm font-semibold text-slate-700 placeholder:text-slate-500 focus:ring-2 focus:ring-primary/5 transition-all outline-none"
                  />
                </div>
                <div className="flex gap-3 shrink-0 w-full lg:w-auto items-center justify-end flex-wrap">
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start">
                    <div className="w-full sm:w-32">
                      <DatePicker
                        value={startDate}
                        max={todayStr}
                        align="left"
                        onChange={(value) => {
                          if (!value) {
                            setStartDate("");
                            setPage(1);
                            return;
                          }
                          const today = new Date().toISOString().split("T")[0];
                          if (value > today) {
                            showToast(
                              "Start date cannot be in the future",
                              "error",
                            );
                            return;
                          }
                          if (endDate && value > endDate) {
                            showToast(
                              "Start date cannot be after end date",
                              "error",
                            );
                            return;
                          }
                          setPage(1);
                          setStartDate(value);
                        }}
                        placeholder="From date"
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 hidden sm:inline">
                      to
                    </span>
                    <div className="w-full sm:w-32 mt-2 sm:mt-0">
                      <DatePicker
                        value={endDate}
                        max={todayStr}
                        min={startDate || undefined}
                        align="right"
                        popupClassName="mt-4"
                        disabled={!startDate}
                        onChange={(value) => {
                          if (!value) {
                            setEndDate("");
                            setPage(1);
                            return;
                          }
                          const today = new Date().toISOString().split("T")[0];
                          if (value > today) {
                            showToast(
                              "End date cannot be in the future",
                              "error",
                            );
                            return;
                          }
                          if (startDate && value < startDate) {
                            showToast(
                              "End date cannot be before start date",
                              "error",
                            );
                            return;
                          }
                          setPage(1);
                          setEndDate(value);
                        }}
                        placeholder="To date"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                      setPage(1);
                    }}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-700">
                    Clear dates
                  </button>
                </div>
              </div>

              {/* Mobile: Card list */}
              <div className="md:hidden p-3 sm:p-4 space-y-3">
                {filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4">
                    <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-3">
                      <HiOutlineInboxStack className="h-7 w-7" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      No orders found
                    </h3>
                    <p className="text-xs text-slate-600 font-medium text-center mt-1">
                      Adjust filters or search.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4 rounded-xl text-xs"
                      onClick={() => {
                        setActiveTab("All");
                        setSearchTerm("");
                      }}>
                      CLEAR FILTERS
                    </Button>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {filteredOrders
                      .slice((page - 1) * pageSize, page * pageSize)
                      .map((order) => (
                        <OrderMobileCard
                          key={order.id}
                          order={order}
                          handleViewDetails={handleViewDetails}
                          getStatusColor={getStatusColor}
                          canResendDispatch={canResendDispatch}
                          handleResendDispatch={handleResendDispatch}
                          handleStatusUpdate={handleStatusUpdate}
                          setCancellingOrder={setCancellingOrder}
                          setCancelReasonPreset={setCancelReasonPreset}
                          setCancelReason={setCancelReason}
                          setIsCancelModalOpen={setIsCancelModalOpen}
                          formatMoney={formatMoney}
                        />
                      ))}
                  </AnimatePresence>
                )}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">
                        Order Details
                      </th>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">
                        Customer
                      </th>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">
                        Driver
                      </th>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">
                        Earnings
                      </th>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">
                        Status
                      </th>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 text-xs font-bold text-slate-600 uppercase tracking-widest text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <AnimatePresence mode="popLayout">
                      {filteredOrders
                        .slice((page - 1) * pageSize, page * pageSize)
                        .map((order) => (
                          <OrderRow
                            key={order.id}
                            order={order}
                            handleViewDetails={handleViewDetails}
                            getStatusColor={getStatusColor}
                            canResendDispatch={canResendDispatch}
                            handleResendDispatch={handleResendDispatch}
                            handleStatusUpdate={handleStatusUpdate}
                            setCancellingOrder={setCancellingOrder}
                            setCancelReasonPreset={setCancelReasonPreset}
                            setCancelReason={setCancelReason}
                            setIsCancelModalOpen={setIsCancelModalOpen}
                            formatMoney={formatMoney}
                          />
                        ))}
                    </AnimatePresence>
                  </tbody>
                </table>
                {filteredOrders.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 px-6">
                    <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                      <HiOutlineInboxStack className="h-8 w-8" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      No orders found
                    </h3>
                    <p className="text-xs text-slate-600 font-medium max-w-xs text-center mt-1">
                      We couldn't find any orders matching your current filters.
                      Try adjusting your search.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-6 rounded-xl text-xs"
                      onClick={() => {
                        setActiveTab("All");
                        setSearchTerm("");
                      }}>
                      CLEAR ALL FILTERS
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-3 sm:p-4 border-t border-slate-50 bg-slate-50/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-3 sm:px-6">
                <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest text-center sm:text-left">
                  Showing {filteredOrders.length} of {orders.length} Orders
                </p>
                <div className="flex gap-1 justify-center sm:justify-end">
                  <button
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 opacity-50 cursor-not-allowed"
                    aria-hidden="true"
                    disabled
                    tabIndex={-1}>
                    <HiOutlineChevronRight className="h-3.5 w-3.5 rotate-180" />
                  </button>
                  <button
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 opacity-50 cursor-not-allowed"
                    aria-hidden="true"
                    disabled
                    tabIndex={-1}>
                    <HiOutlineChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          </BlurFade>

          <div className="mt-3 sm:mt-4 px-2 sm:px-0">
            <Pagination
              page={page}
              totalPages={
                Math.ceil((total || filteredOrders.length) / pageSize) || 1
              }
              total={total || filteredOrders.length}
              pageSize={pageSize}
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
                fetchOrders(1, false);
              }}
              loading={loading}
            />
          </div>

          {/* Order Details Modal */}
          {/* ... (existing details modal) */}

          {/* Quick View Summary Modal */}
          <AnimatePresence>
            {isQuickViewModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
                  onClick={() => setIsQuickViewModalOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="w-full max-w-lg relative z-10 bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                  <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 sm:h-10 sm:w-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                        <HiOutlineChartBar className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">
                          Quick Snapshot
                        </h3>
                        <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest">
                          Today's Performance
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsQuickViewModalOpen(false)}
                      className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600 shrink-0">
                      <HiOutlineXMark className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                    {/* Summary Grid */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="p-3 sm:p-4 rounded-2xl bg-primary/5 border border-primary/10">
                        <p className="text-[10px] sm:text-xs font-bold text-primary/70 uppercase tracking-widest mb-1">
                          Total Revenue
                        </p>
                        <p className="text-base sm:text-xl font-black text-primary truncate">
                          ₹
                          {safeOrders
                            .reduce((acc, o) => acc + o.total, 0)
                            .toLocaleString()}
                        </p>
                      </div>
                      <div className="p-3 sm:p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                        <p className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">
                          Avg. Order Value
                        </p>
                        <p className="text-base sm:text-xl font-black text-emerald-700">
                          ₹
                          {safeOrders.length
                            ? (
                              safeOrders.reduce(
                                (acc, o) => acc + o.total,
                                0,
                              ) / safeOrders.length
                            ).toFixed(0)
                            : "0"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100">
                    <Button
                      onClick={() => {
                        setIsQuickViewModalOpen(false);
                        setActiveTab("Pending");
                      }}
                      className="w-full py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold">
                      VIEW ALL PENDING ORDERS
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isDetailsModalOpen && selectedOrder && (
              <div className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center p-3 sm:p-6 lg:p-12">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
                  onClick={() => setIsDetailsModalOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="w-full max-w-lg sm:max-w-2xl relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100">
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">
                        <HiOutlineTruck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900">
                          Order Details
                        </h3>
                        <div className="flex items-center space-x-2 mt-0.5">
                          <Badge
                            variant={getStatusColor(selectedOrder.status)}
                            className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0">
                            {selectedOrder.status}
                          </Badge>
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                            #{selectedOrder.id}
                          </span>
                        </div>
                        {(selectedOrder.date || selectedOrder.time) && (
                          <p className="text-[11px] font-bold text-slate-500 mt-1.5 flex items-center gap-1.5">
                            <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                            {selectedOrder.date}
                            {selectedOrder.time && (
                              <>
                                <span className="text-slate-300">•</span>
                                <HiOutlineClock className="h-3.5 w-3.5" />
                                {selectedOrder.time}
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setIsDetailsModalOpen(false)}
                      className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600">
                      <HiOutlineXMark className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto scrollbar-hide flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                      <div className="space-y-3 sm:space-y-4">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                              <HiOutlineMapPin className="h-3 w-3 text-primary" />{" "}
                              Delivery Address
                            </h4>
                            {selectedOrder.location &&
                              typeof selectedOrder.location.lat === "number" &&
                              typeof selectedOrder.location.lng ===
                              "number" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const { lat, lng } = selectedOrder.location;
                                    window.open(
                                      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                                      "_blank",
                                    );
                                  }}
                                  className="text-[10px] font-bold text-primary hover:underline">
                                  View on map
                                </button>
                              )}
                          </div>
                          <p className="text-xs font-bold text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                            {selectedOrder.address}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <HiOutlinePhone className="h-3 w-3 text-emerald-500" />{" "}
                            Customer Info
                          </h4>
                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                            <p className="text-xs font-bold text-slate-800">
                              {selectedOrder.customer.name}
                            </p>
                            {selectedOrder.customer?.phone ? (
                              <div className="flex items-center gap-2 mt-1.5">
                                <p className="text-xs font-semibold text-slate-700">
                                  {selectedOrder.customer.phone}
                                </p>
                                <a
                                  href={`tel:${selectedOrder.customer.phone}`}
                                  className="text-[11px] text-primary hover:underline font-bold"
                                >
                                  Call
                                </a>
                              </div>
                            ) : (
                              <p className="text-[11px] font-semibold text-slate-400 mt-1">
                                Phone not available
                              </p>
                            )}
                          </div>
                        </div>
                        {String(selectedOrder.status || "").toLowerCase().includes("cancel") &&
                          selectedOrder.cancellationReason ? (
                          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 sm:p-4">
                            <h4 className="text-xs font-black text-rose-500 uppercase tracking-widest mb-2">
                              Cancellation Reason
                            </h4>
                            <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                              {selectedOrder.cancellationReason}
                            </p>
                          </div>
                        ) : null}
                        <div>
                          <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <HiOutlineTruck className="h-3 w-3 text-primary" />{" "}
                            Driver Status
                          </h4>
                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
                            {selectedOrder.deliveryPartner ? (
                              <>
                                <p className="text-xs font-bold text-slate-800">
                                  {selectedOrder.deliveryPartner.name}
                                </p>
                                {selectedOrder.deliveryPartner.phone === "Hidden until photo upload" ? (
                                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200/50 rounded-xl flex flex-col gap-1 text-[10px] text-amber-800 font-medium">
                                    <span className="font-bold flex items-center gap-1">🔒 Phone Hidden</span>
                                    <span>Rider phone will be visible once they arrive at your shop and upload the photo.</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 mt-1">
                                    <p className="text-xs font-semibold text-slate-700">
                                      {selectedOrder.deliveryPartner.phone ||
                                        (selectedOrder.dispatchStatus === "accepted"
                                          ? "Accepted rider"
                                          : "Notified rider")}
                                    </p>
                                    {selectedOrder.deliveryPartner.phone && (
                                      <a
                                        href={`tel:${selectedOrder.deliveryPartner.phone}`}
                                        className="text-xs text-primary hover:underline font-bold flex items-center gap-0.5 ml-1"
                                      >
                                        Call Rider
                                      </a>
                                    )}
                                  </div>
                                )}
                                {selectedOrder.deliveryPartner.vehicleType && (
                                  <p className="text-[11px] font-semibold text-slate-500 mt-1">
                                    {selectedOrder.deliveryPartner.vehicleType}{" "}
                                    {selectedOrder.deliveryPartner.vehicleNumber
                                      ? `• ${selectedOrder.deliveryPartner.vehicleNumber}`
                                      : ""}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-xs font-bold text-slate-600">
                                {selectedOrder.dispatchStatus === "assigned"
                                  ? "Closest rider notified. Waiting for acceptance."
                                  : "No rider has accepted yet."}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3 sm:space-y-4">
                        <div className="bg-primary/5 p-3 sm:p-4 rounded-3xl border border-primary/10">
                          <h4 className="text-xs font-black text-primary uppercase tracking-widest mb-3">
                            Order Summary
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="font-bold text-slate-600">
                                Items subtotal
                              </span>
                              <span className="font-black text-slate-900">
                                {formatMoney(selectedOrder.pricing?.subtotal)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="font-bold text-slate-600">
                                Packing fee
                              </span>
                              <span className="font-black text-emerald-600">
                                {formatMoney(selectedOrder.pricing?.packingAmount)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="font-bold text-slate-600">
                                Commission
                              </span>
                              <span className="font-black text-rose-600">
                                -{formatMoney(selectedOrder.pricing?.commission)}
                              </span>
                            </div>
                            {String(selectedOrder.pricing?.couponSource || "").toLowerCase() === "seller" &&
                            Number(selectedOrder.pricing?.couponDiscount || 0) > 0 ? (
                              <div className="flex justify-between text-xs">
                                <span className="font-bold text-slate-600">
                                  Seller coupon
                                </span>
                                <span className="font-black text-amber-600">
                                  -{formatMoney(selectedOrder.pricing?.couponDiscount)}
                                </span>
                              </div>
                            ) : null}
                            {Number(selectedOrder.returnSummary?.sellerDeductedAmount || 0) > 0 ? (
                              <div className="flex justify-between text-xs">
                                <span className="font-bold text-slate-600">
                                  Return refund recovered
                                </span>
                                <span className="font-black text-rose-600">
                                  -{formatMoney(selectedOrder.returnSummary.sellerDeductedAmount)}
                                </span>
                              </div>
                            ) : null}
                            <div className="h-px bg-primary/10 my-2" />
                            <div className="flex justify-between text-sm items-start gap-3">
                              <div>
                                <span className="font-black text-slate-900 block">
                                  Seller receivable
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {String(selectedOrder.status || "").toLowerCase().includes("cancel")
                                    ? Number(selectedOrder.pricing?.receivable || selectedOrder.total || 0) > 0
                                      ? "You'll receive packing fee only (prepaid cancel)"
                                      : "Cancelled — nothing to receive"
                                    : Number(selectedOrder.returnSummary?.sellerDeductedAmount || 0) > 0
                                      ? "Amount you'll receive after the return refund"
                                      : "Amount you'll receive for this order"}
                                </span>
                              </div>
                              <span className="font-black text-primary whitespace-nowrap">
                                {formatMoney(
                                  selectedOrder.pricing?.netReceivable ??
                                    selectedOrder.pricing?.receivable ??
                                    selectedOrder.total,
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-slate-900 p-3 sm:p-4 rounded-3xl text-white shadow-xl shadow-primary/20">
                          <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2">
                            Payment Status
                          </h4>
                          <div className="flex items-center gap-2">
                            <HiOutlineBanknotes className="h-5 w-5 text-emerald-400" />
                            <span className="text-xs font-bold tracking-tight">
                              {selectedOrder.payment}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3 sm:mb-4">
                      Items Ordered ({selectedOrder.items.length})
                    </h4>
                    <div className="space-y-3 max-h-52 sm:max-h-64 overflow-y-auto pr-1">
                      {selectedOrder.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-white ring-1 ring-slate-100 rounded-2xl group hover:shadow-md transition-all">
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900">
                                {item.name}
                              </p>
                              {item.variantName ? (
                                <p className="text-[10px] font-semibold text-primary mt-0.5">
                                  {item.variantName}
                                </p>
                              ) : null}
                              <p className="text-xs font-semibold text-slate-600 mt-0.5">
                                ₹{Number(item.price || 0).toFixed(2)} × {item.qty}
                                {Number(item.packingAmount) > 0
                                  ? ` · Packing ₹${Number(item.packingAmount).toFixed(2)}`
                                  : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-slate-900">
                              ₹{(Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {selectedOrder.returnSummary?.hasReturn ? (
                      <ReturnDetailPanel order={selectedOrder} />
                    ) : null}

                    {Array.isArray(selectedOrder.statusHistory) && selectedOrder.statusHistory.length > 0 ? (
                      <>
                        <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3 sm:mb-4 mt-6">
                          Status History
                        </h4>
                        <div className="space-y-3 max-h-40 overflow-y-auto pr-1">
                          {[...selectedOrder.statusHistory].reverse().map((entry, idx) => (
                            <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-black text-slate-900 uppercase">
                                  {String(entry?.to || entry?.status || "update").replace(/_/g, " ")}
                                </p>
                                <span className="text-[10px] font-bold text-slate-400">
                                  {entry?.at ? new Date(entry.at).toLocaleString("en-IN") : ""}
                                </span>
                              </div>
                              <p className="text-[11px] font-semibold text-slate-500 mt-1">
                                {entry?.note || `By ${entry?.byRole || "SYSTEM"}`}
                              </p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>

                  {/* Modal Footer */}
                  <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center justify-end">
                    <div className="flex gap-2 items-center flex-wrap">
                      {/* Accept button — visible only when order is still Pending */}
                      {selectedOrder.status.toLowerCase() === "pending" && (
                        <button
                          onClick={() => {
                          handleStatusUpdate(selectedOrder.id, "confirmed");
                            setIsDetailsModalOpen(false);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20 active:scale-95">
                          <HiOutlineCheck className="h-3.5 w-3.5" />
                          Accept Order
                        </button>
                      )}
                      {canCancelOrder(selectedOrder) && (
                        <button
                          onClick={() => {
                            setCancellingOrder(selectedOrder);
                            setCancelReasonPreset("Out of stock");
                            setCancelReason("");
                            setIsCancelModalOpen(true);
                          }}
                          className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-rose-700 bg-rose-50 hover:bg-rose-100 transition-all">
                          Cancel Order
                        </button>
                      )}
                      {canResendDispatch(selectedOrder) && (
                        <button
                          onClick={() => handleResendDispatch(selectedOrder.id)}
                          className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-primary bg-primary/5 hover:bg-primary/10 transition-all">
                          Resend Rider
                        </button>
                      )}
                      <button
                        onClick={() => setIsDetailsModalOpen(false)}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all">
                        CLOSE
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── Cancel Order Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {isCancelModalOpen && cancellingOrder && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsCancelModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md relative z-10 bg-white rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col"
            >
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                  <HiOutlineXMark className="h-5 w-5" />
                </span>
                Cancel Order #{cancellingOrder.id}
              </h3>
              <p className="text-xs text-slate-600 font-medium mt-2 leading-relaxed">
                Please select a reason for cancelling this order. This reason will be shared with the customer and recorded in the system.
              </p>

              {/* Presets */}
              <div className="mt-4 space-y-2">
                {[
                  "Out of stock",
                  "Shop closed / busy",
                  "Incorrect item pricing or weight",
                  "Unable to fulfill due to delivery issues",
                  "Other"
                ].map((reason) => (
                  <label
                    key={reason}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-2xl border text-xs font-bold cursor-pointer transition-all hover:bg-slate-50",
                      cancelReasonPreset === reason
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-slate-100 text-slate-700 bg-white"
                    )}
                  >
                    <input
                      type="radio"
                      name="cancelPreset"
                      checked={cancelReasonPreset === reason}
                      onChange={() => setCancelReasonPreset(reason)}
                      className="accent-primary h-4 w-4"
                    />
                    {reason}
                  </label>
                ))}
              </div>

              {/* Custom Textarea */}
              {cancelReasonPreset === "Other" && (
                <div className="mt-4">
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Describe your reason in detail..."
                    rows={3}
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-semibold text-slate-700 placeholder:text-slate-500 focus:ring-2 focus:ring-primary/5 outline-none transition-all resize-none"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  DISMISS
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const finalReason = cancelReasonPreset === "Other" ? cancelReason.trim() : cancelReasonPreset;
                    if (!finalReason) {
                      showToast("Please provide a reason", "error");
                      return;
                    }
                    try {
                      await sellerApi.updateOrderStatus(cancellingOrder.id, {
                        status: "cancelled",
                        reason: finalReason
                      });
                      showToast(`Order #${cancellingOrder.id} has been cancelled`, "success");
                      setIsCancelModalOpen(false);
                      setIsDetailsModalOpen(false);
                      fetchOrders(page, false);
                    } catch (error) {
                      showToast(error.response?.data?.message || "Failed to cancel order", "error");
                    }
                  }}
                  className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/10 active:scale-95"
                >
                  CONFIRM CANCELLATION
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Orders;
