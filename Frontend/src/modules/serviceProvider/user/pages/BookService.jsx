import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Sparkles,
  Star,
  User,
} from "lucide-react";
import { ServiceProviderPageShell, ServiceProviderPageHeader } from "../components/ui";
import serviceProviderApi from "../../provider/services/providerApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const UNAVAILABLE_MESSAGES = {
  service_unavailable: "This service is not currently active.",
  no_providers: "No providers currently offer this service in your zone.",
  fully_booked: "No slots left on this date — try another date.",
  past_date: "Please pick a future date.",
  invalid_request: "Please select a date.",
};

const nextDays = (count) => {
  const days = [];
  const today = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
    days.push({ iso, label, isToday: i === 0 });
  }
  return days;
};

export default function ServiceProviderBookServicePage() {
  const { serviceId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const service = location.state?.service;
  const zoneId = location.state?.zoneId;
  const zoneName = location.state?.zoneName;

  const days = useMemo(() => nextDays(14), []);
  const [selectedDate, setSelectedDate] = useState(days[0]?.iso || "");

  const [slotsResult, setSlotsResult] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [mode, setMode] = useState("auto");
  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState("");

  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const fetchZoneSlots = useCallback(async () => {
    if (!selectedDate) return;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setProviders([]);
    setSelectedProviderId("");
    try {
      const result = await serviceProviderApi.getZoneSlots({ serviceId, zoneId, date: selectedDate });
      setSlotsResult(result);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load available slots");
      setSlotsResult({ slots: [] });
    } finally {
      setSlotsLoading(false);
    }
  }, [serviceId, zoneId, selectedDate]);

  useEffect(() => {
    fetchZoneSlots();
  }, [fetchZoneSlots]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error("Allow location access to set the service location");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    if (mode !== "specific" || !selectedSlot || !coords) {
      return;
    }
    let cancelled = false;
    (async () => {
      setProvidersLoading(true);
      try {
        const result = await serviceProviderApi.getEligibleProviders({
          serviceId, date: selectedDate, startTime: selectedSlot.startTime, lat: coords.lat, lng: coords.lng,
        });
        if (!cancelled) setProviders(result.providers || []);
      } catch (error) {
        if (!cancelled) toast.error(error?.response?.data?.message || "Could not load providers");
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedSlot, selectedDate, serviceId, coords]);

  const sendRequest = useCallback(async () => {
    if (!selectedSlot || !coords || submitting) return;
    if (mode === "specific" && !selectedProviderId) {
      toast.error("Select a provider to continue");
      return;
    }
    setSubmitting(true);
    try {
      const booking = await serviceProviderApi.createBookingRequest({
        serviceId,
        date: selectedDate,
        startTime: selectedSlot.startTime,
        mode,
        providerId: mode === "specific" ? selectedProviderId : undefined,
        serviceLocation: { lat: coords.lat, lng: coords.lng, address: address.trim() },
      });
      toast.success("Booking request sent");
      navigate(`/services/requests/${booking._id}`, { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not send booking request");
      setSelectedSlot(null);
      fetchZoneSlots();
    } finally {
      setSubmitting(false);
    }
  }, [selectedSlot, coords, submitting, mode, selectedProviderId, serviceId, selectedDate, address, navigate, fetchZoneSlots]);

  if (!service || !zoneId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F8] px-4">
        <div className="max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-700">Please go back and select a service again.</p>
          <button
            type="button"
            onClick={() => navigate("/services")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to services
          </button>
        </div>
      </div>
    );
  }

  const pricing = slotsResult?.pricing;
  const canReview = Boolean(selectedSlot) && Boolean(coords) && (mode === "auto" || Boolean(selectedProviderId));

  return (
    <ServiceProviderPageShell>
      <ServiceProviderPageHeader title={service.name} subtitle={service.categoryName || zoneName} backTo="/services" />

      <div className="px-4 py-4 sm:px-6">
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          {service.icon ? (
            <img src={service.icon} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-gray-100 object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900">{service.name}</p>
            {service.categoryName ? <p className="text-xs text-gray-400">{service.categoryName}</p> : null}
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3.5 w-3.5 text-[#FF6A00]" /> {zoneName}
            </p>
            <p className="mt-1 text-sm font-extrabold text-[#FF6A00]">{money(service.price ?? service.basePrice)}</p>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
            <CalendarDays className="h-3.5 w-3.5" /> Choose a date
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => (
              <button
                key={d.iso}
                type="button"
                onClick={() => setSelectedDate(d.iso)}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${
                  selectedDate === d.iso ? "bg-[#FF6A00] text-white" : "border border-gray-200 text-gray-600"
                }`}
              >
                {d.isToday ? "Today" : d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
            <Clock className="h-3.5 w-3.5" /> Choose a time
          </p>
          {slotsLoading ? (
            <p className="text-sm text-gray-400">Loading slots…</p>
          ) : !slotsResult?.slots?.length ? (
            <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
              {UNAVAILABLE_MESSAGES[slotsResult?.unavailableReason] || "No slots available on this date."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slotsResult.slots.map((slot) => (
                <button
                  key={slot.startTime}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-lg px-2 py-2 text-xs font-bold ${
                    selectedSlot?.startTime === slot.startTime
                      ? "bg-[#FF6A00] text-white"
                      : "border border-gray-200 text-gray-700 hover:border-[#FF6A00]"
                  }`}
                >
                  {slot.startTime}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedSlot ? (
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">How should we match a provider?</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setMode("auto")}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                  mode === "auto" ? "border-[#FF6A00] bg-orange-50/50" : "border-gray-200"
                }`}
              >
                <Sparkles className="h-5 w-5 shrink-0 text-[#FF6A00]" />
                <div>
                  <p className="text-sm font-bold text-gray-800">Find a provider for me</p>
                  <p className="text-xs text-gray-500">We&apos;ll match the best available provider automatically</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("specific")}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                  mode === "specific" ? "border-[#FF6A00] bg-orange-50/50" : "border-gray-200"
                }`}
              >
                <User className="h-5 w-5 shrink-0 text-[#FF6A00]" />
                <div>
                  <p className="text-sm font-bold text-gray-800">Choose a provider</p>
                  <p className="text-xs text-gray-500">Pick from providers available at this time</p>
                </div>
              </button>
            </div>

            {mode === "specific" ? (
              <div className="mt-3 space-y-2">
                {providersLoading ? (
                  <p className="text-sm text-gray-400">Loading providers…</p>
                ) : !coords ? (
                  <p className="text-sm text-gray-400">Set your service location below to see providers.</p>
                ) : providers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
                    No providers available at this exact time.
                  </p>
                ) : (
                  providers.map((p) => (
                    <label
                      key={p._id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${
                        selectedProviderId === p._id ? "border-[#FF6A00] bg-orange-50/50" : "border-gray-100"
                      }`}
                    >
                      <input
                        type="radio"
                        name="provider"
                        className="accent-[#FF6A00]"
                        checked={selectedProviderId === p._id}
                        onChange={() => setSelectedProviderId(p._id)}
                      />
                      {p.profileImage ? (
                        <img src={p.profileImage} alt="" className="h-9 w-9 shrink-0 rounded-full border border-gray-100 object-cover" />
                      ) : (
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-300">
                          <User className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-gray-800">{p.ownerName}</span>
                        <span className="flex items-center gap-2 text-xs text-gray-400">
                          {p.rating > 0 ? (
                            <span className="flex items-center gap-0.5 text-amber-500">
                              <Star className="h-3 w-3 fill-current" /> {p.rating.toFixed(1)}
                            </span>
                          ) : (
                            <span>New</span>
                          )}
                          {p.experience ? <span>· {p.experience}</span> : null}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {selectedSlot ? (
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
              <MapPin className="h-3.5 w-3.5" /> Service location
            </p>
            <button
              type="button"
              onClick={requestLocation}
              disabled={locating}
              className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-600 disabled:opacity-60"
            >
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
              {coords ? "Update current location" : "Use my current location"}
            </button>
            {coords ? (
              <p className="mb-2 text-xs text-emerald-600">Location set ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})</p>
            ) : (
              <p className="mb-2 text-xs text-amber-600">Location required to send the request</p>
            )}
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Flat / house no., landmark (optional)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15"
            />
          </div>
        ) : null}

        {selectedSlot && pricing ? (
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Booking summary</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Service</span>
                <span className="font-semibold text-gray-800">{service.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date &amp; time</span>
                <span className="font-semibold text-gray-800">
                  {selectedDate} · {selectedSlot.startTime}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="font-semibold text-gray-800">{slotsResult?.service?.duration} min</span>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-dashed border-gray-200 pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Service price</span>
                <span>{money(pricing.adminPrice)}</span>
              </div>
              {pricing.platformFee > 0 ? (
                <div className="flex justify-between">
                  <span className="text-gray-500">Platform fee</span>
                  <span>{money(pricing.platformFee)}</span>
                </div>
              ) : null}
              {pricing.taxAmount > 0 ? (
                <div className="flex justify-between">
                  <span className="text-gray-500">Tax</span>
                  <span>{money(pricing.taxAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-gray-100 pt-1.5 text-base font-black text-gray-900">
                <span>Total</span>
                <span>{money(pricing.totalAmount)}</span>
              </div>
              <p className="pt-1 text-[11px] text-gray-400">
                Paid after the service is completed and confirmed. Extra charges (if any) are added on top with your approval.
              </p>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={!canReview || submitting}
          onClick={sendRequest}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {!selectedSlot ? "Select a time to continue" : submitting ? "Sending request…" : "Send booking request"}
        </button>
      </div>
    </ServiceProviderPageShell>
  );
}
