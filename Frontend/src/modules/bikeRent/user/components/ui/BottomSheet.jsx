import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[600] flex items-end justify-center">
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={cn(
              "relative z-10 w-full max-w-lg rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl md:max-w-xl",
              className,
            )}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" />
            {title ? (
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-extrabold text-gray-900">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
