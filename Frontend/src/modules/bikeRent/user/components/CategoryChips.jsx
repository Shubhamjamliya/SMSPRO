import { cn } from "@/lib/utils";

export default function CategoryChips({
  categories = [],
  value = "",
  onChange,
  className,
  showAll = true,
}) {
  return (
    <div
      className={cn(
        "-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {showAll ? (
        <button
          type="button"
          onClick={() => onChange?.("")}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition",
            !value
              ? "bg-[#FF6A00] text-white shadow-sm"
              : "bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-orange-200",
          )}
        >
          All
        </button>
      ) : null}
      {categories.map((category) => {
        const id = category.id || category._id;
        const active = String(value) === String(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange?.(active ? "" : String(id))}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition",
              active
                ? "bg-[#FF6A00] text-white shadow-sm"
                : "bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-orange-200",
            )}
          >
            {category.icon ? (
              <img
                src={category.icon}
                alt=""
                className="h-4 w-4 rounded-full object-cover"
              />
            ) : null}
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
