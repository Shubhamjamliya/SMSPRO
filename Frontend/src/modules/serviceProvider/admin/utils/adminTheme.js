/** Shared Service Provider admin layout + form tokens (Bike Rent admin parity). */
export const SP_ADMIN_PAGE_CLASS =
  "just-order-theme-scope space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 overflow-x-hidden";

/** True full-bleed variant — no max-width/centering at all, just the remaining space
 *  next to the sidebar (mirrors Food's AdminLayout `main` — w-full max-w-full, not a
 *  centered column), used by map-heavy admin pages AND the provider-facing dashboard
 *  (ServiceProviderLayout), whose card grids should use the full available width
 *  instead of leaving large empty gutters on wide screens. */
export const SP_ADMIN_PAGE_CLASS_WIDE =
  "just-order-theme-scope space-y-6 w-full max-w-full px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-24 overflow-x-hidden";

export const SP_ADMIN_SELECT_CLASS =
  "w-full min-w-0 max-w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 truncate";

export const SP_ADMIN_STAT_GRID_4_CLASS = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4";
