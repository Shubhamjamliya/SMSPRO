import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Check, CheckCircle2, ClipboardCheck, Clock, KeyRound, MapPin, Navigation, Phone, Ruler,
} from "lucide-react";
import contractorApi from "../services/contractorApi";
import { dateTime, fullMoney } from "../../shared/format";
import { PhotoPicker } from "../../shared/FilePicker";
import ContractorShell from "../components/ContractorShell";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const STEPS = [
  { key: "assigned", label: "Assigned" },
  { key: "on_the_way", label: "On the way" },
  { key: "arrived", label: "At site" },
  { key: "report_submitted", label: "Report sent" },
];

const ACCESS_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "difficult", label: "Difficult" },
];

const EMPTY_REPORT = {
  plotAreaSqft: "",
  builtUpAreaSqft: "",
  floorsPlanned: "",
  measurements: "",
  siteCondition: "",
  access: "",
  waterAvailable: null,
  electricityAvailable: null,
  recommendedScope: "",
  estimatedDurationDays: "",
  observations: "",
  notesForOffice: "",
  photos: [],
};

/** The server's report back into form state: numbers as strings, blanks as empty. */
const toForm = (report) => {
  if (!report) return { ...EMPTY_REPORT };
  const next = { ...EMPTY_REPORT };
  Object.keys(EMPTY_REPORT).forEach((key) => {
    const value = report[key];
    if (value === null || value === undefined) return;
    next[key] = typeof value === "number" ? String(value) : value;
  });
  return next;
};

/** One optional coordinate read. A refusal or timeout just means "no location", never a blocked step. */
const readLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 },
    );
  });

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-[14px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:bg-gray-50";

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-gray-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-gray-400">{hint}</span> : null}
    </label>
  );
}

function YesNo({ value, onChange, disabled }) {
  return (
    <div className="flex gap-2">
      {[[true, "Yes"], [false, "No"]].map(([v, label]) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === v ? null : v)}
          className={`flex-1 rounded-lg border py-2 text-[13px] font-semibold transition-colors ${
            value === v ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 text-gray-600"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ stage }) {
  const current = Math.max(0, STEPS.findIndex((s) => s.key === stage));
  return (
    <ol className="flex items-start">
      {STEPS.map((step, i) => {
        const done = i < current || stage === "report_submitted";
        const active = i === current && stage !== "report_submitted";
        return (
          <li key={step.key} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 ? (
              <span
                className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 ${
                  i <= current || stage === "report_submitted" ? "bg-orange-500" : "bg-gray-200"
                }`}
              />
            ) : null}
            <span
              className={`relative z-1 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                done
                  ? "bg-orange-500 text-white"
                  : active
                    ? "bg-white text-orange-600 ring-2 ring-orange-500"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`mt-1.5 text-[10px] font-semibold leading-tight ${done || active ? "text-gray-800" : "text-gray-400"}`}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One booking, and everything the contractor does for its site visit:
 * accept it, start the journey, confirm arrival with the customer's OTP, then send the
 * measurements and photos to the office as the site visit report.
 */
export default function PackageRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [otp, setOtp] = useState("");
  const [form, setForm] = useState({ ...EMPTY_REPORT });
  // Whether the contractor is mid-edit: a background refresh must never overwrite their typing.
  const formDirtyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await contractorApi.getPackageRequest(id);
      setRequest(next);
      setForm((current) => (formDirtyRef.current ? current : toForm(next?.visit?.report)));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load this request"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = setInterval(refresh, 20000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const run = async (name, fn, success) => {
    setBusy(name);
    try {
      const next = await fn();
      if (next) setRequest(next);
      if (success) toast.success(success);
      return next;
    } catch (error) {
      toast.error(errorMessage(error, "That did not work. Please try again."));
      await load();
      return null;
    } finally {
      setBusy("");
    }
  };

  const setField = (key, value) => {
    formDirtyRef.current = true;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const accept = () => run("accept", async () => {
    await contractorApi.acceptPackageRequest(id);
    return contractorApi.getPackageRequest(id);
  }, "It's yours — the customer's details are now shown");

  const confirmTheContract = async () => {
    const result = await run(
      "contract-confirm",
      () => contractorApi.confirmPackageContract(id),
      "Confirmed — your site visit fee has been refunded",
    );
    if (result?.project?._id) {
      navigate(`/contractor/projects/${result.project._id}`);
    }
  };

  const declineTheContract = async () => {
    const note = window.prompt("Tell the customer why you can't take this on (optional). This does not refund your site visit fee.");
    if (note === null) return;
    await run("contract-decline", async () => {
      await contractorApi.declinePackageContract(id, note.trim());
      return contractorApi.getPackageRequest(id);
    }, "Told the customer you can't take this on");
  };

  const decline = async () => {
    if (!window.confirm("Pass on this request? It goes to other contractors.")) return;
    setBusy("decline");
    try {
      await contractorApi.declinePackageRequest(id, { reason: "other" });
      toast.success("Declined");
      navigate("/contractor/package-requests", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "Could not decline this request"));
      setBusy("");
    }
  };

  const startJourney = () => run("start", async () => {
    const location = await readLocation();
    return contractorApi.startJourney(id, location);
  }, "The customer has been told you are on the way");

  const confirmArrival = () => run("otp", async () => {
    const location = await readLocation();
    const next = await contractorApi.confirmArrival(id, otp.trim(), location);
    setOtp("");
    return next;
  }, "Visit confirmed — you can fill in the site report");

  const buildReport = () => ({
    ...form,
    plotAreaSqft: form.plotAreaSqft,
    photos: form.photos,
  });

  const saveDraft = () => run("draft", async () => {
    const next = await contractorApi.saveVisitReport(id, buildReport(), false);
    formDirtyRef.current = false;
    return next;
  }, "Draft saved");

  const sendReport = async () => {
    if (!window.confirm("Send this report to the office? You cannot change it afterwards.")) return;
    await run("submit", async () => {
      const next = await contractorApi.saveVisitReport(id, buildReport(), true);
      formDirtyRef.current = false;
      return next;
    }, "Report sent to the office");
  };

  if (loading) {
    return (
      <ContractorShell title="Site visit">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      </ContractorShell>
    );
  }

  if (!request) {
    return (
      <ContractorShell title="Site visit">
        <p className="py-16 text-center text-sm text-gray-500">This request is not available to you.</p>
        <button
          type="button"
          onClick={() => navigate("/contractor/package-requests")}
          className="mx-auto block rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
        >
          Back to requests
        </button>
      </ContractorShell>
    );
  }

  const stage = request.visit?.stage || "assigned";
  const mine = request.assignedToMe;
  const locked = stage === "report_submitted";
  const address = [request.site?.area, request.site?.city].filter(Boolean).join(", ");
  // The customer's pin gives turn-by-turn directions to the plot; without one, search the address text.
  const exact = request.siteExact;
  const mapsUrl = Number.isFinite(exact?.lat) && Number.isFinite(exact?.lng)
    ? `https://www.google.com/maps/dir/?api=1&destination=${exact.lat},${exact.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exact?.address || address)}`;

  return (
    <ContractorShell title="Site visit" subtitle={request.reference}>
      <button
        type="button"
        onClick={() => navigate("/contractor/package-requests")}
        className="-mt-1 mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" /> All requests
      </button>

      {/* Booking summary */}
      <div className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold text-gray-900">{request.package?.name}</p>
            <p className="mt-0.5 text-[12px] capitalize text-gray-500">
              {request.package?.segment === "budget_service" ? "Budget Friendly service" : `${request.package?.segment} package`}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-700">
            {request.estimatedCost != null ? `≈ ${fullMoney(request.estimatedCost)}` : "Quoted after visit"}
          </span>
        </div>
        <div className="mt-3 space-y-1.5 text-[13px] text-gray-600">
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>{address}</span>
          </p>
          <p>
            {Number(request.site?.totalBuiltUpArea || 0).toLocaleString("en-IN")} sq.ft
            {request.site?.floors ? ` · ${request.site.floors} floor${request.site.floors === 1 ? "" : "s"}` : ""}
            {` · wants to start: ${request.startWindow}`}
          </p>
          {request.notes ? <p className="text-gray-500">“{request.notes}”</p> : null}
          {mine && request.acceptanceFee > 0 ? (
            <p className={request.acceptanceFeeRefunded ? "text-emerald-700" : "text-gray-500"}>
              {request.acceptanceFeeRefunded
                ? `${fullMoney(request.acceptanceFee)} site visit fee refunded — the customer accepted the contract.`
                : `${fullMoney(request.acceptanceFee)} site visit fee charged to your wallet.`}
            </p>
          ) : null}
        </div>

        {mine && request.customer ? (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Customer</p>
            <p className="mt-0.5 text-[14px] font-semibold text-gray-900">{request.customer.name}</p>
            {exact?.address || exact?.landmark ? (
              <div className="mt-1.5 text-[13px] leading-snug text-gray-700">
                {exact.address ? <p>{exact.address}</p> : null}
                {exact.landmark ? <p className="mt-0.5 font-medium">Landmark: {exact.landmark}</p> : null}
              </div>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <a href={`tel:${request.customer.phone}`} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-orange-600">
                <Phone className="h-3.5 w-3.5" />
                {request.customer.phone}
              </a>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-orange-600">
                <Navigation className="h-3.5 w-3.5" />
                {Number.isFinite(exact?.lat) ? "Directions to the pin" : "Open in maps"}
              </a>
            </div>
          </div>
        ) : null}
      </div>

      {/* Not theirs yet: accept or pass */}
      {!mine ? (
        <div className="mt-4 rounded-xl border border-gray-200 p-4">
          {request.canRespond ? (
            <>
              <p className="text-[13px] text-gray-600">
                The customer has paid the visiting fee. The first contractor to accept gets the visit, and their name and
                number are shown once you do.
              </p>
              {request.acceptanceFee > 0 ? (
                <p className="mt-2 text-[13px] font-semibold text-amber-700">
                  Accepting charges {fullMoney(request.acceptanceFee)} from your wallet.
                </p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={accept}
                  disabled={Boolean(busy)}
                  className="flex-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {busy === "accept" ? "…" : "Take this visit"}
                </button>
                <button
                  type="button"
                  onClick={decline}
                  disabled={Boolean(busy)}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Pass
                </button>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-gray-500">
              {request.takenByOther ? "This visit was taken by another contractor." : "This request is no longer open to you."}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-xl border border-gray-200 p-4">
            <Stepper stage={stage} />
          </div>

          {/* Stage 1 — assigned */}
          {stage === "assigned" ? (
            <div className="mt-4 rounded-xl border border-gray-200 p-4">
              <h2 className="text-[15px] font-bold text-gray-900">Ready to head out?</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
                Tap start when you leave. The customer is notified that you are on the way, and gets a 6-digit OTP to give
                you when you reach the site.
              </p>
              <button
                type="button"
                onClick={startJourney}
                disabled={Boolean(busy)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-[15px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
              >
                <Navigation className="h-4 w-4" />
                {busy === "start" ? "Starting…" : "Start journey"}
              </button>
            </div>
          ) : null}

          {/* Stage 2 — on the way: confirm with the OTP */}
          {stage === "on_the_way" ? (
            <div className="mt-4 rounded-xl border border-gray-200 p-4">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-gray-900">
                <KeyRound className="h-4 w-4 text-orange-500" /> Confirm you have reached the site
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
                Ask the customer for the 6-digit OTP shown in their app, and enter it here to start the visit.
                {request.visit?.startedAt ? ` You set off at ${dateTime(request.visit.startedAt)}.` : ""}
              </p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="• • • • • •"
                className="mt-3 w-full rounded-xl border border-gray-300 py-3 text-center text-[22px] font-bold tracking-[0.5em] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              />
              {request.visit?.otpAttemptsLeft < 5 ? (
                <p className={`mt-1.5 text-center text-[12px] ${request.visit.otpAttemptsLeft ? "text-amber-600" : "text-red-600"}`}>
                  {request.visit.otpAttemptsLeft
                    ? `${request.visit.otpAttemptsLeft} attempt${request.visit.otpAttemptsLeft === 1 ? "" : "s"} left`
                    : "Locked — ask the customer to generate a new OTP in their app"}
                </p>
              ) : null}
              <button
                type="button"
                onClick={confirmArrival}
                disabled={Boolean(busy) || otp.length !== 6 || request.visit?.otpAttemptsLeft === 0}
                className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-[15px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
              >
                {busy === "otp" ? "Checking…" : "Confirm visit"}
              </button>
            </div>
          ) : null}

          {/* Stage 3 — at the site: the report */}
          {stage === "arrived" || locked ? (
            <div className="mt-4 rounded-xl border border-gray-200 p-4">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-gray-900">
                <Ruler className="h-4 w-4 text-orange-500" /> Site visit report
              </h2>
              {locked ? (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Sent to the office{request.visit?.report?.submittedAt ? ` on ${dateTime(request.visit.report.submittedAt)}` : ""}.
                    They will review it and send the customer a contract.
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
                  Record what you measured and saw. The office prices the contract from this, so be exact. Save a draft as
                  you go; sending is final.
                </p>
              )}

              <div className="mt-4 space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plot area (sq.ft)">
                    <input inputMode="decimal" className={inputClass} disabled={locked} value={form.plotAreaSqft}
                      onChange={(e) => setField("plotAreaSqft", e.target.value)} />
                  </Field>
                  <Field label="Built-up area (sq.ft)">
                    <input inputMode="decimal" className={inputClass} disabled={locked} value={form.builtUpAreaSqft}
                      onChange={(e) => setField("builtUpAreaSqft", e.target.value)} />
                  </Field>
                </div>
                <Field label="Floors planned">
                  <input inputMode="numeric" className={inputClass} disabled={locked} value={form.floorsPlanned}
                    onChange={(e) => setField("floorsPlanned", e.target.value)} />
                </Field>
                <Field label="Measurements" required hint="Length × width of each area, boundaries, anything you measured.">
                  <textarea rows={3} className={inputClass} disabled={locked} value={form.measurements}
                    onChange={(e) => setField("measurements", e.target.value)} />
                </Field>
                <Field label="Site condition" required hint="Levelled or sloping, existing structure, soil, drainage…">
                  <textarea rows={3} className={inputClass} disabled={locked} value={form.siteCondition}
                    onChange={(e) => setField("siteCondition", e.target.value)} />
                </Field>
                <Field label="Access to the site" required>
                  <div className="flex gap-2">
                    {ACCESS_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        disabled={locked}
                        onClick={() => setField("access", o.value)}
                        className={`flex-1 rounded-lg border py-2 text-[13px] font-semibold transition-colors ${
                          form.access === o.value ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 text-gray-600"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Water available?">
                    <YesNo value={form.waterAvailable} disabled={locked} onChange={(v) => setField("waterAvailable", v)} />
                  </Field>
                  <Field label="Electricity available?">
                    <YesNo value={form.electricityAvailable} disabled={locked} onChange={(v) => setField("electricityAvailable", v)} />
                  </Field>
                </div>
                <Field label="Recommended scope of work">
                  <textarea rows={3} className={inputClass} disabled={locked} value={form.recommendedScope}
                    onChange={(e) => setField("recommendedScope", e.target.value)} />
                </Field>
                <Field label="Estimated duration (days)">
                  <input inputMode="numeric" className={inputClass} disabled={locked} value={form.estimatedDurationDays}
                    onChange={(e) => setField("estimatedDurationDays", e.target.value)} />
                </Field>
                <Field label="Other observations">
                  <textarea rows={2} className={inputClass} disabled={locked} value={form.observations}
                    onChange={(e) => setField("observations", e.target.value)} />
                </Field>
                <Field label="Note for the office" hint="Anything the customer said that affects the price or plan. The customer does not see this.">
                  <textarea rows={2} className={inputClass} disabled={locked} value={form.notesForOffice}
                    onChange={(e) => setField("notesForOffice", e.target.value)} />
                </Field>
                <PhotoPicker
                  label="Site photos *"
                  hint="Photos of the plot from each side and anything unusual."
                  folder="construction/site-visits"
                  values={form.photos}
                  disabled={locked}
                  onChange={(photos) => setField("photos", photos)}
                />
              </div>

              {!locked ? (
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={Boolean(busy)}
                    className="flex-1 rounded-xl border border-gray-300 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busy === "draft" ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    onClick={sendReport}
                    disabled={Boolean(busy)}
                    className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-3 text-[14px] font-semibold text-white hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    {busy === "submit" ? "Sending…" : "Send to office"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* After the report: where the contract stands */}
          {locked ? (
            <div className="mt-4 rounded-xl border border-gray-200 p-4">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-gray-900">
                <Clock className="h-4 w-4 text-orange-500" /> Contract
              </h2>
              {request.contract ? (
                <>
                  <p className="mt-1.5 text-[13px] text-gray-600">
                    {request.contract.number} · {fullMoney(request.contract.price)} —{" "}
                    <span className="font-semibold text-gray-900">
                      {{ sent: "waiting for the customer", accepted: "accepted by the customer", rejected: "declined by the customer" }[request.contract.status]}
                    </span>
                  </p>

                  {request.contract.status === "accepted" && request.contract.contractorConfirmation?.status === "pending" ? (
                    <div className="mt-3 rounded-lg bg-emerald-50 p-3">
                      <p className="text-[13px] font-semibold text-emerald-900">
                        The customer accepted — confirm to start work
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-emerald-800">
                        Your site visit fee is refunded the moment you confirm.
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <button
                          type="button"
                          onClick={confirmTheContract}
                          disabled={Boolean(busy)}
                          className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busy === "contract-confirm" ? "…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={declineTheContract}
                          disabled={Boolean(busy)}
                          className="rounded-lg border border-emerald-300 px-4 py-2.5 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          Can't take it
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {request.contract.contractorConfirmation?.status === "accepted" ? (
                    <p className="mt-2 text-[12px] font-semibold text-emerald-700">
                      Confirmed{request.acceptanceFeeRefunded ? " — your site visit fee was refunded." : "."}
                    </p>
                  ) : null}

                  {request.contract.contractorConfirmation?.status === "declined" ? (
                    <p className="mt-2 text-[12px] text-gray-500">
                      You told the customer you can't take this on
                      {request.contract.contractorConfirmation?.declineNote ? `: ${request.contract.contractorConfirmation.declineNote}` : "."}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1.5 text-[13px] text-gray-600">
                  The office is reviewing your report. You will be notified when they send the customer a contract.
                </p>
              )}
            </div>
          ) : null}
        </>
      )}
    </ContractorShell>
  );
}
