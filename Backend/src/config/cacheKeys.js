/**
 * Single source of truth for HTTP response-cache prefixes, TTLs and invalidation
 * fan-out for the food module.
 *
 * The problem this solves: prefixes and TTLs used to be typed as string literals
 * at each `cacheResponse(...)` call and again at each `invalidateCache(...)` call.
 * They drifted — editing a menu item invalidated `restaurant_menu` and `categories`
 * but not `search_unified` or `restaurant_detail`, both of which embed the same
 * data, so search results kept serving deleted items until their TTL lapsed.
 *
 * Rules:
 *  - Read TTLs from `CACHE_TTL`, never inline a number at a route.
 *  - Declare in `INVALIDATION_GROUPS` every prefix a write affects, then invalidate
 *    the group, not individual prefixes.
 */

/** Cache key prefixes. Also the unit of invalidation. */
export const CACHE_PREFIX = Object.freeze({
    // Restaurant catalogue
    RESTAURANTS: 'restaurants',
    RESTAURANT_DETAIL: 'restaurant_detail',
    RESTAURANT_MENU: 'restaurant_menu',
    RESTAURANT_TIMINGS: 'restaurant_timings',
    RESTAURANT_ADDONS: 'restaurant_addons',
    CATEGORIES: 'categories',
    OFFERS: 'offers',

    // Search
    SEARCH_UNIFIED: 'search_unified',
    SEARCH_CATEGORIES_ADMIN: 'search_categories_admin',

    // Landing / CMS
    HERO_BANNERS: 'hero_banners_public',
    UNDER250_BANNERS: 'under250_banners_public',
    DINING_BANNERS: 'dining_banners_public',
    GOURMET: 'gourmet_public',
    EXPLORE_ICONS: 'explore_icons_public',
    LANDING_SETTINGS: 'landing_settings_public',
    CMS_PAGES: 'cms_pages',
    REFERRAL_SETTINGS: 'referral_settings',
    ZONES: 'zones_public',

    // Platform settings (previously uncached, hit on every app cold start)
    BUSINESS_SETTINGS: 'business_settings_public',
    FEE_SETTINGS: 'fee_settings_public',
    DELIVERY_SPEED_OPTIONS: 'delivery_speed_public',
    DINING_CATEGORIES: 'dining_categories_public',
    DINING_RESTAURANTS: 'dining_restaurants_public',

    // Subscriptions
    SUBSCRIPTION_PLANS: 'subscription_plans',

    // Quick commerce
    QUICK_COUPONS: 'quick_coupons',
    QUICK_OFFERS: 'quick_offers',
});

/**
 * TTLs in seconds, chosen by how stale the data may safely be:
 *  - VOLATILE: changes constantly and is not explicitly invalidated; short TTL
 *    exists only to absorb identical concurrent bursts.
 *  - Everything else IS explicitly invalidated on write, so the TTL is just a
 *    backstop against a missed invalidation and can be long.
 */
export const CACHE_TTL = Object.freeze({
    VOLATILE: 60,
    SHORT: 300,
    MEDIUM: 600,
    LONG: 1800,
});

/**
 * Which prefixes a given kind of write must invalidate.
 *
 * Keys deliberately overlap: menu data is denormalised into search results and
 * restaurant detail payloads, so a menu edit has to clear all three.
 */
export const INVALIDATION_GROUPS = Object.freeze({
    /** Restaurant profile / approval / status change. */
    RESTAURANT: [
        CACHE_PREFIX.RESTAURANTS,
        CACHE_PREFIX.RESTAURANT_DETAIL,
        CACHE_PREFIX.SEARCH_UNIFIED,
        CACHE_PREFIX.DINING_RESTAURANTS,
    ],
    /** Menu item / category / addon / price change. */
    MENU: [
        CACHE_PREFIX.RESTAURANT_MENU,
        CACHE_PREFIX.RESTAURANT_ADDONS,
        CACHE_PREFIX.RESTAURANT_DETAIL,
        CACHE_PREFIX.CATEGORIES,
        CACHE_PREFIX.SEARCH_UNIFIED,
    ],
    /** Outlet opening-hours change. */
    TIMINGS: [
        CACHE_PREFIX.RESTAURANT_TIMINGS,
        CACHE_PREFIX.RESTAURANT_DETAIL,
        CACHE_PREFIX.RESTAURANTS,
    ],
    /** Coupon / offer change (food + quick commerce share the surface). */
    OFFERS: [
        CACHE_PREFIX.OFFERS,
        CACHE_PREFIX.QUICK_COUPONS,
        CACHE_PREFIX.QUICK_OFFERS,
        CACHE_PREFIX.RESTAURANT_DETAIL,
    ],
    /** Fee / delivery-speed / business settings change — affects priced surfaces. */
    SETTINGS: [
        CACHE_PREFIX.BUSINESS_SETTINGS,
        CACHE_PREFIX.FEE_SETTINGS,
        CACHE_PREFIX.DELIVERY_SPEED_OPTIONS,
        CACHE_PREFIX.RESTAURANT_MENU,
        CACHE_PREFIX.RESTAURANT_DETAIL,
        CACHE_PREFIX.SEARCH_UNIFIED,
    ],
    /** Landing page / banner / CMS change. */
    LANDING: [
        CACHE_PREFIX.HERO_BANNERS,
        CACHE_PREFIX.UNDER250_BANNERS,
        CACHE_PREFIX.DINING_BANNERS,
        CACHE_PREFIX.GOURMET,
        CACHE_PREFIX.EXPLORE_ICONS,
        CACHE_PREFIX.LANDING_SETTINGS,
    ],
});
