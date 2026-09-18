import { memo, useEffect, useMemo, useState } from "react"
import { Percent, Star } from "lucide-react"

/**
 * Stable offers teaser under the restaurant info card.
 * Fixed height + line-clamped crossfade so rotating offers never shift layout (CLS).
 */
function RestaurantOffersBanner({
  offers = [],
  offerText = "",
  rating = 4.5,
  reviews = 0,
  onOpen,
  loading = false,
}) {
  const slides = useMemo(() => {
    const raw = [
      "Upto 50% OFF",
      offerText,
      ...(Array.isArray(offers) ? offers.map((offer) => offer?.title || offer?.name || "") : []),
    ]
    const unique = []
    const seen = new Set()
    for (const value of raw) {
      const text = String(value || "").trim()
      if (!text) continue
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(text)
    }
    return unique.length ? unique : ["Special Offer"]
  }, [offers, offerText])

  const [activeIndex, setActiveIndex] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduceMotion(Boolean(media.matches))
    sync()
    media.addEventListener?.("change", sync)
    return () => media.removeEventListener?.("change", sync)
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [slides.length])

  useEffect(() => {
    if (slides.length <= 1 || loading) return undefined
    const interval = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length)
    }, 2800)
    return () => window.clearInterval(interval)
  }, [slides.length, loading])

  const safeIndex = slides.length ? activeIndex % slides.length : 0
  const dotCount = Math.min(slides.length, 4)

  if (loading) {
    return (
      <div
        className="h-[92px] w-full animate-pulse rounded-[24px] border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-[#1a1a1a]"
        aria-hidden
      >
        <div className="flex h-full items-center gap-4">
          <div className="h-12 w-12 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded-full bg-gray-100 dark:bg-gray-800" />
            <div className="h-3 w-1/3 rounded-full bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="View all offers"
      className="block w-full rounded-[24px] border border-gray-100 bg-white p-4 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-[box-shadow,transform] duration-200 hover:shadow-[0_10px_34px_rgb(0,0,0,0.06)] active:scale-[0.995] dark:border-gray-800 dark:bg-[#1a1a1a]"
    >
      {/* Fixed geometry — never grows with offer copy */}
      <div className="flex h-[60px] items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-orange-950/40">
            <Percent className="h-6 w-6 text-[#FF6A00]" aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            {/* Title stage: reserved 2-line box; slides crossfade inside */}
            <div className="relative h-10 overflow-hidden">
              {slides.map((text, index) => {
                const active = index === safeIndex
                return (
                  <h3
                    key={`${index}-${text}`}
                    className={`absolute inset-x-0 top-0 line-clamp-2 text-sm font-bold uppercase leading-5 tracking-tight text-gray-900 dark:text-white ${
                      reduceMotion
                        ? active
                          ? "opacity-100"
                          : "pointer-events-none opacity-0"
                        : `transition-[opacity,transform] duration-300 ease-out ${
                            active
                              ? "translate-y-0 opacity-100"
                              : "pointer-events-none translate-y-1 opacity-0"
                          }`
                    }`}
                    aria-hidden={!active}
                  >
                    {text}
                  </h3>
                )
              })}
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-gray-400">Tap to view all offers</p>
          </div>
        </div>

        <div className="flex shrink-0 scale-90 flex-col items-end gap-1 opacity-60 origin-right">
          <div className="flex items-center gap-1 rounded-lg bg-[#FF6A00] px-2 py-0.5 text-xs font-bold text-white">
            <Star className="h-3 w-3 fill-white" aria-hidden />
            <span>{rating || 4.5}</span>
          </div>
          <span className="whitespace-nowrap text-[10px] font-medium text-gray-400">
            {(Number(reviews) || 0).toLocaleString()}+ ratings
          </span>
        </div>
      </div>

      <div className="mt-3 flex h-1.5 items-center gap-1 px-1" aria-hidden>
        {Array.from({ length: Math.max(dotCount, 1) }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
              i === safeIndex % Math.max(dotCount, 1) ? "bg-[#FF6A00]" : "bg-gray-200 dark:bg-gray-700"
            }`}
          />
        ))}
      </div>
    </button>
  )
}

export default memo(RestaurantOffersBanner)
