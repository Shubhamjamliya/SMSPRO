import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, MapPin, Wrench } from "lucide-react";
import { SectionCard, StatCard, StatusBadge, KpiGridSkeleton } from "@/shared/components/admin";
import ServiceProviderLayout from "../components/ServiceProviderLayout";
import serviceProviderApi from "../services/providerApi";
import { setServiceProviderAuth } from "../utils/authServiceProvider";
import { SP_ADMIN_STAT_GRID_4_CLASS } from "../../admin/utils/adminTheme";
import { ACTIVE_STATUSES } from "../components/JobCard";
import ActiveJobSummaryCard from "../components/ActiveJobSummaryCard";
import { useServiceProviderRealtime } from "../context/ServiceProviderRealtimeContext";

export default function ServiceProviderDashboardPage() {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeJobs, setActiveJobs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await serviceProviderApi.getDashboard();
        if (!cancelled) {
          setDraft(result);
          // Keep the cached snapshot in sync with the freshly-fetched truth —
          // never let it be the source of any decision, only a fast paint hint.
          const token =
            localStorage.getItem("service_provider_accessToken") || localStorage.getItem("auth_service_provider");
          setServiceProviderAuth(token, result.provider);
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || "Could not load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadActiveJobs = useCallback(async () => {
    try {
      const list = await serviceProviderApi.getProviderBookings();
      setActiveJobs(
        list
          .filter((b) => ACTIVE_STATUSES.includes(b.status))
          .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
          .slice(0, 4),
      );
    } catch {
      // best-effort — the stat cards above remain the primary, already-working content
    }
  }, []);

  useEffect(() => {
    loadActiveJobs();
  }, [loadActiveJobs]);

  // Instant refresh the moment a new request is accepted or an active job's status
  // changes — reuses the ONE shared socket connection mounted at the layout level
  // (see ServiceProviderRealtimeContext); no separate poll interval on a glance page.
  const { lastEventAt } = useServiceProviderRealtime();
  useEffect(() => {
    if (lastEventAt) loadActiveJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEventAt]);

  return (
    <ServiceProviderLayout title="Dashboard" subtitle={`Welcome back, ${draft?.provider?.ownerName || "Provider"}`}>
      {loading ? (
        <KpiGridSkeleton count={4} />
      ) : (
        <>
          {activeJobs.length > 0 ? (
            <SectionCard title="Active job(s)">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {activeJobs.map((b) => (
                  <ActiveJobSummaryCard key={b._id} booking={b} onUpdated={loadActiveJobs} />
                ))}
              </div>
            </SectionCard>
          ) : null}

          <div className={SP_ADMIN_STAT_GRID_4_CLASS}>
            <StatCard title="Approval status" value={<StatusBadge status={draft?.provider?.status} />} icon={<CheckCircle2 className="h-5 w-5" />} />
            <StatCard title="Services offered" value={draft?.services?.length || 0} icon={<Wrench className="h-5 w-5" />} />
            <StatCard title="Service zones" value={draft?.zones?.length || 0} icon={<MapPin className="h-5 w-5" />} />
            <StatCard title="Documents" value={draft?.documents?.length || 0} icon={<ClipboardCheck className="h-5 w-5" />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <SectionCard title="Your services">
              <div className="grid gap-2 sm:grid-cols-2">
                {(draft?.services || []).map((s) => (
                  <div key={s._id} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{s.serviceId?.name || "—"}</span>
                      <span className="font-semibold">₹{s.price}</span>
                    </div>
                    {(s.zones || []).length ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Zones: {(s.zones || []).map((z) => z.name).join(", ")}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-amber-600">No zones assigned</p>
                    )}
                  </div>
                ))}
                {!draft?.services?.length ? (
                  <p className="text-xs text-muted-foreground sm:col-span-2">No services selected yet.</p>
                ) : null}
              </div>
            </SectionCard>

            <div className="flex flex-col gap-4">
              <SectionCard title="Your zones">
                <div className="space-y-2">
                  {(draft?.zones || []).map((z) => (
                    <div key={z._id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      {z.zoneId?.name || "—"}
                    </div>
                  ))}
                  {!draft?.zones?.length ? <p className="text-xs text-muted-foreground">No zones selected yet.</p> : null}
                </div>
              </SectionCard>

              <SectionCard title="Documents">
                <div className="space-y-2">
                  {(draft?.documents || []).map((doc) => (
                    <div key={doc._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <span>{doc.label || doc.documentType}</span>
                      <StatusBadge status={doc.verificationStatus} />
                    </div>
                  ))}
                  {!draft?.documents?.length ? <p className="text-xs text-muted-foreground">No documents uploaded yet.</p> : null}
                </div>
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </ServiceProviderLayout>
  );
}
