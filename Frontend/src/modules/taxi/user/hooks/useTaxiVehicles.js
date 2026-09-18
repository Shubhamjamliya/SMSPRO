import { useEffect, useState } from "react";
import { getPublicDriverOnboardingConfig } from "@/modules/common/api/driverOnboarding";
import { taxiUserApi } from "../../services/api";
import { formatInr } from "../utils/mock/vehicles";

const iconForName = (name = "") => {
  const n = String(name).toLowerCase();
  if (/\bbike\b|\bcycle\b/.test(n)) return "🏍️";
  if (/\bauto\b|\brickshaw\b/.test(n)) return "🛺";
  if (/\bmini\b|\bhatch\b/.test(n)) return "🚗";
  if (/\bsedan\b|\bcab\b/.test(n)) return "🚕";
  if (/\bsuv\b/.test(n)) return "🚙";
  if (/\bpremium\b|\bluxury\b/.test(n)) return "✨";
  if (/\bxl\b|\bvan\b|\binnova\b/.test(n)) return "🚐";
  return "🚕";
};

const estimateFromName = (name = "") => {
  const n = String(name).toLowerCase();
  if (/\bbike\b/.test(n)) return { etaMins: 3, baseFare: 29, category: "economy" };
  if (/\bauto\b/.test(n)) return { etaMins: 5, baseFare: 49, category: "economy" };
  if (/\bmini\b/.test(n)) return { etaMins: 6, baseFare: 79, category: "economy" };
  if (/\bsedan\b/.test(n)) return { etaMins: 7, baseFare: 99, category: "comfort" };
  if (/\bsuv\b/.test(n)) return { etaMins: 8, baseFare: 149, category: "premium" };
  if (/\bpremium\b|\bluxury\b/.test(n))
    return { etaMins: 9, baseFare: 199, category: "premium" };
  if (/\bxl\b/.test(n)) return { etaMins: 10, baseFare: 179, category: "xl" };
  return { etaMins: 7, baseFare: 89, category: "comfort" };
};

const mapVehicle = (v) => {
  const name = v.name || v.label || "Cab";
  const est = estimateFromName(name);
  return {
    id: String(v.id || v._id || name),
    name,
    icon: v.iconUrl || v.emoji || iconForName(name),
    iconUrl:
      typeof v.icon === "string" && v.icon.startsWith("http")
        ? v.icon
        : v.iconUrl || null,
    tagline: v.description || v.tagline || "Available nearby",
    etaMins: Number(v.etaMins) || est.etaMins,
    baseFare: Number(v.baseFare ?? v.startingFare) || est.baseFare,
    category: v.category || est.category,
  };
};

/**
 * Prefer taxi module public vehicle types only (real ObjectIds for pricing).
 * Do not fall back to mock IDs — those break quote/book with "no pricing".
 */
export default function useTaxiVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const apiList = await taxiUserApi.getPublicVehicleTypes();
        if (!cancelled && Array.isArray(apiList) && apiList.length) {
          setVehicles(apiList.map(mapVehicle));
          setError(null);
          return;
        }

        const config = await getPublicDriverOnboardingConfig();
        const modules = Array.isArray(config?.modules) ? config.modules : [];
        const taxi = modules.find(
          (m) => String(m.key || m.moduleKey || "").toLowerCase() === "taxi",
        );
        const list = Array.isArray(taxi?.vehicles) ? taxi.vehicles : [];
        const active = list.filter(
          (v) => v && (v.status == null || v.status === "active" || v.enabled !== false),
        );
        // Only keep entries that look like real Mongo ids
        const real = active.filter((v) => {
          const id = String(v.id || v._id || "");
          return /^[a-f\d]{24}$/i.test(id);
        });
        if (!cancelled) {
          setVehicles(real.map(mapVehicle));
          setError(real.length ? null : "No taxi vehicle types configured");
        }
      } catch (err) {
        if (!cancelled) {
          setVehicles([]);
          setError(err?.message || "Failed to load vehicles");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { vehicles, loading, error, formatInr };
}
