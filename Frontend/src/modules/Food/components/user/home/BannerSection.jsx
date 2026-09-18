import React, { memo } from "react";
import { motion } from "framer-motion";
import { HeroBannerSkeleton } from "@food/components/ui/loading-skeletons";
import OptimizedImage from "@food/components/OptimizedImage";

const TextReveal = ({ text, isActive, delay = 0 }) => (
  <motion.span
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 6 }}
    transition={{ duration: 0.35, delay: isActive ? delay : 0, ease: "easeOut" }}
    className="inline-block"
  >
    {text}
  </motion.span>
);

const isVideoSource = (bannerData, image) => {
  if (bannerData?.type === "video") return true;
  const src = String(image || "").toLowerCase();
  return /\.(mp4|webm|mov)(\?|$)/i.test(src) || src.includes("/video/");
};

const BannerSection = memo(({
  showBannerSkeleton,
  heroBannerImages,
  heroBannersData = [],
  currentBannerIndex,
  setCurrentBannerIndex,
  heroShellRef,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  navigate,
  backendOrigin = "",
  hideOverlay = false,
}) => {
  if (showBannerSkeleton) {
    return (
      <div className="h-full w-full">
        <HeroBannerSkeleton className="h-full w-full" />
      </div>
    );
  }

  // Prefer full banner objects so title/subtitle/cta stay aligned with each image.
  const slides = (Array.isArray(heroBannersData) && heroBannersData.length > 0
    ? heroBannersData
    : (heroBannerImages || []).map((imageUrl) => ({ imageUrl }))
  ).filter((slide) => Boolean(slide?.imageUrl));

  if (!slides.length) return null;

  const handleBannerClick = () => {
    const bannerData = slides[currentBannerIndex] || {};
    if (bannerData?.type === "video" || isVideoSource(bannerData, bannerData.imageUrl)) {
      return;
    }

    const ctaLink = typeof bannerData?.ctaLink === "string" ? bannerData.ctaLink.trim() : "";
    if (ctaLink) {
      if (/^https?:\/\//i.test(ctaLink)) {
        window.open(ctaLink, "_blank", "noopener,noreferrer");
      } else {
        navigate(ctaLink.startsWith("/") ? ctaLink : `/${ctaLink}`);
      }
      return;
    }

    const linkedRestaurants = bannerData?.linkedRestaurants || [];
    if (linkedRestaurants.length > 0) {
      const firstRestaurant = linkedRestaurants[0];
      const restaurantSlug = firstRestaurant.slug || firstRestaurant.restaurantId || firstRestaurant._id;
      if (restaurantSlug) {
        navigate(`/food/user/restaurants/${restaurantSlug}`);
      }
    }
  };

  return (
    <div className="h-full w-full">
      <div
        ref={heroShellRef}
        data-home-hero-shell="true"
        className="relative w-full h-full overflow-hidden bg-transparent"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
            <motion.div
              animate={{ x: ["-200%", "200%"] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                repeatDelay: 5,
                ease: "easeInOut",
              }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg] w-[150%] h-full"
            />
          </div>

          {slides.map((bannerData, index) => {
            const image = bannerData.imageUrl || heroBannerImages[index] || "";
            const isVideo = isVideoSource(bannerData, image);
            const isActive = currentBannerIndex === index;
            const title = bannerData.title || "";
            const subtitle = bannerData.subtitle || "";
            const description = bannerData.description || "";
            const action = bannerData.action || bannerData.ctaText || "";
            const showFallbackCopy = Boolean(bannerData.isFallback);
            const showTitle = Boolean(title || showFallbackCopy);
            const showSubtitle = Boolean(subtitle || description || showFallbackCopy);
            const showAction = Boolean(action || showFallbackCopy);
            const showOverlay = !hideOverlay && !isVideo && (showTitle || showSubtitle || showAction);

            return (
              <div
                key={`${bannerData._id || index}-${image}`}
                className="absolute inset-0 transition-opacity duration-700 ease-in-out"
                style={{
                  opacity: isActive ? 1 : 0,
                  zIndex: isActive ? 2 : 1,
                  pointerEvents: "none",
                }}
              >
                {isVideo ? (
                  <video
                    src={image}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                    style={{ filter: "brightness(0.95)" }}
                  />
                ) : (
                  <OptimizedImage
                    src={image}
                    alt={subtitle || title || `Hero Banner ${index + 1}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    priority={index === currentBannerIndex}
                    backendOrigin={backendOrigin}
                    draggable={false}
                  />
                )}

                {showOverlay && (
                  <div className="absolute inset-0 z-10 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent" />
                    <div className="relative z-10 h-full w-full flex items-center px-4 sm:px-6 lg:px-10">
                      <div className="flex flex-col justify-center h-full text-white w-[85%] sm:w-[70%] max-w-xl">
                        {showTitle && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] sm:text-xs md:text-sm font-bold italic tracking-wider text-orange-200 uppercase">
                              <TextReveal text={title || "A SIX IS HIT! 🏏"} isActive={isActive} delay={0.1} />
                            </span>
                          </div>
                        )}
                        {showSubtitle && (
                          <h3 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-[1.1] mb-2 sm:mb-3 text-white uppercase italic drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
                            <TextReveal
                              text={subtitle || description || "66% OFF FOR 10 MIN!"}
                              isActive={isActive}
                              delay={0.35}
                            />
                          </h3>
                        )}
                        {description && subtitle && (
                          <p className="hidden sm:block text-white/80 text-xs md:text-sm font-medium mb-3 line-clamp-2 max-w-md">
                            {description}
                          </p>
                        )}
                        {showAction && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={
                              isActive
                                ? { opacity: 1, scale: 1, y: [0, -4, 0, -2, 0] }
                                : { opacity: 0, scale: 0.8, y: 0 }
                            }
                            transition={{
                              opacity: { delay: 0.7, duration: 0.4 },
                              scale: { delay: 0.7, duration: 0.4, type: "spring" },
                              y: { delay: 1.4, duration: 1.2, ease: "easeInOut", repeat: Infinity, repeatDelay: 2.5 },
                            }}
                            className="w-fit"
                          >
                            <span className="bg-[#FF6A00] hover:bg-[#E85D04] shadow-[0_4px_12px_rgba(255,106,0,0.5)] inline-flex items-center gap-1 px-4 py-2 rounded-xl text-white text-sm font-bold">
                              {action || "Order Now"} <span className="font-bold tracking-tighter">&gt;&gt;</span>
                            </span>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="absolute inset-0 z-20 h-full w-full border-0 p-0 bg-transparent text-left"
          onClick={handleBannerClick}
          aria-label={`Open hero banner ${currentBannerIndex + 1}`}
        />

        {slides.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 px-2 py-1 z-30 pointer-events-none">
            {slides.map((_, index) => (
              <div
                key={index}
                className={`h-1 rounded-full transition-all duration-300 ${
                  currentBannerIndex === index ? "bg-white/80 w-4" : "bg-white/30 w-1"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default BannerSection;
