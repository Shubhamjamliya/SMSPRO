import { Eye, FileText } from "lucide-react";
import { cn } from "@food/utils/utils";

export function ProfileDocGrid({ items = [], onPreview, className }) {
  if (!items.length) return null;

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {items.map((item) => {
        const hasDoc = Boolean(item?.url || item?.doc?.document);
        const url = item?.url || item?.doc?.document;
        return (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden"
          >
            <button
              type="button"
              disabled={!hasDoc}
              onClick={() => hasDoc && onPreview?.(item)}
              className={cn(
                "w-full aspect-[4/3] bg-slate-100 flex items-center justify-center relative",
                hasDoc ? "active:opacity-90" : "opacity-70",
              )}
            >
              {hasDoc ? (
                <img
                  src={url}
                  alt={item.label}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <FileText className="w-5 h-5 text-slate-300" />
              )}
              {hasDoc ? (
                <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-white/90 border border-slate-200 flex items-center justify-center text-slate-600">
                  <Eye className="w-3 h-3" />
                </span>
              ) : null}
            </button>
            <div className="px-2 py-1.5">
              <p className="text-[10px] font-bold text-slate-800 truncate">
                {item.label}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {item.statusLabel || (hasDoc ? "Uploaded" : "Not uploaded")}
              </p>
              {item.number ? (
                <p className="text-[10px] font-semibold text-slate-600 truncate mt-0.5">
                  {item.number}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
