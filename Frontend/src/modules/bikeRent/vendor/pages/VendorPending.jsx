import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock3, Loader2, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { bikeVendorApi } from "../services/vendorApi";
import {
  clearBikeVendorAuth,
  getBikeVendorUser,
  setBikeVendorAuth,
} from "../utils/authVendor";

export default function VendorPending() {
  const navigate = useNavigate();
  const [vendor, setVendor] = useState(() => getBikeVendorUser());
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const latest = await bikeVendorApi.getMe();
      setVendor(latest);
      setBikeVendorAuth(
        localStorage.getItem("bike_vendor_accessToken") ||
          localStorage.getItem("auth_bike_vendor"),
        latest,
        localStorage.getItem("bike_vendor_refreshToken"),
      );
      if (latest?.status === "approved") {
        toast.success("Your vendor account is approved");
        navigate("/bike-rent/vendor/dashboard", { replace: true });
      } else if (latest?.status === "rejected") {
        toast.error(latest.rejectionReason || "Registration rejected");
        navigate("/bike-rent/vendor/onboarding", { replace: true });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not refresh status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fff4ec,_#f7f7f8_50%)] px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-orange-100 bg-white p-6 shadow-xl shadow-orange-500/5 sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Clock3 className="h-7 w-7" />
        </div>
        <h1 className="text-center text-2xl font-black text-gray-900">
          Pending approval
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Your Bike Rental Vendor request for{" "}
          <span className="font-semibold text-gray-800">
            {vendor?.businessName || "your business"}
          </span>{" "}
          is with the admin team. Dashboard access unlocks after approval.
        </p>

        <div className="mt-6 space-y-2 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <p>
            <span className="font-semibold text-gray-800">Owner:</span>{" "}
            {vendor?.ownerName || "—"}
          </p>
          <p>
            <span className="font-semibold text-gray-800">Phone:</span>{" "}
            {vendor?.phone || "—"}
          </p>
          <p>
            <span className="font-semibold text-gray-800">Code:</span>{" "}
            {vendor?.vendorCode || "—"}
          </p>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Bike management, categories, and hubs stay unavailable until approval. Global Bike Rent settings remain admin-controlled.
          </p>
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
              clearBikeVendorAuth();
              navigate("/bike-rent/vendor/login");
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          <Link to="/bike-rent" className="font-semibold text-[#FF6A00]">
            Back to Bike Rent
          </Link>
        </p>
      </div>
    </div>
  );
}
