import { Loader2 } from "lucide-react";
import { cn } from "@food/utils/utils";

/**
 * Canonical Cancel + primary action button bar for admin Add/Edit forms.
 * Use `sticky` for a footer that pins to the bottom of the modal/page.
 */
export default function FormActions({
  onCancel,
  cancelLabel = "Cancel",
  submitLabel = "Save",
  submitting = false,
  submitDisabled = false,
  submitType = "submit",
  onSubmit,
  sticky = false,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-end",
        sticky && "sticky bottom-0 -mx-6 -mb-6 border-t border-slate-200 bg-white px-6 py-4",
        className,
      )}
    >
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="w-full rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {cancelLabel}
        </button>
      )}
      <button
        type={submitType}
        onClick={onSubmit}
        disabled={submitting || submitDisabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}
