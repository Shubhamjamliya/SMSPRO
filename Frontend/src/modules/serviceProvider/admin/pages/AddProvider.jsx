import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import ProviderOnboardingForm, {
  emptyProviderOnboardingForm,
} from "@/modules/serviceProvider/shared/components/ProviderOnboardingForm";
import serviceProviderAdminApi from "../services/adminApi";
import { SP_ADMIN_PAGE_CLASS } from "../utils/adminTheme";

const hydrateFromProvider = (provider) => {
  if (!provider) return emptyProviderOnboardingForm;
  const addressProof = (provider.kycDocuments || []).find((d) => d.documentType === "address_proof");

  // Pre-fill the provider's EXISTING service selections regardless of whether they're
  // still zone-eligible right now — the shared form unions these with the fresh catalog,
  // so editing an unrelated field (e.g. bank details) never silently drops them.
  const selectedServices = {};
  let categoryId = "";
  (provider.services || []).forEach((row) => {
    const svc = row.serviceId;
    if (!svc?._id) return;
    selectedServices[svc._id] = {
      price: row.price != null ? String(row.price) : "",
      name: svc.name || "",
      basePrice: svc.basePrice ?? 0,
      categoryId: svc.categoryId?._id || svc.categoryId || "",
      categoryName: svc.categoryId?.name || "",
    };
    if (!categoryId) categoryId = svc.categoryId?._id || svc.categoryId || "";
  });

  return {
    ...emptyProviderOnboardingForm,
    ownerName: provider.ownerName || "",
    email: provider.email || "",
    phone: provider.phone || "",
    zoneId: provider.zoneId || provider.zone?._id || "",
    profileImage: provider.profileImage || "",
    experience: provider.experience || "",
    skillsText: (provider.skills || []).join(", "),
    about: provider.about || "",
    panNumber: provider.documents?.panNumber || "",
    panImage: provider.documents?.panImage || "",
    aadhaarNumber: provider.documents?.aadhaarNumber || "",
    aadhaarImage: provider.documents?.aadhaarImage || "",
    addressProofUrl: addressProof?.documentUrl || "",
    bankName: provider.bank?.bankName || "",
    accountHolderName: provider.bank?.accountHolderName || "",
    accountNumber: provider.bank?.accountNumber || "",
    ifscCode: provider.bank?.ifscCode || "",
    accountType: provider.bank?.accountType || "savings",
    upiId: provider.bank?.upiId || "",
    categoryId,
    selectedServices,
  };
};

const fetchActiveZones = async () => {
  const result = await serviceProviderAdminApi.getZones({ status: "active" });
  return result.records || [];
};

const fetchActiveCategories = () => serviceProviderAdminApi.getCategories({ status: "active" });

const fetchZoneServices = (zoneId) => serviceProviderAdminApi.getServices({ status: "active", zoneId });

export default function ServiceProviderAddProviderPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(isEditMode);
  const [initialForm, setInitialForm] = useState(emptyProviderOnboardingForm);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    if (!isEditMode) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const provider = await serviceProviderAdminApi.getProviderById(id);
        if (!cancelled) {
          setInitialForm(hydrateFromProvider(provider));
          setRejectionReason(provider?.rejectionReason || "");
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error?.response?.data?.message || "Could not load provider");
          navigate("/admin/service-provider/providers", { replace: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isEditMode, navigate]);

  const handleSubmit = async (payload) => {
    try {
      if (isEditMode) {
        await serviceProviderAdminApi.updateProvider(id, payload);
        toast.success("Provider updated");
      } else {
        await serviceProviderAdminApi.createProvider(payload);
        toast.success("Provider created and approved");
      }
      navigate("/admin/service-provider/providers", { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save provider");
    }
  };

  if (loading) {
    return (
      <div className={SP_ADMIN_PAGE_CLASS}>
        <p className="text-sm text-gray-500">Loading provider…</p>
      </div>
    );
  }

  return (
    <div className={SP_ADMIN_PAGE_CLASS}>
      <div className="mx-auto w-full max-w-3xl">
        <button
          type="button"
          onClick={() => navigate("/admin/service-provider/providers")}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          All providers
        </button>

        <ProviderOnboardingForm
          mode={isEditMode ? "adminEdit" : "adminCreate"}
          initialForm={initialForm}
          fetchZones={fetchActiveZones}
          fetchCategories={fetchActiveCategories}
          fetchServices={fetchZoneServices}
          onSubmit={handleSubmit}
          rejectionReason={rejectionReason}
        />
      </div>
    </div>
  );
}
