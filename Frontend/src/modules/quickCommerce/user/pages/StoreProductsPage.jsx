import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Store } from "lucide-react";
import { customerApi } from "../services/customerApi";
import ProductCard from "../components/shared/ProductCard";
import ProductDetailSheet from "../components/shared/ProductDetailSheet";
import MiniCart from "../components/shared/MiniCart";
import { useProductDetail } from "../context/ProductDetailContext";
import { getQuickCategoryPath, getQuickHomePath } from "../utils/routes";
import {
  getQuickSelectedStoreId,
  setQuickSelectedStoreId,
} from "../hooks/useQuickHomeData";
import { useLocation as useAppLocation } from "../context/LocationContext";
import { buildQuickZoneCatalogParams } from "../utils/zoneCatalogParams";
import { resolveShopOpenState } from "../utils/shopOpenStatus";
import { formatOpeningHoursAMPM } from "@shared/utils/timeFormat";
import { cn } from "@/lib/utils";

const formatProduct = (p) => ({
  ...p,
  id: p._id,
  image:
    p.mainImage ||
    p.image ||
    "https://images.unsplash.com/photo-1550989460-0adf9ea622e2",
  price: Number(p.salePrice || 0) > 0 ? Number(p.salePrice) : Number(p.price || 0),
  originalPrice: Number(p.originalPrice || p.mrp || p.price || p.salePrice || 0),
  weight: p.weight || "1 unit",
  deliveryTime: "8-15 mins",
});

export default function StoreProductsPage() {
  const { storeId } = useParams();
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get("categoryId") || "";
  const headerId = searchParams.get("headerId") || "";
  const navigate = useNavigate();
  const { currentLocation } = useAppLocation();
  const { isOpen: isProductDetailOpen } = useProductDetail();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setIsLoading(true);
    setQuickSelectedStoreId(storeId);
    try {
      const productParams = buildQuickZoneCatalogParams(currentLocation, {
        sellerId: storeId,
        limit: 100,
      });
      // Optional category scope (Header → Main → Store). Home → Store loads all products.
      if (categoryId) productParams.categoryId = categoryId;
      if (headerId) productParams.headerId = headerId;

      const [storeRes, productsRes] = await Promise.all([
        customerApi.getStoreDetails(storeId),
        customerApi.getProducts(productParams),
      ]);

      if (storeRes?.data?.success) {
        setStore(storeRes.data.result || null);
      }

      if (productsRes?.data?.success) {
        const raw = productsRes.data.result;
        const items = Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw)
            ? raw
            : Array.isArray(productsRes.data.results)
              ? productsRes.data.results
              : [];
        setProducts(items.map(formatProduct));
      } else {
        setProducts([]);
      }
    } catch (error) {
      if (import.meta.env?.DEV) console.error("Store products load failed", error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [storeId, categoryId, headerId, currentLocation?.latitude, currentLocation?.longitude]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!getQuickSelectedStoreId() && storeId) {
      setQuickSelectedStoreId(storeId);
    }
  }, [storeId]);

  const handleBack = () => {
    if (categoryId) {
      navigate(getQuickCategoryPath(categoryId, { headerId: headerId || undefined }));
    } else {
      navigate(getQuickHomePath());
    }
  };

  const shopOpen = resolveShopOpenState(store);

  return (
    <div className="min-h-screen bg-[#f6f7f9] pb-24">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3">
        <div className="w-full flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full p-2 hover:bg-slate-100"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5 text-slate-700" />
          </button>
          <div className={cn("min-w-0 flex-1", !shopOpen.isOpen && "grayscale")}>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="truncate text-sm font-black text-slate-900">
                {store?.shopName || store?.name || "Store"}
              </p>
              {store && !shopOpen.isOpen && (
                <span className="shrink-0 rounded-full bg-slate-800 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wide text-white">
                  Off
                </span>
              )}
            </div>
            <p className="truncate text-[11px] font-medium text-slate-500">
              {categoryId
                ? store?.isAdminHub
                  ? "Admin Hub · category products"
                  : "Category products"
                : store?.isAdminHub
                  ? "Admin Hub · all products"
                  : "All products"}
              {!shopOpen.isOpen && shopOpen.openingHours
                ? ` · ${formatOpeningHoursAMPM(shopOpen.openingHours)}`
                : ""}
            </p>
          </div>
          <Store className={cn("h-5 w-5", shopOpen.isOpen ? "text-[#0c831f]" : "text-slate-400")} />
        </div>
      </div>

      <div className="w-full px-4 py-4">
        {store && !shopOpen.isOpen && (
          <div className="mb-3 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700">
            Shop is currently closed. You can browse products, but ordering will resume during open hours
            {shopOpen.openingHours ? ` (${formatOpeningHoursAMPM(shopOpen.openingHours)})` : ""}.
          </div>
        )}
        {isLoading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">
            {categoryId
              ? "No products available in this category for this store."
              : "No products available in this store yet."}
          </div>
        ) : (
          <div className={cn("grid grid-cols-2 gap-3", !shopOpen.isOpen && "opacity-90")}>
            {products.map((product) => (
              <ProductCard
                key={product.id || product._id}
                product={{
                  ...product,
                  isShopOpen: shopOpen.isOpen,
                  shopOpeningHours: shopOpen.openingHours,
                  seller: {
                    ...(product.seller || {}),
                    isOpen: shopOpen.isOpen,
                    openingHours: shopOpen.openingHours,
                  },
                }}
              />
            ))}
          </div>
        )}
      </div>

      <MiniCart />
      {isProductDetailOpen ? <ProductDetailSheet /> : null}
    </div>
  );
}
