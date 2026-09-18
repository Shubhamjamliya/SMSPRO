import { useMemo, Suspense } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { MapPin, ChevronDown } from "lucide-react"
import PageNavbar from "@food/components/user/PageNavbar"
import BannerSection from "@food/components/user/home/BannerSection"
import { HeroBannerSkeleton } from "@food/components/ui/loading-skeletons"
import { useLocationSelector } from "@food/components/user/UserLayout"
import { useLocation } from "@food/hooks/useLocation"
import * as imgUtils from "@food/utils/imageUtils"
import { API_BASE_URL } from "@food/api/config"

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "")
const RUPEE_SYMBOL = "\u20B9"

const isMeaningfulLocationValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase()
  return Boolean(
    normalized &&
    normalized !== "select location" &&
    normalized !== "current location"
  )
}

/** Same address title/subtitle rules as HomeHeader on `/food/user`. */
const buildLocationDisplay = (savedAddressText, location) => {
  if (isMeaningfulLocationValue(savedAddressText)) {
    const parts = String(savedAddressText)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)

    if (parts.length >= 3) {
      return {
        title: parts.slice(0, 2).join(", "),
        subtitle: parts.slice(2).join(", "),
      }
    }

    if (parts.length === 2) {
      return {
        title: parts.join(", "),
        subtitle: "Tap to choose delivery location",
      }
    }

    return {
      title: String(savedAddressText).trim(),
      subtitle: "Tap to choose delivery location",
    }
  }

  return {
    title: location?.area || location?.city || "Select Location",
    subtitle: location?.address || location?.city || "Tap to choose delivery location",
  }
}

export default function Under250Banner({
  banners = [],
  bannerImages = [],
  loadingBanner,
  currentBannerIndex,
  setCurrentBannerIndex,
  bannerShellRef,
}) {
  const navigate = useNavigate()
  const { location } = useLocation()
  const { openLocationSelector } = useLocationSelector()

  const savedAddressText = useMemo(
    () => imgUtils.formatSavedAddress(location),
    [location],
  )
  const { title: locationTitle, subtitle: locationSubtitle } = useMemo(
    () => buildLocationDisplay(savedAddressText, location),
    [savedAddressText, location],
  )

  const slides = Array.isArray(banners) && banners.length > 0
    ? banners
    : (bannerImages || []).map((imageUrl) => ({ imageUrl }))

  const showBanner = loadingBanner || slides.length > 0

  return (
    <>
      {/* Sticky header in document flow — same single-address pattern as Home (no overlay) */}
      <div className="sticky top-0 z-40 w-full bg-white/90 dark:bg-[#08080a]/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-900 md:hidden">
        <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5">
          <button
            type="button"
            onClick={openLocationSelector}
            className="flex items-center gap-2 cursor-pointer bg-transparent border-0 p-0 text-left outline-none shrink min-w-0"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0 bg-[#FF6A00]/15">
              <MapPin className="h-4 w-4 shrink-0 text-[#FF6A00]" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-0.5">
                <span className="font-extrabold text-sm truncate max-w-[150px] text-gray-900 dark:text-white">
                  {locationTitle}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70 text-gray-900 dark:text-white" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] truncate max-w-[170px] mt-0.5 text-gray-500 dark:text-gray-400">
                {locationSubtitle}
              </span>
            </div>
          </button>

          <PageNavbar
            textColor="dark"
            zIndex={20}
            showProfile={false}
            showLogo={false}
            showLocation={false}
            onNavClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {/* Hero banner — starts below header; Home BannerSection rendering */}
      <div className="max-w-7xl mx-auto w-full min-w-0 overflow-hidden px-4 sm:px-6 lg:px-8 pt-4 pb-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative w-full min-w-0 h-[220px] sm:h-[260px] md:h-[300px] rounded-3xl overflow-hidden shadow-[0_12px_40px_-12px_rgba(255,106,0,0.25)] border border-orange-100/50 dark:border-gray-800/50 bg-neutral-900"
        >
          {showBanner ? (
            <Suspense fallback={<HeroBannerSkeleton className="h-full w-full" />}>
              <BannerSection
                showBannerSkeleton={loadingBanner}
                heroBannerImages={bannerImages}
                heroBannersData={slides}
                currentBannerIndex={currentBannerIndex}
                setCurrentBannerIndex={setCurrentBannerIndex}
                heroShellRef={bannerShellRef}
                navigate={navigate}
                backendOrigin={BACKEND_ORIGIN}
                hideOverlay={false}
              />
            </Suspense>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF6A00] via-[#E85D04] to-[#C84B00] flex flex-col justify-end p-5 sm:p-6">
              <div>
                <span className="inline-block bg-white/20 text-white text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md mb-2 w-fit">
                  Best deals
                </span>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white leading-tight tracking-tight">
                  Under {RUPEE_SYMBOL}250
                </h1>
                <p className="text-white/80 text-xs sm:text-sm font-medium mt-1">
                  Delicious meals that won&apos;t break the bank
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </>
  )
}
