import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Eye, Users, CheckCircle2, IndianRupee } from "lucide-react";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar, StatusBadge,
  FormLayout, FormSection, FormRow, FormField,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";
import { filterBySearch, sortItems, paginateItems, formatCurrency, formatDateTime } from "../utils/taxiTableHelpers";

const selectCls = "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxiAdminApi.getCustomers({
        limit: 100,
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: search.trim() || undefined,
      });
      setCustomers(data.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load customers");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const filtered = useMemo(() => {
    let rows = filterBySearch(customers, search, ["id", "name", "phone", "email"]);
    if (statusFilter === "active") rows = rows.filter((r) => r.isActive);
    if (statusFilter === "inactive") rows = rows.filter((r) => !r.isActive);
    return sortItems(rows, "totalRides", "desc");
  }, [customers, search, statusFilter]);

  const { items: pageItems, total, totalPages } = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const stats = useMemo(() => ({
    total: customers.length,
    active: customers.filter((c) => c.isActive).length,
    rides: customers.reduce((s, c) => s + Number(c.totalRides || 0), 0),
    wallet: customers.reduce((s, c) => s + Number(c.walletBalance || 0), 0),
  }), [customers]);

  const columns = [
    {
      key: "name", header: "Customer",
      cell: (row) => (
        <div className="flex items-center gap-3">
          {row.photo ? (
            <img src={row.photo} alt={row.name} className="w-9 h-9 rounded-full bg-gray-100 object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center text-sm font-semibold">
              {(row.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium">{row.name || "—"}</p>
            <p className="text-xs text-gray-500">{row.email || row.id.slice(-8)}</p>
          </div>
        </div>
      ),
    },
    {
      key: "phone", header: "Phone",
      cell: (row) => `${row.countryCode || ""} ${row.phone || ""}`.trim() || "—",
    },
    { key: "totalRides", header: "Rides", cell: (row) => row.totalRides || 0 },
    { key: "completedRides", header: "Completed", cell: (row) => row.completedRides || 0 },
    {
      key: "walletBalance", header: "Wallet",
      cell: (row) => formatCurrency(row.walletBalance),
    },
    {
      key: "status", header: "Status",
      cell: (row) => (
        <StatusBadge status={row.isActive ? "success" : "danger"} label={row.isActive ? "active" : "inactive"} />
      ),
    },
    {
      key: "actions", header: "Actions", align: "right",
      cell: (row) => (
        <Button variant="ghost" size="sm" onClick={() => { setSelected(row); setDetailOpen(true); }}>
          <Eye size={14} />
        </Button>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader title="Customers" description="Riders who have booked at least one taxi ride" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Taxi Customers" value={String(stats.total)} icon={<Users size={18} />} />
        <StatCard title="Active" value={String(stats.active)} icon={<CheckCircle2 size={18} />} />
        <StatCard title="Total Rides" value={String(stats.rides)} />
        <StatCard title="Wallet Total" value={formatCurrency(stats.wallet)} icon={<IndianRupee size={18} />} />
      </div>

      <SectionCard flush>
        <div className="p-4 space-y-4">
          <FilterBar
            start={
              <div className="flex flex-wrap gap-2 w-full">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search customers..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
                <select className={selectCls} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            }
          />
          <AdminTable
            columns={columns}
            data={pageItems}
            loading={loading}
            getRowId={(r) => r.id}
            pagination={{
              page,
              pageSize,
              total,
              totalPages,
              onPageChange: setPage,
              onPageSizeChange: (s) => { setPageSize(s); setPage(1); },
            }}
            emptyState={{ title: "No taxi customers yet", description: "Customers appear after they book their first taxi ride." }}
          />
        </div>
      </SectionCard>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader className="pr-8">
            <DialogTitle>{selected?.name || "Customer"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <FormLayout>
                <FormSection>
                  <FormRow>
                    <FormField label="Phone">
                      <div className="text-sm font-medium">
                        {`${selected.countryCode || ""} ${selected.phone || ""}`.trim() || "—"}
                      </div>
                    </FormField>
                    <FormField label="Email"><div className="text-sm font-medium">{selected.email || "—"}</div></FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Total rides"><div className="text-sm font-medium">{selected.totalRides || 0}</div></FormField>
                    <FormField label="Completed"><div className="text-sm font-medium">{selected.completedRides || 0}</div></FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Wallet"><div className="text-sm font-medium">{formatCurrency(selected.walletBalance)}</div></FormField>
                    <FormField label="Joined"><div className="text-sm">{formatDateTime(selected.createdAt)}</div></FormField>
                  </FormRow>
                </FormSection>
              </FormLayout>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
