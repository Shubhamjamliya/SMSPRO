import React, { useState } from "react";
import {
  IndianRupee, Package, TrendingUp, Truck, Download, FileText, FileSpreadsheet,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  PageHeader, SectionCard, StatCard, AdminTable, JUST_ORDER_CHART,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { formatCurrency } from "../utils/porterTableHelpers";

const PIE_COLORS = JUST_ORDER_CHART?.series || ["#FF6A00", "#2563EB", "#2E7D32", "#F59E0B", "#7C3AED", "#DC2626"];

const EMPTY_KPIS = {
  totalRevenue: formatCurrency(0),
  totalOrders: "0",
  avgOrderValue: formatCurrency(0),
  fleetUtilization: "0%",
};

const Reports = () => {
  const [range, setRange] = useState("monthly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const revenueData = [];
  const vehicleUtilization = [];
  const zonePerformance = [];
  const topDrivers = [];
  const topVehicles = [];
  const driverPerformance = [];

  const exportCsv = () => {
    const headers = ["Period", "Revenue", "Orders"];
    const csv = [headers].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "porter-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const driverColumns = [
    { key: "name", header: "Driver", cell: (row) => <span className="font-medium">{row.name}</span> },
    { key: "orders", header: "Orders", cell: (row) => String(row.orders) },
    { key: "rating", header: "Rating", cell: (row) => <span className="text-amber-600">★ {row.rating}</span> },
    { key: "earnings", header: "Earnings", align: "right", cell: (row) => formatCurrency(row.earnings) },
  ];
  const vehicleColumns = [
    { key: "name", header: "Vehicle", cell: (row) => <span className="font-medium">{row.name}</span> },
    { key: "orders", header: "Orders", cell: (row) => String(row.orders) },
    { key: "availability", header: "Availability", align: "right" },
  ];

  const selectCls =
    "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Reports & Analytics"
        description="Operational and financial insights across the logistics network"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => window.print()}>
              <FileText size={16} /> Export PDF
            </Button>
            <Button className="gap-2" onClick={exportCsv}>
              <FileSpreadsheet size={16} /> Export Excel
            </Button>
          </div>
        }
      />

      <SectionCard flush>
        <div className="p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Date Range:</span>
          <select className={selectCls} value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <Input type="date" className="w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="text-muted-foreground">to</span>
          <Input type="date" className="w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Button variant="outline" size="sm" className="gap-1 ml-auto" onClick={exportCsv}>
            <Download size={14} /> Download Report
          </Button>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={EMPTY_KPIS.totalRevenue} icon={<IndianRupee size={18} />} />
        <StatCard title="Total Orders" value={EMPTY_KPIS.totalOrders} icon={<Package size={18} />} />
        <StatCard title="Avg Order Value" value={EMPTY_KPIS.avgOrderValue} icon={<TrendingUp size={18} />} />
        <StatCard title="Fleet Utilization" value={EMPTY_KPIS.fleetUtilization} icon={<Truck size={18} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="Revenue Trend" subtitle={`${range} revenue`} className="lg:col-span-2" flush>
          <div className="h-72 p-4">
            {revenueData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No revenue data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF6A00" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FF6A00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#FF6A00" fill="url(#revFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Vehicle Mix" flush>
          <div className="h-72 p-4">
            {vehicleUtilization.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No vehicle data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={vehicleUtilization} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {vehicleUtilization.map((entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Driver Performance" flush>
          <div className="h-72 p-4">
            {driverPerformance.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No driver performance data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={driverPerformance}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Zone Performance" flush>
          <div className="h-72 p-4">
            {zonePerformance.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No zone performance data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zonePerformance} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={80} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#2E7D32" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Top Drivers">
          <AdminTable columns={driverColumns} data={topDrivers} getRowId={(r) => r.name} />
        </SectionCard>
        <SectionCard title="Top Vehicles">
          <AdminTable columns={vehicleColumns} data={topVehicles} getRowId={(r) => r.name} />
        </SectionCard>
      </div>
    </div>
  );
};

export default Reports;
