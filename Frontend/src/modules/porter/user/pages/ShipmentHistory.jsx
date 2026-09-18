import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Package, MapPin } from "lucide-react";
import { toast } from "sonner";
import Screen from "../components/Screen";
import { inr } from "../components/ui";
import { getPorterShipmentDetailsPath } from "../utils/routes";
import { porterUserApi } from "../services/api";
import {
  formatTripStatusLabel,
  tripBucket,
  tripToShipment,
} from "../utils/tripShipment";

const TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
];

function statusChipClass(bucket) {
  if (bucket === "delivered") return "bg-green-50 text-[#2e7d32]";
  if (bucket === "cancelled") return "bg-gray-100 text-gray-500";
  return "bg-amber-50 text-amber-700";
}

export default function ShipmentHistory() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await porterUserApi.listTrips({ page: 1, limit: 50 });
      const rows = (data.records || []).map(tripToShipment).filter(Boolean);
      setShipments(rows);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load shipments");
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === "all") return shipments;
    return shipments.filter((s) => tripBucket(s.statusRaw) === tab);
  }, [shipments, tab]);

  return (
    <Screen title="My shipments" subtitle="Parcel delivery history" onBack={() => navigate("/porter")}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-[12px] font-bold transition ${
              tab === t.id ? "bg-[#2F6BFF] text-white" : "bg-white text-gray-600 border border-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-[#2F6BFF]" />
          <p className="text-[13px] text-gray-500">Loading your bookings…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Package className="mb-3 h-12 w-12 text-gray-300" />
          <p className="text-[14px] font-bold text-gray-900">No shipments found</p>
          <p className="text-[12px] text-gray-500">Your parcel history will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const bucket = tripBucket(s.statusRaw);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate(getPorterShipmentDetailsPath(s.id))}
                className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-gray-200"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-bold text-gray-400">{s.trackingId}</span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${statusChipClass(bucket)}`}
                  >
                    {formatTripStatusLabel(s.statusRaw)}
                  </span>
                </div>
                <p className="mb-2 text-[14px] font-bold text-gray-900">
                  {s.vehicle}
                  {s.weightKg > 0 ? ` · ${s.weightKg} kg` : ""}
                  {s.goodsTypeName ? ` · ${s.goodsTypeName}` : ""}
                </p>
                <div className="mb-2 space-y-1">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#2e7d32]" />
                    <p className="truncate text-[12px] text-gray-600">{s.pickup.address}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#2F6BFF]" />
                    <p className="truncate text-[12px] text-gray-600">{s.delivery.address}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                  <span className="text-[11px] text-gray-500">
                    {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}
                  </span>
                  <span className="text-[14px] font-extrabold text-gray-900">{inr(s.total)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
