import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, IndianRupee, CarTaxiFront, CheckCircle2, XCircle } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar, StatusBadge,
} from "@/shared/components/admin";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";
import { rideStatusMeta } from "../utils/rideStatuses";
import { filterBySearch, sortItems, paginateItems, formatCurrency, formatDateTime } from "../utils/taxiTableHelpers";

const selectCls = "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const COMPLETED = "completed";
const CANCELLED = new Set([
  "cancelled", "cancelled_by_rider", "cancelled_by_driver", "cancelled_by_system", "no_show",
]);

const Reports = () => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxiAdminApi.getRides({ limit: 200 });
      const mapped = (data.records || []).map((r) => ({
        id: r.id,
        rideNumber: r.rideNumber,
        customer: r.userId || "—",
        pickup: r.pickup?.address || "",
        drop: r.drop?.address || "",
        status: r.status,
        fare: Number(r.fare?.total ?? r.fareEstimateTotal ?? 0),
        vehicleType: r.vehicleType?.name || "—",
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      }));
      setRides(mapped);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load reports");
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let rows = filterBySearch(rides, search, ["id", "rideNumber", "customer", "pickup", "drop"]);
    if (statusFilter === "completed") rows = rows.filter((r) => r.status === COMPLETED);
    else if (statusFilter === "cancelled") rows = rows.filter((r) => CANCELLED.has(r.status));
    else if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    return sortItems(rows, "createdAt", "desc");
  }, [rides, search, statusFilter]);

  const { items: pageItems, total, totalPages } = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const summary = useMemo(() => {
    const completed = rides.filter((r) => r.status === COMPLETED);
    const cancelled = rides.filter((r) => CANCELLED.has(r.status));
    const revenue = completed.reduce((s, r) => s + r.fare, 0);
    return {
      total: rides.length,
      completed: completed.length,
      cancelled: cancelled.length,
      revenue,
    };
  }, [rides]);

  const dailySeries = useMemo(() => {
    const map = new Map();
    for (const r of rides) {
      if (!r.createdAt) continue;
      const day = new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      const cur = map.get(day) || { day, rides: 0, revenue: 0 };
      cur.rides += 1;
      if (r.status === COMPLETED) cur.revenue += r.fare;
      map.set(day, cur);
    }
    return Array.from(map.values()).slice(-14);
  }, [rides]);

  const columns = [
    { key: "rideNumber", header: "Ride", cell: (row) => <span className="font-semibold">{row.rideNumber || row.id}</span> },
    { key: "pickup", header: "Pickup", cell: (row) => <span className="text-sm">{row.pickup || "—"}</span> },
    { key: "drop", header: "Drop", cell: (row) => <span className="text-sm">{row.drop || "—"}</span> },
    { key: "vehicleType", header: "Vehicle" },
    { key: "fare", header: "Fare", cell: (row) => formatCurrency(row.fare) },
    {
      key: "status", header: "Status",
      cell: (row) => {
        const meta = rideStatusMeta(row.status);
        return <StatusBadge tone={meta.tone} label={meta.label} />;
      },
    },
    { key: "createdAt", header: "Created", cell: (row) => <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span> },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader title="Reports" description="Ride volume and revenue from live taxi data" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Rides" value={String(summary.total)} icon={<CarTaxiFront size={18} />} />
        <StatCard title="Completed" value={String(summary.completed)} icon={<CheckCircle2 size={18} />} />
        <StatCard title="Cancelled" value={String(summary.cancelled)} icon={<XCircle size={18} />} />
        <StatCard title="Revenue" value={formatCurrency(summary.revenue)} icon={<IndianRupee size={18} />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Rides by day">
          <div className="h-64">
            {dailySeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySeries} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="rides" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "No ride data yet"}
              </div>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Revenue by day">
          <div className="h-64">
            {dailySeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySeries} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "No revenue data yet"}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Ride ledger" flush>
        <div className="p-4 space-y-4">
          <FilterBar
            start={
              <div className="flex flex-wrap gap-2 w-full">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search rides..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
                <select className={selectCls} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="all">All status</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="in_progress">In progress</option>
                  <option value="searching">Searching</option>
                </select>
              </div>
            }
          />
          <AdminTable
            columns={columns}
            data={pageItems}
            loading={loading}
            getRowId={(r) => r.id}
            pagination={{
              page,
              pageSize,
              total,
              totalPages,
              onPageChange: setPage,
              onPageSizeChange: (s) => { setPageSize(s); setPage(1); },
            }}
            emptyState={{ title: "No rides to report", description: "Reports populate from real taxi bookings." }}
          />
        </div>
      </SectionCard>
    </div>
  );
};

export default Reports;
