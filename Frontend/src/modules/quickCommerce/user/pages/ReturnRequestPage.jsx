import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Package, Check, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { customerApi } from "../services/customerApi";
import AnimatedPage from "@food/components/user/AnimatedPage";
import { Button } from "@food/components/ui/button";
import { Textarea } from "@food/components/ui/textarea";
import ReturnWindowBanner from "../components/return/ReturnWindowBanner";
import {
  buildReturnableItemRows,
  describeItemReturnState,
  formatReturnWindowCountdown,
  resolveLiveReturnEligibility,
} from "@/shared/utils/returnWindow";

const RETURN_REASONS = [
  "Received wrong item",
  "Item damaged or defective",
  "Quality not as expected",
  "Missing items in package",
  "Changed my mind",
  "Other",
];

const formatExpiry = (isoDate) => {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

const ReturnRequestPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Reuse the order already fetched by the tracking screen instead of
  // re-requesting the same Order Details payload on navigation.
  const preloadedOrder = location.state?.order || null;
  const [order, setOrder] = useState(preloadedOrder);
  const [loading, setLoading] = useState(!preloadedOrder);
  const [submitting, setSubmitting] = useState(false);
  const [selectedItems, setSelectedItems] = useState({});
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("wallet");
  const [payoutDetails, setPayoutDetails] = useState({
    upiId: "",
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
  });
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    // Countdown ticks locally; no polling and no re-fetch of the order.
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await customerApi.getOrderDetails(orderId, { forceRefresh: true });
        const payload =
          res?.data?.result ||
          res?.data?.data?.order ||
          res?.data?.order ||
          res?.data?.data ||
          null;
        if (!cancelled) setOrder(payload);
      } catch (error) {
        if (cancelled) return;
        toast.error(error?.response?.data?.message || "Failed to load order");
        navigate(`/quick/orders/${orderId}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId, navigate]);

  const returnEligibility = useMemo(
    () => resolveLiveReturnEligibility(order?.returnEligibility, now),
    [order?.returnEligibility, now],
  );

  const itemRows = useMemo(
    () => buildReturnableItemRows(order?.items, returnEligibility),
    [order?.items, returnEligibility],
  );

  const eligibleRows = useMemo(
    () => itemRows.filter((item) => item.returnEligible),
    [itemRows],
  );

  const canSubmitReturn = Boolean(returnEligibility?.canReturn) && eligibleRows.length > 0;

  // Drop selections whose window closed while the page was open.
  useEffect(() => {
    setSelectedItems((prev) => {
      const eligibleKeys = new Set(eligibleRows.map((item) => item.lineKey));
      const next = {};
      let changed = false;
      Object.entries(prev).forEach(([key, value]) => {
        if (eligibleKeys.has(key)) next[key] = value;
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [eligibleRows]);

  const toggleItem = (item) => {
    if (!item.returnEligible || !item.lineKey) return;
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[item.lineKey]) delete next[item.lineKey];
      else next[item.lineKey] = { quantity: item.remainingReturnableQuantity };
      return next;
    });
  };

  const changeQuantity = (item, delta) => {
    setSelectedItems((prev) => {
      const current = prev[item.lineKey];
      if (!current) return prev;
      const max = Math.max(1, Number(item.remainingReturnableQuantity || 1));
      const nextQty = Math.min(max, Math.max(1, Number(current.quantity || 1) + delta));
      return { ...prev, [item.lineKey]: { ...current, quantity: nextQty } };
    });
  };

  const resolvedReason = reason === "Other" ? customReason.trim() : reason;

  const handleSubmit = async () => {
    const selected = Object.entries(selectedItems);
    if (!selected.length) {
      toast.error("Select at least one item to return");
      return;
    }
    if (resolvedReason.length < 3) {
      toast.error("Please provide a return reason (min 3 characters)");
      return;
    }
    if (refundMethod === "upi") {
      if (!payoutDetails.upiId.trim()) {
        toast.error("UPI ID is required for UPI refund");
        return;
      }
      if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(payoutDetails.upiId.trim())) {
        toast.error("Invalid UPI ID format");
        return;
      }
    }
    if (refundMethod === "bank") {
      if (!payoutDetails.accountHolderName.trim() || !payoutDetails.accountNumber.trim() || !payoutDetails.ifscCode.trim()) {
        toast.error("Complete bank details are required");
        return;
      }
      if (!/^[a-zA-Z\s]{2,50}$/.test(payoutDetails.accountHolderName.trim())) {
        toast.error("Account holder name must contain only letters and spaces");
        return;
      }
      if (!/^\d{9,18}$/.test(payoutDetails.accountNumber.trim())) {
        toast.error("Account number must be 9 to 18 digits");
        return;
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(payoutDetails.ifscCode.trim().toUpperCase())) {
        toast.error("Invalid IFSC code format");
        return;
      }
    }

    if (!canSubmitReturn) {
      toast.error("No items on this order are currently returnable.");
      return;
    }

    setSubmitting(true);
    try {
      await customerApi.createReturnRequest(orderId, {
        reason: resolvedReason,
        refundMethod,
        payoutDetails: refundMethod === "wallet" ? {} : payoutDetails,
        items: selected.map(([lineKey, value]) => ({
          itemId: lineKey,
          quantity: Number(value?.quantity || 0) || undefined,
        })),
      });
      toast.success("Return request submitted");
      navigate(`/quick/orders/${orderId}`);
    } catch (error) {
      const code = error?.response?.data?.code;
      if (code === "RETURN_WINDOW_EXPIRED" || code === "RETURN_QUANTITY_EXCEEDED" || code === "ALREADY_RETURNED") {
        toast.error(error?.response?.data?.message || "This item can no longer be returned.");
      } else {
        toast.error(error?.response?.data?.message || "Failed to submit return request");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AnimatedPage>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <div className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-5">
        <div className="flex items-center gap-3">
          <Link to={`/quick/orders/${orderId}`} className="p-2 rounded-full hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Return items</h1>
            <p className="text-sm text-slate-500">Order #{order?.orderId || orderId}</p>
          </div>
        </div>

        <ReturnWindowBanner
          eligibility={returnEligibility}
          deliveredAt={returnEligibility?.deliveredAt || order?.deliveryState?.deliveredAt}
        />

        {!canSubmitReturn && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No items on this order are currently returnable. Return windows are set per
            product category and may close at different times.
          </div>
        )}

        <section className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Select items</p>
          <p className="text-xs text-slate-500">
            Each item has its own return window based on its category.
          </p>
          {itemRows.length === 0 ? (
            <p className="text-sm text-slate-500">No returnable items found on this order.</p>
          ) : (
            itemRows.map((item) => {
              const selection = selectedItems[item.lineKey];
              const selected = Boolean(selection);
              const eligible = item.returnEligible;
              const stateLabel = describeItemReturnState(item);
              const maxQty = Math.max(1, Number(item.remainingReturnableQuantity || 1));

              return (
                <div
                  key={item.lineKey}
                  className={`rounded-xl border transition ${
                    !eligible
                      ? "border-slate-100 bg-slate-50/70"
                      : selected
                        ? "border-amber-400 bg-amber-50/50"
                        : "border-slate-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(item)}
                    disabled={!eligible}
                    className={`w-full flex items-start gap-3 p-3 text-left ${
                      eligible ? "hover:bg-slate-50/60" : "cursor-not-allowed"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center mt-0.5 shrink-0 ${
                        selected
                          ? "bg-amber-500 border-amber-500 text-white"
                          : eligible
                            ? "border-slate-300"
                            : "border-slate-200 bg-slate-100"
                      }`}
                    >
                      {selected && <Check className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${eligible ? "text-slate-900" : "text-slate-400"}`}>
                        {item.name}
                        <span className="font-semibold text-slate-400"> x{Number(item.quantity || 1)}</span>
                      </p>
                      {item.variantName ? (
                        <p className="text-xs font-semibold text-slate-500">{item.variantName}</p>
                      ) : null}
                      {item.headerName && (
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {item.headerName}
                        </p>
                      )}
                      {eligible ? (
                        <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                          Returnable until {formatExpiry(item.returnEligibleUntil)}
                          <span className="text-slate-400 font-normal">
                            {" "}· {formatReturnWindowCountdown(item.remainingSeconds)} left
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 font-semibold mt-0.5">{stateLabel}</p>
                      )}
                      {item.returnedQuantity > 0 && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {item.returnedQuantity} already returned
                        </p>
                      )}
                    </div>
                    <p className={`text-sm font-bold shrink-0 ${eligible ? "text-slate-900" : "text-slate-400"}`}>
                      ₹{Number(item.price || 0) * Number(item.quantity || 1)}
                    </p>
                  </button>

                  {selected && maxQty > 1 && (
                    <div className="flex items-center justify-between border-t border-amber-200/60 px-3 py-2">
                      <span className="text-xs font-semibold text-slate-600">Quantity to return</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => changeQuantity(item, -1)}
                          disabled={Number(selection.quantity) <= 1}
                          className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center disabled:opacity-40"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-bold w-6 text-center">{selection.quantity}</span>
                        <button
                          type="button"
                          onClick={() => changeQuantity(item, 1)}
                          disabled={Number(selection.quantity) >= maxQty}
                          className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center disabled:opacity-40"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>

        <section className={`bg-white rounded-2xl border border-slate-100 p-4 space-y-3 ${!canSubmitReturn ? "opacity-60 pointer-events-none" : ""}`}>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Reason</p>
          <div className="flex flex-wrap gap-2">
            {RETURN_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  reason === r
                    ? "bg-slate-900 text-white border-slate-900"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === "Other" && (
            <Textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Describe the issue..."
              className="min-h-[80px]"
            />
          )}
        </section>

        <section className={`bg-white rounded-2xl border border-slate-100 p-4 space-y-3 ${!canSubmitReturn ? "opacity-60 pointer-events-none" : ""}`}>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Refund method</p>
          <div className="grid gap-2">
            {[
              { id: "wallet", label: "Wallet", desc: "Instant credit to app wallet" },
              { id: "upi", label: "UPI", desc: "Refund to your UPI ID" },
              { id: "bank", label: "Bank", desc: "Refund to bank account" },
            ].map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => setRefundMethod(method.id)}
                className={`rounded-xl border px-4 py-3 text-left ${
                  refundMethod === method.id
                    ? "border-amber-500 bg-amber-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-bold text-slate-900">{method.label}</p>
                <p className="text-xs text-slate-500">{method.desc}</p>
              </button>
            ))}
          </div>

          {refundMethod === "upi" && (
            <input
              type="text"
              placeholder="UPI ID (e.g. name@upi)"
              value={payoutDetails.upiId}
              maxLength={100}
              onChange={(e) => setPayoutDetails((p) => ({ ...p, upiId: e.target.value.replace(/\s/g, "") }))}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            />
          )}

          {refundMethod === "bank" && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Account holder name"
                value={payoutDetails.accountHolderName}
                maxLength={50}
                onChange={(e) =>
                  setPayoutDetails((p) => ({ ...p, accountHolderName: e.target.value.replace(/[^a-zA-Z\s]/g, "") }))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
              <input
                type="text"
                placeholder="Account number"
                value={payoutDetails.accountNumber}
                maxLength={18}
                onChange={(e) =>
                  setPayoutDetails((p) => ({ ...p, accountNumber: e.target.value.replace(/\D/g, "") }))
                }
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
              <input
                type="text"
                placeholder="IFSC code"
                value={payoutDetails.ifscCode}
                maxLength={11}
                onChange={(e) => setPayoutDetails((p) => ({ ...p, ifscCode: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
            </div>
          )}
        </section>

        <Button
          onClick={handleSubmit}
          disabled={submitting || !canSubmitReturn}
          className="w-full h-12 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Package className="w-4 h-4 mr-2" />
              Submit return request
            </>
          )}
        </Button>
      </div>
    </AnimatedPage>
  );
};

export default ReturnRequestPage;
