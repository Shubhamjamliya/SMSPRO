import { AlertTriangle, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"

/**
 * Production confirmation when cart already has another restaurant's items.
 */
export default function ReplaceCartConfirmModal({
  open,
  onOpenChange,
  currentRestaurantName = "another restaurant",
  newRestaurantName = "this restaurant",
  loading = false,
  onConfirm,
  onCancel,
}) {
  const handleOpenChange = (next) => {
    if (loading) return
    onOpenChange?.(next)
    if (!next) onCancel?.()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!loading}
        className="max-w-[min(100%-1.5rem,24rem)] gap-0 overflow-hidden p-0 sm:rounded-2xl"
        onEscapeKeyDown={(e) => {
          if (loading) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (loading) e.preventDefault()
        }}
      >
        <DialogHeader className="space-y-3 px-5 pb-2 pt-5 text-left sm:px-6 sm:pt-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
          </div>
          <DialogTitle className="text-lg font-bold tracking-tight text-gray-950 dark:text-white">
            Replace Cart Items?
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            Your cart currently contains items from{" "}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {currentRestaurantName || "another restaurant"}
            </span>
            .
            <br />
            <span className="mt-2 block">
              Would you like to clear your existing cart and add items from{" "}
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {newRestaurantName || "this restaurant"}
              </span>{" "}
              instead?
            </span>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4 sm:flex-col sm:space-x-0 dark:border-white/10 dark:bg-white/5 sm:px-6">
          <Button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="h-11 w-full rounded-xl bg-[#FF6A00] text-sm font-bold text-white hover:bg-[#e85d04] disabled:opacity-70"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Replacing...
              </span>
            ) : (
              "Replace Cart"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => handleOpenChange(false)}
            className="h-11 w-full rounded-xl border-gray-200 text-sm font-semibold dark:border-white/15"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
