import { memo } from "react"
import { ChevronRight, MapPin, Phone } from "lucide-react"

function CartAddressCard({
  addressTypeLabel = "Home",
  addressLine = "",
  recipientName = "",
  recipientPhone = "",
  hasAddress = false,
  isCurrentLocation = false,
  isLoadingLocation = false,
  showPicker = false,
  onTogglePicker,
  onChangeAddress,
  pickerContent = null,
  contactEditor = null,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-[#151515]">
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fff3eb] dark:bg-[#FF6A00]/10">
          <MapPin className="h-4 w-4 text-[#FF6A00]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold text-gray-950 dark:text-white">
                  Deliver to {addressTypeLabel}
                </span>
                {isCurrentLocation ? (
                  <span className="rounded-full border border-[#FF6A00]/30 bg-[#fff3eb] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[#FF6A00]">
                    GPS
                  </span>
                ) : null}
              </div>

              {isLoadingLocation ? (
                <p className="mt-0.5 animate-pulse text-xs text-gray-500">Finding your address...</p>
              ) : (
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-500 dark:text-gray-400">
                  {addressLine || (hasAddress ? "Address details" : "Add a delivery address")}
                </p>
              )}

              {!hasAddress ? (
                <p className="mt-1 text-[11px] font-semibold text-[#FF6A00]">
                  Select a delivery location to continue
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onChangeAddress || onTogglePicker}
              className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#FF6A00] hover:bg-[#fff3eb] dark:hover:bg-[#FF6A00]/10"
            >
              Change
            </button>
          </div>

          {(recipientName || recipientPhone) && hasAddress ? (
            <div className="mt-2 flex items-center gap-1.5 border-t border-dashed border-gray-100 pt-2 dark:border-white/10">
              <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <p className="min-w-0 truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {recipientName || "Recipient"}
                </span>
                {recipientPhone ? (
                  <>
                    <span className="mx-1 text-gray-300">·</span>
                    <span>{recipientPhone}</span>
                  </>
                ) : null}
              </p>
              <button
                type="button"
                onClick={onTogglePicker}
                className="ml-auto inline-flex shrink-0 items-center text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-[#FF6A00]"
              >
                Edit <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showPicker ? (
        <div className="border-t border-gray-100 px-3.5 py-3 dark:border-white/10">
          {pickerContent}
          {contactEditor}
        </div>
      ) : null}
    </div>
  )
}

export default memo(CartAddressCard)
