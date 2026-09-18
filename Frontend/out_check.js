import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Download, ChevronDown, Eye, Settings, ArrowUpDown, Loader2, X, MapPin, Phone, Mail, Clock, Star, Building2, User, FileText, CreditCard, Calendar, Image as ImageIcon, ExternalLink, ShieldX, AlertTriangle, Trash2, Plus } from "lucide-react";
import { adminAPI, restaurantAPI, uploadAPI } from "@food/api";
import { clearModuleAuth } from "@food/utils/auth";
import useInfiniteList from "@food/hooks/useInfiniteList";
import InfiniteScrollSentinel from "@/shared/components/ui/InfiniteScrollSentinel";
import RefreshButton from "@/shared/components/ui/RefreshButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu";
import { exportRestaurantsToPDF } from "@food/components/admin/restaurants/restaurantsExportUtils";
import ApprovalAuditCard from "@food/components/admin/ApprovalAuditCard";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { Loader } from "@googlemaps/js-api-loader";
import { useAuth } from "@core/context/AuthContext";
import { getCurrentUser } from "@food/utils/auth";
import { canPerformAdminPermissionAction, extractAdminPermissions, extractAdminRoleId, fetchAdminRolePermissions } from "@food/utils/adminPermissions";
import { toast } from "sonner";
import locationIcon from "@food/assets/Dashboard-icons/image1.png";
import restaurantIcon from "@food/assets/Dashboard-icons/image2.png";
import inactiveIcon from "@food/assets/Dashboard-icons/image3.png";
const debugLog = (...args) => {
};
const debugWarn = (...args) => {
};
const debugError = (...args) => {
};
const PLACEHOLDER_40 = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect fill='%23e2e8f0' width='40' height='40'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='12' font-family='sans-serif'%3E?%3C/text%3E%3C/svg%3E";
const PLACEHOLDER_128 = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect fill='%23e2e8f0' width='128' height='128'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='32' font-family='sans-serif'%3E?%3C/text%3E%3C/svg%3E";
const normalizeApprovalStatus = (restaurant) => {
  const raw = String(restaurant?.status || "").trim().toLowerCase();
  if (raw === "approved" || raw === "pending" || raw === "rejected") return raw;
  return "pending";
};
const approvalStatusLabel = (status) => {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
};
const approvalStatusBadgeClass = (status) => {
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
};
const normalizeTimeValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return "";
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const p = ampm[3].toUpperCase();
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 1 || h > 12 || m < 0 || m > 59) return "";
    if (p === "AM") h = h === 12 ? 0 : h;
    if (p === "PM") h = h === 12 ? 12 : h + 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  }
  return "";
};
const timeToMinutes = (value) => {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return null;
  const [h, m] = normalized.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};
const formatTime12Hour = (value) => {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return value || "N/A";
  const [h, m] = normalized.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const period = h >= 12 ? "PM" : "AM";
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
};
const normalizeImageUrl = (image) => {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (typeof image === "object") return image.url || image.secure_url || "";
  return "";
};
const getPrimaryRestaurantImage = (restaurant, fallback = "") => {
  const profileImg = normalizeImageUrl(restaurant?.profileImage) || normalizeImageUrl(restaurant?.logo) || normalizeImageUrl(restaurant?.restaurantImage);
  if (profileImg) return profileImg;
  const coverImages = Array.isArray(restaurant?.coverImages) ? restaurant.coverImages : [];
  const firstCoverImage = coverImages.map(normalizeImageUrl).find(Boolean);
  if (firstCoverImage) return firstCoverImage;
  const menuImages = Array.isArray(restaurant?.menuImages) ? restaurant.menuImages : [];
  const firstMenuImage = menuImages.map(normalizeImageUrl).find(Boolean);
  if (firstMenuImage) return firstMenuImage;
  return fallback;
};
function RestaurantsList() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const currentUser = useMemo(() => authUser || getCurrentUser("admin"), [authUser]);
  const [resolvedPermissions, setResolvedPermissions] = useState({});
  useEffect(() => {
    let isMounted = true;
    const resolvePermissions = async () => {
      if (!currentUser || currentUser.role === "ADMIN") {
        if (isMounted) setResolvedPermissions({});
        return;
      }
      const existingPermissions = extractAdminPermissions(currentUser);
      if (Object.keys(existingPermissions).length > 0) {
        if (isMounted) setResolvedPermissions(existingPermissions);
        return;
      }
      const roleId = extractAdminRoleId(currentUser);
      if (!roleId) {
        if (isMounted) setResolvedPermissions({});
        return;
      }
      try {
        const rolePermissions = await fetchAdminRolePermissions(roleId);
        if (isMounted) setResolvedPermissions(rolePermissions);
      } catch {
        if (isMounted) setResolvedPermissions({});
      }
    };
    resolvePermissions();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);
  const canCreate = useMemo(() => {
    return canPerformAdminPermissionAction(currentUser, resolvedPermissions, "food::restaurant_management::restaurants::list", "create");
  }, [currentUser, resolvedPermissions]);
  const canEdit = useMemo(() => {
    return canPerformAdminPermissionAction(currentUser, resolvedPermissions, "food::restaurant_management::restaurants::list", "edit");
  }, [currentUser, resolvedPermissions]);
  const canDelete = useMemo(() => {
    return canPerformAdminPermissionAction(currentUser, resolvedPermissions, "food::restaurant_management::restaurants::list", "delete");
  }, [currentUser, resolvedPermissions]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [restaurantDetails, setRestaurantDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [banConfirmDialog, setBanConfirmDialog] = useState(null);
  const [banning, setBanning] = useState(false);
  const [togglingNoMenuId, setTogglingNoMenuId] = useState(null);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    name: "",
    pureVegRestaurant: false,
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    email: "",
    estimatedDeliveryTime: "",
    openingTime: "",
    closingTime: "",
    isActive: true
  });
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState("");
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationEditError, setLocationEditError] = useState("");
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [locationForm, setLocationForm] = useState({
    zoneId: "",
    latitude: "",
    longitude: "",
    formattedAddress: "",
    addressLine1: "",
    addressLine2: "",
    area: "",
    city: "",
    state: "",
    landmark: "",
    pincode: ""
  });
  const locationSearchInputRef = useRef(null);
  const placesAutocompleteRef = useRef(null);
  const googleMapsLoaderRef = useRef(null);
  const locationMapRef = useRef(null);
  const locationMapInstanceRef = useRef(null);
  const locationZonePolygonRef = useRef(null);
  const locationMarkerRef = useRef(null);
  const locationZoneMarkersRef = useRef([]);
  const [locationMapLoading, setLocationMapLoading] = useState(false);
  const [locationMapError, setLocationMapError] = useState("");
  const [locationZoneHint, setLocationZoneHint] = useState("");
  const formatRestaurantId = (restaurant) => {
    if (restaurant?.restaurantId) return `#${restaurant.restaurantId}`;
    const id = restaurant?._id || restaurant?.id || (typeof restaurant === "string" ? restaurant : null);
    if (!id) return "REST000000";
    const idString = String(id);
    if (idString.startsWith("REST") && idString.length === 10) return `#${idString}`;
    const parts = idString.split(/[-.]/);
    let lastDigits = "";
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      const digits = lastPart.match(/\d+/g);
      if (digits && digits.length > 0) {
        const allDigits = digits.join("");
        lastDigits = allDigits.slice(-6).padStart(6, "0");
      } else {
        const allParts = parts.join("");
        const allDigits = allParts.match(/\d+/g);
        if (allDigits && allDigits.length > 0) {
          const combinedDigits = allDigits.join("");
          lastDigits = combinedDigits.slice(-6).padStart(6, "0");
        }
      }
    }
    if (!lastDigits) {
      const hash = idString.split("").reduce((acc, char) => {
        return (acc << 5) - acc + char.charCodeAt(0) | 0;
      }, 0);
      lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0");
    }
    return `#REST${lastDigits}`;
  };
  const zoneLabelFromRestaurant = (restaurant, zonesList) => {
    const zid = restaurant?.zoneId;
    const zoneName = (typeof zid === "object" ? zid?.name || zid?.zoneName : "") || "";
    if (zoneName) return zoneName;
    const zoneIdString = typeof zid === "string" ? zid : zid?._id || zid?.id || "";
    if (zoneIdString && Array.isArray(zonesList) && zonesList.length > 0) {
      const match = zonesList.find((z) => (z?._id || z?.id) === zoneIdString);
      const label = match?.name || match?.zoneName;
      if (label) return label;
    }
    return restaurant?.zone || restaurant?.location?.area || restaurant?.location?.city || restaurant?.area || restaurant?.city || "N/A";
  };
  const {
    items: restaurants,
    setItems: setRestaurants,
    total: totalRestaurantsOnServer,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    error: fetchError,
    search: searchQuery,
    setSearch: setSearchQuery,
    refresh: refreshRestaurants
  } = useInfiniteList(
    async (params, config) => {
      try {
        const response = await adminAPI.getApprovedRestaurants(params, config);
        const body = response?.data;
        const data = body?.data;
        const rawList = Array.isArray(data?.restaurants) ? data.restaurants : Array.isArray(data) ? data : Array.isArray(body?.restaurants) ? body.restaurants : [];
        const total = data?.total ?? body?.total ?? rawList.length;
        const mappedRestaurants = rawList.map((restaurant, index) => ({
          id: restaurant._id || restaurant.id || index + 1,
          _id: restaurant._id,
          name: restaurant.name || restaurant.restaurantName || "N/A",
          ownerName: restaurant.ownerName || "N/A",
          ownerPhone: restaurant.ownerPhone || restaurant.phone || "N/A",
          zone: zoneLabelFromRestaurant(restaurant, zones),
          approvalStatus: normalizeApprovalStatus(restaurant),
          isActive: restaurant.isVisibleToUsers !== false,
          isVisibleToUsers: restaurant.isVisibleToUsers !== false,
          showRestaurantToUsersWithoutItems: !!restaurant.showRestaurantToUsersWithoutItems,
          hasHadActiveItems: !!restaurant.hasHadActiveItems,
          rating: restaurant.ratings?.average || restaurant.rating || 0,
          address: restaurant.location?.formattedAddress || [restaurant.addressLine1, restaurant.area, restaurant.city, restaurant.state].filter(Boolean).join(", ") || restaurant.address || "N/A",
          isVeg: restaurant.pureVegRestaurant || restaurant.onboarding?.step1?.pureVegRestaurant || false,
          logo: getPrimaryRestaurantImage(restaurant, PLACEHOLDER_40),
          originalData: restaurant
        }));
        return { items: mappedRestaurants, total };
      } catch (err) {
        debugError("Error fetching restaurants:", err);
        const status = err?.response?.status;
        if (status === 401) {
          try {
            clearModuleAuth("admin");
          } catch (_) {
          }
          navigate("/admin/login", { replace: true, state: { from: "/admin/food/restaurants" } });
        }
        throw err;
      }
    },
    { pageSize: 20, cacheKey: "admin-restaurants" }
  );
  const error = fetchError ? fetchError?.response?.data?.message || fetchError?.response?.data?.error || fetchError?.message || "Failed to fetch restaurants" : null;
  const [searchParams] = useSearchParams();
  const restaurantIdFromUrl = searchParams.get("restaurantId");
  useEffect(() => {
    if (restaurantIdFromUrl && restaurants.length > 0) {
      const restaurant = restaurants.find((r) => r.id === restaurantIdFromUrl || r._id === restaurantIdFromUrl);
      if (restaurant) {
        handleViewDetails(restaurant);
      }
    }
  }, [restaurantIdFromUrl, restaurants]);
  const [filters, setFilters] = useState({
    all: "All",
    zone: ""
  });
  const filteredRestaurants = useMemo(() => {
    let result = [...restaurants];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (restaurant) => restaurant.name.toLowerCase().includes(query) || restaurant.ownerName.toLowerCase().includes(query) || restaurant.ownerPhone.includes(query)
      );
    }
    if (filters.all !== "All") {
      if (filters.all === "Active") {
        result = result.filter((restaurant) => restaurant.isActive === true);
      } else if (filters.all === "Inactive") {
        result = result.filter((restaurant) => restaurant.isActive !== true);
      }
    }
    if (filters.zone) {
      result = result.filter((restaurant) => restaurant.zone === filters.zone);
    }
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue, bValue;
        switch (sortConfig.key) {
          case "sl":
            aValue = restaurants.indexOf(a);
            bValue = restaurants.indexOf(b);
            break;
          case "name":
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case "owner":
            aValue = a.ownerName.toLowerCase();
            bValue = b.ownerName.toLowerCase();
            break;
          case "zone":
            aValue = a.zone.toLowerCase();
            bValue = b.zone.toLowerCase();
            break;
          case "rating":
            aValue = Number(a.rating) || 0;
            bValue = Number(b.rating) || 0;
            break;
          case "status":
            aValue = String(a.approvalStatus || "").toLowerCase();
            bValue = String(b.approvalStatus || "").toLowerCase();
            break;
          default:
            return 0;
        }
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [restaurants, searchQuery, filters, sortConfig]);
  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };
  const totalRestaurants = totalRestaurantsOnServer || restaurants.length;
  const activeRestaurants = restaurants.filter((r) => r.isActive === true).length;
  const inactiveRestaurants = restaurants.filter((r) => r.isActive !== true).length;
  const formatPhone = (phone) => {
    if (!phone) return "";
    return phone;
  };
  const renderStars = (rating) => {
    const fullStars = Math.floor(rating || 0);
    return /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-0.5" }, [...Array(5)].map((_, i) => /* @__PURE__ */ React.createElement(
      Star,
      {
        key: i,
        className: `w-3.5 h-3.5 ${i < fullStars ? "fill-yellow-400 text-yellow-400" : "text-slate-300"}`
      }
    )), /* @__PURE__ */ React.createElement("span", { className: "ml-1 text-slate-600" }, "(", rating || 0, ")"));
  };
  const getLocationFromRestaurant = (restaurant) => {
    return restaurant?.onboarding?.step1?.location || restaurant?.location || restaurant?.originalData?.location || {};
  };
  const formatLocationAddress = (location = {}, fallback = "N/A") => {
    if (!location || typeof location !== "object") return fallback;
    if (location.formattedAddress) return location.formattedAddress;
    if (location.address) return location.address;
    const parts = [
      location.addressLine1,
      location.addressLine2,
      location.area,
      location.city,
      location.state,
      location.pincode || location.zipCode || location.postalCode
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : fallback;
  };
  const normalizeLocationFormFromRestaurant = (restaurant) => {
    const loc = getLocationFromRestaurant(restaurant);
    const rawLat = loc.latitude ?? (Array.isArray(loc.coordinates) ? loc.coordinates[1] : "");
    const rawLng = loc.longitude ?? (Array.isArray(loc.coordinates) ? loc.coordinates[0] : "");
    const latNum = typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat));
    const lngNum = typeof rawLng === "number" ? rawLng : parseFloat(String(rawLng));
    const hasValidNumbers = Number.isFinite(latNum) && Number.isFinite(lngNum);
    const looksUnset = hasValidNumbers && Math.abs(latNum) < 1 && Math.abs(lngNum) < 1;
    const latitude = hasValidNumbers && !looksUnset ? latNum : "";
    const longitude = hasValidNumbers && !looksUnset ? lngNum : "";
    const resolvedZoneId = restaurant?.zoneId || restaurant?.location?.zoneId || loc?.zoneId || "";
    const zoneId = typeof resolvedZoneId === "object" ? resolvedZoneId?._id || resolvedZoneId?.id || "" : resolvedZoneId;
    return {
      zoneId: zoneId || "",
      latitude: latitude || "",
      longitude: longitude || "",
      formattedAddress: loc.formattedAddress || loc.address || "",
      addressLine1: loc.addressLine1 || "",
      addressLine2: loc.addressLine2 || "",
      area: loc.area || "",
      city: loc.city || "",
      state: loc.state || "",
      landmark: loc.landmark || "",
      pincode: loc.pincode || loc.zipCode || loc.postalCode || ""
    };
  };
  const getZoneDisplayName = (zone) => {
    if (!zone) return "Zone";
    return zone.name || zone.zoneName || zone.displayName || zone.serviceLocation || "Zone";
  };
  const getZoneCoordinatePath = (zone, google) => {
    if (!zone || !Array.isArray(zone.coordinates)) return [];
    return zone.coordinates.map((coord) => {
      const latValue = typeof coord === "object" ? coord.latitude ?? coord.lat : null;
      const lngValue = typeof coord === "object" ? coord.longitude ?? coord.lng : null;
      const lat = Number(latValue);
      const lng = Number(lngValue);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return new google.maps.LatLng(lat, lng);
    }).filter(Boolean);
  };
  const resolveMatchingZonesForPoint = (google, lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    if (!google?.maps?.geometry?.poly?.containsLocation) return [];
    const point = new google.maps.LatLng(lat, lng);
    return zones.filter((zone) => {
      const path = getZoneCoordinatePath(zone, google);
      if (path.length < 3) return false;
      const polygon = new google.maps.Polygon({ paths: path });
      return google.maps.geometry.poly.containsLocation(point, polygon);
    });
  };
  const syncZoneForCoordinates = (google, lat, lng) => {
    const matches = resolveMatchingZonesForPoint(google, lat, lng);
    if (matches.length === 0) {
      setLocationZoneHint("This pin is outside all configured Zone Setup boundaries.");
      return;
    }
    const selectedZoneId = String(locationForm.zoneId || "");
    const currentStillMatches = matches.some(
      (zone) => String(zone?._id || zone?.id || "") === selectedZoneId
    );
    if (!currentStillMatches) {
      const nextZone = matches[0];
      const nextZoneId = String(nextZone?._id || nextZone?.id || "");
      setLocationForm((prev) => ({
        ...prev,
        zoneId: nextZoneId
      }));
    }
    const matchedNames = matches.map((zone) => getZoneDisplayName(zone)).join(", ");
    setLocationZoneHint(`Pin matches zone${matches.length > 1 ? "s" : ""}: ${matchedNames}`);
  };
  const reverseGeocodeLocation = async (lat, lng) => {
    if (!window.google?.maps?.Geocoder) return;
    try {
      const geocoder = new window.google.maps.Geocoder();
      const response = await geocoder.geocode({ location: { lat, lng } });
      const first = response?.results?.[0];
      if (!first) return;
      const comps = Array.isArray(first.address_components) ? first.address_components : [];
      const get = (types) => comps.find((component) => types.some((type) => component.types?.includes(type)))?.long_name || "";
      setLocationForm((prev) => ({
        ...prev,
        formattedAddress: first.formatted_address || prev.formattedAddress,
        addressLine1: first.formatted_address || prev.addressLine1,
        area: get(["sublocality_level_1", "sublocality", "neighborhood"]) || get(["locality"]) || prev.area,
        city: get(["locality"]) || get(["administrative_area_level_2"]) || prev.city,
        state: get(["administrative_area_level_1"]) || prev.state,
        pincode: get(["postal_code"]) || prev.pincode,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6))
      }));
    } catch (error2) {
      debugWarn("Reverse geocoding dragged pin failed:", error2);
    }
  };
  const updatePinLocation = async (google, lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setLocationForm((prev) => ({
      ...prev,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6))
    }));
    syncZoneForCoordinates(google, lat, lng);
    await reverseGeocodeLocation(lat, lng);
  };
  const loadGoogleMapsScript = async () => {
    if (window.google?.maps?.places?.Autocomplete) return true;
    const apiKey = await getGoogleMapsApiKey();
    if (!apiKey) {
      setLocationEditError("Google Maps API key is missing in Admin Environment Variables.");
      return false;
    }
    window.gm_authFailure = () => {
      setLocationEditError(
        "Google Maps authentication failed. Check: Maps JavaScript API enabled, billing enabled, and HTTP referrer restrictions allow this domain."
      );
      setLocationMapError(
        "Google Maps authentication failed. Check billing, Maps JavaScript API access, and allowed referrers."
      );
    };
    try {
      if (!googleMapsLoaderRef.current) {
        googleMapsLoaderRef.current = new Loader({
          apiKey,
          version: "weekly",
          libraries: ["places", "geometry"]
        });
      }
      await googleMapsLoaderRef.current.load();
      return !!window.google?.maps?.places?.Autocomplete;
    } catch (error2) {
      debugError("Failed to load Google Maps:", error2);
      setLocationEditError("Unable to load Google Maps services.");
      return false;
    }
  };
  const drawLocationPreviewMap = (google, selectedZone2) => {
    if (!locationMapRef.current) return false;
    const latitude = Number(locationForm.latitude);
    const longitude = Number(locationForm.longitude);
    const hasPin = Number.isFinite(latitude) && Number.isFinite(longitude);
    const zonePath = getZoneCoordinatePath(selectedZone2, google);
    if (!locationMapInstanceRef.current) {
      locationMapInstanceRef.current = new google.maps.Map(locationMapRef.current, {
        center: hasPin ? { lat: latitude, lng: longitude } : { lat: 20.5937, lng: 78.9629 },
        zoom: hasPin ? 15 : zonePath.length >= 3 ? 12 : 5,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          position: google.maps.ControlPosition.TOP_RIGHT,
          mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE]
        },
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        scrollwheel: true,
        gestureHandling: "greedy",
        disableDoubleClickZoom: false
      });
    }
    const map = locationMapInstanceRef.current;
    if (locationZonePolygonRef.current) {
      locationZonePolygonRef.current.setMap(null);
      locationZonePolygonRef.current = null;
    }
    if (locationMarkerRef.current) {
      locationMarkerRef.current.setMap(null);
      locationMarkerRef.current = null;
    }
    locationZoneMarkersRef.current.forEach((marker) => marker?.setMap?.(null));
    locationZoneMarkersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    if (zonePath.length >= 3) {
      const polygon = new google.maps.Polygon({
        paths: zonePath,
        strokeColor: "#4f46e5",
        strokeOpacity: 0.95,
        strokeWeight: 3,
        fillColor: "#6366f1",
        fillOpacity: 0.18,
        editable: false,
        draggable: false,
        clickable: false
      });
      polygon.setMap(map);
      locationZonePolygonRef.current = polygon;
      zonePath.forEach((point, index) => {
        bounds.extend(point);
        const zoneMarker = new google.maps.Marker({
          position: point,
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: "#4338ca",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          },
          zIndex: 5,
          title: `${getZoneDisplayName(selectedZone2)} point ${index + 1}`
        });
        locationZoneMarkersRef.current.push(zoneMarker);
      });
    }
    if (hasPin) {
      const position = { lat: latitude, lng: longitude };
      bounds.extend(position);
      locationMarkerRef.current = new google.maps.Marker({
        position,
        map,
        title: locationForm.formattedAddress || "Restaurant location",
        draggable: true,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#f97316",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3
        },
        zIndex: 10
      });
      locationMarkerRef.current.addListener("dragend", async (event) => {
        const nextLat = event?.latLng?.lat?.();
        const nextLng = event?.latLng?.lng?.();
        await updatePinLocation(google, nextLat, nextLng);
      });
    }
    google.maps.event.clearListeners(map, "click");
    map.addListener("click", async (event) => {
      const nextLat = event?.latLng?.lat?.();
      const nextLng = event?.latLng?.lng?.();
      await updatePinLocation(google, nextLat, nextLng);
    });
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 48);
      const zoom = map.getZoom?.();
      if (typeof zoom === "number" && zoom > 16) {
        map.setZoom(16);
      }
    } else {
      map.setCenter({ lat: 20.5937, lng: 78.9629 });
      map.setZoom(5);
    }
    setTimeout(() => {
      if (window.google?.maps && map) {
        google.maps.event.trigger(map, "resize");
      }
    }, 80);
    return true;
  };
  const initPlacesAutocomplete = async () => {
    if (!locationSearchInputRef.current) return;
    if (placesAutocompleteRef.current) return;
    setLocationEditError("");
    const loaded = await loadGoogleMapsScript();
    if (!loaded || !window.google?.maps?.places?.Autocomplete) {
      setLocationEditError("Unable to load Google Places Autocomplete.");
      return;
    }
    placesAutocompleteRef.current = new window.google.maps.places.Autocomplete(
      locationSearchInputRef.current,
      {
        fields: ["formatted_address", "address_components", "geometry"],
        componentRestrictions: { country: "in" }
      }
    );
    const parsePlace = (place) => {
      const formattedAddress = place?.formatted_address || "";
      const comps = Array.isArray(place?.address_components) ? place.address_components : [];
      const get = (types) => comps.find((c) => types.some((t) => c.types?.includes(t)))?.long_name || "";
      const area = get(["sublocality_level_1", "sublocality", "neighborhood"]) || get(["locality"]);
      const city = get(["locality"]) || get(["administrative_area_level_2"]);
      const state = get(["administrative_area_level_1"]);
      const pincode = get(["postal_code"]);
      const lat = place?.geometry?.location?.lat?.();
      const lng = place?.geometry?.location?.lng?.();
      return {
        formattedAddress,
        area,
        city,
        state,
        pincode,
        latitude: Number.isFinite(lat) ? Number(lat.toFixed(6)) : "",
        longitude: Number.isFinite(lng) ? Number(lng.toFixed(6)) : ""
      };
    };
    placesAutocompleteRef.current.addListener("place_changed", () => {
      const place = placesAutocompleteRef.current.getPlace();
      const parsed = parsePlace(place);
      setLocationForm((prev) => ({
        ...prev,
        formattedAddress: parsed.formattedAddress || prev.formattedAddress,
        addressLine1: parsed.formattedAddress || prev.addressLine1,
        area: parsed.area || prev.area,
        city: parsed.city || prev.city,
        state: parsed.state || prev.state,
        pincode: parsed.pincode || prev.pincode,
        latitude: parsed.latitude !== "" ? parsed.latitude : prev.latitude,
        longitude: parsed.longitude !== "" ? parsed.longitude : prev.longitude
      }));
      if (parsed.latitude !== "" && parsed.longitude !== "" && window.google?.maps) {
        syncZoneForCoordinates(window.google, parsed.latitude, parsed.longitude);
      }
    });
  };
  const handleViewDetails = async (restaurant) => {
    setIsEditingDetails(false);
    setProfileImageFile(null);
    setProfileImagePreview("");
    setIsEditingLocation(false);
    setSelectedRestaurant(restaurant);
    setLoadingDetails(true);
    setRestaurantDetails(null);
    try {
      const restaurantId = restaurant._id || restaurant.id || restaurant.restaurantId;
      if (!restaurantId || !adminAPI.getRestaurantById) {
        setRestaurantDetails(restaurant.originalData || restaurant);
        return;
      }
      const response = await adminAPI.getRestaurantById(restaurantId);
      if (!response?.data?.success) {
        setRestaurantDetails(restaurant.originalData || restaurant);
        return;
      }
      const data = response?.data?.data;
      if (data && (data.restaurantName || data._id)) {
        setRestaurantDetails(data);
        return;
      }
      setRestaurantDetails(restaurant.originalData || restaurant);
    } catch (err) {
      debugError("Error fetching restaurant details:", err);
      setRestaurantDetails(restaurant.originalData || restaurant);
    } finally {
      setLoadingDetails(false);
    }
  };
  const handleEditLocation = async (restaurant) => {
    if (!canEdit) {
      toast.error("Permission denied");
      return;
    }
    await handleViewDetails(restaurant);
    setIsEditingLocation(true);
  };
  const handleSaveLocation = async () => {
    if (!canEdit) {
      toast.error("Permission denied");
      return;
    }
    if (!selectedRestaurant) return;
    const restaurantId = selectedRestaurant._id || selectedRestaurant.id;
    const latitude = Number(locationForm.latitude);
    const longitude = Number(locationForm.longitude);
    if (!locationForm.zoneId) {
      alert("Please select a zone");
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !locationForm.formattedAddress) {
      alert("Please select a location from dropdown");
      return;
    }
    if (window.google?.maps && zones.length > 0) {
      const matches = resolveMatchingZonesForPoint(window.google, latitude, longitude);
      if (matches.length === 0) {
        alert("The selected pin is outside all configured Zone Setup boundaries.");
        return;
      }
    }
    try {
      setSavingLocation(true);
      const locationPayload = {
        zoneId: locationForm.zoneId,
        latitude,
        longitude,
        coordinates: [longitude, latitude],
        formattedAddress: locationForm.formattedAddress || "",
        address: locationForm.formattedAddress || "",
        addressLine1: locationForm.addressLine1 || locationForm.formattedAddress || "",
        addressLine2: locationForm.addressLine2 || "",
        area: locationForm.area || "",
        city: locationForm.city || "",
        state: locationForm.state || "",
        landmark: locationForm.landmark || "",
        pincode: locationForm.pincode || "",
        zipCode: locationForm.pincode || "",
        postalCode: locationForm.pincode || ""
      };
      const response = await adminAPI.updateRestaurantLocation(restaurantId, locationPayload);
      const updatedRestaurant = response?.data?.data?.restaurant;
      if (updatedRestaurant?.location) {
        setRestaurantDetails((prev) => ({
          ...prev || {},
          ...updatedRestaurant,
          location: updatedRestaurant.location,
          onboarding: {
            ...prev?.onboarding || {},
            step1: {
              ...prev?.onboarding?.step1 || {},
              location: updatedRestaurant.location
            }
          }
        }));
        setRestaurants(
          (prev) => prev.map(
            (item) => item._id === restaurantId || item.id === restaurantId ? {
              ...item,
              zone: updatedRestaurant.location.area || updatedRestaurant.location.city || item.zone,
              originalData: {
                ...item.originalData || {},
                location: updatedRestaurant.location
              }
            } : item
          )
        );
      }
      setIsEditingLocation(false);
      alert("Restaurant location updated successfully");
    } catch (err) {
      debugError("Error saving restaurant location:", err);
      alert(err?.response?.data?.message || "Failed to update restaurant location");
    } finally {
      setSavingLocation(false);
    }
  };
  useEffect(() => {
    if (!isEditingLocation || !selectedRestaurant) return;
    const sourceRestaurant = restaurantDetails || selectedRestaurant?.originalData || selectedRestaurant;
    const initialForm = normalizeLocationFormFromRestaurant(sourceRestaurant);
    setLocationForm(initialForm);
    setLocationEditError("");
    setLocationZoneHint("");
    setZonesLoading(true);
    adminAPI.getZones({ limit: 1e3 }).then((res) => {
      const list = res?.data?.data?.zones || res?.data?.data?.data?.zones || res?.data?.data?.zones || res?.data?.data || [];
      setZones(Array.isArray(list) ? list : []);
    }).catch(() => setZones([])).finally(() => setZonesLoading(false));
    requestAnimationFrame(() => initPlacesAutocomplete());
    return () => {
      placesAutocompleteRef.current = null;
    };
  }, [isEditingLocation, selectedRestaurant, restaurantDetails?._id]);
  const selectedZone = useMemo(() => {
    const targetZoneId = String(locationForm.zoneId || "");
    if (!targetZoneId) return null;
    return zones.find((zone) => String(zone?._id || zone?.id || "") === targetZoneId) || null;
  }, [zones, locationForm.zoneId]);
  useEffect(() => {
    if (!isEditingLocation) return;
    let cancelled = false;
    const renderPreviewMap = async () => {
      setLocationMapError("");
      setLocationMapLoading(true);
      const loaded = await loadGoogleMapsScript();
      if (cancelled) return;
      if (!loaded || !window.google?.maps) {
        setLocationMapError("Map preview could not be loaded.");
        setLocationMapLoading(false);
        return;
      }
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (cancelled) return;
          const rendered = drawLocationPreviewMap(window.google, selectedZone);
          if (!rendered) {
            setTimeout(() => {
              if (cancelled) return;
              const retried = drawLocationPreviewMap(window.google, selectedZone);
              if (!retried) {
                setLocationMapError("Map preview could not be initialized.");
              }
              setLocationMapLoading(false);
            }, 180);
            return;
          }
          setLocationMapLoading(false);
        }, 90);
      });
    };
    renderPreviewMap().catch((error2) => {
      debugError("Location preview map failed:", error2);
      if (!cancelled) {
        setLocationMapError("Map preview could not be loaded.");
        setLocationMapLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isEditingLocation, selectedZone?._id, selectedZone?.id, locationForm.latitude, locationForm.longitude, locationForm.formattedAddress]);
  const getDetailsEditSource = () => {
    return restaurantDetails || selectedRestaurant?.originalData || selectedRestaurant || null;
  };
  const buildDetailsFormFromRestaurant = (restaurant) => {
    if (!restaurant) {
      return {
        name: "",
        pureVegRestaurant: false,
        ownerName: "",
        ownerEmail: "",
        ownerPhone: "",
        primaryContactNumber: "",
        email: "",
        estimatedDeliveryTime: "",
        openingTime: "",
        closingTime: "",
        isActive: true
      };
    }
    const openingTimeValue = restaurant.openingTime || restaurant.deliveryTimings?.openingTime || restaurant.onboarding?.step2?.deliveryTimings?.openingTime || "";
    const closingTimeValue = restaurant.closingTime || restaurant.deliveryTimings?.closingTime || restaurant.onboarding?.step2?.deliveryTimings?.closingTime || "";
    const estimatedDeliveryTimeValue = restaurant.estimatedDeliveryTime || restaurant.onboarding?.step4?.estimatedDeliveryTime || "";
    return {
      name: restaurant.restaurantName || restaurant.name || "",
      pureVegRestaurant: typeof restaurant.pureVegRestaurant === "boolean" ? restaurant.pureVegRestaurant : false,
      ownerName: restaurant.ownerName || "",
      ownerEmail: restaurant.ownerEmail || "",
      ownerPhone: restaurant.ownerPhone || restaurant.phone || "",
      primaryContactNumber: restaurant.primaryContactNumber || restaurant.ownerPhone || "",
      email: restaurant.email || restaurant.ownerEmail || "",
      estimatedDeliveryTime: estimatedDeliveryTimeValue,
      openingTime: openingTimeValue,
      closingTime: closingTimeValue,
      isActive: restaurant.isVisibleToUsers !== false
    };
  };
  const handleStartEditDetails = () => {
    if (!canEdit) {
      toast.error("Permission denied");
      return;
    }
    const source = getDetailsEditSource();
    setDetailsForm(buildDetailsFormFromRestaurant(source));
    setProfileImageFile(null);
    setProfileImagePreview(normalizeImageUrl(source?.profileImage) || getPrimaryRestaurantImage(source));
    setIsEditingLocation(true);
    setIsEditingDetails(true);
  };
  const handleCancelEditDetails = () => {
    setIsEditingDetails(false);
    setProfileImageFile(null);
    setProfileImagePreview("");
  };
  const handleSaveDetails = async () => {
    if (!canEdit) {
      toast.error("Permission denied");
      return;
    }
    if (!selectedRestaurant) return;
    const restaurantId = selectedRestaurant._id || selectedRestaurant.id;
    try {
      setSavingDetails(true);
      let profileImage = void 0;
      if (profileImageFile) {
        const uploadRes = await uploadAPI.uploadMedia(profileImageFile, {
          folder: "appzeto/restaurant/profile"
        });
        const media = uploadRes?.data?.data?.file || uploadRes?.data?.data || uploadRes?.data?.file;
        if (media?.url) {
          profileImage = { url: media.url, publicId: media.publicId || media.public_id };
        }
      }
      const normalizedOpeningTime = normalizeTimeValue(detailsForm.openingTime.trim());
      const normalizedClosingTime = normalizeTimeValue(detailsForm.closingTime.trim());
      const openingMinutes = timeToMinutes(normalizedOpeningTime);
      const closingMinutes = timeToMinutes(normalizedClosingTime);
      if (openingMinutes !== null && closingMinutes !== null) {
        if (openingMinutes === closingMinutes) {
          alert("Opening time and closing time cannot be same");
          return;
        }
        if (closingMinutes < openingMinutes) {
          alert("Closing time cannot be less than opening time");
          return;
        }
      }
      const payload = {
        name: detailsForm.name.trim(),
        pureVegRestaurant: detailsForm.pureVegRestaurant === true,
        ownerName: detailsForm.ownerName.trim(),
        ownerEmail: detailsForm.ownerEmail.trim(),
        ownerPhone: detailsForm.ownerPhone.trim(),
        primaryContactNumber: detailsForm.primaryContactNumber.trim(),
        email: detailsForm.email.trim(),
        estimatedDeliveryTime: detailsForm.estimatedDeliveryTime.trim(),
        openingTime: normalizedOpeningTime,
        closingTime: normalizedClosingTime,
        isVisibleToUsers: detailsForm.isActive
      };
      if (profileImage) {
        payload.profileImage = profileImage;
      }
      const response = await adminAPI.updateRestaurant(restaurantId, payload);
      const updatedRestaurant = response?.data?.data?.restaurant;
      if (updatedRestaurant) {
        setRestaurantDetails(updatedRestaurant);
        setRestaurants(
          (prev) => prev.map(
            (item) => item._id === restaurantId || item.id === restaurantId ? {
              ...item,
              name: updatedRestaurant.name || item.name,
              ownerName: updatedRestaurant.ownerName || item.ownerName,
              ownerPhone: updatedRestaurant.ownerPhone || updatedRestaurant.phone || item.ownerPhone,
              zone: updatedRestaurant.location?.area || updatedRestaurant.location?.city || item.zone,
              isActive: updatedRestaurant.isVisibleToUsers !== false,
              isVisibleToUsers: updatedRestaurant.isVisibleToUsers !== false,
              logo: getPrimaryRestaurantImage(updatedRestaurant, item.logo),
              originalData: {
                ...item.originalData || {},
                ...updatedRestaurant
              }
            } : item
          )
        );
      }
      setIsEditingDetails(false);
      setProfileImageFile(null);
      alert("Restaurant details updated successfully");
    } catch (err) {
      debugError("Error updating restaurant details:", err);
      alert(err?.response?.data?.message || "Failed to update restaurant details");
    } finally {
      setSavingDetails(false);
    }
  };
  const closeDetailsModal = () => {
    setIsEditingDetails(false);
    setProfileImageFile(null);
    setProfileImagePreview("");
    setIsEditingLocation(false);
    setLocationEditError("");
    setSelectedRestaurant(null);
    setRestaurantDetails(null);
  };
  const handleBanRestaurant = (restaurant) => {
    if (!canEdit) {
      toast.error("Permission denied");
      return;
    }
    const isBanned = !restaurant.isActive;
    setBanConfirmDialog({
      restaurant,
      action: isBanned ? "show" : "hide"
    });
  };
  const confirmBanRestaurant = async () => {
    if (!canEdit) {
      toast.error("Permission denied");
      return;
    }
    if (!banConfirmDialog) return;
    const { restaurant, action } = banConfirmDialog;
    const isHiding = action === "hide";
    const newStatus = !isHiding;
    try {
      setBanning(true);
      const restaurantId = restaurant._id || restaurant.id;
      try {
        await adminAPI.updateRestaurantStatus(restaurantId, newStatus);
        setRestaurants(
          (prevRestaurants) => prevRestaurants.map(
            (r) => r.id === restaurant.id || r._id === restaurant._id ? { ...r, isActive: newStatus, isVisibleToUsers: newStatus, originalData: { ...r.originalData || {}, isVisibleToUsers: newStatus } } : r
          )
        );
        setBanConfirmDialog(null);
        debugLog(`Restaurant ${isHiding ? "hidden from users" : "visible to users"} successfully`);
      } catch (apiErr) {
        debugError("API Error:", apiErr);
        setRestaurants(
          (prevRestaurants) => prevRestaurants.map(
            (r) => r.id === restaurant.id || r._id === restaurant._id ? { ...r, isActive: newStatus, isVisibleToUsers: newStatus, originalData: { ...r.originalData || {}, isVisibleToUsers: newStatus } } : r
          )
        );
        setBanConfirmDialog(null);
        alert("Restaurant visibility updated locally. Please check backend connection.");
      }
    } catch (err) {
      debugError("Error updating restaurant visibility:", err);
      alert(`Failed to ${action} restaurant visibility. Please try again.`);
    } finally {
      setBanning(false);
    }
  };
  const cancelBanRestaurant = () => {
    setBanConfirmDialog(null);
  };
  const handleToggleNoMenuOverride = async (restaurant) => {
    if (!canEdit) {
      toast.error("Permission denied");
      return;
    }
    const restaurantId = restaurant._id || restaurant.id;
    if (!restaurantId) {
      toast.error("Restaurant ID not found");
      return;
    }
    const nextValue = !restaurant.showRestaurantToUsersWithoutItems;
    try {
      setTogglingNoMenuId(String(restaurantId));
      const response = await adminAPI.updateRestaurant(restaurantId, {
        showRestaurantToUsersWithoutItems: nextValue
      });
      const updatedRestaurant = response?.data?.data?.restaurant || response?.data?.data || null;
      const resolvedValue = updatedRestaurant?.showRestaurantToUsersWithoutItems ?? nextValue;
      setRestaurants(
        (prev) => prev.map(
          (r) => r.id === restaurant.id || r._id === restaurant._id ? {
            ...r,
            showRestaurantToUsersWithoutItems: !!resolvedValue,
            originalData: {
              ...r.originalData || {},
              showRestaurantToUsersWithoutItems: !!resolvedValue
            }
          } : r
        )
      );
      if (restaurantDetails && (restaurantDetails._id === restaurantId || restaurantDetails.id === restaurantId)) {
        setRestaurantDetails((prev) => prev ? {
          ...prev,
          showRestaurantToUsersWithoutItems: !!resolvedValue
        } : prev);
      }
      toast.success(
        resolvedValue ? "Restaurant can now be shown to users without menu items" : "Restaurant will only show when it has active menu items"
      );
    } catch (err) {
      debugError("Error toggling show-without-menu setting:", err);
      toast.error(err?.response?.data?.message || "Failed to update restaurant visibility setting");
    } finally {
      setTogglingNoMenuId(null);
    }
  };
  const handleDeleteRestaurant = (restaurant) => {
    if (!canDelete) {
      toast.error("Permission denied");
      return;
    }
    setDeleteConfirmDialog({ restaurant });
  };
  const confirmDeleteRestaurant = async () => {
    if (!canDelete) {
      toast.error("Permission denied");
      return;
    }
    if (!deleteConfirmDialog) return;
    const { restaurant } = deleteConfirmDialog;
    try {
      setDeleting(true);
      const restaurantId = restaurant._id || restaurant.id;
      try {
        await adminAPI.deleteRestaurant(restaurantId);
        setRestaurants(
          (prevRestaurants) => prevRestaurants.filter(
            (r) => r.id !== restaurant.id && r._id !== restaurant._id
          )
        );
        setDeleteConfirmDialog(null);
        alert(`Restaurant "${restaurant.name}" deleted successfully!`);
      } catch (apiErr) {
        debugError("API Error:", apiErr);
        alert(apiErr.response?.data?.message || "Failed to delete restaurant. Please try again.");
      }
    } catch (err) {
      debugError("Error deleting restaurant:", err);
      alert("Failed to delete restaurant. Please try again.");
    } finally {
      setDeleting(false);
    }
  };
  const cancelDeleteRestaurant = () => {
    setDeleteConfirmDialog(null);
  };
  const handleExport = () => {
    const dataToExport = filteredRestaurants.length > 0 ? filteredRestaurants : restaurants;
    const filename = "restaurants_list";
    exportRestaurantsToPDF(dataToExport, filename);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "h-full overflow-y-auto bg-slate-50 p-4 lg:p-6" }, /* @__PURE__ */ React.createElement("div", { className: "max-w-7xl mx-auto" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("h1", { className: "text-2xl font-bold text-slate-900" }, "Restaurants List")))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-sm border border-slate-200 p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-600 mb-1" }, "Total restaurants"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-bold text-slate-900" }, totalRestaurants)), /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center" }, /* @__PURE__ */ React.createElement("img", { src: locationIcon, alt: "Location", className: "w-8 h-8" })))), /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-sm border border-slate-200 p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-600 mb-1" }, "Visible restaurants"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-bold text-slate-900" }, activeRestaurants)), /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center" }, /* @__PURE__ */ React.createElement("img", { src: restaurantIcon, alt: "Restaurant", className: "w-8 h-8" })))), /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-sm border border-slate-200 p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-600 mb-1" }, "Hidden restaurants"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-bold text-slate-900" }, inactiveRestaurants)), /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center" }, /* @__PURE__ */ React.createElement("img", { src: inactiveIcon, alt: "Inactive", className: "w-8 h-8" }))))), /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-sm border border-slate-200 p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6" }, /* @__PURE__ */ React.createElement("h2", { className: "text-xl font-bold text-slate-900" }, "Restaurants List"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, canCreate && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => navigate("/admin/food/restaurants/add"),
      className: "px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 transition-all"
    },
    /* @__PURE__ */ React.createElement(Plus, { className: "w-4 h-4" }),
    /* @__PURE__ */ React.createElement("span", null, "Add Restaurant")
  ), /* @__PURE__ */ React.createElement("div", { className: "relative flex-1 sm:flex-initial min-w-[250px]" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      placeholder: "Search by restaurant name or ID",
      value: searchQuery,
      onChange: (e) => setSearchQuery(e.target.value),
      className: "pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    }
  ), /* @__PURE__ */ React.createElement(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" })), /* @__PURE__ */ React.createElement(RefreshButton, { onClick: refreshRestaurants, loading }), /* @__PURE__ */ React.createElement(DropdownMenu, null, /* @__PURE__ */ React.createElement(DropdownMenuTrigger, { asChild: true }, /* @__PURE__ */ React.createElement("button", { className: "px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all" }, /* @__PURE__ */ React.createElement(Download, { className: "w-4 h-4" }), /* @__PURE__ */ React.createElement("span", null, "Export"), /* @__PURE__ */ React.createElement(ChevronDown, { className: "w-3 h-3" }))), /* @__PURE__ */ React.createElement(DropdownMenuContent, { align: "end", className: "w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95" }, /* @__PURE__ */ React.createElement(DropdownMenuLabel, null, "Export Format"), /* @__PURE__ */ React.createElement(DropdownMenuSeparator, null), /* @__PURE__ */ React.createElement(DropdownMenuItem, { onClick: handleExport, className: "cursor-pointer flex items-center gap-2" }, /* @__PURE__ */ React.createElement(FileText, { className: "w-4 h-4" }), "PDF"))))), !loading && !error && /* @__PURE__ */ React.createElement("div", { className: "space-y-3 md:hidden" }, filteredRestaurants.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center py-16" }, /* @__PURE__ */ React.createElement("p", { className: "text-base font-semibold text-slate-700 mb-1" }, "No Data Found"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500" }, "No restaurants match your search")) : filteredRestaurants.map((restaurant) => /* @__PURE__ */ React.createElement("div", { key: restaurant.id, className: "rounded-xl border border-slate-200 bg-white p-3 shadow-sm" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3" }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "h-11 w-11 shrink-0 overflow-hidden rounded-full border border-slate-100 bg-slate-100",
      onClick: () => handleViewDetails(restaurant)
    },
    /* @__PURE__ */ React.createElement(
      "img",
      {
        src: restaurant.logo,
        alt: restaurant.name,
        className: "h-full w-full object-cover",
        onError: (e) => {
          e.target.src = PLACEHOLDER_40;
        }
      }
    )
  ), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1", onClick: () => handleViewDetails(restaurant) }, /* @__PURE__ */ React.createElement("p", { className: "truncate text-sm font-semibold text-slate-900" }, restaurant.name), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, restaurant.ownerName, " \u2022 ", formatPhone(restaurant.ownerPhone)), /* @__PURE__ */ React.createElement("p", { className: "mt-0.5 text-xs text-slate-500" }, restaurant.zone)), /* @__PURE__ */ React.createElement("span", { className: `inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[10px] font-semibold ${approvalStatusBadgeClass(restaurant.approvalStatus)}` }, approvalStatusLabel(restaurant.approvalStatus))), /* @__PURE__ */ React.createElement("div", { className: "mt-3 flex items-center justify-between border-t border-slate-100 pt-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-500" }, "Visible to users: ", restaurant.isActive ? "Yes" : "No"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("button", { onClick: () => handleViewDetails(restaurant), className: "rounded-lg p-1.5 text-blue-600 hover:bg-blue-50", title: "View Details" }, /* @__PURE__ */ React.createElement(Eye, { className: "h-4 w-4" })), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => handleBanRestaurant(restaurant),
      disabled: !canEdit,
      className: `rounded-lg p-1.5 ${!canEdit ? "opacity-50 text-slate-400" : !restaurant.isActive ? "text-green-600 hover:bg-green-50" : "text-red-600 hover:bg-red-50"}`,
      title: !restaurant.isActive ? "Show to Users" : "Hide from Users"
    },
    /* @__PURE__ */ React.createElement(ShieldX, { className: "h-4 w-4" })
  ), canDelete && /* @__PURE__ */ React.createElement("button", { onClick: () => handleDeleteRestaurant(restaurant), className: "rounded-lg p-1.5 text-red-600 hover:bg-red-50", title: "Delete Restaurant" }, /* @__PURE__ */ React.createElement(Trash2, { className: "h-4 w-4" })))))), filteredRestaurants.length > 0 && /* @__PURE__ */ React.createElement(
    InfiniteScrollSentinel,
    {
      onIntersect: loadMore,
      hasMore,
      loading: loadingMore,
      total: totalRestaurants,
      loadedCount: restaurants.length
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "hidden overflow-x-auto md:block" }, loading ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center py-20" }, /* @__PURE__ */ React.createElement(Loader2, { className: "w-8 h-8 animate-spin text-blue-600" }), /* @__PURE__ */ React.createElement("span", { className: "ml-3 text-slate-600" }, "Loading restaurants...")) : error ? /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center py-20" }, /* @__PURE__ */ React.createElement("p", { className: "text-lg font-semibold text-red-600 mb-1" }, "Error Loading Data"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 mb-4" }, error), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => navigate("/admin/login", { replace: true, state: { from: "/admin/food/restaurants" } }),
      className: "px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
    },
    "Log in as admin"
  )) : /* @__PURE__ */ React.createElement("table", { className: "w-full" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-slate-50 border-b border-slate-200" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement(
    "th",
    {
      className: "px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors",
      onClick: () => handleSort("sl")
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("span", null, "SL"), /* @__PURE__ */ React.createElement(ArrowUpDown, { className: `w-3 h-3 ${sortConfig.key === "sl" ? "text-blue-600" : "text-slate-400"}` }))
  ), /* @__PURE__ */ React.createElement(
    "th",
    {
      className: "px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors",
      onClick: () => handleSort("name")
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("span", null, "Restaurant Info"), /* @__PURE__ */ React.createElement(ArrowUpDown, { className: `w-3 h-3 ${sortConfig.key === "name" ? "text-blue-600" : "text-slate-400"}` }))
  ), /* @__PURE__ */ React.createElement(
    "th",
    {
      className: "px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors",
      onClick: () => handleSort("owner")
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("span", null, "Owner Info"), /* @__PURE__ */ React.createElement(ArrowUpDown, { className: `w-3 h-3 ${sortConfig.key === "owner" ? "text-blue-600" : "text-slate-400"}` }))
  ), /* @__PURE__ */ React.createElement(
    "th",
    {
      className: "px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors",
      onClick: () => handleSort("zone")
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("span", null, "Zone"), /* @__PURE__ */ React.createElement(ArrowUpDown, { className: `w-3 h-3 ${sortConfig.key === "zone" ? "text-blue-600" : "text-slate-400"}` }))
  ), /* @__PURE__ */ React.createElement(
    "th",
    {
      className: "px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors",
      onClick: () => handleSort("address")
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("span", null, "Address"), /* @__PURE__ */ React.createElement(ArrowUpDown, { className: `w-3 h-3 ${sortConfig.key === "address" ? "text-blue-600" : "text-slate-400"}` }))
  ), /* @__PURE__ */ React.createElement(
    "th",
    {
      className: "px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors",
      onClick: () => handleSort("status")
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ React.createElement("span", null, "Status"), /* @__PURE__ */ React.createElement(ArrowUpDown, { className: `w-3 h-3 ${sortConfig.key === "status" ? "text-blue-600" : "text-slate-400"}` }))
  ), /* @__PURE__ */ React.createElement("th", { className: "px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider" }, "Action"))), /* @__PURE__ */ React.createElement("tbody", { className: "bg-white divide-y divide-slate-100" }, filteredRestaurants.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: 7, className: "px-6 py-20 text-center" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center" }, /* @__PURE__ */ React.createElement("p", { className: "text-lg font-semibold text-slate-700 mb-1" }, "No Data Found"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500" }, "No restaurants match your search")))) : filteredRestaurants.map((restaurant, index) => /* @__PURE__ */ React.createElement(
    "tr",
    {
      key: restaurant.id,
      className: "hover:bg-slate-50 transition-colors"
    },
    /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4 whitespace-nowrap" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium text-slate-700" }, index + 1)),
    /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer hover:opacity-80 transition-all border border-slate-100",
        onClick: () => handleViewDetails(restaurant)
      },
      /* @__PURE__ */ React.createElement(
        "img",
        {
          src: restaurant.logo,
          alt: restaurant.name,
          className: "w-full h-full object-cover",
          onError: (e) => {
            e.target.src = PLACEHOLDER_40;
          }
        }
      )
    ), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col" }, /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "text-sm font-medium text-slate-900 cursor-pointer hover:text-blue-600 transition-colors",
        onClick: () => handleViewDetails(restaurant)
      },
      restaurant.name
    ), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-500" }, "ID ", formatRestaurantId(restaurant.originalData || restaurant)), /* @__PURE__ */ React.createElement("span", { className: "mt-1" }, restaurant.isVeg ? /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200" }, /* @__PURE__ */ React.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-green-500 mr-1" }), "Pure Veg") : /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 border border-red-200" }, /* @__PURE__ */ React.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-red-500 mr-1" }), "Non Veg"))))),
    /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium text-slate-900" }, restaurant.ownerName), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-500" }, formatPhone(restaurant.ownerPhone)))),
    /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4 whitespace-nowrap" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm text-slate-700" }, restaurant.zone)),
    /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4 whitespace-normal max-w-xs" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-slate-600 line-clamp-2", title: restaurant.address }, restaurant.address)),
    /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4 whitespace-nowrap" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-1.5" }, /* @__PURE__ */ React.createElement("span", { className: `inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${approvalStatusBadgeClass(restaurant.approvalStatus)}` }, approvalStatusLabel(restaurant.approvalStatus)), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-500" }, "Visible to Users: ", restaurant.isActive ? "Yes" : "No"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 mt-0.5" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-slate-500" }, "Show w/o menu:"), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: (e) => {
          e.stopPropagation();
          handleToggleNoMenuOverride(restaurant);
        },
        disabled: !canEdit || togglingNoMenuId === String(restaurant._id || restaurant.id),
        className: `relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${!canEdit || togglingNoMenuId === String(restaurant._id || restaurant.id) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${restaurant.showRestaurantToUsersWithoutItems ? "bg-green-500" : "bg-slate-300"}`,
        title: "Allow this restaurant to be visible to users even without active menu items"
      },
      /* @__PURE__ */ React.createElement("span", { className: `inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${restaurant.showRestaurantToUsersWithoutItems ? "translate-x-3.5" : "translate-x-0.5"}` })
    )))),
    /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4 whitespace-nowrap text-center" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center gap-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handleViewDetails(restaurant),
        className: "p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors",
        title: "View Details"
      },
      /* @__PURE__ */ React.createElement(Eye, { className: "w-4 h-4" })
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handleBanRestaurant(restaurant),
        disabled: !canEdit,
        className: `p-1.5 rounded transition-colors ${!canEdit ? "opacity-50 cursor-not-allowed text-slate-400" : !restaurant.isActive ? "text-green-600 hover:bg-green-50" : "text-red-600 hover:bg-red-50"}`,
        title: !restaurant.isActive ? "Show to Users" : "Hide from Users"
      },
      /* @__PURE__ */ React.createElement(ShieldX, { className: "w-4 h-4" })
    ), canDelete && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => handleDeleteRestaurant(restaurant),
        className: "p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors",
        title: "Delete Restaurant"
      },
      /* @__PURE__ */ React.createElement(Trash2, { className: "w-4 h-4" })
    )))
  ))))), !loading && !error && filteredRestaurants.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "hidden md:block" }, /* @__PURE__ */ React.createElement(
    InfiniteScrollSentinel,
    {
      onIntersect: loadMore,
      hasMore,
      loading: loadingMore,
      total: totalRestaurants,
      loadedCount: restaurants.length
    }
  )))), selectedRestaurant && /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "fixed inset-0 bg-slate-900/10 backdrop-blur-md z-100 flex items-center justify-center p-4 lg:p-8 transition-all duration-300",
      onClick: closeDetailsModal
    },
    /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "bg-white rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] border border-slate-200/60 max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-400",
        onClick: (e) => e.stopPropagation()
      },
      /* @__PURE__ */ React.createElement("div", { className: "px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-2xl font-bold text-slate-900" }, "Restaurant Details"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500 mt-1" }, "Detailed overview and information")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, canEdit ? /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => navigate(`/admin/food/restaurants/edit/${selectedRestaurant?.id || selectedRestaurant?._id}`),
          className: "px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        },
        "Edit Details"
      ) : null, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: closeDetailsModal,
          className: "p-2.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all duration-200 bg-slate-50"
        },
        /* @__PURE__ */ React.createElement(X, { className: "w-5 h-5" })
      ))),
      /* @__PURE__ */ React.createElement("div", { className: "p-8 overflow-y-auto" }, loadingDetails && /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center py-24" }, /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-full border-4 border-slate-100" }), /* @__PURE__ */ React.createElement("div", { className: "absolute inset-0 w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" })), /* @__PURE__ */ React.createElement("span", { className: "mt-4 text-slate-500 font-medium tracking-wide" }, "Fetching restaurant data...")), !loadingDetails && isEditingDetails && /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "Profile Image"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-24 h-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200" }, profileImagePreview ? /* @__PURE__ */ React.createElement("img", { src: profileImagePreview, alt: "Profile preview", className: "w-full h-full object-cover" }) : /* @__PURE__ */ React.createElement("div", { className: "w-full h-full flex items-center justify-center text-slate-400" }, /* @__PURE__ */ React.createElement(ImageIcon, { className: "w-6 h-6" }))), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "file",
          accept: "image/*",
          onChange: (e) => {
            const file = e.target.files?.[0];
            setProfileImageFile(file || null);
            if (file) {
              const localUrl = URL.createObjectURL(file);
              setProfileImagePreview(localUrl);
            }
          },
          className: "block w-full text-sm text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
        }
      ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Restaurant Name"), /* @__PURE__ */ React.createElement("input", { type: "text", value: detailsForm.name, onChange: (e) => setDetailsForm((prev) => ({ ...prev, name: e.target.value })), className: "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Pure Veg"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: () => setDetailsForm((prev) => ({ ...prev, pureVegRestaurant: true })),
          className: `px-3 py-1.5 text-xs rounded-full border ${detailsForm.pureVegRestaurant === true ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-700 border-slate-300"}`
        },
        "Yes"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: () => setDetailsForm((prev) => ({ ...prev, pureVegRestaurant: false })),
          className: `px-3 py-1.5 text-xs rounded-full border ${detailsForm.pureVegRestaurant === false ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"}`
        },
        "No"
      ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Restaurant Email"), /* @__PURE__ */ React.createElement("input", { type: "email", value: detailsForm.email, onChange: (e) => setDetailsForm((prev) => ({ ...prev, email: e.target.value })), className: "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Owner Name"), /* @__PURE__ */ React.createElement("input", { type: "text", value: detailsForm.ownerName, onChange: (e) => setDetailsForm((prev) => ({ ...prev, ownerName: e.target.value })), className: "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Owner Email"), /* @__PURE__ */ React.createElement("input", { type: "email", value: detailsForm.ownerEmail, onChange: (e) => setDetailsForm((prev) => ({ ...prev, ownerEmail: e.target.value })), className: "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Owner Phone"), /* @__PURE__ */ React.createElement("input", { type: "text", value: detailsForm.ownerPhone, onChange: (e) => setDetailsForm((prev) => ({ ...prev, ownerPhone: e.target.value })), className: "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Primary Contact"), /* @__PURE__ */ React.createElement("input", { type: "text", value: detailsForm.primaryContactNumber, onChange: (e) => setDetailsForm((prev) => ({ ...prev, primaryContactNumber: e.target.value })), className: "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Opening Time"), /* @__PURE__ */ React.createElement("input", { type: "text", value: detailsForm.openingTime, onChange: (e) => setDetailsForm((prev) => ({ ...prev, openingTime: e.target.value })), className: "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Closing Time"), /* @__PURE__ */ React.createElement("input", { type: "text", value: detailsForm.closingTime, onChange: (e) => setDetailsForm((prev) => ({ ...prev, closingTime: e.target.value })), className: "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Estimated Delivery Time"), /* @__PURE__ */ React.createElement("input", { type: "text", value: detailsForm.estimatedDeliveryTime, onChange: (e) => setDetailsForm((prev) => ({ ...prev, estimatedDeliveryTime: e.target.value })), className: "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" })), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2 flex items-center gap-3" }, /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "restaurant-status-active",
          type: "checkbox",
          checked: detailsForm.isActive,
          onChange: (e) => setDetailsForm((prev) => ({ ...prev, isActive: e.target.checked })),
          className: "h-4 w-4 rounded border-slate-300 text-blue-600"
        }
      ), /* @__PURE__ */ React.createElement("label", { htmlFor: "restaurant-status-active", className: "text-sm text-slate-700" }, "Visible to Users")))), !loadingDetails && !isEditingDetails && (restaurantDetails || selectedRestaurant) && (() => {
        const r = restaurantDetails || selectedRestaurant?.originalData || selectedRestaurant;
        const detailsApprovalStatus = normalizeApprovalStatus(r);
        const profileImgUrl = normalizeImageUrl(r?.profileImage) || getPrimaryRestaurantImage(r);
        const coverImages = Array.isArray(r?.coverImages) ? r.coverImages.map(normalizeImageUrl).filter(Boolean) : [];
        const hasFlatAddress = r?.addressLine1 || r?.area || r?.city || r?.state || r?.pincode;
        const flatAddress = [r?.addressLine1, r?.addressLine2, r?.area, r?.city, r?.state, r?.pincode, r?.landmark].filter(Boolean).join(", ");
        const menuImages = Array.isArray(r?.menuImages) ? r.menuImages.map(normalizeImageUrl).filter(Boolean) : [];
        const cuisinesList = (Array.isArray(r?.cuisines) && r.cuisines.length ? r.cuisines : null) || (Array.isArray(r?.onboarding?.step2?.cuisines) && r.onboarding.step2.cuisines.length ? r.onboarding.step2.cuisines : null) || null;
        const openingTimeVal = r?.openingTime || r?.deliveryTimings?.openingTime || r?.onboarding?.step2?.deliveryTimings?.openingTime || "";
        const closingTimeVal = r?.closingTime || r?.deliveryTimings?.closingTime || r?.onboarding?.step2?.deliveryTimings?.closingTime || "";
        const openDaysVal = (Array.isArray(r?.openDays) && r.openDays.length ? r.openDays : null) || (Array.isArray(r?.onboarding?.step2?.openDays) && r.onboarding.step2.openDays.length ? r.onboarding.step2.openDays : null) || null;
        const offerVal = r?.offer || r?.onboarding?.step4?.offer || "";
        const estimatedDeliveryTimeVal = r?.estimatedDeliveryTime || r?.onboarding?.step4?.estimatedDeliveryTime || "";
        const featuredDishVal = r?.featuredDish || r?.onboarding?.step4?.featuredDish || "";
        const featuredPriceVal = r?.featuredPrice ?? r?.onboarding?.step4?.featuredPrice;
        const diningSettingsVal = r?.diningSettings || r?.onboarding?.step4?.diningSettings || null;
        const panDocumentUrl = typeof r?.panImage === "string" ? r.panImage : r?.panImage?.url || r?.onboarding?.step3?.pan?.image?.url || "";
        const gstDocumentUrl = typeof r?.gstImage === "string" ? r.gstImage : r?.gstImage?.url || r?.onboarding?.step3?.gst?.image?.url || "";
        const fssaiDocumentUrl = typeof r?.fssaiImage === "string" ? r.fssaiImage : r?.fssaiImage?.url || r?.onboarding?.step3?.fssai?.image?.url || "";
        const hasPanSection = Boolean(r?.panNumber || r?.nameOnPan || panDocumentUrl || r?.onboarding?.step3?.pan?.panNumber || r?.onboarding?.step3?.pan?.nameOnPan);
        const hasGstSection = Boolean(
          r?.gstNumber || r?.gstLegalName || r?.gstAddress || gstDocumentUrl || r?.onboarding?.step3?.gst?.gstNumber || r?.onboarding?.step3?.gst?.legalName || r?.onboarding?.step3?.gst?.address
        );
        const hasFssaiSection = Boolean(
          r?.fssaiNumber || r?.fssaiExpiry || fssaiDocumentUrl || r?.onboarding?.step3?.fssai?.registrationNumber || r?.onboarding?.step3?.fssai?.expiryDate
        );
        const hasBankSection = Boolean(
          r?.accountNumber || r?.ifscCode || r?.accountHolderName || r?.accountType || r?.onboarding?.step3?.bank?.accountNumber || r?.onboarding?.step3?.bank?.ifscCode || r?.onboarding?.step3?.bank?.accountHolderName || r?.onboarding?.step3?.bank?.accountType
        );
        const hasRegistrationDocuments = hasPanSection || hasGstSection || hasFssaiSection || hasBankSection;
        return /* @__PURE__ */ React.createElement("div", { className: "space-y-10" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col md:flex-row items-center md:items-start gap-8" }, /* @__PURE__ */ React.createElement("div", { className: "w-32 h-32 rounded-3xl overflow-hidden bg-slate-50 shrink-0 shadow-inner group" }, /* @__PURE__ */ React.createElement(
          "img",
          {
            src: profileImgUrl || PLACEHOLDER_128,
            alt: r?.restaurantName || r?.name || "Restaurant",
            className: "w-full h-full object-cover transition-transform duration-500 group-hover:scale-110",
            onError: (e) => {
              e.target.src = PLACEHOLDER_128;
            }
          }
        )), /* @__PURE__ */ React.createElement("div", { className: "flex-1 text-center md:text-left pt-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col md:flex-row md:items-center gap-3 mb-4" }, /* @__PURE__ */ React.createElement("h3", { className: "text-3xl font-extrabold text-slate-900 tracking-tight" }, r?.restaurantName || r?.name || "N/A"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center md:justify-start gap-2" }, /* @__PURE__ */ React.createElement("span", { className: `px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${r?.isActive !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}` }, r?.isActive !== false ? "Visible" : "Hidden"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center md:justify-start gap-6 flex-wrap" }, r?.ratings?.average != null && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 rounded-xl" }, /* @__PURE__ */ React.createElement(Star, { className: "w-4 h-4 fill-yellow-400 text-yellow-500" }), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold text-yellow-700" }, (r.ratings?.average ?? 0).toFixed(1)), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-yellow-600/70 ml-1 font-medium" }, "(", r.ratings?.count ?? 0, " reviews)")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100" }, /* @__PURE__ */ React.createElement(Building2, { className: "w-4 h-4" }), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold tracking-wider" }, formatRestaurantId(r)))))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10" }, /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 pb-2 border-b border-slate-100" }, /* @__PURE__ */ React.createElement(User, { className: "w-4 h-4 text-blue-600" }), /* @__PURE__ */ React.createElement("h4", { className: "text-sm font-bold text-slate-900 uppercase tracking-widest" }, "Owner Information")), /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-4 p-4 rounded-2xl bg-blue-50/30 border border-blue-100/30" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0" }, /* @__PURE__ */ React.createElement(User, { className: "w-5 h-5 text-blue-600" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-0.5" }, "Full Name"), /* @__PURE__ */ React.createElement("p", { className: "text-base font-bold text-slate-800" }, r?.ownerName || "N/A"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-4 p-4 rounded-2xl bg-emerald-50/30 border border-emerald-100/30" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0" }, /* @__PURE__ */ React.createElement(Phone, { className: "w-5 h-5 text-emerald-600" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-0.5" }, "Contact Number"), /* @__PURE__ */ React.createElement("p", { className: "text-base font-bold text-slate-800" }, r?.ownerPhone || r?.phone || "N/A"))), (r?.ownerEmail || r?.email) && /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-4 p-4 rounded-2xl bg-indigo-50/30 border border-indigo-100/30" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0" }, /* @__PURE__ */ React.createElement(Mail, { className: "w-5 h-5 text-indigo-600" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-indigo-600 font-bold uppercase tracking-wider mb-0.5" }, "Email Address"), /* @__PURE__ */ React.createElement("p", { className: "text-base font-bold text-slate-800" }, r.ownerEmail || r.email))))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-4" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900" }, "Location & Contact"), isEditingLocation ? /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold" }, /* @__PURE__ */ React.createElement(Settings, { className: "w-3.5 h-3.5" }), "Editable Below") : null), /* @__PURE__ */ React.createElement("div", { className: "space-y-3" }, !isEditingLocation && (r?.location || hasFlatAddress) && /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3" }, /* @__PURE__ */ React.createElement(MapPin, { className: "w-5 h-5 text-slate-400 mt-0.5" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Address"), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-900" }, r?.location ? formatLocationAddress(r.location, selectedRestaurant?.zone) : flatAddress))), isEditingLocation && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-indigo-700 font-medium bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2" }, "Location editor is shown at the bottom of this details modal."), (r?.primaryContactNumber || r?.phone) && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement(Phone, { className: "w-5 h-5 text-slate-400" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Primary Contact"), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-900" }, r.primaryContactNumber || r.phone))), r?.email && !r?.ownerEmail && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement(Mail, { className: "w-5 h-5 text-slate-400" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Restaurant Email"), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-900" }, r.email)))))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 gap-6" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Timings & Status"), /* @__PURE__ */ React.createElement("div", { className: "space-y-3" }, r?.dayTimings && Array.isArray(r.dayTimings) && r.dayTimings.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "Weekly Timings"), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, r.dayTimings.map((dt, idx) => /* @__PURE__ */ React.createElement("div", { key: idx, className: "flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm font-medium text-slate-700 w-16" }, dt.day), dt.isOpen ? /* @__PURE__ */ React.createElement("span", { className: "text-sm text-slate-900" }, formatTime12Hour(dt.openingTime), " - ", formatTime12Hour(dt.closingTime)) : /* @__PURE__ */ React.createElement("span", { className: "text-sm text-red-500 font-medium" }, "Closed"))))) : /* @__PURE__ */ React.createElement(React.Fragment, null, (openingTimeVal || closingTimeVal) && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 mb-3" }, /* @__PURE__ */ React.createElement(Clock, { className: "w-5 h-5 text-slate-400" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500" }, "Opening / Closing"), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-900" }, formatTime12Hour(openingTimeVal), " \u2013 ", formatTime12Hour(closingTimeVal)))), openDaysVal && /* @__PURE__ */ React.createElement("div", { className: "mb-3" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Open Days"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, openDaysVal.map((day, idx) => /* @__PURE__ */ React.createElement("span", { key: idx, className: "px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium capitalize" }, day))))), estimatedDeliveryTimeVal && /* @__PURE__ */ React.createElement("div", { className: "mb-3" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Estimated Delivery Time"), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-900" }, estimatedDeliveryTimeVal)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Status"), /* @__PURE__ */ React.createElement("span", { className: `inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${approvalStatusBadgeClass(detailsApprovalStatus)}` }, approvalStatusLabel(detailsApprovalStatus)), /* @__PURE__ */ React.createElement("p", { className: "mt-2 text-xs text-slate-500" }, "Visible to Users: ", r?.isActive !== false ? "Yes" : "No")), /* @__PURE__ */ React.createElement(
          ApprovalAuditCard,
          {
            className: "mt-3",
            approvedBy: r?.approvedBy || null,
            rejectedBy: r?.rejectedBy || null,
            rejectionReason: r?.rejectionReason || ""
          }
        )))), (profileImgUrl || coverImages.length > 0 || menuImages.length > 0) && /* @__PURE__ */ React.createElement("div", { className: "pt-6 border-t border-slate-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Media"), /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, profileImgUrl && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "Profile Image"), /* @__PURE__ */ React.createElement(
          "a",
          {
            href: profileImgUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
          },
          /* @__PURE__ */ React.createElement(ImageIcon, { className: "w-4 h-4" }),
          /* @__PURE__ */ React.createElement("span", null, "View Profile Image"),
          /* @__PURE__ */ React.createElement(ExternalLink, { className: "w-3 h-3" })
        )), coverImages.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "Restaurant Photos"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" }, coverImages.map((url, idx) => /* @__PURE__ */ React.createElement(
          "a",
          {
            key: `${url}-${idx}`,
            href: url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "relative aspect-4/5 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:border-slate-300",
            title: "Open restaurant photo"
          },
          /* @__PURE__ */ React.createElement(
            "img",
            {
              src: url,
              alt: `Restaurant ${idx + 1}`,
              className: "w-full h-full object-cover",
              loading: "lazy",
              onError: (e) => {
                e.target.style.display = "none";
              }
            }
          )
        )))), menuImages.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "Menu Images"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" }, menuImages.map((url, idx) => /* @__PURE__ */ React.createElement(
          "a",
          {
            key: `${url}-${idx}`,
            href: url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "relative aspect-4/5 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:border-slate-300",
            title: "Open menu image"
          },
          /* @__PURE__ */ React.createElement(
            "img",
            {
              src: url,
              alt: `Menu ${idx + 1}`,
              className: "w-full h-full object-cover",
              loading: "lazy",
              onError: (e) => {
                e.target.style.display = "none";
              }
            }
          )
        )))))), (r?.createdAt || r?.updatedAt) && /* @__PURE__ */ React.createElement("div", { className: "pt-6 border-t border-slate-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Registration Information"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" }, r.createdAt && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement(Calendar, { className: "w-5 h-5 text-slate-400" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Registration Date & Time"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, new Date(r.createdAt).toLocaleString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })))), r.updatedAt && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement(Calendar, { className: "w-5 h-5 text-slate-400" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Last Updated"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, new Date(r.updatedAt).toLocaleString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })))), r.restaurantId && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Restaurant ID"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, formatRestaurantId(r))), r.slug && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Slug"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.slug)), r.phoneVerified !== void 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Phone Verified"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.phoneVerified ? "Yes" : "No")), r.signupMethod && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Signup Method"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900 capitalize" }, r.signupMethod)))), hasRegistrationDocuments && /* @__PURE__ */ React.createElement("div", { className: "pt-6 border-t border-slate-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Registration Documents"), /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, hasPanSection && /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 rounded-lg p-4" }, /* @__PURE__ */ React.createElement("h5", { className: "font-semibold text-slate-900 mb-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(FileText, { className: "w-4 h-4" }), "PAN Details"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" }, (r.panNumber || r?.onboarding?.step3?.pan?.panNumber) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "PAN Number"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.panNumber || r.onboarding?.step3?.pan?.panNumber)), (r.nameOnPan || r?.onboarding?.step3?.pan?.nameOnPan) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Name on PAN"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.nameOnPan || r.onboarding?.step3?.pan?.nameOnPan)), panDocumentUrl && /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "PAN Document"), /* @__PURE__ */ React.createElement("a", { href: panDocumentUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-2 text-blue-600 hover:text-blue-700" }, /* @__PURE__ */ React.createElement(ImageIcon, { className: "w-4 h-4" }), /* @__PURE__ */ React.createElement("span", null, "View PAN Document"), /* @__PURE__ */ React.createElement(ExternalLink, { className: "w-3 h-3" }))))), hasGstSection && /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 rounded-lg p-4" }, /* @__PURE__ */ React.createElement("h5", { className: "font-semibold text-slate-900 mb-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(FileText, { className: "w-4 h-4" }), "GST Details"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" }, (r.gstRegistered != null || r?.onboarding?.step3?.gst?.isRegistered != null) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "GST Registered"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.gstRegistered != null ? r.gstRegistered ? "Yes" : "No" : r?.onboarding?.step3?.gst?.isRegistered ? "Yes" : "No")), (r.gstNumber || r?.onboarding?.step3?.gst?.gstNumber) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "GST Number"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.gstNumber || r.onboarding?.step3?.gst?.gstNumber)), (r.gstLegalName || r?.onboarding?.step3?.gst?.legalName) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Legal Name"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.gstLegalName || r.onboarding?.step3?.gst?.legalName)), (r.gstAddress || r?.onboarding?.step3?.gst?.address) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "GST Address"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.gstAddress || r.onboarding?.step3?.gst?.address)), gstDocumentUrl && /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "GST Document"), /* @__PURE__ */ React.createElement("a", { href: gstDocumentUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-2 text-blue-600 hover:text-blue-700" }, /* @__PURE__ */ React.createElement(ImageIcon, { className: "w-4 h-4" }), /* @__PURE__ */ React.createElement("span", null, "View GST Document"), /* @__PURE__ */ React.createElement(ExternalLink, { className: "w-3 h-3" }))))), hasFssaiSection && /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 rounded-lg p-4" }, /* @__PURE__ */ React.createElement("h5", { className: "font-semibold text-slate-900 mb-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(FileText, { className: "w-4 h-4" }), "FSSAI Details"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" }, (r.fssaiNumber || r?.onboarding?.step3?.fssai?.registrationNumber) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "FSSAI Registration Number"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.fssaiNumber || r.onboarding?.step3?.fssai?.registrationNumber)), (r.fssaiExpiry || r?.onboarding?.step3?.fssai?.expiryDate) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "FSSAI Expiry Date"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, new Date(r.fssaiExpiry || r.onboarding?.step3?.fssai?.expiryDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }))), fssaiDocumentUrl && /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "FSSAI Document"), /* @__PURE__ */ React.createElement("a", { href: fssaiDocumentUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-2 text-blue-600 hover:text-blue-700" }, /* @__PURE__ */ React.createElement(ImageIcon, { className: "w-4 h-4" }), /* @__PURE__ */ React.createElement("span", null, "View FSSAI Document"), /* @__PURE__ */ React.createElement(ExternalLink, { className: "w-3 h-3" }))))), hasBankSection && /* @__PURE__ */ React.createElement("div", { className: "bg-slate-50 rounded-lg p-4" }, /* @__PURE__ */ React.createElement("h5", { className: "font-semibold text-slate-900 mb-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement(CreditCard, { className: "w-4 h-4" }), "Bank Details"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" }, (r.accountNumber || r?.onboarding?.step3?.bank?.accountNumber) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Account Number"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.accountNumber || r.onboarding?.step3?.bank?.accountNumber)), (r.ifscCode || r?.onboarding?.step3?.bank?.ifscCode) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "IFSC Code"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.ifscCode || r.onboarding?.step3?.bank?.ifscCode)), (r.accountHolderName || r?.onboarding?.step3?.bank?.accountHolderName) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Account Holder Name"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.accountHolderName || r.onboarding?.step3?.bank?.accountHolderName)), (r.accountType || r?.onboarding?.step3?.bank?.accountType) && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Account Type"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900 capitalize" }, r.accountType || r.onboarding?.step3?.bank?.accountType)))))), hasFlatAddress && !r?.onboarding?.step1?.location && /* @__PURE__ */ React.createElement("div", { className: "pt-6 border-t border-slate-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Address (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-medium text-slate-900" }, flatAddress)), r?.onboarding?.step1 && /* @__PURE__ */ React.createElement("div", { className: "pt-6 border-t border-slate-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Registration Step 1 Details"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" }, r.onboarding.step1.restaurantName && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Restaurant Name (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.step1.restaurantName)), r.onboarding.step1.ownerName && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Owner Name (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.step1.ownerName)), r.onboarding.step1.ownerEmail && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Owner Email (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.step1.ownerEmail)), r.onboarding.step1.ownerPhone && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Owner Phone (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.step1.ownerPhone)), r.onboarding.step1.primaryContactNumber && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Primary Contact (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.step1.primaryContactNumber)), r.onboarding.step1.location && /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Location (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.step1.location.addressLine1 || "", r.onboarding.step1.location.addressLine2 && `, ${r.onboarding.step1.location.addressLine2}`, r.onboarding.step1.location.area && `, ${r.onboarding.step1.location.area}`, r.onboarding.step1.location.city && `, ${r.onboarding.step1.location.city}`, r.onboarding.step1.location.landmark && `, ${r.onboarding.step1.location.landmark}`)))), r?.onboarding?.step2 && /* @__PURE__ */ React.createElement("div", { className: "pt-6 border-t border-slate-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Registration Step 2 Details"), /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, r.onboarding.step2.cuisines && Array.isArray(r.onboarding.step2.cuisines) && r.onboarding.step2.cuisines.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "Cuisines (at registration)"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, r.onboarding.step2.cuisines.map((cuisine, idx) => /* @__PURE__ */ React.createElement("span", { key: idx, className: "px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium" }, cuisine)))), r.onboarding.step2.deliveryTimings && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Opening Time (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, formatTime12Hour(r.onboarding.step2.deliveryTimings.openingTime))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Closing Time (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, formatTime12Hour(r.onboarding.step2.deliveryTimings.closingTime)))), r.onboarding.step2.openDays && Array.isArray(r.onboarding.step2.openDays) && r.onboarding.step2.openDays.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "Open Days (at registration)"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, r.onboarding.step2.openDays.map((day, idx) => /* @__PURE__ */ React.createElement("span", { key: idx, className: "px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium capitalize" }, day)))), r.onboarding.step2.profileImageUrl?.url && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-2" }, "Profile Image (at registration)"), /* @__PURE__ */ React.createElement(
          "a",
          {
            href: r.onboarding.step2.profileImageUrl.url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "inline-block"
          },
          /* @__PURE__ */ React.createElement(
            "img",
            {
              src: r.onboarding.step2.profileImageUrl.url,
              alt: "Profile",
              className: "w-32 h-32 rounded-lg object-cover border border-slate-200 hover:border-blue-500 transition-colors",
              onError: (e) => {
                e.target.src = PLACEHOLDER_128;
              }
            }
          )
        )))), r?.onboarding?.step4 && /* @__PURE__ */ React.createElement("div", { className: "pt-6 border-t border-slate-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Registration Step 4 Details"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" }, r.onboarding.step4.estimatedDeliveryTime && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Estimated Delivery Time (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.step4.estimatedDeliveryTime)), r.onboarding.step4.distance && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Distance (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.step4.distance)), r.onboarding.step4.featuredDish && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Featured Dish (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.step4.featuredDish)), r.onboarding.step4.offer && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Offer (at registration)"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-green-600" }, r.onboarding.step4.offer)))), (r?.slug || r?.restaurantId || r?.phoneVerified !== void 0 || r?.signupMethod) && /* @__PURE__ */ React.createElement("div", { className: "pt-6 border-t border-slate-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Additional Information"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" }, r?.slug && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Slug"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.slug)), r?.restaurantId && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Restaurant ID"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, formatRestaurantId(r))), r?.phoneVerified !== void 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Phone Verified"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.phoneVerified ? "Yes" : "No")), r?.signupMethod && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Signup Method"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900 capitalize" }, r.signupMethod)), r?.onboarding?.completedSteps !== void 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-slate-500 mb-1" }, "Onboarding Steps Completed"), /* @__PURE__ */ React.createElement("p", { className: "font-medium text-slate-900" }, r.onboarding.completedSteps, " / 4")))), isEditingLocation && /* @__PURE__ */ React.createElement("div", { className: "pt-6 border-t border-slate-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-semibold text-slate-900 mb-4" }, "Location Editor"), /* @__PURE__ */ React.createElement("div", { className: "space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-4" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-indigo-700 font-semibold" }, "Update restaurant location using dropdown (accurate) + select service zone."), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-600 mb-1 font-semibold" }, "Service Zone*"), /* @__PURE__ */ React.createElement(
          "select",
          {
            value: locationForm.zoneId || "",
            onChange: (e) => setLocationForm((prev) => ({ ...prev, zoneId: e.target.value })),
            className: "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          },
          /* @__PURE__ */ React.createElement("option", { value: "" }, zonesLoading ? "Loading zones..." : "Select a zone"),
          zones.map((z) => /* @__PURE__ */ React.createElement("option", { key: z._id || z.id, value: z._id || z.id }, z.name || z.zoneName || z.serviceLocation || "Zone"))
        )), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-600 mb-1 font-semibold" }, "Search location*"), /* @__PURE__ */ React.createElement(
          "input",
          {
            ref: locationSearchInputRef,
            type: "text",
            className: "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm",
            placeholder: "Start typing and choose from dropdown..."
          }
        ), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-500 mt-1" }, "Select from dropdown to auto-fill address and coordinates.")), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Formatted Address"), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            value: locationForm.formattedAddress,
            readOnly: true,
            className: "w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
          }
        )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Area"), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            value: locationForm.area,
            readOnly: true,
            className: "w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
          }
        )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "City"), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            value: locationForm.city,
            readOnly: true,
            className: "w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
          }
        )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "State"), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            value: locationForm.state,
            readOnly: true,
            className: "w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
          }
        )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Pincode"), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            value: locationForm.pincode,
            readOnly: true,
            className: "w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm"
          }
        )), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: "block text-xs text-slate-500 mb-1" }, "Landmark (optional)"), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "text",
            value: locationForm.landmark,
            onChange: (e) => setLocationForm((prev) => ({ ...prev, landmark: e.target.value })),
            className: "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          }
        )), /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("div", { className: "overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-[0_12px_32px_rgba(79,70,229,0.08)]" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-[11px] font-black uppercase tracking-[0.2em] text-indigo-500" }, "Zone Preview"), /* @__PURE__ */ React.createElement("h5", { className: "mt-1 text-sm font-semibold text-slate-900" }, selectedZone ? getZoneDisplayName(selectedZone) : "Select a zone to preview")), /* @__PURE__ */ React.createElement("div", { className: "text-right" }, /* @__PURE__ */ React.createElement("p", { className: "text-[11px] font-semibold text-slate-500" }, selectedZone?.coordinates?.length ? `${selectedZone.coordinates.length} boundary points` : "No boundary points"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-slate-400" }, Number.isFinite(Number(locationForm.latitude)) && Number.isFinite(Number(locationForm.longitude)) ? `${Number(locationForm.latitude).toFixed(5)}, ${Number(locationForm.longitude).toFixed(5)}` : "Pick a location to place the marker"))), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
          "div",
          {
            ref: locationMapRef,
            className: "h-[260px] w-full bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_100%)]"
          }
        ), locationMapLoading && /* @__PURE__ */ React.createElement("div", { className: "absolute inset-0 flex items-center justify-center bg-white/72 backdrop-blur-[2px]" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm" }, /* @__PURE__ */ React.createElement(Loader2, { className: "h-4 w-4 animate-spin text-indigo-600" }), "Loading map preview..."))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[12px] text-slate-600 md:grid-cols-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-slate-800" }, "Available zone:"), " ", selectedZone ? getZoneDisplayName(selectedZone) : "Not selected"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-slate-800" }, "Zone status:"), " ", selectedZone ? selectedZone.isActive === false ? "Inactive" : "Active" : "Unknown"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-slate-800" }, "Restaurant pin:"), " ", locationForm.formattedAddress ? "Placed" : "Waiting for location")), /* @__PURE__ */ React.createElement("div", { className: "border-t border-slate-100 bg-white px-4 py-3" }, /* @__PURE__ */ React.createElement("p", { className: "text-[12px] font-medium text-slate-600" }, "Drag the orange pin or tap anywhere on the map to change the saved restaurant location."), locationZoneHint && /* @__PURE__ */ React.createElement("p", { className: "mt-1 text-[12px] font-semibold text-indigo-600" }, locationZoneHint))))), (locationEditError || locationMapError) && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-red-600" }, locationEditError || locationMapError), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: handleSaveLocation,
            disabled: savingLocation,
            className: `inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white ${savingLocation ? "bg-indigo-300 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"}`
          },
          savingLocation ? "Saving..." : "Save Location"
        ))));
      })(), !loadingDetails && !restaurantDetails && !selectedRestaurant && /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center justify-center py-20" }, /* @__PURE__ */ React.createElement("p", { className: "text-lg font-semibold text-slate-700 mb-2" }, "No Details Available"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-500" }, "Unable to load restaurant details")))
    )
  ), banConfirmDialog && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4", onClick: cancelBanRestaurant }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-2xl max-w-md w-full", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-4 mb-4" }, /* @__PURE__ */ React.createElement("div", { className: `w-12 h-12 rounded-full flex items-center justify-center ${banConfirmDialog.action === "hide" ? "bg-red-100" : "bg-green-100"}` }, /* @__PURE__ */ React.createElement(AlertTriangle, { className: `w-6 h-6 ${banConfirmDialog.action === "hide" ? "text-red-600" : "text-green-600"}` })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-bold text-slate-900" }, banConfirmDialog.action === "hide" ? "Hide Restaurant from Users" : "Show Restaurant to Users"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-600" }, banConfirmDialog.restaurant.name))), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-700 mb-6" }, banConfirmDialog.action === "hide" ? "Are you sure you want to hide this restaurant from user-facing listings?" : "Are you sure you want to show this restaurant to users?"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: cancelBanRestaurant,
      disabled: banning,
      className: "flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    },
    "Cancel"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: confirmBanRestaurant,
      disabled: banning,
      className: `flex-1 px-4 py-2.5 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${banConfirmDialog.action === "hide" ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}`
    },
    banning ? /* @__PURE__ */ React.createElement("span", { className: "flex items-center justify-center gap-2" }, /* @__PURE__ */ React.createElement(Loader2, { className: "w-4 h-4 animate-spin" }), banConfirmDialog.action === "hide" ? "Hiding..." : "Showing...") : banConfirmDialog.action === "hide" ? "Hide Restaurant" : "Show Restaurant"
  ))))), deleteConfirmDialog && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4", onClick: cancelDeleteRestaurant }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-xl shadow-2xl max-w-md w-full", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { className: "p-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-4 mb-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-full bg-red-100 flex items-center justify-center" }, /* @__PURE__ */ React.createElement(Trash2, { className: "w-6 h-6 text-red-600" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-lg font-bold text-slate-900" }, "Delete Restaurant"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-600" }, deleteConfirmDialog.restaurant.name))), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-slate-700 mb-6" }, "Are you sure you want to delete this restaurant? This action cannot be undone and will permanently remove all restaurant data, including orders, menu items, and settings."), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: cancelDeleteRestaurant,
      disabled: deleting,
      className: "flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    },
    "Cancel"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: confirmDeleteRestaurant,
      disabled: deleting,
      className: "flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    },
    deleting ? /* @__PURE__ */ React.createElement("span", { className: "flex items-center justify-center gap-2" }, /* @__PURE__ */ React.createElement(Loader2, { className: "w-4 h-4 animate-spin" }), "Deleting...") : "Delete Restaurant"
  ))))));
}
export {
  RestaurantsList as default
};
