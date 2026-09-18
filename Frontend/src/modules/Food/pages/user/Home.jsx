import { useSearchParams, Link, useNavigate, useLocation as useRouterLocation } from "react-router-dom";
import React, {
  Suspense,
  lazy,
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
  startTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  Star,
  Clock,
  MapPin,
  Heart,
  Search,
  Tag,
  Flame,
  ShoppingBag,
  ShoppingCart,
  Mic,
  SlidersHorizontal,
  CheckCircle2,
  Bookmark,
  BadgePercent,
  X,
  ArrowDownUp,
  Timer,
  CalendarClock,
  ShieldCheck,
  IndianRupee,
  UtensilsCrossed,
  Leaf,
  AlertCircle,
  Loader2,
  Plus,
  Check,
  Share2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CategoryChipRowSkeleton,
  ExploreGridSkeleton,
  HeroBannerSkeleton,
  LoadingSkeletonRegion,
  RestaurantCardSkeleton,
  RestaurantGridSkeleton,
} from "@food/components/ui/loading-skeletons";
import { useProfile } from "@food/context/ProfileContext";
import { useCart } from "@food/context/CartContext";
import { HorizontalCarousel } from "@food/components/ui/horizontal-carousel";
import { DotPattern } from "@food/components/ui/dot-pattern";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@food/components/ui/card";
import { Button } from "@food/components/ui/button";
import { Badge } from "@food/components/ui/badge";
import { Input } from "@food/components/ui/input";
import { Switch } from "@food/components/ui/switch";
import { Checkbox } from "@food/components/ui/checkbox";
import {
  useSearchOverlay,
  useLocationSelector,
} from "@food/components/user/UserLayout";

const debugLog = (...args) => { };
const debugWarn = (...args) => { };
const debugError = (...args) => { };

// Import shared food images - prevents duplication
import { foodImages } from "@food/constants/images";

import { Avatar, AvatarFallback } from "@food/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@food/components/ui/dropdown-menu";
import { useLocation } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";

import offerImage from "@food/assets/offerimage.png";
import bannerEatingFood from "../../../../assets/eading_food_2_image-removebg-preview.png";
import bannerEatingBoy from "../../../../assets/eating_boy_image-removebg-preview.png";
import api, { publicGetOnce, restaurantAPI, adminAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";
import OptimizedImage from "@food/components/OptimizedImage";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";
import HomeHeader from "@food/components/user/home/HomeHeader";
import { LocationProvider as QuickLocationProvider } from "../../../quickCommerce/user/context/LocationContext";
import { ProductDetailProvider as QuickProductDetailProvider } from "../../../quickCommerce/user/context/ProductDetailContext";
import { WishlistProvider as QuickWishlistProvider } from "../../../quickCommerce/user/context/WishlistContext";
import { CartAnimationProvider as QuickCartAnimationProvider } from "../../../quickCommerce/user/context/CartAnimationContext";
import { CartProvider as QuickCartProvider } from "../../../quickCommerce/user/context/CartContext";
import { prefetchQuickHomeBootstrap } from "../../../quickCommerce/user/services/customerApi";
import { PorterProvider } from "../../../porter/user/context/BookingContext";
import PromoRow from "@food/components/user/home/PromoRow";
import { optimizeCloudinaryUrl } from "../../../../shared/utils/cloudinaryUtils";
import VegModePopups from "@food/components/user/VegModePopups";
import useModuleBackHandler from "@/modules/common/hooks/useModuleBackHandler";
import { useEnabledModules } from "@/modules/common/hooks/useEnabledModules";
import {
  getFirstEnabledModulePath,
  getVisibleHomeTabs,
  rememberUserModulePath,
  resolveTabFromPath,
  TAB_TO_MODULE_KEY,
} from "@/modules/common/utils/enabledModules";

import * as imgUtils from "@food/utils/imageUtils";
import { useFoodHomeData } from "@food/hooks/useFoodHomeData";

// Extracted Sub-components
const BannerSection = lazy(() => import("@food/components/user/home/BannerSection"));
const CategoryRail = lazy(() => import("@food/components/user/home/CategoryRail"));
const RecommendedSection = lazy(() => import("@food/components/user/home/RecommendedSection"));
const RestaurantGrid = lazy(() => import("@food/components/user/home/RestaurantGrid"));
const SortFilterSection = lazy(() => import("@food/components/user/home/SortFilterSection"));
const ExploreMoreSection = lazy(() => import("@food/components/user/home/ExploreMoreSection"));

const MiniCart = lazy(() => import("@food/components/user/MiniCart"));
const OrderTrackingCard = lazy(() => import("@food/components/user/OrderTrackingCard"));
const QuickCommerceHomePage = lazy(() => import("../../../quickCommerce/user/pages/Home"));
const PorterHomePage = lazy(() => import("../../../porter/user/pages/Home"));
const TaxiHomePage = lazy(() => import("../../../taxi/user/pages/Home"));
const BikeRentHomePage = lazy(() => import("../../../bikeRent/user/pages/Home"));

// Animated placeholder for search - moved outside component to prevent recreation
const placeholders = [
  'Search "burger"', 'Search "biryani"', 'Search "pizza"', 'Search "desserts"',
  'Search "chinese"', 'Search "thali"', 'Search "momos"', 'Search "dosa"', 'Search "thali"',
];

const quickPlaceholders = [
  'Search "milk"', 'Search "bread"', 'Search "eggs"', 'Search "chips"',
  'Search "fruits"', 'Search "atta"', 'Search "cold drink"', 'Search "ice cream"',
];

const WEBVIEW_SESSION_CACHE_BUSTER = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getStoredDeliveryAddressMode = () => {
  if (typeof window === "undefined") return "saved";
  return window.localStorage.getItem("deliveryAddressMode") || "saved";
};

const defaultBannersImages = [
  bannerEatingBoy,
  bannerEatingFood,
  bannerEatingBoy
];

const defaultBannersData = [
  { isFallback: true, title: "A SIX IS HIT! 🏏", subtitle: "66% OFF FOR 10 MIN!", action: "Order Now" },
  { isFallback: true, title: "MATCH DAY SPECIAL", subtitle: "Free Delivery on Pizza", action: "Explore" },
  { isFallback: true, title: "CRAVINGS SATISFIED", subtitle: "Flat ₹150 Off", action: "Claim Offer" }
];

const normalizeHeroBanner = (banner = {}) => ({
  ...banner,
  title: banner.title || "",
  subtitle: banner.subtitle || "",
  description: banner.description || "",
  ctaText: banner.ctaText || "",
  ctaLink: banner.ctaLink || "",
  action: banner.action || banner.ctaText || "",
  imageUrl: banner.imageUrl || "",
  linkedRestaurants: Array.isArray(banner.linkedRestaurants) ? banner.linkedRestaurants : [],
});

export default function Home() {
  useModuleBackHandler(true);
  const HERO_BANNER_AUTO_SLIDE_MS = 3500;
  const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [heroSearch, setHeroSearch] = useState("");
  const { openSearch, closeSearch, searchValue, setSearchValue } = useSearchOverlay();
  const { openLocationSelector } = useLocationSelector();
  const { vegMode, setVegMode: setVegModeContext, isFavorite, addFavorite, removeFavorite, getDefaultAddress } = useProfile();
  const { cart } = useCart();
  const hasFoodCartItems = useMemo(
    () => cart.some((item) => (item?.orderType || "food") !== "quick"),
    [cart],
  );

  const [prevVegMode, setPrevVegMode] = useState(vegMode);
  const [showVegModePopup, setShowVegModePopup] = useState(false);
  const [showSwitchOffPopup, setShowSwitchOffPopup] = useState(false);
  const [isApplyingVegMode, setIsApplyingVegMode] = useState(false);
  const [isSwitchingOffVegMode, setIsSwitchingOffVegMode] = useState(false);
  const [showAllCategoriesModal, setShowAllCategoriesModal] = useState(false);
  const [availabilityTick, setAvailabilityTick] = useState(Date.now());
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [activeTab, setActiveTab] = useState(() =>
    resolveTabFromPath(
      typeof window !== "undefined" ? window.location?.pathname : "",
    ),
  );
  const [showToast, setShowToast] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const heroShellRef = useRef(null);
  const restaurantLoadMoreRef = useRef(null);
  const isHandlingSwitchOff = useRef(false);
  const routerLocation = useRouterLocation();
  const { modules: enabledModules, loading: modulesLoading } = useEnabledModules();
  const visibleHomeTabs = useMemo(
    () => getVisibleHomeTabs(enabledModules),
    [enabledModules],
  );

  // --- Location Logic ---
  const { location } = useLocation();
  const { zoneId: liveZoneId, isInService: isLiveInService } = useZone(location);
  const defaultSavedAddress = useMemo(() => getDefaultAddress?.() || null, [getDefaultAddress]);
  const defaultSavedAddressLocation = useMemo(() => {
    if (!defaultSavedAddress) return null;
    const coords = defaultSavedAddress?.location?.coordinates;
    const latitude = Array.isArray(coords) && coords.length >= 2 ? coords[1] : (defaultSavedAddress.latitude ?? null);
    const longitude = Array.isArray(coords) && coords.length >= 2 ? coords[0] : (defaultSavedAddress.longitude ?? null);
    return {
      ...defaultSavedAddress,
      latitude,
      longitude,
      area: defaultSavedAddress.additionalDetails || defaultSavedAddress.area || "",
      zipCode: defaultSavedAddress.zipCode || defaultSavedAddress.postalCode || "",
      postalCode: defaultSavedAddress.postalCode || defaultSavedAddress.zipCode || "",
    };
  }, [defaultSavedAddress]);
  const { zoneId: savedZoneId, isInService: isSavedInService } = useZone(defaultSavedAddressLocation);

  const deliveryAddressMode = getStoredDeliveryAddressMode();
  const effectiveZoneId = (deliveryAddressMode === "current" ? liveZoneId : savedZoneId) || liveZoneId;
  const effectiveLocation = (deliveryAddressMode === "current" ? location : defaultSavedAddressLocation) || location;

  // --- Core Data Hook ---
  const {
    banners,
    categories,
    restaurants,
    landing,
    meta,
    actions,
    state
  } = useFoodHomeData({
    zoneId: effectiveZoneId,
    location: effectiveLocation,
    vegMode,
    backendOrigin: BACKEND_ORIGIN,
    availabilityTick
  });

  // --- UI Effects ---
  useEffect(() => {
    const intervalId = setInterval(() => {
      startTransition(() => setAvailabilityTick(Date.now()));
    }, 60000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const activePlaceholders = activeTab === "quick" ? quickPlaceholders : placeholders;
      setPlaceholderIndex((prev) => (prev + 1) % activePlaceholders.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const hasApiBanners = Array.isArray(banners?.data) && banners.data.length > 0;

  const activeBannerData = useMemo(() => {
    if (hasApiBanners) {
      return banners.data.map(normalizeHeroBanner);
    }
    return defaultBannersData;
  }, [banners?.data, hasApiBanners]);

  const activeBannerImages = useMemo(() => {
    if (hasApiBanners) {
      const fromImages = Array.isArray(banners?.images) ? banners.images.filter(Boolean) : [];
      if (fromImages.length > 0) return fromImages;
      return activeBannerData.map((b) => b.imageUrl).filter(Boolean);
    }
    return defaultBannersImages;
  }, [hasApiBanners, banners?.images, activeBannerData]);

  // Homepage video from landing settings becomes first carousel slide
  const heroSlides = useMemo(() => {
    const slides = activeBannerData.map((banner, index) => ({
      ...banner,
      imageUrl: activeBannerImages[index] || banner.imageUrl || "",
    }));

    if (landing?.videoUrl) {
      return [
        {
          type: "video",
          imageUrl: landing.videoUrl,
          title: "",
          subtitle: "",
          description: "",
          action: "",
          ctaText: "",
          ctaLink: "",
        },
        ...slides,
      ];
    }

    return slides;
  }, [activeBannerData, activeBannerImages, landing?.videoUrl]);

  // Prefer full banner objects so image index always matches title/subtitle/cta.
  // Do NOT filter images independently — that desyncs overlay text from the active slide.
  const heroBannerImages = useMemo(
    () => heroSlides.map((slide) => slide.imageUrl || ""),
    [heroSlides],
  );

  // Auto-slide banners
  useEffect(() => {
    const count = heroSlides.filter((s) => s?.imageUrl).length;
    if (!count) return undefined;
    setCurrentBannerIndex((prev) => Math.min(prev, count - 1));
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % count);
    }, HERO_BANNER_AUTO_SLIDE_MS);
    return () => clearInterval(interval);
  }, [heroSlides]);

  // Prevent body scroll when popups are open
  useEffect(() => {
    if (showVegModePopup || showSwitchOffPopup || showAllCategoriesModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showVegModePopup, showSwitchOffPopup, showAllCategoriesModal]);

  // Sync activeTab with URL and respect disabled modules
  useEffect(() => {
    if (modulesLoading) return;

    const path = routerLocation.pathname;
    const targetTab = resolveTabFromPath(path);
    const moduleKey = TAB_TO_MODULE_KEY[targetTab] || "food";

    if (enabledModules[moduleKey] === false) {
      const fallbackPath = getFirstEnabledModulePath(enabledModules);
      if (fallbackPath && fallbackPath !== path) {
        navigate(fallbackPath, { replace: true });
      }
      return;
    }

    rememberUserModulePath(path);
    if (activeTab !== targetTab) setActiveTab(targetTab);
  }, [routerLocation.pathname, enabledModules, modulesLoading, activeTab, navigate]);

  // Only correct invalid tabs after URL sync — never steal a valid URL module
  useEffect(() => {
    if (modulesLoading || visibleHomeTabs.length === 0) return;
    const pathTab = resolveTabFromPath(routerLocation.pathname);
    const allowedTabIds = new Set(visibleHomeTabs.map((tab) => tab.id));

    // Prefer staying on the URL module when it is enabled
    if (allowedTabIds.has(pathTab)) {
      if (activeTab !== pathTab) setActiveTab(pathTab);
      return;
    }

    if (!allowedTabIds.has(activeTab)) {
      const nextTab = visibleHomeTabs[0].id;
      if (nextTab === "quick") navigate("/quick", { replace: true });
      else if (nextTab === "porter") navigate("/porter", { replace: true });
      else if (nextTab === "taxi") navigate("/taxi", { replace: true });
      else if (nextTab === "bike") navigate("/bike-rent", { replace: true });
      else navigate("/food/user", { replace: true });
    }
  }, [
    activeTab,
    modulesLoading,
    navigate,
    visibleHomeTabs,
    routerLocation.pathname,
  ]);

  // --- Handlers ---
  const handleTabChange = (tab) => {
    const moduleKey = TAB_TO_MODULE_KEY[tab] || "food";
    if (enabledModules[moduleKey] === false) return;

    startTransition(() => setActiveTab(tab));
    if (tab === "quick") navigate("/quick");
    else if (tab === "porter") navigate("/porter");
    else if (tab === "taxi") navigate("/taxi");
    else if (tab === "bike") navigate("/bike-rent");
    else navigate("/food/user");
  };

  const handleVegModeChange = (newValue) => {
    if (isHandlingSwitchOff.current) return;
    if (newValue && !vegMode) setShowVegModePopup(true);
    else if (!newValue && vegMode) {
      isHandlingSwitchOff.current = true;
      setShowSwitchOffPopup(true);
    } else {
      setVegModeContext(newValue);
    }
  };

  const handleSearchFocus = useCallback(() => {
    if (activeTab === "quick") navigate("/quick/search");
    else {
      if (heroSearch) setSearchValue(heroSearch);
      openSearch();
    }
  }, [activeTab, heroSearch, navigate, openSearch, setSearchValue]);

  const handleFavoriteToggle = useCallback((e, restaurant, slug, favorite) => {
    if (favorite) removeFavorite(slug);
    else {
      addFavorite({
        ...restaurant,
        slug: slug,
        image: restaurant.profileImageUrl?.url || restaurant.image || "",
      });
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }
  }, [addFavorite, removeFavorite]);

  // --- Render ---
  return (
    <div
      className={`relative min-h-screen md:pb-6 ${
        activeTab === "porter"
          ? "bg-[#F4F7FC]"
          : "bg-white dark:bg-[#0a0a0a]"
      } ${
        activeTab === "taxi" || activeTab === "bike" || activeTab === "porter" ? "pb-0" : "pb-16"
      }`}
    >
      <div
        id={activeTab === "taxi" ? "taxi-floating-chrome" : undefined}
        className={`md:hidden z-[60] ${
          activeTab === "taxi"
            ? "pointer-events-none fixed inset-x-0 top-0 bg-transparent"
            : activeTab === "porter"
              ? "sticky top-0 bg-transparent"
              : "sticky top-0 bg-white dark:bg-[#0a0a0a]"
        }`}
      >
        {!state.isBootstrapped ? (
          <div className="pointer-events-auto px-4 pt-6 pb-4">
            <div className="h-10 w-48 bg-slate-100 animate-pulse rounded-xl mb-6" />
            <div className="h-14 w-full bg-slate-100 animate-pulse rounded-2xl" />
          </div>
        ) : (
          <div
            className={
              activeTab === "taxi"
                ? "pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_[role=button]]:pointer-events-auto [&_input]:pointer-events-auto"
                : undefined
            }
          >
            <HomeHeader
              activeTab={activeTab}
              setActiveTab={handleTabChange}
              tabsOnly={activeTab === "porter"}
              location={location}
              savedAddressText={imgUtils.formatSavedAddress(effectiveLocation)}
              handleLocationClick={() => openLocationSelector()}
              handleSearchFocus={handleSearchFocus}
              placeholderIndex={placeholderIndex}
              placeholders={activeTab === "quick" ? quickPlaceholders : placeholders}
              vegMode={vegMode}
              onVegModeChange={handleVegModeChange}
              headerVideoUrl={landing.videoUrl}
              bannerComponent={
                <Suspense fallback={<HeroBannerSkeleton className="h-[130px] w-full" />}>
                  <div className="h-[150px] sm:h-40 md:h-44 relative z-10 w-full">
                    <BannerSection
                      showBannerSkeleton={banners.loading}
                      heroBannerImages={heroBannerImages}
                      heroBannersData={heroSlides}
                      currentBannerIndex={currentBannerIndex}
                      setCurrentBannerIndex={setCurrentBannerIndex}
                      heroShellRef={heroShellRef}
                      navigate={navigate}
                      backendOrigin={BACKEND_ORIGIN}
                      hideOverlay={false}
                    />
                  </div>
                </Suspense>
              }
            />
          </div>
        )}
      </div>

      {/* Desktop/tablet: keep the shared service switcher visible on Bike Rent / Porter */}
      {state.isBootstrapped && (activeTab === "bike" || activeTab === "porter") ? (
        <div className={`hidden md:block relative z-[50] ${activeTab === "porter" ? "bg-transparent" : ""}`}>
          <HomeHeader
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            tabsOnly
          />
        </div>
      ) : null}

      <AnimatePresence initial={false} mode="wait">
        {activeTab === "food" ? (
          <motion.div
            key="food-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="bg-white dark:bg-[#0a0a0a]"
          >
            <div className="max-w-7xl mx-auto">
              <Suspense fallback={<CategoryChipRowSkeleton className="py-1" />}>
                <CategoryRail
                  displayCategories={categories.display}
                  showCategorySkeleton={categories.loading}
                  navigate={navigate}
                  setShowAllCategoriesModal={setShowAllCategoriesModal}
                  backendOrigin={BACKEND_ORIGIN}
                />
              </Suspense>

              <Suspense fallback={null}>
                <RecommendedSection recommendedForYouRestaurants={meta.recommended} />
              </Suspense>

              <Suspense fallback={<HeroBannerSkeleton className="h-full w-full px-4 mt-3" />}>
                <section className="hidden md:block content-auto px-4 py-3 sm:py-5 lg:py-6">
                  <div className="overflow-hidden rounded-2xl h-48 sm:h-64 md:h-72 lg:h-[320px] shadow-md border border-gray-100 dark:border-gray-900/60">
                    <BannerSection
                      showBannerSkeleton={banners.loading}
                      heroBannerImages={heroBannerImages}
                      heroBannersData={heroSlides}
                      currentBannerIndex={currentBannerIndex}
                      setCurrentBannerIndex={setCurrentBannerIndex}
                      heroShellRef={heroShellRef}
                      navigate={navigate}
                      backendOrigin={BACKEND_ORIGIN}
                      hideOverlay={false}
                    />
                  </div>
                </section>
              </Suspense>

              <Suspense fallback={null}>
                <ExploreMoreSection
                  exploreMoreHeading={landing.heading}
                  showExploreSkeleton={landing.loading}
                  finalExploreItems={landing.exploreMore}
                  backendOrigin={BACKEND_ORIGIN}
                />
              </Suspense>
            </div>

            <Suspense fallback={null}>
              <SortFilterSection
                activeFilters={state.activeFilters}
                toggleFilter={actions.toggleFilter}
                setIsFilterOpen={(val) => { }} // Hook handles internal apply
              />
            </Suspense>

            <Suspense fallback={<RestaurantGridSkeleton count={3} />}>
              <RestaurantGrid
                filteredRestaurants={restaurants.visible}
                visibleRestaurants={restaurants.visible}
                showRestaurantSkeleton={restaurants.loading}
                isLoadingFilterResults={restaurants.isLoadingFilterResults}
                loadingRestaurants={restaurants.loading}
                availabilityTick={availabilityTick}
                isFavorite={isFavorite}
                onFavoriteToggle={handleFavoriteToggle}
                backendOrigin={BACKEND_ORIGIN}
                hasMoreRestaurants={restaurants.hasMore}
                loadMoreRestaurants={actions.loadMoreRestaurants}
                restaurantLoadMoreRef={restaurantLoadMoreRef}
              />
            </Suspense>
          </motion.div>
        ) : activeTab === "quick" ? (
          <motion.div
            key="quick-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="bg-transparent"
          >
            <QuickLocationProvider>
              <QuickCartProvider>
                <QuickWishlistProvider>
                  <QuickCartAnimationProvider>
                    <QuickProductDetailProvider>
                      <Suspense fallback={<div className="h-screen w-full bg-white dark:bg-[#0a0a0a]" />}>
                        <QuickCommerceHomePage
                          embedded
                        />
                      </Suspense>
                    </QuickProductDetailProvider>
                  </QuickCartAnimationProvider>
                </QuickWishlistProvider>
              </QuickCartProvider>
            </QuickLocationProvider>
          </motion.div>
        ) : activeTab === "taxi" ? (
          <motion.div
            key="taxi-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="bg-transparent"
          >
            <Suspense fallback={<div className="h-screen w-full bg-slate-50 dark:bg-[#0a0a0a]" />}>
              <TaxiHomePage embedded />
            </Suspense>
          </motion.div>
        ) : activeTab === "bike" ? (
          <motion.div
            key="bike-rent-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="bg-transparent"
          >
            <Suspense fallback={<div className="h-screen w-full bg-slate-50 dark:bg-[#0a0a0a]" />}>
              <BikeRentHomePage embedded />
            </Suspense>
          </motion.div>
        ) : (
          <motion.div
            key="porter-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="bg-transparent"
          >
            <PorterProvider>
              <Suspense fallback={<div className="h-screen w-full bg-[#FAF7F2] dark:bg-[#0a0a0a]" />}>
                <PorterHomePage embedded />
              </Suspense>
            </PorterProvider>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Veg Mode Popups (Enable / Switch Off) */}
      <VegModePopups
        showVegModePopup={showVegModePopup}
        showSwitchOffPopup={showSwitchOffPopup}
        onCloseVegPopup={(level) => {
          setShowVegModePopup(false);
          if (level) {
            setVegModeContext(level);
          }
        }}
        onCloseSwitchOffPopup={() => {
          setShowSwitchOffPopup(false);
          isHandlingSwitchOff.current = false;
        }}
        onConfirmSwitchOff={() => {
          setVegModeContext(false);
          setShowSwitchOffPopup(false);
          isHandlingSwitchOff.current = false;
        }}
      />

      {/* Category Modal */}
      <AnimatePresence>
        {showAllCategoriesModal && (
          <div className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#1a1a1a]">
            <HomeHeader embedded location={location} savedAddressText="All Categories" handleLocationClick={() => setShowAllCategoriesModal(false)} />
            <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6">
              <div className="grid grid-cols-3 gap-x-3 gap-y-5 min-[430px]:grid-cols-4 sm:grid-cols-4 sm:gap-x-5 sm:gap-y-6 md:grid-cols-5 lg:grid-cols-6">
                {categories.display.map(cat => (
                  <Link key={cat.id} to={`/user/category/${cat.slug}`} className="flex min-w-0 flex-col items-center gap-2" onClick={() => setShowAllCategoriesModal(false)}>
                    <div className="h-16 w-16 overflow-hidden rounded-2xl bg-gray-50 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800 sm:h-20 sm:w-20">
                      <OptimizedImage src={cat.image} className="w-full h-full object-cover" backendOrigin={BACKEND_ORIGIN} />
                    </div>
                    <span className="line-clamp-2 max-w-full text-center text-[11px] font-bold leading-tight text-gray-700 dark:text-gray-300 sm:text-xs">{cat.name}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/95 p-4 backdrop-blur dark:border-gray-800 dark:bg-[#1a1a1a]/95">
              <Button className="h-12 w-full rounded-2xl font-bold" variant="secondary" onClick={() => setShowAllCategoriesModal(false)}>Close</Button>
            </div>
          </div>
        )}
      </AnimatePresence>

      {hasFoodCartItems && activeTab !== "taxi" && activeTab !== "bike" && activeTab !== "porter" && (
        <Suspense fallback={null}><MiniCart /></Suspense>
      )}
      {activeTab !== "taxi" && activeTab !== "bike" && activeTab !== "porter" ? (
        <Suspense fallback={null}><OrderTrackingCard hasBottomNav /></Suspense>
      ) : null}
    </div>
  );
}
