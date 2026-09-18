import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Package, Eye, Truck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar, StatusBadge,
  FormLayout, FormSection, FormRow, FormField,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import porterAdminApi from "../services/adminApi";
import { formatCurrency, formatDateTime } from "../utils/porterTableHelpers";

const ORDER_STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "searching", label: "Searching" },
  { value: "assigned", label: "Assigned" },
  { value: "en_route_pickup", label: "En Route" },
  { value: "at_pickup", label: "At Pickup" },
  { value: "in_transit", label: "In Transit" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_LABELS = {
  quoted: "Quoted",
  searching: "Searching",
  assigned: "Assigned",
  en_route_pickup: "En Route Pickup",
  at_pickup: "At Pickup",
  in_transit: "In Transit",
  at_drop: "At Drop",
  completed: "Completed",
  cancelled_by_user: "Cancelled by User",
  cancelled_by_driver: "Cancelled by Driver",
  cancelled_by_system: "Cancelled by System",
};

const STATUS_TONES = {
  quoted: "default",
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
};

const CANCELLED_STATUSES = ["cancelled_by_user", "cancelled_by_driver", "cancelled_by_system"];
const IN_PROGRESS = ["assigned", "en_route_pickup", "at_pickup", "in_transit", "at_drop"];

const mapTripToRow = (trip) => ({
  id: trip.id,
  tripNumber: trip.tripNumber || trip.id,
  customer: trip.parcel?.receiverName || trip.userId || "—",
  customerPhone: trip.parcel?.receiverPhone || "—",
  pickup: trip.pickup?.address || "—",
  pickupAddress: trip.pickup?.address || "—",
  drop: trip.drop?.address || "—",
  dropAddress: trip.drop?.address || "—",
  driverId: trip.dispatch?.deliveryPartnerId || null,
  driverName: trip.dispatch?.deliveryPartnerId ? "Assigned" : "Unassigned",
  vehicle: trip.vehicle?.name || "—",
  goodsType: trip.parcel?.category || trip.parcel?.description || "—",
  weightKg: trip.parcel?.weightKg ?? null,
  distanceKm: Number(trip.distanceKm || 0),
  amount: Number(trip.fareEstimateTotal || trip.fare?.total || 0),
  paymentStatus: trip.payment?.status || trip.payment?.method || "—",
  status: trip.status || "quoted",
  createdAt: trip.createdAt,
  assignedAt: trip.assignedAt,
  arrivedAt: trip.arrivedAt,
  startedAt: trip.startedAt,
  completedAt: trip.completedAt,
  cancelledAt: trip.cancelledAt,
  cancelReason: trip.cancelReason || "",
  raw: trip,
});

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: pageSize,
        sortBy: "createdAt",
        sortOrder: "desc",
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== "all") params.status = statusFilter;
      else if (activeTab !== "all" && activeTab !== "cancelled") params.status = activeTab;

      const result = await porterAdminApi.getTrips(params);
      let rows = (result.records || []).map(mapTripToRow);

      if (activeTab === "cancelled") {
        rows = rows.filter((r) => CANCELLED_STATUSES.includes(r.status));
      }

      setOrders(rows);
      setTotal(result.total || rows.length);
      setTotalPages(result.pages || 1);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load orders");
      setOrders([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, activeTab]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const tabCounts = useMemo(() => {
    const counts = { all: total };
    for (const o of orders) {
      if (CANCELLED_STATUSES.includes(o.status)) {
        counts.cancelled = (counts.cancelled || 0) + 1;
      } else {
        counts[o.status] = (counts[o.status] || 0) + 1;
      }
    }
    return counts;
  }, [orders, total]);

  const stats = useMemo(() => ({
    total,
    pending: orders.filter((o) => o.status === "searching" || o.status === "quoted").length,
    inTransit: orders.filter((o) => IN_PROGRESS.includes(o.status)).length,
    delivered: orders.filter((o) => o.status === "completed").length,
    revenue: orders
      .filter((o) => o.status === "completed")
      .reduce((a, o) => a + o.amount, 0),
  }), [orders, total]);

  const openDetail = async (row) => {
    setSelected(row);
    setDetailOpen(true);
    try {
      const trip = await porterAdminApi.getTripById(row.id);
      setSelected(mapTripToRow(trip));
    } catch {
      /* keep list row */
    }
  };

  const timeline = (row) => {
    if (!row) return [];
    const steps = [
      { label: "Created", at: row.createdAt, status: "completed" },
      { label: "Assigned", at: row.assignedAt, status: row.assignedAt ? "completed" : "pending" },
      { label: "Arrived at Pickup", at: row.arrivedAt, status: row.arrivedAt ? "completed" : "pending" },
      { label: "Started", at: row.startedAt, status: row.startedAt ? "completed" : "pending" },
      { label: "Completed", at: row.completedAt, status: row.completedAt ? "completed" : "pending" },
    ];
    if (row.cancelledAt) {
      steps.push({
        label: `Cancelled${row.cancelReason ? `: ${row.cancelReason}` : ""}`,
        at: row.cancelledAt,
        status: "cancelled",
      });
    }
    return steps.filter((s) => s.at || s.status === "pending");
  };

  const columns = [
    { key: "tripNumber", header: "Trip", cell: (row) => <span className="font-semibold">{row.tripNumber}</span> },
    { key: "customer", header: "Receiver" },
    { key: "pickup", header: "Pickup", cell: (row) => <span className="text-sm line-clamp-1 max-w-[160px]">{row.pickup}</span> },
    { key: "drop", header: "Drop", cell: (row) => <span className="text-sm line-clamp-1 max-w-[160px]">{row.drop}</span> },
    { key: "driverName", header: "Driver" },
    { key: "vehicle", header: "Vehicle" },
    { key: "goodsType", header: "Parcel" },
    { key: "distanceKm", header: "Distance", cell: (row) => `${row.distanceKm} km` },
    { key: "amount", header: "Amount", cell: (row) => formatCurrency(row.amount) },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge
          tone={STATUS_TONES[row.status] || "default"}
          label={STATUS_LABELS[row.status] || row.status}
        />
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (row) => <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <Button variant="ghost" size="sm" onClick={() => openDetail(row)}>
          <Eye size={14} />
        </Button>
      ),
    },
  ];

  const selectCls =
    "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Orders"
        description="Logistics trip management and tracking"
        actions={
          <Button variant="outline" className="gap-2" onClick={fetchOrders} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 bg-[#FAF7F2]/90 backdrop-blur border-b border-[#EDE8E0]">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {ORDER_STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.value;
            const count = tabCounts[tab.value] || 0;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setActiveTab(tab.value);
                  setStatusFilter("all");
                  setPage(1);
                }}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 border ${
                  isActive
                    ? "bg-[var(--just-order-primary)] text-white border-[var(--just-order-primary)] shadow-sm"
                    : "bg-white text-[#5C5247] border-[#EDE8E0] hover:border-[var(--just-order-primary)] hover:text-[var(--just-order-primary)]"
                }`}
              >
                {tab.label}
                <span
                  className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold ${
                    isActive ? "bg-white/25 text-white" : "bg-[#F4F4F5] text-[#52525B]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title="Total Orders" value={String(stats.total)} icon={<Package size={18} />} />
        <StatCard title="Pending" value={String(stats.pending)} />
        <StatCard title="In Progress" value={String(stats.inTransit)} icon={<Truck size={18} />} />
        <StatCard title="Completed" value={String(stats.delivered)} />
        <StatCard title="Revenue (page)" value={formatCurrency(stats.revenue)} />
      </div>

      <SectionCard flush>
        <div className="p-4 space-y-4">
          <FilterBar
            start={
              <div className="flex flex-wrap gap-2 w-full">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search trips..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <select
                  className={selectCls}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setActiveTab("all");
                    setPage(1);
                  }}
                >
                  <option value="all">All Status</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            }
          />
          <AdminTable
            columns={columns}
            data={orders}
            getRowId={(r) => r.id}
            loading={loading}
            pagination={{
              page,
              totalPages,
              total,
              pageSize,
              onPageChange: setPage,
              onPageSizeChange: (s) => {
                setPageSize(s);
                setPage(1);
              },
            }}
          />
        </div>
      </SectionCard>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="just-order-theme-scope sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trip {selected?.tripNumber}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="px-6 py-4">
              <FormLayout>
                <div className="flex flex-wrap gap-2 mb-4">
                  <StatusBadge
                    tone={STATUS_TONES[selected.status] || "default"}
                    label={STATUS_LABELS[selected.status] || selected.status}
                  />
                  <StatusBadge status="info" label={selected.paymentStatus} />
                  {selected.goodsType !== "—" && (
                    <StatusBadge status="neutral" label={selected.goodsType} />
                  )}
                </div>

                <FormSection title="Trip Summary">
                  <FormRow>
                    <FormField label="Receiver">
                      <div className="text-sm font-medium">{selected.customer}</div>
                    </FormField>
                    <FormField label="Phone">
                      <div className="text-sm font-medium">{selected.customerPhone}</div>
                    </FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Driver">
                      <div className="text-sm font-medium">{selected.driverName}</div>
                    </FormField>
                    <FormField label="Vehicle">
                      <div className="text-sm font-medium">{selected.vehicle}</div>
                    </FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Distance">
                      <div className="text-sm font-medium">{selected.distanceKm} km</div>
                    </FormField>
                    <FormField label="Amount">
                      <div className="text-sm font-medium text-emerald-600">
                        {formatCurrency(selected.amount)}
                      </div>
                    </FormField>
                  </FormRow>
                  {selected.weightKg != null && (
                    <FormField label="Weight">
                      <div className="text-sm font-medium">{selected.weightKg} kg</div>
                    </FormField>
                  )}
                </FormSection>

                <FormSection title="Locations">
                  <div className="space-y-3 text-sm">
                    <div className="p-3 border rounded-lg bg-gray-50/50">
                      <p className="font-semibold">Pickup</p>
                      <p className="text-muted-foreground">{selected.pickupAddress}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-gray-50/50">
                      <p className="font-semibold">Drop</p>
                      <p className="text-muted-foreground">{selected.dropAddress}</p>
                    </div>
                  </div>
                </FormSection>

                <FormSection title="Timeline">
                  <div className="space-y-3">
                    {timeline(selected).map((step, i) => (
                      <div key={i} className="flex justify-between gap-3 text-sm">
                        <span className="font-medium">{step.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {step.at ? formatDateTime(step.at) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </FormSection>
              </FormLayout>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
