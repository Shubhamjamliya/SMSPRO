import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import constructionApi from "../services/api";

const AUTOPLAY_MS = 5000;
const SWIPE_PX = 40;

/**
 * Where a tap may go. The server already refuses anything else when a banner is
 * saved; this repeats the check because a banner is followed by every customer and
 * the cost of being wrong is a phishing link in the app.
 */
const safeTarget = (link) => {
  const value = String(link || "").trim();
  if (!value) return null;
  if (value.startsWith("/")) {
    return value.startsWith("//") || /[\\\s]/.test(value) ? null : { kind: "internal", value };
  }
  return /^https?:\/\//i.test(value) ? { kind: "external", value } : null;
};

/**
 * The banner carousel at the top of the construction home screen. The banners are
 * managed in the admin panel (Catalogue → Banners). With none live it renders
 * nothing at all, so the screen simply starts a little higher.
 */
export default function BannerCarousel() {
  const navigate = useNavigate();
  const [banners, setBanners] = useState([]);
  const [failed, setFailed] = useState(() => new Set());
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .getBanners()
      // Decoration, not content: a failure is not worth a toast, the space just stays empty.
      .then((rows) => {
        if (!cancelled) setBanners(rows || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // A banner whose picture will not load would show as a blank slide, so it is skipped.
  const slides = banners.filter((b) => !failed.has(b._id));
  const count = slides.length;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;

  const go = (next) => setIndex(((next % count) + count) % count);

  const open = (banner) => {
    const target = safeTarget(banner.link);
    if (!target) return;
    if (target.kind === "internal") navigate(target.value);
    else window.open(target.value, "_blank", "noopener,noreferrer");
  };

  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) >= SWIPE_PX) go(index + (delta < 0 ? 1 : -1));
  };

  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-slate-200 shadow-md"
      aria-roledescription="carousel"
      aria-label="Offers and announcements"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        onTouchEnd(e);
        setPaused(false);
      }}
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((banner, i) => {
          const tappable = Boolean(safeTarget(banner.link));
          const Wrapper = tappable ? "button" : "div";
          return (
            <Wrapper
              key={banner._id}
              {...(tappable ? { type: "button", onClick: () => open(banner) } : {})}
              className={`relative block aspect-[12/5] w-full shrink-0 overflow-hidden text-left ${
                tappable ? "cursor-pointer" : ""
              }`}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}${banner.title ? `: ${banner.title}` : ""}`}
              aria-hidden={i !== index}
              tabIndex={i === index ? 0 : -1}
            >
              <img
                src={banner.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
                onError={() => setFailed((prev) => new Set(prev).add(banner._id))}
              />
              {banner.title || banner.subtitle ? (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent px-4 pb-4 pt-10 sm:px-6 sm:pb-5">
                  {banner.title ? (
                    <h3 className="text-base font-black leading-tight text-white drop-shadow sm:text-xl">
                      {banner.title}
                    </h3>
                  ) : null}
                  {banner.subtitle ? (
                    <p className="mt-0.5 text-xs font-medium text-slate-200 sm:text-sm">{banner.subtitle}</p>
                  ) : null}
                </div>
              ) : null}
            </Wrapper>
          );
        })}
      </div>

      {count > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {slides.map((banner, i) => (
            <button
              key={banner._id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show banner ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
