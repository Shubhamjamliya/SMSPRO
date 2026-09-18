import React, { useEffect, useMemo, useState } from "react";
import ProductCard from "../components/shared/ProductCard";
import { customerApi } from "../services/customerApi";
import { useLocation as useAppLocation } from "../context/LocationContext";
import {
  buildQuickZoneCatalogParams,
  hasQuickZoneScope,
} from "../utils/zoneCatalogParams";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1550989460-0adf9ea622e2";

const mapProducts = (list = []) =>
  list.map((p) => ({
    ...p,
    id: p._id || p.id,
    image: p.mainImage || p.image || FALLBACK_IMAGE,
    price: p.salePrice || p.price,
    originalPrice: p.originalPrice || p.mrp || p.price,
    weight: p.weight || "1 unit",
    deliveryTime: "8-15 mins",
  }));

const ProductsPage = () => {
  const { currentLocation } = useAppLocation();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const zoneParams = useMemo(
    () => buildQuickZoneCatalogParams(currentLocation),
    [currentLocation?.latitude, currentLocation?.longitude],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!hasQuickZoneScope(currentLocation)) {
        if (!cancelled) {
          setProducts([]);
          setIsLoading(false);
        }
        return;
      }
      setIsLoading(true);
      try {
        const res = await customerApi.getProducts({
          ...zoneParams,
          limit: 100,
        });
        if (cancelled || !res?.data?.success) return;
        const raw = res.data.result;
        const list = Array.isArray(res.data.results)
          ? res.data.results
          : Array.isArray(raw?.items)
            ? raw.items
            : Array.isArray(raw)
              ? raw
              : [];
        setProducts(mapProducts(list));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load zone products", error);
          setProducts([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [zoneParams, currentLocation?.latitude, currentLocation?.longitude]);

  return (
    <div className="relative z-10 py-8 w-full max-w-[1920px] mx-auto px-4 md:px-[50px] animate-in fade-in slide-in-from-bottom-4 duration-700 mt-36 md:mt-24">
      <div className="mb-8 text-left">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[#0c831f] mb-1">
          All Products
        </h1>
        <p className="text-gray-500 text-sm md:text-lg font-medium">
          {isLoading
            ? "Loading products in your zone…"
            : `Showing ${products.length} items available in your zone`}
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm font-semibold text-slate-500">
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
          {products.length === 0 ? (
            <div className="col-span-full py-16 text-center text-sm font-semibold text-slate-400">
              No products available in your current zone.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
