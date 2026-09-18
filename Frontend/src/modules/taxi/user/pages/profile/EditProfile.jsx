import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { userAPI } from "@food/api";
import { normalizeImageUrl } from "@food/utils/imageUtils";
import { API_BASE_URL } from "@/services/api/config";
import {
  TaxiPageShell,
  TaxiPageHeader,
  PrimaryButton,
} from "../../components/ui";
import useTaxiAuthUser from "../../hooks/useTaxiAuthUser";
import { getTaxiProfilePath } from "../../utils/routes";
import { redirectToTaxiLogin } from "../../utils/authUser";

const BACKEND_ORIGIN = String(API_BASE_URL || "")
  .replace(/\/api\/v1\/?$/, "")
  .replace(/\/api\/?$/, "");

export default function EditProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, loading, userProfile, name, phone, email, initials, photoUrl } =
    useTaxiAuthUser();
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !isLoggedIn) {
      redirectToTaxiLogin(navigate, location);
    }
  }, [loading, isLoggedIn, navigate, location]);

  useEffect(() => {
    setForm({
      name: name && name !== "Rider" ? name : userProfile?.name || "",
      phone: phone && phone !== "—" ? phone : userProfile?.phone || "",
      email: email && email !== "—" ? email : userProfile?.email || "",
    });
  }, [name, phone, email, userProfile]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const resolvedPhoto = photoUrl
    ? normalizeImageUrl(photoUrl, BACKEND_ORIGIN) || photoUrl
    : null;

  const onSave = async () => {
    if (!isLoggedIn) {
      redirectToTaxiLogin(navigate, location);
      return;
    }
    setSaving(true);
    try {
      await userAPI.updateProfile({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      });
      window.dispatchEvent(new Event("userAuthChanged"));
      toast.success("Profile updated");
      navigate(getTaxiProfilePath());
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!isLoggedIn && !loading) return null;

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Edit Profile"
        subtitle="Update your details"
        backTo={getTaxiProfilePath()}
      />
      <main className="space-y-4 px-4 py-4">
        <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          {resolvedPhoto ? (
            <img
              src={resolvedPhoto}
              alt=""
              className="h-20 w-20 rounded-3xl object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#FF6A00]/10 text-2xl font-black text-[#FF6A00]">
              {initials}
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              toast.message("Change photo", {
                description: "Use the main Profile → Edit screen for uploads.",
              })
            }
            className="mt-3 text-xs font-bold text-[#FF6A00]"
          >
            Change photo
          </button>
        </div>

        {[
          { key: "name", label: "Full name", type: "text" },
          { key: "phone", label: "Phone number", type: "tel" },
          { key: "email", label: "Email", type: "email" },
        ].map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">
              {field.label}
            </span>
            <input
              type={field.type}
              value={form[field.key]}
              onChange={set(field.key)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium outline-none focus:border-[#FF6A00]/40 focus:ring-2 focus:ring-[#FF6A00]/15"
            />
          </label>
        ))}

        <PrimaryButton onClick={onSave} disabled={saving || loading}>
          {saving ? "Saving…" : "Save changes"}
        </PrimaryButton>
      </main>
    </TaxiPageShell>
  );
}
