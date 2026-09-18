import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import TaxiBottomNav from "../layout/BottomNav";

export function TaxiPageShell({
  children,
  className,
  showBottomNav = false,
  maxWidth = "max-w-lg",
}) {
  return (
    <div
      className={cn(
        "min-h-screen bg-[#F7F7F8] text-gray-900",
        showBottomNav ? "pb-28" : "pb-8",
        className,
      )}
    >
      <div className={cn("mx-auto w-full", maxWidth)}>{children}</div>
      {showBottomNav ? <TaxiBottomNav /> : null}
    </div>
  );
}

export function TaxiPageHeader({
  title,
  subtitle,
  onBack,
  backTo,
  right,
  className,
}) {
  const navigate = useNavigate();
  const handleBack = () => {
    if (onBack) return onBack();
    if (backTo) return navigate(backTo);
    navigate(-1);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))]",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-extrabold text-gray-900">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-[11px] text-gray-500">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </header>
  );
}

export function SectionLabel({ children, className }) {
  return (
    <h2
      className={cn(
        "mb-2 px-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-400",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function ListTile({
  icon: Icon,
  title,
  subtitle,
  onClick,
  danger = false,
  right,
  className,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99] transition",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            danger
              ? "bg-red-50 text-red-600"
              : "bg-[#FF6A00]/10 text-[#FF6A00]",
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-bold",
            danger ? "text-red-600" : "text-gray-900",
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block text-[11px] text-gray-500">
            {subtitle}
          </span>
        ) : null}
      </span>
      {right ?? <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />}
    </button>
  );
}

export function PrimaryButton({
  children,
  variant = "primary",
  className,
  ...props
}) {
  const styles =
    variant === "primary"
      ? "bg-[#FF6A00] text-white shadow-sm shadow-[#FF6A00]/25"
      : variant === "danger"
        ? "bg-red-600 text-white"
        : variant === "outline"
          ? "border border-gray-200 bg-white text-gray-900"
          : "bg-gray-900 text-white";

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold active:scale-[0.99] disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-10 text-center">
      {Icon ? (
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00]">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <h3 className="mt-4 text-sm font-extrabold text-gray-900">{title}</h3>
      {subtitle ? (
        <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-gray-500">
          {subtitle}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
