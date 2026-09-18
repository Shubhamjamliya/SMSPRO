import React, { useEffect, useMemo, useState } from "react";
import {
  Search, Eye, CarTaxiFront, MapPin, IndianRupee, CheckCircle2, Circle, XCircle,
} from "lucide-react";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar, StatusBadge,
  FormLayout, FormSection, FormRow, FormField,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";
import { rideStatusMeta } from "../utils/rideStatuses";
import { filterBySearch, sortItems, paginateItems, formatCurrency, formatDateTime } from "../utils/taxiTableHelpers";

const PAGE_CONFIG = {
  requests: {
    title: "Ride Requests",
    description: "Pending ride requests awaiting driver assignment",
    statuses: ["requested", "searching"],
  },
  active: {
    title: "Active Rides",
    description: "Rides currently assigned, arriving, in progress or awaiting payment",
    statuses: ["assigned", "arriving", "arrived", "in_progress", "awaiting_payment"],
  },
  completed: {
    title: "Completed Rides",
    description: "Successfully finished trips",
    statuses: ["completed"],
  },
  cancelled: {
    title: "Cancelled Rides",
    description: "Trips cancelled by customer, driver or admin",
    statuses: ["cancelled_by_rider", "cancelled_by_driver", "cancelled_by_system", "no_show", "cancelled"],
  },
};

const selectCls = "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const buildTimeline = (r) => {
  const steps = [];
  if (r.createdAt) steps.push({ label: "Requested", status: "completed", at: r.createdAt });
  if (r.assignedAt) steps.push({ label: "Driver assigned", status: "completed", at: r.assignedAt });
  if (r.arrivedAt) steps.push({ label: "Driver arrived", status: "completed", at: r.arrivedAt });
  if (r.startedAt) steps.push({ label: "Trip started", status: "completed", at: r.startedAt });
  if (r.reachedDropAt) steps.push({ label: "Reached drop · awaiting payment", status: "completed", at: r.reachedDropAt });
  if (r.payment?.paidAt) {
    steps.push({
      label: `Payment ${r.payment?.method ? `(${r.payment.method})` : ""}`.trim(),
      status: "completed",
      at: r.payment.paidAt,
    });
  } else if (r.status === "awaiting_payment") {
    steps.push({ label: "Awaiting payment", status: "pending", at: null });
  }
  if (r.completedAt) steps.push({ label: "Completed", status: "completed", at: r.completedAt });
  if (r.cancelledAt) steps.push({ label: "Cancelled", status: "cancelled", at: r.cancelledAt });
  if (!steps.length) steps.push({ label: rideStatusMeta(r.status).label, status: "pending", at: null });
  return steps;
};

const Rides = ({ statusKey = "requests" }) => {
  const config = PAGE_CONFIG[statusKey] || PAGE_CONFIG.requests;

  const [rides, setRides] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, types] = await Promise.all([
          taxiAdminApi.getRides({ limit: 100 }),
          taxiAdminApi.getVehicleTypeDropdown().catch(() => []),
        ]);
        if (cancelled) return;
        const mapped = (data.records || []).map((r) => ({
          id: r.id,
          rideNumber: r.rideNumber,
          customer: r.userId || "—",
          pickup: r.pickup?.address || "",
          drop: r.drop?.address || "",
          status: r.status,
          fare: Number(r.fare?.total ?? r.fareEstimateTotal ?? 0),
          fareBreakdown: r.fareBreakdown || r.fare || null,
          distanceKm: Number(r.distanceKm || 0),
          durationMin: Number(r.durationMin || 0),
          waitingMin: Number(r.waitingMin || 0),
          vehicleType: r.vehicleType?.name || r.vehicleTypeId || "—",
          paymentMethod: r.payment?.method || "cash",
          paymentStatus: r.payment?.status || "",
          driverName: r.dispatch?.deliveryPartnerId || "—",
          cancelReason: r.cancelReason || "",
          rating: r.userRating ?? r.driverRating ?? null,
          otp: r.rideOtp,
          createdAt: r.createdAt,
          assignedAt: r.assignedAt,
          arrivedAt: r.arrivedAt,
          startedAt: r.startedAt,
          reachedDropAt: r.reachedDropAt,
          completedAt: r.completedAt,
          cancelledAt: r.cancelledAt,
          timeline: buildTimeline(r),
          raw: r,
        }));
        setRides(mapped);
        setVehicleTypes(types || []);
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.response?.data?.message || "Failed to load rides");
          setRides([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [statusKey]);

  const scoped = useMemo(
    () => rides.filter((r) => config.statuses.includes(r.status)),
    [rides, config],
  );

  const filtered = useMemo(() => {
    let rows = filterBySearch(scoped, search, ["id", "rideNumber", "customer", "pickup", "drop", "driverName"]);
    if (vehicleFilter !== "all") rows = rows.filter((r) => r.vehicleType === vehicleFilter);
    if (paymentFilter !== "all") rows = rows.filter((r) => r.paymentMethod === paymentFilter);
    if (dateFrom) rows = rows.filter((r) => new Date(r.createdAt) >= new Date(dateFrom));
    if (dateTo) rows = rows.filter((r) => new Date(r.createdAt) <= new Date(`${dateTo}T23:59:59`));
    return sortItems(rows, "createdAt", "desc");
  }, [scoped, search, vehicleFilter, paymentFilter, dateFrom, dateTo]);

  const { items: pageItems, total, totalPages } = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const stats = useMemo(() => ({
    count: scoped.length,
    revenue: scoped.reduce((sum, r) => sum + (r.status === "completed" ? r.fare : 0), 0),
    avgDistance: scoped.length
      ? (scoped.reduce((sum, r) => sum + r.distanceKm, 0) / scoped.length).toFixed(1)
      : 0,
  }), [scoped]);

  const openDetail = (row) => { setSelected(row); setDetailOpen(true); };

  const columns = [
    { key: "rideNumber", header: "Ride ID", cell: (row) => <span className="font-semibold">{row.rideNumber || row.id}</span> },
    { key: "customer", header: "Customer", cell: (row) => <span className="text-xs font-mono">{String(row.customer).slice(-8)}</span> },
    { key: "pickup", header: "Pickup", cell: (row) => (
        <span className="flex items-center space-x-1">
          <span className="text-xs truncate max-w-[120px]" title={row.pickup || "—"}>
            {row.pickup || "—"}
          </span>
          <Eye className="h-3 w-3 text-muted-foreground hover:text-primary" title={row.pickup || "—"} />
        </span>
      ) },
    { key: "drop", header: "Drop", cell: (row) => (
        <span className="flex items-center space-x-1">
          <span className="text-xs truncate max-w-[120px]" title={row.drop || "—"}>
            {row.drop || "—"}
          </span>
          <Eye className="h-3 w-3 text-muted-foreground hover:text-primary" title={row.drop || "—"} />
        </span>
      ) },
    { key: "driverName", header: "Driver", cell: (row) => <span className="text-xs font-mono">{row.driverName === "—" ? "—" : String(row.driverName).slice(-8)}</span> },
    { key: "vehicleType", header: "Vehicle" },
    { key: "distanceKm", header: "Distance", cell: (row) => `${row.distanceKm} km` },
    { key: "fare", header: "Fare", cell: (row) => formatCurrency(row.fare) },
    {
      key: "paymentMethod",
      header: "Payment",
      cell: (row) => (
        <span className="text-xs font-semibold uppercase text-gray-600">
          {row.paymentMethod}
          {row.paymentStatus ? ` · ${row.paymentStatus}` : ""}
        </span>
      ),
    },
    {
      key: "status", header: "Status",
      cell: (row) => {
        const meta = rideStatusMeta(row.status);
        return <StatusBadge tone={meta.tone} label={meta.label} />;
      },
    },
    ...(statusKey === "completed" ? [
      { key: "rating", header: "Rating", cell: (row) => (row.rating != null ? <span className="text-yellow-600 font-medium">★ {row.rating}</span> : "—") },
    ] : []),
    ...(statusKey === "cancelled" ? [
      { key: "cancelReason", header: "Reason", cell: (row) => <span className="text-xs text-muted-foreground">{row.cancelReason || "—"}</span> },
    ] : []),
    { key: "createdAt", header: "Created", cell: (row) => <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span> },
    {
      key: "actions", header: "Actions", align: "right",
      cell: (row) => (
        <Button variant="ghost" size="sm" onClick={() => openDetail(row)}><Eye size={14} /></Button>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader title={config.title} description={config.description} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard title={config.title} value={String(stats.count)} icon={<CarTaxiFront size={18} />} />
        <StatCard title="Avg Distance" value={`${stats.avgDistance} km`} icon={<MapPin size={18} />} />
        <StatCard
          title={statusKey === "completed" ? "Revenue" : "Est. Fare Value"}
          value={formatCurrency(statusKey === "completed" ? stats.revenue : scoped.reduce((s, r) => s + r.fare, 0))}
          icon={<IndianRupee size={18} />}
        />
      </div>

      <SectionCard flush>
        <div className="p-4 space-y-4">
          <FilterBar
            start={
              <div className="flex flex-wrap gap-2 w-full">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search rides..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <select className={selectCls} value={vehicleFilter} onChange={(e) => { setVehicleFilter(e.target.value); setPage(1); }}>
                  <option value="all">All Vehicles</option>
                  {vehicleTypes.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                </select>
                <select className={selectCls} value={paymentFilter} onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}>
                  <option value="all">All Payments</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="wallet">Wallet</option>
                </select>
                <Input type="date" className="w-auto" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
                <Input type="date" className="w-auto" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
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
            emptyState={{ title: "No rides in this view", description: "Live rides from the taxi API will appear here." }}
          />
        </div>
      </SectionCard>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="just-order-theme-scope sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pr-8"><DialogTitle>Ride {selected?.rideNumber || selected?.id}</DialogTitle></DialogHeader>
          {selected && (
            <div className="overflow-y-auto">
              <FormLayout>
                <div className="flex flex-wrap gap-2 mb-4">
                  <StatusBadge tone={rideStatusMeta(selected.status).tone} label={rideStatusMeta(selected.status).label} />
                  <StatusBadge status="neutral" label={selected.vehicleType} />
                  <StatusBadge status="neutral" label={(selected.paymentMethod || "cash").toUpperCase()} />
                  {selected.paymentStatus ? (
                    <StatusBadge
                      tone={selected.paymentStatus === "paid" ? "success" : "warning"}
                      label={`Payment ${selected.paymentStatus}`}
                    />
                  ) : null}
                </div>

                <FormSection title="Ride Summary">
                  <FormRow>
                    <FormField label="Customer"><div className="text-sm font-mono">{selected.customer}</div></FormField>
                    <FormField label="Driver"><div className="text-sm font-mono">{selected.driverName}</div></FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Distance">
                      <div className="text-sm font-medium">
                        {selected.distanceKm} km · {selected.durationMin} min
                        {selected.waitingMin ? ` · wait ${selected.waitingMin} min` : ""}
                      </div>
                    </FormField>
                    <FormField label="Fare"><div className="text-sm font-medium text-emerald-600">{formatCurrency(selected.fare)}</div></FormField>
                  </FormRow>
                  {selected.cancelReason ? (
                    <FormRow>
                      <FormField label="Cancellation Reason"><div className="text-sm text-red-600">{selected.cancelReason}</div></FormField>
                    </FormRow>
                  ) : null}
                </FormSection>

                {selected.fareBreakdown ? (
                  <FormSection title="Fare breakdown">
                    <div className="space-y-1.5 rounded-lg border bg-gray-50/80 px-3 py-3 text-sm">
                      {[
                        ["Base", selected.fareBreakdown.base],
                        ["Distance", selected.fareBreakdown.distance],
                        ["Time", selected.fareBreakdown.time],
                        ["Waiting", selected.fareBreakdown.waiting],
                        ["Surge", selected.fareBreakdown.surgeMultiplier != null && selected.fareBreakdown.surgeMultiplier !== 1
                          ? `×${selected.fareBreakdown.surgeMultiplier}`
                          : null],
                        [
                          selected.fareBreakdown.surgeSlotName
                            ? `${selected.fareBreakdown.surgeSlotName} surge`
                            : "Time-slot surge",
                          selected.fareBreakdown.timeSlotSurge > 0
                            ? selected.fareBreakdown.timeSlotSurge
                            : null,
                        ],
                        ["Subtotal", selected.fareBreakdown.subtotal],
                        ["Platform fee", selected.fareBreakdown.platformFee],
                        [
                          selected.fareBreakdown.adminCommissionPercent
                            ? `Admin commission (${selected.fareBreakdown.adminCommissionPercent}%)`
                            : "Admin commission",
                          selected.fareBreakdown.adminCommissionAmount > 0
                            ? selected.fareBreakdown.adminCommissionAmount
                            : null,
                        ],
                        ["Driver share", selected.fareBreakdown.driverShare > 0
                          ? selected.fareBreakdown.driverShare
                          : null],
                        ["Total", selected.fareBreakdown.total ?? selected.fare],
                      ]
                        .filter(([, v]) => v != null && v !== "")
                        .map(([label, value]) => (
                          <div key={label} className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-medium text-gray-900">
                              {typeof value === "string" ? value : formatCurrency(value)}
                            </span>
                          </div>
                        ))}
                      {selected.fareBreakdown.slabLabel || selected.fareBreakdown.slabRange ? (
                        <p className="pt-1 text-xs text-muted-foreground">
                          Slab: {selected.fareBreakdown.slabLabel || selected.fareBreakdown.slabRange}
                        </p>
                      ) : null}
                    </div>
                  </FormSection>
                ) : null}

                <FormSection title="Route">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 text-sm p-3 border rounded-lg bg-gray-50/50">
                      <MapPin size={16} className="mt-0.5 text-green-600 shrink-0" />
                      <div><p className="font-semibold text-gray-900">Pickup</p><p className="text-muted-foreground">{selected.pickup || "—"}</p></div>
                    </div>
                    <div className="flex items-start gap-3 text-sm p-3 border rounded-lg bg-gray-50/50">
                      <MapPin size={16} className="mt-0.5 text-red-600 shrink-0" />
                      <div><p className="font-semibold text-gray-900">Drop</p><p className="text-muted-foreground">{selected.drop || "—"}</p></div>
                    </div>
                  </div>
                </FormSection>

                <FormSection title="Trip Timeline">
                  <div className="space-y-4 pl-2">
                    {(selected.timeline || []).map((step, i) => (
                      <div key={i} className="flex gap-4 relative">
                        {i !== (selected.timeline || []).length - 1 && (
                          <div className="absolute left-[11px] top-6 bottom-[-16px] w-[2px] bg-gray-200" />
                        )}
                        <div className="relative z-10 shrink-0 mt-1">
                          {step.status === "completed" ? <CheckCircle2 size={24} className="text-green-600 bg-white" /> :
                           step.status === "cancelled" ? <XCircle size={24} className="text-red-500 bg-white" /> :
                           <Circle size={24} className="text-amber-500 bg-white fill-amber-50" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{step.label}</p>
                          {step.at && <p className="text-xs text-muted-foreground">{formatDateTime(step.at)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </FormSection>
              </FormLayout>
              <div className="flex justify-end pt-4">
                <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Rides;
