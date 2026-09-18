import { useEffect, useMemo, useRef, useState } from "react"

const DEFAULT_PAGE_SIZE = 20
const DEFAULT_DEBOUNCE_MS = 350
const DEFAULT_CACHE_LIMIT = 60

const stableStringify = (value) => {
  if (!value || typeof value !== "object") return String(value ?? "")
  const sorted = Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      const current = value[key]
      if (current !== undefined && current !== null && current !== "") acc[key] = current
      return acc
    }, {})
  return JSON.stringify(sorted)
}

/**
 * Infinite-scroll sibling of useCachedPaginatedQuery. Same fetcher contract
 * (fetcher(params, { signal }) => { items, total }) but appends pages
 * instead of replacing them.
 */
export default function useInfiniteList(
  fetcher,
  {
    pageSize = DEFAULT_PAGE_SIZE,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    filters = {},
    cacheKey = "list",
    cacheLimit = DEFAULT_CACHE_LIMIT,
    enabled = true,
  } = {},
) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(Boolean(enabled))
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const cacheRef = useRef(new Map())
  const abortRef = useRef(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const normalizedFilters = useMemo(() => filters || {}, [filters])
  const filtersKey = useMemo(() => stableStringify(normalizedFilters), [normalizedFilters])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [search, debounceMs])

  useEffect(() => {
    setPage(1)
  }, [filtersKey, pageSize])

  useEffect(() => {
    if (!enabled) return undefined

    const isFirstPage = page === 1
    const params = {
      ...normalizedFilters,
      page,
      limit: pageSize,
      search: debouncedSearch || undefined,
    }
    const key = `${cacheKey}:${stableStringify(params)}`
    const cached = cacheRef.current.get(key)
    if (cached) {
      setItems((prev) => (isFirstPage ? cached.items : [...prev, ...cached.items]))
      setTotal(cached.total)
      setError(null)
      setLoading(false)
      setLoadingMore(false)
      return undefined
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    if (isFirstPage) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    fetcherRef
      .current(params, { signal: controller.signal })
      .then((result = {}) => {
        if (controller.signal.aborted) return
        const nextItems = Array.isArray(result.items) ? result.items : []
        const nextTotal = Number(result.total ?? nextItems.length) || 0
        if (cacheRef.current.size >= cacheLimit) {
          const oldestKey = cacheRef.current.keys().next().value
          cacheRef.current.delete(oldestKey)
        }
        cacheRef.current.set(key, { items: nextItems, total: nextTotal })
        setItems((prev) => (isFirstPage ? nextItems : [...prev, ...nextItems]))
        setTotal(nextTotal)
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.code === "ERR_CANCELED") return
        if (isFirstPage) setItems([])
        setError(err)
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setLoading(false)
        setLoadingMore(false)
      })

    return () => controller.abort()
  }, [cacheKey, cacheLimit, debouncedSearch, enabled, filtersKey, normalizedFilters, page, pageSize, refreshTick])

  useEffect(() => () => abortRef.current?.abort(), [])

  const hasMore = items.length < total
  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return
    setPage((prev) => prev + 1)
  }
  const refresh = () => {
    cacheRef.current.clear()
    setPage(1)
    setRefreshTick((current) => current + 1)
  }

  return {
    items,
    setItems,
    total,
    page,
    pageSize,
    hasMore,
    search,
    setSearch,
    debouncedSearch,
    loading,
    loadingMore,
    error,
    loadMore,
    refresh,
  }
}
