import React, { useState, useMemo, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Download, Filter, Search, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildTransactionCsvRows, downloadCsv, getTransactionBreakdown } from '../utils/csvExportUtils';
import { getRefundStatusLabel, getReturnStatusLabel } from '@/shared/utils/orderStatus';

const TransactionReport = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [isExporting, setIsExporting] = useState(false);
    const [orders, setOrders] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchTransactions = async (requestedPage = 1, status = filterStatus) => {
        try {
            setLoading(true);
            const res = await adminApi.getOrders({
                page: requestedPage,
                limit: pageSize,
                ...(status && status !== 'all' ? { status } : {}),
            });
            if (res.data.success) {
                const payload = res.data.result || {};
                const data = Array.isArray(payload.items) ? payload.items : (res.data.results || []);
                setOrders(data);
                setTotal(typeof payload.total === 'number' ? payload.total : data.length);
                setPage(typeof payload.page === 'number' ? payload.page : requestedPage);
            }
        } catch (error) {
            toast.error("Failed to fetch transactions");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions(1, filterStatus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize, filterStatus]);

    const deliveredForCards = useMemo(
        () => orders.filter((o) => {
            const status = String(o.status || o.orderStatus || '').toLowerCase();
            return status === 'delivered' || status === 'completed';
        }),
        [orders],
    );

    const stats = useMemo(() => {
        // Cards always reflect delivered economics only.
        const source = filterStatus === 'delivered' ? orders : deliveredForCards;
        let totalUserPaid = 0;
        let totalSellerEarned = 0;
        let adminEarned = 0;
        let deliveryEarned = 0;
        let refundedToCustomers = 0;
        let recoveredFromSellers = 0;
        let returnPickupCost = 0;
        let returnCount = 0;

        source.forEach((order) => {
            const breakdown = getTransactionBreakdown(order);
            if (!breakdown.delivered && filterStatus !== 'delivered') return;
            totalUserPaid += breakdown.userPaid;
            totalSellerEarned += breakdown.sellerEarned;
            adminEarned += breakdown.adminEarned;
            deliveryEarned += breakdown.riderEarned;
            if (breakdown.hasReturn) {
                returnCount += 1;
                refundedToCustomers += breakdown.refundedToCustomer;
                recoveredFromSellers += breakdown.sellerRecovered;
                returnPickupCost += breakdown.returnPickupAdminExpense;
            }
        });

        return {
            totalUserPaid,
            totalSellerEarned,
            adminEarned,
            deliveryEarned,
            refundedToCustomers,
            recoveredFromSellers,
            returnPickupCost,
            returnCount,
            netUserPaid: Math.max(0, totalUserPaid - refundedToCustomers),
            netSellerEarned: totalSellerEarned - recoveredFromSellers,
            netAdminEarned: adminEarned - returnPickupCost,
        };
    }, [orders, deliveredForCards, filterStatus]);

    const filterOrders = (list) => list.filter((o) => {
        const orderIdStr = String(o.orderId || o.orderNumber || '').toLowerCase();
        const customerStr = String(o.customer?.name || '').toLowerCase();
        const sellerStr = String(o.storeName || o.seller?.shopName || o.seller?.name || '').toLowerCase();
        const search = searchTerm.toLowerCase();

        const matchesSearch = orderIdStr.includes(search) || customerStr.includes(search) || sellerStr.includes(search);
        return matchesSearch;
    });

    const filteredOrders = useMemo(() => filterOrders(orders), [orders, searchTerm]);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await adminApi.getOrders({
                page: 1,
                limit: 1000,
                ...(filterStatus !== 'all' ? { status: filterStatus } : {}),
            });

            const payload = res.data?.result || {};
            const allOrders = Array.isArray(payload.items) ? payload.items : (res.data?.results || []);
            const exportOrders = filterOrders(allOrders);

            if (!exportOrders.length) {
                toast.error('No transactions available to export');
                return;
            }

            const downloaded = downloadCsv(
                buildTransactionCsvRows(exportOrders),
                `transaction-report-${new Date().toISOString().split('T')[0]}.csv`,
            );

            if (downloaded) {
                toast.success('Report exported successfully');
            }
        } catch (error) {
            console.error('Transaction export error:', error);
            toast.error('Failed to export transaction report');
        } finally {
            setIsExporting(false);
        }
    };

    if (loading && page === 1 && orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading Report...</p>
            </div>
        );
    }

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Finance Reports</span>
                    </div>
                    <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                        Transaction Report
                    </h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                        Summary cards use delivered orders only. Table follows the status filter below.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchTransactions(1)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white ring-1 ring-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                        Refresh
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-all shadow-lg active:scale-95 group disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 group-hover:-translate-y-0.5 transition-transform" />}
                        Export CSV
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-6">
                <Card className="px-5 py-4 border border-slate-100 shadow-sm bg-white rounded-[20px]">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Delivered · User Paid</p>
                    <h3 className="text-2xl font-black text-indigo-600">₹{stats.totalUserPaid.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h3>
                    {stats.refundedToCustomers > 0 && (
                        <p className="text-[10px] font-bold text-slate-400 mt-1">
                            Net after refunds ₹{stats.netUserPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                    )}
                </Card>
                <Card className="px-5 py-4 border border-slate-100 shadow-sm bg-white rounded-[20px]">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Delivered · Seller Earned</p>
                    <h3 className="text-2xl font-black text-emerald-500">₹{stats.totalSellerEarned.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h3>
                    {stats.recoveredFromSellers > 0 && (
                        <p className="text-[10px] font-bold text-slate-400 mt-1">
                            Net after returns ₹{stats.netSellerEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                    )}
                </Card>
                <Card className="px-5 py-4 border border-slate-100 shadow-sm bg-white rounded-[20px]">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Delivered · Admin Earned</p>
                    <h3 className="text-2xl font-black text-purple-600">₹{stats.adminEarned.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h3>
                    {stats.returnPickupCost > 0 && (
                        <p className="text-[10px] font-bold text-slate-400 mt-1">
                            Net after pickup cost ₹{stats.netAdminEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                    )}
                </Card>
                <Card className="px-5 py-4 border border-slate-100 shadow-sm bg-white rounded-[20px]">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Delivered · Rider Earned</p>
                    <h3 className="text-2xl font-black text-orange-500">₹{stats.deliveryEarned.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h3>
                </Card>
                <Card className="px-5 py-4 border border-rose-100 shadow-sm bg-white rounded-[20px]">
                    <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">Returns · Refunded</p>
                    <h3 className="text-2xl font-black text-rose-500">₹{stats.refundedToCustomers.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h3>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">
                        {stats.returnCount} returned · ₹{stats.recoveredFromSellers.toLocaleString(undefined, { maximumFractionDigits: 0 })} recovered
                    </p>
                </Card>
            </div>

            <Card className="p-3 border border-slate-100 shadow-sm bg-white rounded-2xl mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:w-[400px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by Order ID, Customer, or Seller..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 w-full md:w-auto">
                        <Filter className="h-4 w-4 text-slate-400" />
                        <select
                            value={filterStatus}
                            onChange={(e) => {
                                setFilterStatus(e.target.value);
                                setPage(1);
                            }}
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer w-full md:w-auto"
                        >
                            <option value="all">All Statuses</option>
                            <option value="delivered">Completed / Delivered</option>
                            <option value="pending">Pending</option>
                            <option value="processed">Processed</option>
                            <option value="out-for-delivery">Out for Delivery</option>
                            <option value="returned">Returned</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                </div>
            </Card>

            <Card className="border border-slate-100 shadow-sm overflow-hidden bg-white rounded-2xl mt-6">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest whitespace-nowrap">Order ID & Date</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest">Customer</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest">Seller</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest whitespace-nowrap">Delivery Boy</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest whitespace-nowrap">User Paid</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest whitespace-nowrap">Seller Earned</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest whitespace-nowrap">Rider Earned</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest whitespace-nowrap">Admin Earned</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest whitespace-nowrap">Return / Refund</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-700 uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredOrders.map((order) => {
                                const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', {
                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                }) : 'N/A';

                                const breakdown = getTransactionBreakdown(order);

                                return (
                                    <tr key={order.id || order._id || order.orderId} className="hover:bg-slate-50/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-900">{order.orderId || order.orderNumber || order._id}</span>
                                                <span className="text-[10px] font-semibold text-slate-500 mt-0.5">{dateStr}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-bold text-slate-700">{order.customer?.name || 'Guest'}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-700">{order.storeName || order.seller?.shopName || order.seller?.name || 'Unknown'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-bold text-slate-700">
                                                {order.deliveryBoy?.name || order.rider?.name || 'Unassigned'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col min-w-[160px]">
                                                <span className="text-xs font-black text-slate-900 mb-1.5">
                                                    ₹{breakdown.userPaid.toFixed(2)}
                                                </span>
                                                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[9px] font-semibold text-slate-500 leading-relaxed">
                                                    <span>Subtotal</span>
                                                    <span className="text-right tabular-nums">₹{breakdown.subtotal.toFixed(2)}</span>
                                                    {breakdown.packingFee > 0 && (
                                                        <>
                                                            <span>Packing</span>
                                                            <span className="text-right tabular-nums">₹{breakdown.packingFee.toFixed(2)}</span>
                                                        </>
                                                    )}
                                                    {breakdown.deliveryFee > 0 && (
                                                        <>
                                                            <span>Delivery</span>
                                                            <span className="text-right tabular-nums">₹{breakdown.deliveryFee.toFixed(2)}</span>
                                                        </>
                                                    )}
                                                    {breakdown.platformFee > 0 && (
                                                        <>
                                                            <span>Platform</span>
                                                            <span className="text-right tabular-nums">₹{breakdown.platformFee.toFixed(2)}</span>
                                                        </>
                                                    )}
                                                    {breakdown.handling > 0 && (
                                                        <>
                                                            <span>Handling</span>
                                                            <span className="text-right tabular-nums">₹{breakdown.handling.toFixed(2)}</span>
                                                        </>
                                                    )}
                                                    {breakdown.tax > 0 && (
                                                        <>
                                                            <span>Tax / GST</span>
                                                            <span className="text-right tabular-nums">₹{breakdown.tax.toFixed(2)}</span>
                                                        </>
                                                    )}
                                                    {breakdown.discount > 0 && (
                                                        <>
                                                            <span className="text-rose-500">
                                                                Discount{breakdown.couponSource ? ` (${breakdown.couponSource})` : ''}
                                                            </span>
                                                            <span className="text-right tabular-nums text-rose-500">
                                                                -₹{breakdown.discount.toFixed(2)}
                                                            </span>
                                                        </>
                                                    )}
                                                    <span className="pt-0.5 border-t border-slate-100 font-bold text-slate-700">Total</span>
                                                    <span className="pt-0.5 border-t border-slate-100 text-right tabular-nums font-bold text-slate-700">
                                                        ₹{breakdown.userPaid.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-black text-emerald-500">₹{breakdown.sellerEarned.toFixed(2)}</span>
                                            {breakdown.sellerRecovered > 0 && (
                                                <p className="text-[9px] font-bold text-slate-500 mt-0.5">
                                                    Net ₹{breakdown.netSellerEarned.toFixed(2)}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-black text-indigo-600">₹{breakdown.riderEarned.toFixed(2)}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-black text-purple-600">₹{breakdown.adminEarned.toFixed(2)}</span>
                                            {breakdown.returnPickupAdminExpense > 0 && (
                                                <p className="text-[9px] font-bold text-slate-500 mt-0.5">
                                                    Pickup -₹{breakdown.returnPickupAdminExpense.toFixed(2)}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {breakdown.hasReturn ? (
                                                <div className="flex flex-col min-w-[130px]">
                                                    <Badge variant="secondary" className="w-fit text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider font-bold bg-rose-50 text-rose-600">
                                                        {getReturnStatusLabel(breakdown.returnStatus)}
                                                    </Badge>
                                                    <span className="text-[10px] font-bold text-slate-600 mt-1">
                                                        Refund ₹{breakdown.refundToCustomer.toFixed(2)} · {getRefundStatusLabel(breakdown.refundStatus)}
                                                    </span>
                                                    {breakdown.sellerRecovered > 0 && (
                                                        <span className="text-[9px] font-bold text-slate-400">
                                                            Seller debited ₹{breakdown.sellerRecovered.toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge variant={order.status === 'delivered' || order.status === 'completed' ? 'success' : 'secondary'} className="text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider font-bold">
                                                {order.status === 'delivered' ? 'Completed' : order.status}
                                            </Badge>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredOrders.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="10" className="px-6 py-12 text-center text-slate-400 font-bold text-sm">
                                        No transactions found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30">
                    <Pagination
                        page={page}
                        totalPages={Math.ceil(total / pageSize) || 1}
                        total={total}
                        pageSize={pageSize}
                        onPageChange={(p) => fetchTransactions(p)}
                        onPageSizeChange={(newSize) => {
                            setPageSize(newSize);
                            setPage(1);
                        }}
                        loading={loading}
                    />
                </div>
            </Card>
        </div>
    );
};

export default TransactionReport;
