import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bike,
  CalendarClock,
  Clock3,
  IndianRupee,
  ListChecks,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Undo2,
  Wallet,
} from "lucide-react";
import { SectionCard, AdminTable, StatusBadge, StatCard, KpiGridSkeleton, EmptyState } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import VendorLayout from "../components/VendorLayout";
import { getBikeVendorUser } from "../utils/authVendor";
import { bikeVendorApi } from "../services/vendorApi";
import { BIKE_RENT_STAT_GRID_4_CLASS } from "../../admin/utils/adminTheme";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

export default function VendorDashboard() {
  const vendor = getBikeVendorUser();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await bikeVendorApi.getDashboard();
      setStats(data);
    } catch {
      toast.error("Could not load dashboard");
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards = [
    { title: "Total bikes", value: stats?.bikesTotal ?? 0, helper: `${stats?.bikesAvailable ?? 0} available`, icon: <Bike className="h-5 w-5" /> },
    { title: "Active bookings", value: stats?.bookingsActive ?? 0, helper: `${stats?.bookingsCompleted ?? 0} completed`, icon: <ListChecks className="h-5 w-5" /> },
    { title: "Upcoming pickups", value: stats?.upcomingPickups ?? 0, helper: `${stats?.upcomingReturns ?? 0} returns due soon`, icon: <CalendarClock className="h-5 w-5" /> },
    { title: "Revenue", value: money(stats?.revenue), helper: `${stats?.utilizationPercent ?? 0}% fleet utilization`, icon: <IndianRupee className="h-5 w-5" /> },
  ];

  const quickLinks = [
    { title: "Live rentals", value: stats?.activeRentals ?? 0, icon: <RotateCcw className="h-5 w-5" />, to: "/bike-rent/vendor/bookings?ops=live" },
    {
      title: "Late returns",
      value: stats?.lateReturns ?? 0,
      icon: <Clock3 className="h-5 w-5" />,
      to: "/bike-rent/vendor/bookings?ops=late",
    },
    {
      title: "Extension requests",
      value: stats?.extensionRequests ?? 0,
      icon: <RefreshCw className="h-5 w-5" />,
      to: "/bike-rent/vendor/bookings?ops=extensions",
    },
    { title: "Pending deposits", value: stats?.pendingDeposits ?? 0, icon: <ShieldAlert className="h-5 w-5" />, to: "/bike-rent/vendor/bookings" },
    {
      title: "Pending refunds",
      value: stats?.pendingRefunds ?? 0,
      icon: <Undo2 className="h-5 w-5" />,
      to: "/bike-rent/vendor/bookings?ops=refunds",
    },
    { title: "Deposits held", value: money(stats?.depositsHeld), icon: <Wallet className="h-5 w-5" />, to: "/bike-rent/vendor/wallet" },
  ];

  const bookingColumns = [
    { key: "bookingNumber", header: "Booking", cell: (row) => <span className="font-semibold">{row.bookingNumber}</span> },
    { key: "bikeName", header: "Bike" },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "totalPaid", header: "Amount", cell: (row) => money(row.totalPaid) },
  ];

  const renderBookingMobileCard = (row) => (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.bookingNumber}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.bikeName}</p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Amount</span>
        <span className="font-semibold text-foreground">{money(row.totalPaid)}</span>
      </div>
    </div>
  );

  return (
    <VendorLayout title="Dashboard" subtitle={`Welcome back, ${vendor?.ownerName || "Vendor"}`}>
      {loading ? (
        <KpiGridSkeleton count={4} />
      ) : error ? (
        <EmptyState
          title="Could not load your dashboard"
          description="Check your connection and try again."
          action={<Button onClick={load}>Retry</Button>}
        />
      ) : (
        <>
          <div className={BIKE_RENT_STAT_GRID_4_CLASS}>
            {cards.map((card) => (
              <StatCard key={card.title} title={card.title} value={card.value} helper={card.helper} icon={card.icon} />
            ))}
          </div>

          <h3 className="just-order-section-title mb-2 mt-6">Needs your attention</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {quickLinks.map((item) => (
              <StatCard key={item.title} title={item.title} value={item.value} icon={item.icon} to={item.to} />
            ))}
          </div>

          {stats?.recentBookings?.length > 0 && (
            <div className="mt-6">
              <SectionCard title="Recent bookings" flush>
                <AdminTable
                  columns={bookingColumns}
                  data={stats.recentBookings}
                  getRowId={(row) => row.id}
                  renderMobileCard={renderBookingMobileCard}
                />
              </SectionCard>
            </div>
          )}
        </>
      )}
    </VendorLayout>
  );
}
