import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Ticket, Eye, Pencil, Trash2, Percent, IndianRupee, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar,
  FormLayout, FormSection, FormRow, FormField, StatusBadge,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { taxiAdminApi } from "../../services/api";
import { formatCurrency, formatDateTime } from "../utils/taxiTableHelpers";

const selectCls =
  "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const toLocalInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const EMPTY_FORM = {
  code: "",
  name: "",
  description: "",
  discountType: "percentage",
  discountValue: 10,
  maxDiscount: 50,
  minFare: 0,
  usageLimit: 1000,
  perUserLimit: 1,
  validFrom: "",
  validUntil: "",
  customerScope: "all",
  firstRideOnly: false,
  waivePlatformFee: false,
  autoApply: false,
  showInBooking: true,
  zoneIds: [],
  vehicleTypeIds: [],
  status: "active",
};

const Coupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    scheduled: 0,
    expired: 0,
    inactive: 0,
    totalRedemption: 0,
    totalDiscountGiven: 0,
  });
  const [zones, setZones] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadMeta = useCallback(async () => {
    try {
      const [zoneList, types] = await Promise.all([
        taxiAdminApi.getZoneDropdown(),
        taxiAdminApi.getVehicleTypeDropdown(),
      ]);
      setZones(zoneList || []);
      setVehicleTypes(types || []);
    } catch {
      setZones([]);
      setVehicleTypes([]);
    }
  }, []);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const [result, stats] = await Promise.all([
        taxiAdminApi.getCoupons({
          page,
          limit: pageSize,
          search: search.trim() || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          discountType: typeFilter !== "all" ? typeFilter : undefined,
          sortBy: "createdAt",
          sortOrder: "desc",
        }),
        taxiAdminApi.getCouponSummary().catch(() => null),
      ]);
      setCoupons(result.records || []);
      setTotal(result.total || 0);
      setTotalPages(result.pages || 1);
      if (stats) setSummary((prev) => ({ ...prev, ...stats }));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load coupons");
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, typeFilter]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const openForm = (row = null) => {
    setEditing(row);
    setForm(
      row
        ? {
            ...EMPTY_FORM,
            ...row,
            validFrom: toLocalInput(row.validFrom),
            validUntil: toLocalInput(row.validUntil),
            zoneIds: row.zoneIds || [],
            vehicleTypeIds: row.vehicleTypeIds || [],
          }
        : { ...EMPTY_FORM },
    );
    setErrors({});
    setFormOpen(true);
  };

  const openDetail = (row) => {
    setDetail(row);
    setDetailOpen(true);
  };

  const validate = () => {
    const e = {};
    if (!form.code.trim()) e.code = "Coupon code is required";
    if (!form.name.trim()) e.name = "Coupon name is required";
    if (!form.discountValue || Number(form.discountValue) <= 0) {
      e.discountValue = "Valid discount required";
    }
    if (form.discountType === "percentage" && (!form.maxDiscount || Number(form.maxDiscount) <= 0)) {
      e.maxDiscount = "Max discount is required for percentage coupons";
    }
    if (!form.validFrom) e.validFrom = "Start date required";
    if (!form.validUntil) e.validUntil = "End date required";
    if (form.validFrom && form.validUntil && new Date(form.validUntil) <= new Date(form.validFrom)) {
      e.validUntil = "End date must be after start date";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description || "",
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscount: Number(form.maxDiscount || 0),
        minFare: Number(form.minFare || 0),
        usageLimit: Number(form.usageLimit || 0),
        perUserLimit: Number(form.perUserLimit || 1),
        validFrom: new Date(form.validFrom).toISOString(),
        validUntil: new Date(form.validUntil).toISOString(),
        customerScope: form.firstRideOnly ? "first-time" : form.customerScope,
        firstRideOnly: Boolean(form.firstRideOnly || form.customerScope === "first-time"),
        waivePlatformFee: Boolean(form.waivePlatformFee),
        autoApply: Boolean(form.autoApply),
        showInBooking: form.showInBooking !== false,
        zoneIds: form.zoneIds || [],
        vehicleTypeIds: form.vehicleTypeIds || [],
        status: form.status,
      };
      if (editing?.id) {
        await taxiAdminApi.updateCoupon(editing.id, payload);
        toast.success("Coupon updated");
      } else {
        await taxiAdminApi.createCoupon(payload);
        toast.success("Coupon created");
      }
      setFormOpen(false);
      await fetchCoupons();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save coupon");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await taxiAdminApi.deleteCoupon(deleteTarget.id);
      toast.success("Coupon deleted");
      setDeleteTarget(null);
      await fetchCoupons();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const toggleMulti = (key, id) => {
    setForm((prev) => {
      const set = new Set((prev[key] || []).map(String));
      if (set.has(String(id))) set.delete(String(id));
      else set.add(String(id));
      return { ...prev, [key]: [...set] };
    });
  };

  const discountLabel = useMemo(() => {
    if (form.discountType === "percentage") return `${form.discountValue || 0}% off`;
    return `${formatCurrency(form.discountValue || 0)} off`;
  }, [form.discountType, form.discountValue]);

  const columns = [
    {
      key: "code",
      header: "Code",
      cell: (row) => <span className="font-mono font-semibold text-primary">{row.code}</span>,
    },
    {
      key: "name",
      header: "Name",
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "discountType",
      header: "Type",
      cell: (row) => (
        <StatusBadge
          status={row.discountType === "percentage" ? "info" : "primary"}
          label={row.discountType}
        />
      ),
    },
    {
      key: "discountValue",
      header: "Discount",
      cell: (row) =>
        row.discountType === "percentage"
          ? `${row.discountValue}%`
          : formatCurrency(row.discountValue),
    },
    {
      key: "minFare",
      header: "Min fare",
      cell: (row) => formatCurrency(row.minFare),
    },
    {
      key: "usage",
      header: "Used / Limit",
      cell: (row) => (
        <span>
          {row.usedCount}
          {" / "}
          {row.usageLimit > 0 ? row.usageLimit : "∞"}
        </span>
      ),
    },
    {
      key: "validUntil",
      header: "Valid until",
      cell: (row) => formatDateTime(row.validUntil),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button type="button" variant="ghost" size="sm" onClick={() => openDetail(row)} aria-label="View">
            <Eye size={14} />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => openForm(row)} aria-label="Edit">
            <Pencil size={14} />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget(row)} aria-label="Delete">
            <Trash2 size={14} className="text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Coupons & Offers"
        description="Create advanced taxi promo codes — discount rules, limits, zones, vehicles, and first-ride offers."
        actions={
          <Button type="button" onClick={() => openForm()}>
            <Plus size={16} className="mr-1" /> Create coupon
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard title="Total" value={String(summary.total || 0)} icon={<Ticket size={18} />} />
        <StatCard title="Active" value={String(summary.active || 0)} />
        <StatCard title="Scheduled" value={String(summary.scheduled || 0)} />
        <StatCard title="Expired" value={String(summary.expired || 0)} />
        <StatCard title="Inactive" value={String(summary.inactive || 0)} />
        <StatCard title="Redemptions" value={String(summary.totalRedemption || 0)} icon={<Percent size={18} />} />
        <StatCard
          title="Discount given"
          value={formatCurrency(summary.totalDiscountGiven || 0)}
          icon={<IndianRupee size={18} />}
        />
      </div>

      <SectionCard title="Coupon management" flush>
        <div className="p-4 space-y-4">
          <FilterBar
            start={
              <>
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search code or name…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <select
                  className={`${selectCls} w-auto`}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="expired">Expired</option>
                  <option value="inactive">Inactive</option>
                </select>
                <select
                  className={`${selectCls} w-auto`}
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All types</option>
                  <option value="percentage">Percentage</option>
                  <option value="flat">Flat</option>
                </select>
              </>
            }
          />
          <AdminTable
            columns={columns}
            data={coupons}
            loading={loading}
            getRowId={(r) => r.id}
            pagination={{
              page,
              totalPages,
              total,
              pageSize,
              onPageChange: setPage,
              onPageSizeChange: (s) => {
                setPageSize(s);
                setPage(1);
              },
            }}
            emptyState={{
              title: "No coupons yet",
              description: "Create your first taxi promo code.",
            }}
          />
        </div>
      </SectionCard>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader className="pr-8">
            <DialogTitle>{editing ? "Edit coupon" : "Create coupon"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto space-y-4">
            <FormLayout>
              <FormSection title="Basic details">
                <FormRow>
                  <FormField label="Coupon code" required error={errors.code}>
                    <Input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="FIRSTRIDE"
                      disabled={Boolean(editing)}
                    />
                  </FormField>
                  <FormField label="Coupon name" required error={errors.name}>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="First ride offer"
                    />
                  </FormField>
                </FormRow>
                <FormField label="Description">
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Shown to riders when browsing offers"
                  />
                </FormField>
              </FormSection>

              <FormSection title="Discount">
                <FormRow>
                  <FormField label="Discount type">
                    <select
                      className={`${selectCls} w-full`}
                      value={form.discountType}
                      onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                    >
                      <option value="percentage">Percentage</option>
                      <option value="flat">Flat amount</option>
                    </select>
                  </FormField>
                  <FormField label="Discount value" required error={errors.discountValue}>
                    <Input
                      type="number"
                      min={0}
                      value={form.discountValue}
                      onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    />
                  </FormField>
                </FormRow>
                <FormRow>
                  <FormField label="Max discount (₹)" error={errors.maxDiscount}>
                    <Input
                      type="number"
                      min={0}
                      value={form.maxDiscount}
                      disabled={form.discountType === "flat"}
                      onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Min fare (₹)">
                    <Input
                      type="number"
                      min={0}
                      value={form.minFare}
                      onChange={(e) => setForm({ ...form, minFare: e.target.value })}
                    />
                  </FormField>
                </FormRow>
                <FormRow>
                  <FormField label="Global usage limit (0 = unlimited)">
                    <Input
                      type="number"
                      min={0}
                      value={form.usageLimit}
                      onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Per user limit">
                    <Input
                      type="number"
                      min={0}
                      value={form.perUserLimit}
                      onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })}
                    />
                  </FormField>
                </FormRow>
              </FormSection>

              <FormSection title="Validity & audience">
                <FormRow>
                  <FormField label="Valid from" required error={errors.validFrom}>
                    <Input
                      type="datetime-local"
                      value={form.validFrom}
                      onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Valid until" required error={errors.validUntil}>
                    <Input
                      type="datetime-local"
                      value={form.validUntil}
                      onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    />
                  </FormField>
                </FormRow>
                <FormRow>
                  <FormField label="Customer scope">
                    <select
                      className={`${selectCls} w-full`}
                      value={form.firstRideOnly ? "first-time" : form.customerScope}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          customerScope: e.target.value,
                          firstRideOnly: e.target.value === "first-time",
                        })
                      }
                    >
                      <option value="all">All customers</option>
                      <option value="first-time">First-time / first ride only</option>
                    </select>
                  </FormField>
                  <FormField label="Status">
                    <select
                      className={`${selectCls} w-full`}
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </FormField>
                </FormRow>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.waivePlatformFee}
                      onChange={(e) => setForm({ ...form, waivePlatformFee: e.target.checked })}
                    />
                    Waive platform fee
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.autoApply}
                      onChange={(e) => setForm({ ...form, autoApply: e.target.checked })}
                    />
                    Auto apply
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.showInBooking}
                      onChange={(e) => setForm({ ...form, showInBooking: e.target.checked })}
                    />
                    Show in booking
                  </label>
                </div>
              </FormSection>

              <FormSection title="Applicability">
                <FormField label="Zones (empty = all zones)">
                  <div className="flex flex-wrap gap-2">
                    {zones.map((z) => {
                      const on = (form.zoneIds || []).map(String).includes(String(z.id));
                      return (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => toggleMulti("zoneIds", z.id)}
                          className={`h-9 rounded-lg border px-3 text-xs font-semibold ${
                            on
                              ? "border-red-500 bg-red-50 text-red-700"
                              : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          {z.name}
                        </button>
                      );
                    })}
                    {!zones.length && (
                      <span className="text-xs text-muted-foreground">No zones configured</span>
                    )}
                  </div>
                </FormField>
                <FormField label="Vehicle types (empty = all)">
                  <div className="flex flex-wrap gap-2">
                    {vehicleTypes.map((v) => {
                      const on = (form.vehicleTypeIds || []).map(String).includes(String(v.id));
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => toggleMulti("vehicleTypeIds", v.id)}
                          className={`h-9 rounded-lg border px-3 text-xs font-semibold ${
                            on
                              ? "border-red-500 bg-red-50 text-red-700"
                              : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          {v.name}
                        </button>
                      );
                    })}
                    {!vehicleTypes.length && (
                      <span className="text-xs text-muted-foreground">No vehicle types configured</span>
                    )}
                  </div>
                </FormField>
              </FormSection>

              <FormSection title="Preview">
                <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4">
                  <p className="font-mono text-lg font-bold text-primary">{form.code || "CODE"}</p>
                  <p className="font-semibold mt-1">{form.name || "Coupon name"}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {form.description || "Description"}
                  </p>
                  <p className="text-sm mt-2 font-medium">
                    {discountLabel}
                    {Number(form.minFare) > 0 ? ` · Min fare ${formatCurrency(form.minFare)}` : ""}
                    {form.waivePlatformFee ? " · Platform fee waived" : ""}
                  </p>
                </div>
              </FormSection>
            </FormLayout>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1" /> Saving…
                </>
              ) : (
                "Save coupon"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader className="pr-8">
            <DialogTitle>Coupon — {detail?.code}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-semibold">{detail.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge status={detail.status} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Discount</p>
                  <p className="font-semibold">
                    {detail.discountType === "percentage"
                      ? `${detail.discountValue}%`
                      : formatCurrency(detail.discountValue)}
                    {detail.maxDiscount > 0 ? ` (max ${formatCurrency(detail.maxDiscount)})` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Used / Limit</p>
                  <p className="font-semibold">
                    {detail.usedCount} / {detail.usageLimit > 0 ? detail.usageLimit : "∞"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valid from</p>
                  <p className="font-semibold">{formatDateTime(detail.validFrom)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valid until</p>
                  <p className="font-semibold">{formatDateTime(detail.validUntil)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Audience</p>
                  <p className="font-semibold">
                    {detail.firstRideOnly || detail.customerScope === "first-time"
                      ? "First ride only"
                      : "All customers"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Discount given</p>
                  <p className="font-semibold">{formatCurrency(detail.totalDiscountGiven)}</p>
                </div>
              </div>
              <div className="text-sm">
                <p className="text-xs text-muted-foreground mb-1">Zones</p>
                <p className="font-medium">
                  {(detail.zones || []).map((z) => z.name).join(", ") || "All zones"}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-muted-foreground mb-1">Vehicles</p>
                <p className="font-medium">
                  {(detail.vehicles || []).map((v) => v.name).join(", ") || "All vehicle types"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {detail.waivePlatformFee ? <StatusBadge status="info" label="Waive platform fee" /> : null}
                {detail.autoApply ? <StatusBadge status="info" label="Auto apply" /> : null}
                {detail.showInBooking ? <StatusBadge status="success" label="Shown in booking" /> : null}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDetailOpen(false);
                openForm(detail);
              }}
            >
              Edit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader className="pr-8">
            <DialogTitle>Delete coupon?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Soft-delete <span className="font-semibold text-gray-900">{deleteTarget?.code}</span>. Past
            rides keep any discount already applied.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" disabled={deleting} onClick={confirmDelete}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Coupons;
