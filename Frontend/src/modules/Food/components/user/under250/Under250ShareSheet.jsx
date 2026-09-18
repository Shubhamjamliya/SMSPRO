import { motion, AnimatePresence } from "framer-motion"

const SHARE_OPTIONS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "sms", label: "SMS" },
  { id: "email", label: "Email" },
  { id: "copy", label: "Copy Link" },
]

export default function Under250ShareSheet({ isOpen, onClose, onShareOption }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-[10020]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.2, type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-[10021] bg-white dark:bg-[#111] rounded-t-3xl shadow-2xl px-5 py-5"
          >
            <div className="flex justify-center pb-3">
              <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
            <div className="flex items-center justify-between pb-4">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Share dish</h3>
              <button type="button" onClick={onClose} className="text-sm font-bold text-gray-400">
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {SHARE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onShareOption(option.id)}
                  className="rounded-2xl border border-gray-200 dark:border-gray-800 px-4 py-3.5 text-sm font-bold text-gray-800 dark:text-gray-200 hover:border-[#FF6A00] hover:text-[#FF6A00] hover:bg-orange-50/50 dark:hover:bg-orange-950/10 transition-all"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
