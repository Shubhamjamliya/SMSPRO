import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Calendar, Clock, Loader2, Plus, Trash2, X } from "lucide-react";
import ServiceProviderLayout from "../components/ServiceProviderLayout";
import serviceProviderApi from "../services/providerApi";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const defaultSchedule = () =>
  DAY_NAMES.map((_, dayOfWeek) => ({ dayOfWeek, isEnabled: false, startTime: "09:00", endTime: "18:00", breaks: [] }));

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-600 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-[2px]">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputClass = "rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15";
const wideInputClass = `w-full ${inputClass}`;
const labelClass = "mb-1.5 block text-xs font-bold text-gray-600";
const smallBtnClass = "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:border-[#FF6A00] hover:text-[#FF6A00]";

const EMPTY_UNAVAILABLE_FORM = { date: "", isFullDay: true, startTime: "", endTime: "", reason: "" };

const warnConflicts = (conflicts) => {
  if (!conflicts?.length) return;
  toast.warning(
    `${conflicts.length} existing booking${conflicts.length === 1 ? "" : "s"} no longer fit this — they were NOT cancelled. Please review and contact the customer if needed.`,
  );
};

export default function ServiceProviderAvailabilityPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [unavailableDates, setUnavailableDates] = useState([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_UNAVAILABLE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await serviceProviderApi.getAvailability();
      if (Array.isArray(result.schedule) && result.schedule.length === 7) {
        setSchedule([...result.schedule].sort((a, b) => a.dayOfWeek - b.dayOfWeek));
      }
      setBufferMinutes(result.bufferMinutes || 0);
      setUnavailableDates(result.unavailableDates || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load availability");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDay = (dayOfWeek) => {
    setSchedule((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, isEnabled: !d.isEnabled } : d)),
    );
  };

  const setDayField = (dayOfWeek, key, value) => {
    setSchedule((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, [key]: value } : d)));
  };

  const addBreak = (dayOfWeek) => {
    setSchedule((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, breaks: [...d.breaks, { startTime: "13:00", endTime: "14:00" }] } : d)),
    );
  };

  const removeBreak = (dayOfWeek, index) => {
    setSchedule((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, breaks: d.breaks.filter((_, i) => i !== index) } : d)),
    );
  };

  const setBreakField = (dayOfWeek, index, key, value) => {
    setSchedule((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek ? { ...d, breaks: d.breaks.map((b, i) => (i === index ? { ...b, [key]: value } : b)) } : d,
      ),
    );
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      const result = await serviceProviderApi.updateSchedule(schedule, Number(bufferMinutes) || 0);
      toast.success("Schedule updated");
      warnConflicts(result.conflictingBookings);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save schedule");
    } finally {
      setSaving(false);
    }
  };

  const openAddUnavailable = () => {
    setForm(EMPTY_UNAVAILABLE_FORM);
    setDialogOpen(true);
  };

  const submitUnavailable = async () => {
    if (!form.date) return toast.error("Select a date");
    if (!form.isFullDay && (!form.startTime || !form.endTime)) {
      return toast.error("Enter a start and end time");
    }
    setSubmitting(true);
    try {
      const result = await serviceProviderApi.addUnavailableDate(form);
      toast.success("Unavailable date added");
      warnConflicts(result.conflictingBookings);
      setDialogOpen(false);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not add unavailable date");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRemoveUnavailable = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await serviceProviderApi.removeUnavailableDate(deleting._id);
      toast.success("Removed");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not remove");
    } finally {
      setDeletingBusy(false);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <ServiceProviderLayout
      title="My Availability"
      subtitle="Set your working hours, breaks and days off — bookable customer slots are calculated automatically."
      fullWidth
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
                  <Clock className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold text-gray-900">Weekly schedule</h2>
                  <p className="text-xs text-gray-500">Turn on the days you work, then set your hours and breaks</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 sm:self-auto">
                <span className="text-xs font-bold text-gray-600">Buffer between bookings</span>
                <input
                  type="number"
                  min="0"
                  max="240"
                  className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm font-semibold outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15"
                  value={bufferMinutes}
                  onChange={(e) => setBufferMinutes(e.target.value)}
                />
                <span className="text-xs text-gray-400">min</span>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {schedule.map((day) => (
                <div
                  key={day.dayOfWeek}
                  className={`p-4 transition-colors sm:p-6 ${day.isEnabled ? "" : "bg-gray-50/70"}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex shrink-0 items-center gap-3 sm:w-40">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={day.isEnabled}
                        onClick={() => toggleDay(day.dayOfWeek)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                          day.isEnabled ? "bg-[#FF6A00]" : "bg-gray-300"
                        }`}
                        aria-label={`Toggle ${DAY_NAMES[day.dayOfWeek]}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            day.isEnabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                      <span className="truncate text-sm font-bold text-gray-800">{DAY_NAMES[day.dayOfWeek]}</span>
                    </div>

                    {day.isEnabled ? (
                      <div className="flex flex-wrap items-center gap-2 sm:flex-1">
                        <input
                          type="time"
                          className={`${inputClass} w-[124px]`}
                          value={day.startTime}
                          onChange={(e) => setDayField(day.dayOfWeek, "startTime", e.target.value)}
                        />
                        <span className="text-xs font-medium text-gray-400">to</span>
                        <input
                          type="time"
                          className={`${inputClass} w-[124px]`}
                          value={day.endTime}
                          onChange={(e) => setDayField(day.dayOfWeek, "endTime", e.target.value)}
                        />
                      </div>
                    ) : (
                      <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-gray-400">
                        Closed
                      </span>
                    )}
                  </div>

                  {day.isEnabled ? (
                    <div className="mt-3 space-y-2 sm:ml-[176px]">
                      {day.breaks.map((brk, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <span className="shrink-0 text-xs font-semibold text-gray-400">Break</span>
                          <input
                            type="time"
                            className={`${inputClass} w-[124px]`}
                            value={brk.startTime}
                            onChange={(e) => setBreakField(day.dayOfWeek, i, "startTime", e.target.value)}
                          />
                          <span className="text-xs font-medium text-gray-400">to</span>
                          <input
                            type="time"
                            className={`${inputClass} w-[124px]`}
                            value={brk.endTime}
                            onChange={(e) => setBreakField(day.dayOfWeek, i, "endTime", e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeBreak(day.dayOfWeek, i)}
                            className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                            aria-label="Remove break"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addBreak(day.dayOfWeek)} className={smallBtnClass}>
                        <Plus className="h-3.5 w-3.5" /> Add break
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-gray-100 bg-gray-50/60 p-4 sm:p-6">
              <button
                type="button"
                onClick={saveSchedule}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#e65f00] disabled:opacity-60 sm:w-auto sm:px-8"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save schedule
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
                  <Calendar className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold text-gray-900">Unavailable dates</h2>
                  <p className="text-xs text-gray-500">
                    {unavailableDates.length} blocked date{unavailableDates.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openAddUnavailable}
                className={`${smallBtnClass} self-start sm:self-auto`}
              >
                <Plus className="h-3.5 w-3.5" /> Add unavailable date
              </button>
            </div>
            <div className="p-4 sm:p-6">
              {unavailableDates.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  No unavailable dates added yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {unavailableDates.map((entry) => (
                    <div
                      key={entry._id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">{entry.date}</p>
                        <p className="text-xs text-gray-500">
                          {entry.isFullDay ? "Full day" : `${entry.startTime} – ${entry.endTime}`}
                        </p>
                        {entry.reason ? <p className="mt-1 truncate text-[11px] text-gray-400">{entry.reason}</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeleting(entry)}
                        className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                        aria-label="Remove unavailable date"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal open={dialogOpen} title="Add unavailable date" onClose={() => setDialogOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>
              Date<span className="ml-0.5 text-red-500">*</span>
            </label>
            <input
              type="date"
              min={todayStr}
              className={wideInputClass}
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="accent-[#FF6A00]"
              checked={form.isFullDay}
              onChange={(e) => setForm((f) => ({ ...f, isFullDay: e.target.checked }))}
            />
            Block the whole day
          </label>

          {!form.isFullDay ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start time</label>
                <input
                  type="time"
                  className={wideInputClass}
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelClass}>End time</label>
                <input
                  type="time"
                  className={wideInputClass}
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className={labelClass}>Reason (optional)</label>
            <textarea
              rows={2}
              placeholder="e.g. Personal leave"
              className={wideInputClass}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitUnavailable}
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(deleting)} title="Remove unavailable date?" onClose={() => setDeleting(null)}>
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-gray-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            Remove the unavailable entry for <strong className="font-bold text-gray-900">&nbsp;{deleting?.date}</strong>? This
            date will become bookable again.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={deletingBusy}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemoveUnavailable}
              disabled={deletingBusy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {deletingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Remove
            </button>
          </div>
        </div>
      </Modal>
    </ServiceProviderLayout>
  );
}
