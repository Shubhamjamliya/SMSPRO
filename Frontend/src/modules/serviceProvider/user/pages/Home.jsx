import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, MapPin, Wrench } from "lucide-react";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { useLocationSelector } from "@food/components/user/UserLayout";
import { ServiceProviderPageShell } from "../components/ui";
import serviceProviderApi from "../../provider/services/providerApi";
import useModuleBackHandler from "@/modules/common/hooks/useModuleBackHandler";

function CategorySkeletonGrid() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <div className="h-16 w-16 animate-pulse rounded-2xl bg-gray-200 sm:h-[74px] sm:w-[74px]" />
          <div className="h-2.5 w-4/5 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

export default function ServiceProviderUserHome() {
  useModuleBackHandler(true);
  const navigate = useNavigate();
  const { location, loading: locationLoading } = useAppLocation();
  const { openLocationSelector } = useLocationSelector();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!location?.latitude || !location?.longitude) {
      if (!locationLoading) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    serviceProviderApi
      .getCustomerServices({ lat: location.latitude, lng: location.longitude })
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error?.response?.data?.message || "Could not load services");
          setResult(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location?.latitude, location?.longitude, locationLoading]);

  const openCategory = (category) => {
    navigate(`/services/category/${category._id}`, {
      state: {
        zoneId: result.zone._id,
        zoneName: result.zone.name,
        categoryId: category._id,
        categoryName: category.name,
      },
    });
  };

  const categories = result?.categories || [];
  const hasLocation = Boolean(location?.latitude && location?.longitude);
  const showLoading = loading || (locationLoading && !hasLocation);

  return (
    <ServiceProviderPageShell headerVariant="full" showServiceSwitcher>
      <div className="px-4 py-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-gray-900 sm:text-xl">Home Services</h1>
            <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">Trusted professionals, booked in minutes</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/services/bookings")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm hover:border-[#FF6A00]/40 hover:text-[#FF6A00]"
          >
            <CalendarClock className="h-3.5 w-3.5" /> My Bookings
          </button>
        </div>

        {showLoading ? (
          <CategorySkeletonGrid />
        ) : !hasLocation ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
            <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">Set your location to see services near you</p>
            <button
              type="button"
              onClick={() => openLocationSelector?.()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white"
            >
              Choose location
            </button>
          </div>
        ) : !result?.zone ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
            {result?.message || "Your location is outside all supported service zones."}
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            {result.message || "No service categories available in your zone yet."}
          </div>
        ) : (
          <>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-400">
              <MapPin className="h-3.5 w-3.5 text-[#FF6A00]" /> Serving {result.zone.name}
            </p>
            <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
              {categories.map((cat) => (
                <button
                  key={cat._id}
                  type="button"
                  onClick={() => openCategory(cat)}
                  className="group flex flex-col items-center gap-2 text-center"
                >
                  <div className="h-16 w-16 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:border-[#FF6A00]/30 group-hover:shadow-[0_6px_18px_rgba(255,106,0,0.12)] sm:h-[74px] sm:w-[74px]">
                    {cat.icon ? (
                      <img src={cat.icon} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-gray-300">
                        <Wrench className="h-6 w-6" />
                      </span>
                    )}
                  </div>
                  <span className="line-clamp-2 max-w-full text-center text-[11px] font-bold leading-tight text-gray-600 group-hover:text-[#FF6A00] sm:text-xs">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">
          Are you a professional looking to offer services on our platform?{" "}
          <a href="/service-provider/login" className="font-semibold text-[#FF6A00] hover:underline">
            Register here
          </a>
        </p>
      </div>
    </ServiceProviderPageShell>
  );
}
