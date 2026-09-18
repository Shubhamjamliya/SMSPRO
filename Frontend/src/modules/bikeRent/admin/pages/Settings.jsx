import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  FileCheck,
  HandCoins,
  Headphones,
  Plus,
  ShieldAlert,
  Timer,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  PageHeader,
  FormRow,
  FormField,
  EmptyState,
  TableSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import { BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS } from "../utils/adminTheme";

const EMPTY = {
  unpaidBookingTtlMinutes: "",
  pickupWindowMinutes: "",
  cancelFeePercentAfterReserve: "",
  freeCancelBeforePickupMinutes: "60",
  cancellationChargeType: "percent",
  cancellationChargePercent: "10",
  cancellationChargeFixed: "200",
  lateFeePerHour: "",
  lateReturnGraceMinutes: "",
  lateReturnMaxCharge: "",
  allowWeeklyPricing: false,
  depositRefundDays: "",
  depositRefundHours: "24",
  securityDepositPaymentMode: "both",
  noShowPolicyEnabled: true,
  noShowGraceMinutes: "30",
  noShowRefundRule: "full",
  noShowRefundMode: "percent",
  noShowRefundPercent: "20",
  noShowRefundFixed: "500",
  noShowPenaltyAmount: "0",
  minBookingDurationHours: "1",
  maxBookingDurationHours: "12",
  turnaroundBufferMinutes: "30",
  supportPhone: "",
  supportEmail: "",
  outOfServiceMessage: "",
  documentTypes: [],
};

const NUMBER_KEYS = [
  "unpaidBookingTtlMinutes",
  "cancelFeePercentAfterReserve",
  "freeCancelBeforePickupMinutes",
  "cancellationChargePercent",
  "cancellationChargeFixed",
  "lateFeePerHour",
  "lateReturnGraceMinutes",
  "depositRefundDays",
  "depositRefundHours",
  "noShowGraceMinutes",
  "noShowRefundPercent",
  "noShowRefundFixed",
  "noShowPenaltyAmount",
  "minBookingDurationHours",
  "maxBookingDurationHours",
  "turnaroundBufferMinutes",
];

const SECTIONS = [
  {
    id: "booking",
    label: "Booking",
    title: "Booking rules",
    blurb: "Rental length limits and unpaid booking timeout.",
    icon: Timer,
    keys: ["minBookingDurationHours", "maxBookingDurationHours", "turnaroundBufferMinutes", "unpaidBookingTtlMinutes"],
  },
  {
    id: "cancel",
    label: "Cancel",
    title: "Cancellation",
    blurb: "Free cancel window and charge after that window.",
    icon: HandCoins,
    keys: [
      "freeCancelBeforePickupMinutes",
      "cancellationChargePercent",
      "cancellationChargeFixed",
    ],
  },
  {
    id: "noshow",
    label: "No-show",
    title: "Customer no-show",
    blurb: "What happens if the rider never picks up the bike.",
    icon: ShieldAlert,
    keys: ["noShowGraceMinutes", "noShowRefundPercent", "noShowRefundFixed"],
  },
  {
    id: "late",
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
    blurb: "How deposit is paid and when it returns to wallet.",
    icon: Wallet,
    keys: ["depositRefundHours", "depositRefundDays"],
  },
  {
    id: "support",
    label: "Support",
    title: "Customer support",
    blurb: "Phone, email, and out-of-service message.",
    icon: Headphones,
    keys: ["supportEmail"],
  },
  {
    id: "documents",
    label: "Documents",
    title: "Required documents",
    blurb: "Document types vendors can require customers to carry at pickup.",
    icon: FileCheck,
    keys: [],
  },
];

const message = (error, fallback) => error?.response?.data?.message || fallback;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

function Chip({ active, children, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        active
          ? "border-[#FF6A00] bg-orange-50 text-[#FF6A00]"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({ checked, onChange, title, hint, disabled }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF6A00]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

function PreviewStat({ label, value, emphasize = false }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${emphasize ? "text-emerald-700" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function sectionForErrorKey(key) {
  const found = SECTIONS.find((section) => section.keys.includes(key));
  return found?.id || "booking";
}

export default function Settings() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [previewDeposit, setPreviewDeposit] = useState("2000");
  const [noShowPreview, setNoShowPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("booking");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await bikeRentAdminApi.getSettings();
      setForm({
        ...EMPTY,
        ...settings,
        lateReturnMaxCharge:
          settings.lateReturnMaxCharge == null ? "" : String(settings.lateReturnMaxCharge),
      });
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

  const addDocumentType = () => {
    setForm((current) => ({
      ...current,
      documentTypes: [...(current.documentTypes || []), { key: "", label: "", active: true }],
    }));
  };

  const updateDocumentType = (index, field, value) => {
    setForm((current) => {
      const next = [...(current.documentTypes || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...current, documentTypes: next };
    });
  };

  const removeDocumentType = (index) => {
    setForm((current) => ({
      ...current,
      documentTypes: (current.documentTypes || []).filter((_, i) => i !== index),
    }));
  };

  useEffect(() => {
    if (!form) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const preview = await bikeRentAdminApi.previewNoShowPolicy({
          securityDeposit: Number(previewDeposit) || 2000,
          noShowGraceMinutes: Number(form.noShowGraceMinutes) || 30,
          noShowRefundRule: form.noShowRefundRule || "full",
          noShowRefundMode: form.noShowRefundMode || "percent",
          noShowRefundPercent: Number(form.noShowRefundPercent) || 0,
          noShowRefundFixed: Number(form.noShowRefundFixed) || 0,
          noShowPenaltyAmount: Number(form.noShowPenaltyAmount) || 0,
        });
        if (!cancelled) setNoShowPreview(preview);
      } catch {
        if (!cancelled) setNoShowPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    previewDeposit,
    form?.noShowGraceMinutes,
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

  const save = async (event) => {
    event?.preventDefault?.();
    const next = {};
    NUMBER_KEYS.forEach((key) => {
      if (form[key] === "" || Number(form[key]) < 0) {
        next[key] = "Enter a valid number (0 or more)";
      }
    });
    if (
      form.lateReturnMaxCharge !== ""
      && (Number.isNaN(Number(form.lateReturnMaxCharge)) || Number(form.lateReturnMaxCharge) < 0)
    ) {
      next.lateReturnMaxCharge = "Enter an amount, or leave blank for no limit";
    }
    if (Number(form.minBookingDurationHours) < 1) {
      next.minBookingDurationHours = "Must be at least 1 hour";
    }
    if (Number(form.maxBookingDurationHours) < 1) {
      next.maxBookingDurationHours = "Must be at least 1 hour";
    }
    if (Number(form.maxBookingDurationHours) < Number(form.minBookingDurationHours)) {
      next.maxBookingDurationHours = "Must be equal to or more than the minimum";
    }
    if (form.supportEmail && !/^\S+@\S+\.\S+$/.test(form.supportEmail)) {
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
      const payload = { ...form };
      NUMBER_KEYS.forEach((key) => {
        payload[key] = Number(payload[key]);
      });
      payload.lateReturnMaxCharge =
        form.lateReturnMaxCharge === "" ? null : Number(form.lateReturnMaxCharge);
      payload.noShowPolicyEnabled = Boolean(form.noShowPolicyEnabled);
      payload.allowWeeklyPricing = Boolean(form.allowWeeklyPricing);
      // Single admin-facing field drives both the pickup-window (OTP verification) deadline
      // and the no-show refund-eligibility grace period — they were always meant to be the
      // same moment ("how long the rider has to show up"), just split across two DB fields.
      payload.pickupWindowMinutes = Math.max(5, Number(form.noShowGraceMinutes) || 5);
      payload.cancelFeePercentAfterReserve = Number(
        form.cancellationChargeType === "percent"
          ? form.cancellationChargePercent
          : form.cancelFeePercentAfterReserve || form.cancellationChargePercent || 0,
      );
      payload.documentTypes = (form.documentTypes || [])
        .filter((d) => d.label?.trim())
        .map((d) => ({ key: d.key || "", label: d.label.trim(), active: d.active !== false }));
      const saved = await bikeRentAdminApi.updateSettings(payload);
      setForm({
        ...EMPTY,
        ...saved,
        lateReturnMaxCharge:
          saved.lateReturnMaxCharge == null ? "" : String(saved.lateReturnMaxCharge),
      });
      toast.success("Settings saved");
    } catch (error) {
      toast.error(message(error, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  const numberField = (label, key, hint, { min = "0", placeholder } = {}) => (
    <FormField label={label} error={errors[key]} hint={hint} className="min-w-0">
      <Input
        className="h-9 text-sm"
        type="number"
        min={min}
        placeholder={placeholder}
        value={form[key]}
        disabled={saving}
        onChange={(event) => set(key, event.target.value)}
      />
    </FormField>
  );

  const selectField = (label, key, options, hint) => (
    <FormField label={label} hint={hint} className="min-w-0">
      <select
        className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
        value={form[key]}
        disabled={saving}
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
          <div className="space-y-4">
            <FormRow className="gap-3">
              {numberField(
                "Shortest rental (hours)",
                "minBookingDurationHours",
                "Customers cannot book less than this. Example: 1",
                { min: "1" },
              )}
              {numberField(
                "Longest rental (hours)",
                "maxBookingDurationHours",
                "Customers cannot book more than this. Example: 12",
                { min: "1" },
              )}
            </FormRow>
            <FormRow className="gap-3">
              {numberField(
                "Cancel unpaid booking after (minutes)",
                "unpaidBookingTtlMinutes",
                "If payment is not finished in this time, the booking is cancelled.",
              )}
              {numberField(
                "Turnaround buffer (minutes)",
                "turnaroundBufferMinutes",
                "Gap required between rentals on the same bike. Example: 30",
                { min: "0" },
              )}
            </FormRow>
            <FormRow className="gap-3">
              <FormField label="Weekly price option" className="min-w-0">
                <ToggleRow
                  checked={Boolean(form.allowWeeklyPricing)}
                  disabled={saving}
                  onChange={(checked) => set("allowWeeklyPricing", checked)}
                  title="Show weekly pricing"
                  hint="Turn on if you want customers to see a weekly rate."
                />
              </FormField>
            </FormRow>
          </div>
        );

      case "cancel":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900">
              Security deposit is always returned to the customer wallet on cancel before pickup.
            </div>
            <FormRow className="gap-3">
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
                "Used only when they cancel after the free window.",
              )}
            </FormRow>
            <FormRow className="gap-3">
              {form.cancellationChargeType === "fixed"
                ? numberField("Cancel charge (₹)", "cancellationChargeFixed", "Example: ₹200")
                : numberField(
                  "Cancel charge (%)",
                  "cancellationChargePercent",
                  "Example: 10 = 10% of rental fee",
                )}
            </FormRow>
          </div>
        );

      case "noshow":
        return (
          <div className="space-y-4">
            <ToggleRow
              checked={Boolean(form.noShowPolicyEnabled)}
              disabled={saving}
              onChange={(checked) => set("noShowPolicyEnabled", checked)}
              title="Turn on automatic no-show"
              hint="System waits for the grace time, then marks the booking as No-show."
            />

            <div className={`space-y-4 ${form.noShowPolicyEnabled ? "" : "pointer-events-none opacity-50"}`}>
              <FormField
                label="Pickup window (minutes)"
                error={errors.noShowGraceMinutes}
                hint="How long after the scheduled pickup time OTP verification stays open. Example: booking at 11:00 AM + 30 min window → pickup allowed 11:00–11:30 AM. After that, the booking is automatically marked No-Show."
                className="min-w-0"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {[15, 30, 45, 60].map((mins) => (
                      <Chip
                        key={mins}
                        active={Number(form.noShowGraceMinutes) === mins}
                        disabled={saving || !form.noShowPolicyEnabled}
                        onClick={() => set("noShowGraceMinutes", String(mins))}
                      >
                        {mins} min
                      </Chip>
                    ))}
                  </div>
                  <Input
                    className="h-9 text-sm"
                    type="number"
                    min="0"
                    value={form.noShowGraceMinutes}
                    disabled={saving || !form.noShowPolicyEnabled}
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
                "Money returned goes to the customer’s wallet.",
              )}

              {form.noShowRefundRule === "partial" ? (
                <FormRow className="gap-3">
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
                </FormRow>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Quick preview</p>
                    <p className="text-xs text-slate-500">
                      See what the customer gets back for a sample deposit.
                    </p>
                  </div>
                  <FormField label="Sample deposit (₹)" className="w-full sm:w-36">
                    <Input
                      className="h-9 text-sm"
                      type="number"
                      min="0"
                      value={previewDeposit}
                      disabled={saving || !form.noShowPolicyEnabled}
                      onChange={(event) => setPreviewDeposit(event.target.value)}
                    />
                  </FormField>
                </div>

                {previewLoading && !noShowPreview ? (
                  <p className="text-xs text-slate-500">Calculating…</p>
                ) : noShowPreview ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <PreviewStat label="Deposit" value={money(noShowPreview.securityDeposit)} />
                    <PreviewStat label="You keep" value={money(noShowPreview.deductionAmount)} />
                    <PreviewStat
                      label="Back to wallet"
                      value={money(noShowPreview.walletCreditAmount)}
                      emphasize
                    />
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Preview not available</p>
                )}
              </div>
            </div>
          </div>
        );

      case "late":
        return (
          <div className="space-y-4">
            <FormRow className="gap-3">
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
            </FormRow>
            <FormRow className="gap-3">
              <FormField
                label="Maximum late charge (₹)"
                error={errors.lateReturnMaxCharge}
                hint="Optional. Leave empty if there is no maximum."
                className="min-w-0"
              >
                <Input
                  className="h-9 text-sm"
                  type="number"
                  min="0"
                  value={form.lateReturnMaxCharge}
                  disabled={saving}
                  placeholder="No limit"
                  onChange={(event) => set("lateReturnMaxCharge", event.target.value)}
                />
              </FormField>
            </FormRow>
          </div>
        );

      case "deposit":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs text-slate-600">
              The security deposit is always collected online, bundled with the rest of the
              booking payment before reservation. Cash/pay-at-pickup collection is no longer
              available for new bookings. Deposit amount is set on each bike.
            </div>
            <FormRow className="gap-3">
              {numberField(
                "Auto refund after return (hours)",
                "depositRefundHours",
                "After inspection, wait this long then credit refundable deposit to wallet. Example: 24",
              )}
              {numberField(
                "Old setting — refund days",
                "depositRefundDays",
                "Only used if hours is not set. Prefer hours above.",
              )}
            </FormRow>
          </div>
        );

      case "support":
        return (
          <div className="space-y-4">
            <FormRow className="gap-3">
              <FormField label="Support phone" className="min-w-0">
                <Input
                  className="h-9 text-sm"
                  value={form.supportPhone}
                  disabled={saving}
                  placeholder="e.g. 9876543210"
                  onChange={(event) => set("supportPhone", event.target.value)}
                />
              </FormField>
              <FormField label="Support email" error={errors.supportEmail} className="min-w-0">
                <Input
                  className="h-9 text-sm"
                  type="email"
                  value={form.supportEmail}
                  disabled={saving}
                  placeholder="e.g. support@example.com"
                  onChange={(event) => set("supportEmail", event.target.value)}
                />
              </FormField>
            </FormRow>
            <FormField
              label="Out of service message"
              hint="Shown when Bike Rent is temporarily unavailable."
              className="min-w-0"
            >
              <Input
                className="h-9 text-sm"
                value={form.outOfServiceMessage}
                disabled={saving}
                placeholder="We are temporarily unavailable. Please try again later."
                onChange={(event) => set("outOfServiceMessage", event.target.value)}
              />
            </FormField>
          </div>
        );

      case "documents":
        return (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Vendors pick from this list when setting a bike&apos;s required pickup documents.
              Customers see the labels on the bike page and at checkout. Turn a type off to hide it
              from new selections without deleting bikes that already reference it.
            </p>
            {(form.documentTypes || []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                No document types yet. Add at least one.
              </p>
            ) : (
              <div className="space-y-2">
                {(form.documentTypes || []).map((doc, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:flex-row sm:items-center"
                  >
                    <Input
                      className="h-9 text-sm sm:flex-1"
                      placeholder="Label — e.g. Driving License"
                      value={doc.label}
                      disabled={saving}
                      onChange={(event) => updateDocumentType(index, "label", event.target.value)}
                    />
                    <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={doc.active !== false}
                        disabled={saving}
                        onChange={(event) => updateDocumentType(index, "active", event.target.checked)}
                      />
                      Active
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0 gap-1.5 text-red-600"
                      disabled={saving}
                      onClick={() => removeDocumentType(index)}
                    >
                      <Trash2 size={14} />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" className="gap-1.5" disabled={saving} onClick={addDocumentType}>
              <Plus size={14} />
              Add document type
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="just-order-theme-scope mx-auto max-w-7xl space-y-4 overflow-x-hidden px-4 py-6 pb-28 sm:space-y-5 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        title="Bike Rent Settings"
        description="Set rules for bookings, cancellations, deposits, and support"
      />

      {loading ? (
        <TableSkeleton rows={8} columns={2} />
      ) : !form ? (
        <EmptyState
          title="Could not load settings"
          description="Check your connection and try again."
          action={<Button onClick={load}>Retry</Button>}
        />
      ) : (
        <form onSubmit={save} className="space-y-4">
          {/* Mobile tabs */}
          <div className="rounded-xl border border-slate-200 bg-white p-2 md:hidden">
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
                        ? "bg-[#FF6A00] text-white"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="text-[10px] font-semibold leading-tight">{label}</span>
                    {errorCount > 0 ? (
                      <span
                        className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                          active ? "bg-white text-[#FF6A00]" : "bg-red-500 text-white"
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
              <div className="sticky top-4 space-y-1 rounded-2xl border border-slate-200 bg-white p-2">
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
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
                        active
                          ? "bg-[#FF6A00] text-white shadow-sm"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          active ? "bg-white/20" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{label}</span>
                        <span
                          className={`block truncate text-[11px] ${
                            active ? "text-white/80" : "text-slate-400"
                          }`}
                        >
                          {title}
                        </span>
                      </span>
                      {errorCount > 0 ? (
                        <span
                          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                            active ? "bg-white text-[#FF6A00]" : "bg-red-500 text-white"
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
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3.5 sm:px-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#FF6A00]">
                    <ActiveIcon size={18} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-900">{activeMeta.title}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">{activeMeta.blurb}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4 sm:p-5">{renderPanel()}</div>

              {/* In-panel nav + save on larger screens too */}
              <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    disabled={saving || activeTab === SECTIONS[0].id}
                    onClick={() => {
                      const index = SECTIONS.findIndex((s) => s.id === activeTab);
                      if (index > 0) setActiveTab(SECTIONS[index - 1].id);
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    disabled={saving || activeTab === SECTIONS[SECTIONS.length - 1].id}
                    onClick={() => {
                      const index = SECTIONS.findIndex((s) => s.id === activeTab);
                      if (index < SECTIONS.length - 1) setActiveTab(SECTIONS[index + 1].id);
                    }}
                  >
                    Next
                  </Button>
                </div>
                <div className="hidden gap-2 md:flex">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={load}
                  >
                    Reset
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky mobile save bar */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
            <div className="mx-auto flex max-w-7xl gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={saving}
                onClick={load}
              >
                Reset
              </Button>
              <Button type="submit" className="flex-[1.4]" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
