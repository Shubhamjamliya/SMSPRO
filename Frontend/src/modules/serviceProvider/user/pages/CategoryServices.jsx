import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Clock, Wrench } from "lucide-react";

import { ServiceProviderPageShell, ServiceProviderPageHeader } from "../components/ui";
import serviceProviderApi from "../../provider/services/providerApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

function ServiceSkeletonList() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3">
          <div className="h-20 w-20 shrink-0 rounded-xl bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-gray-100" />
            <div className="h-3 w-4/5 rounded bg-gray-100" />
            <div className="h-3 w-1/4 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ServiceProviderCategoryServicesPage() {
  const { categoryId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const zoneId = location.state?.zoneId;
  const zoneName = location.state?.zoneName;
  const categoryName = location.state?.categoryName;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    if (!zoneId || !categoryId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await serviceProviderApi.getCustomerServices({ zoneId, categoryId });
      setResult(data);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load services");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [zoneId, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!zoneId || !categoryId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F8] px-4">
        <div className="max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-700">Please go back and select a category again.</p>
          <button
            type="button"
            onClick={() => navigate("/services")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to categories
          </button>
        </div>
      </div>
    );
  }

  const services = result?.services || [];

  return (
    <ServiceProviderPageShell maxWidth="max-w-2xl lg:max-w-4xl">
      <ServiceProviderPageHeader title={categoryName || "Services"} subtitle={zoneName} backTo="/services" />

      <div className="px-4 py-4 sm:px-6">
        {loading ? (
          <ServiceSkeletonList />
        ) : services.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            {result?.message || "No services available in this category right now."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {services.map((svc) => (
              <button
                key={svc._id}
                type="button"
                onClick={() =>
                  navigate(`/services/${svc._id}/book`, {
                    state: { service: svc, zoneId: result.zone._id, zoneName: result.zone.name },
                  })
                }
                className="group flex w-full items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-[0_4px_12px_rgba(0,0,0,0.03)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#FF6A00]/30 hover:shadow-[0_8px_20px_rgba(0,0,0,0.07)]"
              >
                {svc.icon ? (
                  <img src={svc.icon} alt="" className="h-20 w-20 shrink-0 rounded-xl border border-gray-100 object-cover" />
                ) : (
                  <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-300">
                    <Wrench className="h-6 w-6" />
                  </span>
                )}
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="truncate text-[15px] font-bold text-gray-900 group-hover:text-[#FF6A00]">{svc.name}</p>
                  {svc.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs font-medium text-gray-500">{svc.description}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-base font-extrabold text-gray-900">{money(svc.price ?? svc.basePrice)}</span>
                    {svc.duration ? (
                      <span className="flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-500">
                        <Clock className="h-3 w-3" /> {svc.duration} min
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </ServiceProviderPageShell>
  );
}
