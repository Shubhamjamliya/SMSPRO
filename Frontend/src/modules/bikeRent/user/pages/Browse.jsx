import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, Search, Bike, X } from "lucide-react";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { useBikeRentZone } from "../hooks/useBikeRentZone";
import bikeRentUserApi from "../services/userApi";
import ServiceNotAvailable from "../components/ServiceNotAvailable";
import BikeCard from "../components/BikeCard";
import CategoryChips from "../components/CategoryChips";
import {
  BikeRentPageHeader,
  BikeRentPageShell,
  EmptyState,
  PrimaryButton,
} from "../components/ui";
import { bikeIdOf } from "../utils/bikeDisplay";
import { useMyPendingBookings } from "../hooks/useMyPendingBookings";
import { cn } from "@/lib/utils";

const selectClass =
  "w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#FF6A00]/50";

const EMPTY_FILTERS = {
  categoryId: "",
  fuelType: "",
  transmission: "",
  helmetIncluded: "",
  maxPrice: "",
};

function paramsEqual(a, b) {
  return a.toString() === b.toString();
}

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { location } = useAppLocation();
  const { zoneId, zoneStatus, userLat, userLng } = useBikeRentZone(location);
  const skipUrlToInput = useRef(false);

  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(
    () => (searchParams.get("search") || "").trim(),
  );
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    categoryId: searchParams.get("categoryId") || "",
  }));
  const [bikes, setBikes] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const { getPendingForBike } = useMyPendingBookings();

  // Reset pagination when the detected zone changes.
  useEffect(() => {
    setPage(1);
    setBikes([]);
  }, [zoneId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (zoneStatus !== "IN_SERVICE" || !zoneId) {
        if (!cancelled) setCategories([]);
        return;
      }
      try {
        const next = await bikeRentUserApi.getCategories({ zoneId });
        if (cancelled) return;
        setCategories(next);
        setFilters((current) => {
          if (!current.categoryId) return current;
          const stillValid = next.some(
            (category) => String(category.id || category._id) === String(current.categoryId),
          );
          return stillValid ? current : { ...current, categoryId: "" };
        });
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zoneId, zoneStatus]);

  // Debounce typed search before API + URL update.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      setDebouncedSearch((current) => {
        if (current === next) return current;
        setPage(1);
        return next;
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Push committed search/category into the URL (does not read back into the input).
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set("search", debouncedSearch);
    if (filters.categoryId) next.set("categoryId", filters.categoryId);
    if (paramsEqual(next, searchParams)) return;
    skipUrlToInput.current = true;
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, filters.categoryId, searchParams, setSearchParams]);

  // Adopt URL when arriving via back/forward or in-app link (Home → Browse).
  useEffect(() => {
    if (skipUrlToInput.current) {
      skipUrlToInput.current = false;
      return;
    }
    const nextSearch = searchParams.get("search") || "";
    const nextCategory = searchParams.get("categoryId") || "";
    setSearchInput(nextSearch);
    setDebouncedSearch(nextSearch.trim());
    setFilters((current) => (
      current.categoryId === nextCategory
        ? current
        : { ...current, categoryId: nextCategory }
    ));
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    if (zoneStatus !== "IN_SERVICE" || !zoneId) {
      setBikes([]);
      setHasNext(false);
      setLoading(zoneStatus === "loading");
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    if (page === 1) setBikes([]);

    bikeRentUserApi
      .getBikes({
        zoneId,
        page,
        limit: 12,
        search: debouncedSearch || undefined,
        categoryId: filters.categoryId || undefined,
        fuelType: filters.fuelType || undefined,
        transmission: filters.transmission || undefined,
        helmetIncluded: filters.helmetIncluded || undefined,
        maxPrice: filters.maxPrice || undefined,
      })
      .then((data) => {
        if (cancelled) return;
        const records = (data.records || []).filter((bike) => {
          const bikeZone = String(bike.zoneId || bike.zone?.id || "");
          return !bikeZone || bikeZone === String(zoneId);
        });
        setBikes((previous) => (page === 1 ? records : [...previous, ...records]));
        setHasNext(Boolean(data.hasNext));
      })
      .catch(() => {
        if (!cancelled) {
          setBikes([]);
          setHasNext(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    zoneId,
    zoneStatus,
    page,
    debouncedSearch,
    filters.categoryId,
    filters.fuelType,
    filters.transmission,
    filters.helmetIncluded,
    filters.maxPrice,
  ]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((previous) => ({ ...previous, [key]: value }));
  };

  const clearSearch = () => {
    setPage(1);
    setSearchInput("");
    setDebouncedSearch("");
  };

  const clearAll = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setFilters({ ...EMPTY_FILTERS });
    setPage(1);
    skipUrlToInput.current = true;
    setSearchParams({}, { replace: true });
  };

  const activeFilterCount = useMemo(
    () =>
      [filters.fuelType, filters.transmission, filters.helmetIncluded, filters.maxPrice].filter(
        Boolean,
      ).length,
    [filters],
  );

  const selectedCategoryName = categories.find(
    (category) => String(category.id || category._id) === String(filters.categoryId),
  )?.name;

  return (
    <BikeRentPageShell showBottomNav>
      <BikeRentPageHeader title="Browse bikes" backTo="/bike-rent" />
      <main className="space-y-4 px-4 py-4 pb-6">
        {zoneStatus === "OUT_OF_SERVICE" ? (
          <ServiceNotAvailable userLat={userLat} userLng={userLng} />
        ) : (
          <>
            <div className="flex min-w-0 gap-2">
              <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 shadow-sm">
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <input
                  className="min-w-0 w-full bg-transparent text-sm outline-none"
                  placeholder="Search by name, brand, or model"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="rounded-full p-1 text-gray-400 hover:bg-gray-50"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </label>
              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                className={cn(
                  "relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border shadow-sm",
                  showFilters || activeFilterCount
                    ? "border-orange-200 bg-orange-50 text-[#FF6A00]"
                    : "border-gray-100 bg-white text-[#FF6A00]",
                )}
                aria-label="Toggle filters"
              >
                <Filter className="h-4 w-4" />
                {activeFilterCount ? (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#FF6A00] px-1 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>

            {categories.length ? (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  Categories
                </p>
                <CategoryChips
                  categories={categories}
                  value={filters.categoryId}
                  onChange={(value) => updateFilter("categoryId", value)}
                />
              </div>
            ) : null}

            {selectedCategoryName || debouncedSearch ? (
              <div className="flex flex-wrap gap-2">
                {selectedCategoryName ? (
                  <button
                    type="button"
                    onClick={() => updateFilter("categoryId", "")}
                    className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold text-[#FF6A00]"
                  >
                    {selectedCategoryName}
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
                {debouncedSearch ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-bold text-gray-600"
                  >
                    “{debouncedSearch}”
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            ) : null}

            {showFilters ? (
              <div className="grid grid-cols-1 gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:grid-cols-2">
                <select
                  className={selectClass}
                  value={filters.fuelType}
                  onChange={(e) => updateFilter("fuelType", e.target.value)}
                >
                  <option value="">All fuel</option>
                  <option value="petrol">Petrol</option>
                  <option value="electric">Electric</option>
                  <option value="diesel">Diesel</option>
                  <option value="hybrid">Hybrid</option>
                </select>
                <select
                  className={selectClass}
                  value={filters.transmission}
                  onChange={(e) => updateFilter("transmission", e.target.value)}
                >
                  <option value="">All transmissions</option>
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                  <option value="cvt">CVT</option>
                </select>
                <select
                  className={selectClass}
                  value={filters.helmetIncluded}
                  onChange={(e) => updateFilter("helmetIncluded", e.target.value)}
                >
                  <option value="">Helmet optional</option>
                  <option value="true">Helmet included</option>
                </select>
                <input
                  className={selectClass}
                  type="number"
                  placeholder="Max ₹/hour"
                  value={filters.maxPrice}
                  onChange={(e) => updateFilter("maxPrice", e.target.value)}
                />
              </div>
            ) : null}

            {loading && !bikes.length ? (
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
            ) : bikes.length ? (
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
                {bikes.map((bike) => (
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
                title="No bikes found"
                subtitle="Try another name, category, or clear filters."
                action={<PrimaryButton onClick={clearAll}>Clear filters</PrimaryButton>}
              />
            )}

            {hasNext ? (
              <PrimaryButton disabled={loading} onClick={() => setPage((value) => value + 1)}>
                {loading ? "Loading…" : "Load more"}
              </PrimaryButton>
            ) : null}
          </>
        )}
      </main>
    </BikeRentPageShell>
  );
}
