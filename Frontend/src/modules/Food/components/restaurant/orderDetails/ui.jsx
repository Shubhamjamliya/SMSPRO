import { memo } from "react"
import { Copy, CheckCircle2, Circle, XCircle, Clock3 } from "lucide-react"
import { formatMoney } from "./normalizeRestaurantOrder"

export const SectionCard = memo(function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className = "",
}) {
  return (
    <section
      className={`rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-[#111] ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-gray-50 px-4 py-3 sm:px-5 dark:border-gray-800/80">
          <div className="min-w-0 flex items-start gap-2.5">
            {Icon ? (
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#FF6A00] dark:bg-orange-950/30">
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? (
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 text-[11px] text-gray-400">{subtitle}</p>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className="px-4 py-3.5 sm:px-5 sm:py-4">{children}</div>
    </section>
  )
})

export function MetaRow({ label, value, mono = false, emphasize = false }) {
  if (value == null || value === "") return null
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={`max-w-[65%] text-right text-xs sm:text-sm ${
          emphasize
            ? "font-extrabold text-gray-900 dark:text-white"
            : "font-semibold text-gray-800 dark:text-gray-200"
        } ${mono ? "font-mono" : ""} break-words`}
      >
        {value}
      </span>
    </div>
  )
}

export function MoneyRow({ label, value, muted = false, strong = false, negative = false }) {
  const amount = Number(value || 0)
  if (!strong && !amount && muted) return null
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={`text-xs sm:text-sm ${strong ? "font-bold text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
        {label}
      </span>
      <span
        className={`tabular-nums text-xs sm:text-sm ${
          strong
            ? "font-extrabold text-gray-900 dark:text-white"
            : negative || amount < 0
              ? "font-semibold text-emerald-600"
              : "font-semibold text-gray-800 dark:text-gray-200"
        }`}
      >
        {negative || amount < 0 ? `-${formatMoney(Math.abs(amount))}` : formatMoney(amount)}
      </span>
    </div>
  )
}

export function StatusPill({ label, className = "" }) {
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-lg border px-2.5 py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  )
}

export function CopyButton({ value, onCopied }) {
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(String(value || ""))
          onCopied?.()
        } catch {
          // ignore
        }
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
      aria-label="Copy"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  )
}

export function TimelineIcon({ state }) {
  if (state === "done" || state === "current") {
    return <CheckCircle2 className={`h-4.5 w-4.5 ${state === "current" ? "text-[#FF6A00]" : "text-emerald-500"}`} />
  }
  if (state === "skipped") {
    return <XCircle className="h-4.5 w-4.5 text-gray-300" />
  }
  return <Circle className="h-4.5 w-4.5 text-gray-300" />
}

export function EmptyBlock({ icon: Icon = Clock3, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-gray-400 dark:bg-gray-900">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{title}</p>
      {subtitle ? <p className="text-xs text-gray-400 max-w-xs">{subtitle}</p> : null}
    </div>
  )
}
