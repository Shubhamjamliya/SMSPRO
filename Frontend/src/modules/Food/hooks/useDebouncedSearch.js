import { useCallback, useEffect, useRef, useState } from "react"

const DEFAULT_CACHE_LIMIT = 30

/**
 * Debounced, cached, cancellable search-as-you-type helper.
 * - Waits `delay` ms of typing silence before firing.
 * - Skips the network entirely for repeated/backspaced queries (in-memory cache).
 * - Aborts the in-flight request when a newer query arrives, so slow responses
 *   can never overwrite fresher results.
 *
 * Pass a module-level Map as `cache` to share results across component remounts
 * (e.g. an overlay that fully unmounts on close).
 */
export default function useDebouncedSearch(
  fetcher,
  { delay = 350, minChars = 2, cache } = {},
) {
  const [query, setQuery] = useState("")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const cacheRef = useRef(cache || new Map())
  const abortRef = useRef(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    abortRef.current?.abort()

    const trimmed = query.trim()
    if (trimmed.length < minChars) {
      setData(null)
      setLoading(false)
      return undefined
    }

    const cacheKey = trimmed.toLowerCase()
    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setData(cached)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const timer = window.setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller

      fetcherRef
        .current(trimmed, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return
          if (cacheRef.current.size >= DEFAULT_CACHE_LIMIT) {
            const oldestKey = cacheRef.current.keys().next().value
            cacheRef.current.delete(oldestKey)
          }
          cacheRef.current.set(cacheKey, result)
          setData(result)
        })
        .catch((error) => {
          if (controller.signal.aborted || error?.code === "ERR_CANCELED") return
          setData(null)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, delay)

    return () => {
      window.clearTimeout(timer)
      // If a request already started for this query, cancel it when the
      // query changes or the component unmounts before it resolves.
      if (abortRef.current) abortRef.current.abort()
    }
  }, [query, delay, minChars])

  useEffect(() => () => abortRef.current?.abort(), [])

  const clearCache = useCallback(() => cacheRef.current.clear(), [])

  return { query, setQuery, data, loading, clearCache }
}
