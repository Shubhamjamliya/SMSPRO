import { useState, useCallback, useEffect, useMemo } from 'react';
import { restaurantAPI, locationAPI } from "@food/api";
import { normalizeImageUrl, extractImages, calculateDistance, slugify } from "@food/utils/common";

/**
 * Refine haversine list distances into ROAD distances with one batched
 * backend call (Distance Matrix, server-cached per ~100m grid pair).
 * Only the nearest destinations are sent (haversine pre-filter) to keep
 * the request cheap; the rest keep their air-distance estimate.
 */
const MATRIX_LIMIT = 25;
const refineRoadDistances = async (restaurants, userLat, userLng, apply) => {
  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return;

  const candidates = restaurants
    .filter((r) => Number.isFinite(Number(r.rLat)) && Number.isFinite(Number(r.rLng)))
    .sort((a, b) => (a.distanceInKm ?? Infinity) - (b.distanceInKm ?? Infinity))
    .slice(0, MATRIX_LIMIT);
  if (candidates.length === 0) return;

  try {
    const res = await locationAPI.roadDistanceMatrix(
      { lat: userLat, lng: userLng },
      candidates.map((r) => ({ lat: Number(r.rLat), lng: Number(r.rLng) }))
    );
    const distances = res?.data?.data?.distances;
    if (!Array.isArray(distances)) return;

    const byId = new Map();
    candidates.forEach((r, i) => {
      const d = distances[i];
      if (d && Number.isFinite(Number(d.distanceKm))) {
        byId.set(r.id, {
          distanceInKm: Number(d.distanceKm),
          roadDurationMinutes: d.durationMinutes ?? null,
          distanceSource: d.source || "google_routes",
        });
      }
    });
    if (byId.size > 0) apply(byId);
  } catch {
    // Backend/matrix unavailable — haversine estimates stay in place.
  }
};

export const useHomeData = (location, zoneId) => {
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [landingCategories, setLandingCategories] = useState([]);
  const [exploreMoreItems, setExploreMoreItems] = useState([]);
  const [exploreMoreHeading, setExploreMoreHeading] = useState("Explore More");
  
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [heroBannerImages, setHeroBannerImages] = useState([]);
  const [heroBannersData, setHeroBannersData] = useState([]);

  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [restaurantsData, setRestaurantsData] = useState([]);
  const [recommendedRestaurants, setRecommendedRestaurants] = useState([]);
  
  const [menuCategories, setMenuCategories] = useState([]);
  const [loadingMenuCategories, setLoadingMenuCategories] = useState(false);
  const [restaurantDietMeta, setRestaurantDietMeta] = useState({});

  // Old backend endpoints (hero banners / landing config) are not used anymore.
  // Keep UI stable by setting safe defaults once.
  const initLandingConfig = useCallback(() => {
    setLoadingConfig(true);
    setLandingCategories([]);
    setExploreMoreItems([]);
    setExploreMoreHeading("Explore More");
    setRecommendedRestaurants([]);
    setLoadingConfig(false);
  }, []);

  const initBanners = useCallback(() => {
    setLoadingBanners(true);
    setHeroBannersData([]);
    setHeroBannerImages([]);
    setLoadingBanners(false);
  }, []);

  const fetchRestaurants = useCallback(async (filters = {}) => {
    try {
      setLoadingRestaurants(true);
      const params = {
        ...(filters.sortBy && { sortBy: filters.sortBy }),
        ...(filters.cuisine && { cuisine: filters.cuisine }),
        ...(zoneId && { zoneId })
      };
      const res = await restaurantAPI.getRestaurants(params);
      if (res.data?.success) {
        const raw = res.data.data.restaurants || [];
        const userLat = location?.latitude;
        const userLng = location?.longitude;

        const transformed = raw.map(r => {
          const rLoc = r.location;
          const rLat = rLoc?.latitude || (rLoc?.coordinates?.[1]);
          const rLng = rLoc?.longitude || (rLoc?.coordinates?.[0]);

          let distInKm = calculateDistance(userLat, userLng, rLat, rLng);
          const coverImgs = extractImages(r.coverImages);
          const menuImgs = extractImages(r.menuImages);
          const profileImgs = extractImages(r.profileImage || r.image);
          const allImgs = Array.from(new Set([...coverImgs, ...menuImgs, ...profileImgs]));

          return {
            ...r,
            id: r.restaurantId || r._id,
            mongoId: r._id,
            rLat,
            rLng,
            distanceInKm: distInKm,
            distanceSource: distInKm != null ? "haversine" : null,
            image: allImgs[0] || "",
            images: allImgs,
            rating: r.rating || 4.5,
            cuisine: r.cuisines?.[0] || "Multi-cuisine"
          };
        });
        setRestaurantsData(transformed);

        // Upgrade the nearest restaurants to road distance (one batched,
        // server-cached call). List renders instantly with the estimate,
        // then re-renders with real road km + ETA when this resolves.
        refineRoadDistances(transformed, Number(userLat), Number(userLng), (byId) => {
          setRestaurantsData((prev) =>
            prev.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r))
          );
        });
      }
    } finally {
      setLoadingRestaurants(false);
    }
  }, [location, zoneId]);

  const fetchMenuMeta = useCallback(async () => {
    if (!restaurantsData.length) return;
    setLoadingMenuCategories(true);
    try {
      const categoryMap = new Map();
      const dietMeta = {};

      const menuResponses = await Promise.all(
        restaurantsData.slice(0, 50).map(async (r) => {
          try {
            const res = await restaurantAPI.getMenuByRestaurantId(r.id);
            return { id: r.id, menu: res?.data?.data?.menu };
          } catch {
            return { id: r.id, menu: null };
          }
        })
      );

      menuResponses.forEach(({ id, menu }) => {
        let hasVeg = false, hasNonVeg = false;
        const sections = menu?.sections || [];
        sections.forEach(s => {
          const items = s.items || [];
          items.forEach(i => {
            const type = String(i.foodType || "").toLowerCase();
            if (type === "veg") hasVeg = true;
            if (type.includes("non")) hasNonVeg = true;
          });
          const slug = slugify(s.name);
          if (slug && !categoryMap.has(slug)) {
            categoryMap.set(slug, {
              id: slug, name: s.name, slug, label: s.name,
              image: items[0]?.image ? normalizeImageUrl(items[0].image) : ""
            });
          }
        });
        dietMeta[id] = { hasVeg, hasNonVeg, isPureVeg: hasVeg && !hasNonVeg };
      });

      setMenuCategories(Array.from(categoryMap.values()));
      setRestaurantDietMeta(dietMeta);
    } finally {
      setLoadingMenuCategories(false);
    }
  }, [restaurantsData]);

  useEffect(() => {
    initLandingConfig();
    initBanners();
  }, [initLandingConfig, initBanners]);

  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

  useEffect(() => {
    fetchMenuMeta();
  }, [fetchMenuMeta]);

  return {
    loadingConfig, landingCategories, exploreMoreItems, exploreMoreHeading, recommendedRestaurants,
    loadingBanners, heroBannerImages, heroBannersData,
    loadingRestaurants, restaurantsData, setRestaurantsData,
    loadingMenuCategories, menuCategories, restaurantDietMeta,
    fetchRestaurants
  };
};
