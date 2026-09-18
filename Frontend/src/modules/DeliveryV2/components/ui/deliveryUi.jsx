import { Loader2 } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { cn } from "@food/utils/utils"

export function DeliveryPage({ children, className, padded = true }) {
  return (
    <div className={cn("min-h-screen bg-slate-50 flex flex-col", padded && "px-4 py-5", className)}>
      {children}
    </div>
  )
}

export function DeliveryPageHeader({ title, subtitle, onBack, action }) {
  return (
    <header className="sticky top-0 z-30 mb-4 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center gap-3 px-4 py-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-1 rounded-full hover:bg-slate-100 text-slate-700"
          aria-label="Go back"
        >
          ←
        </button>
      ) : null}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold text-slate-900 truncate">{title}</h1>
        {subtitle ? <p className="text-xs text-slate-500 truncate">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  )
}

export function DeliveryCard({ children, className }) {
  return (
    <div className={cn("delivery-card rounded-2xl p-4 sm:p-5 space-y-4", className)}>
      {children}
    </div>
  )
}

export function DeliverySectionTitle({ children }) {
  return <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{children}</h2>
}

export function DeliveryField({
  label,
  required,
  error,
  helper,
  children,
  htmlFor,
}) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <Label htmlFor={htmlFor} className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          {label}
          {required ? <span className="text-red-500 ml-0.5">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? <p className="text-xs font-medium text-red-500">{error}</p> : null}
      {!error && helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </div>
  )
}

export function DeliveryPhoneInput({
  id = "delivery-phone",
  countryCode = "+91",
  value,
  onChange,
  onKeyDown,
  error,
  inputRef,
}) {
  return (
    <DeliveryField label="Mobile number" required error={error} htmlFor={id}>
      <div
        className={cn(
          "delivery-input flex items-center gap-3 h-12 rounded-xl border bg-white px-3 transition-all",
          error ? "border-red-400" : "border-slate-200"
        )}
      >
        <span className="text-sm font-semibold text-slate-500 shrink-0">{countryCode}</span>
        <div className="w-px h-5 bg-slate-200 shrink-0" />
        <Input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="numeric"
          maxLength={10}
          autoComplete="tel-national"
          placeholder="10-digit number"
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          className="border-0 shadow-none h-10 px-0 focus-visible:ring-0 bg-transparent text-base font-semibold"
        />
      </div>
    </DeliveryField>
  )
}

export function DeliveryPrimaryButton({
  children,
  loading,
  disabled,
  className,
  type = "button",
  onClick,
}) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "w-full h-12 rounded-xl text-sm font-semibold bg-primary-orange hover:bg-primary-orange/90 text-white shadow-md shadow-orange-500/20",
        className
      )}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Please wait…
        </>
      ) : (
        children
      )}
    </Button>
  )
}

export function DeliverySecondaryButton({ children, className, ...props }) {
  return (
    <Button
      variant="outline"
      className={cn("w-full h-11 rounded-xl text-sm font-semibold border-slate-200", className)}
      {...props}
    >
      {children}
    </Button>
  )
}

export function DeliveryStepper({ step, steps = ["Details", "Documents", "Done"] }) {
  return (
    <div className="flex items-center gap-1 mb-6 delivery-animate-in">
      {steps.map((label, idx) => {
        const n = idx + 1
        const active = step >= n
        const done = step > n
        return (
          <div key={label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                  active ? "bg-primary-orange text-white" : "bg-slate-200 text-slate-500"
                )}
              >
                {done ? "✓" : n}
              </div>
              <span
                className={cn(
                  "text-[10px] mt-1 truncate max-w-full",
                  active ? "text-primary-orange font-semibold" : "text-slate-400"
                )}
              >
                {label}
              </span>
            </div>
            {idx < steps.length - 1 ? (
              <div className={cn("h-0.5 w-full max-w-[32px] mb-4", step > n ? "bg-primary-orange" : "bg-slate-200")} />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function DeliveryAuthHeader({ logoUrl, companyName, title, subtitle }) {
  return (
    <div className="delivery-animate-in mb-8">
      {logoUrl ? (
        <img src={logoUrl} alt={companyName} className="h-11 w-auto object-contain mb-5" />
      ) : (
        <div className="h-11 w-11 rounded-xl bg-primary-orange flex items-center justify-center text-white font-bold mb-5">
          {companyName?.charAt(0) || "D"}
        </div>
      )}
      <h1 className="text-2xl font-bold text-slate-900 leading-tight">{title}</h1>
      {subtitle ? <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p> : null}
    </div>
  )
}

export function DeliveryEmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      {Icon ? (
        <div className="w-14 h-14 rounded-2xl bg-orange-50 text-primary-orange flex items-center justify-center mb-4">
          <Icon className="w-7 h-7" />
        </div>
      ) : null}
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      {description ? <p className="text-sm text-slate-500 mt-2 max-w-xs">{description}</p> : null}
      {action ? <div className="mt-5 w-full max-w-xs">{action}</div> : null}
    </div>
  )
}

export function DeliveryStickyFooter({ children, keyboardInset = 0 }) {
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 lg:max-w-[430px] lg:left-1/2 lg:-translate-x-1/2"
      style={{ paddingBottom: keyboardInset ? keyboardInset + 12 : undefined }}
    >
      {children}
    </div>
  )
}
