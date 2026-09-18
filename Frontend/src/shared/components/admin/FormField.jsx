import { cn } from "@food/utils/utils";

export const formInputClass =
  "w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

/**
 * Canonical label + control wrapper for admin Add/Edit forms. Pass any
 * input/select/textarea/custom control as children; this only standardizes
 * the label, required marker, helper/error text, and spacing.
 */
export default function FormField({
  label,
  htmlFor,
  required = false,
  error,
  helperText,
  className,
  span,
  children,
}) {
  return (
    <div className={cn(span === "full" && "md:col-span-2", className)}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : helperText ? (
        <p className="mt-1.5 text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}
