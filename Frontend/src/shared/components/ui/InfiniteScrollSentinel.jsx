import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom-of-list trigger for infinite scroll. Fires onIntersect a bit
 * before the user reaches the literal last item (rootMargin), so the next
 * page is loading by the time they arrive.
 */
export default function InfiniteScrollSentinel({
  onIntersect,
  hasMore,
  loading = false,
  total,
  loadedCount,
  className,
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!hasMore) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onIntersect?.();
      },
      { root: null, rootMargin: "400px 0px", threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onIntersect]);

  if (!hasMore) {
    if (!total) return null;
    return (
      <p className={cn("py-4 text-center text-xs font-medium text-muted-foreground", className)}>
        You've reached the end • showing {loadedCount ?? total} of {total}
      </p>
    );
  }

  return (
    <div ref={sentinelRef} className={cn("flex items-center justify-center gap-2 py-4", className)}>
      {loading && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Loading more…</span>
        </>
      )}
    </div>
  );
}
