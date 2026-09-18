import { cn } from "@food/utils/utils";

/**
 * Canonical white card wrapper for a section within an admin Add/Edit form.
 */
export default function FormSection({ title, description, actions, children, className, bodyClassName }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-6 shadow-sm", className)}>
      {(title || description || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", bodyClassName)}>{children}</div>
    </div>
  );
}
