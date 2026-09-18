import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import VendorLayout from "../components/VendorLayout";
import { bikeVendorApi } from "../services/vendorApi";

export default function VendorNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await bikeVendorApi.getNotifications({ limit: 50 });
      setNotifications(Array.isArray(list) ? list : []);
    } catch {
      toast.error("Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (notification) => {
    if (notification.read) return;
    try {
      await bikeVendorApi.markNotificationRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
    } catch {
      /* non-critical */
    }
  };

  return (
    <VendorLayout title="Notifications" subtitle="Updates on your categories, bookings, and account.">
      {loading ? (
        <p className="text-sm text-gray-500">Loading notifications…</p>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No notifications yet.
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => markRead(n)}
              className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition ${
                n.read ? "border-gray-100 bg-white" : "border-[#FF6A00]/30 bg-[#FF6A00]/5"
              }`}
            >
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/12 text-[#FF6A00]">
                <Bell className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-900">{n.title}</p>
                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-[#FF6A00]" />}
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{n.body}</p>
                {n.createdAt && (
                  <p className="mt-1 text-[11px] text-gray-400">{new Date(n.createdAt).toLocaleString()}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </VendorLayout>
  );
}
