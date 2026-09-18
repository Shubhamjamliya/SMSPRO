import { useMemo } from "react"

const normalize = (value) => String(value || "").trim().toLowerCase()

/**
 * Pure client-side name matching over an already-fetched list (categories, add-ons, etc).
 * No network calls - the list is already in memory, so this just needs to be fast, not debounced.
 */
export default function useNameSuggestions(
  items,
  query,
  {
    getName = (item) => item?.name,
    getId = (item) => item?._id || item?.id,
    excludeId,
    maxSuggestions = 5,
  } = {},
) {
  return useMemo(() => {
    const list = Array.isArray(items) ? items : []
    const candidates = excludeId ? list.filter((item) => getId(item) !== excludeId) : list

    const normalizedQuery = normalize(query)
    if (!normalizedQuery) {
      return { suggestions: [], duplicate: null }
    }

    const duplicate =
      candidates.find((item) => normalize(getName(item)) === normalizedQuery) || null

    const startsWith = []
    const includes = []
    candidates.forEach((item) => {
      const name = normalize(getName(item))
      if (!name || name === normalizedQuery) return
      if (name.startsWith(normalizedQuery)) startsWith.push(item)
      else if (name.includes(normalizedQuery)) includes.push(item)
    })

    return { suggestions: [...startsWith, ...includes].slice(0, maxSuggestions), duplicate }
  }, [items, query, excludeId, getName, getId, maxSuggestions])
}
