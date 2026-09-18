import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineEye,
  HiOutlineMagnifyingGlass,
  HiOutlineTruck,
} from 'react-icons/hi2';
import { toast } from 'sonner';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../services/adminApi';

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const QcDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlineFilter, setOnlineFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const loadDrivers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await adminApi.getQcDrivers({
        limit: 100,
        search: searchTerm.trim() || undefined,
        onlineStatus: onlineFilter !== 'all' ? onlineFilter : undefined,
      });
      const items =
        response?.data?.result?.items ||
        response?.data?.result?.records ||
        response?.data?.result ||
        [];
      setDrivers(Array.isArray(items) ? items : []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load QC drivers');
      setDrivers([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, onlineFilter]);

  useEffect(() => {
    const t = setTimeout(loadDrivers, searchTerm ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadDrivers, searchTerm]);

  const stats = useMemo(() => ({
    total: drivers.length,
    online: drivers.filter((d) => d.onlineStatus === 'online').length,
    workingQc: drivers.filter((d) => d.activeWorkModule === 'quick-commerce').length,
  }), [drivers]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">QC Drivers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Drivers approved for Quick Commerce delivery
          </p>
        </div>
        <button
          type="button"
          onClick={loadDrivers}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <HiOutlineArrowPath className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Authorized</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Online now</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">{stats.online}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Working QC</p>
          <p className="mt-1 text-2xl font-black text-[#FF6A00]">{stats.workingQc}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, phone, vehicle..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#FF6A00]"
            />
          </div>
          <select
            value={onlineFilter}
            onChange={(e) => setOnlineFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#FF6A00]"
          >
            <option value="all">All availability</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-500">Loading drivers...</div>
        ) : drivers.length === 0 ? (
          <div className="py-16 text-center">
            <HiOutlineTruck className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-500">
              No QC-authorized drivers yet. Approve onboarding requests first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-bold">Driver</th>
                  <th className="px-3 py-2 font-bold">Phone</th>
                  <th className="px-3 py-2 font-bold">Vehicle</th>
                  <th className="px-3 py-2 font-bold">Availability</th>
                  <th className="px-3 py-2 font-bold">Active module</th>
                  <th className="px-3 py-2 font-bold">Approved</th>
                  <th className="px-3 py-2 font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        {driver.photo ? (
                          <img src={driver.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-sm font-bold text-[#FF6A00]">
                            {(driver.name || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-900">{driver.name || '—'}</p>
                          <p className="text-[11px] text-slate-400">{driver.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-700">{driver.phone || '—'}</td>
                    <td className="px-3 py-3 text-slate-600">
                      <div>{driver.vehicleType || '—'}</div>
                      <div className="text-[11px] text-slate-400">{driver.vehicleNumber || ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant={driver.onlineStatus === 'online' ? 'success' : 'gray'}
                      >
                        {driver.onlineStatus === 'online' ? 'Online' : 'Offline'}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {driver.activeWorkModule || '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-500">{formatDate(driver.approvedAt || driver.updatedAt)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(driver)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-[#FF6A00]/40 hover:text-[#FF6A00]"
                      >
                        <HiOutlineEye className="h-3.5 w-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">{selected.name}</h2>
                <p className="text-sm text-slate-500">{selected.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <p><span className="font-semibold text-slate-500">Email:</span> {selected.email || '—'}</p>
              <p><span className="font-semibold text-slate-500">Vehicle:</span> {selected.vehicleType || '—'} {selected.vehicleNumber ? `(${selected.vehicleNumber})` : ''}</p>
              <p><span className="font-semibold text-slate-500">Online:</span> {selected.onlineStatus || 'offline'}</p>
              <p><span className="font-semibold text-slate-500">Active module:</span> {selected.activeWorkModule || '—'}</p>
              <p><span className="font-semibold text-slate-500">Services:</span> {(selected.authorizedServices || []).join(', ') || '—'}</p>
              <p><span className="font-semibold text-slate-500">Rating:</span> {Number(selected.rating || 0).toFixed(1)} ({selected.totalRatings || 0})</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default QcDrivers;
