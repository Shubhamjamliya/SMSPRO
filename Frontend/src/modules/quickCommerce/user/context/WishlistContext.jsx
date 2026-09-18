import React, { createContext, useContext, useState, useEffect } from "react";
import { customerApi } from "../services/customerApi";
import { useAuth } from "@core/context/AuthContext";

const WishlistContext = createContext();

export const useWishlist = () => useContext(WishlistContext);

const getWishlistKeys = (product = {}, variant = null) => {
  const productId = String(product.productId || product.id || product._id || "")
    .split("::")[0]
    .trim();
  const variantId = String(
    variant?._id ||
      variant?.id ||
      variant?.sku ||
      variant?.name ||
      product.variantId ||
      product.variantKey ||
      product.selectedVariant?._id ||
      product.selectedVariant?.id ||
      "",
  ).trim();
  return { productId, variantId };
};

const wishlistItemKey = (productId, variantId = "") =>
  variantId ? `${productId}::${variantId}` : String(productId || "");

const normalizeWishlistId = (value) => String(value ?? "").split("::")[0];

const normalizeWishlistProduct = (item, fallback = {}) => {
  const source =
    typeof item === "string"
      ? { ...fallback, id: item, _id: item, productId: item }
      : { ...fallback, ...(item || {}) };
  const productId = normalizeWishlistId(
    source.productId || source.id || source._id,
  );
  if (!productId) return null;
  const selectedVariant = source.selectedVariant || fallback.selectedVariant || null;
  const variantId = String(
    source.variantId ||
      source.variantKey ||
      selectedVariant?._id ||
      selectedVariant?.id ||
      fallback.variantId ||
      "",
  ).trim();
  const image =
    source.image ||
    source.mainImage ||
    selectedVariant?.images?.[0] ||
    fallback.image ||
    "";

  return {
    ...fallback,
    ...source,
    productId,
    id: productId,
    _id: productId,
    variantId,
    selectedVariant,
    name: source.name || fallback.name,
    price: Number(source.price || source.salePrice || fallback.price || 0),
    salePrice: Number(source.salePrice || source.price || fallback.salePrice || 0),
    originalPrice: Number(
      source.originalPrice ||
        source.mrp ||
        source.salePrice ||
        source.price ||
        fallback.originalPrice ||
        0,
    ),
    image,
    mainImage: source.mainImage || image,
    weight: source.weight || fallback.weight,
    unit: source.unit || fallback.unit,
    deliveryTime: source.deliveryTime || fallback.deliveryTime,
    discount: source.discount || fallback.discount,
    wishlistKey: source.wishlistKey || wishlistItemKey(productId, variantId),
  };
};

const matchesWishlistItem = (item, productId, variantId = "") => {
  const normalized = normalizeWishlistProduct(item);
  if (!normalized || normalized.productId !== String(productId)) return false;
  return String(normalized.variantId || "") === String(variantId || "");
};

const buildWishlistFromProducts = (products = [], fallbackItems = []) => {
  const fallbackMap = new Map(
    fallbackItems
      .map((item) => {
        const normalized = normalizeWishlistProduct(item);
        return normalized ? [normalized.wishlistKey, normalized] : null;
      })
      .filter(Boolean),
  );

  return products
    .map((product) => {
      const productId = normalizeWishlistId(
        typeof product === "string"
          ? product
          : product?.productId || product?._id || product?.id,
      );
      const variantId =
        typeof product === "string"
          ? ""
          : String(product?.variantId || product?.variantKey || product?.selectedVariant?._id || "");
      const key = wishlistItemKey(productId, variantId);
      return normalizeWishlistProduct(product, fallbackMap.get(key) || fallbackMap.get(productId) || {});
    })
    .filter(Boolean);
};

export const WishlistProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [wishlist, setWishlist] = useState(() => {
    try {
      const savedWishlist = localStorage.getItem("wishlist");
      return savedWishlist ? JSON.parse(savedWishlist) : [];
    } catch (error) {
      console.error("Failed to load wishlist from localStorage", error);
      return [];
    }
  });

  const [loading, setLoading] = useState(false);
  const [isFullDataFetched, setIsFullDataFetched] = useState(false);

  const shrinkWishlistItem = (item) => normalizeWishlistProduct(item);

  const fetchWishlistIds = async () => {
    if (isAuthenticated) {
      setLoading(true);
      try {
        const response = await customerApi.getWishlist({ idsOnly: true });
        const products = response.data.result.products || [];
        setWishlist((prev) => buildWishlistFromProducts(products, prev));
        setIsFullDataFetched(false);
      } catch (error) {
        console.error("Failed to fetch wishlist from backend", error);
      } finally {
        setLoading(false);
      }
    }
  };

  const fetchFullWishlist = async () => {
    if (isAuthenticated) {
      setLoading(true);
      try {
        const response = await customerApi.getWishlist({ idsOnly: false });
        const products = response.data.result.products || [];
        setWishlist((prev) => buildWishlistFromProducts(products, prev));
        setIsFullDataFetched(true);
      } catch (error) {
        console.error("Failed to fetch full wishlist from backend", error);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchWishlistIds();
    } else {
      try {
        const savedWishlist = localStorage.getItem("wishlist");
        setWishlist(savedWishlist ? JSON.parse(savedWishlist) : []);
        setIsFullDataFetched(true);
      } catch (error) {
        setWishlist([]);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      try {
        const shrunkWishlist = wishlist.map(shrinkWishlistItem).filter(Boolean);
        localStorage.setItem("wishlist", JSON.stringify(shrunkWishlist));
      } catch (error) {
        if (error.name === "QuotaExceededError") {
          try {
            localStorage.removeItem("recent_searches");
            localStorage.removeItem("search_history");
            localStorage.removeItem("appzeto_recent_searches");
            localStorage.removeItem("user_recent_searches_v1");
          } catch {
            // ignore cleanup errors
          }
        }
        console.error("Failed to save wishlist to localStorage", error);
      }
    }
  }, [wishlist, isAuthenticated]);

  const addToWishlist = async (product, variant = null) => {
    const keys = getWishlistKeys(product, variant);
    if (!keys.productId) return;
    const payloadProduct = variant
      ? { ...product, selectedVariant: variant, variantId: keys.variantId }
      : product;

    if (isAuthenticated) {
      try {
        const response = await customerApi.addToWishlist({
          productId: keys.productId,
          variantId: keys.variantId || undefined,
        });
        const products = response?.data?.result?.products || [];
        setWishlist((prev) => buildWishlistFromProducts(products, [...prev, payloadProduct]));
        setIsFullDataFetched(true);
      } catch (error) {
        console.error("Error adding to wishlist on backend", error);
      }
    } else {
      setWishlist((prev) => {
        const normalizedProduct = normalizeWishlistProduct(payloadProduct);
        if (!normalizedProduct) return prev;
        if (prev.some((item) => item.wishlistKey === normalizedProduct.wishlistKey)) {
          return prev;
        }
        return [...prev, normalizedProduct];
      });
    }
  };

  const removeFromWishlist = async (productId, variantId = "") => {
    const keys =
      productId && typeof productId === "object"
        ? getWishlistKeys(productId)
        : { productId: normalizeWishlistId(productId), variantId: String(variantId || "") };

    if (isAuthenticated) {
      try {
        const response = await customerApi.removeFromWishlist(keys.productId, keys.variantId);
        const products = response?.data?.result?.products || [];
        setWishlist((prev) =>
          buildWishlistFromProducts(
            products,
            prev.filter((item) => !matchesWishlistItem(item, keys.productId, keys.variantId)),
          ),
        );
        setIsFullDataFetched(true);
      } catch (error) {
        console.error("Error removing from wishlist on backend", error);
      }
    } else {
      setWishlist((prev) =>
        prev.filter((item) => !matchesWishlistItem(item, keys.productId, keys.variantId)),
      );
    }
  };

  const toggleWishlist = async (product, variant = null) => {
    const keys = getWishlistKeys(product, variant);
    if (!keys.productId) return;
    const payloadProduct = variant
      ? { ...product, selectedVariant: variant, variantId: keys.variantId }
      : product;

    if (isAuthenticated) {
      try {
        const response = await customerApi.toggleWishlist({
          productId: keys.productId,
          variantId: keys.variantId || undefined,
        });
        const products = response?.data?.result?.products || [];
        setWishlist((prev) => buildWishlistFromProducts(products, [...prev, payloadProduct]));
        setIsFullDataFetched(true);
      } catch (error) {
        console.error("Error toggling wishlist on backend", error);
      }
    } else if (isInWishlist(payloadProduct, variant)) {
      removeFromWishlist(keys.productId, keys.variantId);
    } else {
      addToWishlist(payloadProduct, variant);
    }
  };

  const isInWishlist = (productId, variant = null) => {
    const keys =
      productId && typeof productId === "object"
        ? getWishlistKeys(productId, variant)
        : getWishlistKeys({ id: productId, selectedVariant: variant }, variant);
    if (!keys.productId) return false;
    return wishlist.some((item) => matchesWishlistItem(item, keys.productId, keys.variantId));
  };

  const clearWishlist = async () => {
    if (isAuthenticated) {
      try {
        await Promise.all(
          wishlist
            .map((item) => normalizeWishlistProduct(item))
            .filter(Boolean)
            .map((item) => customerApi.removeFromWishlist(item.productId, item.variantId)),
        );
      } catch (error) {
        console.error("Error clearing wishlist on backend", error);
      }
    }

    setWishlist([]);
    setIsFullDataFetched(true);
  };

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        addToWishlist,
        removeFromWishlist,
        toggleWishlist,
        isInWishlist,
        clearWishlist,
        fetchFullWishlist,
        isFullDataFetched,
        count: wishlist.length,
        loading,
      }}>
      {children}
    </WishlistContext.Provider>
  );
};
