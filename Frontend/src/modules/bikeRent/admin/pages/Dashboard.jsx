import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bike,
  CalendarCheck,
  Clock3,
  IndianRupee,
  RefreshCw,
  Wrench,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  AdminTable,
  StatusBadge,
  EmptyState,
  TableSkeleton,
  KpiGridSkeleton,
} from "@/shared/components/admin";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import {
  BIKE_RENT_ADMIN_PAGE_CLASS,
  BIKE_RENT_STAT_GRID_3_CLASS,
} from "../utils/adminTheme";

const message = (e, fallback) => e?.response?.data?.message || fallback;

const OPS_CARDS = [
  { key: "activeRentals", title: "Active Rentals", ops: "live", icon: CalendarCheck },
  { key: "bikesReserved", title: "Reserved Bikes", ops: "pickups", icon: Bike },
  { key: "upcomingPickups", title: "Upcoming Pickups", ops: "pickups", icon: Clock3 },
  { key: "upcomingReturns", title: "Upcoming Returns", ops: "returns", icon: RefreshCw },
  { key: "lateReturns", title: "Late Returns", ops: "late", icon: AlertTriangle },
  { key: "extensionRequests", title: "Extension Requests", ops: "extensions", icon: RefreshCw },
  { key: "pendingDeposits", title: "Pending Deposits", href: "/admin/bike-rent/bookings?deposit=pending_collection", icon: IndianRupee },
  { key: "pendingRefunds", title: "Pending Refunds", ops: "refunds", icon: IndianRupee },
  { key: "bikesMaintenance", title: "Maintenance", href: "/admin/bike-rent/bikes?status=maintenance", icon: Wrench },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await bikeRentAdminApi.getDashboard());
    } catch (e) {
      toast.error(message(e, "Failed to load Bike Rent dashboard"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bookings = stats?.recentBookings || [];
  const columns = [
    {
      key: "bookingNumber",
      header: "Booking",
      cell: (r) => <span className="font-medium">{r.bookingNumber || r.id}</span>,
    },
    { key: "bike", header: "Bike", cell: (r) => r.bikeName || "—" },
    {
      key: "reg",
      header: "Reg. No.",
      cell: (r) => r.registrationNumber || "—",
    },
    {
      key: "totalPaid",
      header: "Paid",
      cell: (r) => `₹${Number(r.totalPaid || 0).toLocaleString()}`,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Bike Rent Operations"
        description="Live ops: rentals, pickups, returns, extensions, and deposits"
      />
      {loading ? (
        <KpiGridSkeleton count={9} className="sm:grid-cols-2 lg:grid-cols-3" />
      ) : (
        <div className={BIKE_RENT_STAT_GRID_3_CLASS}>
          {OPS_CARDS.map((card) => {
            const Icon = card.icon;
            const href = card.href
              || `/admin/bike-rent/bookings?ops=${card.ops}`;
            return (
              <Link key={card.key} to={href} className="block transition hover:opacity-90">
                <StatCard
                  title={card.title}
                  value={String(stats?.[card.key] ?? 0)}
                  icon={<Icon size={18} />}
                />
              </Link>
            );
          })}
        </div>
      )}
      <SectionCard title="Recent Bookings" subtitle="Latest Bike Rent activity">
        {loading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : bookings.length ? (
          <AdminTable columns={columns} data={bookings} getRowId={(r) => r.id} />
        ) : (
          <EmptyState
            title="No recent bookings"
            description="Bookings will appear here once customers start renting."
          />
        )}
      </SectionCard>
    </div>
  );
}
