import React, { memo } from "react";
import { ChevronRight, Clock, MapPin, Package, Star, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveShopOpenState } from "../../utils/shopOpenStatus";
import { formatOpeningHoursAMPM } from "@shared/utils/timeFormat";

const StoreCard = ({ shop, onClick, compact = false }) => {
  const shopId = shop?._id || shop?.id;
  const { isOpen, openingHours } = resolveShopOpenState(shop);
  const shopImg = shop?.image || shop?.shopImage || shop?.shopInfo?.shopImage || "";
  const address = shop?.address || shop?.location?.address || "";
  const productCount = Number(shop?.productCount);
  const hasProductCount = Number.isFinite(productCount) && productCount >= 0;

  return (
    <button
      type="button"
      onClick={() => onClick?.(shop)}
      className={cn(
        "text-left overflow-hidden rounded-2xl border bg-white shadow-sm transition-all group w-full",
        compact ? "min-w-[260px] max-w-[280px] snap-start shrink-0" : "",
        isOpen
          ? "border-slate-200 hover:border-[#FF6A00]/50 hover:shadow-md"
          : "border-slate-200 bg-slate-50/80",
      )}
    >
      <div className={cn("relative w-full bg-slate-100", compact ? "h-28" : "h-36", !isOpen && "grayscale")}>
        {shopImg ? (
          <img
            src={shopImg}
            alt={shop?.shopName || shop?.name || "Store"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-50 to-slate-100">
            <Store className="h-10 w-10 text-[#FF6A00]/40" />
          </div>
        )}
        <div
          className={cn(
            "absolute left-3 top-3 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm backdrop-blur-sm",
            isOpen
              ? "bg-white/95 text-[#FF6A00] border border-[#FF6A00]/20"
              : "bg-slate-800/80 text-white",
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", isOpen ? "bg-[#FF6A00]" : "bg-slate-300")} />
          {isOpen ? "Open now" : "Closed"}
        </div>
        {hasProductCount ? (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-black text-slate-700 shadow-sm border border-slate-100">
            <Package className="h-3 w-3 text-[#FF6A00]" />
            {productCount} {productCount === 1 ? "item" : "items"}
          </div>
        ) : null}
      </div>

      <div className={cn("p-3.5 flex flex-col gap-2.5", !isOpen && "opacity-80")}>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-black text-slate-900 leading-tight tracking-tight">
            {shop?.shopName || shop?.name || "Store"}
          </h3>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
            {shop?.isAdminHub ? "Admin Hub" : shop?.businessType || "Local store"}
          </p>
          {address ? (
            <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-slate-500 line-clamp-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span>{address}</span>
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
            {Number(shop?.rating || 0).toFixed(1)}
            {shop?.totalRatings ? (
              <span className="text-slate-400 font-medium">({shop.totalRatings})</span>
            ) : null}
          </span>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <span className="inline-flex items-center gap-1 min-w-0 truncate">
            <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              {openingHours ? formatOpeningHoursAMPM(openingHours) : "24/7"}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className="text-[11px] font-medium text-slate-400">
            {hasProductCount
              ? `${productCount} product${productCount === 1 ? "" : "s"}`
              : isOpen
                ? "Ready for orders"
                : "Browse only"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-black transition-transform group-hover:translate-x-0.5",
              isOpen ? "text-[#FF6A00]" : "text-slate-400",
            )}
          >
            {isOpen ? "Shop now" : "View"}
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>
      <span className="sr-only">{shopId}</span>
    </button>
  );
};

export default memo(StoreCard);
