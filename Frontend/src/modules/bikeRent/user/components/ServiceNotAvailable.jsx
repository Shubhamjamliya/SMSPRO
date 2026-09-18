import { MapPin } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import { BIKE_RENT_ACCENT } from "../utils/routes";

export default function ServiceNotAvailable({
  message,
  onChangeLocation,
  zoneName,
  userLat,
  userLng,
}) {
  const hasCoords = Number.isFinite(userLat) && Number.isFinite(userLng);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
      <div
        className="px-5 py-8 text-center"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,106,0,0.08) 0%, rgba(255,255,255,0) 70%)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "rgba(255,106,0,0.12)", color: BIKE_RENT_ACCENT }}
        >
          <MapPin className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-extrabold text-gray-900">
          Service Not Available
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          {message
            || "Bike Rent is not available at this map pin yet. Your location name (for example Vijay Nagar) is not enough — the pin must sit inside an active Bike Rent zone polygon."}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-gray-400">
          Admin tip: open Zone → View / Edit Map and make sure your current pin is inside the purple area. Then assign the bike to that same zone with status Available + Active.
        </p>
        {zoneName ? (
          <p className="mt-1 text-xs text-gray-400">Last zone: {zoneName}</p>
        ) : null}
        {hasCoords ? (
          <p className="mt-2 font-mono text-[11px] text-gray-400">
            Pin: {userLat.toFixed(5)}, {userLng.toFixed(5)}
          </p>
        ) : null}
        {onChangeLocation ? (
          <Button
            className="mt-5 w-full max-w-xs"
            style={{ backgroundColor: BIKE_RENT_ACCENT }}
            onClick={onChangeLocation}
          >
            Change location
          </Button>
        ) : null}
      </div>
    </div>
  );
}
