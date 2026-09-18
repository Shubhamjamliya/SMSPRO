import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../services/adminApi';
import {
    AlertCircle,
    Box,
    Calendar,
    ChevronLeft,
    Clock,
    Copy,
    CreditCard,
    Download,
    Info,
    Mail,
    MapPin,
    Navigation,
    Package,
    Phone,
    Printer,
    Store,
    Truck,
    User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { joinOrderRoom, leaveOrderRoom, onOrderStatusUpdate } from "@/core/services/orderSocket";
import invoiceLogo from '@/assets/Logo.png';

const AUTO_REFRESH_INTERVAL_MS = 30000;

const formatDateTime = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'NA';
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

const getStatusStyles = (status) => {
    const normalizedStatus = String(status || 'pending').trim().toLowerCase();
    switch (normalizedStatus) {
        case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
        case 'confirmed': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'packed': return 'bg-indigo-100 text-primary border-primary/20';
        case 'ready_for_pickup': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'out_for_delivery': return 'bg-purple-100 text-purple-700 border-purple-200';
        case 'delivered': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'cancelled': return 'bg-rose-100 text-rose-700 border-rose-200';
        default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
};

const getNormalizedStatus = (order) =>
    String(
        order?.status ||
        order?.orderStatus ||
        order?.workflowStatus ||
        order?.sellerOrder?.status ||
        'pending'
    )
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');

export default function OrderDetail() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const getToken = () =>
        localStorage.getItem("admin_accessToken") ||
        localStorage.getItem("accessToken") ||
        "";

    const fetchDetail = async (options = {}) => {
        if (!orderId) return;
        const silent = options.silent === true;
        if (!silent) setIsLoading(true);
        try {
            const response = await adminApi.getOrderDetails(orderId);
            if (response.data?.success) {
                setOrder(response.data.result || null);
            } else if (!silent) {
                setOrder(null);
            }
        } catch (error) {
            console.error('Failed to load quick order detail:', error);
            if (!silent) {
                setOrder(null);
                showToast('Failed to load order details', 'error');
            }
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDetail();
    }, [orderId]);

    useEffect(() => {
        if (!orderId) return undefined;
        joinOrderRoom(orderId, getToken);
        const off = onOrderStatusUpdate(getToken, (payload) => {
            const id = String(payload?.orderId || "").trim();
            if (!id || String(orderId) !== id) return;
            setOrder((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    orderStatus: payload?.orderStatus ?? prev.orderStatus,
                    status: payload?.sellerStatus ?? prev.status,
                };
            });
        });

        return () => {
            off?.();
            leaveOrderRoom(orderId, getToken);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    useEffect(() => {
        if (!orderId) return undefined;
        const interval = window.setInterval(() => {
            fetchDetail({ silent: true });
        }, AUTO_REFRESH_INTERVAL_MS);
        return () => window.clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    const currentStatus = useMemo(() => getNormalizedStatus(order), [order]);
    const cancellationReason = useMemo(() => {
        const direct = String(order?.cancellationReason || order?.sellerOrder?.cancellationReason || '').trim();
        if (direct) return direct;

        const history = Array.isArray(order?.statusHistory) ? order.statusHistory : [];
        const cancelEntry = [...history]
            .reverse()
            .find((entry) => String(entry?.to || '').toLowerCase().includes('cancel'));
        return String(cancelEntry?.note || order?.payment?.refund?.reason || '').trim();
    }, [order]);
    const orderDisplayId = order?.orderId || order?.orderNumber || order?.id || orderId || 'NA';
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    const resolveItemVariant = (item) =>
        String(item?.variantName || item?.notes || "").trim();
    const customerAddress = order?.address || order?.deliveryAddress || {};
    const customerPhone =
        order?.customer?.phone ||
        customerAddress?.phone ||
        order?.sellerOrder?.customer?.phone ||
        order?.sellerOrder?.address?.phone ||
        '';
    const customerLocation = customerAddress?.location?.coordinates
      ? {
          lat: Number(customerAddress.location.coordinates[1]),
          lng: Number(customerAddress.location.coordinates[0]),
        }
      : customerAddress?.location || {};
    const formattedAddress = [
      customerAddress.street || customerAddress.address || customerAddress.line1,
      customerAddress.additionalDetails || customerAddress.landmark || customerAddress.line2,
      customerAddress.city,
      customerAddress.state,
      customerAddress.zipCode || customerAddress.pincode,
    ].filter(Boolean).join(', ');
    const deliveryBoy = order?.deliveryBoy || order?.rider || null;
    const statusHistory = Array.isArray(order?.statusHistory) ? order.statusHistory : [];
    const earnings = order?.earnings || {};
    const customerImage = order?.customer?.profileImage || order?.customer?.image || '';
    const customerNodeId = String(order?.customer?._id || order?.customer?.id || '').trim();
    const sellerImage = order?.seller?.shopImage || order?.seller?.image || '';
    const sellerNodeId = String(order?.seller?._id || order?.seller?.id || '').trim();
    const sellerPhone = order?.seller?.phone || '';
    const sellerEmail = order?.seller?.email || '';
    const sellerAddress =
        order?.seller?.address ||
        order?.seller?.location?.formattedAddress ||
        order?.seller?.location?.address ||
        '';
    const txnHash = String(
        order?.payment?.txnHash ||
        order?.payment?.transactionId ||
        order?.payment?.razorpay?.paymentId ||
        order?.payment?.razorpayPaymentId ||
        order?.payment?.txnId ||
        order?.payment?.reference ||
        order?.payment?.razorpay?.orderId ||
        '',
    ).trim();
    const isCodPayment = ['cash', 'cod', 'cash_on_delivery'].includes(
        String(order?.payment?.method || '').toLowerCase(),
    );
    const txnDisplay = txnHash || (isCodPayment ? 'COD — no gateway txn' : 'N/A');

    const escapeHtml = (value) =>
        String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    const copyToClipboard = async (text, label) => {
        if (!text || text === 'N/A' || text.startsWith('COD')) return;
        try {
            await navigator.clipboard.writeText(String(text));
            showToast(`${label} copied`, 'success');
        } catch {
            showToast(`Failed to copy ${label.toLowerCase()}`, 'error');
        }
    };

    const handleExportIntelligence = () => {
        if (!order) return;
        const blob = new Blob([JSON.stringify(order, null, 2)], { type: 'application/json;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `quick-order-${orderDisplayId}.json`;
        link.click();
        URL.revokeObjectURL(downloadUrl);
        showToast('Order intelligence exported', 'success');
    };

    const handlePrintInvoice = () => {
        if (!order) return;
        const invoiceWindow = window.open('', '_blank', 'width=920,height=720');
        if (!invoiceWindow) {
            showToast('Unable to open print window', 'error');
            return;
        }

        const payableTotal = Math.max(0, Number(order?.pricing?.total || 0));
        const logoSrc = String(invoiceLogo || '');
        const paymentMethod = String(order?.payment?.method || 'N/A').replace(/_/g, ' ');
        const paymentStatus = String(order?.payment?.status || 'N/A').replace(/_/g, ' ');
        const discount = Number(order?.pricing?.discount || order?.pricing?.couponDiscount || 0);
        const invoiceStatusRaw = String(
            order?.orderStatus || order?.status || currentStatus || '',
        ).trim();
        const invoiceStatusLabel = (() => {
            const pretty = invoiceStatusRaw.replace(/_/g, ' ') || 'N/A';
            const lower = pretty.toLowerCase();
            if (!lower.includes('cancel')) return pretty;
            if (cancellationReason) return `Cancelled — ${cancellationReason}`;
            if (lower.includes('restaurant') || lower.includes('seller')) {
                return 'Cancelled — Seller did not accept the order';
            }
            if (lower.includes('user') || lower.includes('customer')) {
                return 'Cancelled — Cancelled by customer';
            }
            if (lower.includes('admin')) return 'Cancelled — Cancelled by admin';
            if (lower.includes('timeout')) {
                return 'Cancelled — Seller did not accept the order in time';
            }
            return 'Cancelled';
        })();
        const invoiceCancelReason =
            cancellationReason ||
            (String(invoiceStatusLabel).toLowerCase().includes('cancel')
                ? 'Seller did not accept / order cancelled'
                : '');

        const itemsHtml = orderItems.map((item) => {
            const quantity = Number(item.quantity || 0);
            const unitPrice = Number(item.price || 0);
            const variantLabel = resolveItemVariant(item);
            return `
                <tr>
                    <td>
                        <strong>${escapeHtml(item.name || 'Item')}</strong>
                        ${variantLabel ? `<div class="muted">${escapeHtml(variantLabel)}</div>` : ''}
                    </td>
                    <td class="center">${quantity}</td>
                    <td class="right">${formatCurrency(unitPrice)}</td>
                    <td class="right">${formatCurrency(quantity * unitPrice)}</td>
                </tr>
            `;
        }).join('');

        const riderHtml = deliveryBoy
            ? `
                <div class="card">
                    <div class="label">Delivery Partner</div>
                    <div class="value">${escapeHtml(deliveryBoy.name || 'Rider')}</div>
                    <div class="muted">${escapeHtml(deliveryBoy.phone || 'Phone N/A')}</div>
                    ${deliveryBoy.vehicleType || deliveryBoy.vehicleNumber
                        ? `<div class="muted">${escapeHtml([deliveryBoy.vehicleType, deliveryBoy.vehicleNumber].filter(Boolean).join(' · '))}</div>`
                        : ''}
                </div>
            `
            : '';

        invoiceWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Invoice ${escapeHtml(orderDisplayId)}</title>
                <style>
                    :root { --orange:#FF6A00; --orange-dark:#E85D04; --ink:#0f172a; --muted:#64748b; --line:#ffd6ba; --soft:#fff8f2; }
                    * { box-sizing:border-box; }
                    body { margin:0; font-family:Arial,Helvetica,sans-serif; color:var(--ink); background:#fff; }
                    .page { padding:28px 32px 40px; max-width:860px; margin:0 auto; }
                    .header { background:linear-gradient(135deg,var(--orange),var(--orange-dark)); color:#fff; border-radius:16px; padding:22px 24px; display:flex; justify-content:space-between; align-items:center; gap:16px; }
                    .brand { display:flex; align-items:center; gap:14px; }
                    .logo { width:56px; height:56px; border-radius:12px; background:#fff; object-fit:contain; padding:4px; }
                    .brand h1 { margin:0; font-size:24px; }
                    .brand p { margin:4px 0 0; opacity:.92; font-size:12px; }
                    .meta { text-align:right; font-size:12px; line-height:1.6; }
                    .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:18px 0; }
                    .card { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:14px; min-height:110px; }
                    .label { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--orange-dark); margin-bottom:8px; }
                    .value { font-size:14px; font-weight:700; margin-bottom:4px; }
                    .muted { font-size:12px; color:var(--muted); line-height:1.45; }
                    table { width:100%; border-collapse:collapse; margin-top:8px; }
                    thead th { background:var(--orange); color:#fff; font-size:11px; text-transform:uppercase; letter-spacing:.04em; padding:10px 12px; text-align:left; }
                    tbody td { padding:10px 12px; border-bottom:1px solid #ffe1cc; font-size:13px; vertical-align:top; }
                    tbody tr:nth-child(even) { background:#fff7ed; }
                    .center { text-align:center; }
                    .right { text-align:right; }
                    .totals { margin-top:18px; margin-left:auto; width:280px; background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
                    .totals-row { display:flex; justify-content:space-between; font-size:12px; margin:6px 0; color:var(--muted); }
                    .totals-row strong { color:var(--ink); }
                    .grand { border-top:1px solid var(--orange); margin-top:10px; padding-top:10px; font-size:14px; font-weight:800; color:var(--orange-dark); display:flex; justify-content:space-between; }
                    .footer { margin-top:28px; padding-top:12px; border-top:1px solid var(--line); display:flex; justify-content:space-between; font-size:11px; color:var(--muted); }
                    @media print {
                        body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
                        .page { padding:12px; }
                    }
                </style>
            </head>
            <body>
                <div class="page">
                    <div class="header">
                        <div class="brand">
                            ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="Logo" />` : ''}
                            <div>
                                <h1>SMS Pro</h1>
                                <p>Tax Invoice · Quick Commerce</p>
                            </div>
                        </div>
                        <div class="meta">
                            <div><strong>INV-${escapeHtml(orderDisplayId)}</strong></div>
                            <div>Issued: ${escapeHtml(formatDateTime(order.createdAt))}</div>
                            <div>Status: ${escapeHtml(invoiceStatusLabel)}</div>
                        </div>
                    </div>

                    ${invoiceCancelReason ? `
                    <div class="card" style="margin-top:14px;min-height:auto;border-color:#fecaca;background:#fff1f2;">
                        <div class="label" style="color:#be123c;">Cancellation</div>
                        <div class="value">${escapeHtml(invoiceStatusLabel)}</div>
                        <div class="muted">Reason: ${escapeHtml(invoiceCancelReason)}</div>
                    </div>` : ''}

                    <div class="grid">
                        <div class="card">
                            <div class="label">Billed To (Customer)</div>
                            <div class="value">${escapeHtml(order.customer?.name || 'Customer')}</div>
                            <div class="muted">${escapeHtml(customerPhone || 'Phone N/A')}</div>
                            <div class="muted">${escapeHtml(order.customer?.email || 'Email N/A')}</div>
                            <div class="muted">${escapeHtml(formattedAddress || customerAddress?.address || 'Address N/A')}</div>
                            ${customerNodeId ? `<div class="muted">ID: ${escapeHtml(customerNodeId)}</div>` : ''}
                        </div>
                        <div class="card">
                            <div class="label">Order Snapshot</div>
                            <div class="value">${escapeHtml(orderDisplayId)}</div>
                            <div class="muted">Type: ${escapeHtml(String(order.orderType || 'quick').toUpperCase())}</div>
                            <div class="muted">Status: ${escapeHtml(invoiceStatusLabel)}</div>
                            <div class="muted">Payment: ${escapeHtml(paymentMethod)}</div>
                            <div class="muted">Pay status: ${escapeHtml(paymentStatus)}</div>
                            <div class="muted">TXN: ${escapeHtml(txnDisplay)}</div>
                        </div>
                        <div class="card">
                            <div class="label">Seller / Store</div>
                            <div class="value">${escapeHtml(order.seller?.shopName || order.storeName || 'Store')}</div>
                            <div class="muted">Owner: ${escapeHtml(order.seller?.name || 'N/A')}</div>
                            <div class="muted">${escapeHtml(sellerPhone || 'Phone N/A')}</div>
                            <div class="muted">${escapeHtml(sellerEmail || 'Email N/A')}</div>
                            <div class="muted">${escapeHtml(sellerAddress || 'Address N/A')}</div>
                        </div>
                    </div>

                    ${riderHtml ? `<div class="grid" style="grid-template-columns:1fr;">${riderHtml}</div>` : ''}

                    <table>
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th class="center">Qty</th>
                                <th class="right">Unit</th>
                                <th class="right">Total</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml || '<tr><td colspan="4">No items</td></tr>'}</tbody>
                    </table>

                    <div class="totals">
                        <div class="totals-row"><span>Subtotal</span><strong>${formatCurrency(order.pricing?.subtotal)}</strong></div>
                        <div class="totals-row"><span>Packing Fee</span><strong>${formatCurrency(order.pricing?.packagingFee || earnings.packingFee)}</strong></div>
                        <div class="totals-row"><span>Delivery Fee</span><strong>${formatCurrency(order.pricing?.deliveryFee)}</strong></div>
                        <div class="totals-row"><span>Platform Fee</span><strong>${formatCurrency(order.pricing?.platformFee)}</strong></div>
                        <div class="totals-row"><span>GST & Taxes</span><strong>${formatCurrency(order.pricing?.tax || order.pricing?.gst)}</strong></div>
                        ${discount > 0 ? `<div class="totals-row"><span>Discount</span><strong>- ${formatCurrency(discount)}</strong></div>` : ''}
                        <div class="totals-row"><span>Seller Commission</span><strong>${formatCurrency(earnings.sellerCommission ?? order.pricing?.restaurantCommission)}</strong></div>
                        <div class="totals-row"><span>Seller Receivable</span><strong>${formatCurrency(earnings.sellerReceivable)}</strong></div>
                        <div class="totals-row"><span>Admin Earned</span><strong>${formatCurrency(earnings.adminEarned)}</strong></div>
                        <div class="grand"><span>Grand Total</span><span>${formatCurrency(payableTotal)}</span></div>
                    </div>

                    <div class="footer">
                        <span>SMS Pro admin tax invoice</span>
                        <span>System generated · ${escapeHtml(formatDateTime(new Date()))}</span>
                    </div>
                </div>
                <script>
                    window.onload = function () {
                        setTimeout(function () { window.focus(); window.print(); }, 250);
                    };
                </script>
            </body>
            </html>
        `);
        invoiceWindow.document.close();
    };

    if (isLoading) {
        return (
            <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
                <div className="h-12 w-12 border-4 border-fuchsia-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-black text-slate-400 uppercase tracking-[4px]">Accessing Intelligence...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center p-8">
                <AlertCircle className="h-16 w-16 text-rose-200" />
                <h2 className="text-xl font-black text-slate-900 uppercase">Order Node Not Found</h2>
                <button onClick={() => navigate(-1)} className="ds-btn ds-btn-md bg-primary text-white mt-4">Return to List</button>
            </div>
        );
    }

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-3 bg-white ring-1 ring-slate-200 rounded-2xl hover:bg-slate-50 transition-all text-slate-400 group"
                    >
                        <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Order #{orderDisplayId}</h1>
                            <div className={cn(
                                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest shadow-sm",
                                getStatusStyles(currentStatus)
                            )}>
                                <Info className="h-3.5 w-3.5" />
                                {currentStatus.replace(/_/g, ' ')}
                            </div>
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDateTime(order.createdAt)}
                            <Clock className="h-3.5 w-3.5 ml-1" />
                            Updated {formatDateTime(order.updatedAt)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={handlePrintInvoice} className="flex items-center gap-2 px-5 py-3 bg-white ring-1 ring-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
                        <Printer className="h-4 w-4 text-slate-400" />
                        Print Invoice
                    </button>
                    <button onClick={handleExportIntelligence} className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-xl active:scale-95">
                        <Download className="h-4 w-4 text-emerald-400" />
                        Export Intelligence
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Box className="h-4 w-4 text-indigo-500" />
                                Items in Order
                            </h3>
                            <Badge className="bg-primary/5 text-primary border-none text-[9px] font-black">{orderItems.length} ITEMS</Badge>
                        </div>
                        <div className="p-0 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Node</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Unit Price</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Aggregate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {orderItems.map((item, index) => (
                                        <tr key={item._id || item.productId || index} className="group hover:bg-slate-50/30 transition-all">
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center shadow-inner border border-slate-100 group-hover:scale-110 transition-transform overflow-hidden">
                                                        {item.image ? (
                                                            <img src={item.image} alt={item.name || 'Item'} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package className="h-6 w-6 text-slate-200" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-slate-900">{item.name || 'Item'}</h4>
                                                        {resolveItemVariant(item) ? (
                                                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">
                                                                {resolveItemVariant(item)}
                                                            </p>
                                                        ) : null}
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {item.productId || item.itemId || item.product?._id || 'NA'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-center text-sm font-bold text-slate-600">{formatCurrency(item.price)}</td>
                                            <td className="px-6 py-5 text-center">
                                                <span className="bg-slate-100 px-3 py-1 rounded-lg text-xs font-black text-slate-700">x{item.quantity || 0}</span>
                                            </td>
                                            <td className="px-6 py-5 text-right text-sm font-black text-slate-900">{formatCurrency(Number(item.price || 0) * Number(item.quantity || 0))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50/50 flex flex-col items-end gap-3 text-right">
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal</span>
                                <span className="text-sm font-black text-slate-700">{formatCurrency(order.pricing?.subtotal)}</span>
                            </div>
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Packing Fee</span>
                                <span className="text-sm font-bold text-emerald-600">{formatCurrency(order.pricing?.packagingFee || order.earnings?.packingFee)}</span>
                            </div>
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Fee</span>
                                <span className="text-sm font-bold text-slate-700">{formatCurrency(order.pricing?.deliveryFee)}</span>
                            </div>
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Platform Fee</span>
                                <span className="text-sm font-bold text-slate-700">{formatCurrency(order.pricing?.platformFee)}</span>
                            </div>
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GST / Tax</span>
                                <span className="text-sm font-bold text-slate-700">{formatCurrency(order.pricing?.tax || order.pricing?.gst)}</span>
                            </div>
                            {Number(order.pricing?.couponDiscount || order.pricing?.discount || 0) > 0 && (
                                <div className="flex items-center justify-between w-full max-w-[280px]">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Discount ({order.pricing?.couponSource || 'coupon'})
                                    </span>
                                    <span className="text-sm font-bold text-rose-600">
                                        -{formatCurrency(order.pricing?.couponDiscount || order.pricing?.discount)}
                                    </span>
                                </div>
                            )}
                            <div className="h-px w-full max-w-[280px] bg-slate-200 my-1" />
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seller Commission</span>
                                <span className="text-sm font-bold text-rose-600">{formatCurrency(order.earnings?.sellerCommission ?? order.pricing?.restaurantCommission)}</span>
                            </div>
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seller Receivable</span>
                                <span className="text-sm font-bold text-emerald-600">{formatCurrency(order.earnings?.sellerReceivable ?? order.sellerOrder?.pricing?.receivable)}</span>
                            </div>
                            {currentStatus.includes('cancel') ? (
                                <div className="flex items-center justify-between w-full max-w-[280px]">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">If Delivered (seller)</span>
                                    <span className="text-sm font-bold text-slate-500">{formatCurrency(order.earnings?.sellerReceivableIfDelivered)}</span>
                                </div>
                            ) : null}
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admin Earned</span>
                                <span className="text-sm font-bold text-purple-600">{formatCurrency(order.earnings?.adminEarned)}</span>
                            </div>
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rider Earned</span>
                                <span className="text-sm font-bold text-indigo-600">{formatCurrency(order.earnings?.riderEarned ?? order.riderEarning)}</span>
                            </div>
                            {currentStatus.includes('cancel') ? (
                                <p className="w-full max-w-[280px] text-[10px] font-semibold text-slate-500 text-left">
                                    Cancelled {order.earnings?.isCod ? 'COD' : 'prepaid'}: seller earned ₹{Number(order.earnings?.sellerReceivable || 0).toFixed(2)}
                                    {order.earnings?.isCod ? ' (no packing credit on unpaid COD).' : ' (packing retained).'} Admin earned ₹0.
                                </p>
                            ) : null}
                            <div className="h-px w-full max-w-[280px] bg-slate-200 my-2" />
                            <div className="flex items-center justify-between w-full max-w-[280px]">
                                <span className="text-xs font-black text-slate-900 uppercase tracking-tight">Total Payable</span>
                                <span className="text-2xl font-black text-fuchsia-600">{formatCurrency(order.pricing?.total)}</span>
                            </div>
                        </div>
                    </Card>

                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl p-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Store className="h-4 w-4" />
                            Shop Node Information
                        </h4>
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 bg-primary/5 rounded-2xl flex items-center justify-center font-black text-slate-900 uppercase overflow-hidden ring-1 ring-slate-100">
                                {sellerImage ? (
                                    <img
                                        src={sellerImage}
                                        alt={order.seller?.shopName || 'Shop'}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    order.seller?.shopName?.[0] || 'S'
                                )}
                            </div>
                            <div className="text-left min-w-0">
                                <h3 className="text-lg font-black text-slate-900 leading-tight truncate">
                                    {order.seller?.shopName || 'Unknown Shop'}
                                </h3>
                                <p className="text-xs font-bold text-emerald-600 uppercase tracking-tighter">
                                    {order.seller?.businessType || 'Verified Anchor Partner'}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                                    Owner: {order.seller?.name || 'NA'}
                                </p>
                                {sellerNodeId ? (
                                    <p className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
                                        Node ID: {sellerNodeId}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        <div className="mt-5 space-y-2 text-left">
                            {sellerPhone ? (
                                <p className="text-[11px] font-bold text-slate-500 flex items-center gap-2">
                                    <Phone className="h-3.5 w-3.5" />
                                    <a href={`tel:${sellerPhone}`} className="hover:text-primary">{sellerPhone}</a>
                                </p>
                            ) : null}
                            {sellerEmail ? (
                                <p className="text-[11px] font-bold text-slate-500 flex items-center gap-2">
                                    <Mail className="h-3.5 w-3.5" /> {sellerEmail}
                                </p>
                            ) : null}
                            {sellerAddress ? (
                                <p className="text-[11px] font-semibold text-slate-500 leading-relaxed flex items-start gap-2">
                                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span>{sellerAddress}</span>
                                </p>
                            ) : null}
                        </div>
                    </Card>

                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl p-6">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-3">
                            <Navigation className="h-4 w-4 text-emerald-500" />
                            Logistical Real-time State
                        </h3>
                        {currentStatus.includes('cancel') && cancellationReason ? (
                            <div className="mb-6 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2">
                                    Cancellation Reason
                                </p>
                                <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                                    {cancellationReason}
                                </p>
                            </div>
                        ) : null}
                        <div className="space-y-6 relative ml-4">
                            <div className="absolute top-0 bottom-0 left-[7.5px] w-0.5 bg-slate-100" />
                            {statusHistory.length > 0 ? (
                                [...statusHistory]
                                    .slice()
                                    .reverse()
                                    .map((entry, idx) => {
                                        const toStatus = String(entry?.to || entry?.status || 'update').replace(/_/g, ' ');
                                        const fromStatus = String(entry?.from || '').replace(/_/g, ' ');
                                        return (
                                            <div key={`${toStatus}-${idx}`} className="flex gap-6 relative">
                                                <div className={cn(
                                                    "h-4 w-4 rounded-full ring-4 ring-white z-10 mt-1 shadow-lg",
                                                    idx === 0 ? "bg-emerald-500 shadow-emerald-200" : "bg-slate-300 shadow-slate-100",
                                                )} />
                                                <div className="flex-1 pb-4">
                                                    <div className="flex items-center justify-between mb-1 gap-3">
                                                        <h4 className="text-xs font-black uppercase tracking-tight text-slate-900">
                                                            {toStatus}
                                                        </h4>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">
                                                            {formatDateTime(entry?.at || entry?.createdAt || entry?.timestamp)}
                                                        </span>
                                                    </div>
                                                    {fromStatus ? (
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                                            From: {fromStatus}
                                                        </p>
                                                    ) : null}
                                                    <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                                                        {entry?.note || `Updated by ${entry?.byRole || 'SYSTEM'}`}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                            ) : (
                                <div className="flex gap-6 relative">
                                    <div className="h-4 w-4 rounded-full ring-4 ring-white z-10 mt-1 bg-emerald-500 shadow-lg shadow-emerald-200" />
                                    <div className="flex-1 pb-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="text-xs font-black uppercase tracking-tight text-slate-900">
                                                Status: {currentStatus.replace(/_/g, ' ')}
                                            </h4>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{formatDateTime(order.updatedAt)}</span>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-400 leading-relaxed italic">
                                            System verified current logistical state as {currentStatus}.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl p-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Customer Node Information
                        </h4>
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 bg-primary/5 rounded-2xl flex items-center justify-center font-black text-indigo-600 uppercase overflow-hidden ring-1 ring-slate-100">
                                {customerImage ? (
                                    <img
                                        src={customerImage}
                                        alt={order.customer?.name || 'Customer'}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    order.customer?.name?.split(' ').map((name) => name[0]).join('') || 'C'
                                )}
                            </div>
                            <div className="text-left min-w-0">
                                <h3 className="text-lg font-black text-slate-900 leading-tight">{order.customer?.name || 'Unknown'}</h3>
                                <p className="text-xs font-bold text-slate-400 truncate">
                                    Node ID: {customerNodeId || 'NA'}
                                </p>
                            </div>
                        </div>
                        <div className="space-y-6 text-left mt-6">
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-3">
                                    <Mail className="h-3.5 w-3.5" /> {order.customer?.email || 'NA'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-3">
                                    <Phone className="h-3.5 w-3.5" />
                                    {customerPhone ? (
                                        <a href={`tel:${customerPhone}`} className="hover:text-primary transition-colors">
                                            {customerPhone}
                                        </a>
                                    ) : (
                                        'NA'
                                    )}
                                </span>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Destination Protocol</span>
                                    {customerLocation &&
                                        typeof customerLocation.lat === 'number' &&
                                        typeof customerLocation.lng === 'number' && (
                                            <button
                                                type="button"
                                                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${customerLocation.lat},${customerLocation.lng}`, '_blank')}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-primary hover:bg-primary/5 transition-colors"
                                            >
                                                <MapPin className="h-3 w-3" />
                                                Open in Maps
                                            </button>
                                        )}
                                </div>
                                <p className="text-xs font-bold text-slate-600 leading-relaxed italic">
                                    {formattedAddress || customerAddress?.address || 'NA'}
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl p-6 text-left">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Truck className="h-3.5 w-3.5" /> Logistical Agent
                                </h4>
                                <Badge variant={deliveryBoy ? 'success' : 'secondary'} className="text-[8px] font-black uppercase tracking-widest">
                                    {deliveryBoy ? 'ASSIGNED' : 'UNASSIGNED'}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                                <div className="h-10 w-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-300 overflow-hidden">
                                    {deliveryBoy ? (
                                        <div className="h-full w-full flex items-center justify-center font-black text-slate-400 bg-emerald-50">{String(deliveryBoy?.name || 'R').charAt(0)}</div>
                                    ) : (
                                        <User className="h-5 w-5" />
                                    )}
                                </div>
                                <div>
                                    <h5 className="text-sm font-black text-slate-900">{deliveryBoy?.name || 'Pending Rider Assignment'}</h5>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Contact: {deliveryBoy?.phone || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl overflow-hidden text-left">
                        <div className="p-6 bg-primary text-white">
                            <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-white">
                                <CreditCard className="h-4 w-4 text-emerald-400" />
                                Payment Vector
                            </h4>
                        </div>
                        <div className="p-4 space-y-6">
                            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Protocol Summary</span>
                                <Badge className={cn(
                                    'border-none text-[8px] font-black uppercase',
                                    ['paid', 'captured', 'completed', 'refunded'].includes(String(order.payment?.status || '').toLowerCase())
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : String(order.payment?.status || '').toLowerCase().includes('fail')
                                            ? 'bg-rose-100 text-rose-700'
                                            : 'bg-amber-100 text-amber-700',
                                )}>
                                    {order.payment?.status || 'PENDING'}
                                </Badge>
                            </div>
                            <div className="px-2 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer Paid</span>
                                    <span className="text-sm font-black text-slate-900">{formatCurrency(order.pricing?.total || order.total)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Seller Earned</span>
                                    <span className="text-sm font-black text-emerald-600">{formatCurrency(earnings.sellerReceivable)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Seller Commission</span>
                                    <span className="text-sm font-black text-rose-600">{formatCurrency(earnings.sellerCommission ?? order.pricing?.restaurantCommission)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Admin Earned</span>
                                    <span className="text-sm font-black text-purple-600">{formatCurrency(earnings.adminEarned)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Packing (bill)</span>
                                    <span className="text-sm font-black text-slate-700">{formatCurrency(earnings.packingFee || order.pricing?.packagingFee)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Packing to Seller</span>
                                    <span className="text-sm font-black text-emerald-700">{formatCurrency(earnings.packingToSeller ?? (currentStatus.includes('cancel') ? 0 : earnings.packingFee))}</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between px-2 gap-3">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">TXN Hash</span>
                                <div className="flex items-center gap-2 min-w-0">
                                    <span
                                        className="text-[10px] font-black text-slate-700 truncate max-w-[160px]"
                                        title={txnDisplay}
                                    >
                                        {txnDisplay}
                                    </span>
                                    {txnHash && !txnHash.startsWith('COD') ? (
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard(txnHash, 'Transaction ID')}
                                            className="p-1.5 hover:bg-slate-50 rounded-md text-slate-400"
                                        >
                                            <Copy className="h-3 w-3" />
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                            <div className="flex items-center justify-between px-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gateway Method</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{order.payment?.method || 'CASH'}</span>
                            </div>
                        </div>
                    </Card>

                    <Card className="border-none shadow-xl ring-1 ring-amber-100 bg-amber-50/30 rounded-xl p-6 text-left">
                        <h4 className="text-[10px] font-black text-amber-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Info className="h-4 w-4" />
                            Intelligence Notes
                        </h4>
                        <p className="text-xs font-bold text-amber-800 leading-relaxed italic">
                            {order.cancelReason
                                ? `Cancellation Payload: ${order.cancelReason}`
                                : `Delivery window scheduled for ${order.timeSlot || 'NA'}. Instructions: Follow local logistical protocols.`}
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    );
}
