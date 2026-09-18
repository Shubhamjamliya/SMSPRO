/** Pure minute-range math shared by availability CRUD validation and slot calculation.
 *  All ranges are half-open [start, end) in minutes-since-midnight. */

export const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

export const isRangeWithin = (innerStart, innerEnd, outerStart, outerEnd) =>
  innerStart >= outerStart && innerEnd <= outerEnd;

/** Subtracts `cuts` (breaks/unavailable windows) from a single [start,end) window,
 *  returning the remaining open sub-windows in order. */
export const subtractRanges = (start, end, cuts = []) => {
  let open = [{ start, end }];
  for (const cut of cuts) {
    const next = [];
    for (const w of open) {
      if (!rangesOverlap(w.start, w.end, cut.start, cut.end)) {
        next.push(w);
        continue;
      }
      if (cut.start > w.start) next.push({ start: w.start, end: Math.min(cut.start, w.end) });
      if (cut.end < w.end) next.push({ start: Math.max(cut.end, w.start), end: w.end });
    }
    open = next;
  }
  return open.filter((w) => w.end > w.start);
};
