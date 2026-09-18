import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Pencil, Eye, Trash2, MapPin } from "lucide-react";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar, StatusBadge,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";
import { filterBySearch, paginateItems } from "../utils/taxiTableHelpers";

const selectCls = "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const Zones = () => {
  const navigate = useNavigate();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadZones = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxiAdminApi.getZones({
        limit: 100,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setZones(data.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to load zones");
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  const filtered = useMemo(() => {
    let rows = filterBySearch(zones, search, ["name", "country", "polygon"]);
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    return rows;
  }, [zones, search, statusFilter]);

  const { items: pageItems, total, totalPages } = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete zone "${row.name}"?`)) return;
    try {
      await taxiAdminApi.deleteZone(row.id);
      toast.success("Zone deleted");
      await loadZones();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete zone");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Zone",
      cell: (row) => (
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <MapPin size={16} />
          </div>
          <div>
            <p className="font-semibold">{row.name}</p>
            <p className="text-xs text-gray-500">{row.country}</p>
          </div>
        </div>
      ),
    },
    {
      key: "polygon",
      header: "Area",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {Array.isArray(row.coordinates) && row.coordinates.length >= 3
            ? `${row.coordinates.length}-point polygon`
            : row.polygon || "No polygon"}
        </span>
      ),
    },
    { key: "unit", header: "Unit", cell: (row) => row.unit || "kilometer" },
    { key: "displayOrder", header: "Order" },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status === "active" ? "success" : "default"} label={row.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/taxi/zones/view/${row.id}`)} title="View">
            <Eye size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/taxi/zones/edit/${row.id}`)} title="Edit">
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDelete(row)} title="Delete">
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Taxi Service Zones"
        description="Draw service areas on the map — same flow as Food zone setup"
        actions={
          <Button onClick={() => navigate("/admin/taxi/zones/add")}>
            <Plus className="mr-2 h-4 w-4" /> Add Zone
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total zones" value={String(zones.length)} />
        <StatCard title="Active" value={String(zones.filter((z) => z.status === "active").length)} />
        <StatCard title="Inactive" value={String(zones.filter((z) => z.status !== "active").length)} />
      </div>

      <SectionCard flush>
        <FilterBar
          start={
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Search zones…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          }
          end={
            <select
              className={selectCls}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
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
            onPageSizeChange: setPageSize,
          }}
          emptyState={{
            title: "No taxi zones yet",
            description: "Create a zone and draw its service area on the map.",
            action: (
              <Button onClick={() => navigate("/admin/taxi/zones/add")}>
                <Plus className="mr-2 h-4 w-4" /> Add Zone
              </Button>
            ),
          }}
        />
      </SectionCard>
    </div>
  );
};

export default Zones;
