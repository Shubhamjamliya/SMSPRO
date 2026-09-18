import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import ProviderOnboardingForm, {
  emptyProviderOnboardingForm,
} from "@/modules/serviceProvider/shared/components/ProviderOnboardingForm";
import serviceProviderApi from "../services/providerApi";
import {
  clearServiceProviderAuth,
  getServiceProviderUser,
  setServiceProviderAuth,
} from "../utils/authServiceProvider";

const hydrateFromProvider = (provider, phone) => {
  if (!provider) {
    return { ...emptyProviderOnboardingForm, phone: phone || "" };
  }
  return {
    ...emptyProviderOnboardingForm,
    ownerName: provider.ownerName || "",
    email: provider.email || "",
    phone: provider.phone || phone || "",
    zoneId: provider.zoneId || provider.zone?._id || "",
    profileImage: provider.profileImage || "",
    experience: provider.experience || "",
    skillsText: (provider.skills || []).join(", "),
    about: provider.about || "",
    panNumber: provider.documents?.panNumber || "",
    panImage: provider.documents?.panImage || "",
    aadhaarNumber: provider.documents?.aadhaarNumber || "",
    aadhaarImage: provider.documents?.aadhaarImage || "",
    bankName: provider.bank?.bankName || "",
    accountHolderName: provider.bank?.accountHolderName || "",
    accountNumber: provider.bank?.accountNumber || "",
    ifscCode: provider.bank?.ifscCode || "",
    accountType: provider.bank?.accountType || "savings",
    upiId: provider.bank?.upiId || "",
  };
};

export default function ServiceProviderOnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const existing = getServiceProviderUser();

  const [initialForm] = useState(() =>
    hydrateFromProvider(location.state?.provider || existing, location.state?.phone || existing?.phone || ""),
  );

  const rejectionReason = location.state?.provider?.rejectionReason || existing?.rejectionReason || "";

  const handleSubmit = async (payload) => {
    try {
      const result = await serviceProviderApi.submitOnboarding(payload);
      if (result?.accessToken && result?.provider) {
        setServiceProviderAuth(result.accessToken, result.provider, result.refreshToken);
      }
      toast.success("Application submitted for approval");
      navigate("/service-provider/pending", { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not submit");
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F8] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link to="/service-provider/login" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500">
            <ArrowLeft className="h-4 w-4" />
            Service Provider login
          </Link>
          <button
            type="button"
            className="text-xs font-semibold text-gray-400"
            onClick={() => {
              clearServiceProviderAuth();
              navigate("/service-provider/login");
            }}
          >
            Start over
          </button>
        </div>

        <ProviderOnboardingForm
          mode="self"
          initialForm={initialForm}
          fetchZones={serviceProviderApi.getOnboardingZones}
          fetchCategories={serviceProviderApi.getOnboardingCategories}
          fetchServices={serviceProviderApi.getOnboardingServices}
          onSubmit={handleSubmit}
          rejectionReason={rejectionReason}
        />
      </div>
    </div>
  );
}
