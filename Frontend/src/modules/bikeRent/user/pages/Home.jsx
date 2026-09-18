import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bike,
  ChevronRight,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { userAPI } from "@food/api";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { useLocationSelector } from "@food/components/user/UserLayout";
import ActiveRideCard from "../components/ActiveRideCard";
import BikeTopBar from "../components/home/BikeTopBar";
import BikeCard from "../components/BikeCard";
import CategoryChips from "../components/CategoryChips";
import ServiceNotAvailable from "../components/ServiceNotAvailable";
import { BikeRentPageShell, EmptyState, PrimaryButton } from "../components/ui";
import { useBikeRentZone } from "../hooks/useBikeRentZone";
import bikeRentUserApi from "../services/userApi";
import { getBikeRentBrowsePath } from "../utils/routes";
import { isBikeRentUserLoggedIn } from "../utils/authUser";
import { brandKey, bikeIdOf } from "../utils/bikeDisplay";
import { useMyPendingBookings } from "../hooks/useMyPendingBookings";
import useModuleBackHandler from "@/modules/common/hooks/useModuleBackHandler";

const WHY_US = [
  { icon: ShieldCheck, title: "Verified fleet" },
  { icon: Wallet, title: "Clear pricing" },
  { icon: Sparkles, title: "Flexible rentals" },
];

export default function BikeRentHome({ embedded = false }) {
  useModuleBackHandler(true);
  const navigate = useNavigate();
  const { location } = useAppLocation();
  const { openLocationSelector } = useLocationSelector();
  const { zoneId, zone, zoneStatus, userLat, userLng } = useBikeRentZone(location);
  const [bikes, setBikes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const { getPendingForBike } = useMyPendingBookings();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isBikeRentUserLoggedIn()) {
        setWalletBalance(null);
        setWalletLoading(false);
        return;
      }
      setWalletLoading(true);
      try {
        const res = await userAPI.getWallet();
        const data = res?.data?.data || res?.data || {};
        const balance =
          data?.wallet?.balance ?? data?.balance ?? data?.walletBalance ?? null;
        if (!cancelled) setWalletBalance(balance);
      } catch {
        if (!cancelled) setWalletBalance(null);
      } finally {
        if (!cancelled) setWalletLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (zoneStatus !== "IN_SERVICE") {
        if (!cancelled) {
          setCategories([]);
          setSelectedCategory("");
        }
        return;
      }
      if (!zoneId) return;
      try {
        const next = await bikeRentUserApi.getCategories({
          zoneId,
        });
        if (cancelled) return;
        setCategories(next);
        setSelectedCategory((current) => {
          if (!current) return "";
          const stillValid = next.some(
            (category) => String(category.id || category._id) === String(current),
          );
          return stillValid ? current : "";
        });
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zoneId, zoneStatus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Never reuse bikes from a previous zone while location/zone is resolving.
      if (zoneStatus !== "IN_SERVICE" || !zoneId) {
        if (!cancelled) {
          setBikes([]);
          setLoading(zoneStatus === "loading");
          setError(null);
        }
        return;
      }

      setLoading(true);
      setError(null);
      setBikes([]);
      try {
        const publicSettings = await bikeRentUserApi.getPublicSettings();
        if (!cancelled) setSettings(publicSettings);
        const result = await bikeRentUserApi.getBikes({
          zoneId,
          limit: 12,
          categoryId: selectedCategory || undefined,
        });
        if (cancelled) return;
        // Drop any accidental cross-zone rows (defense in depth).
        const records = (result.records || []).filter((bike) => {
          const bikeZone = String(bike.zoneId || bike.zone?.id || "");
          return !bikeZone || bikeZone === String(zoneId);
        });
        setBikes(records);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError);
          setBikes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zoneId, zoneStatus, selectedCategory]);

  const locationTitle = useMemo(
    () => location?.area || location?.city || "Current location",
    [location],
  );
  const locationSubtitle =
    location?.formattedAddress
    || location?.address
    || "Tap to choose your pickup location";
  const unavailableMessage = settings?.outOfServiceMessage;

  const brands = useMemo(() => {
    const map = new Map();
    bikes.forEach((bike) => {
      const key = brandKey(bike);
      if (!map.has(key)) map.set(key, 0);
      map.set(key, map.get(key) + 1);
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [bikes]);

  const filteredBikes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return bikes;
    return bikes.filter((bike) => {
      const haystack = [
        bike?.name,
        bike?.brand,
        bike?.model,
        bike?.registrationNumber,
        bike?.category?.name,
        bike?.categoryName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [bikes, search]);

  const featured = filteredBikes.slice(0, 8);

  const goBrowse = (extra = {}) => {
    navigate(
      getBikeRentBrowsePath({
        categoryId: selectedCategory || undefined,
        search: search.trim() || undefined,
        ...extra,
      }),
    );
  };

  return (
    <BikeRentPageShell showBottomNav showServiceSwitcher={!embedded}>
      {!embedded ? (
        <BikeTopBar
          title={locationTitle}
          subtitle={locationSubtitle}
          onLocationClick={() => openLocationSelector?.()}
          walletBalance={walletBalance}
          walletLoading={walletLoading}
        />
      ) : null}

      <main className="space-y-4 px-4 py-3 pb-8">
        <ActiveRideCard stickyOffset={embedded ? "top-0" : undefined} />

        {zoneStatus === "OUT_OF_SERVICE" ? (
          <ServiceNotAvailable
            message={unavailableMessage}
            zoneName={zone?.name}
            userLat={userLat}
            userLng={userLng}
            onChangeLocation={() => openLocationSelector?.()}
          />
        ) : null}

        {zoneStatus !== "OUT_OF_SERVICE" ? (
          <>
            <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#FF6A00] to-[#FF8A3D] px-4 py-3 text-white shadow-sm sm:px-5 sm:py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
                    Bike Rent
                  </p>
                  <h1 className="mt-0.5 truncate text-base font-black leading-tight sm:text-lg">
                    Rent bikes near you
                  </h1>
                  <p className="mt-0.5 truncate text-[11px] text-white/85">
                    {zoneStatus === "IN_SERVICE"
                      ? `${zone?.name || "Your area"} · hourly & daily`
                      : "Checking availability…"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => goBrowse()}
                  className="inline-flex shrink-0 items-center rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-[#FF6A00] shadow-sm"
                >
                  Browse
                  <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-2.5 shadow-sm">
              <div className="flex gap-2">
                <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-gray-50 px-3">
                  <Search className="h-4 w-4 shrink-0 text-gray-400" />
                  <input
                    className="min-w-0 w-full bg-transparent text-sm outline-none"
                    placeholder="Search by name or brand"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") goBrowse();
                    }}
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="rounded-full p-1 text-gray-400 hover:bg-gray-200/60"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </label>
                <button
                  type="button"
                  onClick={() => goBrowse()}
                  className="rounded-xl bg-[#FF6A00] px-3.5 text-sm font-extrabold text-white"
                >
                  Search
                </button>
              </div>
            </section>

            {categories.length ? (
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-extrabold text-gray-900">Categories</h2>
                  <button
                    type="button"
                    onClick={() => goBrowse({ categoryId: undefined })}
                    className="text-xs font-bold text-[#FF6A00]"
                  >
                    View all
                  </button>
                </div>
                <CategoryChips
                  categories={categories}
                  value={selectedCategory}
                  onChange={(next) => {
                    setSelectedCategory(next);
                  }}
                />
              </section>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-gray-900">
                  {search.trim() ? "Search results" : "Available bikes"}
                </h2>
                <button
                  type="button"
                  className="text-xs font-bold text-[#FF6A00]"
                  onClick={() => goBrowse()}
                >
                  View all
                </button>
              </div>
              {loading || zoneStatus === "loading" ? (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="overflow-hidden rounded-2xl bg-gray-100">
                      <div className="aspect-[4/3] animate-pulse bg-gray-200" />
                      <div className="space-y-2 p-2.5">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                        <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <EmptyState
                  icon={Bike}
                  title="Could not load bikes"
                  subtitle="Please try again shortly."
                  action={
                    <PrimaryButton onClick={() => window.location.reload()}>
                      Try again
                    </PrimaryButton>
                  }
                />
              ) : featured.length ? (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {featured.map((bike) => (
                    <BikeCard
                      key={bikeIdOf(bike)}
                      bike={bike}
                      userLat={userLat}
                      userLng={userLng}
                      pendingBooking={getPendingForBike(bikeIdOf(bike))}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Bike}
                  title={search.trim() ? "No bikes match your search" : "No bikes available"}
                  subtitle={
                    search.trim()
                      ? `Nothing found for “${search.trim()}”. Try another name or brand.`
                      : `Zone "${zone?.name || "this area"}" is active, but no bookable bikes are assigned here yet.`
                  }
                  action={
                    search.trim() ? (
                      <PrimaryButton onClick={() => setSearch("")}>Clear search</PrimaryButton>
                    ) : null
                  }
                />
              )}
            </section>

            {brands.length ? (
              <section>
                <h2 className="mb-2 text-sm font-extrabold text-gray-900">Popular brands</h2>
                <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {brands.map((brand) => (
                    <button
                      key={brand.name}
                      type="button"
                      onClick={() => {
                        setSearch(brand.name);
                        goBrowse({
                          search: brand.name,
                          categoryId: selectedCategory || undefined,
                        });
                      }}
                      className="shrink-0 rounded-xl border border-gray-100 bg-white px-3 py-2 text-left shadow-sm"
                    >
                      <p className="text-xs font-extrabold text-gray-900">{brand.name}</p>
                      <p className="text-[10px] text-gray-500">{brand.count} bikes</p>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="grid grid-cols-3 gap-2">
              {WHY_US.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-gray-100 bg-white px-2 py-2.5 text-center shadow-sm"
                >
                  <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-[#FF6A00]">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <p className="mt-1.5 text-[10px] font-bold leading-tight text-gray-800 sm:text-[11px]">
                    {item.title}
                  </p>
                </div>
              ))}
            </section>
          </>
        ) : null}
      </main>
    </BikeRentPageShell>
  );
}
