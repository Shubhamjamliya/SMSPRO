import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Car, ChevronDown, ChevronUp, Clock3, MapPin } from "lucide-react";
import { toast } from "sonner";
import TaxiBottomNav from "../components/layout/BottomNav";
import { getTaxiHomePath } from "../utils/routes";
import { taxiUserApi } from "../../services/api";
import { isTaxiUserLoggedIn, redirectToTaxiLogin } from "../utils/authUser";

const TABS = [
  { id: "active", label: "Active" },
  { id: "history", label: "History" },
];

const ACTIVE_STATUSES = new Set([
  "requested",
  "searching",
  "assigned",
  "arriving",
  "arrived",
  "in_progress",
  "awaiting_payment",
]);

function formatInr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${Math.round(n)}`;
}

function RideCard({ ride }) {
  const [open, setOpen] = useState(false);
  const breakdown = ride.fareBreakdown || ride.fare;
  const total = Number(ride.fare?.total ?? ride.fareEstimateTotal ?? 0);
  const payment = ride.payment;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold text-gray-900">
            {ride.rideNumber || ride.id}
          </p>
          <p className="mt-1 text-xs capitalize text-gray-500">
            {ride.status?.replaceAll("_", " ")}
          </p>
        </div>
        <p className="text-sm font-bold text-[#FF6A00]">{formatInr(total)}</p>
      </div>
      <div className="mt-3 space-y-1 text-xs text-gray-600">
        <p className="flex gap-2">
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="line-clamp-2">{ride.pickup?.address || "Pickup"}</span>
        </p>
        <p className="flex gap-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF6A00]" />
          <span className="line-clamp-2">{ride.drop?.address || "Drop"}</span>
        </p>
      </div>

      {payment ? (
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {payment.method?.replaceAll("_", " ") || "—"} · {payment.status || "—"}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-gray-50 py-2 text-[11px] font-bold text-gray-600"
      >
        Fare details
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && breakdown ? (
        <div className="mt-2 space-y-1 rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
          {[
            ["Base fare", breakdown.base],
            ["Distance", breakdown.distance],
            [
              Number(breakdown.waitingMin || ride.waitingMin || 0) > 0
                ? `Waiting (${Number(breakdown.waitingMin || ride.waitingMin)} min)`
                : "Waiting",
              breakdown.waiting,
            ],
            [
              breakdown.surgeSlotName ? `${breakdown.surgeSlotName} surge` : "Peak surge",
              breakdown.timeSlotSurge,
            ],
            ["Platform fee", breakdown.platformFee],
            [
              ride.coupon?.code || breakdown.couponCode
                ? `Offer · ${ride.coupon?.code || breakdown.couponCode}`
                : "Offer",
              Number(breakdown.discount || ride.coupon?.discountAmount || 0) > 0
                ? -Number(breakdown.discount || ride.coupon?.discountAmount)
                : null,
            ],
            ["Total", breakdown.total ?? total],
          ]
            .filter(([, v]) => v != null && Number(v) !== 0)
            .map(([label, value]) => (
              <div
                key={label}
                className={`flex justify-between gap-2 ${
                  Number(value) < 0 ? "text-emerald-700" : ""
                }`}
              >
                <span>{label}</span>
                <span className="font-semibold text-gray-900">
                  {Number(value) < 0 ? `−${formatInr(Math.abs(value))}` : formatInr(value)}
                </span>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

export default function TaxiRides() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("active");
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTaxiUserLoggedIn()) {
      redirectToTaxiLogin(navigate, { pathname: "/taxi/rides" });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await taxiUserApi.listRides({ limit: 50 });
        if (!cancelled) setRides(data.records || []);
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.response?.data?.message || "Failed to load rides");
          setRides([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const filtered = useMemo(() => {
    if (tab === "active") return rides.filter((r) => ACTIVE_STATUSES.has(r.status));
    return rides.filter((r) => !ACTIVE_STATUSES.has(r.status));
  }, [rides, tab]);

  return (
    <div className="min-h-screen bg-[#F7F7F8] pb-28">
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(getTaxiHomePath())}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-extrabold text-gray-900">Rides</h1>
            <p className="text-[11px] text-gray-500">Active & history</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-lg py-2 text-[11px] font-bold uppercase tracking-wide transition ${
                tab === item.id
                  ? "bg-white text-[#FF6A00] shadow-sm"
                  : "text-gray-500"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 py-6">
        {loading ? (
          <p className="text-center text-sm text-gray-500">Loading rides…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white px-5 py-10 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00]">
              {tab === "active" ? <Car className="h-6 w-6" /> : <MapPin className="h-6 w-6" />}
            </div>
            <h2 className="mt-4 text-base font-extrabold text-gray-900">
              {tab === "active" ? "No active ride" : "No ride history yet"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {tab === "active"
                ? "When you book a taxi, live trip details will appear here."
                : "Completed trips will be listed here."}
            </p>
          </div>
        ) : (
          filtered.map((ride) => <RideCard key={ride.id} ride={ride} />)
        )}
      </main>

      <TaxiBottomNav />
    </div>
  );
}
