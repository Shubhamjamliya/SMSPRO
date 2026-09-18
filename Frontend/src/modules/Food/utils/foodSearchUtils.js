/**
 * Shared Food user search helpers (Home, Dining, overlay, results).
 * Prefer client-side filtering when a list is already loaded; use
 * debounced unified API search for cross-catalog (restaurants + dishes).
 */

/** Trim + collapse internal whitespace; lowercased for comparisons. */
export function normalizeSearchQuery(query) {
  return String(query || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

/** Display/API form: trimmed + collapsed whitespace (preserves case). */
export function sanitizeSearchQuery(query) {
  return String(query || "")
    .trim()
    .replace(/\s+/g, " ")
}

export function tokenizeSearchQuery(query) {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return []
  return normalized.split(" ").filter(Boolean)
}

const toSearchableText = (value) => {
  if (value == null) return ""
  if (Array.isArray(value)) {
    return value
      .map((entry) => toSearchableText(entry))
      .filter(Boolean)
      .join(" ")
  }
  if (typeof value === "object") {
    return toSearchableText(
      value.name ||
        value.title ||
        value.label ||
        value.slug ||
        value.categoryName ||
        "",
    )
  }
  return String(value).trim()
}

/**
 * Collect text fields from a restaurant-like object for client-side match.
 */
export function collectRestaurantSearchText(restaurant) {
  if (!restaurant || typeof restaurant !== "object") return ""
  const parts = [
    restaurant.name,
    restaurant.restaurantName,
    restaurant.cuisine,
    restaurant.cuisines,
    restaurant.featuredDish,
    restaurant.diningType,
    restaurant.tags,
    restaurant.categories,
    restaurant.category,
    restaurant.categoryName,
    restaurant.offer,
    restaurant.description,
  ]
  return parts
    .map(toSearchableText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
}

/**
 * Case-insensitive partial match. Empty query matches everything.
 * Multi-word: every token must appear somewhere in the haystack.
 */
export function textMatchesQuery(haystack, query) {
  const q = normalizeSearchQuery(query)
  if (!q) return true
  const text = String(haystack || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
  if (!text) return false
  if (text.includes(q)) return true
  const tokens = tokenizeSearchQuery(q)
  return tokens.length > 0 && tokens.every((token) => text.includes(token))
}

export function restaurantMatchesSearch(restaurant, query) {
  return textMatchesQuery(collectRestaurantSearchText(restaurant), query)
}

/**
 * Filter restaurants client-side. No network. Stable order preserved.
 */
export function filterRestaurantsBySearch(restaurants, query) {
  const list = Array.isArray(restaurants) ? restaurants : []
  const q = normalizeSearchQuery(query)
  if (!q) return list
  return list.filter((restaurant) => restaurantMatchesSearch(restaurant, q))
}

/**
 * Map unified search API rows into overlay suggestion chips.
 */
export function mapUnifiedSearchToSuggestions(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  return list.map((r, index) => {
    const isDish = r?.matchType === "food"
    const getImageUrl = (value) => {
      if (!value) return ""
      if (typeof value === "string") return value
      if (typeof value === "object") {
        return (
          value.url ||
          value.secure_url ||
          value.imageUrl ||
          value.image ||
          value.src ||
          ""
        )
      }
      return ""
    }

    const restaurantId = String(r._id || r.id || r.restaurantId || "")
    return {
      id: isDish
        ? String(r.matchedDishId || `dish-${index}`)
        : restaurantId || `rest-${index}`,
      restaurantId,
      name: isDish
        ? String(r.matchedDish || r.restaurantName || r.name || "").trim()
        : String(r.restaurantName || r.name || "").trim(),
      subtitle: isDish
        ? String(r.restaurantName || r.name || "").trim() || null
        : Array.isArray(r.cuisines) && r.cuisines.length
          ? r.cuisines.slice(0, 2).join(", ")
          : (typeof r.cuisine === "string" ? r.cuisine : null),
      image: getImageUrl(
        isDish
          ? r.matchedDishImage || r.profileImage || r.image
          : (Array.isArray(r.coverImages) && r.coverImages[0]) ||
              r.profileImage ||
              r.image,
      ),
      type: isDish ? "dish" : "restaurant",
      slug: r.slug || restaurantId || "",
      matchType: r.matchType || (isDish ? "food" : "restaurant"),
    }
  }).filter((item) => item.name)
}

/** Convert a loaded restaurant object into an overlay suggestion chip. */
export function restaurantToSuggestion(restaurant, index = 0) {
  if (!restaurant) return null
  const name = String(restaurant.restaurantName || restaurant.name || "").trim()
  if (!name) return null
  const restaurantId = String(
    restaurant._id || restaurant.id || restaurant.mongoId || restaurant.restaurantId || "",
  )
  const cover =
    restaurant.image ||
    (Array.isArray(restaurant.coverImages) &&
      (restaurant.coverImages[0]?.url || restaurant.coverImages[0])) ||
    restaurant.profileImage?.url ||
    restaurant.profileImage ||
    ""
  const cuisine =
    typeof restaurant.cuisine === "string"
      ? restaurant.cuisine
      : Array.isArray(restaurant.cuisines)
        ? restaurant.cuisines.slice(0, 2).join(", ")
        : ""

  return {
    id: restaurantId || `rest-${index}`,
    restaurantId,
    name,
    subtitle: cuisine || null,
    image: typeof cover === "string" ? cover : "",
    type: "restaurant",
    slug: restaurant.slug || restaurantId || "",
    matchType: "restaurant",
  }
}

/** Merge suggestion lists; dishes first, then restaurants; de-dupe by id+type. */
export function mergeSearchSuggestions(...lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const item of list || []) {
      if (!item?.name) continue
      const key = `${item.type || "item"}:${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }
  return out
}
