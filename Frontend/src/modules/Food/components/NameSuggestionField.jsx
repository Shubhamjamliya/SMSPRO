import { useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import useNameSuggestions from "@food/hooks/useNameSuggestions"

/**
 * Text input with a type-ahead dropdown of existing names (categories, add-ons, ...)
 * and inline duplicate detection. Matching runs entirely against the `items` already
 * held in memory by the parent page, so it never triggers a network call.
 */
export default function NameSuggestionField({
  id,
  value,
  onChange,
  items,
  excludeId,
  getName = (item) => item?.name,
  entityLabel = "item",
  placeholder,
  inputClassName,
  required,
  autoFocus,
  maxLength,
  rightSlot,
  onDuplicateChange,
}) {
  const [isFocused, setIsFocused] = useState(false)
  const blurTimeoutRef = useRef(null)

  const { suggestions, duplicate } = useNameSuggestions(items, value, {
    getName,
    excludeId,
  })

  useEffect(() => {
    onDuplicateChange?.(Boolean(duplicate))
  }, [duplicate, onDuplicateChange])

  useEffect(() => () => window.clearTimeout(blurTimeoutRef.current), [])

  const showDropdown = isFocused && value?.trim() && suggestions.length > 0

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        required={required}
        autoFocus={autoFocus}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          window.clearTimeout(blurTimeoutRef.current)
          setIsFocused(true)
        }}
        onBlur={() => {
          blurTimeoutRef.current = window.setTimeout(() => setIsFocused(false), 120)
        }}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />

      {rightSlot}

      {showDropdown && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-[#1a1a1a]">
          {suggestions.map((item) => {
            const name = getName(item)
            const key = item?._id || item?.id || name
            return (
              <li key={key}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(name)
                    setIsFocused(false)
                  }}
                  className="block w-full truncate px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {name}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {duplicate && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          This {entityLabel} already exists
        </p>
      )}
    </div>
  )
}
