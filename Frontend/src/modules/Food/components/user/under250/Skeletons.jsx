export function CategorySkeleton() {
  return (
    <div className="flex-shrink-0 flex flex-col items-center gap-2">
      <div className="shimmer-bg w-[70px] h-[70px] rounded-2xl bg-gray-100 dark:bg-gray-800" />
      <div className="h-3 w-12 rounded-md bg-gray-100 dark:bg-gray-800" />
    </div>
  )
}

export function DishCardSkeleton() {
  return (
    <div className="shimmer-bg w-full min-w-0 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="h-36 bg-gray-100 dark:bg-gray-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="flex justify-between items-center">
          <div className="h-5 w-12 rounded-lg bg-gray-100 dark:bg-gray-800" />
          <div className="h-8 w-16 rounded-xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    </div>
  )
}

export function RestaurantSectionSkeleton() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-5 w-40 rounded-lg bg-gray-100 dark:bg-gray-800 shimmer-bg" />
          <div className="h-3.5 w-24 rounded-md bg-gray-100 dark:bg-gray-800 shimmer-bg" />
        </div>
        <div className="h-7 w-14 rounded-lg bg-gray-100 dark:bg-gray-800 shimmer-bg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 w-full min-w-0">
        {[0, 1, 2, 3].map((i) => (
          <DishCardSkeleton key={i} />
        ))}
      </div>
    </section>
  )
}

export function ShimmerStyles() {
  return (
    <style>{`
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      .shimmer-bg {
        position: relative;
        overflow: hidden;
      }
      .shimmer-bg::after {
        position: absolute;
        top: 0; right: 0; bottom: 0; left: 0;
        transform: translateX(-100%);
        background-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%);
        content: '';
        animation: shimmer 2s infinite;
      }
      .dark .shimmer-bg::after {
        background-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0) 100%);
      }
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      .under250-page { overflow-x: clip; max-width: 100%; }
    `}</style>
  )
}
