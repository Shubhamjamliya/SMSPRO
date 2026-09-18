import { Car } from "lucide-react";
import { formatInr } from "../../utils/mock/vehicles";

function VehicleIcon({ vehicle }) {
  if (vehicle.iconUrl) {
    return (
      <img
        src={vehicle.iconUrl}
        alt=""
        className="h-8 w-8 object-contain"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  return <Car className="h-5 w-5 text-slate-500" aria-hidden />;
}

export default function ServiceCards({
  vehicles = [],
  loading = false,
  selectedId = null,
  quotesByVehicle = {},
  onSelect,
}) {
  if (loading) {
    return (
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[104px] w-[96px] shrink-0 animate-pulse rounded-2xl bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (!vehicles.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No taxi services available right now.
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
      {vehicles.map((vehicle) => {
        const quote = quotesByVehicle[vehicle.id];
        const available = quote?.ok;
        const active = selectedId === vehicle.id;
        const fareLabel = available
          ? formatInr(quote.fare)
          : quote
            ? "N/A"
            : "—";

        return (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => onSelect?.(vehicle)}
            className={`w-[96px] shrink-0 cursor-pointer rounded-2xl border px-2 py-3 text-center outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#FF6A00]/35 ${
              active && available
                ? "border-[#FF6A00] bg-[#FFF4ED] shadow-[0_6px_16px_rgba(255,106,0,0.15)]"
                : available
                  ? "border-slate-200 bg-white shadow-[0_4px_12px_rgba(15,23,42,0.04)] hover:border-slate-300"
                  : "border-slate-100 bg-slate-50 opacity-70"
            }`}
          >
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">
              <VehicleIcon vehicle={vehicle} />
            </div>
            <p className="mt-2 truncate text-xs font-semibold text-slate-900">
              {vehicle.name}
            </p>
            <p
              className={`mt-0.5 text-[11px] font-semibold tabular-nums ${
                available ? "text-[#FF6A00]" : "text-slate-400"
              }`}
            >
              {fareLabel}
            </p>
          </button>
        );
      })}
    </div>
  );
}
