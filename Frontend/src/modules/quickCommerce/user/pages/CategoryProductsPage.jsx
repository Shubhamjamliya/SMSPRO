
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import ProductCard from '../components/shared/ProductCard';
import { resolveHeaderFromCategoryTree } from '../utils/productVariant';
import ProductDetailSheet from '../components/shared/ProductDetailSheet';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';
import MiniCart from '../components/shared/MiniCart';
import { useLocation as useAppLocation } from '../context/LocationContext';
import {
    getQuickZoneContext,
    setQuickZoneContext,
    setQuickSelectedStoreId,
} from '../hooks/useQuickHomeData';
import { getQuickCategoryPath, getQuickStorePath } from '../utils/routes';
import { buildQuickZoneCatalogParams, hasQuickZoneScope } from '../utils/zoneCatalogParams';
import { resolveShopOpenState } from '../utils/shopOpenStatus';
import { formatOpeningHoursAMPM } from '@shared/utils/timeFormat';
import StoreCard from '../components/shared/StoreCard';

const FALLBACK_HEADER_COLOR = "#FF6A00";

const mapMainCategories = (items = []) =>
    items.map((s) => ({
        id: s._id || s.id,
        name: s.name,
        image: s.image || 'https://cdn-icons-png.flaticon.com/128/2321/2321801.png',
    }));

const persistResolvedZone = (partial = {}) => {
    const prev = getQuickZoneContext() || {};
    const next = {
        ...prev,
        ...(partial.zoneId != null ? { zoneId: partial.zoneId } : {}),
        ...(partial.zoneType != null ? { zoneType: partial.zoneType } : {}),
        ...(partial.zoneName != null ? { zoneName: partial.zoneName } : {}),
        ...(partial.adminHubEnabled != null
            ? { adminHubEnabled: partial.adminHubEnabled }
            : {}),
    };
    setQuickZoneContext(next);
    return next;
};

/**
 * Header → Main Category → (SV products | MV stores → products)
 * Zone type is the only business branch. Headers are fully dynamic.
 */
const CategoryProductsPage = () => {
    const { categoryId: catId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const headerIdFromQuery = searchParams.get('headerId') || '';
    const { currentLocation } = useAppLocation();
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const fetchSeqRef = useRef(0);

    const [category, setCategory] = useState(null);
    const [nodeType, setNodeType] = useState(null); // header | category
    const [mainCategories, setMainCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [shops, setShops] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [headerTheme] = useState(FALLBACK_HEADER_COLOR);
    const [zoneType, setZoneType] = useState(() => getQuickZoneContext()?.zoneType || null);
    const [zoneId, setZoneId] = useState(() => getQuickZoneContext()?.zoneId || null);
    const [resolvedHeaderId, setResolvedHeaderId] = useState(headerIdFromQuery || null);
    const zoneTypeRef = useRef(zoneType);
    zoneTypeRef.current = zoneType;

    const isHeaderNode = nodeType === 'header';
    const isMainCategoryNode = nodeType === 'category';
    const isMultiVendor = zoneType === 'multi_vendor';
    const showMainCategories = isHeaderNode;
    const showStores = isMultiVendor && isMainCategoryNode;
    const showProducts = !showMainCategories && !showStores;
    const showCategoryRail = !showMainCategories && mainCategories.length > 0;

    const buildLocationParams = useCallback(() => {
        return buildQuickZoneCatalogParams(currentLocation, {
            ...(zoneId ? { zoneId } : {}),
        });
    }, [currentLocation?.latitude, currentLocation?.longitude, zoneId]);

    const fetchData = useCallback(async () => {
        const seq = ++fetchSeqRef.current;
        const isStale = () => seq !== fetchSeqRef.current;

        setIsLoading(true);
        try {
            const catRes = await customerApi.getCategories({ tree: true });
            if (isStale()) return;

            let fullMap = {};
            let headerId = headerIdFromQuery || null;
            let siblingMains = [];
            let normalizedType = 'category';

            if (catRes.data.success) {
                const results = catRes.data.results || catRes.data.result || [];
                const allCats = Array.isArray(results) ? results : [];
                const flatten = (items) => {
                    items.forEach((item) => {
                        fullMap[item._id] = item;
                        if (item.children?.length > 0) flatten(item.children);
                    });
                };
                flatten(allCats);

                const currentCat = fullMap[catId];
                if (currentCat) {
                    setCategory(currentCat);
                    const currentType = String(
                        currentCat.type || (currentCat.children?.length ? 'header' : 'category'),
                    );
                    normalizedType = currentType === 'header' ? 'header' : 'category';
                    setNodeType(normalizedType);

                    const headerNode = resolveHeaderFromCategoryTree(catId, fullMap);
                    headerId = String(headerNode?._id || headerNode?.id || headerIdFromQuery || '');
                    setResolvedHeaderId(headerId || null);

                    const headerForSiblings = headerNode || (normalizedType === 'header' ? currentCat : null);
                    if (headerForSiblings) {
                        let mains = (headerForSiblings.children || []).filter(
                            (c) => String(c.type || 'category') !== 'header',
                        );
                        if (mains.length === 0) {
                            const parentKey = String(headerForSiblings._id || headerForSiblings.id);
                            mains = Object.values(fullMap).filter(
                                (c) =>
                                    String(c.parentId?._id || c.parentId) === parentKey &&
                                    String(c.type || 'category') !== 'header',
                            );
                        }
                        siblingMains = mapMainCategories(mains);
                    }

                    if (normalizedType === 'header') {
                        setMainCategories(siblingMains);
                        setProducts([]);
                        setShops([]);
                        return;
                    }

                    setMainCategories(siblingMains);
                } else {
                    setNodeType('category');
                    setMainCategories([]);
                }
            }

            const locParams = buildLocationParams();
            const ctx = getQuickZoneContext();
            if (ctx?.zoneId) setZoneId(ctx.zoneId);
            if (ctx?.zoneType) setZoneType(ctx.zoneType);

            // Never fetch unscoped catalog — wait for zone session or lat/lng.
            if (!hasQuickZoneScope(currentLocation, locParams.zoneId || ctx?.zoneId)) {
                setProducts([]);
                setShops([]);
                return;
            }

            const catalogParams = {
                categoryId: catId,
                ...locParams,
            };
            if (headerId) catalogParams.headerId = headerId;

            const knownType = ctx?.zoneType || zoneTypeRef.current || null;

            const applyMultiVendorShops = (shops = []) => {
                setZoneType('multi_vendor');
                zoneTypeRef.current = 'multi_vendor';
                setProducts([]);
                setShops(Array.isArray(shops) ? shops : []);
            };

            // Confirmed single-vendor: products only (Admin Hub).
            if (knownType === 'single_vendor') {
                setShops([]);
                setZoneType('single_vendor');
                const prodRes = await customerApi.getProducts({ ...catalogParams, limit: 100 });
                if (isStale()) return;
                if (prodRes.data.success) {
                    const rawResult = prodRes.data.result;
                    const dbProds = Array.isArray(prodRes.data.results)
                        ? prodRes.data.results
                        : Array.isArray(rawResult?.items) ? rawResult.items
                            : Array.isArray(rawResult) ? rawResult : [];
                    setProducts(dbProds.map((p) => ({
                        ...p, id: p._id,
                        image: p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2",
                        price: p.salePrice || p.price, originalPrice: p.price,
                        weight: p.weight || "1 unit", deliveryTime: "8-15 mins",
                    })));
                } else {
                    setProducts([]);
                }
                return;
            }

            // Multi-vendor (or unknown): always resolve via stores first.
            const storesRes = await customerApi.getStores({
                ...catalogParams,
                page: 1,
                limit: 24,
            });
            if (isStale()) return;

            if (storesRes?.data?.success) {
                const result = storesRes.data.result || {};
                const resolvedType =
                    result.zoneType || ctx?.zoneType || zoneTypeRef.current || null;

                if (result.zoneType || result.zoneId) {
                    persistResolvedZone({
                        zoneId: result.zoneId || ctx?.zoneId || null,
                        zoneType: result.zoneType || ctx?.zoneType || null,
                        zoneName: result.zoneName || ctx?.zoneName || null,
                        adminHubEnabled:
                            result.adminHubEnabled ?? ctx?.adminHubEnabled ?? false,
                    });
                }
                if (result.zoneType) {
                    setZoneType(result.zoneType);
                    zoneTypeRef.current = result.zoneType;
                }
                if (result.zoneId) setZoneId(result.zoneId);

                if (resolvedType === 'multi_vendor') {
                    applyMultiVendorShops(result.shops);
                    return;
                }

                if (resolvedType === 'single_vendor') {
                    setShops([]);
                    setZoneType('single_vendor');
                    zoneTypeRef.current = 'single_vendor';
                    const prodRes = await customerApi.getProducts({ ...catalogParams, limit: 100 });
                    if (isStale()) return;
                    if (prodRes.data.success) {
                        const rawResult = prodRes.data.result;
                        const dbProds = Array.isArray(prodRes.data.results)
                            ? prodRes.data.results
                            : Array.isArray(rawResult?.items) ? rawResult.items
                                : Array.isArray(rawResult) ? rawResult : [];
                        setProducts(dbProds.map((p) => ({
                            ...p, id: p._id,
                            image: p.mainImage || p.image || "https://images.unsplash.com/photo-1550989460-0adf9ea622e2",
                            price: p.salePrice || p.price, originalPrice: p.price,
                            weight: p.weight || "1 unit", deliveryTime: "8-15 mins",
                        })));
                    } else {
                        setProducts([]);
                    }
                    return;
                }
            }

            // Known MV from session/previous category — stay on shops UI even if
            // this stores call briefly failed (sidebar category change).
            const effectiveType =
                getQuickZoneContext()?.zoneType || knownType || zoneTypeRef.current || null;
            if (effectiveType === 'multi_vendor' && normalizedType === 'category') {
                applyMultiVendorShops([]);
                return;
            }

            // No resolvable zone — do not leak global products.
            setProducts([]);
            setShops([]);
        } catch (error) {
            if (isStale()) return;
            console.error("Error fetching category data:", error);
            setProducts([]);
            setShops([]);
            setMainCategories([]);
        } finally {
            if (!isStale()) setIsLoading(false);
        }
    }, [catId, buildLocationParams, headerIdFromQuery, currentLocation?.latitude, currentLocation?.longitude]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const openStore = useCallback((shop) => {
        const id = shop?._id || shop?.id;
        if (!id) return;
        setQuickSelectedStoreId(id);
        navigate(getQuickStorePath(id, {
            categoryId: catId,
            headerId: resolvedHeaderId || headerIdFromQuery || undefined,
        }));
    }, [navigate, catId, resolvedHeaderId, headerIdFromQuery]);

    const openMainCategory = useCallback((main) => {
        navigate(getQuickCategoryPath(main.id, {
            headerId: resolvedHeaderId || headerIdFromQuery || undefined,
        }));
    }, [navigate, resolvedHeaderId, headerIdFromQuery]);

    const eyebrow = useMemo(() => {
        if (showMainCategories) return 'Main Categories';
        if (showStores) return 'Choose a store';
        return 'Products';
    }, [showMainCategories, showStores]);

    const categoryRail = showCategoryRail ? (
        <aside className="sticky top-[72px] z-10 flex w-[76px] shrink-0 flex-col gap-1 self-start overflow-y-auto border-r border-slate-200 bg-white pb-24 pt-2 max-h-[calc(100vh-72px)] sm:w-[88px]">
            {mainCategories.map((main) => {
                const active = String(main.id) === String(catId);
                return (
                    <button
                        key={main.id}
                        type="button"
                        onClick={() => openMainCategory(main)}
                        className={cn(
                            "mx-1 flex flex-col items-center gap-1.5 rounded-xl px-1.5 py-2.5 text-center transition-all",
                            active
                                ? "bg-[#FFF3EB] ring-1 ring-[#FF6A00]/30"
                                : "hover:bg-slate-50",
                        )}
                    >
                        <div
                            className={cn(
                                "flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-slate-50",
                                active && "ring-2 ring-[#FF6A00] ring-offset-1",
                            )}
                        >
                            <img
                                src={main.image}
                                alt=""
                                className="h-8 w-8 object-contain"
                                loading="lazy"
                            />
                        </div>
                        <span
                            className={cn(
                                "line-clamp-2 text-[9px] font-bold leading-tight",
                                active ? "text-[#FF6A00]" : "text-slate-600",
                            )}
                        >
                            {main.name}
                        </span>
                    </button>
                );
            })}
        </aside>
    ) : null;

    return (
        <div className="flex min-h-screen flex-col bg-white dark:bg-background font-sans pt-0 transition-colors duration-500">
            <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col">
                <header
                    className={cn(
                        "sticky top-0 z-30 px-4 py-4 flex items-center justify-between border-b border-white/20 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-md",
                        isProductDetailOpen && "hidden md:flex",
                    )}
                    style={{ backgroundImage: `linear-gradient(180deg, ${headerTheme} 0%, ${headerTheme}F2 100%)` }}
                >
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} className="p-1 hover:bg-white/15 rounded-full transition-colors">
                            <ChevronLeft size={24} className="text-white" />
                        </button>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-white/75">
                                {eyebrow}
                            </span>
                            <h1 className="text-[18px] font-bold text-white tracking-tight">{category?.name || catId}</h1>
                        </div>
                    </div>
                </header>

                {isLoading ? (
                    <main className="flex-1 px-4 pt-4 pb-24">
                        <div className="py-16 text-center text-sm font-semibold text-slate-500">
                            Loading...
                        </div>
                    </main>
                ) : showMainCategories ? (
                    <main className="flex-1 px-4 pt-4 pb-24 bg-[#f6f7f9]">
                        {mainCategories.length === 0 ? (
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm font-semibold text-slate-500">
                                No categories under this header yet.
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                                {mainCategories.map((main) => (
                                    <button
                                        key={main.id}
                                        type="button"
                                        onClick={() => openMainCategory(main)}
                                        className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm hover:border-[#FF6A00]/40 hover:shadow-md transition-all"
                                    >
                                        <img
                                            src={main.image}
                                            alt={main.name}
                                            className="mx-auto h-14 w-14 object-contain"
                                            loading="lazy"
                                        />
                                        <p className="mt-2 text-[11px] font-bold text-slate-800 leading-tight line-clamp-2">
                                            {main.name}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </main>
                ) : showStores ? (
                    <div className="flex flex-1 bg-[#f6f7f9]">
                        {categoryRail}
                        <main className="min-w-0 flex-1 px-3 pt-3 pb-24 sm:px-4 sm:pt-4">
                            {shops.length === 0 ? (
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm font-semibold text-slate-500">
                                    No stores sell products in this category yet.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                    {shops.map((shop) => (
                                        <StoreCard
                                            key={shop._id || shop.id}
                                            shop={shop}
                                            onClick={openStore}
                            />
                        ))}
                                </div>
                            )}
                        </main>
                    </div>
                ) : (
                    <div className="flex flex-1 bg-white dark:bg-background">
                        {categoryRail}
                        <main className="min-w-0 flex-1 px-2 pt-3 pb-24 sm:px-3">
                            {(() => {
                                const sample = products[0];
                                const shopState = sample ? resolveShopOpenState(sample) : { isOpen: true };
                                if (shopState.isOpen) return null;
                                return (
                                    <div className="mb-3 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700">
                                        <span className="mr-2 inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                                            Shop off
                                        </span>
                                        Products are visible, but ordering is paused until the shop is open
                                        {shopState.openingHours
                                            ? ` (${formatOpeningHoursAMPM(shopState.openingHours)})`
                                            : ""}
                                        .
                                    </div>
                                );
                            })()}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2 gap-y-4 md:gap-4 lg:gap-6">
                                {products.map((product) => (
                                    <ProductCard key={product.id} product={product} compact={true} />
                            ))}
                                {products.length === 0 && (
                                    <div className="col-span-full py-10 md:py-20 text-center">
                                        <p className="text-slate-400 font-black italic md:text-xl">No products found in this category</p>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
                )}

                {showProducts ? <MiniCart /> : null}
                <ProductDetailSheet />
            </div>
        </div>
    );
};

export default CategoryProductsPage;
