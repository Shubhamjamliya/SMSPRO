import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Clock, Heart, Loader2,
  Minus, Plus, ShieldCheck, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { useToast } from "@shared/components/ui/Toast";
import { customerApi } from "../services/customerApi";
import { resolveQuickImageUrl } from "../utils/image";
import {
  applyVariantToProduct,
  getCartLineId,
  getVariantDisplayLabel,
  getVariantKey,
} from "../utils/productVariant";

const BRAND = "#FF6A00";

const getProductIdentifier = (value) =>
  String(value?.cartLineId || value?.id || value?._id || value?.productId || value?.itemId || "").trim();

const normalizePrice = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cleanDescription = (text) => {
  if (!text) return "No description is available for this product yet.";
  const value = String(text).trim();
  if (!value) return "No description is available for this product yet.";
  if (value.startsWith("{\\rtf") || value.includes("\\par")) {
    const cleaned = value
      .replace(/\{\\[^}]*\}/g, " ")
      .replace(/\\[a-z]+\d*\s?/gi, " ")
      .replace(/\\'/g, "'")
      .replace(/[{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || "No description is available for this product yet.";
  }
  return value;
};

const pricingFromVariant = (variant, product = {}) => {
  if (!variant) {
    const salePrice = normalizePrice(product.salePrice, 0);
    const basePrice = normalizePrice(product.price, salePrice);
    const price = salePrice > 0 ? salePrice : basePrice;
    const originalPrice = Math.max(
      price,
      normalizePrice(product.originalPrice ?? product.mrp ?? product.price, price),
    );
    return { price, originalPrice, stock: normalizePrice(product.stock, 0) };
  }
  const salePrice = normalizePrice(variant.salePrice, 0);
  const basePrice = normalizePrice(variant.price, 0);
  const price = salePrice > 0 ? salePrice : basePrice;
  const originalPrice = Math.max(price, basePrice > 0 ? basePrice : price);
  return {
    price,
    originalPrice,
    stock: normalizePrice(variant.stock ?? product.stock, 0),
  };
};

const imagesFromProduct = (source = {}, variant = null) => {
  const variantImages = Array.isArray(variant?.images) ? variant.images.filter(Boolean) : [];
  const imageCandidates = (
    variantImages.length
      ? variantImages
      : [
          source.mainImage,
          source.image,
          ...(Array.isArray(source.galleryImages) ? source.galleryImages : []),
        ]
  )
    .filter(Boolean)
    .map((image) => resolveQuickImageUrl(image) || image)
    .filter(Boolean);
  return [...new Set(imageCandidates)];
};

const normalizeProduct = (product = {}, fallback = {}) => {
  const source = { ...fallback, ...product };
  const preferredVariant = source.selectedVariant || null;
  const images = imagesFromProduct(source, preferredVariant);

  const { price, originalPrice, stock } = pricingFromVariant(null, source);
  const packingAmount = Math.max(0, normalizePrice(source.packingAmount, 0));
  const tags = Array.isArray(source.tags) ? source.tags.filter(Boolean) : [];

  return {
    ...source,
    id: source.id || source._id,
    _id: source._id || source.id,
    name: source.name || "Product",
    category: source.category || source.categoryName || source.categoryId?.name || "Quick Commerce",
    price,
    originalPrice,
    packingAmount,
    tags,
    description: cleanDescription(source.description),
    images: images.length > 0
      ? images
      : ["https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200&auto=format&fit=crop"],
    storeName:
      source.storeName || source.restaurantName || source.seller?.shopName || source.seller?.name ||
      source.sellerId?.name || source.store?.name || source.storeId?.name || "Store",
    deliveryTime: source.deliveryTime || "8-12 mins",
    returnWindowDays: Number(source.returnWindowDays ?? 0),
    brand: source.brand || "",
    unit: source.unit || source.weight || "",
    stock,
    variants: Array.isArray(source.variants) ? source.variants : [],
  };
};

const ProductDetailChip = React.memo(function ProductDetailChip({ detail }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm transition-colors">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{detail.label}</p>
      <p className="text-sm font-black text-foreground">{detail.value}</p>
    </div>
  );
});

const ProductDetailPage = () => {
  const { productId, id } = useParams();
  const resolvedProductId = productId || id;
  const location = useLocation();
  const navigate = useNavigate();

  const initialProduct = useMemo(() => {
    const routeProduct = location.state?.product;
    return routeProduct ? normalizeProduct(routeProduct) : null;
  }, [location.state]);

  const [product, setProduct] = useState(initialProduct);
  const [activeImage, setActiveImage] = useState(initialProduct?.images?.[0] || "");
  const [loadingProduct, setLoadingProduct] = useState(!initialProduct);
  const [productError, setProductError] = useState("");
  const [selectedVariant, setSelectedVariant] = useState(
    () => location.state?.product?.selectedVariant || null,
  );

  const { cart, addToCart, updateQuantity, removeFromCart } = useCart();
  const { toggleWishlist: toggleWishlistGlobal, isInWishlist } = useWishlist();
  const { showToast } = useToast();

  const isWishlisted = useMemo(
    () => (product ? isInWishlist(product, selectedVariant) : false),
    [product, selectedVariant, isInWishlist],
  );

  const productVariants = useMemo(() => {
    if (!product) return [];
    const all = Array.isArray(product.variants) ? product.variants : [];
    return all.filter((v) => v && typeof v === "object");
  }, [product]);

  const hasVariants = productVariants.length > 0;

  useEffect(() => {
    if (!product) {
      setSelectedVariant(null);
      return;
    }
    if (!hasVariants) {
      setSelectedVariant(null);
      return;
    }
    setSelectedVariant((prev) => {
      if (prev) {
        const prevKey = getVariantKey(prev);
        const stillThere = productVariants.find((v) => getVariantKey(v) === prevKey);
        if (stillThere) return stillThere;
      }
      const preferredKey = String(
        location.state?.selectedVariantKey ||
          location.state?.product?.variantId ||
          location.state?.product?.selectedVariant?._id ||
          "",
      );
      if (preferredKey) {
        const preferred = productVariants.find(
          (v) =>
            getVariantKey(v) === preferredKey ||
            String(v._id) === preferredKey ||
            String(v.sku || "") === preferredKey ||
            String(v.name || "") === preferredKey,
        );
        if (preferred) return preferred;
      }
      return productVariants[0];
    });
  }, [product, hasVariants, productVariants, location.state]);

  const cartLineId = useMemo(() => {
    if (!product) return "";
    const baseId = product.id || product._id;
    return hasVariants ? getCartLineId(baseId, selectedVariant) : getProductIdentifier(product);
  }, [product, hasVariants, selectedVariant]);

  const activePricing = useMemo(() => {
    if (!product) return { price: 0, originalPrice: 0, stock: 0 };
    if (hasVariants && selectedVariant) return pricingFromVariant(selectedVariant, product);
    return pricingFromVariant(null, product);
  }, [product, hasVariants, selectedVariant]);

  const displayImages = useMemo(() => {
    if (!product) return [];
    const variantImages = imagesFromProduct(product, selectedVariant);
    return variantImages.length ? variantImages : product.images || [];
  }, [product, selectedVariant]);

  useEffect(() => {
    if (!displayImages.length) return;
    setActiveImage((current) =>
      displayImages.includes(current) ? current : displayImages[0],
    );
  }, [displayImages]);

  const quantity = useMemo(() => {
    if (!product) return 0;
    const cartItem = cart.find((item) => getProductIdentifier(item) === cartLineId);
    return cartItem ? cartItem.quantity : 0;
  }, [cart, product, cartLineId]);

  const detailChips = useMemo(() => {
    if (!product) return [];
    const chips = [];
    if (product.brand) chips.push({ label: "Brand", value: product.brand });
    if (product.unit) chips.push({ label: "Unit", value: product.unit });
    chips.push({
      label: "Stock",
      value: activePricing.stock > 0 ? `${activePricing.stock} available` : "Out of stock",
    });
    if (product.packingAmount > 0) {
      chips.push({ label: "Packing", value: `₹${product.packingAmount}` });
    }
    if (Number(product.returnWindowDays) > 0) {
      chips.push({
        label: "Return",
        value: `${Number(product.returnWindowDays)} day${Number(product.returnWindowDays) === 1 ? "" : "s"}`,
      });
    }
    if (selectedVariant?.sku) {
      chips.push({ label: "SKU", value: selectedVariant.sku });
    }
    return chips.slice(0, 6);
  }, [product, activePricing.stock, selectedVariant]);

  useEffect(() => {
    let cancelled = false;
    const fetchProduct = async () => {
      if (!resolvedProductId) {
        setLoadingProduct(false);
        setProductError("Product id is missing from the route.");
        return;
      }
      setLoadingProduct(true);
      setProductError("");
      try {
        const response = await customerApi.getProductDetails(resolvedProductId);
        const result =
          response?.data?.result || response?.data?.data || response?.data?.product || null;
        if (!result) throw new Error("Product not found");
        if (!cancelled) {
          const normalized = normalizeProduct(result, location.state?.product);
          setProduct(normalized);
          setActiveImage(normalized.images[0] || "");
        }
      } catch (error) {
        if (!cancelled) {
          setProduct(null);
          setProductError(error?.response?.data?.message || "Unable to load this product.");
        }
      } finally {
        if (!cancelled) setLoadingProduct(false);
      }
    };
    fetchProduct();
    return () => { cancelled = true; };
  }, [resolvedProductId]);

  const handleToggleWishlist = useCallback(() => {
    if (!product) return;
    toggleWishlistGlobal(product, selectedVariant);
    showToast(
      isWishlisted ? `${product.name} removed from wishlist` : `${product.name} added to wishlist`,
      isWishlisted ? "info" : "success",
    );
  }, [product, selectedVariant, toggleWishlistGlobal, isWishlisted, showToast]);

  const handleAddToCart = useCallback(async () => {
    if (!product) return;
    if (hasVariants && !selectedVariant) {
      showToast("Please select a variant", "error");
      return;
    }
    const cartProduct = hasVariants
      ? applyVariantToProduct(product, selectedVariant)
      : product;
    const stock = Number(cartProduct.stock ?? 0);
    if (stock <= 0) { showToast("This product is out of stock", "error"); return; }
    const result = await addToCart(cartProduct);
    if (result?.ok === false) {
      if (result?.code === "SHOP_CLOSED") return;
      return;
    }
    showToast(`${product.name} added to cart`, "success");
  }, [product, hasVariants, selectedVariant, addToCart, showToast]);

  const handleDecrement = useCallback(() => {
    if (!product || !cartLineId) return;
    if (quantity === 1) removeFromCart(cartLineId);
    else updateQuantity(cartLineId, -1);
  }, [product, cartLineId, quantity, removeFromCart, updateQuantity]);

  const handleIncrement = useCallback(() => {
    if (!product || !cartLineId) return;
    const stock = Number(activePricing.stock ?? Infinity);
    if (quantity >= stock) {
      showToast(`Only ${stock} items are available in stock.`, "error");
      return;
    }
    updateQuantity(cartLineId, 1);
  }, [product, cartLineId, activePricing.stock, quantity, updateQuantity, showToast]);

  if (loadingProduct) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1920px] items-center justify-center px-4 md:px-[50px]">
        <div className="flex items-center gap-3 rounded-2xl bg-card border border-border px-6 py-4 shadow-sm">
          <Loader2 className="animate-spin" style={{ color: BRAND }} size={22} />
          <span className="font-bold text-slate-600 dark:text-slate-400">Loading product...</span>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1920px] flex-col items-center justify-center px-4 text-center md:px-[50px]">
        <h1 className="text-2xl font-black text-foreground">Product not found</h1>
        <p className="mt-2 max-w-md text-sm font-medium text-slate-500 dark:text-slate-400">
          {productError || "This product may have been removed or is no longer available."}
        </p>
        <Button
          onClick={() => navigate(-1)}
          className="mt-6 rounded-2xl px-6 py-3 text-white hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          Go back
        </Button>
      </div>
    );
  }

  const discountPercent = activePricing.originalPrice > activePricing.price
    ? Math.round(((activePricing.originalPrice - activePricing.price) / activePricing.originalPrice) * 100)
    : 0;

  return (
    <div className="relative z-10 w-full px-4 py-4 pb-24 animate-in fade-in duration-500">
      <button
        onClick={() => navigate(-1)}
        className="group mb-4 inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 transition-colors hover:text-[#FF6A00]"
      >
        <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-1" />
        Back
      </button>

      <div className="flex flex-col gap-6">
        <div className="space-y-2.5 w-full">
          <div className="relative h-56 sm:h-64 w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs transition-colors">
            <img src={activeImage} alt={product.name} className="h-full w-full object-contain mix-blend-multiply dark:mix-blend-normal" />
            <button
              onClick={handleToggleWishlist}
              className={cn(
                "absolute right-3 top-3 rounded-full p-2 shadow-xs transition-all border border-slate-100",
                isWishlisted ? "bg-orange-50 text-[#FF6A00]" : "bg-white text-slate-400 hover:text-slate-600",
              )}
            >
              <Heart size={16} fill={isWishlisted ? "currentColor" : "none"} />
            </button>
          </div>
          {displayImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {displayImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  onClick={() => setActiveImage(image)}
                  className={cn(
                    "h-13 w-13 flex-shrink-0 overflow-hidden rounded-xl border-2 transition-all p-0.5 bg-white",
                    activeImage === image
                      ? "border-[#FF6A00] shadow-2xs"
                      : "border-slate-200/80 opacity-70 hover:opacity-100",
                  )}
                >
                  <img src={image} alt={`${product.name} ${index + 1}`} className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5 w-full">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#FF6A00]/25 bg-[#FF6A00]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#FF6A00]">
                {product.category}
              </span>
              {product.brand ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                  {product.brand}
                </span>
              ) : null}
            </div>
            <h1 className="mb-1.5 text-lg sm:text-xl font-black leading-tight text-foreground transition-colors">
              {product.name}
            </h1>
            <div className="mb-4 flex items-center gap-1.5">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-100 text-[#FF6A00]">
                <ShieldCheck size={12} />
              </div>
              <span className="text-xs font-bold uppercase tracking-tight text-slate-500 dark:text-slate-400">
                Sold by:{" "}
                <span className="text-foreground underline decoration-[#FF6A00]/40 decoration-1 underline-offset-2">
                  {product.storeName}
                </span>
              </span>
            </div>

            <div className="mb-4 flex items-baseline gap-2.5">
              <span className="text-xl font-black text-[#FF6A00]">₹{activePricing.price}</span>
              {activePricing.originalPrice > activePricing.price && (
                <>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 line-through">
                    ₹{activePricing.originalPrice}
                  </span>
                  <span className="rounded-lg bg-orange-50 px-2 py-0.5 text-[10px] font-black uppercase text-[#FF6A00]">
                    {discountPercent}% OFF
                  </span>
                </>
              )}
            </div>

            {product.packingAmount > 0 ? (
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                <Package size={12} className="text-[#FF6A00]" />
                Packing charge: ₹{product.packingAmount}
              </p>
            ) : null}

            <p className="text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300 transition-colors whitespace-pre-wrap">
              {product.description}
            </p>

            {product.tags?.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {hasVariants ? (
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Choose variant
              </p>
              <div className="flex flex-wrap gap-2">
                {productVariants.map((variant, idx) => {
                  const key = getVariantKey(variant) || String(idx);
                  const selected = getVariantKey(selectedVariant) === getVariantKey(variant);
                  const vp = pricingFromVariant(variant, product);
                  const label =
                    getVariantDisplayLabel(variant, product) ||
                    variant.sku ||
                    `Option ${idx + 1}`;
                  const out = vp.stock <= 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={out}
                      onClick={() => setSelectedVariant(variant)}
                      className={cn(
                        "min-w-[7.5rem] rounded-2xl border px-3 py-2.5 text-left transition-all",
                        selected
                          ? "border-[#FF6A00] bg-[#FF6A00]/10 shadow-sm"
                          : "border-slate-200 bg-white hover:border-[#FF6A00]/40",
                        out && "opacity-45 cursor-not-allowed",
                      )}
                    >
                      <p className={cn("text-sm font-bold leading-tight", selected ? "text-[#FF6A00]" : "text-slate-800")}>
                        {label}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        ₹{vp.price}
                        {out ? " · Out of stock" : vp.stock > 0 ? ` · ${vp.stock} left` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card dark:bg-slate-900/50 p-3.5 sm:flex-row transition-colors">
            <div className="w-full">
              {quantity > 0 ? (
                <div
                  className="flex h-12 w-full items-center rounded-xl px-2 text-white shadow-md"
                  style={{ backgroundColor: BRAND }}
                >
                  <button
                    onClick={handleDecrement}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all hover:bg-white/20"
                  >
                    <Minus size={18} strokeWidth={3} />
                  </button>
                  <span className="flex-1 text-center text-sm font-black">{quantity}</span>
                  <button
                    disabled={quantity >= Number(activePricing.stock ?? Infinity)}
                    onClick={handleIncrement}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={18} strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <Button
                  onClick={handleAddToCart}
                  disabled={activePricing.stock <= 0 || (hasVariants && !selectedVariant)}
                  className="h-12 w-full rounded-xl text-xs font-black text-white transition-all hover:opacity-95 disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  <Plus className="mr-1.5" size={18} strokeWidth={3} />
                  {activePricing.stock <= 0 ? "OUT OF STOCK" : "ADD TO CART"}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1 text-center sm:text-left">
              <span className="flex items-center justify-center gap-1 text-xs font-black uppercase tracking-widest text-[#FF6A00] sm:justify-start">
                <ShieldCheck size={14} />Hygiene Guaranteed
              </span>
              <span className="flex items-center justify-center gap-1 text-sm font-bold text-slate-400 dark:text-slate-500 sm:justify-start">
                <Clock size={14} />Delivered in {product.deliveryTime}
              </span>
            </div>
          </div>

          {detailChips.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {detailChips.map((detail) => (
                <ProductDetailChip key={detail.label} detail={detail} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;
