import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation as useRouterLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Navigation,
  MapPin,
  ChevronDown,
  Search,
  Mic,
  Bookmark,
  Wallet,
  Bell,
  BellOff,
  X,
  ShoppingCart,
  Pizza,
  Beef,
  ChefHat,
  Soup,
  Coffee,
  UtensilsCrossed,
  ShoppingBag,
  Truck,
  CarTaxiFront,
  Bike,
  Wrench,
  HardHat,
  LayoutGrid,
} from "lucide-react";
import { useEnabledModules } from "@/modules/common/hooks/useEnabledModules";
import { getVisibleHomeTabs } from "@/modules/common/utils/enabledModules";
import { cn } from "@/lib/utils";
import { Switch } from "@food/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@food/components/ui/popover";
import { Badge } from "@food/components/ui/badge";
import foodPattern from "@food/assets/food_pattern_background.png";
import useNotificationInbox from "@food/hooks/useNotificationInbox";
import { useLocationSelector } from "@food/components/user/UserLayout";

const tabs = [
  {
    id: "quick",
    name: "Quick",
    icon: ShoppingBag,
  },
  {
    id: "food",
    name: "Food",
    icon: UtensilsCrossed,
  },
  {
    id: "porter",
    name: "Porter",
    icon: Truck,
  },
  {
    id: "taxi",
    name: "Taxi",
    icon: CarTaxiFront,
  },
  {
    id: "bike",
    name: "Bike Rent",
    icon: Bike,
  },
  {
    id: "services",
    name: "Services",
    icon: Wrench,
    route: "/services",
  },
  {
    id: "construction",
    name: "Construction",
    icon: HardHat,
    route: "/construction",
  },
];

const normalizeHex = (hex, fallback = "#8e24aa") => {
  const value = String(hex || "").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
};

const withAlpha = (hex, alpha) => {
  const value = normalizeHex(hex).slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const quickTheme = (baseColor) => {
  const base = normalizeHex(baseColor, "#FF6A00");
  return {
    accent: base,
  };
};

const foodTheme = (vegMode) => {
  const base = vegMode ? "#2e7d32" : "#FF6A00";
  return {
    accent: base,
  };
};

const isMeaningfulLocationValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(
    normalized &&
    normalized !== "select location" &&
    normalized !== "current location"
  );
};

const buildLocationDisplay = (savedAddressText, location) => {
  if (isMeaningfulLocationValue(savedAddressText)) {
    const parts = String(savedAddressText)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 3) {
      return {
        title: parts.slice(0, 2).join(", "),
        subtitle: parts.slice(2).join(", "),
      };
    }

    if (parts.length === 2) {
      return {
        title: parts.join(", "),
        subtitle: "Tap to choose delivery location",
      };
    }

    return {
      title: String(savedAddressText).trim(),
      subtitle: "Tap to choose delivery location",
    };
  }

  const fallbackTitle =
    location?.area || location?.city || "Select Location";
  const fallbackSubtitle =
    location?.address || location?.city || "Tap to choose delivery location";

  return {
    title: fallbackTitle,
    subtitle: fallbackSubtitle,
  };
};

const isColorDark = (color) => {
  if (!color || !color.startsWith('#')) return false;
  let c = color.substring(1);
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const rgb = parseInt(c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140;
};

export default function HomeHeader({
  activeTab,
  setActiveTab,
  location,
  savedAddressText,
  handleLocationClick,
  handleSearchFocus,
  placeholderIndex,
  placeholders,
  vegMode = false,
  onVegModeChange,
  headerVideoUrl,
  quickThemeColor,
  onQuickTabIntent,
  bannerComponent,
  /** When true, render only the shared service switcher tabs (reuse on Bike Rent pages). */
  tabsOnly = false,
  /** Optional formatted balance string (e.g. "₹1,234") shown next to the wallet icon —
   *  opt-in so modules that don't pass it (Food/Taxi/Bike/Porter/Quick) render exactly
   *  as before. */
  walletBalance,
}) {
  const navigate = useNavigate();
  const { openLocationSelector } = useLocationSelector();
  const { modules: enabledModules } = useEnabledModules();
  const onLocationClick = handleLocationClick || openLocationSelector;
  const visibleTabs = useMemo(
    () =>
      tabs.filter((tab) => {
        const moduleKey =
          tab.id === "quick"
            ? "quickCommerce"
            : tab.id === "porter"
              ? "porter"
              : tab.id === "taxi"
                ? "taxi"
                : tab.id === "bike"
                  ? "bikeRent"
                  : tab.id === "services"
                    ? "serviceProvider"
                    : tab.id === "construction"
                      ? "construction"
                      : "food";
        return enabledModules[moduleKey] !== false;
      }),
    [enabledModules],
  );
  const [isListening, setIsListening] = useState(false);
  const routerLocation = useRouterLocation();
  const videoRef = useRef(null);
  // The top header color remains fixed for Quick Commerce
  const FIXED_QUICK_THEME_COLOR = "#FF6A00";

  const [notifications, setNotifications] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("food_user_notifications");
    return saved ? JSON.parse(saved) : [];
  });
  const {
    items: broadcastNotifications,
    unreadCount: broadcastUnreadCount,
    dismiss: dismissBroadcastNotification,
  } = useNotificationInbox("user", { limit: 20 });

  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem("food_user_notifications");
      setNotifications(saved ? JSON.parse(saved) : []);
    };
    window.addEventListener("notificationsUpdated", sync);
    return () => window.removeEventListener("notificationsUpdated", sync);
  }, []);

  const isPorter = activeTab === "porter";
  const isTaxi = activeTab === "taxi";
  const isBike = activeTab === "bike";
  const isServices = activeTab === "services";
  const isConstruction = activeTab === "construction";
  // Porter/Taxi/Bike/Services/Construction reuse Food's light header chrome (white bg, orange/amber accent).
  const theme = activeTab === "quick"
    ? quickTheme(FIXED_QUICK_THEME_COLOR)
    : isConstruction
      ? { accent: "#F59E0B" }
      : isPorter || isTaxi || isBike || isServices
        ? { accent: "#FF6A00" }
        : foodTheme(vegMode);
  const isFood = activeTab === "food";
  const isLightChrome = isFood || isPorter || isTaxi || isBike || isServices || isConstruction;
  const isDarkTheme = !isLightChrome && isColorDark(theme.accent);
  const textColorClass = isLightChrome ? "text-gray-900" : (isDarkTheme ? "text-white" : "text-gray-900");
  const subtextColorClass = isLightChrome ? "text-gray-500" : (isDarkTheme ? "text-white/80" : "text-gray-600");
  const iconColor = isLightChrome ? theme.accent : (isDarkTheme ? "#ffffff" : "#111827");

  const walletPath =
    activeTab === "quick"
      ? "/quick/wallet"
      : activeTab === "porter"
        ? "/food/user/wallet?from=porter"
        : activeTab === "taxi"
          ? "/food/user/wallet?from=taxi"
          : activeTab === "bike"
            ? "/food/user/wallet?from=bike-rent"
            : activeTab === "services"
              ? "/food/user/wallet?from=services"
              : activeTab === "construction"
                ? "/food/user/wallet?from=construction"
                : "/food/user/wallet";
  const { title: locationTitle, subtitle: locationSubtitle } = useMemo(
    () => buildLocationDisplay(savedAddressText, location),
    [savedAddressText, location],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isFood) {
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => { });
      }
      return;
    }

    video.pause();
  }, [isFood]);

  const mergedNotifications = useMemo(() => {
    const localItems = Array.isArray(notifications)
      ? notifications.map((item) => ({ ...item, source: "local" }))
      : [];
    const remoteItems = (broadcastNotifications || []).map((item) => ({
      ...item,
      id: item.id || item._id,
      source: "broadcast",
      time: item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        : "Just now",
    }));
    return [...remoteItems, ...localItems].sort(
      (a, b) =>
        new Date(b.createdAt || b.timestamp || 0).getTime() -
        new Date(a.createdAt || a.timestamp || 0).getTime(),
    );
  }, [broadcastNotifications, notifications]);

  const unreadCount =
    notifications.filter((item) => !item.read).length + broadcastUnreadCount;

  const removeNotification = (id, source) => {
    if (source === "broadcast") {
      dismissBroadcastNotification(id);
      return;
    }
    setNotifications((prev) => {
      const next = prev.filter((item) => item.id !== id);
      localStorage.setItem("food_user_notifications", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("notificationsUpdated"));
      return next;
    });
  };

  const handleVoiceSearch = (e) => {
    // e.preventDefault();
    // e.stopPropagation();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        if (activeTab === "quick") {
          navigate("/quick/search", { state: { query: transcript } });
        } else {
          // For food search, we might need to trigger the overlay or redirect to a dedicated search page
          // Based on Home.jsx, it opens an overlay. But we can redirect to the search page if available.
          navigate("/food/user/search", { state: { query: transcript } });
        }
      }
    };
    recognition.start();
  };

  const chromeBtnClass = isTaxi
    ? "w-10 h-10 rounded-full bg-white/95 text-neutral-700 shadow-[0_8px_28px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.04] backdrop-blur-md flex items-center justify-center hover:bg-white active:scale-95 transition-all border-0 outline-none"
    : cn(
        "w-9 h-9 rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all",
        isLightChrome
          ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          : isDarkTheme
            ? "bg-white/20 text-white"
            : "bg-black/5 text-gray-800",
      );

  if (tabsOnly) {
    return null;
  }

  return (
    <motion.div
      className={cn(
        "relative transition-colors duration-300 pb-0 border-none outline-none z-50",
        isTaxi
          ? "bg-transparent"
          : isLightChrome
            ? "bg-white dark:bg-[#111]"
            : "bg-transparent",
      )}
      style={!isLightChrome && !isTaxi ? { backgroundColor: theme.accent } : undefined}
    >
      {/* 1. Sticky Main Header Top Section */}
      <header
        className={cn(
          "sticky top-0 z-50 px-3 py-2.5 transition-colors duration-300 outline-none sm:px-4",
          isTaxi
            ? "border-0 bg-transparent pt-[max(0.5rem,env(safe-area-inset-top))]"
            : isLightChrome
              ? "bg-white/90 dark:bg-[#111]/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800/60"
              : "border-b-0 border-none",
        )}
        style={!isLightChrome && !isTaxi ? { backgroundColor: "transparent" } : undefined}
      >
        <div
          id={isTaxi ? "taxi-top-actions" : undefined}
          className={cn(
            "flex items-center justify-between gap-2",
            isTaxi &&
              "transition-[opacity,transform] duration-300 ease-out will-change-transform",
          )}
        >

          {/* Location Selector (Left) */}
          <button
            type="button"
            onClick={onLocationClick}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none cursor-pointer border-0",
              isTaxi
                ? "rounded-full bg-white/95 py-1.5 pl-1.5 pr-3 shadow-[0_8px_28px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.04] backdrop-blur-md"
                : "bg-transparent p-0",
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center shrink-0",
                isTaxi
                  ? "h-9 w-9 rounded-full bg-[#FFF4ED]"
                  : "w-8 h-8 rounded-xl",
              )}
              style={isTaxi ? undefined : { backgroundColor: `${iconColor}15` }}
            >
              <MapPin className="h-4 w-4 shrink-0" style={{ color: iconColor }} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col min-w-0 py-0.5">
              <div className="flex items-center gap-0.5">
                <span
                  className={cn(
                    "truncate font-semibold tracking-tight",
                    isTaxi ? "max-w-[140px] text-[13px] text-neutral-950" : cn("font-extrabold text-sm max-w-[150px]", textColorClass),
                  )}
                >
                  {locationTitle}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isTaxi ? "text-neutral-400" : cn("opacity-70", textColorClass),
                  )}
                  strokeWidth={2.5}
                />
              </div>
              <span
                className={cn(
                  "truncate mt-px",
                  isTaxi
                    ? "max-w-[160px] text-[10px] text-neutral-500"
                    : cn("text-[10px] max-w-[170px]", subtextColorClass),
                )}
              >
                {locationSubtitle}
              </span>
            </div>
          </button>

          {/* Action Icons (Right) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Switch Module Button */}
            <Link
              to="/modules"
              className={cn(
                chromeBtnClass,
                "w-auto px-2.5 gap-1.5 text-xs font-extrabold text-[#FF6A00] bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 border border-orange-200/50"
              )}
              title="All Modules / Switch Service"
              aria-label="Switch Module"
            >
              <LayoutGrid className="h-4 w-4 shrink-0 text-[#FF6A00]" strokeWidth={2.5} />
              <span className="hidden sm:inline font-extrabold">Modules</span>
            </Link>

            {/* Wallet Button — optionally shows the balance inline when walletBalance is passed */}
            <Link
              to={walletPath}
              className={cn(chromeBtnClass, walletBalance != null && "w-auto gap-1.5 px-2.5")}
              aria-label="Open wallet"
            >
              <Wallet className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} strokeWidth={2} />
              {walletBalance != null ? (
                <span className={cn("text-xs font-bold", textColorClass)}>{walletBalance}</span>
              ) : null}
            </Link>

            {/* Notification Popover Button */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(chromeBtnClass, "relative")}
                  aria-label="Open notifications"
                >
                  <Bell style={{ width: 18, height: 18 }} strokeWidth={2} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-[#FF6A00] rounded-full border border-white dark:border-gray-800" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 overflow-hidden border-none shadow-2xl rounded-2xl mt-2 z-[200]" align="end">
                <div className="bg-white">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      Notifications
                      {unreadCount > 0 && (
                        <Badge variant="secondary" className="bg-red-100 text-red-600 border-none text-[10px] h-4">
                          {unreadCount} New
                        </Badge>
                      )}
                    </h3>
                    <Link to="/food/user/notifications" className="text-xs font-bold text-red-600">
                      {mergedNotifications.length > 0 ? "View All" : ""}
                    </Link>
                  </div>
                  <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    {mergedNotifications.length > 0 ? (
                      mergedNotifications.slice(0, 5).map((item, index) => (
                        <div key={item.id || `notif-${index}`} className="p-4 flex items-start gap-3 border-b border-gray-50 last:border-0">
                          <div className="mt-1 p-2 rounded-full bg-red-100 text-red-600">
                            <Bell className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className="text-sm font-bold text-gray-900 truncate">{item.title}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400 whitespace-nowrap">{item.time}</span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    removeNotification(item.id, item.source);
                                  }}
                                  className="rounded-full p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors border-0 bg-transparent"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{item.message}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center flex flex-col items-center gap-2">
                        <BellOff className="h-10 w-10 text-gray-300" />
                        <p className="text-xs text-gray-400 font-medium">All caught up!</p>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

          </div>
        </div>
      </header>

      {/* 3. Sticky Search Bar Section */}
      {isFood && (
        <div className="px-4 pb-3 pt-1 bg-transparent sticky top-[68px] z-40">
          <div className="relative flex items-center w-full">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
              <Search className="h-4.5 w-4.5" style={{ color: theme.accent, width: 18, height: 18 }} strokeWidth={2.5} />
            </div>

            <input
              onClick={() => (handleSearchFocus ? handleSearchFocus() : navigate("/food/user/search"))}
              type="text"
              readOnly
              placeholder={placeholders?.[placeholderIndex] || "Search for food, restaurants..."}
              className="block w-full pl-10 pr-28 py-3 border border-gray-200 dark:border-gray-800 rounded-2xl text-sm bg-gray-50 dark:bg-[#1a1a1a] text-gray-900 dark:text-white placeholder:text-gray-400 font-normal cursor-pointer shadow-sm focus:outline-none"
            />

            <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1.5 z-20">
              <button
                type="button"
                onClick={handleVoiceSearch}
                style={{ color: theme.accent }}
                className={cn("p-1.5 rounded-xl hover:bg-[#FF6A00]/10 active:scale-95 transition-all border-0 bg-transparent", isListening && "animate-pulse")}
                aria-label="Voice search"
              >
                <Mic className="h-4 w-4" strokeWidth={2} />
              </button>

              <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />

              <div className="flex items-center gap-1 pr-1">
                <span className="text-[10px] font-extrabold text-[#2e7d32] uppercase tracking-wide">Veg</span>
                <div className="scale-[0.8] flex items-center h-5">
                  <Switch
                    checked={vegMode}
                    onCheckedChange={onVegModeChange}
                    className="data-[state=checked]:bg-[#2e7d32] data-[state=unchecked]:bg-gray-200 border-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Banner Carousel Card — API banners are full-bleed; keep a dark fallback under images */}
      {isFood && bannerComponent && (
        <div className="relative z-10 w-full px-4 pb-3 pt-1">
          <div className="rounded-2xl overflow-hidden shadow-md relative bg-neutral-900">
            {bannerComponent}
          </div>
        </div>
      )}
    </motion.div>
  );
}
