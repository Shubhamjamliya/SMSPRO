import { ArrowLeft } from "lucide-react";
import { cn } from "@food/utils/utils";

/**
 * Canonical page wrapper for admin Add/Edit forms. White header card with
 * optional back button + icon badge + title/description, actions slot on
 * the right (e.g. a Save button, or a step indicator).
 */
export default function FormPageShell({
  title,
  description,
  icon,
  iconClassName,
  onBack,
  actions,
  children,
  className,
}) {
  return (
    <div className={cn("min-h-screen bg-slate-50 p-4 lg:p-6", className)}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              {icon && (
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white", iconClassName)}>
                  {icon}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
              </div>
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
        </div>

        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}
