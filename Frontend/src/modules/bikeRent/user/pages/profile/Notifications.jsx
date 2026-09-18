import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  EmptyState,
} from "../../components/ui";
import { getBikeRentBookingPath, getBikeRentProfilePath } from "../../utils/routes";
import bikeRentUserApi from "../../services/userApi";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await bikeRentUserApi.getMyNotifications({ limit: 50 });
      setItems(rows || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (item) => {
    if (item.read) return;
    try {
      await bikeRentUserApi.markNotificationRead(item.id);
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, read: true } : row)),
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Notifications"
        subtitle="Ride updates & alerts"
        backTo={getBikeRentProfilePath()}
      />
      <main className="px-4 py-6">
        {loading ? (
          <p className="text-center text-sm text-gray-500">Loading…</p>
        ) : !items.length ? (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            subtitle="Booking, extension, and refund updates will show up here."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => markRead(item)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    item.read
                      ? "border-gray-100 bg-white"
                      : "border-orange-100 bg-orange-50/60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900">{item.title}</p>
                    {!item.read ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#FF6A00]" />
                    ) : null}
                  </div>
                  {item.body ? (
                    <p className="mt-1 text-xs text-gray-600">{item.body}</p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                    <span>
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : ""}
                    </span>
                    {item.bookingId ? (
                      <Link
                        to={getBikeRentBookingPath(item.bookingId)}
                        className="font-semibold text-[#FF6A00]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        View booking
                      </Link>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </BikeRentPageShell>
  );
}
