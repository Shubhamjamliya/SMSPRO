import React from "react";
import { Package } from "lucide-react";

const resolveVariantName = (item) =>
  String(item?.variantName || item?.notes || "").trim();

const resolveImage = (item) =>
  String(item?.image || item?.mainImage || "").trim();

const ReturnItemsList = ({ items = [], showRefund = true, className = "" }) => {
  const rows = Array.isArray(items) ? items : [];

  if (!rows.length) {
    return (
      <p className="text-xs text-slate-400 italic">No returned items on this request.</p>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {rows.map((item, idx) => {
        const variantName = resolveVariantName(item);
        const image = resolveImage(item);
        const returnedQty = Number(item.returnedQty ?? item.quantity ?? 0);
        const orderedQty = Number(item.orderedQty ?? 0);
        const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
        const refund = Number(
          item.refundAmount ?? (unitPrice > 0 ? unitPrice * returnedQty : 0),
        );
        const key = item.lineKey || item.itemId || `${item.name || "item"}-${idx}`;

        return (
          <div
            key={key}
            className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-12 w-12 rounded-xl overflow-hidden bg-white ring-1 ring-slate-200 shrink-0 flex items-center justify-center">
                {image ? (
                  <img
                    src={image}
                    alt={item.name || "Returned item"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Package className="h-5 w-5 text-slate-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {item.name || "Item"}
                </p>
                {variantName ? (
                  <p className="text-[11px] font-semibold text-primary mt-0.5">
                    {variantName}
                  </p>
                ) : null}
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Returning {returnedQty}
                  {orderedQty > 0 ? ` of ${orderedQty} delivered` : ""}
                  {unitPrice > 0 ? ` · ₹${unitPrice.toFixed(2)} each` : ""}
                </p>
              </div>
            </div>
            {showRefund ? (
              <p className="text-xs font-black text-slate-900 shrink-0">
                ₹{refund.toFixed(2)}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default ReturnItemsList;
