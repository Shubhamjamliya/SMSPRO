import { useMemo } from "react";
import { cn } from "@/lib/utils";

function pct(startMs, endMs, rangeStart, rangeEnd) {
  const span = Math.max(1, rangeEnd - rangeStart);
  const left = ((startMs - rangeStart) / span) * 100;
  const width = ((endMs - startMs) / span) * 100;
  return {
    left: `${Math.max(0, Math.min(100, left))}%`,
    width: `${Math.max(0.5, Math.min(100 - Math.max(0, left), width))}%`,
  };
}

/**
 * Compact horizontal timeline of busy bookings + buffer padding.
 */
export default function AvailabilityTimeline({
  from,
  to,
  busy = [],
  className,
  height = "h-10",
}) {
  const range = useMemo(() => {
    const start = new Date(from || Date.now()).getTime();
    const end = new Date(to || start + 7 * 86400000).getTime();
    return { start, end };
  }, [from, to]);

  const blocks = useMemo(() => {
    return (busy || []).map((item, index) => {
      const bookingStart = new Date(item.startAt).getTime();
      const bookingEnd = new Date(item.endAt).getTime();
      const bufferStart = new Date(item.bufferStartAt || item.startAt).getTime();
      const bufferEnd = new Date(item.bufferEndAt || item.endAt).getTime();
      return {
        key: item.bookingId || index,
        booking: pct(bookingStart, bookingEnd, range.start, range.end),
        bufferBefore: bufferStart < bookingStart
          ? pct(bufferStart, bookingStart, range.start, range.end)
          : null,
        bufferAfter: bufferEnd > bookingEnd
          ? pct(bookingEnd, bufferEnd, range.start, range.end)
          : null,
        label: item.bookingNumber || "Booked",
      };
    });
  }, [busy, range]);

  if (!blocks.length) {
    return (
      <div className={cn("rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2", className)}>
        <p className="text-[11px] font-semibold text-emerald-800">Open for the selected period</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className={cn("relative overflow-hidden rounded-xl bg-gray-100", height)}>
        {blocks.map((block) => (
          <div key={block.key} className="absolute inset-y-1">
            {block.bufferBefore ? (
              <div
                className="absolute inset-y-0 rounded-sm bg-amber-200/70"
                style={block.bufferBefore}
                title="Buffer"
              />
            ) : null}
            {block.bufferAfter ? (
              <div
                className="absolute inset-y-0 rounded-sm bg-amber-200/70"
                style={block.bufferAfter}
                title="Buffer"
              />
            ) : null}
            <div
              className="absolute inset-y-0 rounded-md bg-[#FF6A00]/85"
              style={block.booking}
              title={block.label}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
        <span>{new Date(range.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#FF6A00]" /> Booked
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-amber-200" /> Buffer
          </span>
        </span>
        <span>{new Date(range.end).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>
    </div>
  );
}
