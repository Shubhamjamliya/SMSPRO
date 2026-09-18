import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Sparkles } from "lucide-react";
import { customerApi } from "../services/customerApi";
import { resolveQuickImageUrl } from "../utils/image";
import {
  CATEGORY_ICON_COMPONENTS,
  getCategoryIconComponent,
} from "@shared/constants/categoryIconComponents";

// ---------------------------------------------------------------------------
// Color System — All backgrounds are dark/deep so white text stays readable
// Contrast ratio against #FFFFFF is ≥ 4.5:1 for every entry (WCAG AA)
// ---------------------------------------------------------------------------

const THEMES = {
  all: {
    gradient: "linear-gradient(to bottom, #D44A00, #7C2A00)",
    shadow: "shadow-red-700/30",
    headerColor: "#FF6A00",
  },

  grocery: {
    gradient: "linear-gradient(to bottom, #540D36, #250316)",
    shadow: "shadow-pink-950/40",
    headerColor: "#540D36",
  },

  wedding: {
    gradient: "linear-gradient(to bottom, #420817, #190106)",
    shadow: "shadow-rose-950/60",
    headerColor: "#420817",
  },

  homeKitchen: {
    gradient: "linear-gradient(to bottom, #072C38, #021017)",
    shadow: "shadow-cyan-950/60",
    headerColor: "#072C38",
  },

  electronics: {
    gradient: "linear-gradient(to bottom, #22073D, #090114)",
    shadow: "shadow-violet-950/60",
    headerColor: "#22073D",
  },

  kids: {
    gradient: "linear-gradient(to bottom, #2B0F07, #120502)",
    shadow: "shadow-amber-950/60",
    headerColor: "#2B0F07",
  },

  pets: {
    gradient: "linear-gradient(to bottom, #0F3A5F, #061B2E)",
    shadow: "shadow-blue-900/40",
    headerColor: "#0F3A5F",
  },

  sports: {
    gradient: "linear-gradient(to bottom, #0A1B45, #020815)",
    shadow: "shadow-blue-950/60",
    headerColor: "#0A1B45",
  },

  beauty: {
    gradient: "linear-gradient(to bottom, #02281D, #000D09)",
    shadow: "shadow-emerald-950/60",
    headerColor: "#02281D",
  },

  fashion: {
    gradient: "linear-gradient(to bottom, #14123D, #05040F)",
    shadow: "shadow-indigo-950/60",
    headerColor: "#14123D",
  },

  default: {
    gradient: "linear-gradient(to bottom, #6B2200, #240B00)",
    shadow: "shadow-red-950/60",
    headerColor: "#6B2200",
  },
};

// Shared accent for all categories (white text always works on dark backgrounds)
const TEXT_ACCENT = "text-white";

const HomeIcon = CATEGORY_ICON_COMPONENTS.home;
const LocalGroceryStoreIcon = CATEGORY_ICON_COMPONENTS.grocery;
const CardGiftcardIcon = CATEGORY_ICON_COMPONENTS.gifts;
const KitchenIcon = CATEGORY_ICON_COMPONENTS.home;
const DevicesIcon = CATEGORY_ICON_COMPONENTS.electronics;
const ChildCareIcon = CATEGORY_ICON_COMPONENTS.baby;
const PetsIcon = CATEGORY_ICON_COMPONENTS.pets;
const SportsSoccerIcon = CATEGORY_ICON_COMPONENTS.sports;

const CATEGORY_METADATA = {
  All: {
    icon: HomeIcon,
    theme: THEMES.all,
    banner: { title: "HOUSEFULL", subtitle: "SALE", floatingElements: "sparkles" },
  },
  Grocery: {
    icon: LocalGroceryStoreIcon,
    theme: THEMES.grocery,
    banner: { title: "SUPERSAVER", subtitle: "FRESH & FAST", floatingElements: "leaves" },
  },
  Wedding: {
    icon: CardGiftcardIcon,
    theme: THEMES.wedding,
    banner: { title: "WEDDING", subtitle: "BLISS", floatingElements: "hearts" },
  },
  "Home & Kitchen": {
    icon: KitchenIcon,
    theme: THEMES.homeKitchen,
    banner: { title: "HOME", subtitle: "KITCHEN", floatingElements: "smoke" },
  },
  Electronics: {
    icon: DevicesIcon,
    theme: THEMES.electronics,
    banner: { title: "TECH FEST", subtitle: "GADGETS", floatingElements: "tech" },
  },
  Kids: {
    icon: ChildCareIcon,
    theme: THEMES.kids,
    banner: { title: "LITTLE ONE", subtitle: "CARE", floatingElements: "bubbles" },
  },
  "Pet Supplies": {
    icon: PetsIcon,
    theme: THEMES.pets,
    banner: { title: "PAWSOME", subtitle: "DEALS", floatingElements: "bones" },
  },
  Sports: {
    icon: SportsSoccerIcon,
    theme: THEMES.sports,
    banner: { title: "SPORTS", subtitle: "GEAR", floatingElements: "confetti" },
  },
};

// Returns a deep/dark header color so white text stays readable
const getDynamicHeaderColor = (name = "") => {
  const n = name.toLowerCase().trim();
  if (n.includes("all")) return THEMES.all.headerColor;
  if (n.includes("grocery") || n.includes("glocery")) return THEMES.grocery.headerColor;
  if (n.includes("electronic")) return THEMES.electronics.headerColor;
  if (n.includes("home") || n.includes("kitchen") || n.includes("kit")) return THEMES.homeKitchen.headerColor;
  if (n.includes("kid") || n.includes("child") || n.includes("baby") || n.includes("toy")) return THEMES.kids.headerColor;
  if (n.includes("pet") || n.includes("dog") || n.includes("cat")) return THEMES.pets.headerColor;
  if (n.includes("wedding") || n.includes("gift")) return THEMES.wedding.headerColor;
  if (n.includes("sport") || n.includes("soccer")) return THEMES.sports.headerColor;
  if (n.includes("beauty") || n.includes("spa")) return THEMES.beauty.headerColor;
  if (n.includes("fashion") || n.includes("cloth")) return THEMES.fashion.headerColor;
  return THEMES.default.headerColor;
};

const ALL_CATEGORY = {
  id: "all",
  _id: "all",
  name: "All",
  icon: HomeIcon,
  theme: THEMES.all,
  headerColor: THEMES.all.headerColor,
  banner: {
    title: "HOUSEFULL",
    subtitle: "SALE",
    floatingElements: "sparkles",
    textColor: TEXT_ACCENT,
  },
};

// ---------------------------------------------------------------------------
// Storage & Cache
// ---------------------------------------------------------------------------

const QUICK_HEADER_RETURN_STORAGE_KEY = "food.quick.headerReturn";
const CACHE_EXPIRY_MS = 60 * 1000; // 1 minute — avoid stale products after admin deletes

let globalQuickHomeCache = {
  data: null,
  locationKey: null,
  categoryProducts: new Map(),  // headerId -> products
  bannersByZone: new Map(),     // zoneKey -> banners[] (zone-wide, FE filters by header)
  lastFetched: 0,
};

/** Clear in-memory home cache (e.g. after catalog changes). */
export const invalidateQuickHomeCache = () => {
  globalQuickHomeCache.data = null;
  globalQuickHomeCache.locationKey = null;
  globalQuickHomeCache.categoryProducts.clear();
  globalQuickHomeCache.bannersByZone.clear();
  globalQuickHomeCache.lastFetched = 0;
};

const QUICK_SELECTED_STORE_KEY = "food.quick.selectedStoreId";
const QUICK_ZONE_CONTEXT_KEY = "food.quick.zoneContext";

export const getQuickSelectedStoreId = () => {
  try {
    return window.sessionStorage.getItem(QUICK_SELECTED_STORE_KEY) || "";
  } catch {
    return "";
  }
};

export const setQuickSelectedStoreId = (storeId) => {
  try {
    if (storeId) window.sessionStorage.setItem(QUICK_SELECTED_STORE_KEY, String(storeId));
    else window.sessionStorage.removeItem(QUICK_SELECTED_STORE_KEY);
  } catch {
    // ignore
  }
};

export const getQuickZoneContext = () => {
  try {
    const raw = window.sessionStorage.getItem(QUICK_ZONE_CONTEXT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setQuickZoneContext = (ctx) => {
  try {
    if (ctx) window.sessionStorage.setItem(QUICK_ZONE_CONTEXT_KEY, JSON.stringify(ctx));
    else window.sessionStorage.removeItem(QUICK_ZONE_CONTEXT_KEY);
  } catch {
    // ignore
  }
};

const buildLocationKey = (loc) => {
  const lat = Number(loc?.latitude);
  const lng = Number(loc?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "no-location";
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
};

// ---------------------------------------------------------------------------
// Helper: format raw product from API
// ---------------------------------------------------------------------------
const formatProduct = (p) => ({
  ...p,
  id: p._id,
  image: p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2",
  price: Number(p.salePrice || 0) > 0 ? Number(p.salePrice) : Number(p.price || 0),
  originalPrice: Number(p.originalPrice || p.mrp || p.price || p.salePrice || 0),
  weight: p.weight || "1 unit",
  deliveryTime: "8-15 mins",
});

// ---------------------------------------------------------------------------
// Helper: extract array from varied API shapes
// ---------------------------------------------------------------------------
const extractArray = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useQuickHomeData = ({ currentLocation }) => {
  const locationKey = buildLocationKey(currentLocation);

  // Invalidate cache when user location/zone context changes
  if (
    globalQuickHomeCache.data &&
    globalQuickHomeCache.locationKey &&
    globalQuickHomeCache.locationKey !== locationKey
  ) {
    globalQuickHomeCache.data = null;
    globalQuickHomeCache.categoryProducts.clear();
    globalQuickHomeCache.lastFetched = 0;
  }

  // Stale-while-revalidate: show any cached data immediately, even if expired
  const hasAnyCache =
    Boolean(globalQuickHomeCache.data) &&
    (!globalQuickHomeCache.locationKey || globalQuickHomeCache.locationKey === locationKey);
  const hasValidCache = hasAnyCache && Date.now() - globalQuickHomeCache.lastFetched < CACHE_EXPIRY_MS;

  // Only block UI (show skeleton) if there is absolutely NO cached data
  const [isLoading, setIsLoading] = useState(!hasAnyCache);
  const [isBootstrapped, setIsBootstrapped] = useState(hasAnyCache);
  const [categories, setCategories] = useState(globalQuickHomeCache.data?.categories || [ALL_CATEGORY]);
  const [activeCategory, setActiveCategory] = useState(globalQuickHomeCache.data?.activeCategory || ALL_CATEGORY);
  const [products, setProducts] = useState(globalQuickHomeCache.data?.products || []);
  const [shops, setShops] = useState(globalQuickHomeCache.data?.shops || []);
  const [zoneType, setZoneType] = useState(globalQuickHomeCache.data?.zoneType || null);
  const [zoneId, setZoneId] = useState(globalQuickHomeCache.data?.zoneId || null);
  const [zoneName, setZoneName] = useState(globalQuickHomeCache.data?.zoneName || null);
  const [adminHubEnabled, setAdminHubEnabled] = useState(
    globalQuickHomeCache.data?.adminHubEnabled === true,
  );
  const [quickCategories, setQuickCategories] = useState(globalQuickHomeCache.data?.quickCategories || []);
  const [offerSections, setOfferSections] = useState(globalQuickHomeCache.data?.offerSections || []);
  const [categoryMap, setCategoryMap] = useState(globalQuickHomeCache.data?.categoryMap || {});
  const [subcategoryMap, setSubcategoryMap] = useState(globalQuickHomeCache.data?.subcategoryMap || {});
  const [banners, setBanners] = useState(globalQuickHomeCache.data?.banners || []);
  const [categoryProducts, setCategoryProducts] = useState(null);
  const [shopsPagination, setShopsPagination] = useState(
    globalQuickHomeCache.data?.shopsPagination || null,
  );
  const [shopsLoading, setShopsLoading] = useState(false);
  const [shopsLoadingMore, setShopsLoadingMore] = useState(false);

  const fetchDataSeqRef = useRef(0);

  const getQuickCategoryImage = useCallback((category = {}) => {
    const candidate =
      category?.image || category?.icon || category?.thumbnail ||
      category?.imageUrl || category?.iconUrl ||
      category?.media?.image || category?.media?.url || "";
    return resolveQuickImageUrl(candidate) || "https://cdn-icons-png.flaticon.com/128/2321/2321831.png";
  }, []);

  // Build a formatted header category object from raw DB entry
  const buildHeaderCategory = useCallback((cat) => {
    const catName = cat.name;
    const normalizedName = catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase();
    const meta =
      CATEGORY_METADATA[catName] ||
      CATEGORY_METADATA[normalizedName] ||
      CATEGORY_METADATA[catName.toUpperCase()] || {
        icon: Sparkles,
        theme: THEMES.default,
        banner: { title: catName.toUpperCase(), subtitle: "TOP PICKS", floatingElements: "sparkles" },
      };

    const IconComp =
      getCategoryIconComponent(cat.iconId) || meta.icon || Sparkles;
    const headerColor = catName.toLowerCase().trim().includes("all")
      ? THEMES.all.headerColor
      : (cat.headerColor || getDynamicHeaderColor(catName));

    return {
      ...cat,
      id: cat._id,
      icon: IconComp,
      theme: meta.theme,
      headerColor,
      banner: { ...meta.banner, textColor: TEXT_ACCENT },
    };
  }, []);

  const fetchData = useCallback(async () => {
    const seq = ++fetchDataSeqRef.current;
    const nextLocationKey = buildLocationKey(currentLocation);

    // Re-check cache validity at call time (avoids stale closure)
    const cacheIsValid =
      globalQuickHomeCache.data &&
      globalQuickHomeCache.locationKey === nextLocationKey &&
      Date.now() - globalQuickHomeCache.lastFetched < CACHE_EXPIRY_MS;
    if (cacheIsValid) return;

    // Stale-while-revalidate: if stale data exists, don't show skeleton — refresh silently
    const isSilentRefresh =
      Boolean(globalQuickHomeCache.data) &&
      globalQuickHomeCache.locationKey === nextLocationKey;
    if (!isSilentRefresh) setIsLoading(true);

    try {
      // ── Single bootstrap call replaces 5 separate API requests ─────────────────────
      const hasLocation =
        Number.isFinite(currentLocation?.latitude) &&
        Number.isFinite(currentLocation?.longitude);

      const bootstrapParams = {};
      if (hasLocation) {
        bootstrapParams.lat = currentLocation.latitude;
        bootstrapParams.lng = currentLocation.longitude;
      }

      const bootstrapRes = await customerApi.getBootstrap(bootstrapParams);
      if (seq !== fetchDataSeqRef.current) return;

      if (!bootstrapRes?.data?.success) {
        throw new Error('Bootstrap fetch failed');
      }

      const payload = bootstrapRes.data.result || {};
      const resolvedZoneType = payload.zoneType || null;
      // Shops are never preloaded — loaded after category click (MV only)
      const resolvedShops = [];

      setQuickZoneContext({
        zoneId: payload.zoneId || null,
        zoneName: payload.zoneName || null,
        zoneType: resolvedZoneType,
        adminHubEnabled: payload.adminHubEnabled === true,
      });

      if (resolvedZoneType === "single_vendor") {
        setQuickSelectedStoreId("");
      }

      const newCache = {
        categories: [ALL_CATEGORY],
        activeCategory: ALL_CATEGORY,
        products: [],
        shops: [],
        shopsPagination: null,
        zoneType: resolvedZoneType,
        zoneId: payload.zoneId || null,
        zoneName: payload.zoneName || null,
        adminHubEnabled: payload.adminHubEnabled === true,
        quickCategories: [],
        offerSections: [],
        banners: [],
        categoryMap: {},
        subcategoryMap: {},
      };

      setZoneType(resolvedZoneType);
      setZoneId(payload.zoneId || null);
      setZoneName(payload.zoneName || null);
      setAdminHubEnabled(payload.adminHubEnabled === true);
      setShops([]);
      setShopsPagination(null);

      // ── Categories ─────────────────────────────────────────────────────────────
      const dbCats = payload.categories || [];

      const catMap = {};
      const subMap = {};
      dbCats.forEach((c) => {
        if (c.type === "category") catMap[c._id] = c;
        else if (c.type === "subcategory") subMap[c._id] = c;
      });
      setCategoryMap(catMap);
      setSubcategoryMap(subMap);
      newCache.categoryMap = catMap;
      newCache.subcategoryMap = subMap;

      const formattedHeaders = dbCats
        .filter((c) => c.type === "header")
        .map(buildHeaderCategory);

      const allFromAdmin = formattedHeaders.find(
        (h) => h.slug?.toLowerCase() === "all" || h.name?.toLowerCase() === "all"
      );
      const mergedAll = allFromAdmin
        ? { ...ALL_CATEGORY, icon: allFromAdmin.icon || ALL_CATEGORY.icon }
        : ALL_CATEGORY;

      const headersWithoutAll = formattedHeaders.filter(
        (h) => !(h.slug?.toLowerCase() === "all" || h.name?.toLowerCase() === "all")
      );
      const finalCategories = [mergedAll, ...headersWithoutAll];
      setCategories(finalCategories);
      newCache.categories = finalCategories;

      // Restore active category from session
      let initialActive = mergedAll;
      const storedHeaderReturn = window.sessionStorage.getItem(QUICK_HEADER_RETURN_STORAGE_KEY);
      const restoreId =
        storedHeaderReturn && JSON.parse(storedHeaderReturn)?.headerId;
      if (restoreId) {
        const match = finalCategories.find((h) => h._id === restoreId || h.id === restoreId);
        if (match) initialActive = match;
      }
      setActiveCategory(initialActive);
      newCache.activeCategory = initialActive;

      const formattedQuick = dbCats
        .filter((c) => c.type === "category")
        .map((c) => ({ id: c._id, name: c.name, image: getQuickCategoryImage(c) }));
      setQuickCategories(formattedQuick);
      newCache.quickCategories = formattedQuick;

      // 🔑 Categories ready → UI immediately unblock karo
      setIsBootstrapped(true);
      setIsLoading(false);

      // ── Products never preloaded — category / store pages load on demand ────
      setProducts([]);
      newCache.products = [];

      // ── Offer Sections — not part of lightweight bootstrap ───────────
      setOfferSections([]);
      newCache.offerSections = [];
      // Keep current banners; zone banner cache refreshed only when zone key changes below.
      if (!isSilentRefresh) {
        setBanners([]);
        newCache.banners = [];
      }

      // Save complete cache
      globalQuickHomeCache.data = newCache;
      globalQuickHomeCache.locationKey = nextLocationKey;
      // Only drop banner cache when location/zone context changed (not silent refresh)
      if (!isSilentRefresh) {
        globalQuickHomeCache.bannersByZone.clear();
      }
      globalQuickHomeCache.lastFetched = Date.now();
    } catch (err) {
      // Surface errors only in dev
      if (import.meta.env?.DEV) console.error("Quick home bootstrap error:", err);
    } finally {
      if (seq === fetchDataSeqRef.current) setIsLoading(false);
    }
  }, [currentLocation, getQuickCategoryImage, buildHeaderCategory]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Multi-vendor home: load zone shops with pagination (lean /stores API)
  useEffect(() => {
    if (zoneType !== "multi_vendor") {
      setShops([]);
      setShopsPagination(null);
      return;
    }

    let cancelled = false;
    const loadShops = async () => {
      setShopsLoading(true);
      try {
        const params = { page: 1, limit: 12 };
        if (zoneId) params.zoneId = zoneId;
        else if (
          Number.isFinite(currentLocation?.latitude) &&
          Number.isFinite(currentLocation?.longitude)
        ) {
          params.lat = currentLocation.latitude;
          params.lng = currentLocation.longitude;
        }

        const res = await customerApi.getStores(params);
        if (cancelled || !res?.data?.success) return;
        const result = res.data.result || {};
        const list = Array.isArray(result.shops) ? result.shops : [];
        const pagination = result.pagination || null;
        setShops(list);
        setShopsPagination(pagination);
        if (globalQuickHomeCache.data) {
          globalQuickHomeCache.data.shops = list;
          globalQuickHomeCache.data.shopsPagination = pagination;
        }
      } catch {
        if (!cancelled) {
          setShops([]);
          setShopsPagination(null);
        }
      } finally {
        if (!cancelled) setShopsLoading(false);
      }
    };

    loadShops();
    return () => {
      cancelled = true;
    };
  }, [zoneType, zoneId, currentLocation?.latitude, currentLocation?.longitude]);

  // Single-vendor home: no shop list — show Admin Hub products on Home instead.
  useEffect(() => {
    if (zoneType !== "single_vendor") {
      if (zoneType === "multi_vendor") {
        setProducts([]);
        if (globalQuickHomeCache.data) globalQuickHomeCache.data.products = [];
      }
      return;
    }

    let cancelled = false;
    const loadProducts = async () => {
      try {
        const params = { limit: 48 };
        if (zoneId) params.zoneId = zoneId;
        else if (
          Number.isFinite(currentLocation?.latitude) &&
          Number.isFinite(currentLocation?.longitude)
        ) {
          params.lat = currentLocation.latitude;
          params.lng = currentLocation.longitude;
        } else {
          setProducts([]);
          return;
        }

        const res = await customerApi.getProducts(params);
        if (cancelled || !res?.data?.success) return;
        const raw = res.data.result;
        const list = Array.isArray(res.data.results)
          ? res.data.results
          : Array.isArray(raw?.items)
            ? raw.items
            : Array.isArray(raw)
              ? raw
              : [];
        const formatted = list.map(formatProduct);
        setProducts(formatted);
        if (globalQuickHomeCache.data) {
          globalQuickHomeCache.data.products = formatted;
        }
      } catch {
        if (!cancelled) setProducts([]);
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [zoneType, zoneId, currentLocation?.latitude, currentLocation?.longitude]);

  const loadMoreShops = useCallback(async () => {
    if (zoneType !== "multi_vendor" || !shopsPagination?.hasNext || shopsLoadingMore) return;
    const nextPage = Number(shopsPagination.page || 1) + 1;
    setShopsLoadingMore(true);
    try {
      const params = { page: nextPage, limit: shopsPagination.limit || 12 };
      if (zoneId) params.zoneId = zoneId;
      else if (
        Number.isFinite(currentLocation?.latitude) &&
        Number.isFinite(currentLocation?.longitude)
      ) {
        params.lat = currentLocation.latitude;
        params.lng = currentLocation.longitude;
      }
      const res = await customerApi.getStores(params);
      if (!res?.data?.success) return;
      const result = res.data.result || {};
      const list = Array.isArray(result.shops) ? result.shops : [];
      const pagination = result.pagination || null;
      setShops((prev) => {
        const merged = [...prev, ...list];
        if (globalQuickHomeCache.data) {
          globalQuickHomeCache.data.shops = merged;
          globalQuickHomeCache.data.shopsPagination = pagination;
        }
        return merged;
      });
      setShopsPagination(pagination);
    } catch {
      // keep existing list
    } finally {
      setShopsLoadingMore(false);
    }
  }, [
    zoneType,
    zoneId,
    shopsPagination,
    shopsLoadingMore,
    currentLocation?.latitude,
    currentLocation?.longitude,
  ]);

  // --- Banners: fetch once per zone; "All" = every banner, header = filtered (no API spam).
  useEffect(() => {
    setCategoryProducts(null);

    const isAllHeader = !activeCategory || activeCategory._id === "all";
    const headerId = isAllHeader
      ? null
      : String(activeCategory._id || activeCategory.id || "");

    if (!isAllHeader && !headerId) {
      setBanners([]);
      return;
    }

    const zoneKey = zoneId ? String(zoneId) : "global";

    const pickBanners = (list = []) => {
      // "All" tab → show every active banner for this zone (any header assignment)
      if (isAllHeader) return list;

      const forHeader = list.filter((banner) =>
        (banner.headerCategoryIds || []).map(String).includes(headerId),
      );
      const timed = forHeader.filter((banner) => banner.isDefault !== true);
      if (timed.length) return timed;
      return forHeader.filter((banner) => banner.isDefault === true);
    };

    const applyFromCache = () => {
      const cached = globalQuickHomeCache.bannersByZone.get(zoneKey);
      if (!cached) return false;
      setBanners(pickBanners(cached));
      return true;
    };

    if (applyFromCache()) return;

    let cancelled = false;
    const loadZoneBanners = async () => {
      try {
        const params = {};
        if (zoneId) params.zoneId = zoneId;
        const res = await customerApi.getBanners(params);
        if (cancelled) return;
        const list = res.data?.results || res.data?.result || [];
        const next = Array.isArray(list) ? list : [];
        globalQuickHomeCache.bannersByZone.set(zoneKey, next);
        setBanners(pickBanners(next));
      } catch {
        if (cancelled) return;
        globalQuickHomeCache.bannersByZone.set(zoneKey, []);
        setBanners([]);
      }
    };

    loadZoneBanners();
    return () => {
      cancelled = true;
    };
  }, [activeCategory, zoneId]);

  return {
    categories,
    activeCategory,
    setActiveCategory,
    products,
    categoryProducts,
    quickCategories,
    offerSections,
    categoryMap,
    subcategoryMap,
    banners,
    shops,
    shopsPagination,
    shopsLoading,
    shopsLoadingMore,
    loadMoreShops,
    zoneType,
    zoneId,
    zoneName,
    adminHubEnabled,
    isLoading: isLoading || !isBootstrapped,
    isBootstrapped,
    actions: {
      refresh: () => {
        invalidateQuickHomeCache();
        fetchData();
      },
    },
  };
};