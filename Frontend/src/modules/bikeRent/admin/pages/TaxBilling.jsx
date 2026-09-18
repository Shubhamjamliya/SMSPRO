import { useCallback, useEffect, useMemo, useState } from "react";
import { Percent, HandCoins, FileText } from "lucide-react";
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
  gstPercent: "0",
  taxableComponents: {
    rentalAmount: true,
    platformFee: true,
    lateCharges: true,
    damageCharges: true,
    securityDeposit: false,
  },
  platformFee: {
    enabled: false,
    type: "fixed",
    amount: "0",
    payer: "customer",
  },
  invoice: {
    companyName: "",
    companyAddress: "",
    companyGSTIN: "",
    companyPAN: "",
    invoicePrefix: "INV",
    nextInvoiceNumber: "1",
    footerNote: "",
  },
};

const SECTIONS = [
  {
    id: "gst",
    label: "GST",
    title: "GST configuration",
    blurb: "Tax rate and which charges GST applies to.",
    icon: Percent,
  },
  {
    id: "platformFee",
    label: "Platform Fee",
    title: "Platform fee",
    blurb: "An additional service fee, separate from vendor commission.",
    icon: HandCoins,
  },
  {
    id: "invoice",
    label: "Invoice",
    title: "Invoice settings",
    blurb: "Company details and numbering shown on generated invoices.",
    icon: FileText,
  },
];

const TAXABLE_COMPONENT_LABELS = {
  rentalAmount: "Rental amount",
  platformFee: "Platform fee",
  lateCharges: "Late return charges",
  damageCharges: "Damage charges",
  securityDeposit: "Security deposit (unusual — usually non-taxable)",
};

const message = (error, fallback) => error?.response?.data?.message || fallback;

function toFormValue(settings) {
  return {
    gstPercent: String(settings?.gstPercent ?? 0),
    taxableComponents: { ...EMPTY.taxableComponents, ...(settings?.taxableComponents || {}) },
    platformFee: {
      ...EMPTY.platformFee,
      ...(settings?.platformFee || {}),
      amount: String(settings?.platformFee?.amount ?? 0),
    },
    invoice: {
      ...EMPTY.invoice,
      ...(settings?.invoice || {}),
      nextInvoiceNumber: String(settings?.invoice?.nextInvoiceNumber ?? 1),
    },
  };
}

export default function TaxBilling() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [activeTab, setActiveTab] = useState("gst");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await bikeRentAdminApi.getTaxSettings();
      setForm(toFormValue(settings));
    } catch (error) {
      toast.error(message(error, "Failed to load tax settings"));
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setGst = (value) => setForm((current) => ({ ...current, gstPercent: value }));

  const toggleComponent = (key, checked) =>
    setForm((current) => ({
      ...current,
      taxableComponents: { ...current.taxableComponents, [key]: checked },
    }));

  const setPlatformFee = (key, value) =>
    setForm((current) => ({
      ...current,
      platformFee: { ...current.platformFee, [key]: value },
    }));

  const setInvoice = (key, value) =>
    setForm((current) => ({
      ...current,
      invoice: { ...current.invoice, [key]: value },
    }));

  const activeMeta = SECTIONS.find((s) => s.id === activeTab) || SECTIONS[0];
  const ActiveIcon = activeMeta.icon;

  const preview = useMemo(() => {
    if (!form) return null;
    const rental = 1000;
    const fee = form.platformFee.enabled
      ? form.platformFee.type === "percent"
        ? (rental * Number(form.platformFee.amount || 0)) / 100
        : Number(form.platformFee.amount || 0)
      : 0;
    const customerFacingFee = form.platformFee.enabled && form.platformFee.payer === "customer" ? fee : 0;
    const taxable =
      (form.taxableComponents.rentalAmount ? rental : 0)
      + (form.taxableComponents.platformFee ? customerFacingFee : 0);
    const gst = Math.round((taxable * Number(form.gstPercent || 0)) / 100 * 100) / 100;
    return { rental, fee: customerFacingFee, taxable, gst, total: rental + customerFacingFee + gst };
  }, [form]);

  const save = async (event) => {
    event?.preventDefault?.();
    const next = {};
    if (Number(form.gstPercent) < 0 || Number(form.gstPercent) > 100) {
      next.gstPercent = "Enter a rate between 0 and 100";
    }
    if (form.platformFee.enabled && Number(form.platformFee.amount) < 0) {
      next.platformFeeAmount = "Enter a valid amount";
    }
    if (form.invoice.companyGSTIN && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(form.invoice.companyGSTIN.toUpperCase())) {
      next.companyGSTIN = "Enter a valid GSTIN";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error("Please fix the highlighted fields");
      if (next.companyGSTIN) setActiveTab("invoice");
      else setActiveTab("gst");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        gstPercent: Number(form.gstPercent),
        taxableComponents: form.taxableComponents,
        platformFee: {
          ...form.platformFee,
          amount: Number(form.platformFee.amount),
        },
        invoice: {
          ...form.invoice,
          nextInvoiceNumber: Number(form.invoice.nextInvoiceNumber),
        },
      };
      const saved = await bikeRentAdminApi.updateTaxSettings(payload);
      setForm(toFormValue(saved));
      toast.success("Tax settings saved");
    } catch (error) {
      toast.error(message(error, "Failed to save tax settings"));
    } finally {
      setSaving(false);
    }
  };

  const renderPanel = () => {
    if (!form) return null;
    switch (activeTab) {
      case "gst":
        return (
          <div className="space-y-4">
            <FormRow className="gap-3">
              <FormField
                label="GST rate (%)"
                error={errors.gstPercent}
                hint="Single global rate applied to whichever components below are taxable."
                className="min-w-0"
              >
                <Input
                  className="h-9 text-sm"
                  type="number"
                  min="0"
                  max="100"
                  value={form.gstPercent}
                  disabled={saving}
                  onChange={(event) => setGst(event.target.value)}
                />
              </FormField>
            </FormRow>
            <FormField label="Taxable components" className="min-w-0">
              <div className="space-y-2">
                {Object.entries(TAXABLE_COMPONENT_LABELS).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#FF6A00]"
                      checked={Boolean(form.taxableComponents[key])}
                      disabled={saving}
                      onChange={(event) => toggleComponent(key, event.target.checked)}
                    />
                    <span className="text-sm font-medium text-slate-900">{label}</span>
                  </label>
                ))}
              </div>
            </FormField>
            {preview ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview — ₹1000 rental
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Rental", preview.rental],
                    ["Platform fee", preview.fee],
                    ["GST", preview.gst],
                    ["Total", preview.total],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                      <p className="text-[10px] font-medium uppercase text-slate-500">{label}</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">
                        ₹{Number(value).toLocaleString("en-IN")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );

      case "platformFee":
        return (
          <div className="space-y-4">
            <FormField label="Enable platform fee" className="min-w-0">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#FF6A00]"
                  checked={form.platformFee.enabled}
                  disabled={saving}
                  onChange={(event) => setPlatformFee("enabled", event.target.checked)}
                />
                <span className="text-sm font-medium text-slate-900">
                  Charge a platform fee on bookings
                </span>
              </label>
            </FormField>
            <div className={form.platformFee.enabled ? "space-y-4" : "pointer-events-none space-y-4 opacity-50"}>
              <FormRow className="gap-3">
                <FormField label="Fee type" className="min-w-0">
                  <select
                    className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
                    value={form.platformFee.type}
                    disabled={saving || !form.platformFee.enabled}
                    onChange={(event) => setPlatformFee("type", event.target.value)}
                  >
                    <option value="fixed">Fixed amount (₹)</option>
                    <option value="percent">Percent of rental</option>
                  </select>
                </FormField>
                <FormField label={form.platformFee.type === "percent" ? "Fee (%)" : "Fee (₹)"} error={errors.platformFeeAmount} className="min-w-0">
                  <Input
                    className="h-9 text-sm"
                    type="number"
                    min="0"
                    value={form.platformFee.amount}
                    disabled={saving || !form.platformFee.enabled}
                    onChange={(event) => setPlatformFee("amount", event.target.value)}
                  />
                </FormField>
              </FormRow>
              <FormField
                label="Who is charged?"
                hint="Customer payable: added on top of the rental total. Vendor deduction: taken from the vendor's payout, customer's total is unaffected."
                className="min-w-0"
              >
                <select
                  className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
                  value={form.platformFee.payer}
                  disabled={saving || !form.platformFee.enabled}
                  onChange={(event) => setPlatformFee("payer", event.target.value)}
                >
                  <option value="customer">Customer payable</option>
                  <option value="vendor">Vendor deduction</option>
                </select>
              </FormField>
            </div>
          </div>
        );

      case "invoice":
        return (
          <div className="space-y-4">
            <FormRow className="gap-3">
              <FormField label="Company name" className="min-w-0">
                <Input
                  className="h-9 text-sm"
                  value={form.invoice.companyName}
                  disabled={saving}
                  onChange={(event) => setInvoice("companyName", event.target.value)}
                />
              </FormField>
              <FormField label="Company GSTIN" error={errors.companyGSTIN} className="min-w-0">
                <Input
                  className="h-9 text-sm"
                  value={form.invoice.companyGSTIN}
                  disabled={saving}
                  placeholder="22AAAAA0000A1Z5"
                  onChange={(event) => setInvoice("companyGSTIN", event.target.value.toUpperCase())}
                />
              </FormField>
            </FormRow>
            <FormField label="Company address" className="min-w-0">
              <Input
                className="h-9 text-sm"
                value={form.invoice.companyAddress}
                disabled={saving}
                onChange={(event) => setInvoice("companyAddress", event.target.value)}
              />
            </FormField>
            <FormRow className="gap-3">
              <FormField label="Company PAN" className="min-w-0">
                <Input
                  className="h-9 text-sm"
                  value={form.invoice.companyPAN}
                  disabled={saving}
                  onChange={(event) => setInvoice("companyPAN", event.target.value.toUpperCase())}
                />
              </FormField>
              <FormField label="Invoice prefix" className="min-w-0">
                <Input
                  className="h-9 text-sm"
                  value={form.invoice.invoicePrefix}
                  disabled={saving}
                  onChange={(event) => setInvoice("invoicePrefix", event.target.value.toUpperCase())}
                />
              </FormField>
              <FormField label="Next invoice number" hint="Auto-increments after each invoice." className="min-w-0">
                <Input
                  className="h-9 text-sm"
                  type="number"
                  min="1"
                  value={form.invoice.nextInvoiceNumber}
                  disabled={saving}
                  onChange={(event) => setInvoice("nextInvoiceNumber", event.target.value)}
                />
              </FormField>
            </FormRow>
            <FormField label="Footer note" hint="Shown at the bottom of every invoice." className="min-w-0">
              <Input
                className="h-9 text-sm"
                value={form.invoice.footerNote}
                disabled={saving}
                onChange={(event) => setInvoice("footerNote", event.target.value)}
              />
            </FormField>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="just-order-theme-scope mx-auto max-w-7xl space-y-4 overflow-x-hidden px-4 py-6 pb-28 sm:space-y-5 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        title="Tax & Billing"
        description="GST rate, platform fee, and invoice settings for the marketplace"
      />

      {loading ? (
        <TableSkeleton rows={8} columns={2} />
      ) : !form ? (
        <EmptyState
          title="Could not load tax settings"
          description="Check your connection and try again."
          action={<Button onClick={load}>Retry</Button>}
        />
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-2 md:hidden">
            <div className="grid grid-cols-3 gap-1.5">
              {SECTIONS.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`flex flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-center transition-colors ${
                      active ? "bg-[#FF6A00] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="text-[10px] font-semibold leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="hidden md:block">
              <div className="sticky top-4 space-y-1 rounded-2xl border border-slate-200 bg-white p-2">
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Sections
                </p>
                {SECTIONS.map(({ id, label, title, icon: Icon }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                        active ? "bg-[#FF6A00] text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"
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
                        <span className={`block truncate text-[11px] ${active ? "text-white/80" : "text-slate-400"}`}>
                          {title}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

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
                  <Button type="button" variant="outline" disabled={saving} onClick={load}>
                    Reset
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
            <div className="mx-auto flex max-w-7xl gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={saving} onClick={load}>
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
