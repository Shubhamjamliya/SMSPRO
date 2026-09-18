import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { customerApi } from "../services/customerApi";
import { useAuth } from "@core/context/AuthContext";
import { useCart as useFoodCart } from "@food/context/CartContext";
import { useToast } from "@shared/components/ui/Toast";
import { getCartLineId, getVariantKey } from "../utils/productVariant";
import { resolveShopOpenState } from "../utils/shopOpenStatus";
import {
  assignFlatPackingLineTotals,
  sumUniqueProductPackingFee,
} from "../utils/packing";
import {
  normalizeCouponCode,
  readCheckoutState,
} from "../utils/couponDisplay";

const CartContext = createContext();
const QUICK_CART_STORAGE_KEY = "quick_commerce_cart";
const QTY_DEBOUNCE_MS = 350;

const readDeliveryCoords = () => {
  try {
    const raw =
      window.localStorage.getItem("app_user_location") ||
      window.localStorage.getItem("location_v2") ||
      window.localStorage.getItem("userLocation");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const lat = Number(parsed?.latitude ?? parsed?.lat ?? parsed?.location?.lat);
    const lng = Number(parsed?.longitude ?? parsed?.lng ?? parsed?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
};

const extractCartPricing = (result = {}) => ({
  subtotal: Number(result.subtotal || 0),
  packagingFee: Number(result.packagingFee || 0),
  deliveryFee: Number(result.deliveryFee || 0),
  platformFee: Number(result.platformFee || 0),
  handlingFee: Number(result.handlingFee || 0),
  tax: Number(result.tax || result.gst || 0),
  gst: Number(result.gst || result.tax || 0),
  discount: Number(result.discount || 0),
  couponCode: String(result.couponCode || "").trim(),
  couponError: String(result.couponError || "").trim(),
  total: Number(result.total || 0),
  distanceKm: Number(result.distanceKm || 0),
});

/** Optimistic bill while qty sync is in-flight — keep fees; GST refreshes from server. */
const buildOptimisticCartPricing = (items = [], previous = null) => {
  const normalizedItems = assignFlatPackingLineTotals(items);
  const subtotal = (normalizedItems || []).reduce(
    (sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 0),
    0,
  );
  const packagingFee = sumUniqueProductPackingFee(normalizedItems);

  const deliveryFee = Number(previous?.deliveryFee || 0);
  const platformFee = Number(previous?.platformFee || 0);
  // Do not invent GST on the client — retain last server GST until fetchCart returns.
  const gst = Number(previous?.gst || previous?.tax || 0);
  const discount = Number(previous?.discount || 0);
  const tax = gst;

  return {
    subtotal,
    packagingFee,
    deliveryFee,
    platformFee,
    handlingFee: Number(previous?.handlingFee || 0),
    tax,
    gst,
    discount,
    couponCode: String(previous?.couponCode || "").trim(),
    couponError: String(previous?.couponError || "").trim(),
    total: Math.max(0, subtotal + packagingFee + deliveryFee + platformFee + gst - discount),
    distanceKm: Number(previous?.distanceKm || 0),
  };
};

const readActiveCartCouponCode = () => {
  try {
    const stored = readCheckoutState()?.selectedCoupon || null;
    return normalizeCouponCode(stored);
  } catch {
    return "";
  }
};

const withActiveCouponParams = (params = {}) => {
  const next = { ...params };
  if (next.couponCode == null || next.couponCode === "") {
    const code = readActiveCartCouponCode();
    if (code) next.couponCode = code;
    else delete next.couponCode;
  } else if (!String(next.couponCode).trim()) {
    delete next.couponCode;
  }
  return next;
};

export const useCart = () => useContext(CartContext);

const isQuickCartItem = (item) => {
  if (!item || typeof item !== "object") return false;
  if (item.orderType === "quick" || item.type === "quick") return true;

  return Boolean(
    item.quickStoreId ||
      item.storeId ||
      item.store?.id ||
      item.store?._id ||
      item.sellerId ||
      item.seller?.id ||
      item.seller?._id,
  );
};

const readStoredQuickCart = () => {
  try {
    const quickCart = localStorage.getItem(QUICK_CART_STORAGE_KEY);
    if (quickCart) {
      const parsedQuickCart = JSON.parse(quickCart);
      return Array.isArray(parsedQuickCart)
        ? parsedQuickCart.filter(isQuickCartItem)
        : [];
    }

    const legacyCart = localStorage.getItem("cart");
    if (!legacyCart) return [];

    const parsedLegacyCart = JSON.parse(legacyCart);
    const quickItems = Array.isArray(parsedLegacyCart)
      ? parsedLegacyCart.filter(isQuickCartItem)
      : [];

    if (quickItems.length > 0) {
      localStorage.setItem(QUICK_CART_STORAGE_KEY, JSON.stringify(quickItems));
    }
    return quickItems;
  } catch (error) {
    console.error("Failed to load quick cart from localStorage", error);
    return [];
  }
};

const normalizeProductId = (value) => {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return "";
  return rawValue.split("::")[0];
};

const getCartLineKey = (itemOrProduct) =>
  String(
    itemOrProduct?.id ||
      itemOrProduct?._id ||
      itemOrProduct?.productId ||
      itemOrProduct?.itemId ||
      "",
  ).trim();

const getProductId = (product) =>
  normalizeProductId(
    product?.productId || product?.itemId || product?.id || product?._id,
  );

const QUICK_COMMERCE_PLACEHOLDER_SELLER = "quick-commerce";

const resolveQuickSellerId = (product = {}) => {
  if (!product || typeof product !== "object") return "";

  const candidates = [
    product.sellerId,
    product.seller?._id,
    product.seller?.id,
    product.quickStoreId,
    product.restaurantId,
    product.sourceId,
    product.storeId,
    product.store?._id,
    product.store?.id,
    product.storeId?._id,
    product.storeId?.id,
    product.restaurant?._id,
  ];

  for (const candidate of candidates) {
    const raw = candidate?._id ?? candidate?.id ?? candidate;
    const str = String(raw ?? "").trim();
    if (!str || str === QUICK_COMMERCE_PLACEHOLDER_SELLER) continue;
    if (/^[a-fA-F0-9]{24}$/.test(str)) return str;
  }
  return "";
};

const getQuickStoreName = (product) =>
  product?.restaurant ||
  product?.restaurantName ||
  product?.storeName ||
  product?.store?.name ||
  product?.storeId?.name ||
  product?.seller?.name ||
  product?.sellerId?.name ||
  "Quick Commerce";

const getQuickStoreId = (product) =>
  resolveQuickSellerId(product) || QUICK_COMMERCE_PLACEHOLDER_SELLER;

const normalizeQuickSellerId = (item) => resolveQuickSellerId(item);

const getCartSellerIds = (cartItems = []) => {
  if (!Array.isArray(cartItems) || cartItems.length === 0) return new Set();
  return new Set(
    cartItems.map((item) => getQuickStoreId(item)).filter(Boolean),
  );
};

const checkSellerConflict = (cartItems, product) => {
  if (!Array.isArray(cartItems) || cartItems.length === 0) return null;

  const productSellerId = getQuickStoreId(product);
  if (!productSellerId) return null;

  const cartSellerIds = getCartSellerIds(cartItems);
  if (cartSellerIds.size === 0) return null;
  if (cartSellerIds.has(productSellerId)) return null;

  const cartItem =
    cartItems.find((item) => getQuickStoreId(item) && cartSellerIds.has(getQuickStoreId(item))) ||
    cartItems[0];

  return {
    code: "SELLER_MISMATCH",
    cartSellerName: getQuickStoreName(cartItem),
    productSellerName: getQuickStoreName(product),
  };
};

const normalizeQuickProductForSharedCart = (product) => {
  const lineKey = getCartLineKey(product);
  const id = getProductId(product);
  const sellerId = resolveQuickSellerId(product);
  const quickStoreId = sellerId || getQuickStoreId(product);
  const quickStoreName = getQuickStoreName(product);
  const salePrice = Number(product?.salePrice || 0);
  const basePrice = Number(product?.price || 0);
  const originalPrice = Number(
    product?.originalPrice ?? product?.mrp ?? product?.price ?? salePrice ?? 0,
  );

  return {
    ...product,
    id: lineKey || id,
    _id: lineKey || product?._id || id,
    productId: id,
    orderType: "quick",
    type: "quick",
    image: product?.image || product?.mainImage,
    mainImage: product?.mainImage || product?.image,
    price: salePrice > 0 ? salePrice : basePrice,
    salePrice,
    mrp: originalPrice,
    originalPrice,
    quickStoreName,
    quickStoreId,
    sellerId,
    sourceId: quickStoreId,
    sourceName: quickStoreName,
    restaurant: quickStoreName,
    restaurantId: quickStoreId,
  };
};

const shrinkCartItem = (item) => {
  if (!item) return null;
  // Only keep essential fields to minimize localStorage footprint and avoid QuotaExceededError
  return {
    id: item.id || item._id,
    _id: item._id || item.id,
    productId: item.productId || item.id || item._id,
    name: item.name,
    price: Number(item.price || 0),
    salePrice: Number(item.salePrice || 0),
    mrp: Number(item.mrp || 0),
    originalPrice: Number(item.originalPrice || 0),
    quantity: Number(item.quantity || 0),
    stock: Number(item.stock ?? 0),
    packingAmount: Math.max(0, Number(item.packingAmount || 0)),
    image: item.image,
    mainImage: item.mainImage,
    weight: item.weight,
    unit: item.unit,
    categoryId: item.categoryId || null,
    subcategoryId: item.subcategoryId || null,
    headerId: item.headerId || null,
    sellerId: item.sellerId || resolveQuickSellerId(item),
    quickStoreId: item.quickStoreId || resolveQuickSellerId(item),
    quickStoreName: item.quickStoreName,
    selectedVariant: item.selectedVariant
      ? {
          _id: item.selectedVariant._id || item.selectedVariant.id || "",
          name: item.selectedVariant.name || "",
          sku: item.selectedVariant.sku || "",
          price: Number(item.selectedVariant.price || 0),
          salePrice: Number(item.selectedVariant.salePrice || 0),
          stock: Number(item.selectedVariant.stock ?? 0),
          images: Array.isArray(item.selectedVariant.images) ? item.selectedVariant.images.slice(0, 3) : [],
        }
      : null,
    variants: Array.isArray(item.variants)
      ? item.variants.slice(0, 2).map((v) => ({
          name: v?.name,
          sku: v?.sku,
        }))
      : [],
    orderType: "quick",
    type: "quick",
  };
};

const persistQuickCartSnapshot = (items) => {
  try {
    if (Array.isArray(items) && items.length > 0) {
      const shrunkItems = items.map(shrinkCartItem).filter(Boolean);
      localStorage.setItem(QUICK_CART_STORAGE_KEY, JSON.stringify(shrunkItems));
    } else {
      localStorage.removeItem(QUICK_CART_STORAGE_KEY);
    }
  } catch (error) {
    if (error.name === "QuotaExceededError") {
      console.warn("Storage quota exceeded. Attempting to clear space...");
      try {
        // Fallback: remove non-essential keys if needed, or just clear this specific key
        // For now, we've shrunk the items, if it still fails, it's a very large cart
        // or other data is hogging space.
        const legacyKeys = [
          "cart",
          "recent_searches",
          "search_history",
          "appzeto_recent_searches",
          "user_recent_searches_v1",
        ];
        legacyKeys.forEach(key => {
            if (key !== QUICK_CART_STORAGE_KEY) localStorage.removeItem(key);
        });
      } catch (e) {
        console.error("Critical storage failure", e);
      }
    }
    console.error("Failed to persist quick cart snapshot", error);
  }

  // Also sync with legacy 'cart' key to ensure Food module sees these changes
  // This prevents items from reappearing when navigating back to Food-bridged pages
  try {
    const legacyCart = localStorage.getItem("cart");
    if (legacyCart) {
      const parsed = JSON.parse(legacyCart);
      if (Array.isArray(parsed)) {
        const otherItems = parsed.filter((item) => !isQuickCartItem(item));
        const nextLegacyCart = [...otherItems, ...items];
        if (nextLegacyCart.length > 0) {
          localStorage.setItem("cart", JSON.stringify(nextLegacyCart));
        } else {
          localStorage.removeItem("cart");
        }
      }
    }
  } catch (e) {
    // ignore legacy sync errors
  }
};

const useStandaloneQuickCart = (isBridged = false) => {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [cart, setCart] = useState(() => readStoredQuickCart());
  const [cartPricing, setCartPricing] = useState(null);

  const [loading, setLoading] = useState(Boolean(isAuthenticated));
  const pendingRequestsRef = useRef(0);
  const qtyTimersRef = useRef(new Map());
  const qtyPendingRef = useRef(new Map());
  const fetchInFlightRef = useRef(null);

  const normalizeBackendCart = (items) => {
    if (!items) return [];
    const mapped = items.map((item) => {
      const productId = getProductId(item);
      const variantName = String(item.variantName || item.selectedVariant?.name || "").trim();
      const variantKey = String(
        item.variantKey || item.selectedVariant?._id || item.selectedVariant?.id || "",
      ).trim();
      const selectedVariant =
        item.selectedVariant ||
        (variantName
          ? {
              _id: variantKey,
              name: variantName,
              sku: item.variantSku || "",
              price: Number(item.price || 0),
              salePrice: Number(item.price || 0),
              stock: Number(item.stock ?? 0),
            }
          : null);
      const lineId = getCartLineId(productId, selectedVariant);
      const packingAmount = Math.max(0, Number(item.packingAmount || 0));

      return {
        ...item,
        quickStoreId: resolveQuickSellerId(item) || getQuickStoreId(item),
        quickStoreName: getQuickStoreName(item),
        sellerId: item.sellerId || resolveQuickSellerId(item),
        id: lineId,
        _id: lineId,
        productId,
        itemId: productId,
        quantity: Number(item.quantity || 1),
        stock: Number(item.stock ?? 0),
        categoryId: item.categoryId || null,
        subcategoryId: item.subcategoryId || null,
        headerId: item.headerId || null,
        image: item.mainImage || item.image || "",
        mainImage: item.mainImage || item.image || "",
        price: Number(item.price || 0),
        mrp: Number(item.mrp || item.price || 0),
        packingAmount,
        packingLineTotal: Math.max(0, Number(item.packingLineTotal ?? packingAmount)),
        variantName,
        variantKey,
        variantSku: item.variantSku || "",
        selectedVariant,
        orderType: "quick",
        type: "quick",
        sourceId: resolveQuickSellerId(item) || getQuickStoreId(item),
        sourceName: getQuickStoreName(item),
        restaurant: getQuickStoreName(item),
        restaurantId: resolveQuickSellerId(item) || getQuickStoreId(item),
      };
    });

    return assignFlatPackingLineTotals(mapped);
  };

  const applyCartResult = (result) => {
    if (!result || typeof result !== "object") return;
    if (Array.isArray(result.items)) {
      const normalizedItems = normalizeBackendCart(result.items);
      setCart(normalizedItems);
      persistQuickCartSnapshot(normalizedItems);
    }
    if (
      result.subtotal != null ||
      result.total != null ||
      result.packagingFee != null
    ) {
      setCartPricing(extractCartPricing(result));
    }
  };

  const syncCart = (backendItems) => {
    if (pendingRequestsRef.current === 0) {
      setCart(normalizeBackendCart(backendItems));
    }
  };

  const fetchCart = useCallback(async (extraParams = {}) => {
    if (!isAuthenticated) return null;

    const coords = readDeliveryCoords();
    const params = withActiveCouponParams({
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      ...extraParams,
    });
    const requestKey = JSON.stringify(params);

    if (fetchInFlightRef.current?.key === requestKey) {
      return fetchInFlightRef.current.promise;
    }

    setLoading(true);
    const promise = (async () => {
      try {
        const response = await customerApi.getCart(params);
        const result = response.data?.result || {};
        applyCartResult(result);
        return result;
      } catch (error) {
        console.error("Failed to fetch cart from backend", error);
        return null;
      } finally {
        if (fetchInFlightRef.current?.key === requestKey) {
          fetchInFlightRef.current = null;
        }
        setLoading(false);
      }
    })();

    fetchInFlightRef.current = { key: requestKey, promise };
    return promise;
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCart();
    } else {
      try {
        setLoading(false);
        setCart(readStoredQuickCart());
        setCartPricing(null);
      } catch (error) {
        setCart([]);
      }
    }
  }, [isAuthenticated, fetchCart]);

  useEffect(() => () => {
    qtyTimersRef.current.forEach((timer) => clearTimeout(timer));
    qtyTimersRef.current.clear();
  }, []);

  // Sync cart when localStorage changes (e.g., cleared from another tab or bridged mode)
  useEffect(() => {
    if (isBridged) return;
    const handleStorage = (e) => {
      if (e.key === QUICK_CART_STORAGE_KEY) {
        if (!e.newValue) {
          setCart([]);
        } else {
          try {
            const parsed = JSON.parse(e.newValue);
            if (Array.isArray(parsed)) setCart(parsed);
          } catch {}
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [isBridged]);

  useEffect(() => {
    if (!isBridged) {
      persistQuickCartSnapshot(cart);
    }
  }, [cart, isBridged]);

  const addToCart = async (product, { skipSellerCheck = false } = {}) => {
    const lineKey = getCartLineKey(product);
    const apiProductId = getProductId(product);
    if (!lineKey || !apiProductId) return { ok: false, code: "INVALID_PRODUCT" };

    const shopState = resolveShopOpenState(product);
    if (!shopState.isOpen) {
      showToast(shopState.message || "Shop is currently closed", "error");
      return { ok: false, code: "SHOP_CLOSED" };
    }

    if (!skipSellerCheck) {
      const conflict = checkSellerConflict(cart, product);
      if (conflict) {
        return { ok: false, ...conflict, product };
      }
    }

    const existingItem = cart.find((item) => getCartLineKey(item) === lineKey);
    const stock = Number(product.stock ?? (existingItem ? existingItem.stock : 0) ?? 0);
    const currentQty = existingItem ? existingItem.quantity : 0;
    const targetQty = currentQty + 1;

    if (targetQty > stock) {
      showToast(`Only ${stock} items are available in stock.`, "error");
      return { ok: false, code: "OUT_OF_STOCK" };
    }

    const resolvedSellerId = resolveQuickSellerId(product);

    setCart((prev) => {
      const existing = prev.find((item) => getCartLineKey(item) === lineKey);
      let next;
      if (existing) {
        next = prev.map((item) => {
          if (getCartLineKey(item) !== lineKey) return item;
          return {
            ...item,
            quantity: item.quantity + 1,
          };
        });
      } else {
        const packingAmount = Math.max(0, Number(product.packingAmount || 0));
        next = [
          ...prev,
          {
            ...product,
            id: lineKey,
            _id: lineKey,
            productId: apiProductId,
            itemId: apiProductId,
            orderType: "quick",
            type: "quick",
            sellerId: resolvedSellerId,
            quickStoreId: resolvedSellerId || getQuickStoreId(product),
            quickStoreName: getQuickStoreName(product),
            sourceId: resolvedSellerId || getQuickStoreId(product),
            sourceName: getQuickStoreName(product),
            restaurant: getQuickStoreName(product),
            restaurantId: getQuickStoreId(product),
            quantity: 1,
            stock,
            packingAmount,
            packingLineTotal: packingAmount,
            categoryId: product.categoryId || null,
            subcategoryId: product.subcategoryId || null,
            headerId: product.headerId || null,
            image: product.image || product.mainImage,
            mainImage: product.mainImage || product.image,
          },
        ];
      }
      next = assignFlatPackingLineTotals(next);
      setCartPricing((prevPricing) => buildOptimisticCartPricing(next, prevPricing));
      return next;
    });

    if (isAuthenticated) {
      pendingRequestsRef.current += 1;
      try {
        const response = await customerApi.addToCart({
          productId: apiProductId,
          quantity: 1,
          variantName: product.selectedVariant?.name || "",
          variantKey: getVariantKey(product.selectedVariant) || "",
          variantSku: product.selectedVariant?.sku || "",
          price: Number(product.price || product.salePrice || 0),
          ...( (() => {
            const coords = readDeliveryCoords();
            return coords ? { lat: coords.lat, lng: coords.lng } : {};
          })() ),
          ...withActiveCouponParams({}),
        });
        pendingRequestsRef.current -= 1;
        if (response.data?.result) {
          applyCartResult(response.data.result);
        } else {
          syncCart(response.data?.items);
        }
      } catch (error) {
        pendingRequestsRef.current -= 1;
        const errorCode = error?.response?.data?.code;
        if (error?.response?.status === 400) {
          if (errorCode === "SELLER_MISMATCH") {
            await fetchCart();
            return {
              ok: false,
              code: "SELLER_MISMATCH",
              product,
              cartSellerName: getQuickStoreName(cart[0]),
              productSellerName: getQuickStoreName(product),
            };
          }
          if (errorCode === "SHOP_CLOSED") {
            const errMsg = error?.response?.data?.message || "Shop is currently closed";
            showToast(errMsg, "error");
            await fetchCart();
            return { ok: false, code: "SHOP_CLOSED" };
          }
          const errMsg = error?.response?.data?.message || `Only ${stock} items are available in stock.`;
          showToast(errMsg, "error");
          await fetchCart();
        } else if (pendingRequestsRef.current === 0) {
          await fetchCart();
        }
      }
    }

    return { ok: true };
  };

  const removeFromCart = async (cartLineId) => {
    const resolvedLineKey = getCartLineKey({ id: cartLineId });
    const resolvedProductId = normalizeProductId(cartLineId);
    if (!resolvedLineKey) return;

    const currentItem = cart.find((item) => getCartLineKey(item) === resolvedLineKey);
    const nextCart = assignFlatPackingLineTotals(
      cart.filter((item) => getCartLineKey(item) !== resolvedLineKey),
    );
    setCart(nextCart);
    setCartPricing((prevPricing) => buildOptimisticCartPricing(nextCart, prevPricing));
    persistQuickCartSnapshot(nextCart);

    pendingRequestsRef.current += 1;
    try {
      const response = await customerApi.removeFromCart(resolvedProductId, {
        variantKey: currentItem?.variantKey || currentItem?.selectedVariant?._id || "",
        variantName: currentItem?.variantName || currentItem?.selectedVariant?.name || "",
        ...withActiveCouponParams({}),
      });
      pendingRequestsRef.current -= 1;
      if (response.data?.result) {
        applyCartResult(response.data.result);
      } else {
        syncCart(response.data?.items);
      }
    } catch (error) {
      pendingRequestsRef.current -= 1;
      if (pendingRequestsRef.current === 0) await fetchCart();
    }
  };

  const updateQuantity = async (cartLineId, delta) => {
    const resolvedLineKey = getCartLineKey({ id: cartLineId });
    const resolvedProductId = normalizeProductId(cartLineId);
    if (!resolvedLineKey) return;
    const currentItem = cart.find((item) => getCartLineKey(item) === resolvedLineKey);
    if (!currentItem) return;
    const stock = Number(currentItem.stock ?? 0);
    const newQty = Math.max(0, currentItem.quantity + delta);

    if (delta > 0 && newQty > stock) {
      showToast(`Only ${stock} items are available in stock.`, "error");
      return;
    }

    if (newQty === 0) {
      const existingTimer = qtyTimersRef.current.get(resolvedLineKey);
      if (existingTimer) clearTimeout(existingTimer);
      qtyTimersRef.current.delete(resolvedLineKey);
      qtyPendingRef.current.delete(resolvedLineKey);
      removeFromCart(resolvedLineKey);
      return;
    }

    const nextCart = assignFlatPackingLineTotals(
      cart.map((item) => {
        if (getCartLineKey(item) !== resolvedLineKey) return item;
        return {
          ...item,
          quantity: newQty,
        };
      }),
    );
    setCart(nextCart);
    setCartPricing((prevPricing) => buildOptimisticCartPricing(nextCart, prevPricing));

    if (!isAuthenticated) return;

    const coords = readDeliveryCoords();
    qtyPendingRef.current.set(resolvedLineKey, withActiveCouponParams({
      productId: resolvedProductId,
      quantity: newQty,
      variantKey: currentItem?.variantKey || currentItem?.selectedVariant?._id || "",
      variantName: currentItem?.variantName || currentItem?.selectedVariant?.name || "",
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    }));

    const existingTimer = qtyTimersRef.current.get(resolvedLineKey);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
      qtyTimersRef.current.delete(resolvedLineKey);
      const pending = qtyPendingRef.current.get(resolvedLineKey);
      qtyPendingRef.current.delete(resolvedLineKey);
      if (!pending) return;

      pendingRequestsRef.current += 1;
      try {
        const response = await customerApi.updateCartQuantity(pending);
        pendingRequestsRef.current -= 1;
        const result = response.data?.result;
        if (result) {
          applyCartResult(result);
        }
      } catch (error) {
        pendingRequestsRef.current -= 1;
        if (error?.response?.status === 400) {
          const errMsg = error?.response?.data?.message || `Only ${stock} items are available in stock.`;
          showToast(errMsg, "error");
          await fetchCart();
        } else if (error?.response?.status === 404) {
          try {
            await customerApi.addToCart({
              productId: pending.productId,
              quantity: pending.quantity,
              variantKey: pending.variantKey,
              variantName: pending.variantName,
              ...(pending.lat != null ? { lat: pending.lat, lng: pending.lng } : {}),
            });
            await fetchCart();
          } catch (addError) {
            console.error("Failed to fallback-add item to cart", addError);
            if (addError?.response?.status === 400) {
              const errMsg = addError?.response?.data?.message || `Only ${stock} items are available in stock.`;
              showToast(errMsg, "error");
            }
            await fetchCart();
          }
        } else if (pendingRequestsRef.current === 0) {
          await fetchCart();
        }
      }
    }, QTY_DEBOUNCE_MS);

    qtyTimersRef.current.set(resolvedLineKey, timer);
  };

  const clearCart = async () => {
    pendingRequestsRef.current += 1;
    setCart([]);
    persistQuickCartSnapshot([]);

    // Also clear Quick items from legacy cart to prevent them from reappearing
    // when switching back to Food-bridged pages (like Home)
    try {
      const legacyCart = localStorage.getItem("cart");
      if (legacyCart) {
        const parsed = JSON.parse(legacyCart);
        if (Array.isArray(parsed)) {
          const remaining = parsed.filter((item) => !isQuickCartItem(item));
          if (remaining.length > 0) {
            localStorage.setItem("cart", JSON.stringify(remaining));
          } else {
            localStorage.removeItem("cart");
          }
        }
      }
    } catch (e) {
      console.warn("Failed to clear legacy cart items", e);
    }

    try {
      const response = await customerApi.clearCart();
      const clearedItems = response.data?.result?.items || response.data?.items || [];
      setCart([]);
      persistQuickCartSnapshot([]);
      syncCart(clearedItems);
    } catch (error) {
      console.error("Error clearing cart on backend", error);
      // Re-throw so "Clear cart & add" can abort instead of adding into a non-empty cart.
      throw error;
    } finally {
      pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
    }
  };

  const cartTotal = useMemo(
    () => cart.reduce((total, item) => total + (item.price || 0) * item.quantity, 0),
    [cart]
  );
  const cartCount = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart]
  );

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    cartTotal,
    cartCount,
    cartPricing,
    loading,
    fetchCart,
  };
};

export const CartProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const foodCart = useFoodCart();
  const { showToast } = useToast();
  const isUsingFoodCart = foodCart?._isProvider === true;
  const standaloneCart = useStandaloneQuickCart(isUsingFoodCart);
  const [sellerConflict, setSellerConflict] = useState(null);
  const [isResolvingSellerConflict, setIsResolvingSellerConflict] = useState(false);
  const [bridgedCartPricing, setBridgedCartPricing] = useState(null);
  const bridgedQtyTimersRef = useRef(new Map());
  const bridgedQtyPendingRef = useRef(new Map());
  const bridgedFetchInFlightRef = useRef(null);

  const bridgedFetchCart = useCallback(async (extraParams = {}) => {
    if (!isAuthenticated) return null;
    const coords = readDeliveryCoords();
    const params = withActiveCouponParams({
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      ...extraParams,
    });
    const requestKey = JSON.stringify(params);
    if (bridgedFetchInFlightRef.current?.key === requestKey) {
      return bridgedFetchInFlightRef.current.promise;
    }

    const promise = (async () => {
      try {
        const response = await customerApi.getCart(params);
        const result = response?.data?.result;
        if (result && typeof result === "object") {
          setBridgedCartPricing(extractCartPricing(result));
        }
        return result || null;
      } catch (error) {
        console.error("Failed to fetch bridged cart pricing", error);
        return null;
      } finally {
        if (bridgedFetchInFlightRef.current?.key === requestKey) {
          bridgedFetchInFlightRef.current = null;
        }
      }
    })();

    bridgedFetchInFlightRef.current = { key: requestKey, promise };
    return promise;
  }, [isAuthenticated]);

  // Use foodCart.cart (stable array ref) as dep — avoids re-running when foodCart object ref changes
  const quickItemsFromFoodCart = useMemo(
    () => (Array.isArray(foodCart?.cart) ? foodCart.cart.filter(isQuickCartItem) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [foodCart?.cart],
  );

  useEffect(() => {
    if (!isUsingFoodCart) return;

    persistQuickCartSnapshot(quickItemsFromFoodCart);
  }, [isUsingFoodCart, quickItemsFromFoodCart]);

  const bridgedValue = useMemo(() => {
    if (!isUsingFoodCart) {
      return standaloneCart;
    }

    const addToCart = async (product, { skipSellerCheck = false } = {}) => {
      const normalizedProduct = normalizeQuickProductForSharedCart(product);
      const lineKey = getCartLineKey(normalizedProduct);
      const existingItem = quickItemsFromFoodCart.find(
        (item) => getCartLineKey(item) === lineKey,
      );

      if (!skipSellerCheck) {
        const conflict = checkSellerConflict(quickItemsFromFoodCart, normalizedProduct);
        if (conflict) {
          return { ok: false, ...conflict, product: normalizedProduct };
        }
      }

      const stock = Number(product.stock ?? (existingItem ? existingItem.stock : 0) ?? 0);
      const currentQty = existingItem ? Number(existingItem.quantity || 0) : 0;
      const targetQty = currentQty + 1;

      if (targetQty > stock) {
        showToast(`Only ${stock} items are available in stock.`, "error");
        return { ok: false, code: "OUT_OF_STOCK" };
      }

      const nextQuickItems = existingItem
        ? quickItemsFromFoodCart.map((item) =>
            getCartLineKey(item) === lineKey
              ? { ...item, quantity: Number(item.quantity || 0) + 1 }
              : item,
          )
        : [...quickItemsFromFoodCart, { ...normalizedProduct, quantity: 1 }];

      persistQuickCartSnapshot(nextQuickItems);
      foodCart.addToCart(normalizedProduct);

      if (isAuthenticated) {
        try {
          const couponParams = withActiveCouponParams({});
          const response = await customerApi.addToCart({
            productId: getProductId(normalizedProduct),
            quantity: 1,
            ...couponParams,
          });
          if (response?.data?.result) {
            setBridgedCartPricing(extractCartPricing(response.data.result));
          } else {
            await bridgedFetchCart();
          }
        } catch (error) {
          console.error("Failed to sync bridged addToCart to backend", error);
          if (error?.response?.status === 400) {
            const errorCode = error?.response?.data?.code;
            if (errorCode === "SELLER_MISMATCH") {
              if (currentQty === 0) {
                foodCart.removeFromCart(lineKey);
              } else {
                foodCart.updateQuantity(normalizedProduct.id, currentQty);
              }
              persistQuickCartSnapshot(quickItemsFromFoodCart);
              return {
                ok: false,
                code: "SELLER_MISMATCH",
                product: normalizedProduct,
                cartSellerName: getQuickStoreName(quickItemsFromFoodCart[0]),
                productSellerName: getQuickStoreName(normalizedProduct),
              };
            }
            const errMsg = error?.response?.data?.message || `Only ${stock} items are available in stock.`;
            showToast(errMsg, "error");
            foodCart.updateQuantity(normalizedProduct.id, currentQty);
            persistQuickCartSnapshot(quickItemsFromFoodCart);
          }
        }
      }

      return { ok: true };
    };

    const removeFromCart = async (cartLineId) => {
      const resolvedLineKey = getCartLineKey({ id: cartLineId });
      const resolvedProductId = normalizeProductId(cartLineId);
      if (!resolvedLineKey) return;

      const currentItem = quickItemsFromFoodCart.find(
        (item) => getCartLineKey(item) === resolvedLineKey,
      );
      const nextQuickItems = quickItemsFromFoodCart.filter(
        (item) => getCartLineKey(item) !== resolvedLineKey,
      );
      persistQuickCartSnapshot(nextQuickItems);
      foodCart.removeFromCart(resolvedLineKey);

      try {
        const response = await customerApi.removeFromCart(resolvedProductId, {
          variantKey: currentItem?.variantKey || currentItem?.variantId || currentItem?.selectedVariant?._id || "",
          variantName: currentItem?.variantName || currentItem?.selectedVariant?.name || "",
          ...withActiveCouponParams({}),
        });
        if (response?.data?.result) {
          setBridgedCartPricing(extractCartPricing(response.data.result));
        } else {
          await bridgedFetchCart();
        }
      } catch (error) {
        console.error("Failed to sync bridged removeFromCart to backend", error);
      }
    };

    const updateQuantity = async (cartLineId, delta) => {
      const resolvedLineKey = getCartLineKey({ id: cartLineId });
      const resolvedProductId = normalizeProductId(cartLineId);
      if (!resolvedLineKey) return;
      const currentItem = foodCart.getCartItem(resolvedLineKey);
      if (!currentItem) return;
      const stock = Number(currentItem.stock ?? 0);
      const nextQuantity = Math.max(0, (currentItem.quantity || 0) + delta);

      if (delta > 0 && nextQuantity > stock) {
        showToast(`Only ${stock} items are available in stock.`, "error");
        return;
      }

      const nextQuickItems =
        nextQuantity === 0
          ? quickItemsFromFoodCart.filter(
              (item) => getCartLineKey(item) !== resolvedLineKey,
            )
          : quickItemsFromFoodCart.map((item) =>
              getCartLineKey(item) === resolvedLineKey
                ? { ...item, quantity: nextQuantity }
                : item,
            );
      persistQuickCartSnapshot(nextQuickItems);
      foodCart.updateQuantity(resolvedLineKey, nextQuantity);

      if (!isAuthenticated) return;

      if (nextQuantity === 0) {
        const existingTimer = bridgedQtyTimersRef.current.get(resolvedLineKey);
        if (existingTimer) clearTimeout(existingTimer);
        bridgedQtyTimersRef.current.delete(resolvedLineKey);
        bridgedQtyPendingRef.current.delete(resolvedLineKey);
        try {
          const response = await customerApi.removeFromCart(resolvedProductId, {
            variantKey: currentItem?.variantKey || currentItem?.variantId || currentItem?.selectedVariant?._id || "",
            variantName: currentItem?.variantName || currentItem?.selectedVariant?.name || "",
            ...withActiveCouponParams({}),
          });
          if (response?.data?.result) {
            setBridgedCartPricing(extractCartPricing(response.data.result));
          }
        } catch (error) {
          console.error("Failed to sync bridged remove on qty=0", error);
        }
        return;
      }

      const coords = readDeliveryCoords();
      bridgedQtyPendingRef.current.set(resolvedLineKey, withActiveCouponParams({
        productId: resolvedProductId,
        quantity: nextQuantity,
        variantKey: currentItem?.variantKey || currentItem?.variantId || currentItem?.selectedVariant?._id || "",
        variantName: currentItem?.variantName || currentItem?.selectedVariant?.name || "",
        prevQuantity: currentItem.quantity,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      }));

      const existingTimer = bridgedQtyTimersRef.current.get(resolvedLineKey);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(async () => {
        bridgedQtyTimersRef.current.delete(resolvedLineKey);
        const pending = bridgedQtyPendingRef.current.get(resolvedLineKey);
        bridgedQtyPendingRef.current.delete(resolvedLineKey);
        if (!pending) return;

        try {
          try {
            const response = await customerApi.updateCartQuantity(pending);
            if (response?.data?.result) {
              setBridgedCartPricing(extractCartPricing(response.data.result));
            }
          } catch (error) {
            if (error?.response?.status === 404) {
              const response = await customerApi.addToCart({
                productId: pending.productId,
                quantity: pending.quantity,
                variantKey: pending.variantKey,
                variantName: pending.variantName,
                ...withActiveCouponParams({}),
              });
              if (response?.data?.result) {
                setBridgedCartPricing(extractCartPricing(response.data.result));
              }
            } else {
              throw error;
            }
          }
        } catch (error) {
          console.error("Failed to sync bridged updateQuantity to backend", error);
          if (error?.response?.status === 400) {
            const errMsg = error?.response?.data?.message || `Only ${stock} items are available in stock.`;
            showToast(errMsg, "error");
            foodCart.updateQuantity(resolvedProductId, pending.prevQuantity);
            persistQuickCartSnapshot(quickItemsFromFoodCart);
          }
        }
      }, QTY_DEBOUNCE_MS);

      bridgedQtyTimersRef.current.set(resolvedLineKey, timer);
    };

    const clearCart = async () => {
      persistQuickCartSnapshot([]);
      foodCart.clearCart();
      setBridgedCartPricing(null);

      try {
        await customerApi.clearCart();
        persistQuickCartSnapshot([]);
      } catch (error) {
        console.error("Failed to sync bridged clearCart to backend", error);
        throw error;
      }
    };

    const fetchCart = bridgedFetchCart;

    return {
      cart: quickItemsFromFoodCart,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      fetchCart,
      cartTotal: quickItemsFromFoodCart.reduce(
        (total, item) => total + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      ),
      cartCount: quickItemsFromFoodCart.reduce(
        (total, item) => total + Number(item.quantity || 0),
        0,
      ),
      cartPricing: bridgedCartPricing,
      loading: false,
    };
  }, [
    // Stable: only re-run bridgedValue when the actual data/flags change, not the whole foodCart object
    isUsingFoodCart,
    quickItemsFromFoodCart,
    standaloneCart,
    isAuthenticated,
    bridgedCartPricing,
    bridgedFetchCart,
    showToast,
    // foodCart action refs — stable via useCallback in Food CartContext
    foodCart?.addToCart,
    foodCart?.removeFromCart,
    foodCart?.updateQuantity,
    foodCart?.clearCart,
    foodCart?.getCartItem,
  ]);

  const closeSellerConflict = useCallback(() => {
    if (isResolvingSellerConflict) return;
    setSellerConflict(null);
  }, [isResolvingSellerConflict]);

  const confirmSellerConflict = useCallback(async () => {
    if (!sellerConflict?.onConfirm || isResolvingSellerConflict) return;
    setIsResolvingSellerConflict(true);
    try {
      const run = sellerConflict.onConfirm;
      setSellerConflict(null);
      await run();
    } catch (error) {
      console.error("Failed to clear cart and add item", error);
      showToast?.(
        error?.response?.data?.message ||
          error?.message ||
          "Could not clear cart. Please try again.",
        "error",
      );
    } finally {
      setIsResolvingSellerConflict(false);
    }
  }, [sellerConflict, isResolvingSellerConflict, showToast]);

  const contextValue = useMemo(() => {
    const baseValue = bridgedValue;
    const rawAddToCart = baseValue.addToCart;
    const clearCartFn = baseValue.clearCart;

    const addToCart = async (product, options = {}) => {
      const result = await rawAddToCart(product, options);
      if (result?.ok === false && result?.code === "SELLER_MISMATCH" && !options?.skipSellerCheck) {
        setSellerConflict({
          product: result.product || product,
          cartSellerName: result.cartSellerName,
          productSellerName: result.productSellerName,
          onConfirm: async () => {
            await clearCartFn();
            await rawAddToCart(result.product || product, { skipSellerCheck: true });
          },
        });
      }
      return result ?? { ok: true };
    };

    return {
      ...baseValue,
      addToCart,
    };
  }, [bridgedValue]);

  return (
    <CartContext.Provider value={{ ...contextValue, showToast }}>
      {children}
      {sellerConflict && (
        <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeSellerConflict}
          />
          <div className="relative z-10 w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mx-auto">
              <ShoppingBag size={22} className="text-amber-600" />
            </div>
            <h3 className="text-center text-lg font-bold text-slate-900">
              Another seller&apos;s items in cart
            </h3>
            <p className="mt-2 text-center text-sm text-slate-500">
              Your cart already has products from{" "}
              <span className="font-semibold text-slate-700">
                {sellerConflict.cartSellerName || "another seller"}
              </span>
              . Clear the cart to add items from{" "}
              <span className="font-semibold text-slate-700">
                {sellerConflict.productSellerName || "this seller"}
              </span>
              , or cancel to keep your current cart.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeSellerConflict}
                disabled={isResolvingSellerConflict}
                className="flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSellerConflict}
                disabled={isResolvingSellerConflict}
                className="flex-1 rounded-2xl bg-[#FF6A00] py-3 text-sm font-bold text-white transition-colors hover:bg-[#e85d04] disabled:opacity-60"
              >
                {isResolvingSellerConflict ? "Clearing..." : "Clear cart & add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </CartContext.Provider>
  );
};
