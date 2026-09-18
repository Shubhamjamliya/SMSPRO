import { useMemo } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Mirrors the backend's VENDOR_SETTINGS_SECTIONS whitelist
 * (Backend/src/modules/bike-rent/utils/vendorSettings.util.js) — bike-level overrides use the
 * same keys as vendor-level overrides, just one tier higher in the settings hierarchy.
 */
export const BIKE_SETTINGS_SECTIONS = [
  {
    id: "booking",
    label: "Booking rules",
    fields: [
      { key: "minBookingDurationHours", label: "Shortest rental (hours)", type: "number", min: 1 },
      { key: "maxBookingDurationHours", label: "Longest rental (hours)", type: "number", min: 1 },
    ],
  },
  {
    id: "cancellation",
    label: "Cancellation",
    fields: [
      { key: "freeCancelBeforePickupMinutes", label: "Free cancel window (minutes)", type: "number", min: 0 },
      {
        key: "cancellationChargeType",
        label: "Charge type",
        type: "select",
        options: [
          { value: "percent", label: "Percent of rental fee" },
          { value: "fixed", label: "Fixed amount (₹)" },
        ],
      },
      { key: "cancellationChargePercent", label: "Cancel charge (%)", type: "number", min: 0 },
      { key: "cancellationChargeFixed", label: "Cancel charge (₹)", type: "number", min: 0 },
    ],
  },
  {
    id: "noShow",
    label: "No-show policy",
    fields: [
      {
        key: "noShowPolicyEnabled",
        label: "Automatic no-show enabled",
        type: "select",
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ],
      },
      { key: "noShowGraceMinutes", label: "Wait time after pickup (minutes)", type: "number", min: 0 },
      {
        key: "noShowRefundRule",
        label: "Deposit on no-show",
        type: "select",
        options: [
          { value: "full", label: "Return full deposit" },
          { value: "partial", label: "Keep some, return rest" },
          { value: "none", label: "Keep full deposit" },
        ],
      },
      { key: "noShowRefundPercent", label: "Percent to keep (%)", type: "number", min: 0 },
      { key: "noShowRefundFixed", label: "Amount to keep (₹)", type: "number", min: 0 },
    ],
  },
  {
    id: "lateReturn",
    label: "Late return charges",
    fields: [
      { key: "lateFeePerHour", label: "Extra charge per hour (₹)", type: "number", min: 0 },
      { key: "lateReturnGraceMinutes", label: "Free late minutes", type: "number", min: 0 },
      { key: "lateReturnMaxCharge", label: "Maximum late charge (₹, blank = no limit)", type: "number", min: 0 },
    ],
  },
  {
    id: "deposit",
    label: "Security deposit",
    fields: [
      { key: "depositRefundHours", label: "Auto refund after return (hours)", type: "number", min: 0 },
    ],
  },
  {
    id: "support",
    label: "Customer support",
    fields: [
      { key: "supportPhone", label: "Support phone", type: "text" },
      { key: "supportEmail", label: "Support email", type: "text" },
      { key: "outOfServiceMessage", label: "Out of service message", type: "text" },
    ],
  },
];

const inputClass =
  "h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

function fieldToFormValue(field, value) {
  if (value === undefined || value === null) return "";
  if (field.key === "noShowPolicyEnabled") return value ? "true" : "false";
  return String(value);
}

function fieldToStoredValue(field, raw) {
  if (raw === "") return field.type === "number" && field.key !== "lateReturnMaxCharge" ? undefined : null;
  if (field.key === "noShowPolicyEnabled") return raw === "true";
  if (field.type === "number") return Number(raw);
  return raw;
}

/**
 * Collapsible "override policy for this bike" editor. `value` is the bike's raw
 * `settingsOverride` map (or null); `onChange` receives the next map (never an empty object —
 * an empty section collapses back to `null`/omitted so the field simply inherits).
 */
export default function BikeSettingsOverridePanel({ value, onChange, disabled = false }) {
  const overrides = value || {};

  const sectionEnabled = useMemo(() => {
    const map = {};
    BIKE_SETTINGS_SECTIONS.forEach((section) => {
      map[section.id] = section.fields.some(
        (field) => overrides[field.key] !== undefined && overrides[field.key] !== null,
      );
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const setField = (field, raw) => {
    const next = { ...overrides };
    const stored = fieldToStoredValue(field, raw);
    if (stored === undefined) delete next[field.key];
    else next[field.key] = stored;
    onChange(Object.keys(next).length ? next : null);
  };

  const toggleSection = (section, on) => {
    const next = { ...overrides };
    if (on) {
      section.fields.forEach((field) => {
        if (next[field.key] === undefined) {
          next[field.key] = field.type === "number" ? 0 : field.options?.[0]?.value ?? "";
        }
      });
    } else {
      section.fields.forEach((field) => delete next[field.key]);
    }
    onChange(Object.keys(next).length ? next : null);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Optional. Any policy you turn on here wins over both your vendor settings and the
        platform default for this specific bike only. Leave everything off to follow your
        vendor settings.
      </p>
      {BIKE_SETTINGS_SECTIONS.map((section) => {
        const enabled = Boolean(sectionEnabled[section.id]);
        return (
          <details key={section.id} className="group rounded-xl border border-slate-200 bg-white" open={enabled}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
              <span className="flex items-center gap-2">
                <ChevronDown size={14} className="text-slate-400 transition-transform group-open:rotate-180" />
                <span className="text-sm font-medium text-slate-800">{section.label}</span>
              </span>
              <label
                className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#FF6A00]"
                  checked={enabled}
                  disabled={disabled}
                  onChange={(event) => toggleSection(section, event.target.checked)}
                />
                Override for this bike
              </label>
            </summary>
            {enabled ? (
              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <div key={field.key} className="min-w-0">
                    <label className={labelClass}>{field.label}</label>
                    {field.type === "select" ? (
                      <select
                        className={inputClass}
                        value={fieldToFormValue(field, overrides[field.key])}
                        disabled={disabled}
                        onChange={(event) => setField(field, event.target.value)}
                      >
                        {field.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputClass}
                        type={field.type === "number" ? "number" : "text"}
                        min={field.min}
                        value={fieldToFormValue(field, overrides[field.key])}
                        disabled={disabled}
                        onChange={(event) => setField(field, event.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}
