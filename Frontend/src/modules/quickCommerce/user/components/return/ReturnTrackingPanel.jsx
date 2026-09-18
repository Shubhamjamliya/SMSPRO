import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Package, ChevronRight, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import ReturnProgressTracker from "./ReturnProgressTracker";
import ReturnPickupOtpDisplay from "./ReturnPickupOtpDisplay";
import ReturnItemsList from "@shared/components/returns/ReturnItemsList";
import { customerApi } from "../../services/customerApi";
import { mapReturnStatusLabel, RETURN_STATUS, formatRefundStatusLabel } from "@/shared/utils/returnStatus";
import { Truck } from "lucide-react";

const ACTIVE_RETURN_STATUSES = new Set([
  RETURN_STATUS.REQUESTED,
  RETURN_STATUS.APPROVED,
  RETURN_STATUS.PICKUP_ASSIGNED,
  RETURN_STATUS.IN_TRANSIT,
  RETURN_STATUS.RETURNED,
]);

const TERMINAL_RETURN_STATUSES = new Set([
  RETURN_STATUS.REJECTED,
  RETURN_STATUS.CANCELLED,
  RETURN_STATUS.REFUND_COMPLETED,
]);

const ACTIVE_RETURN_POLL_MS = 30_000;

const buildReturnFingerprint = (items = []) =>
  items
    .map((item) => `${item.returnId || item.id}:${item.returnStatus}:${item.refundStatus || ""}`)
    .join("|");

const ReturnTrackingPanel = ({ orderId, onRefresh }) => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const onRefreshRef = useRef(onRefresh);
  const lastFingerprintRef = useRef("");
  const lastEligibilityRef = useRef("");

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const notifyParent = useCallback((items, payload) => {
    const fingerprint = buildReturnFingerprint(items);
    const eligibility = payload?.returnEligibility || null;
    const eligibilityKey = eligibility
      ? JSON.stringify({
          canReturn: eligibility.canReturn,
          returnExpiryAt: eligibility.returnExpiryAt,
          returnWindowExpired: eligibility.returnWindowExpired,
          remainingSeconds: eligibility.remainingSeconds,
        })
      : "";

    if (
      fingerprint === lastFingerprintRef.current &&
      eligibilityKey === lastEligibilityRef.current
    ) {
      return;
    }

    lastFingerprintRef.current = fingerprint;
    lastEligibilityRef.current = eligibilityKey;
    onRefreshRef.current?.(items, payload);
  }, []);

  const loadReturns = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!orderId) return [];
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await customerApi.getReturnStatus(orderId, { forceRefresh: force });
      const payload = res?.data?.data || res?.data?.result || {};
      const items = Array.isArray(payload?.returns) ? payload.returns : [];
      setReturns(items);
      notifyParent(items, payload);
      return items;
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || "Failed to load return status");
      }
      return [];
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, notifyParent]);

  useEffect(() => {
    lastFingerprintRef.current = "";
    lastEligibilityRef.current = "";
    const timer = window.setTimeout(() => {
      void loadReturns({ silent: false, force: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [orderId, loadReturns]);

  useEffect(() => {
    const hasActiveReturn = returns.some((item) => ACTIVE_RETURN_STATUSES.has(item.returnStatus));
    if (!hasActiveReturn) return undefined;

    const poller = window.setInterval(() => {
      if (!document.hidden) {
        void loadReturns({ silent: true, force: false });
      }
    }, ACTIVE_RETURN_POLL_MS);

    return () => window.clearInterval(poller);
  }, [returns, loadReturns]);

  const handleCancel = async (ret) => {
    if (!window.confirm("Cancel this return request?")) return;
    const cancelKey = String(ret.returnId || ret.id || "");
    setCancellingId(cancelKey);
    try {
      await customerApi.cancelReturnRequest(orderId, {
        reason: "Cancelled by customer",
      });
      toast.success("Return request cancelled");
      await loadReturns({ silent: true, force: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to cancel return");
    } finally {
      setCancellingId("");
    }
  };

  if (loading) return null;

  const visibleReturns = returns.filter(
    (item) => ACTIVE_RETURN_STATUSES.has(item.returnStatus) || TERMINAL_RETURN_STATUSES.has(item.returnStatus),
  );
  if (!visibleReturns.length) return null;

  return (
    <div className="space-y-4">
      {visibleReturns.map((ret) => {
        const isTerminal = TERMINAL_RETURN_STATUSES.has(ret.returnStatus);
        const showLiveTracking = !isTerminal && [
          RETURN_STATUS.PICKUP_ASSIGNED,
          RETURN_STATUS.IN_TRANSIT,
        ].includes(ret.returnStatus);
        const canCancel = !isTerminal && [
          RETURN_STATUS.REQUESTED,
          RETURN_STATUS.APPROVED,
          RETURN_STATUS.PICKUP_ASSIGNED,
        ].includes(ret.returnStatus);
        const cancelKey = String(ret.returnId || ret.id || "");

        return (
          <motion.div
            key={ret.returnId || ret.id}
            className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Package className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {isTerminal ? "Return update" : "Return in progress"}
                  </p>
                  <p className="text-xs text-slate-500">{mapReturnStatusLabel(ret.returnStatus)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => loadReturns({ silent: true, force: true })}
                disabled={refreshing}
                className="p-2 rounded-lg hover:bg-slate-50 text-slate-500"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <ReturnProgressTracker returnDoc={ret} />

              {Array.isArray(ret.returnItems) && ret.returnItems.length > 0 && (
                <div className="rounded-xl border border-slate-100 bg-white p-3 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Returned items</p>
                  <ReturnItemsList items={ret.returnItems} showRefund={false} />
                </div>
              )}

              <ReturnPickupOtpDisplay
                orderId={orderId}
                returnDoc={ret}
                sellerId={ret.sellerId}
              />

              {showLiveTracking && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900">Live return pickup</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Your return pickup rider is en route. Share the pickup OTP when they arrive.
                    </p>
                    {ret.dispatch?.acceptedAt ||
                    ['assigned', 'accepted', 'completed'].includes(
                      String(ret.dispatch?.status || '').toLowerCase(),
                    ) ? (
                      <p className="text-xs text-amber-800 font-semibold mt-2">Rider assigned</p>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                <p>
                  Refund method:{" "}
                  <span className="font-bold uppercase">{ret.refundMethod || "—"}</span>
                </p>
                <p>
                  Refund amount:{" "}
                  <span className="font-bold">₹{Number(ret.returnRefundAmount || 0).toFixed(2)}</span>
                </p>
                {ret.refundStatus && ret.refundStatus !== "none" && (
                  <p>
                    Refund status:{" "}
                    <span className="font-bold">
                      {ret.refundStatusLabel || formatRefundStatusLabel(ret.refundStatus)}
                    </span>
                  </p>
                )}
              </div>

              {canCancel && (
                <button
                  type="button"
                  onClick={() => handleCancel(ret)}
                  disabled={Boolean(cancellingId)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-200 text-rose-600 text-sm font-bold hover:bg-rose-50 disabled:opacity-60"
                >
                  <XCircle className="w-4 h-4" />
                  {cancellingId === cancelKey ? "Cancelling..." : "Cancel return request"}
                </button>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

/**
 * Shown whenever at least one line is still returnable.
 *
 * An in-flight return on one item must not hide the CTA — other items with a
 * longer category window can still be returned.
 */
export const ReturnItemsCta = ({
  orderId,
  hasAnyReturnableItem = false,
  returnableCount = 0,
  order = null,
}) => {
  if (!hasAnyReturnableItem) return null;
  return (
    <Link
      to={`/quick/orders/${orderId}/return`}
      state={order ? { order } : undefined}
      className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm hover:bg-slate-50 transition-colors"
    >
      <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
        <Package className="w-5 h-5 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">Return items</p>
        <p className="text-sm text-gray-500">
          {returnableCount > 0
            ? `${returnableCount} item${returnableCount === 1 ? "" : "s"} still eligible for return`
            : "Request a return for eligible items"}
        </p>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
    </Link>
  );
};

export default ReturnTrackingPanel;
