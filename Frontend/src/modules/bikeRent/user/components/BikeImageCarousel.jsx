import { useCallback, useEffect, useRef, useState } from "react";
import { Bike, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

const AUTO_MS = 4000;
const SWIPE_THRESHOLD = 48;

/**
 * Bike image carousel with autoplay, arrows, dots, swipe, and lightbox.
 * Single-image bikes render a static hero (no slider chrome).
 */
export default function BikeImageCarousel({
  images = [],
  alt = "Bike",
  badge = null,
  className,
  onImageError,
}) {
  const urls = Array.isArray(images) ? images.filter(Boolean) : [];
  const multi = urls.length > 1;
  const imageKey = urls.join("|");
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);
  const touchStartX = useRef(null);
  const touchDeltaX = useRef(0);
  const hoveringRef = useRef(false);
  const interactionPauseUntil = useRef(0);
  const [autoplayToken, setAutoplayToken] = useState(0);

  const isAutoplayBlocked = useCallback(() => (
    hoveringRef.current
    || lightboxOpen
    || Date.now() < interactionPauseUntil.current
  ), [lightboxOpen]);

  useEffect(() => {
    setIndex(0);
    setFadeKey(0);
  }, [imageKey]);

  useEffect(() => {
    if (!urls.length) {
      setIndex(0);
      return;
    }
    if (index > urls.length - 1) setIndex(0);
  }, [urls.length, index]);

  const goTo = useCallback(
    (next, { fromUser = false } = {}) => {
      if (!urls.length) return;
      const wrapped = ((next % urls.length) + urls.length) % urls.length;
      setIndex(wrapped);
      setFadeKey((value) => value + 1);
      if (fromUser) {
        interactionPauseUntil.current = Date.now() + AUTO_MS;
        setAutoplayToken((value) => value + 1);
      }
    },
    [urls.length],
  );

  const goPrev = useCallback(() => goTo(index - 1, { fromUser: true }), [goTo, index]);
  const goNext = useCallback(() => goTo(index + 1, { fromUser: true }), [goTo, index]);

  useEffect(() => {
    if (!multi || lightboxOpen) return undefined;

    let timerId;
    const schedule = () => {
      window.clearTimeout(timerId);
      if (isAutoplayBlocked()) {
        timerId = window.setTimeout(schedule, 300);
        return;
      }
      timerId = window.setTimeout(() => {
        if (isAutoplayBlocked()) {
          schedule();
          return;
        }
        setIndex((current) => (current + 1) % urls.length);
        setFadeKey((value) => value + 1);
        schedule();
      }, AUTO_MS);
    };

    schedule();
    return () => window.clearTimeout(timerId);
  }, [multi, lightboxOpen, urls.length, isAutoplayBlocked, autoplayToken]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (!multi) return;
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxOpen, multi, goPrev, goNext]);

  const pauseForInteraction = () => {
    interactionPauseUntil.current = Date.now() + AUTO_MS;
    setAutoplayToken((value) => value + 1);
  };

  const onTouchStart = (event) => {
    if (!multi) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchDeltaX.current = 0;
    pauseForInteraction();
  };

  const onTouchMove = (event) => {
    if (touchStartX.current == null) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    touchDeltaX.current = touch.clientX - touchStartX.current;
  };

  const onTouchEnd = () => {
    if (touchStartX.current == null) return;
    const delta = touchDeltaX.current;
    touchStartX.current = null;
    touchDeltaX.current = 0;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  const current = urls[index] || urls[0];

  if (!urls.length) {
    return (
      <div
        className={cn(
          "relative aspect-[16/10] bg-gradient-to-br from-gray-50 to-orange-50/40",
          className,
        )}
      >
        <div className="grid h-full place-items-center text-gray-300">
          <div className="text-center">
            <Bike className="mx-auto h-10 w-10" />
            <p className="mt-1 text-[11px] font-semibold text-gray-400">No photo</p>
          </div>
        </div>
        {badge}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "group relative aspect-[16/10] touch-pan-y overflow-hidden bg-gradient-to-br from-gray-50 to-orange-50/40",
          className,
        )}
        onMouseEnter={() => {
          if (!multi) return;
          hoveringRef.current = true;
          setAutoplayToken((value) => value + 1);
        }}
        onMouseLeave={() => {
          if (!multi) return;
          hoveringRef.current = false;
          setAutoplayToken((value) => value + 1);
        }}
        onFocusCapture={() => {
          if (!multi) return;
          hoveringRef.current = true;
          setAutoplayToken((value) => value + 1);
        }}
        onBlurCapture={(event) => {
          if (!multi) return;
          if (!event.currentTarget.contains(event.relatedTarget)) {
            hoveringRef.current = false;
            setAutoplayToken((value) => value + 1);
          }
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          className="absolute inset-0 z-0 block h-full w-full cursor-zoom-in"
          onClick={() => setLightboxOpen(true)}
          aria-label="Open image preview"
        >
          <img
            key={`${current}-${fadeKey}`}
            src={current}
            alt={alt}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-500 ease-out",
              multi ? "animate-in fade-in duration-500" : "",
            )}
            draggable={false}
            onError={() => onImageError?.(current)}
          />
        </button>

        {badge}

        {multi ? (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={(event) => {
                event.stopPropagation();
                goPrev();
              }}
              className={cn(
                "absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center",
                "rounded-full border border-white/70 bg-black/35 text-white shadow-sm backdrop-blur-sm",
                "opacity-100 transition hover:bg-black/50 sm:opacity-0 sm:group-hover:opacity-100",
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={(event) => {
                event.stopPropagation();
                goNext();
              }}
              className={cn(
                "absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center",
                "rounded-full border border-white/70 bg-black/35 text-white shadow-sm backdrop-blur-sm",
                "opacity-100 transition hover:bg-black/50 sm:opacity-0 sm:group-hover:opacity-100",
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="pointer-events-none absolute bottom-2.5 left-0 right-0 z-10 flex justify-center gap-1.5">
              {urls.map((url, dotIndex) => (
                <button
                  key={`${url}-dot-${dotIndex}`}
                  type="button"
                  aria-label={`Go to image ${dotIndex + 1}`}
                  aria-current={dotIndex === index}
                  onClick={(event) => {
                    event.stopPropagation();
                    goTo(dotIndex, { fromUser: true });
                  }}
                  className={cn(
                    "pointer-events-auto h-1.5 rounded-full transition-all duration-300",
                    dotIndex === index
                      ? "w-4 bg-[#FF6A00]"
                      : "w-1.5 bg-white/80 hover:bg-white",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {lightboxOpen ? (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-black/92"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="flex items-center justify-between px-3 py-3 sm:px-5">
            <p className="text-xs font-semibold text-white/80">
              {multi ? `${index + 1} / ${urls.length}` : alt}
            </p>
            <button
              type="button"
              aria-label="Close preview"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-6 sm:px-10"
            onClick={(event) => event.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {multi ? (
              <button
                type="button"
                aria-label="Previous image"
                onClick={goPrev}
                className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}

            <img
              key={`lb-${current}-${fadeKey}`}
              src={current}
              alt={alt}
              className="max-h-full max-w-full rounded-lg object-contain animate-in fade-in duration-300"
              draggable={false}
              onError={() => onImageError?.(current)}
            />

            {multi ? (
              <button
                type="button"
                aria-label="Next image"
                onClick={goNext}
                className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : null}
          </div>

          {multi ? (
            <div className="flex justify-center gap-1.5 pb-5">
              {urls.map((url, dotIndex) => (
                <button
                  key={`${url}-lb-dot-${dotIndex}`}
                  type="button"
                  aria-label={`Preview image ${dotIndex + 1}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    goTo(dotIndex, { fromUser: true });
                  }}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    dotIndex === index ? "w-4 bg-[#FF6A00]" : "w-1.5 bg-white/50",
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
