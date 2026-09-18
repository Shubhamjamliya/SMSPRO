import { Zap } from "lucide-react";
import { formatInr } from "../../utils/mock/vehicles";

export default function RecommendedServices({ vehicles = [], onSelect }) {
  const picks = (vehicles || []).slice(0, 4).map((v, index) => ({
    ...v,
    badge:
      index === 0
        ? "Fast Pickup"
        : v.category === "economy"
          ? "Economy"
          : v.category === "premium"
            ? "Premium"
            : v.category === "xl"
              ? "XL Ride"
              : "Recommended",
  }));

  if (!picks.length) return null;

  return (
    <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
      {picks.map((item) => (
        <button
          key={`rec-${item.id}`}
          type="button"
          onClick={() => onSelect?.(item)}
          className="w-[148px] shrink-0 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm transition active:scale-[0.98]"
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FF6A00]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#FF6A00]">
              <Zap className="h-2.5 w-2.5" />
              {item.badge}
            </span>
            <span className="text-lg">{item.icon || "🚕"}</span>
          </div>
          <p className="truncate text-sm font-bold text-gray-900">{item.name}</p>
          <p className="mt-1 text-[11px] text-gray-500">
            {item.etaMins || 6} min · from {formatInr(item.baseFare)}
          </p>
        </button>
      ))}
    </div>
  );
}
