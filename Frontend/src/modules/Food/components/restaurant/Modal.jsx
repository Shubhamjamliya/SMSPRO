import { useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

/**
 * Unified centered modal for the restaurant panel.
 *
 * - Always centered on screen (mobile + desktop).
 * - Width auto-optimizes to content via the `size` prop, never exceeding
 *   the viewport. Height grows with content and scrolls internally once it
 *   would overflow the screen (`max-h-[90vh]`).
 * - Flutter WebView safe: no negative margins, fixed overlay only.
 * - Closes on backdrop click + Escape (unless `dismissible={false}`).
 *
 * Usage:
 *   <Modal open={open} onClose={() => setOpen(false)} title="Edit item">
 *     ...body...
 *     <ModalFooter>
 *       <button>Cancel</button>
 *       <button>Save</button>
 *     </ModalFooter>
 *   </Modal>
 */

const SIZE_CLASSES = {
  xs: "max-w-xs",
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
}

export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  iconClassName = "",
  children,
  footer,
  size = "md",
  dismissible = true,
  showClose = true,
  className = "",
  bodyClassName = "",
}) {
  const handleClose = useCallback(() => {
    if (dismissible && onClose) onClose()
  }, [dismissible, onClose])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === "Escape") handleClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, handleClose])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [open])

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />

          {/* Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`relative w-full ${sizeClass} max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 shadow-2xl overflow-hidden ${className}`}
          >
            {/* Header */}
            {(title || showClose) && (
              <div className="flex items-start gap-3 px-5 pt-5 pb-3 flex-shrink-0">
                {Icon && (
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#FF6A00]/10 ${iconClassName}`}>
                    <Icon className="w-5 h-5 text-[#FF6A00]" strokeWidth={2} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {description}
                    </p>
                  )}
                </div>
                {showClose && (
                  <button
                    onClick={handleClose}
                    className="w-8 h-8 -mr-1.5 -mt-1 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" strokeWidth={2} />
                  </button>
                )}
              </div>
            )}

            {/* Body — scrolls when content overflows */}
            <div className={`flex-1 overflow-y-auto px-5 ${(title || showClose) ? "" : "pt-5"} ${footer ? "" : "pb-5"} ${bodyClassName}`}>
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** Convenience footer row — buttons laid out right-aligned, full-width on mobile. */
export function ModalFooter({ children, className = "" }) {
  return (
    <div className={`flex gap-3 ${className}`}>
      {children}
    </div>
  )
}

export default Modal
