import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Clock3,
  HandCoins,
  Headphones,
  ShieldAlert,
  Timer,
  Wallet,
} from "lucide-react";
import { FormField, EmptyState, TableSkeleton } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import VendorLayout from "../components/VendorLayout";
import { bikeVendorApi } from "../services/vendorApi";
import { BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS } from "../../admin/utils/adminTheme";

const SECTIONS = [
  {
    id: "booking",
    label: "Booking",
    title: "Booking rules",
    blurb: "Rental length limits for bikes from your fleet.",
    icon: Timer,
    keys: ["minBookingDurationHours", "maxBookingDurationHours"],
  },
  {
    id: "cancellation",
    label: "Cancel",
    title: "Cancellation",
    blurb: "Free cancel window and charge after that window.",
    icon: HandCoins,
    keys: [
      "freeCancelBeforePickupMinutes",
      "cancellationChargeType",
      "cancellationChargePercent",
      "cancellationChargeFixed",
    ],
  },
  {
    id: "noShow",
    label: "No-show",
    title: "Customer no-show",
    blurb: "What happens if the rider never picks up the bike.",
    icon: ShieldAlert,
    keys: [
      "noShowPolicyEnabled",
      "noShowGraceMinutes",
      "noShowRefundRule",
      "noShowRefundMode",
      "noShowRefundPercent",
      "noShowRefundFixed",
      "noShowPenaltyAmount",
    ],
  },
  {
    id: "lateReturn",
    label: "Late return",
    title: "Late return charges",
    blurb: "Extra fee when the bike comes back after end time.",
    icon: Clock3,
    keys: ["lateFeePerHour", "lateReturnGraceMinutes", "lateReturnMaxCharge"],
  },
  {
    id: "deposit",
    label: "Deposit",
    title: "Security deposit",
    blurb: "How the deposit is paid and when it returns to wallet.",
    icon: Wallet,
    keys: ["depositRefundHours"],
  },
  {
    id: "support",
    label: "Support",
    title: "Customer support",
    blurb: "Phone, email, and out-of-service message shown to your customers.",
    icon: Headphones,
    keys: ["supportPhone", "supportEmail", "outOfServiceMessage"],
  },
];

const NUMBER_KEYS = [
  "minBookingDurationHours",
  "maxBookingDurationHours",
  "freeCancelBeforePickupMinutes",
  "cancellationChargePercent",
  "cancellationChargeFixed",
  "noShowGraceMinutes",
  "noShowRefundPercent",
  "noShowRefundFixed",
  "noShowPenaltyAmount",
  "lateFeePerHour",
  "lateReturnGraceMinutes",
  "depositRefundHours",
];

const ALL_KEYS = SECTIONS.flatMap((s) => s.keys);

const message = (error, fallback) => error?.response?.data?.message || fallback;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

function toFormValue(value) {
  return value == null ? "" : String(value);
}

function stringifySettings(values) {
  const next = {};
  ALL_KEYS.forEach((key) => {
    next[key] = toFormValue(values?.[key]);
  });
  next.noShowPolicyEnabled = Boolean(values?.noShowPolicyEnabled);
  return next;
}

function computeNoShowPreview({
  securityDeposit,
  refundRule,
  refundMode,
  refundPercent,
  refundFixed,
  penaltyAmount,
}) {
  const deposit = Math.max(0, Number(securityDeposit) || 0);
  const legacyPenalty = Math.min(deposit, Math.max(0, Number(penaltyAmount) || 0));
  const afterPenalty = Math.max(0, deposit - legacyPenalty);

  let deduction = 0;
  if (refundRule === "none") {
    deduction = afterPenalty;
  } else if (refundRule === "partial") {
    deduction =
      refundMode === "fixed"
        ? Math.min(afterPenalty, Math.max(0, Number(refundFixed) || 0))
        : (afterPenalty * Math.max(0, Math.min(100, Number(refundPercent) || 0))) / 100;
  }
  const walletCredit = Math.max(0, afterPenalty - deduction);
  return {
    securityDeposit: deposit,
    deductionAmount: Math.round((deduction + legacyPenalty) * 100) / 100,
    walletCreditAmount: Math.round(walletCredit * 100) / 100,
  };
}

function Chip({ active, children, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        active
          ? "border-[var(--just-order-primary)] bg-[var(--just-order-primary-light)] text-[var(--just-order-primary)]"
          : "border-border bg-white text-muted-foreground hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({ checked, onChange, title, hint, disabled }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--just-order-primary)]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="just-order-body block font-medium">{title}</span>
        {hint ? <span className="just-order-muted mt-0.5 block text-xs">{hint}</span> : null}
      </span>
    </label>
  );
}

function PreviewStat({ label, value, emphasize = false }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${emphasize ? "text-[var(--just-order-success)]" : "just-order-body"}`}>
        {value}
      </p>
    </div>
  );
}

function sectionForErrorKey(key) {
  const found = SECTIONS.find((section) => section.keys.includes(key));
  return found?.id || "booking";
}

export default function VendorSettings() {
  const [form, setForm] = useState(null);
  const [platformDefaults, setPlatformDefaults] = useState(null);
  const [customized, setCustomized] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [previewDeposit, setPreviewDeposit] = useState("2000");
  const [activeTab, setActiveTab] = useState("booking");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bikeVendorApi.getSettings();
      setForm(stringifySettings(data.effective));
      setPlatformDefaults(data.platformDefaults || {});
      const nextCustomized = {};
      SECTIONS.forEach((section) => {
        nextCustomized[section.id] = section.keys.some(
          (key) => data.overrides?.[key] !== undefined && data.overrides?.[key] !== null,
        );
      });
      setCustomized(nextCustomized);
    } catch (error) {
      toast.error(message(error, "Failed to load settings"));
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const toggleCustomize = (sectionId, on) => {
    setCustomized((current) => ({ ...current, [sectionId]: on }));
    if (!on && platformDefaults) {
      const section = SECTIONS.find((s) => s.id === sectionId);
      setForm((current) => {
        const next = { ...current };
        section.keys.forEach((key) => {
          next[key] =
            key === "noShowPolicyEnabled"
              ? Boolean(platformDefaults[key])
              : toFormValue(platformDefaults[key]);
        });
        return next;
      });
      setErrors((current) => {
        const next = { ...current };
        section.keys.forEach((key) => delete next[key]);
        return next;
      });
    }
  };

  const noShowPreview = useMemo(() => {
    if (!form) return null;
    return computeNoShowPreview({
      securityDeposit: previewDeposit,
      refundRule: form.noShowRefundRule || "full",
      refundMode: form.noShowRefundMode || "percent",
      refundPercent: form.noShowRefundPercent,
      refundFixed: form.noShowRefundFixed,
      penaltyAmount: form.noShowPenaltyAmount,
    });
  }, [
    previewDeposit,
    form?.noShowRefundRule,
    form?.noShowRefundMode,
    form?.noShowRefundPercent,
    form?.noShowRefundFixed,
    form?.noShowPenaltyAmount,
  ]);

  const tabErrorCounts = useMemo(() => {
    const counts = {};
    SECTIONS.forEach((section) => {
      counts[section.id] = section.keys.filter((key) => errors[key]).length;
    });
    return counts;
  }, [errors]);

  const activeMeta = SECTIONS.find((section) => section.id === activeTab) || SECTIONS[0];
  const ActiveIcon = activeMeta.icon;
  const activeCustomized = Boolean(customized[activeTab]);

  const save = async (event) => {
    event?.preventDefault?.();
    const next = {};
    SECTIONS.forEach((section) => {
      if (!customized[section.id]) return;
      section.keys.forEach((key) => {
        if (!NUMBER_KEYS.includes(key)) return;
        if (key === "lateReturnMaxCharge") return;
        if (form[key] === "" || Number(form[key]) < 0) {
          next[key] = "Enter a valid number (0 or more)";
        }
      });
    });
    if (customized.lateReturn) {
      if (
        form.lateReturnMaxCharge !== ""
        && (Number.isNaN(Number(form.lateReturnMaxCharge)) || Number(form.lateReturnMaxCharge) < 0)
      ) {
        next.lateReturnMaxCharge = "Enter an amount, or leave blank for no limit";
      }
    }
    if (customized.booking) {
      if (Number(form.minBookingDurationHours) < 1) {
        next.minBookingDurationHours = "Must be at least 1 hour";
      }
      if (Number(form.maxBookingDurationHours) < 1) {
        next.maxBookingDurationHours = "Must be at least 1 hour";
      }
      if (Number(form.maxBookingDurationHours) < Number(form.minBookingDurationHours)) {
        next.maxBookingDurationHours = "Must be equal to or more than the minimum";
      }
    }
    if (customized.support && form.supportEmail && !/^\S+@\S+\.\S+$/.test(form.supportEmail)) {
      next.supportEmail = "Enter a valid email";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error("Please fix the highlighted fields");
      setActiveTab(sectionForErrorKey(Object.keys(next)[0]));
      return;
    }

    setSaving(true);
    try {
      const payload = {};
      SECTIONS.forEach((section) => {
        if (!customized[section.id]) return;
        section.keys.forEach((key) => {
          if (key === "noShowPolicyEnabled") {
            payload[key] = Boolean(form[key]);
          } else if (key === "lateReturnMaxCharge") {
            payload[key] = form[key] === "" ? null : Number(form[key]);
          } else if (NUMBER_KEYS.includes(key)) {
            payload[key] = Number(form[key]);
          } else {
            payload[key] = form[key];
          }
        });
      });
      const saved = await bikeVendorApi.updateSettings(payload);
      setForm(stringifySettings(saved.effective));
      setPlatformDefaults(saved.platformDefaults || {});
      toast.success("Settings saved");
    } catch (error) {
      toast.error(message(error, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  const numberField = (label, key, hint, { min = "0", placeholder } = {}) => (
    <FormField label={label} error={errors[key]} hint={errors[key] ? undefined : hint} className="min-w-0">
      <Input
        type="number"
        min={min}
        placeholder={placeholder}
        value={form[key]}
        disabled={saving || !activeCustomized}
        onChange={(event) => set(key, event.target.value)}
      />
    </FormField>
  );

  const selectField = (label, key, options, hint) => (
    <FormField label={label} hint={hint} className="min-w-0">
      <select
        className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
        value={form[key]}
        disabled={saving || !activeCustomized}
        onChange={(event) => set(key, event.target.value)}
      >
        {options}
      </select>
    </FormField>
  );

  const renderPanel = () => {
    switch (activeTab) {
      case "booking":
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {numberField(
              "Shortest rental (hours)",
              "minBookingDurationHours",
              "Customers cannot book less than this from your bikes.",
              { min: "1" },
            )}
            {numberField(
              "Longest rental (hours)",
              "maxBookingDurationHours",
              "Customers cannot book more than this from your bikes.",
              { min: "1" },
            )}
          </div>
        );

      case "cancellation":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-xs text-[#B45309]">
              Security deposit is always returned to the customer wallet on cancel before pickup.
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {numberField(
                "Free cancel window (minutes before pickup)",
                "freeCancelBeforePickupMinutes",
                "Example: 60 = free cancel until 1 hour before pickup.",
              )}
              {selectField(
                "Charge type after free window",
                "cancellationChargeType",
                <>
                  <option value="percent">Percent of rental fee</option>
                  <option value="fixed">Fixed amount (₹)</option>
                </>,
                "Used only when a customer cancels after the free window.",
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.cancellationChargeType === "fixed"
                ? numberField("Cancel charge (₹)", "cancellationChargeFixed", "Example: ₹200")
                : numberField(
                  "Cancel charge (%)",
                  "cancellationChargePercent",
                  "Example: 10 = 10% of rental fee",
                )}
            </div>
          </div>
        );

      case "noShow":
        return (
          <div className="space-y-4">
            <ToggleRow
              checked={Boolean(form.noShowPolicyEnabled)}
              disabled={saving || !activeCustomized}
              onChange={(checked) => set("noShowPolicyEnabled", checked)}
              title="Turn on automatic no-show"
              hint="System waits for the grace time, then marks the booking as No-show."
            />

            <div className={`space-y-4 ${form.noShowPolicyEnabled ? "" : "pointer-events-none opacity-50"}`}>
              <FormField
                label="Wait time after pickup (minutes)"
                error={errors.noShowGraceMinutes}
                hint={errors.noShowGraceMinutes ? undefined : "Example: pickup at 12:00 + 30 min → rider must arrive by 12:30."}
                className="min-w-0"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {[15, 30, 45, 60].map((mins) => (
                      <Chip
                        key={mins}
                        active={Number(form.noShowGraceMinutes) === mins}
                        disabled={saving || !activeCustomized || !form.noShowPolicyEnabled}
                        onClick={() => set("noShowGraceMinutes", String(mins))}
                      >
                        {mins} min
                      </Chip>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={form.noShowGraceMinutes}
                    disabled={saving || !activeCustomized || !form.noShowPolicyEnabled}
                    onChange={(event) => set("noShowGraceMinutes", event.target.value)}
                  />
                </div>
              </FormField>

              {selectField(
                "What happens to the security deposit?",
                "noShowRefundRule",
                <>
                  <option value="full">Return full deposit to wallet</option>
                  <option value="partial">Keep some, return the rest</option>
                  <option value="none">Keep full deposit (no refund)</option>
                </>,
                "Money returned goes to the customer's wallet.",
              )}

              {form.noShowRefundRule === "partial" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {selectField(
                    "How much to keep?",
                    "noShowRefundMode",
                    <>
                      <option value="percent">Percent of deposit</option>
                      <option value="fixed">Fixed amount (₹)</option>
                    </>,
                  )}
                  {form.noShowRefundMode === "fixed"
                    ? numberField(
                      "Amount to keep (₹)",
                      "noShowRefundFixed",
                      "Example: keep ₹500, return the rest",
                    )
                    : numberField(
                      "Percent to keep (%)",
                      "noShowRefundPercent",
                      "Example: 20 = keep 20%, return 80%",
                    )}
                </div>
              ) : null}

              <div className="just-order-card p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="just-order-body text-sm font-semibold">Quick preview</p>
                    <p className="just-order-muted text-xs">
                      See what the customer gets back for a sample deposit.
                    </p>
                  </div>
                  <div className="w-full sm:w-36">
                    <FormField label="Sample deposit (₹)">
                      <Input
                        type="number"
                        min="0"
                        value={previewDeposit}
                        disabled={saving || !activeCustomized || !form.noShowPolicyEnabled}
                        onChange={(event) => setPreviewDeposit(event.target.value)}
                      />
                    </FormField>
                  </div>
                </div>

                {noShowPreview ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <PreviewStat label="Deposit" value={money(noShowPreview.securityDeposit)} />
                    <PreviewStat label="You keep" value={money(noShowPreview.deductionAmount)} />
                    <PreviewStat
                      label="Back to wallet"
                      value={money(noShowPreview.walletCreditAmount)}
                      emphasize
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );

      case "lateReturn":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {numberField(
                "Extra charge per hour (₹)",
                "lateFeePerHour",
                "Example: ₹100 for every extra hour (or part of an hour).",
              )}
              {numberField(
                "Free late minutes",
                "lateReturnGraceMinutes",
                "Example: 15 = first 15 minutes late are free.",
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                label="Maximum late charge (₹)"
                error={errors.lateReturnMaxCharge}
                hint={errors.lateReturnMaxCharge ? undefined : "Optional. Leave empty if there is no maximum."}
                className="min-w-0"
              >
                <Input
                  type="number"
                  min="0"
                  value={form.lateReturnMaxCharge}
                  disabled={saving || !activeCustomized}
                  placeholder="No limit"
                  onChange={(event) => set("lateReturnMaxCharge", event.target.value)}
                />
              </FormField>
            </div>
          </div>
        );

      case "deposit":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              The security deposit is always collected online, bundled with the rest of the
              booking payment before reservation. Cash/pay-at-pickup collection is no longer
              available for new bookings. Deposit amount is set on each bike.
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {numberField(
                "Auto refund after return (hours)",
                "depositRefundHours",
                "After inspection, wait this long then credit the refundable deposit to wallet. Example: 24",
              )}
            </div>
          </div>
        );

      case "support":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Support phone" className="min-w-0">
                <Input
                  value={form.supportPhone}
                  disabled={saving || !activeCustomized}
                  placeholder="e.g. 9876543210"
                  onChange={(event) => set("supportPhone", event.target.value)}
                />
              </FormField>
              <FormField label="Support email" error={errors.supportEmail} className="min-w-0">
                <Input
                  type="email"
                  value={form.supportEmail}
                  disabled={saving || !activeCustomized}
                  placeholder="e.g. support@example.com"
                  onChange={(event) => set("supportEmail", event.target.value)}
                />
              </FormField>
            </div>
            <FormField
              label="Out of service message"
              hint="Shown to customers when your bikes are temporarily unavailable."
              className="min-w-0"
            >
              <Input
                value={form.outOfServiceMessage}
                disabled={saving || !activeCustomized}
                placeholder="We are temporarily unavailable. Please try again later."
                onChange={(event) => set("outOfServiceMessage", event.target.value)}
              />
            </FormField>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <VendorLayout
      title="Settings"
      subtitle="Booking, cancellation, no-show, late return, deposit, and support rules for your business"
    >
      {loading ? (
        <TableSkeleton rows={6} columns={2} />
      ) : !form ? (
        <EmptyState
          title="Could not load settings"
          description="Check your connection and try again."
          action={<Button onClick={load}>Retry</Button>}
        />
      ) : (
        <form onSubmit={save} className="space-y-4 pb-24 md:pb-4">
          <div className="just-order-card px-3 py-2.5 text-xs text-muted-foreground">
            Any rule you don&apos;t customize automatically follows the platform default. If a specific bike
            has its own override, that always wins.
          </div>

          {/* Mobile tabs */}
          <div className="just-order-card p-2 md:hidden">
            <div className="grid grid-cols-3 gap-1.5">
              {SECTIONS.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                const errorCount = tabErrorCounts[id] || 0;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`relative flex flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-center transition-colors ${
                      active
                        ? "bg-[var(--just-order-primary)] text-white"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="text-[10px] font-semibold leading-tight">{label}</span>
                    {customized[id] ? (
                      <span
                        className={`absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full ${
                          active ? "bg-white" : "bg-[var(--just-order-success)]"
                        }`}
                      />
                    ) : null}
                    {errorCount > 0 ? (
                      <span
                        className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                          active ? "bg-white text-[var(--just-order-primary)]" : "bg-red-500 text-white"
                        }`}
                      >
                        {errorCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
            {/* Desktop sidebar tabs */}
            <aside className="hidden md:block">
              <div className="just-order-card sticky top-4 space-y-1 p-2">
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Sections
                </p>
                {SECTIONS.map(({ id, label, title, icon: Icon }) => {
                  const active = activeTab === id;
                  const errorCount = tabErrorCounts[id] || 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                        active ? "bg-[var(--just-order-primary)] text-white shadow-sm" : "just-order-body hover:bg-muted/50"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          active ? "bg-white/20" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{label}</span>
                        <span className={`block truncate text-[11px] ${active ? "text-white/80" : "text-muted-foreground"}`}>
                          {title}
                        </span>
                      </span>
                      {customized[id] ? (
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            active ? "bg-white" : "bg-[var(--just-order-success)]"
                          }`}
                          title="Customized"
                        />
                      ) : null}
                      {errorCount > 0 ? (
                        <span
                          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                            active ? "bg-white text-[var(--just-order-primary)]" : "bg-red-500 text-white"
                          }`}
                        >
                          {errorCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Active panel */}
            <div className="just-order-card min-w-0">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--just-order-primary-light)] text-[var(--just-order-primary)]">
                    <ActiveIcon size={18} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="just-order-section-title">{activeMeta.title}</h2>
                    <p className="just-order-section-subtitle mt-0.5">{activeMeta.blurb}</p>
                  </div>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground sm:self-auto">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[var(--just-order-primary)]"
                    checked={activeCustomized}
                    disabled={saving}
                    onChange={(event) => toggleCustomize(activeTab, event.target.checked)}
                  />
                  Customize for my business
                </label>
              </div>

              {!activeCustomized ? (
                <div className="mx-4 mt-4 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground sm:mx-5">
                  Following the platform default. Turn on &quot;Customize for my business&quot; to set your own
                  values for this section.
                </div>
              ) : null}

              <div className="space-y-4 p-4 sm:p-5">{renderPanel()}</div>

              <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || activeTab === SECTIONS[0].id}
                    onClick={() => {
                      const index = SECTIONS.findIndex((s) => s.id === activeTab);
                      if (index > 0) setActiveTab(SECTIONS[index - 1].id);
                    }}
                    className="flex-1 sm:flex-none"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || activeTab === SECTIONS[SECTIONS.length - 1].id}
                    onClick={() => {
                      const index = SECTIONS.findIndex((s) => s.id === activeTab);
                      if (index < SECTIONS.length - 1) setActiveTab(SECTIONS[index + 1].id);
                    }}
                    className="flex-1 sm:flex-none"
                  >
                    Next
                  </Button>
                </div>
                <div className="hidden gap-2 md:flex">
                  <Button type="button" variant="outline" disabled={saving} onClick={load}>
                    Reset
                  </Button>
                  <Button type="submit" isLoading={saving}>
                    {saving ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky mobile save bar */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 p-3 backdrop-blur md:hidden">
            <div className="mx-auto flex max-w-6xl gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={load} className="flex-1">
                Reset
              </Button>
              <Button type="submit" isLoading={saving} className="flex-[1.4]">
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </VendorLayout>
  );
}
