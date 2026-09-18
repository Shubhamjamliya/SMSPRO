import { useCallback, useEffect, useMemo, useState } from "react"
import { searchAPI, restaurantAPI } from "@food/api"
import useDebouncedSearch from "@food/hooks/useDebouncedSearch"
import {
  mapUnifiedSearchToSuggestions,
  sanitizeSearchQuery,
  filterRestaurantsBySearch,
  restaurantToSuggestion,
  mergeSearchSuggestions,
  normalizeSearchQuery,
} from "@food/utils/foodSearchUtils"

/** Module-level caches survive overlay remounts / page navigations. */
const unifiedSuggestionCache = new Map()
const trendingCache = { data: null, fetchedAt: 0, key: "" }
/** Full restaurant objects for instant client-side filtering (not just chips). */
const catalogCache = { data: null, fetchedAt: 0, key: "", loading: false }
const TRENDING_TTL_MS = 3 * 60 * 1000
const CATALOG_TTL_MS = 5 * 60 * 1000

/**
 * Debounced unified search (restaurants + dishes) with abort + cache.
 * Does not fire under `minChars` (default 2).
 */
export function useFoodUnifiedSearch(options = {}) {
  const {
    delay = 350,
    minChars = 2,
    zoneId,
    lat,
    lng,
    limit = 12,
    cache = unifiedSuggestionCache,
  } = options

  const fetcher = useCallback(
    async (q, { signal } = {}) => {
      const term = sanitizeSearchQuery(q)
      const res = await searchAPI.unifiedSearch(
        {
          q: term,
          limit,
          ...(zoneId ? { zoneId } : {}),
          ...(Number.isFinite(Number(lat)) ? { lat: Number(lat) } : {}),
          ...(Number.isFinite(Number(lng)) ? { lng: Number(lng) } : {}),
        },
        { signal },
      )
      const rows = res?.data?.data?.restaurants || []
      return mapUnifiedSearchToSuggestions(rows)
    },
    [zoneId, lat, lng, limit],
  )

  return useDebouncedSearch(fetcher, { delay, minChars, cache })
}

/**
 * Load restaurant catalog once per zone (for instant client-side search).
 * Reuses in-memory cache; never refetches on every keystroke.
 */
export function useFoodRestaurantCatalog(zoneId) {
  const cacheKey = String(zoneId || "all")
  const [restaurants, setRestaurants] = useState(() =>
    catalogCache.key === cacheKey && catalogCache.data ? catalogCache.data : [],
  )
  const [loading, setLoading] = useState(
    !(catalogCache.key === cacheKey && catalogCache.data),
  )

  useEffect(() => {
    let cancelled = false
    const now = Date.now()
    if (
      catalogCache.data &&
      catalogCache.key === cacheKey &&
      now - catalogCache.fetchedAt < CATALOG_TTL_MS
    ) {
      setRestaurants(catalogCache.data)
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)

    restaurantAPI
      .getRestaurants(
        { ...(zoneId ? { zoneId } : {}), limit: 200 },
        { signal: controller.signal },
      )
      .then((res) => {
        if (cancelled) return
        const list =
          res?.data?.data?.restaurants ||
          res?.data?.restaurants ||
          res?.data?.data ||
          []
        const normalized = Array.isArray(list) ? list : []
        catalogCache.data = normalized
        catalogCache.fetchedAt = Date.now()
        catalogCache.key = cacheKey
        setRestaurants(normalized)
      })
      .catch((error) => {
        if (cancelled || error?.code === "ERR_CANCELED") return
        setRestaurants([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [zoneId, cacheKey])

  return { restaurants, loading }
}

/**
 * Instant client-side matches from catalog + debounced dish/API enrichment.
 * Loading is true only while a network search is in flight.
 */
export function useHybridFoodSearch({ zoneId, lat, lng, query, limit = 16 } = {}) {
  const { restaurants: catalog, loading: catalogLoading } = useFoodRestaurantCatalog(zoneId)
  const {
    setQuery,
    data: remoteSuggestions,
    loading: remoteLoading,
  } = useFoodUnifiedSearch({
    delay: 400,
    minChars: 2,
    zoneId,
    lat,
    lng,
    limit,
  })

  useEffect(() => {
    setQuery(query || "")
  }, [query, setQuery])

  const clientSuggestions = useMemo(() => {
    const q = normalizeSearchQuery(query)
    if (!q) return []
    return filterRestaurantsBySearch(catalog, q)
      .slice(0, limit)
      .map((r, i) => restaurantToSuggestion(r, i))
      .filter(Boolean)
  }, [catalog, query, limit])

  const suggestions = useMemo(() => {
    const q = sanitizeSearchQuery(query)
    if (!q) return []
    // Prefer dish hits from API, then fill with instant client restaurant matches.
    const remote = Array.isArray(remoteSuggestions) ? remoteSuggestions : []
    const dishes = remote.filter((s) => s.type === "dish")
    const remoteRestaurants = remote.filter((s) => s.type !== "dish")
    return mergeSearchSuggestions(dishes, clientSuggestions, remoteRestaurants).slice(0, limit)
  }, [query, remoteSuggestions, clientSuggestions, limit])

  const dishMatchedRestaurantIds = useMemo(() => {
    const ids = new Set()
    for (const s of remoteSuggestions || []) {
      if (s?.restaurantId) ids.add(String(s.restaurantId))
    }
    return ids
  }, [remoteSuggestions])

  return {
    suggestions,
    clientSuggestions,
    dishMatchedRestaurantIds,
    catalog,
    catalogLoading,
    /** True only when a debounced API search is running (not on every keypress). */
    loading: remoteLoading,
    hasQuery: Boolean(sanitizeSearchQuery(query)),
  }
}

/**
 * One-shot trending / popular browse list for empty search state.
 * Cached ~3 minutes per zone. Not called on every keystroke.
 */
export async function fetchFoodSearchTrending({ zoneId, signal } = {}) {
  const cacheKey = String(zoneId || "all")
  const now = Date.now()
  if (
    trendingCache.data &&
    trendingCache.key === cacheKey &&
    now - trendingCache.fetchedAt < TRENDING_TTL_MS
  ) {
    return trendingCache.data
  }

  // Prefer catalog cache if warm.
  if (
    catalogCache.data &&
    catalogCache.key === cacheKey &&
    now - catalogCache.fetchedAt < CATALOG_TTL_MS
  ) {
    const fromCatalog = catalogCache.data
      .slice(0, 24)
      .map((r, i) => restaurantToSuggestion(r, i))
      .filter(Boolean)
    if (fromCatalog.length > 0) {
      trendingCache.data = fromCatalog
      trendingCache.fetchedAt = Date.now()
      trendingCache.key = cacheKey
      return fromCatalog
    }
  }

  try {
    const res = await restaurantAPI.getRestaurants(
      {
        ...(zoneId ? { zoneId } : {}),
        limit: 24,
      },
      { signal },
    )
    const restaurants =
      res?.data?.data?.restaurants ||
      res?.data?.restaurants ||
      res?.data?.data ||
      []
    const list = (Array.isArray(restaurants) ? restaurants : [])
      .slice(0, 24)
      .map((r, index) => restaurantToSuggestion(r, index))
      .filter(Boolean)

    if (list.length > 0) {
      trendingCache.data = list
      trendingCache.fetchedAt = Date.now()
      trendingCache.key = cacheKey
      return list
    }
  } catch (error) {
    if (error?.code === "ERR_CANCELED" || signal?.aborted) throw error
  }

  const res = await searchAPI.unifiedSearch(
    { limit: 24, ...(zoneId ? { zoneId } : {}) },
    { signal },
  )
  const rows = res?.data?.data?.restaurants || []
  const mapped = mapUnifiedSearchToSuggestions(rows).slice(0, 24)
  trendingCache.data = mapped
  trendingCache.fetchedAt = Date.now()
  trendingCache.key = cacheKey
  return mapped
}

/**
 * Client-side filter for an already-loaded restaurant list (Dining / Home lists).
 * Instant — no network.
 */
export function useClientRestaurantSearch(restaurants, query) {
  return useMemo(
    () => filterRestaurantsBySearch(restaurants, query),
    [restaurants, query],
  )
}

export { sanitizeSearchQuery, filterRestaurantsBySearch, restaurantToSuggestion, mergeSearchSuggestions }
