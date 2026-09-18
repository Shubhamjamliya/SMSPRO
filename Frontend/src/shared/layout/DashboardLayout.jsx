import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
import { sellerApi } from '@/modules/seller/services/sellerApi';
import { useAuth } from '@/core/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { BellRing, Check, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import SellerOrdersContext from '@/modules/seller/context/SellerOrdersContext';
import SellerEarningsContext, { defaultEarnings } from '@/modules/seller/context/SellerEarningsContext';
import { getOrderSocket, onSellerOrderNew, onOrderStatusUpdate, onOrderCancelled } from '@/core/services/orderSocket';
import alertSound from '@/modules/Food/assets/audio/alert.mp3';

const POLL_INTERVAL_MS = 15000;

const resolveAudioSource = (source, cacheKey = 'seller-alert') => {
    if (!source) return source;
    if (!import.meta.env.DEV) return source;
    const separator = source.includes('?') ? '&' : '?';
    return `${source}${separator}devcache=${cacheKey}`;
};

const resolveSellerReceivable = (order) => {
    const receivable = Number(order?.pricing?.receivable);
    if (Number.isFinite(receivable)) return receivable;

    const subtotal = Number(order?.pricing?.subtotal);
    const commission = Number(order?.pricing?.commission);
    const packing = Number(order?.pricing?.packingAmount || 0);
    if (Number.isFinite(subtotal) && Number.isFinite(commission)) {
        return Math.max(0, subtotal - commission + (Number.isFinite(packing) ? packing : 0));
    }

    const fallback = Number(order?.total ?? order?.pricing?.total);
    return Number.isFinite(fallback) ? fallback : 0;
};

const formatMoney = (value) =>
    `Rs ${Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

/** Match server `sellerPendingExpiresAt` — never reset to a full 60s when the modal opens late. */
function secondsLeftUntilSellerExpiry(order) {
    if (!order) return 0;
    const raw = order.sellerPendingExpiresAt ?? order.expiresAt;
    if (!raw) return 60;
    const ms = new Date(raw).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 1000));
}

const isEarningsRoute = (path) =>
    path.includes('earnings') || path.includes('withdrawals') || path.includes('transactions');

const DashboardLayout = ({ children, navItems, title }) => {
    const [newOrderAlert, setNewOrderAlert] = useState(null);
    const [shownOrderIds, setShownOrderIds] = useState(() => new Set());
    const [timeLeft, setTimeLeft] = useState(0);
    /** Total seconds in this acceptance window (for progress bar), set when modal opens */
    const acceptWindowTotalRef = useRef(60);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { user, logout, role } = useAuth();
    const location = useLocation();

    // Shared data for seller – single source, avoids duplicate API calls
    const [sellerOrders, setSellerOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [sellerEarningsData, setSellerEarningsData] = useState(defaultEarnings);
    const [earningsLoading, setEarningsLoading] = useState(false);

    const shownOrderIdsRef = useRef(new Set());
    const isFirstLoadRef = useRef(true);
    const newOrderAlertRef = useRef(null);
    const fetchOrdersRef = useRef(null);
    const earningsFetchedRef = useRef(false);
    const lastEarningsErrorToastAtRef = useRef(0);

    useEffect(() => {
        shownOrderIdsRef.current = shownOrderIds;
    }, [shownOrderIds]);
    useEffect(() => {
        newOrderAlertRef.current = newOrderAlert;
    }, [newOrderAlert]);

    useEffect(() => {
        if (role !== 'seller') {
            setSellerOrders([]);
            setOrdersLoading(false);
            return;
        }
        setOrdersLoading(true);

        const fetchOrders = async ({ showLoader = false } = {}) => {
            if (showLoader) setOrdersLoading(true);
            try {
                const res = await sellerApi.getOrders();
                if (!res?.data?.success) return;

                const payload = res.data.result || {};
                const rawOrders = Array.isArray(payload.items)
                    ? payload.items
                    : (res.data.results || []);
                const allOrders = Array.isArray(rawOrders) ? rawOrders : [];
                setSellerOrders(allOrders);

                const pendingOrders = allOrders.filter((o) => {
                    const ws = (o.workflowStatus || '').toUpperCase();
                    if (ws === 'SELLER_PENDING') return true;
                    return (o?.status || '').toLowerCase() === 'pending';
                });

                if (isFirstLoadRef.current) {
                    const existingIds = new Set(pendingOrders.map((o) => o.orderId).filter(Boolean));
                    shownOrderIdsRef.current = existingIds;
                    isFirstLoadRef.current = false;
                    setShownOrderIds(existingIds);
                    return;
                }

                const newOrder = pendingOrders.find((o) => !shownOrderIdsRef.current.has(o.orderId));
                // CRITICAL FIX: If a modal is showing, but the order is no longer in the pending list, clear it.
                // This handles cases where the parent (restaurant) rejected the mixed order and it disappeared from polling.
                if (newOrderAlertRef.current) {
                    const currentId = String(newOrderAlertRef.current.orderId);
                    const stillPending = pendingOrders.some(o => String(o.orderId) === currentId);
                    if (!stillPending) {
                        console.log(`[DashboardLayout] Clearing stale order modal: #${currentId} is no longer pending.`);
                        setNewOrderAlert(null);
                        newOrderAlertRef.current = null;
                    }
                }

                if (!newOrder || newOrderAlertRef.current) return;

                setNewOrderAlert(newOrder);
                setShownOrderIds((prev) => new Set(prev).add(newOrder.orderId));
                shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(newOrder.orderId);
                newOrderAlertRef.current = newOrder;

                const audio = new Audio(resolveAudioSource(alertSound));
                audio.play().catch(() => {});
            } catch (error) {
                console.error("Polling Error:", error);
            } finally {
                setOrdersLoading(false);
            }
        };

        fetchOrdersRef.current = () => fetchOrders({ showLoader: false });
        fetchOrders({ showLoader: true });
        const pollInterval = setInterval(() => fetchOrders({ showLoader: false }), POLL_INTERVAL_MS);
        return () => clearInterval(pollInterval);
    }, [role]);

    useEffect(() => {
        if (role !== 'seller') return undefined;
        const getToken = () => localStorage.getItem('auth_seller');
        getOrderSocket(getToken);

        const offNew = onSellerOrderNew(getToken, () => {
            if (fetchOrdersRef.current) fetchOrdersRef.current();
        });

        const offStatus = onOrderStatusUpdate(getToken, (payload) => {
            const orderId = String(payload?.orderId || '').trim();
            if (!orderId) return;
            const raw = String(payload?.sellerStatus || payload?.orderStatus || '').trim().toLowerCase();
            if (!raw) return;

            // Terminal cancellation check – clear modal if this specific order is cancelled
            if (raw.includes('cancel')) {
                if (newOrderAlertRef.current && String(newOrderAlertRef.current.orderId) === orderId) {
                    setNewOrderAlert(null);
                    toast.error(`Order #${orderId} was cancelled by the customer/system.`);
                }
            }

            const nextStatus =
                raw === 'picked_up' ? 'out_for_delivery' :
                    raw === 'placed' || raw === 'created' ? 'pending' :
                        raw;
            const nextWorkflow = String(payload?.sellerWorkflowStatus || '').trim();

            setSellerOrders((prev) =>
                (Array.isArray(prev) ? prev : []).map((order) =>
                    String(order?.orderId || '') === orderId
                        ? {
                            ...order,
                            status: nextStatus,
                            ...(nextWorkflow ? { workflowStatus: nextWorkflow } : {}),
                            ...(payload?.dispatchStatus ? { dispatchStatus: payload.dispatchStatus } : {}),
                            ...(payload?.deliveryPartner !== undefined ? { deliveryPartner: payload.deliveryPartner } : {}),
                            ...(payload?.deliveryState ? { deliveryState: payload.deliveryState } : {}),
                            ...(payload?.deliveryVerification ? { deliveryVerification: payload.deliveryVerification } : {}),
                        }
                        : order
                )
            );
        });

        const offCancel = onOrderCancelled(getToken, (payload) => {
            const orderId = String(payload?.orderId || '').trim();
            if (!orderId) return;
            
            if (newOrderAlertRef.current && String(newOrderAlertRef.current.orderId) === orderId) {
                setNewOrderAlert(null);
                toast.error(`Order #${orderId} has been cancelled.`);
            }
            
            // Also refresh orders to update list
            if (fetchOrdersRef.current) fetchOrdersRef.current();
        });

        return () => {
            offNew?.();
            offStatus?.();
            offCancel?.();
        };
    }, [role]);

    // Single earnings fetch when seller is on earnings/withdrawals/transactions – no duplicate calls
    useEffect(() => {
        if (role !== 'seller' || !isEarningsRoute(location.pathname)) {
            if (!isEarningsRoute(location.pathname)) earningsFetchedRef.current = false;
            return;
        }
        if (earningsFetchedRef.current) return;
        earningsFetchedRef.current = true;
        setEarningsLoading(true);

        sellerApi
            .getEarnings()
            .then((response) => {
                const raw = response?.data?.result ?? response?.data?.data;
                if (response?.data?.success && raw && typeof raw === 'object') {
                    setSellerEarningsData({
                        balances: raw.balances ?? {},
                        ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
                        monthlyChart: Array.isArray(raw.monthlyChart) ? raw.monthlyChart : [],
                        withdrawalLimits: raw.withdrawalLimits ?? {},
                    });
                }
            })
            .catch((err) => console.error("Earnings Fetch Error:", err))
            .finally(() => setEarningsLoading(false));
    }, [role, location.pathname]);

    // Keep earnings fresh while seller is on earnings-related pages (delivery updates can land after initial load).
    useEffect(() => {
        if (role !== 'seller') return undefined;
        if (!isEarningsRoute(location.pathname)) return undefined;

        const timer = setInterval(() => {
            refreshEarnings();
        }, POLL_INTERVAL_MS);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, location.pathname]);

    const refreshOrders = () => {
        if (fetchOrdersRef.current) fetchOrdersRef.current();
    };
    const refreshEarnings = () => {
        earningsFetchedRef.current = false;
        // Silent refresh — do not flip earningsLoading or the earnings pages
        // will flash a full-page loader every poll tick.
        sellerApi
            .getEarnings()
            .then((response) => {
                const raw = response?.data?.result ?? response?.data?.data;
                if (response?.data?.success && raw && typeof raw === 'object') {
                    setSellerEarningsData({
                        balances: raw.balances ?? {},
                        ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
                        monthlyChart: Array.isArray(raw.monthlyChart) ? raw.monthlyChart : [],
                        withdrawalLimits: raw.withdrawalLimits ?? {},
                    });
                }
            })
            .catch((err) => {
                console.error("Earnings Fetch Error:", err);
                const msg = err?.response?.data?.message || "Failed to refresh earnings";
                // Avoid toast spam if the tab stays open and backend is down.
                const now = Date.now();
                if (now - lastEarningsErrorToastAtRef.current > 30000) {
                    lastEarningsErrorToastAtRef.current = now;
                    toast.error(msg, { duration: 2500 });
                }
            })
            .finally(() => {
                earningsFetchedRef.current = true;
            });
    };

    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    // Timer: driven by server expiry (sellerPendingExpiresAt), not a local 60s from modal open
    useEffect(() => {
        if (!newOrderAlert) return undefined;

        const left = secondsLeftUntilSellerExpiry(newOrderAlert);
        if (left <= 0) {
            const expiredOrderId = newOrderAlert?.orderId;
            setNewOrderAlert(null);
            toast.error("This order has already expired — you can no longer accept it.");
            if (expiredOrderId) {
                sellerApi
                    .updateOrderStatus(expiredOrderId, {
                        status: "cancelled",
                        reason: "Seller did not accept the order in time",
                    })
                    .catch(() => {});
            }
            return undefined;
        }

        acceptWindowTotalRef.current = left;
        setTimeLeft(left);

        const timer = setInterval(() => {
            const next = secondsLeftUntilSellerExpiry(newOrderAlertRef.current);
            setTimeLeft(next);
            if (next <= 0) {
                clearInterval(timer);
                const expiredOrderId = newOrderAlertRef.current?.orderId;
                setNewOrderAlert(null);
                toast.error("Order timed out!");
                if (expiredOrderId) {
                    sellerApi
                        .updateOrderStatus(expiredOrderId, {
                            status: "cancelled",
                            reason: "Seller did not accept the order in time",
                        })
                        .catch(() => {});
                }
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [newOrderAlert]);

    const handleAcceptOrder = async (orderId) => {
        try {
            await sellerApi.updateOrderStatus(orderId, { status: 'confirmed' });
            toast.success(`Order #${orderId} Accepted!`);
            setNewOrderAlert(null);
        } catch (error) {
            const msg =
                error?.response?.data?.message ||
                "Failed to accept order";
            toast.error(msg);
        }
    };

    const handleDeclineOrder = async (orderId) => {
        try {
            await sellerApi.updateOrderStatus(orderId, {
                status: 'cancelled',
                reason: 'Seller declined the order',
            });
            toast.error(`Order #${orderId} Declined`);
            setNewOrderAlert(null);
        } catch (error) {
            const msg =
                error?.response?.data?.message ||
                "Failed to update order";
            toast.error(msg);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 relative overflow-x-hidden seller-theme-scope">
            {/* Premium Ambient Background Glow */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/15 rounded-full blur-[140px] -z-10 animate-pulse pointer-events-none" style={{ animationDuration: '8s' }}></div>
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-rose-500/15 rounded-full blur-[140px] -z-10 animate-pulse pointer-events-none" style={{ animationDelay: '4s', animationDuration: '10s' }}></div>

            <Sidebar
                items={navItems}
                title={title}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />
            <div className={cn("transition-all duration-300", (role === "admin" || role === "seller") ? "pl-0 md:pl-80" : "pl-80")}>
                <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
                <main className={cn("min-h-screen", (role === "admin" || role === "seller") ? "pt-20 md:pt-6 pb-24 md:pb-8" : "pt-20")}>
                    <div className="w-full px-3 sm:px-5 py-4 sm:py-6">
                        <SellerOrdersContext.Provider
                            value={{
                                orders: role === 'seller' ? sellerOrders : [],
                                ordersLoading: role === 'seller' ? ordersLoading : false,
                                refreshOrders,
                            }}>
                            <SellerEarningsContext.Provider
                                value={{
                                    earningsData: role === 'seller' ? sellerEarningsData : defaultEarnings,
                                    earningsLoading: role === 'seller' ? earningsLoading : false,
                                    refreshEarnings,
                                }}>
                                {children}
                            </SellerEarningsContext.Provider>
                        </SellerOrdersContext.Provider>
                    </div>
                </main>
            </div>

            {/* Global Order Alert Modal */}
            <AnimatePresence>
                {newOrderAlert && (
                    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100"
                        >
                            <div className="flex flex-col items-center text-center">
                                <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-bounce">
                                    <BellRing className="h-10 w-10 text-primary" />
                                </div>

                                <h2 className="text-2xl font-black text-slate-900 mb-2">New Order Received!</h2>
                                <p className="text-slate-600 font-medium mb-3">
                                    Order <span className="text-primary font-bold">#{newOrderAlert.orderId}</span>
                                </p>
                                <div className="w-full rounded-2xl bg-slate-50 border border-slate-100 p-4 text-left mb-4 space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="font-bold text-slate-500">Items</span>
                                        <span className="font-black text-slate-900">{formatMoney(newOrderAlert.pricing?.subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="font-bold text-slate-500">Packing</span>
                                        <span className="font-black text-emerald-600">{formatMoney(newOrderAlert.pricing?.packingAmount)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="font-bold text-slate-500">Commission</span>
                                        <span className="font-black text-rose-600">-{formatMoney(newOrderAlert.pricing?.commission)}</span>
                                    </div>
                                    {String(newOrderAlert.pricing?.couponSource || "").toLowerCase() === "seller" &&
                                    Number(newOrderAlert.pricing?.couponDiscount || 0) > 0 ? (
                                        <div className="flex justify-between text-xs">
                                            <span className="font-bold text-slate-500">Seller coupon</span>
                                            <span className="font-black text-amber-600">
                                                -{formatMoney(newOrderAlert.pricing?.couponDiscount)}
                                            </span>
                                        </div>
                                    ) : null}
                                    <div className="h-px bg-slate-200 my-1" />
                                    <div className="flex justify-between text-sm items-start gap-2">
                                        <div>
                                            <span className="font-black text-slate-900 block">Seller receivable</span>
                                            <span className="text-[10px] font-semibold text-slate-500">
                                                Amount you'll receive
                                            </span>
                                        </div>
                                        <span className="font-black text-primary whitespace-nowrap">
                                            {formatMoney(resolveSellerReceivable(newOrderAlert))}
                                        </span>
                                    </div>
                                    <p className="text-[10px] font-semibold text-slate-500 pt-1">
                                        {(newOrderAlert.items || []).slice(0, 3).map((i) => i.name).filter(Boolean).join(", ") || "New items"}
                                        {(newOrderAlert.items || []).length > 3 ? ` +${(newOrderAlert.items || []).length - 3} more` : ""}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        {newOrderAlert.customer?.name || "Customer"}
                                        {newOrderAlert.customer?.phone
                                            ? ` · ${newOrderAlert.customer.phone}`
                                            : ""}
                                        {" · "}
                                        {["cash", "cod"].includes(String(newOrderAlert.payment?.method || "").toLowerCase())
                                            ? "Cash on Delivery"
                                            : "Online"}
                                    </p>
                                </div>

                                {/* Timer Bar — width from real server deadline */}
                                <div className="w-full bg-slate-100 h-2 rounded-full mb-8 overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full transition-[width] duration-1000 ease-linear",
                                            timeLeft < 15 ? "bg-rose-500" : "bg-primary",
                                        )}
                                        style={{
                                            width: `${acceptWindowTotalRef.current > 0 ? (timeLeft / acceptWindowTotalRef.current) * 100 : 0}%`,
                                        }}
                                    />
                                </div>

                                <div className="flex items-center gap-4 text-sm font-bold mb-8">
                                    <Clock className={cn("h-4 w-4", timeLeft < 15 ? "text-rose-500 animate-pulse" : "text-slate-600")} />
                                    <span className={timeLeft < 15 ? "text-rose-500" : "text-slate-600"}>
                                        Accept within {timeLeft} {timeLeft === 1 ? "second" : "seconds"}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 w-full">
                                    <button
                                        onClick={() => handleDeclineOrder(newOrderAlert.orderId)}
                                        className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        <X className="h-5 w-5" />
                                        Decline
                                    </button>
                                    <button
                                        onClick={() => handleAcceptOrder(newOrderAlert.orderId)}
                                        className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-white font-bold hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95"
                                    >
                                        <Check className="h-5 w-5" />
                                        Accept
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {(role === "admin" || role === "seller") && <BottomNav navItems={navItems} />}
        </div>
    );
};

export default DashboardLayout;
