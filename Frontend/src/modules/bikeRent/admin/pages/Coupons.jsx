import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Eye, Pencil, Plus, Search, Ticket, Trash2 } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  AdminTable,
  FilterBar,
  FormLayout,
  FormSection,
  FormRow,
  FormField,
  StatusBadge,
  EmptyState,
  TableSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import {
  BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS,
  BIKE_RENT_STAT_GRID_3_CLASS,
} from "../utils/adminTheme";

const EMPTY_FORM = {
  code: "",
  name: "",
  description: "",
  discountType: "percentage",
  discountValue: "10",
  applicableOn: "rental",
  minimumAmount: "0",
  maximumDiscount: "0",
  usageLimit: "0",
  perUserLimit: "1",
  validFromDate: "",
  validFromTime: "00:00",
  validTillDate: "",
  validTillTime: "23:59",
  status: "active",
};

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const pad = (n) => String(n).padStart(2, "0");

const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const splitLocal = (value) => {
  if (!value) return { date: "", time: "00:00" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "00:00" };
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
};

const joinLocal = (date, time) => {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
};

const toMs = (date, time) => {
  const value = joinLocal(date, time);
  if (!value) return NaN;
  return new Date(value).getTime();
};

const formatShort = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const discountLabel = (row) => (
  row.discountType === "fixed"
    ? money(row.discountValue)
    : `${Number(row.discountValue || 0)}%`
);

const applicableLabel = {
  rental: "Rental only",
  deposit: "Deposit only",
  both: "Rental + Deposit",
};

const DIALOG_CONTENT_CLASS = [
  "just-order-theme-scope",
  "!flex w-[calc(100vw-0.75rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0",
  "max-h-[min(94dvh,880px)] rounded-2xl sm:w-full sm:rounded-3xl",
  "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
].join(" ");

function ValidityCard({
  title,
  date,
  time,
  onDateChange,
  onTimeChange,
  dateError,
  timeError,
  dateMin,
  timeMin,
  disabled = false,
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-800">
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#FF6A00]" />
        {title}
      </div>
      <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <FormField label="Date" required error={dateError} className="min-w-0">
          <Input
            type="date"
            className="h-9 max-w-full text-sm"
            value={date}
            min={dateMin}
            disabled={disabled}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </FormField>
        <FormField label="Time" required error={timeError} className="min-w-0">
          <Input
            type="time"
            className="h-9 max-w-full text-sm"
            value={time}
            min={timeMin}
            disabled={disabled}
            onChange={(e) => onTimeChange(e.target.value)}
          />
        </FormField>
      </div>
    </div>
  );
}

export default function Coupons() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [usageRows, setUsageRows] = useState([]);
  const [usageCoupon, setUsageCoupon] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        bikeRentAdminApi.getCoupons({
          page: meta.page,
          limit: meta.limit,
          search: search.trim() || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
        }),
        bikeRentAdminApi.getCouponSummary().catch(() => null),
      ]);
      setRecords(list.records || []);
      setMeta((current) => ({ ...current, ...list }));
      setSummary(stats);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to load coupons"));
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep "now" mins fresh while the create/edit dialog is open.
  useEffect(() => {
    if (!formOpen) return undefined;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [formOpen]);

  const today = useMemo(() => {
    void nowTick;
    return todayYMD();
  }, [nowTick]);

  const currentTime = useMemo(() => {
    void nowTick;
    return nowHM();
  }, [nowTick]);

  const openForm = (row = null) => {
    setEditing(row);
    if (row) {
      const from = splitLocal(row.validFrom);
      const till = splitLocal(row.validTill);
      setForm({
        code: row.code || "",
        name: row.name || "",
        description: row.description || "",
        discountType: row.discountType || "percentage",
        discountValue: String(row.discountValue ?? ""),
        applicableOn: row.applicableOn || "rental",
        minimumAmount: String(row.minimumAmount ?? 0),
        maximumDiscount: String(row.maximumDiscount ?? 0),
        usageLimit: String(row.usageLimit ?? 0),
        perUserLimit: String(row.perUserLimit ?? 1),
        validFromDate: from.date,
        validFromTime: from.time,
        validTillDate: till.date,
        validTillTime: till.time,
        status: row.status || "active",
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        validFromDate: todayYMD(),
        validFromTime: nowHM(),
        validTillDate: "",
        validTillTime: "23:59",
      });
    }
    setErrors({});
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
  };

  const updateField = (name, value) => {
    setForm((current) => {
      const next = { ...current, [name]: value };

      // Keep Valid till after Valid from when from moves forward.
      if (name === "validFromDate" || name === "validFromTime") {
        const fromMs = toMs(
          name === "validFromDate" ? value : next.validFromDate,
          name === "validFromTime" ? value : next.validFromTime,
        );
        const tillMs = toMs(next.validTillDate, next.validTillTime);
        if (Number.isFinite(fromMs) && Number.isFinite(tillMs) && tillMs <= fromMs) {
          next.validTillDate = name === "validFromDate" ? value : next.validFromDate;
          next.validTillTime = "23:59";
          const adjusted = toMs(next.validTillDate, next.validTillTime);
          if (Number.isFinite(fromMs) && adjusted <= fromMs) {
            // Same-day edge: bump till by keeping date and late evening is enough usually;
            // if still <= from, copy from time + leave validation to catch.
            next.validTillTime = next.validFromTime || "23:59";
          }
        }
      }

      return next;
    });
    setErrors((current) => {
      if (!current[name] && !current.validFrom && !current.validTill) return current;
      const next = { ...current };
      delete next[name];
      delete next.validFrom;
      delete next.validTill;
      delete next.validFromDate;
      delete next.validFromTime;
      delete next.validTillDate;
      delete next.validTillTime;
      return next;
    });
  };

  const validFromDateMin = useMemo(() => {
    if (editing?.validFrom) {
      const existing = splitLocal(editing.validFrom).date;
      if (existing && existing < today) return existing;
    }
    return today;
  }, [editing, today]);

  const validFromTimeMin = form.validFromDate === today ? currentTime : undefined;

  const validTillDateMin = form.validFromDate || today;

  const validTillTimeMin = useMemo(() => {
    if (!form.validFromDate || !form.validTillDate) return undefined;
    if (form.validTillDate !== form.validFromDate) return undefined;
    if (form.validFromDate === today && form.validFromTime) {
      // Same day as today: till must be after from, and not before now if from is today
      return form.validFromTime > currentTime ? form.validFromTime : currentTime;
    }
    return form.validFromTime || undefined;
  }, [form.validFromDate, form.validFromTime, form.validTillDate, today, currentTime]);

  const validate = () => {
    const next = {};
    if (!form.code.trim()) next.code = "Coupon code is required";
    if (!form.name.trim()) next.name = "Coupon name is required";
    if (!form.discountValue || Number(form.discountValue) <= 0) {
      next.discountValue = "Enter a valid discount";
    }
    if (!form.validFromDate) next.validFromDate = "Select date";
    if (!form.validFromTime) next.validFromTime = "Select time";
    if (!form.validTillDate) next.validTillDate = "Select date";
    if (!form.validTillTime) next.validTillTime = "Select time";

    const fromMs = toMs(form.validFromDate, form.validFromTime);
    const tillMs = toMs(form.validTillDate, form.validTillTime);
    const nowMs = Date.now();

    if (Number.isFinite(fromMs)) {
      // Allow existing past start only when editing the same coupon unchanged-ish;
      // new creates (and moved starts) cannot be in the past.
      const existingFromMs = editing?.validFrom ? new Date(editing.validFrom).getTime() : null;
      const unchangedExisting =
        editing
        && Number.isFinite(existingFromMs)
        && Math.abs(fromMs - existingFromMs) < 60_000;

      if (!unchangedExisting && fromMs < nowMs - 60_000) {
        next.validFrom = "Valid from cannot be in the past";
        next.validFromDate = "Cannot be past";
      }
    }

    if (Number.isFinite(fromMs) && Number.isFinite(tillMs) && tillMs <= fromMs) {
      next.validTill = "Valid till must be after valid from";
      next.validTillDate = "Must be after start";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        applicableOn: form.applicableOn,
        minimumAmount: Number(form.minimumAmount || 0),
        maximumDiscount: Number(form.maximumDiscount || 0),
        usageLimit: Number(form.usageLimit || 0),
        perUserLimit: Number(form.perUserLimit || 0),
        validFrom: new Date(joinLocal(form.validFromDate, form.validFromTime)).toISOString(),
        validTill: new Date(joinLocal(form.validTillDate, form.validTillTime)).toISOString(),
        status: form.status,
      };
      if (editing?.id) {
        await bikeRentAdminApi.updateCoupon(editing.id, payload);
        toast.success("Coupon updated");
      } else {
        await bikeRentAdminApi.createCoupon(payload);
        toast.success("Coupon created");
      }
      setFormOpen(false);
      setEditing(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to save coupon"));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row) => {
    try {
      const next = row.status === "active" ? "inactive" : "active";
      await bikeRentAdminApi.updateCouponStatus(row.id, next);
      toast.success(next === "active" ? "Coupon activated" : "Coupon deactivated");
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update status"));
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await bikeRentAdminApi.deleteCoupon(deleting.id);
      toast.success("Coupon deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to delete coupon"));
    }
  };

  const openUsage = async (row) => {
    setUsageCoupon(row);
    setUsageOpen(true);
    try {
      const data = await bikeRentAdminApi.getCouponUsage(row.id, { limit: 50 });
      setUsageRows(data.records || []);
    } catch (error) {
      setUsageRows([]);
      toast.error(errorMessage(error, "Failed to load usage"));
    }
  };

  const columns = [
    {
      key: "code",
      header: "Coupon",
      cell: (row) => (
        <div className="min-w-0 max-w-[12rem]">
          <p className="truncate font-mono text-sm font-semibold text-orange-600">{row.code}</p>
          <p className="truncate text-xs text-muted-foreground">{row.name || "—"}</p>
        </div>
      ),
    },
    {
      key: "discount",
      header: "Discount",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-medium">{discountLabel(row)}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {applicableLabel[row.applicableOn] || row.applicableOn}
          </p>
        </div>
      ),
    },
    {
      key: "validity",
      header: "Validity",
      cell: (row) => (
        <div className="text-xs text-muted-foreground">
          <p>{formatShort(row.validFrom)}</p>
          <p>→ {formatShort(row.validTill)}</p>
        </div>
      ),
    },
    {
      key: "usage",
      header: "Usage",
      cell: (row) => (
        <span className="whitespace-nowrap text-sm">
          {Number(row.usedCount || 0)}
          {Number(row.usageLimit || 0) > 0 ? ` / ${row.usageLimit}` : " / ∞"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge
          status={row.displayStatus || row.status}
          label={row.displayStatus || row.status}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <div className="inline-flex flex-nowrap items-center justify-end gap-0.5">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openUsage(row)}>
            <Eye size={14} />
            <span className="sr-only">Usage</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openForm(row)}>
            <Pencil size={14} />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => toggleStatus(row)}
          >
            {row.status === "active" ? "Off" : "On"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-red-600"
            onClick={() => setDeleting(row)}
          >
            <Trash2 size={14} />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-orange-600">{row.code}</p>
          <p className="mt-0.5 truncate text-sm font-medium">{row.name || "—"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {discountLabel(row)} · {applicableLabel[row.applicableOn] || row.applicableOn}
          </p>
        </div>
        <StatusBadge
          status={row.displayStatus || row.status}
          label={row.displayStatus || row.status}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="min-w-0 col-span-2">
          <span className="block text-[10px] uppercase tracking-wide">Validity</span>
          <span className="font-medium text-foreground">
            {formatShort(row.validFrom)} → {formatShort(row.validTill)}
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Usage</span>
          <span className="font-semibold text-foreground">
            {Number(row.usedCount || 0)}
            {Number(row.usageLimit || 0) > 0 ? ` / ${row.usageLimit}` : " / ∞"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-2">
        <Button size="sm" variant="outline" className="min-w-[5.5rem] flex-1" onClick={() => openUsage(row)}>
          <Eye size={14} className="mr-1" /> Usage
        </Button>
        <Button size="sm" variant="outline" className="min-w-[5.5rem] flex-1" onClick={() => openForm(row)}>
          <Pencil size={14} className="mr-1" /> Edit
        </Button>
        <Button size="sm" variant="outline" className="min-w-[5.5rem] flex-1" onClick={() => toggleStatus(row)}>
          {row.status === "active" ? "Deactivate" : "Activate"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-w-[5.5rem] flex-1 border-red-200 text-red-600"
          onClick={() => setDeleting(row)}
        >
          <Trash2 size={14} className="mr-1" /> Delete
        </Button>
      </div>
    </div>
  );

  const renderUsageMobileCard = (row) => (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          Booking {String(row.bookingId || "").slice(-6) || "—"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {row.usedAt ? formatShort(row.usedAt) : "—"} · {row.status || "—"}
        </p>
      </div>
      <p className="shrink-0 text-sm font-semibold">{money(row.discountAmount)}</p>
    </div>
  );

  return (
    <div className="just-order-theme-scope mx-auto max-w-7xl space-y-4 overflow-x-hidden px-4 py-6 pb-24 sm:space-y-5 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        title="Coupons"
        description="Bike Rental coupons only — Food and Taxi stay separate"
        actions={(
          <Button className="w-full gap-2 sm:w-auto" onClick={() => openForm()}>
            <Plus size={16} /> Create Coupon
          </Button>
        )}
      />

      <div className={BIKE_RENT_STAT_GRID_3_CLASS}>
        <StatCard title="Total" value={String(summary?.total ?? meta.total ?? 0)} icon={<Ticket size={18} />} />
        <StatCard title="Active" value={String(summary?.active ?? 0)} />
        <StatCard title="Redemptions" value={String(summary?.usedCount ?? 0)} />
      </div>

      <SectionCard flush>
        <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
          <FilterBar
            start={(
              <>
                <div className="relative w-full max-w-md min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-9 text-sm"
                    placeholder="Search code or name…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setMeta((m) => ({ ...m, page: 1 }));
                    }}
                  />
                </div>
                <select
                  className={`${BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS} w-full sm:w-auto sm:min-w-[9rem]`}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setMeta((m) => ({ ...m, page: 1 }));
                  }}
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </>
            )}
          />

          {loading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : records.length === 0 ? (
            <EmptyState
              title="No coupons yet"
              description="Create a Bike Rental coupon to offer discounts at checkout."
              action={<Button onClick={() => openForm()}>Create Coupon</Button>}
            />
          ) : (
            <AdminTable
              columns={columns}
              data={records}
              getRowId={(row) => row.id}
              renderMobileCard={renderMobileCard}
              pagination={{
                page: meta.page,
                totalPages: meta.pages,
                total: meta.total,
                pageSize: meta.limit,
                onPageChange: (page) => setMeta((m) => ({ ...m, page })),
                onPageSizeChange: (limit) => setMeta((m) => ({ ...m, limit, page: 1 })),
              }}
            />
          )}
        </div>
      </SectionCard>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent
          className={DIALOG_CONTENT_CLASS}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b border-slate-100 px-3 py-3 pr-11 text-left sm:px-4">
            <DialogTitle className="text-base">
              {editing ? "Edit coupon" : "Create coupon"}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
            <FormLayout className="min-w-0 [&_.space-y-6]:space-y-3">
              <FormSection title="Basic details" className="p-3 sm:p-4">
                <FormRow className="gap-3">
                  <FormField label="Coupon code" required error={errors.code} className="min-w-0">
                    <Input
                      className="h-9 font-mono text-sm uppercase"
                      value={form.code}
                      disabled={saving}
                      onChange={(e) => updateField("code", e.target.value.toUpperCase())}
                      placeholder="BIKE20"
                    />
                  </FormField>
                  <FormField label="Coupon name" required error={errors.name} className="min-w-0">
                    <Input
                      className="h-9 text-sm"
                      value={form.name}
                      disabled={saving}
                      onChange={(e) => updateField("name", e.target.value)}
                      placeholder="Weekend offer"
                    />
                  </FormField>
                </FormRow>
                <FormField label="Description" className="min-w-0">
                  <Input
                    className="h-9 text-sm"
                    value={form.description}
                    disabled={saving}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder="Optional"
                  />
                </FormField>
              </FormSection>

              <FormSection title="Discount rules" className="p-3 sm:p-4">
                <FormRow className="gap-3">
                  <FormField label="Discount type" className="min-w-0">
                    <select
                      className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
                      value={form.discountType}
                      disabled={saving}
                      onChange={(e) => updateField("discountType", e.target.value)}
                    >
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                  </FormField>
                  <FormField label="Discount value" required error={errors.discountValue} className="min-w-0">
                    <Input
                      className="h-9 text-sm"
                      type="number"
                      min="0"
                      value={form.discountValue}
                      disabled={saving}
                      onChange={(e) => updateField("discountValue", e.target.value)}
                    />
                  </FormField>
                </FormRow>
                <FormRow className="gap-3">
                  <FormField label="Applicable on" className="min-w-0">
                    <select
                      className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
                      value={form.applicableOn}
                      disabled={saving}
                      onChange={(e) => updateField("applicableOn", e.target.value)}
                    >
                      <option value="rental">Rental amount only</option>
                      <option value="deposit">Security deposit only</option>
                      <option value="both">Rental + security deposit</option>
                    </select>
                  </FormField>
                  <FormField label="Max discount (₹)" className="min-w-0">
                    <Input
                      className="h-9 text-sm"
                      type="number"
                      min="0"
                      value={form.maximumDiscount}
                      disabled={saving}
                      onChange={(e) => updateField("maximumDiscount", e.target.value)}
                      placeholder="0 = no cap"
                    />
                  </FormField>
                </FormRow>
                <FormField label="Minimum rental amount (₹)" className="min-w-0">
                  <Input
                    className="h-9 text-sm"
                    type="number"
                    min="0"
                    value={form.minimumAmount}
                    disabled={saving}
                    onChange={(e) => updateField("minimumAmount", e.target.value)}
                  />
                </FormField>
              </FormSection>

              <FormSection title="Usage limits" className="p-3 sm:p-4">
                <FormRow className="gap-3">
                  <FormField label="Total usage limit" className="min-w-0">
                    <Input
                      className="h-9 text-sm"
                      type="number"
                      min="0"
                      value={form.usageLimit}
                      disabled={saving}
                      onChange={(e) => updateField("usageLimit", e.target.value)}
                      placeholder="0 = unlimited"
                    />
                  </FormField>
                  <FormField label="Per user limit" className="min-w-0">
                    <Input
                      className="h-9 text-sm"
                      type="number"
                      min="0"
                      value={form.perUserLimit}
                      disabled={saving}
                      onChange={(e) => updateField("perUserLimit", e.target.value)}
                      placeholder="0 = unlimited"
                    />
                  </FormField>
                </FormRow>
              </FormSection>

              <FormSection title="Validity" className="p-3 sm:p-4">
                <div className="space-y-3">
                  <ValidityCard
                    title="Valid from"
                    date={form.validFromDate}
                    time={form.validFromTime}
                    dateMin={validFromDateMin}
                    timeMin={validFromTimeMin}
                    dateError={errors.validFromDate || errors.validFrom}
                    timeError={errors.validFromTime}
                    disabled={saving}
                    onDateChange={(value) => {
                      const nextDate = value || "";
                      setForm((current) => {
                        let nextTime = current.validFromTime;
                        if (nextDate === today && nextTime && nextTime < currentTime) {
                          nextTime = currentTime;
                        }
                        const next = {
                          ...current,
                          validFromDate: nextDate,
                          validFromTime: nextTime,
                        };
                        const fromMs = toMs(next.validFromDate, next.validFromTime);
                        const tillMs = toMs(next.validTillDate, next.validTillTime);
                        if (Number.isFinite(fromMs) && Number.isFinite(tillMs) && tillMs <= fromMs) {
                          next.validTillDate = nextDate;
                          next.validTillTime = "23:59";
                        }
                        return next;
                      });
                      setErrors((current) => {
                        const next = { ...current };
                        delete next.validFrom;
                        delete next.validFromDate;
                        delete next.validFromTime;
                        delete next.validTill;
                        delete next.validTillDate;
                        delete next.validTillTime;
                        return next;
                      });
                    }}
                    onTimeChange={(value) => {
                      let next = value;
                      if (form.validFromDate === today && next && next < currentTime) {
                        next = currentTime;
                        toast.error("Valid from time cannot be in the past");
                      }
                      updateField("validFromTime", next);
                    }}
                  />

                  <ValidityCard
                    title="Valid till"
                    date={form.validTillDate}
                    time={form.validTillTime}
                    dateMin={validTillDateMin}
                    timeMin={validTillTimeMin}
                    dateError={errors.validTillDate || errors.validTill}
                    timeError={errors.validTillTime}
                    disabled={saving}
                    onDateChange={(value) => updateField("validTillDate", value || "")}
                    onTimeChange={(value) => {
                      let next = value;
                      if (
                        form.validTillDate
                        && form.validFromDate
                        && form.validTillDate === form.validFromDate
                        && form.validFromTime
                        && next
                        && next <= form.validFromTime
                      ) {
                        toast.error("Valid till must be after valid from");
                        return;
                      }
                      updateField("validTillTime", next);
                    }}
                  />
                </div>

                <FormField label="Status" className="mt-3 min-w-0">
                  <select
                    className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
                    value={form.status}
                    disabled={saving}
                    onChange={(e) => updateField("status", e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </FormField>
              </FormSection>
            </FormLayout>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-3 py-3 sm:flex-row sm:justify-end sm:px-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent className={DIALOG_CONTENT_CLASS}>
          <DialogHeader className="shrink-0 border-b border-slate-100 px-3 py-3 pr-11 text-left sm:px-4">
            <DialogTitle className="text-base">
              Usage · {usageCoupon?.code || "Coupon"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
            {usageRows.length === 0 ? (
              <EmptyState
                title="No redemptions yet"
                description="Usage appears after successful booking payments."
              />
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {usageRows.map((row) => (
                    <div key={row.id}>{renderUsageMobileCard(row)}</div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <AdminTable
                    columns={[
                      {
                        key: "booking",
                        header: "Booking",
                        cell: (row) => (
                          <span className="font-mono text-xs">
                            {String(row.bookingId || "").slice(-8) || "—"}
                          </span>
                        ),
                      },
                      {
                        key: "usedAt",
                        header: "Used at",
                        cell: (row) => formatShort(row.usedAt),
                      },
                      {
                        key: "status",
                        header: "Status",
                        cell: (row) => <StatusBadge status={row.status} />,
                      },
                      {
                        key: "discountAmount",
                        header: "Discount",
                        align: "right",
                        cell: (row) => money(row.discountAmount),
                      },
                    ]}
                    data={usageRows}
                    getRowId={(row) => row.id}
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex shrink-0 justify-end border-t border-slate-100 px-3 py-3 sm:px-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setUsageOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={() => setDeleting(null)}>
        <DialogContent className="just-order-theme-scope w-[calc(100vw-1.5rem)] max-w-md gap-3 rounded-2xl p-4 sm:rounded-3xl sm:p-5">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-base">Delete coupon</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Delete <strong className="font-mono">{deleting?.code}</strong>? This cannot be undone.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button className="w-full bg-red-600 hover:bg-red-700 sm:w-auto" onClick={remove}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
