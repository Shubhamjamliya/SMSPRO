import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, Check, MapPin, Navigation, X } from "lucide-react";
import contractorApi from "../services/contractorApi";
import { dateTime } from "../../shared/format";
import ContractorShell from "../components/ContractorShell";
import { PhotoPicker } from "../../shared/FilePicker";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[15px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20";

const STATUS_TONE = {
  proposed: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-600",
  no_show: "bg-red-50 text-red-700",
};

const STATUS_LABEL = {
  proposed: "Awaiting confirmation",
  confirmed: "Confirmed",
  completed: "Recorded",
  cancelled: "Cancelled",
  no_show: "Not attended",
};

/**
 * BRD W8 + W9 — scheduling and the structured on-site form.
 *
 * The report is the point, not the appointment: it is what makes the quote
 * accurate and what protects both sides if site conditions are disputed later.
 * Check-in uses the device's GPS so the record shows the contractor was there.
 */
export default function Visits() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const enquiryId = params.get("enquiry");

  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [proposing, setProposing] = useState(Boolean(enquiryId));
  const [proposeAt, setProposeAt] = useState("");
  const [reporting, setReporting] = useState(null);
  const [locating, setLocating] = useState(false);
  const [report, setReport] = useState({
    measurements: "", siteCondition: "", access: "",
    waterAvailable: null, electricityAvailable: null,
    observations: "", photos: [],
  });
  const [coords, setCoords] = useState(null);

  const load = useCallback(async () => {
    try {
      setVisits(await contractorApi.listVisits());
    } catch (error) {
      toast.error(errorMessage(error, "Could not load your site visits"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const propose = async () => {
    if (!proposeAt) { toast.error("Pick a date and time"); return; }
    setBusy(true);
    try {
      await contractorApi.proposeVisit({
        enquiryId,
        scheduledAt: new Date(proposeAt).toISOString(),
      });
      toast.success("Visit proposed — the customer will confirm");
      setProposing(false);
      setProposeAt("");
      await load();
      navigate("/contractor/visits", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "Could not propose the visit"));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (id) => {
    setBusy(true);
    try {
      await contractorApi.confirmVisit(id);
      toast.success("Visit confirmed");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not confirm"));
    } finally {
      setBusy(false);
    }
  };

  /** BRD W9 — "the app records that the contractor was actually at the site." */
  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Your device does not support location");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.longitude, pos.coords.latitude]);
        setLocating(false);
        toast.success("Location captured");
      },
      () => {
        setLocating(false);
        toast.error("Could not read your location — you can still submit the report");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submitReport = async () => {
    if (!report.measurements.trim() && !report.observations.trim()) {
      toast.error("Record measurements or observations — the quote depends on them");
      return;
    }
    setBusy(true);
    try {
      await contractorApi.submitVisitReport(reporting._id, {
        report,
        checkIn: coords ? { coordinates: coords } : undefined,
      });
      toast.success("Site visit recorded — you can now build the quotation");
      setReporting(null);
      setCoords(null);
      setReport({
        measurements: "", siteCondition: "", access: "",
        waterAvailable: null, electricityAvailable: null, observations: "", photos: [],
      });
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not record the visit"));
    } finally {
      setBusy(false);
    }
  };

  const YesNo = ({ label, value, onChange }) => (
    <div>
      <p className="mb-1.5 text-sm font-medium text-gray-700">{label}</p>
      <div className="flex gap-2">
        {[["Yes", true], ["No", false], ["Not sure", null]].map(([text, v]) => (
          <button
            key={text}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors ${
              value === v
                ? "border-orange-500 bg-orange-50 text-orange-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <ContractorShell
      title="Site visits"
      subtitle={`${visits.filter((v) => ["proposed", "confirmed"].includes(v.status)).length} upcoming`}
    >
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : visits.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
            <CalendarClock className="h-7 w-7" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">No site visits</h2>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">
            Take on an enquiry, then arrange a visit. Quoting without seeing the site is how
            scope arguments start.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visits.map((v) => (
            <li key={v._id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {v.enquiryId?.serviceId?.name || "Site visit"}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-gray-400">
                    {v.enquiryId?.enquiryNumber}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[v.status]}`}>
                  {STATUS_LABEL[v.status]}
                </span>
              </div>

              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-gray-700">
                <CalendarClock className="h-3.5 w-3.5 text-gray-400" />
                {dateTime(v.scheduledAt)}
              </p>
              <p className="mt-1 flex items-start gap-1.5 text-[12px] text-gray-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span>
                  {[v.enquiryId?.site?.addressLine, v.enquiryId?.site?.area, v.enquiryId?.site?.city]
                    .filter(Boolean).join(", ")}
                </span>
              </p>

              {v.status === "proposed" && v.proposedBy === "customer" ? (
                <button
                  type="button"
                  onClick={() => confirm(v._id)}
                  disabled={busy}
                  className="mt-3 w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200"
                >
                  Confirm this time
                </button>
              ) : null}
              {v.status === "proposed" && v.proposedBy === "contractor" ? (
                <p className="mt-2.5 text-xs text-gray-500">Waiting for the customer to confirm.</p>
              ) : null}
              {v.status === "confirmed" ? (
                <button
                  type="button"
                  onClick={() => setReporting(v)}
                  className="mt-3 w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  Record the visit
                </button>
              ) : null}
              {v.status === "completed" && v.checkIn?.at ? (
                <p className="mt-2.5 inline-flex items-center gap-1 text-[11px] text-emerald-600">
                  <Check className="h-3 w-3" /> Checked in on site
                  {v.checkIn.distanceFromSiteMeters != null
                    ? ` · ${v.checkIn.distanceFromSiteMeters}m from the pin` : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* Propose a time */}
      {proposing ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="w-full rounded-t-2xl bg-white p-5 sm:max-w-sm sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-gray-900">Propose a visit time</h3>
              <button
                type="button"
                onClick={() => { setProposing(false); navigate("/contractor/visits", { replace: true }); }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="datetime-local"
              className={inputClass}
              value={proposeAt}
              min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)}
              onChange={(e) => setProposeAt(e.target.value)}
            />
            <button
              type="button"
              onClick={propose}
              disabled={busy || !proposeAt}
              className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-[15px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {busy ? "…" : "Propose"}
            </button>
          </div>
        </div>
      ) : null}

      {/* BRD W9 — the structured on-site form */}
      {reporting ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
          <header className="sticky top-0 border-b border-gray-100 bg-white/95 px-4 py-3.5 backdrop-blur">
            <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[17px] font-bold text-gray-900">Site visit report</h2>
                <p className="truncate text-xs text-gray-500">
                  {reporting.enquiryId?.enquiryNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReporting(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-lg space-y-4 px-4 py-5 pb-28">
            <p className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-[13px] leading-relaxed text-blue-900">
              This is what makes your quote accurate, and it protects you if site conditions
              are disputed later. Be specific.
            </p>

            <button
              type="button"
              onClick={captureLocation}
              disabled={locating}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-colors ${
                coords
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {coords ? <Check className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
              {locating ? "Reading location…" : coords ? "Location captured" : "Check in at the site"}
            </button>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Measurements<span className="ml-0.5 text-red-500">*</span>
              </span>
              <textarea
                className={inputClass}
                rows={3}
                placeholder="e.g. 30x50 plot, 1500 sqft built-up, ceiling 10ft"
                value={report.measurements}
                onChange={(e) => setReport((p) => ({ ...p, measurements: e.target.value }))}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Site condition</span>
              <textarea
                className={inputClass}
                rows={2}
                placeholder="e.g. Level ground, old boundary wall to be demolished"
                value={report.siteCondition}
                onChange={(e) => setReport((p) => ({ ...p, siteCondition: e.target.value }))}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Access for material</span>
              <select
                className={inputClass}
                value={report.access}
                onChange={(e) => setReport((p) => ({ ...p, access: e.target.value }))}
              >
                <option value="">Not recorded</option>
                <option value="easy">Easy — truck can reach</option>
                <option value="moderate">Moderate</option>
                <option value="difficult">Difficult — manual shifting needed</option>
              </select>
            </label>

            <YesNo
              label="Water available on site"
              value={report.waterAvailable}
              onChange={(v) => setReport((p) => ({ ...p, waterAvailable: v }))}
            />
            <YesNo
              label="Electricity available on site"
              value={report.electricityAvailable}
              onChange={(v) => setReport((p) => ({ ...p, electricityAvailable: v }))}
            />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Observations</span>
              <textarea
                className={inputClass}
                rows={3}
                placeholder="Anything that affects the price or the timeline"
                value={report.observations}
                onChange={(e) => setReport((p) => ({ ...p, observations: e.target.value }))}
              />
            </label>

            <PhotoPicker
              label="Photographs"
              hint="Dated photos of what you found. These back up your quote if conditions are disputed later."
              values={report.photos}
              folder="construction/site-visits"
              max={30}
              onChange={(photos) => setReport((p) => ({ ...p, photos }))}
            />
          </div>

          <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-4 py-3">
            <div className="mx-auto max-w-lg">
              <button
                type="button"
                onClick={submitReport}
                disabled={busy}
                className="w-full rounded-xl bg-orange-500 py-3.5 text-[15px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
              >
                {busy ? "Saving…" : "Save the report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ContractorShell>
  );
}
