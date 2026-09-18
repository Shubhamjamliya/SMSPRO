import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock3, Loader2, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import serviceProviderApi from "../services/providerApi";
import {
  clearServiceProviderAuth,
  getServiceProviderUser,
  setServiceProviderAuth,
} from "../utils/authServiceProvider";

export default function ServiceProviderPendingPage() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState(() => getServiceProviderUser());
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const latest = await serviceProviderApi.getMe();
      setProvider(latest);
      setServiceProviderAuth(
        localStorage.getItem("service_provider_accessToken") ||
          localStorage.getItem("auth_service_provider"),
        latest,
        localStorage.getItem("service_provider_refreshToken"),
      );
      if (latest?.status === "approved") {
        toast.success("Your application is approved");
        navigate("/service-provider/dashboard", { replace: true });
      } else if (latest?.status === "rejected") {
        toast.error(latest.rejectionReason || "Application rejected");
        navigate("/service-provider/onboarding", { replace: true });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not refresh status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff4ec,#f7f7f8_50%)] px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-orange-100 bg-white p-6 shadow-xl shadow-orange-500/5 sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Clock3 className="h-7 w-7" />
        </div>
        <h1 className="text-center text-2xl font-black text-gray-900">Application under review</h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Thanks,{" "}
          <span className="font-semibold text-gray-800">{provider?.ownerName || "there"}</span>. Your Service
          Provider application is with the admin team. Dashboard access unlocks after approval.
        </p>

        <div className="mt-6 space-y-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <p>
            <span className="font-semibold text-gray-800">Name:</span> {provider?.ownerName || "—"}
          </p>
          <p>
            <span className="font-semibold text-gray-800">Phone:</span> {provider?.phone || "—"}
          </p>
          <p>
            <span className="font-semibold text-gray-800">Code:</span> {provider?.providerCode || "—"}
          </p>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Your dashboard, services, and zones stay unavailable until an admin approves your application.</p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check status
          </button>
          <button
            type="button"
            onClick={() => {
              clearServiceProviderAuth();
              navigate("/service-provider/login");
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          <Link to="/services" className="font-semibold text-[#FF6A00]">
            Back to Home Services
          </Link>
        </p>
      </div>
    </div>
  );
}
