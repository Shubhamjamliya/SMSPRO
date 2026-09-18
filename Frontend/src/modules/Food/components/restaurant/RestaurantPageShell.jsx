import { ChevronLeft } from "lucide-react"

const MAX_WIDTH_CLASS = {
  sm: "max-w-lg",
  lg: "max-w-4xl",
  "2xl": "max-w-2xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  full: "max-w-none w-full",
}

/**
 * Shared page container for restaurant panel routes inside RestaurantLayout.
 * Do not use min-h-screen here — the layout owns viewport height and scroll.
 */
export default function RestaurantPageShell({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  actions,
  tabs,
  maxWidth = "6xl",
  flush = false,
  hideHeader = false,
  header,
  children,
  className = "",
  contentClassName = "",
  stickyHeader = true,
  ...rootProps
}) {
  const widthClass = MAX_WIDTH_CLASS[maxWidth] || MAX_WIDTH_CLASS["6xl"]
  const showDefaultHeader = !hideHeader && !header && (title || subtitle || onBack || actions)

  return (
    <div className={`w-full ${className}`} {...rootProps}>
      {header}

      {showDefaultHeader && (
        <div
          className={`${stickyHeader ? "sticky top-0 z-30" : ""} border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-[#111]/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur`}
        >
          <div className={`${widthClass} mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3`}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  aria-label={backLabel}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : null}
              <div className="min-w-0">
                {title ? (
                  <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                    {title}
                  </h1>
                ) : null}
                {subtitle ? (
                  <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {actions ? <div className="flex items-center gap-2 flex-shrink-0">{actions}</div> : null}
          </div>
          {tabs ? (
            <div className={`${widthClass} mx-auto px-4 sm:px-6 lg:px-8 pb-0`}>
              {tabs}
            </div>
          ) : null}
        </div>
      )}

      {flush ? (
        <div className={contentClassName}>{children}</div>
      ) : (
        <div className={`${widthClass} mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 ${contentClassName}`}>
          {children}
        </div>
      )}
    </div>
  )
}

export const RESTAURANT_CARD_CLASS =
  "rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#111]"
