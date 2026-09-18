import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, Truck, Clock, XCircle, Activity, IndianRupee, MapPin, ArrowRight,
} from "lucide-react";
import {
  PageHeader,
  StatCard,
  SectionCard,
  AdminTable,
  StatusBadge,
  FilterBar,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import porterAdminApi from "../services/adminApi";
import { formatCurrency, formatDateTime } from "../utils/porterTableHelpers";
import {
  PORTER_DASHBOARD_PERIODS,
  buildPorterDashboardQuery,
  getPorterDashboardPeriodLabel,
  isValidPorterCustomRange,
} from "../utils/porterDashboardDateRange";

const EMPTY_KPIS = {
  totalOrders: 0,
  activeVehicles: 0,
  activeZones: 0,
  revenue: 0,
  inTransit: 0,
  completed: 0,
  pending: 0,
  cancelled: 0,
};

const STATUS_TONE = {
  searching: "warning",
  assigned: "info",
  en_route_pickup: "info",
  at_pickup: "primary",
  in_transit: "primary",
  at_drop: "primary",
  completed: "success",
  cancelled_by_user: "danger",
  cancelled_by_driver: "danger",
  cancelled_by_system: "danger",
  quoted: "default",
};

const selectCls =
  "h-10 min-w-[140px] rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2F6BFF] focus:ring-4 focus:ring-[#2F6BFF]/10";

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [recentOrders, setRecentOrders] = useState([]);
  const [period, setPeriod] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const periodLabel = useMemo(() => getPorterDashboardPeriodLabel(period), [period]);

  const load = useCallback(async () => {
    if (period === "custom" && !customFrom) {
      setLoading(false);
      return;
    }

    if (!isValidPorterCustomRange(period, customFrom, customTo)) {
      toast.error("Pick a valid custom date range");
      return;
    }

    setLoading(true);
    try {
      const data = await porterAdminApi.getDashboard(
        buildPorterDashboardQuery(period, customFrom, customTo),
      );
      const nextKpis = data.kpis || EMPTY_KPIS;

      setKpis({
        totalOrders: Number(nextKpis.totalOrders || 0),
        activeVehicles: Number(nextKpis.activeVehicles || 0),
        activeZones: Number(nextKpis.activeZones || 0),
        revenue: Number(nextKpis.revenue || 0),
        inTransit: Number(nextKpis.inTransit || 0),
        completed: Number(nextKpis.completed || 0),
        pending: Number(nextKpis.pending || 0),
        cancelled: Number(nextKpis.cancelled || 0),
      });

      setRecentOrders(
        (data.recentTrips || []).map((trip) => ({
          id: trip.id || trip.tripNumber,
          pickup: trip.pickup || "—",
          drop: trip.drop || "—",
          amount: trip.amount || 0,
          status: trip.status,
          createdAt: trip.createdAt,
        })),
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load dashboard");
      setKpis(EMPTY_KPIS);
      setRecentOrders([]);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    load();
  }, [load]);

  const orderColumns = [
    { header: "Trip", key: "id", className: "font-medium", cell: (row) => <span className="font-semibold">{row.id}</span> },
    { header: "Pickup", key: "pickup", cell: (row) => <span className="text-sm">{row.pickup}</span> },
    { header: "Drop", key: "drop", cell: (row) => <span className="text-sm">{row.drop}</span> },
    { header: "Amount", key: "amount", cell: (row) => formatCurrency(row.amount) },
    {
      header: "Status",
      key: "status",
      cell: (row) => (
        <StatusBadge
          tone={STATUS_TONE[row.status] || "default"}
          label={String(row.status || "").replace(/_/g, " ")}
        />
      ),
    },
    {
      header: "Time",
      key: "createdAt",
      cell: (row) => <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>,
    },
  ];

  const ordersTitle = period === "today" ? "Completed Orders Today" : `${periodLabel} Completed Orders`;
  const revenueTitle = period === "today" ? "Revenue Today" : `${periodLabel} Revenue`;
  const cancelledTitle = period === "today" ? "Cancelled Today" : `${periodLabel} Cancelled`;

  return (
    <div className="just-order-theme-scope space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Porter Operations Dashboard"
        subtitle={`${periodLabel} tracking and analytics for your logistics fleet`}
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Porter", href: "/admin/porter" },
          { label: "Dashboard" },
        ]}
        actions={
          <div className="flex gap-3">
            <Button variant="outline" className="gap-2" onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button className="gap-2" onClick={() => navigate("/admin/porter/reports")}>
              View Reports <ArrowRight size={16} />
            </Button>
          </div>
        }
      />

      <FilterBar
        start={
          <>
            <select
              className={selectCls}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Date range"
            >
              {PORTER_DASHBOARD_PERIODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {period === "custom" ? (
              <>
                <Input
                  type="date"
                  className="h-10 w-auto min-w-[150px]"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label="From date"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  className="h-10 w-auto min-w-[150px]"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label="To date"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={load}
                  disabled={loading || !isValidPorterCustomRange(period, customFrom, customTo)}
                >
                  Apply
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title={ordersTitle} value={String(kpis.totalOrders)} icon={<Package size={18} />} />
        <StatCard title="Active Vehicles" value={String(kpis.activeVehicles)} icon={<Truck size={18} />} />
        <StatCard title="Active Zones" value={String(kpis.activeZones)} icon={<MapPin size={18} />} />
        <StatCard title={revenueTitle} value={formatCurrency(kpis.revenue)} icon={<IndianRupee size={18} />} />
        <StatCard title="In Progress" value={String(kpis.inTransit)} icon={<Activity size={18} />} />
        <StatCard title="Pending / Searching" value={String(kpis.pending)} icon={<Clock size={18} />} />
        <StatCard title={cancelledTitle} value={String(kpis.cancelled)} icon={<XCircle size={18} />} />
      </div>

      <SectionCard
        title={`Recent Trips · ${periodLabel}`}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/porter/orders")}>
            View All
          </Button>
        }
      >
        <div className="overflow-x-auto pb-4">
          <AdminTable columns={orderColumns} data={recentOrders} loading={loading} getRowId={(r) => r.id} />
        </div>
      </SectionCard>
    </div>
  );
};

export default Dashboard;
