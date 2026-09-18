import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, Save } from "lucide-react";
import { toast } from "sonner";
import serviceProviderAdminApi from "../services/adminApi";
import FormPageShell from "@/shared/components/admin/FormPageShell";
import FormSection from "@/shared/components/admin/FormSection";
import FormField, { formInputClass } from "@/shared/components/admin/FormField";
import FormActions from "@/shared/components/admin/FormActions";
import ZonePolygonMapField from "@/shared/components/maps/ZonePolygonMapField";

const BASE = "/admin/service-provider/zones";

export default function ServiceProviderAddZone() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [loadingZone, setLoadingZone] = useState(isEditMode);
  const [formData, setFormData] = useState({ country: "India", zoneName: "", unit: "kilometer" });
  const [coordinates, setCoordinates] = useState([]);
  const [existingZones, setExistingZones] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await serviceProviderAdminApi.getZones({ limit: 100 });
        if (cancelled) return;
        const zones = result.records || [];
        setExistingZones(isEditMode ? zones.filter((z) => String(z._id) !== String(id)) : zones);
      } catch {
        if (!cancelled) setExistingZones([]);
      }
    })();

    if (isEditMode) {
      (async () => {
        try {
          const zone = await serviceProviderAdminApi.getZoneById(id);
          if (cancelled || !zone) return;
          setFormData({
            country: zone.country || "India",
            zoneName: zone.name || "",
            unit: zone.unit || "kilometer",
          });
          if (zone.coordinates?.length) {
            setCoordinates(zone.coordinates.map((c) => ({ latitude: c.lat, longitude: c.lng })));
          }
        } catch (error) {
          toast.error(error?.response?.data?.message || "Failed to load zone");
          navigate(BASE);
        } finally {
          if (!cancelled) setLoadingZone(false);
        }
      })();
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.zoneName) return toast.error("Please enter a zone name");
    if (!formData.country) return toast.error("Please select a country");
    if (coordinates.length < 3) return toast.error("Please draw at least 3 points on the map to create a zone");

    const validCoordinates = coordinates
      .map((coord) => ({
        latitude: parseFloat(coord.latitude ?? coord.lat),
        longitude: parseFloat(coord.longitude ?? coord.lng),
      }))
      .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));

    const zoneData = {
      name: formData.zoneName,
      country: formData.country,
      unit: formData.unit || "kilometer",
      coordinates: validCoordinates,
      status: "active",
    };

    setLoading(true);
    try {
      if (isEditMode) {
        await serviceProviderAdminApi.updateZone(id, zoneData);
        toast.success("Zone updated successfully");
      } else {
        await serviceProviderAdminApi.createZone(zoneData);
        toast.success("Zone created successfully");
      }
      navigate(BASE);
    } catch (error) {
      const message =
        error.code === "ERR_NETWORK" || error.message === "Network Error" || !error.response
          ? "Cannot connect to server. Please make sure the backend server is running."
          : error.response?.data?.message || error.response?.data?.error || error.message || "Failed to save zone. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingZone) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <FormPageShell
      title={isEditMode ? "Edit Zone" : "Add New Zone"}
      description={isEditMode ? "Update Service Provider zone" : "Create a Service Provider zone"}
      icon={<MapPin className="h-5 w-5" />}
      iconClassName="bg-red-500"
      onBack={() => navigate(BASE)}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <FormSection title="Zone Details" bodyClassName="grid-cols-1 gap-4 md:grid-cols-3">
          <FormField label="Country" required>
            <select
              value={formData.country}
              onChange={(e) => handleInputChange("country", e.target.value)}
              className={formInputClass}
              required
            >
              <option value="India">India</option>
            </select>
          </FormField>

          <FormField label="Zone name" required>
            <input
              type="text"
              value={formData.zoneName}
              onChange={(e) => handleInputChange("zoneName", e.target.value)}
              placeholder="Enter zone name"
              className={formInputClass}
              required
            />
          </FormField>

          <FormField label="Select Unit" required>
            <select
              value={formData.unit}
              onChange={(e) => handleInputChange("unit", e.target.value)}
              className={formInputClass}
              required
            >
              <option value="kilometer">Kilometers (km)</option>
              <option value="mile">Miles (mi)</option>
            </select>
          </FormField>
        </FormSection>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Search a city below to zoom the map, then draw the service area polygon.
        </div>

        <FormSection title="Draw Zone on Map" className="overflow-visible" bodyClassName="!grid-cols-1 gap-4">
          <ZonePolygonMapField
            coordinates={coordinates}
            onCoordinatesChange={setCoordinates}
            existingZones={existingZones}
            isEditMode={isEditMode}
          />
        </FormSection>

        <FormActions
          onCancel={() => navigate(BASE)}
          submitLabel={
            <span className="inline-flex items-center gap-2">
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Zone</span>
                </>
              )}
            </span>
          }
          submitDisabled={loading || coordinates.length < 3 || !formData.zoneName || !formData.country}
        />
      </form>
    </FormPageShell>
  );
}
