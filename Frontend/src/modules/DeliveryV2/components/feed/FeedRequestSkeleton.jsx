export function FeedRequestSkeleton({ count = 2 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-slate-200 bg-white p-3.5 animate-pulse"
        >
          <div className="flex justify-between gap-3 mb-3">
            <div className="flex gap-2">
              <div className="h-5 w-14 rounded-full bg-slate-200" />
              <div className="h-5 w-12 rounded-full bg-slate-100" />
            </div>
            <div className="h-7 w-16 rounded-lg bg-emerald-100" />
          </div>
          <div className="space-y-2 mb-3">
            <div className="h-3 w-[75%] rounded bg-slate-200" />
            <div className="h-3 w-full rounded bg-slate-100" />
            <div className="h-3 w-[66%] rounded bg-slate-200" />
            <div className="h-3 w-[83%] rounded bg-slate-100" />
          </div>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="h-10 rounded-lg bg-slate-100" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-11 rounded-xl bg-slate-100" />
            <div className="h-11 rounded-xl bg-slate-100" />
            <div className="h-11 rounded-xl bg-orange-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
