import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Zap, Clock, CheckCircle, XCircle, IndianRupee, Wifi,
  ArrowRight, MapPin, FolderTree,
} from "lucide-react";
import {
  PageHeader, StatCard, SectionCard, AdminTable, StatusBadge,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";
import { rideStatusMeta } from "../utils/rideStatuses";
import { formatCurrency, formatDateTime } from "../utils/taxiTableHelpers";

const EMPTY_KPIS = {
  totalDrivers: 0,
  onlineDrivers: 0,
  activeRides: 0,
  pendingRequests: 0,
  completedToday: 0,
  cancelledToday: 0,
  revenueToday: 0,
  vehicleTypes: 0,
  activeZones: 0,
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [recentRides, setRecentRides] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxiAdminApi.getDashboard();
      setKpis({ ...EMPTY_KPIS, ...(data.kpis || {}) });
      setRecentRides(data.recentRides || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load dashboard");
      setKpis(EMPTY_KPIS);
      setRecentRides([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const requestColumns = [
    { key: "rideNumber", header: "Ride", cell: (row) => <span className="font-semibold">{row.rideNumber || row.id}</span> },
    { key: "pickup", header: "Pickup", cell: (row) => <span className="text-sm">{row.pickup || "—"}</span> },
    { key: "drop", header: "Drop", cell: (row) => <span className="text-sm">{row.drop || "—"}</span> },
    { key: "fare", header: "Fare", cell: (row) => formatCurrency(row.fare) },
    {
      key: "status", header: "Status",
      cell: (row) => {
        const meta = rideStatusMeta(row.status);
        return <StatusBadge tone={meta.tone} label={meta.label} />;
      },
    },
    { key: "createdAt", header: "Requested", cell: (row) => <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span> },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Taxi Operations Dashboard"
        subtitle="Live overview of rides, drivers and revenue"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Taxi", href: "/admin/taxi" },
          { label: "Dashboard" },
        ]}
        actions={
          <div className="flex gap-3">
            <Button variant="outline" className="gap-2" onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button className="gap-2" onClick={() => navigate("/admin/taxi/reports")}>
              View Reports <ArrowRight size={16} />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Drivers" value={String(kpis.totalDrivers)} icon={<Users size={18} />} />
        <StatCard title="Online Drivers" value={String(kpis.onlineDrivers)} icon={<Wifi size={18} />} />
        <StatCard title="Active Rides" value={String(kpis.activeRides)} icon={<Zap size={18} />} />
        <StatCard title="Pending Requests" value={String(kpis.pendingRequests)} icon={<Clock size={18} />} />
        <StatCard title="Completed Today" value={String(kpis.completedToday)} icon={<CheckCircle size={18} />} />
        <StatCard title="Cancelled Today" value={String(kpis.cancelledToday)} icon={<XCircle size={18} />} />
        <StatCard title="Revenue Today" value={formatCurrency(kpis.revenueToday)} icon={<IndianRupee size={18} />} />
        <StatCard title="Active Zones" value={String(kpis.activeZones)} icon={<MapPin size={18} />} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <StatCard title="Vehicle Types" value={String(kpis.vehicleTypes)} icon={<FolderTree size={18} />} />
        <Button variant="outline" className="h-auto py-4 justify-start gap-2" onClick={() => navigate("/admin/taxi/zones")}>
          Manage Zones <ArrowRight size={16} />
        </Button>
        <Button variant="outline" className="h-auto py-4 justify-start gap-2" onClick={() => navigate("/admin/taxi/drivers")}>
          Manage Drivers <ArrowRight size={16} />
        </Button>
      </div>

      <SectionCard
        title="Recent Rides"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/taxi/rides/requests")}>
            View all
          </Button>
        }
        flush
      >
        <div className="p-4">
          <AdminTable
            columns={requestColumns}
            data={recentRides}
            loading={loading}
            getRowId={(r) => r.id}
            emptyState={{ title: "No rides yet", description: "Rides will show here once customers start booking." }}
          />
        </div>
      </SectionCard>
    </div>
  );
};

export default Dashboard;
