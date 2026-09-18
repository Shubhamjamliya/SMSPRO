import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Lottie from 'lottie-react';
import {
  ArrowLeft,
  Banknote,
  Check,
  ChevronRight,
  CreditCard,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Timer,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@core/context/AuthContext';
import { useProfile } from '@food/context/ProfileContext';
import { Button } from '@/components/ui/button';
import { useSettings } from '@core/context/SettingsContext';
import { useToast } from '@shared/components/ui/Toast';
import { useCart } from '../context/CartContext';
import { customerApi } from '../services/customerApi';
import emptyBoxAnimation from '../assets/lottie/Empty box.json';
import { getQuickCategoriesPath, getQuickCheckoutPath } from '../utils/routes';
import { resolveQuickImageUrl } from '../utils/image';
import { useLocation as useAppLocation } from '../context/LocationContext';
import LocationDrawer from '../components/shared/LocationDrawer';
import { getVariantDisplayLabel } from '../utils/productVariant';
import { sumUniqueProductPackingFee } from '../utils/packing';
import CouponSection from '../components/cart/CouponSection';
import CouponSheet from '../components/cart/CouponSheet';
import {
  CHECKOUT_STORAGE_KEY,
  estimateCouponDiscount,
  normalizeCouponCode,
  normalizeCouponForClient,
  readCheckoutState,
  writeCheckoutStatePatch,
} from '../utils/couponDisplay';
import {
  deliveryLabelForDisplay,
  findMatchingSavedAddress,
  resolveDeliveryLabel,
  tabFromSavedLabel,
} from '../utils/deliveryAddressLabel';

// ─── Pure helpers (outside component — no closure allocation on each render) ──

const DEFAULT_QUICK_BILLING_SETTINGS = {
  deliveryCommissionRules: [],
  platformFee: 0,
  returnsEnabled: true,
};

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=200&auto=format&fit=crop';

const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const calculateFrontendRiderEarning = (distanceKm, rules = []) => {
  const d = Number(distanceKm);
  if (!Number.isFinite(d) || d < 0 || !rules.length) return 0;

  const sorted = [...rules]
    .filter((r) => r && r.status !== false)
    .sort((a, b) => (Number(a.minDistance) || 0) - (Number(b.minDistance) || 0));
  if (!sorted.length) return 0;

  // Flat band fee: half-open [min, max); unlimited = [min, ∞).
  let matched = null;
  for (const rule of sorted) {
    const min = Number(rule.minDistance) || 0;
    const max = rule.maxDistance == null ? null : Number(rule.maxDistance);
    if (d < min) continue;
    if (max != null && d >= max) continue;
    matched = rule;
    break;
  }
  if (!matched) return 0;
  const isBase = (Number(matched.minDistance) || 0) === 0;
  const fee = isBase
    ? Number(matched.basePayout || 0)
    : Number(matched.commissionPerKm || 0);
  return Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0;
};

/** Fee-only fallback while cartPricing loads. GST must come from the cart API. */
const calculateQuickCartFeeFallback = ({
  subtotal = 0,
  discountAmount = 0,
  cartItems = [],
  feeSettings = DEFAULT_QUICK_BILLING_SETTINGS,
  distanceKm = 0,
  serverGst = 0,
}) => {
  const safeSubtotal = Number(subtotal || 0);
  const safeDiscount = Math.max(0, Number(discountAmount || 0));
  const gstAmount = Math.max(0, Number(serverGst || 0));

  let deliveryFee = 0;
  if (
    safeSubtotal > 0 &&
    Array.isArray(feeSettings?.deliveryCommissionRules) &&
    feeSettings.deliveryCommissionRules.length > 0
  ) {
    deliveryFee = calculateFrontendRiderEarning(distanceKm, feeSettings.deliveryCommissionRules);
  }

  const platformFee = Number(feeSettings?.platformFee || 0);
  const packagingFee = sumUniqueProductPackingFee(cartItems || []);

  return {
    deliveryFee,
    platformFee,
    packagingFee,
    gstAmount,
    grandTotal: Math.max(
      0,
      safeSubtotal + deliveryFee + platformFee + gstAmount + packagingFee - safeDiscount,
    ),
  };
};

// ─── Sub-components (memoized to prevent list re-renders) ─────────────────────

const CartItem = React.memo(({ item, onRemove, onUpdateQuantity, showToast }) => {
  const imageUrl = resolveQuickImageUrl(item.mainImage || item.image) || item.mainImage || item.image || FALLBACK_IMAGE;
  const itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
  const stock = Number(item.stock ?? Infinity);
  const variantLabel = item?.selectedVariant
    ? getVariantDisplayLabel(item.selectedVariant)
    : '';

  const handleRemove = useCallback(() => onRemove(item), [onRemove, item]);
  const handleDecr = useCallback(() => onUpdateQuantity(item.id || item._id, -1), [onUpdateQuantity, item.id, item._id]);
  const handleIncr = useCallback(() => {
    if (item.quantity >= stock) { showToast(`Only ${stock} items are available in stock.`, 'error'); return; }
    onUpdateQuantity(item.id || item._id, 1);
  }, [onUpdateQuantity, item.id, item._id, item.quantity, stock, showToast]);

  const handleImgError = useCallback((e) => { e.currentTarget.src = FALLBACK_IMAGE; }, []);

  return (
    <article className="rounded-[24px] bg-white p-4 shadow-sm">
      <div className="flex gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-50">
          <img
            src={imageUrl}
            alt={item.name}
            className="h-full w-full object-contain p-2"
            onError={handleImgError}
            loading="lazy"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="line-clamp-2 text-base font-semibold text-slate-900">{item.name}</h2>
              {variantLabel ? (
                <p className="mt-1 text-xs font-semibold text-teal-700">{variantLabel}</p>
              ) : (
                <p className="mt-1 text-xs font-medium text-slate-500">{item.weight || item.unit || '1 unit'}</p>
              )}
            </div>
            <button
              onClick={handleRemove}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-slate-900">₹{itemTotal}</p>
              {item.quantity > 1 && (
                <p className="text-xs text-slate-400">₹{item.price} each</p>
              )}
            </div>

            <div className="inline-flex items-center gap-3 rounded-full bg-slate-100 px-2 py-1">
              <button
                onClick={handleDecr}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm"
              >
                <Minus size={14} strokeWidth={3} />
              </button>
              <span className="min-w-[18px] text-center text-sm font-bold text-slate-900">
                {item.quantity}
              </span>
              <button
                onClick={handleIncr}
                disabled={item.quantity >= stock}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={14} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});
CartItem.displayName = 'CartItem';

// ─── Main CartPage ─────────────────────────────────────────────────────────────

const CartPage = () => {
  const navigate = useNavigate();
  const { cart, removeFromCart, updateQuantity, cartTotal, cartPricing, clearCart, loading, fetchCart } = useCart();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const { currentLocation, savedAddresses, updateLocation, refreshAddresses } = useAppLocation();
  const { user, isAuthenticated } = useAuth();
  const { userProfile } = useProfile();

  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(null);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [quickBillingSettings, setQuickBillingSettings] = useState(DEFAULT_QUICK_BILLING_SETTINGS);
  const [isUserCodAllowed, setIsUserCodAllowed] = useState(true);
  const [storeLocation, setStoreLocation] = useState(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState('cash');
  const [walletBalance, setWalletBalance] = useState(Number(userProfile?.walletBalance || 0));
  const [coupons, setCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState(() => {
    const stored = readCheckoutState()?.selectedCoupon || null;
    return stored ? normalizeCouponForClient(stored) : null;
  });
  const [isCouponSheetOpen, setIsCouponSheetOpen] = useState(false);
  const [manualCouponCode, setManualCouponCode] = useState('');
  const [applyingCouponCode, setApplyingCouponCode] = useState('');

  // ── Stable path constants ──────────────────────────────────────────────────
  const categoriesPath = useMemo(() => getQuickCategoriesPath(), []);
  const checkoutPath = useMemo(() => getQuickCheckoutPath(), []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const itemCount = useMemo(
    () => cart.reduce((n, item) => n + Number(item.quantity || 0), 0),
    [cart],
  );

  const displayItemTotal = useMemo(() => {
    const live = cart.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0,
    );
    if (cart.length > 0) return live;
    if (cartPricing && Number.isFinite(Number(cartPricing.subtotal))) {
      return Number(cartPricing.subtotal);
    }
    return Number(cartTotal || 0);
  }, [cart, cartPricing, cartTotal]);

  const livePackagingFee = useMemo(
    () => sumUniqueProductPackingFee(cart),
    [cart],
  );

  const couponCode = useMemo(
    () => normalizeCouponCode(selectedCoupon),
    [selectedCoupon],
  );

  // Prefer server-validated discount (cart API with couponCode); fall back to local estimate.
  const discountAmount = useMemo(() => {
    const serverDiscount = Number(cartPricing?.discount || 0);
    if (couponCode && serverDiscount > 0) return serverDiscount;
    if (!couponCode) return 0;
    // While coupon-aware cart fetch is in-flight, show estimate for discount line only.
    return estimateCouponDiscount(selectedCoupon, displayItemTotal);
  }, [cartPricing?.discount, couponCode, selectedCoupon, displayItemTotal]);

  const { deliveryFee, platformFee, packagingFee, gstAmount, grandTotal } = useMemo(
    () => {
      // Backend is the GST source of truth (per-line Header GST).
      const serverGst = Number(cartPricing?.gst || cartPricing?.tax || 0);

      if (cartPricing && cart.length > 0) {
        const packing =
          livePackagingFee > 0 || cart.length > 0
            ? livePackagingFee
            : Number(cartPricing.packagingFee || 0);
        const delivery = Number(cartPricing.deliveryFee || 0);
        const platform = Number(cartPricing.platformFee || 0);
        const serverTotal = Number(cartPricing.total || 0);
        return {
          deliveryFee: delivery,
          platformFee: platform,
          packagingFee: packing,
          gstAmount: serverGst,
          grandTotal:
            serverTotal > 0
              ? serverTotal
              : Math.max(
                  0,
                  displayItemTotal + packing + delivery + platform + serverGst - discountAmount,
                ),
        };
      }

      return calculateQuickCartFeeFallback({
        subtotal: displayItemTotal || cartTotal,
        discountAmount,
        cartItems: cart,
        feeSettings: quickBillingSettings,
        distanceKm,
        serverGst,
      });
    },
    [cartTotal, cart, cartPricing, quickBillingSettings, distanceKm, displayItemTotal, livePackagingFee, discountAmount],
  );

  const cartSellerId = useMemo(() => {
    const item = cart.find((entry) => entry?.sellerId || entry?.seller?._id || entry?.quickStoreId);
    return String(
      item?.sellerId?._id ||
        item?.sellerId ||
        item?.seller?._id ||
        item?.quickStoreId ||
        '',
    ).trim();
  }, [cart]);

  const paymentMethods = useMemo(
    () => [
      ...(settings?.onlineEnabled === false
        ? []
        : [{ id: 'online', label: 'Pay Online', icon: CreditCard, sublabel: 'UPI / Cards / NetBanking' }]),
      ...(isAuthenticated ? [{
        id: 'wallet',
        label: 'Wallet',
        icon: Wallet,
        sublabel: `Balance: ₹${Number(walletBalance || 0).toLocaleString('en-IN')}`,
        disabled: Number(walletBalance || 0) < Number(grandTotal || 0),
      }] : []),
      ...(settings?.codEnabled === false || !isUserCodAllowed
        ? []
        : [{ id: 'cash', label: 'Cash on Delivery', icon: Banknote, sublabel: 'Pay after delivery' }]),
    ],
    [settings?.onlineEnabled, settings?.codEnabled, isUserCodAllowed, isAuthenticated, walletBalance, grandTotal],
  );

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((m) => m.id === selectedPayment) || null,
    [paymentMethods, selectedPayment],
  );

  const persistSelectedCoupon = useCallback((coupon) => {
    const normalized = coupon ? normalizeCouponForClient(coupon) : null;
    setSelectedCoupon(normalized);
    writeCheckoutStatePatch({ selectedCoupon: normalized });
  }, []);

  // If server rejected the coupon on cart calc, clear local selection.
  useEffect(() => {
    if (!couponCode) return;
    const err = String(cartPricing?.couponError || "").trim();
    if (!err) return;
    persistSelectedCoupon(null);
    showToast(err, "error");
  }, [cartPricing?.couponError, couponCode, persistSelectedCoupon, showToast]);

  const handleApplyCoupon = useCallback(async (couponOrCode) => {
    const code =
      typeof couponOrCode === 'string'
        ? normalizeCouponCode({ code: couponOrCode })
        : normalizeCouponCode(couponOrCode);
    if (!code) {
      showToast('Enter a coupon code', 'error');
      return;
    }

    setApplyingCouponCode(code);
    try {
      const res = await customerApi.validateCoupon({
        code,
        cartTotal: displayItemTotal || cartTotal,
        items: cart,
        customerId: user?._id || user?.id,
      });
      if (res.data?.success) {
        const fromList =
          typeof couponOrCode === 'object' && couponOrCode
            ? couponOrCode
            : coupons.find((c) => normalizeCouponCode(c) === code) || {};
        const applied = normalizeCouponForClient({
          ...fromList,
          ...res.data.result,
          code: normalizeCouponCode(res.data.result || { code }),
          maxDiscount:
            res.data.result?.maxDiscount ??
            fromList?.maxDiscount ??
            fromList?.maxDiscountAmount ??
            0,
          discountType:
            res.data.result?.discountType || fromList?.discountType || 'fixed',
          discountValue:
            res.data.result?.discountValue ?? fromList?.discountValue ?? 0,
        });
        persistSelectedCoupon(applied);
        setIsCouponSheetOpen(false);
        setManualCouponCode('');
        showToast(`Coupon ${applied.code} applied`, 'success');
        // Force authoritative coupon-aware GST/total from cart API.
        if (fetchCart) {
          await fetchCart({ couponCode: applied.code });
        }
      } else {
        showToast(res.data?.message || 'Unable to apply coupon', 'error');
      }
    } catch (error) {
      showToast(error?.response?.data?.message || 'Unable to apply coupon', 'error');
    } finally {
      setApplyingCouponCode('');
    }
  }, [cart, cartTotal, coupons, displayItemTotal, persistSelectedCoupon, showToast, user?._id, user?.id, fetchCart]);

  const handleRemoveCoupon = useCallback(async () => {
    persistSelectedCoupon(null);
    showToast('Coupon removed', 'info');
    if (fetchCart) {
      await fetchCart({ couponCode: '' });
    }
  }, [persistSelectedCoupon, showToast, fetchCart]);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    const loadCoupons = async () => {
      if (!cart.length) {
        setCoupons([]);
        return;
      }
      setLoadingCoupons(true);
      try {
        const res = await customerApi.getActiveCoupons(
          cartSellerId ? { sellerId: cartSellerId } : {},
        );
        if (!mounted) return;
        const list = res.data?.results || res.data?.result || [];
        const normalized = (Array.isArray(list) ? list : [])
          .map((c) => normalizeCouponForClient(c))
          .filter(Boolean);
        setCoupons(normalized);
      } catch {
        if (mounted) setCoupons([]);
      } finally {
        if (mounted) setLoadingCoupons(false);
      }
    };
    loadCoupons();
    return () => {
      mounted = false;
    };
  }, [cart.length, cartSellerId]);

  // Soft-clear only when min-order is clearly no longer met (coupon still has min fields)
  useEffect(() => {
    if (!selectedCoupon) return;
    const minOrder = Number(
      selectedCoupon.minOrderValue ??
        selectedCoupon.minOrderAmount ??
        selectedCoupon.minOrder ??
        0,
    );
    if (minOrder > 0 && displayItemTotal < minOrder) {
      persistSelectedCoupon(null);
    }
  }, [displayItemTotal, selectedCoupon, persistSelectedCoupon]);

  // Fetch store location from first cart item's seller (skip when server already priced distance)
  useEffect(() => {
    if (cartPricing && Number(cartPricing.distanceKm) > 0) {
      setDistanceKm(Number(cartPricing.distanceKm));
      return undefined;
    }

    let mounted = true;
    const firstItem = cart[0];
    const sellerId =
      firstItem?.sellerId?._id ||
      firstItem?.sellerId ||
      firstItem?.seller?._id ||
      firstItem?.quickStoreId ||
      firstItem?.storeId;

    if (!sellerId || typeof sellerId !== 'string' || sellerId === 'quick-commerce') {
      setStoreLocation(null);
      setDistanceKm(0);
      return;
    }

    customerApi.getStoreDetails(sellerId).then((response) => {
      if (!mounted) return;
      const store = response?.data?.result || response?.data?.data || null;
      if (!store) return;

      const loc = store.location;
      let sCoords = null;
      if (Array.isArray(loc?.coordinates) && loc.coordinates.length === 2) {
        sCoords = { lat: Number(loc.coordinates[1]), lng: Number(loc.coordinates[0]) };
      } else if (Number.isFinite(Number(loc?.latitude)) && Number.isFinite(Number(loc?.longitude))) {
        sCoords = { lat: Number(loc.latitude), lng: Number(loc.longitude) };
      }
      setStoreLocation(sCoords);
    }).catch((err) => console.error('Failed to fetch store details:', err));

    return () => { mounted = false; };
  }, [cart, cartPricing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute distance whenever store or user location changes
  useEffect(() => {
    if (!storeLocation) { setDistanceKm(0); return; }

    const lat1 = storeLocation.lat;
    const lon1 = storeLocation.lng;
    const lat2 = Number(currentLocation?.latitude || currentLocation?.lat);
    const lon2 = Number(currentLocation?.longitude || currentLocation?.lng);

    if (Number.isFinite(lat1) && Number.isFinite(lon1) && Number.isFinite(lat2) && Number.isFinite(lon2)) {
      setDistanceKm(calculateHaversineDistance(lat1, lon1, lat2, lon2));
    } else {
      setDistanceKm(0);
    }
  }, [storeLocation, currentLocation]);

  // Refresh authoritative GST/total when coupon selection changes.
  useEffect(() => {
    if (!fetchCart || cart.length === 0) return;
    const params = {};
    if (couponCode) params.couponCode = couponCode;
    const lat = Number(currentLocation?.latitude || currentLocation?.lat);
    const lng = Number(currentLocation?.longitude || currentLocation?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      params.lat = lat;
      params.lng = lng;
    }
    fetchCart(params);
  }, [couponCode, cart.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load billing, profile, wallet — GST comes from cart API (no category tree needed).
  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const tasks = [
          customerApi.getBillingSettings(),
          customerApi.getProfile(),
        ];
        if (isAuthenticated) tasks.push(customerApi.getWalletBalance());

        const responses = await Promise.all(tasks);
        if (!mounted) return;

        const [billingResponse, profileResponse, walletResponse] = responses;

        const feeSettings =
          billingResponse?.data?.data?.feeSettings ||
          billingResponse?.data?.result ||
          null;
        if (feeSettings) {
          setQuickBillingSettings((prev) => ({
            ...prev,
            platformFee: Number(feeSettings.platformFee || 0),
            returnsEnabled: feeSettings.returnsEnabled !== false,
            deliveryCommissionRules: Array.isArray(feeSettings.deliveryCommissionRules)
              ? feeSettings.deliveryCommissionRules
              : prev.deliveryCommissionRules,
          }));
        }

        const profile =
          profileResponse?.data?.result ||
          profileResponse?.data?.data ||
          profileResponse?.data?.user ||
          null;
        if (profile) setIsUserCodAllowed(profile.isCodAllowed !== false);

        if (walletResponse) {
          const wallet = walletResponse?.data?.data?.wallet || walletResponse?.data?.result?.wallet;
          if (wallet?.balance != null) {
            setWalletBalance(Number(wallet.balance) || 0);
          } else if (userProfile?.walletBalance != null) {
            setWalletBalance(Number(userProfile.walletBalance) || 0);
          }
        } else if (!isAuthenticated) {
          setWalletBalance(0);
        }
      } catch (error) {
        console.error('Failed to bootstrap cart page:', error);
        if (mounted) setIsUserCodAllowed(true);
      }
    };

    void bootstrap();
    return () => { mounted = false; };
  }, [isAuthenticated, userProfile?.walletBalance]);

  // Refresh addresses on mount to ensure synchronization
  useEffect(() => {
    refreshAddresses?.();
  }, [refreshAddresses]);

  // Sync selectedPayment when paymentMethods list changes
  useEffect(() => {
    if (!paymentMethods.length) return;
    if (!paymentMethods.some((m) => m.id === selectedPayment)) {
      setSelectedPayment(paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPayment]);

  // Auto-detect which saved address is currently active (clear when live location)
  useEffect(() => {
    if (!currentLocation?.name) {
      setActiveTab(null);
      return;
    }
    const matching = findMatchingSavedAddress(savedAddresses, currentLocation.name);
    setActiveTab(matching ? tabFromSavedLabel(matching.label) : null);
  }, [savedAddresses, currentLocation?.name]);

  // Keep check-out state's address in sync with global currentLocation updates
  useEffect(() => {
    if (!currentLocation?.name) return;
    try {
      const stored = localStorage.getItem(CHECKOUT_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      const matching = findMatchingSavedAddress(savedAddresses, currentLocation.name);
      const resolvedType = resolveDeliveryLabel({
        addressText: currentLocation.name,
        savedAddresses,
        storedType: matching?.label || "Current",
        storedId: matching?.id || "",
      });

      const nextAddress = {
        ...(parsed.currentAddress || {}),
        address: currentLocation.name,
        city: currentLocation.city || parsed.currentAddress?.city || "Indore",
        landmark: matching ? (parsed.currentAddress?.landmark || "") : "",
        type: resolvedType === "Current" ? "Current" : resolvedType,
        location: currentLocation.latitude && currentLocation.longitude
          ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
          : parsed.currentAddress?.location,
      };

      if (matching) {
        nextAddress.id = matching.id;
        nextAddress.name = matching.name || nextAddress.name || "";
        nextAddress.phone = matching.phone || nextAddress.phone || "";
        nextAddress.type = matching.label === "Office" ? "Office" : matching.label;
      } else {
        delete nextAddress.id;
        nextAddress.type = "Current";
      }

      const prev = parsed.currentAddress || {};
      const changed =
        prev.address !== nextAddress.address ||
        prev.type !== nextAddress.type ||
        String(prev.id || "") !== String(nextAddress.id || "") ||
        Number(prev.location?.lat) !== Number(nextAddress.location?.lat) ||
        Number(prev.location?.lng) !== Number(nextAddress.location?.lng);

      if (changed) {
        localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({
          ...parsed,
          currentAddress: nextAddress,
        }));
      }
    } catch (err) {
      console.error("Failed to sync currentLocation to checkout state:", err);
    }
  }, [currentLocation, savedAddresses]);

  const handleSelectAddress = useCallback((addr) => {
    if (!addr) return;

    const newLoc = {
      name: addr.address,
      time: "12-15 mins",
      city: addr.city || currentLocation?.city || "Indore",
      state: currentLocation?.state || "Madhya Pradesh",
      pincode: currentLocation?.pincode || "452018",
      latitude: addr.location?.lat ?? currentLocation?.latitude,
      longitude: addr.location?.lng ?? currentLocation?.longitude,
    };

    updateLocation(newLoc, { persist: true });
    setActiveTab(tabFromSavedLabel(addr.label));

    try {
      const stored = localStorage.getItem(CHECKOUT_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : {};

      const nextAddress = {
        id: addr.id,
        type: addr.label === "Office" ? "Office" : addr.label,
        name: addr.name || parsed.currentAddress?.name || "",
        address: addr.address,
        city: addr.city || parsed.currentAddress?.city || "Indore",
        phone: addr.phone || parsed.currentAddress?.phone || "",
        landmark: "",
        location: addr.location ? { lat: addr.location.lat, lng: addr.location.lng } : undefined,
      };

      localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({
        ...parsed,
        currentAddress: nextAddress
      }));
    } catch (err) {
      console.error("Failed to update checkout state in localStorage:", err);
    }

    showToast(`Delivery location set to ${addr.label === "Office" ? "Work" : addr.label}`, 'success');
  }, [currentLocation, updateLocation, showToast]);

  // ── Stable handlers ────────────────────────────────────────────────────────
  const handleRemove = useCallback(
    (item) => {
      removeFromCart(item.id || item._id);
      showToast(`${item.name} removed from cart`, 'info');
    },
    [removeFromCart, showToast],
  );

  const handleClearAll = useCallback(async () => {
    setShowClearConfirm(false);
    try {
      await clearCart();
      showToast('Cart cleared', 'info');
    } catch (error) {
      showToast(
        error?.response?.data?.message || error?.message || 'Failed to clear cart',
        'error',
      );
    }
  }, [clearCart, showToast]);

  const handleBack = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) { navigate(-1); return; }
    navigate(categoriesPath);
  }, [navigate, categoriesPath]);

  const openClearConfirm = useCallback(() => setShowClearConfirm(true), []);
  const closeClearConfirm = useCallback(() => setShowClearConfirm(false), []);

  // ✅ FIX: LocationDrawer close hone pe addresses refresh karo
  const handleLocationDrawerClose = useCallback(() => {
    setIsLocationOpen(false);
    // Drawer band hote hi saved addresses reload karo taaki cart mein naya address dikhe
    refreshAddresses?.();
  }, [refreshAddresses]);

  // ── Loading / empty states ─────────────────────────────────────────────────
  if (loading && cart.length === 0) {
    return (
      <div className="min-h-screen bg-[#f7f7f7] px-4 py-6">
        <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-[28px] bg-white px-6 py-16 text-center shadow-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#FF6A00]" />
          <h2 className="mt-5 text-xl font-bold text-slate-900">Loading your cart</h2>
          <p className="mt-2 text-sm text-slate-500">Pulling in your saved items...</p>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-[#f7f7f7] px-4 py-6">
        <div className="mx-auto max-w-md">
          <div className="mb-5 flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Your Cart</h1>
              <p className="text-sm text-slate-500">Add items to get started</p>
            </div>
          </div>

          <div className="rounded-[28px] bg-white px-6 py-10 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-44 w-44 items-center justify-center">
              <Lottie animationData={emptyBoxAnimation} loop className="h-40 w-40" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Your cart is empty</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Pick a few essentials and they&apos;ll show up here.
            </p>
            <Link to={categoriesPath} className="mt-6 inline-flex w-full">
              <Button className="h-12 w-full rounded-2xl bg-[#FF6A00] text-white hover:bg-[#E85D04]">
                Start Shopping
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f5f5] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="w-full px-4 py-3">

        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-2xs"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-base font-black text-slate-900 leading-tight">Your Cart</h1>
              <p className="text-xs text-slate-500 font-medium">{itemCount} item{itemCount === 1 ? '' : 's'}</p>
            </div>
          </div>
          <button
            onClick={openClearConfirm}
            className="text-xs font-bold text-rose-500 transition-colors hover:text-rose-600"
          >
            Clear all
          </button>
        </div>

        {/* Clear cart confirmation modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closeClearConfirm}
            />
            <div className="relative z-10 w-full max-w-sm rounded-[24px] bg-white p-5 shadow-2xl">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 mx-auto">
                <Trash2 size={20} className="text-rose-500" />
              </div>
              <h3 className="text-center text-base font-bold text-slate-900">Clear your cart?</h3>
              <p className="mt-1 text-center text-xs text-slate-500">
                All {itemCount} item{itemCount === 1 ? '' : 's'} will be removed. This can&apos;t be undone.
              </p>
              <div className="mt-5 flex gap-2.5">
                <button
                  onClick={closeClearConfirm}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:border-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex-1 rounded-xl bg-rose-500 py-2.5 text-xs font-bold text-white transition-colors hover:bg-rose-600"
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delivery Banner */}
        <section className="mb-3.5 rounded-2xl bg-[#FFF3EB] p-3.5 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">
                Delivery in 10 minutes
              </p>
              <h2 className="mt-0.5 text-sm font-bold text-slate-900">
                Shipment from your nearby store
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Fast doorstep delivery with live seller-side processing.
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#FF6A00] shadow-sm">
              <Timer size={20} />
            </div>
          </div>
        </section>

        {/* Delivery Address Section */}
        <section className="mb-4 rounded-[24px] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between w-full text-left">
            <div className="flex items-start gap-4 flex-1">
              <div className="bg-[#FFF3EB] dark:bg-[#FF6A00]/10 p-2.5 rounded-xl">
                <MapPin className="h-5 w-5 text-[#FF6A00]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm md:text-base font-extrabold text-slate-900 leading-tight">
                    Delivery at Location
                  </h2>
                  <span className="rounded-full bg-[#FFF3EB] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#FF6A00]">
                    {activeTab
                      ? activeTab
                      : deliveryLabelForDisplay("Current")}
                  </span>
                </div>
                <p className="text-xs md:text-sm text-slate-500 line-clamp-2 mt-1 pr-2">
                  {currentLocation?.name || "Add delivery address"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsLocationOpen(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF3EB] text-[#FF6A00] hover:bg-[#FFE8DB] transition-all"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>

          {/* Quick Select Pills */}
          {savedAddresses.length > 0 && (
            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                {["Home", "Work", "Other"].map((label) => {
                  const targetLabel = label === "Work" ? "Office" : label;
                  const hasAddress = savedAddresses.some(
                    (addr) => addr.label === targetLabel || addr.label === label
                  );
                  const isSelected = activeTab === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={!hasAddress}
                      onClick={() => {
                        const matched = savedAddresses.find(
                          (addr) => addr.label === targetLabel || addr.label === label
                        );
                        if (matched) handleSelectAddress(matched);
                      }}
                      className={`text-xs px-4 py-1.5 rounded-full font-bold transition-all ${isSelected
                        ? "bg-[#FF6A00] text-white"
                        : hasAddress
                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          : "bg-gray-50 text-gray-400 border border-gray-100 cursor-not-allowed opacity-50"
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Selected Saved Address Details — only when a saved tab is active */}
              {activeTab && savedAddresses.find((addr) => addr.label === (activeTab === "Work" ? "Office" : activeTab)) && (
                <div
                  onClick={() => {
                    const matched = savedAddresses.find(
                      (addr) => addr.label === (activeTab === "Work" ? "Office" : activeTab)
                    );
                    if (matched) handleSelectAddress(matched);
                  }}
                  className={`mt-4 rounded-2xl border-2 p-4 cursor-pointer transition-all ${savedAddresses.find((addr) => addr.label === (activeTab === "Work" ? "Office" : activeTab))?.address === currentLocation?.name
                    ? "border-[#FF6A00] bg-[#FFF3EB]/10"
                    : "border-slate-100 hover:border-slate-200"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900 text-sm">
                      {activeTab}
                    </h3>
                    {savedAddresses.find((addr) => addr.label === (activeTab === "Work" ? "Office" : activeTab))?.address === currentLocation?.name && (
                      <span className="bg-[#FF6A00] text-white text-[9px] px-2 py-0.5 rounded font-black tracking-wide">
                        SELECTED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {savedAddresses.find((addr) => addr.label === (activeTab === "Work" ? "Office" : activeTab))?.address}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Cart Items — each item is memoized */}
        <div className="space-y-3">
          {cart.map((item) => (
            <CartItem
              key={item.id || item._id}
              item={item}
              onRemove={handleRemove}
              onUpdateQuantity={updateQuantity}
              showToast={showToast}
            />
          ))}
        </div>

        <div className="mt-4">
          <CouponSection
            appliedCoupon={selectedCoupon}
            discount={discountAmount}
            availableCoupons={coupons}
            loadingCoupons={loadingCoupons}
            subtotal={displayItemTotal}
            onRemoveCoupon={handleRemoveCoupon}
            onOpenAllCoupons={() => setIsCouponSheetOpen(true)}
            onApplyCoupon={handleApplyCoupon}
          />
        </div>

        {/* Bill Details */}
        <section className="mt-4 rounded-[24px] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Bill details</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Price breakdown</h2>
            </div>
            <span className="rounded-full bg-[#FFF3EB] px-3 py-1 text-xs font-bold text-[#FF6A00]">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="mt-5 space-y-3 text-sm text-slate-600">
            {[
              ['Items total', displayItemTotal],
              ['Delivery fee', deliveryFee],
              ...(Number(packagingFee) > 0 ? [['Packing fee', packagingFee]] : []),
              ['Platform fee', platformFee],
              ['GST', gstAmount],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span>{label}</span>
                <span className="font-semibold text-slate-900">₹{value}</span>
              </div>
            ))}
            {selectedCoupon && discountAmount > 0 ? (
              <div className="rounded-xl bg-[#FFF3EB] px-3 py-2 text-[#FF6A00]">
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    Coupon ({normalizeCouponCode(selectedCoupon)})
                  </span>
                  <span className="font-bold">-₹{discountAmount}</span>
                </div>
                {Number(selectedCoupon.maxDiscount) > 0 &&
                Math.round((displayItemTotal * Number(selectedCoupon.discountValue || 0)) / 100) >
                  Number(selectedCoupon.maxDiscount) ? (
                  <p className="mt-1 text-[10px] font-semibold text-[#9A3412]">
                    {selectedCoupon.discountValue}% exceeded max ₹{selectedCoupon.maxDiscount}, so max discount applied. GST on items after discount.
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] font-semibold text-[#9A3412]">
                    GST is calculated on items after coupon discount.
                  </p>
                )}
              </div>
            ) : null}
            <div className="border-t border-dashed border-slate-200 pt-3">
              <div className="flex items-center justify-between text-base font-bold text-slate-900">
                <span>To pay</span>
                <span>₹{grandTotal}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Payment Selection */}
        <section className="mt-4 rounded-[24px] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Payment</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Choose how you want to pay</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                We&apos;ll carry this choice into checkout so you don&apos;t have to pick it again.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {paymentMethods.length ? (
              paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = selectedPayment === method.id;
                const isDisabled = Boolean(method.disabled);
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => !isDisabled && setSelectedPayment(method.id)}
                    disabled={isDisabled}
                    className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all ${isDisabled
                      ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                      : isSelected
                      ? 'border-[#FF6A00] bg-[#FFF3EB]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isSelected ? 'bg-[#FFE8DB]' : 'bg-slate-100'}`}>
                      <Icon size={18} className={isSelected ? 'text-[#FF6A00]' : 'text-slate-600'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${isSelected ? 'text-[#FF6A00]' : 'text-slate-800'}`}>
                        {method.label}
                      </p>
                      <p className="text-xs text-slate-500">{method.sublabel}</p>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${isSelected ? 'border-[#FF6A00] bg-[#FF6A00]' : 'border-slate-300'}`}>
                      {isSelected && <Check size={12} className="text-white" />}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Payment options are currently unavailable. You can still review the order on checkout.
              </div>
            )}
          </div>
        </section>

        {/* Checkout Card */}
        <Link to={checkoutPath} state={{ selectedPayment }} className="block mt-4">
          <section className="rounded-[24px] bg-white p-5 shadow-sm transition-all hover:shadow-md active:scale-[0.99]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Checkout</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  Address, payment and seller confirmation
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Review delivery details on the next screen and place the order to push it into the matched seller dashboard.
                </p>
              </div>
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF6A00]/10 text-[#FF6A00]">
                <ChevronRight size={18} />
              </div>
            </div>
          </section>
        </Link>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[520] border-t border-slate-200 bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">To pay</p>
            <p className="truncate text-2xl font-bold text-slate-900">₹{grandTotal}</p>
            <p className="text-xs text-slate-500">
              {selectedPaymentMethod ? selectedPaymentMethod.label : 'Includes delivery charges'}
            </p>
          </div>

          <Link
            to={checkoutPath}
            state={{ selectedPayment }}
            className="block w-full flex-1 sm:min-w-[220px]"
          >
            <Button className="h-12 w-full rounded-2xl bg-[#FF6A00] px-4 text-sm text-white whitespace-normal sm:whitespace-nowrap hover:bg-[#E85D04]">
              <ShoppingBag size={18} className="mr-2" />
              Proceed to Checkout
            </Button>
          </Link>
        </div>
      </div>

      {/* ✅ FIX: onClose mein refreshAddresses call ho raha hai */}
      <LocationDrawer
        isOpen={isLocationOpen}
        onClose={handleLocationDrawerClose}
      />

      <CouponSheet
        open={isCouponSheetOpen}
        onClose={() => setIsCouponSheetOpen(false)}
        coupons={coupons}
        subtotal={displayItemTotal}
        appliedCode={normalizeCouponCode(selectedCoupon)}
        applyingCode={applyingCouponCode}
        manualCouponCode={manualCouponCode}
        onManualCodeChange={setManualCouponCode}
        onApplyManual={() => handleApplyCoupon(manualCouponCode)}
        onApplyCoupon={handleApplyCoupon}
      />
    </div>
  );
};

export default CartPage;