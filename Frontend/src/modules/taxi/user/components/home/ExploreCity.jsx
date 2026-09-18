import {
  Building2,
  Landmark,
  MapPin,
  Plane,
  ShoppingBag,
  Store,
  TrainFront,
} from "lucide-react";
import { getPlacesForCity } from "../../utils/mock/places";

const TYPE_ICON = {
  Airport: Plane,
  Railway: TrainFront,
  Mall: ShoppingBag,
  "IT Park": Building2,
  Attraction: Landmark,
  Market: Store,
};

function PlaceIcon({ type }) {
  const Icon = TYPE_ICON[type] || MapPin;
  return <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />;
}

export default function ExploreCity({
  city = "",
  onSelectPlace,
  variant = "list",
}) {
  const places = getPlacesForCity(city).slice(0, variant === "chips" ? 6 : undefined);
  const cityLabel = city?.split(",")[0]?.trim() || "your city";

  if (variant === "chips") {
    return (
      <section aria-label={`Popular places in ${cityLabel}`}>
        <div className="mb-2 flex items-center justify-between px-0.5">
          <p className="text-[12px] font-medium text-neutral-500">
            Popular nearby
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar pb-0.5">
          {places.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => onSelectPlace?.(place)}
              className="inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-2 rounded-full bg-neutral-50 px-3 py-2 text-left outline-none ring-1 ring-neutral-200/80 transition duration-200 hover:bg-white hover:ring-neutral-300 focus-visible:ring-2 focus-visible:ring-[#FF6A00]/40"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-neutral-700 ring-1 ring-neutral-200/80">
                <PlaceIcon type={place.type} />
              </span>
              <span className="max-w-[8.5rem] truncate text-[12px] font-semibold text-neutral-800">
                {place.name}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="taxi-explore-heading">
      <div className="mb-3 flex items-end justify-between gap-2 px-0.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
            Explore
          </p>
          <h3
            id="taxi-explore-heading"
            className="mt-0.5 text-base font-semibold tracking-tight text-neutral-900"
          >
            Popular in {cityLabel}
          </h3>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto overscroll-x-contain no-scrollbar pb-1">
        {places.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelectPlace?.(place)}
            className="w-[132px] shrink-0 cursor-pointer rounded-[1.25rem] border border-neutral-200/90 bg-white p-3.5 text-left shadow-[0_4px_16px_rgba(15,23,42,0.04)] outline-none transition duration-200 hover:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#FF6A00]/35"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF4ED] text-[#FF6A00]">
              <PlaceIcon type={place.type} />
            </span>
            <p className="mt-3 truncate text-sm font-semibold text-neutral-900">
              {place.name}
            </p>
            <p className="mt-0.5 text-xs font-medium text-neutral-500">{place.type}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
