import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Camera, ChevronRight, Loader2, Lock, MapPinned } from "lucide-react";
import { userAPI } from "@food/api";
import { useProfile } from "@food/context/ProfileContext";
import { normalizeImageUrl } from "@food/utils/imageUtils";
import { API_BASE_URL } from "@/services/api/config";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  PrimaryButton,
} from "../../components/ui";
import useBikeRentAuthUser from "../../hooks/useBikeRentAuthUser";
import {
  getBikeRentAddressesPath,
  getBikeRentProfilePath,
} from "../../utils/routes";
import { redirectToBikeRentLogin } from "../../utils/authUser";
import { cn } from "@/lib/utils";

const BACKEND_ORIGIN = String(API_BASE_URL || "")
  .replace(/\/api\/v1\/?$/, "")
  .replace(/\/api\/?$/, "");

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];

const normalizeLicense = (value) =>
  String(value || "")
    .replace(/[\s-]/g, "")
    .trim()
    .toUpperCase();

const digitsOnly = (value, max = 10) =>
  String(value || "").replace(/\D/g, "").slice(0, max);

const toDateInputValue = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const raw = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

const resolvePhoto = (raw) => {
  if (!raw) return null;
  const url = typeof raw === "string" ? raw : raw?.url;
  if (!url || url === "null" || url === "undefined") return null;
  if (String(url).startsWith("blob:") || String(url).startsWith("data:")) return url;
  return normalizeImageUrl(url, BACKEND_ORIGIN) || url;
};

function persistLocalProfile(data) {
  try {
    localStorage.setItem("user_user", JSON.stringify(data));
    localStorage.setItem("userProfile", JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

function Field({ label, hint, children, optional }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {label}
        {optional ? (
          <span className="rounded-full bg-gray-100 px-1.5 py-px text-[9px] font-semibold normal-case tracking-normal text-gray-500">
            Optional
          </span>
        ) : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-gray-400">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium outline-none transition focus:border-[#FF6A00]/40 focus:ring-2 focus:ring-[#FF6A00]/15 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

export default function EditProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const previewObjectUrlRef = useRef(null);
  const { updateUserProfile } = useProfile();
  const {
    isLoggedIn,
    loading,
    userProfile,
    name,
    phone,
    email,
    drivingLicenseNumber,
    initials,
    photoUrl,
    addresses,
  } = useBikeRentAuthUser();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    alternatePhone: "",
    dateOfBirth: "",
    gender: "",
    drivingLicenseNumber: "",
  });
  const [profileImage, setProfileImage] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    if (!loading && !isLoggedIn) {
      redirectToBikeRentLogin(navigate, location);
    }
  }, [loading, isLoggedIn, navigate, location]);

  useEffect(() => {
    const nextPhone =
      phone && phone !== "—" ? phone : userProfile?.phone || userProfile?.mobile || "";
    const nextEmail =
      email && email !== "—" ? email : userProfile?.email || "";
    const nextName =
      name && name !== "Rider" ? name : userProfile?.name || "";
    const image = resolvePhoto(photoUrl || userProfile?.profileImage) || "";

    setForm({
      name: nextName,
      phone: nextPhone,
      email: nextEmail,
      alternatePhone: digitsOnly(userProfile?.alternatePhone || ""),
      dateOfBirth: toDateInputValue(userProfile?.dateOfBirth),
      gender: userProfile?.gender || "",
      drivingLicenseNumber:
        drivingLicenseNumber
        || normalizeLicense(userProfile?.drivingLicenseNumber)
        || "",
    });
    setProfileImage(image);
    setImagePreview(image);
  }, [name, phone, email, drivingLicenseNumber, photoUrl, userProfile]);

  useEffect(() => () => {
    if (previewObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const defaultAddress = useMemo(() => {
    const list = Array.isArray(addresses) ? addresses : [];
    return list.find((item) => item.isDefault) || list[0] || null;
  }, [addresses]);

  const addressSummary = defaultAddress
    ? (
      defaultAddress.formattedAddress
      || [defaultAddress.street, defaultAddress.area, defaultAddress.city, defaultAddress.state, defaultAddress.zipCode]
        .filter(Boolean)
        .join(", ")
    )
    : "";

  const setField = (key) => (event) => {
    let value = event.target.value;
    if (key === "drivingLicenseNumber") value = normalizeLicense(value);
    if (key === "alternatePhone") value = digitsOnly(value, 10);
    if (key === "email") {
      value = String(value || "").trim();
      setEmailError(
        value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
          ? "Enter a valid email address"
          : "",
      );
    }
    setForm((current) => ({ ...current, [key]: value }));
  };

  const clearPreviewObjectUrl = () => {
    if (previewObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      } catch {
        /* ignore */
      }
      previewObjectUrlRef.current = null;
    }
  };

  const processProfileImageFile = async (file) => {
    if (!file) return;

    const type = String(file.type || "").toLowerCase();
    const nameOk = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
    if (!ALLOWED_IMAGE_TYPES.has(type) && !nameOk) {
      toast.error("Use JPG, PNG, or WEBP images only");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be under 5MB");
      return;
    }

    clearPreviewObjectUrl();
    const localPreview = URL.createObjectURL(file);
    previewObjectUrlRef.current = localPreview;
    setImagePreview(localPreview);
    setUploading(true);
    setUploadProgress(0);

    try {
      const response = await userAPI.uploadProfileImage(file, {
        onUploadProgress: (event) => {
          const total = Number(event?.total || 0);
          if (!total) return;
          setUploadProgress(Math.min(100, Math.round((event.loaded / total) * 100)));
        },
      });
      const payload = response?.data?.data || response?.data || {};
      const imageUrl =
        payload.profileImage
        || payload.user?.profileImage
        || payload.url
        || "";
      if (!imageUrl) {
        throw new Error("Upload succeeded but no image URL was returned");
      }

      const resolved = resolvePhoto(imageUrl) || imageUrl;
      clearPreviewObjectUrl();
      setProfileImage(resolved);
      setImagePreview(resolved);
      setUploadProgress(100);

      const merged = {
        ...(userProfile || {}),
        profileImage: imageUrl,
      };
      updateUserProfile?.(merged);
      persistLocalProfile({
        ...merged,
        phone: merged.phone || form.phone,
        mobile: merged.phone || form.phone,
      });
      window.dispatchEvent(new Event("userAuthChanged"));
      toast.success("Profile photo updated");
    } catch (error) {
      clearPreviewObjectUrl();
      setImagePreview(profileImage || resolvePhoto(photoUrl) || "");
      toast.error(error?.response?.data?.message || error?.message || "Failed to upload photo");
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 600);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onPickPhoto = (event) => {
    const file = event.target.files?.[0];
    if (file) processProfileImageFile(file);
    event.target.value = "";
  };

  const onSave = async () => {
    if (!isLoggedIn) {
      redirectToBikeRentLogin(navigate, location);
      return;
    }
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (emailError) {
      toast.error(emailError);
      return;
    }
    const license = normalizeLicense(form.drivingLicenseNumber);
    if (license && (license.length < 8 || license.length > 20 || !/^[A-Z0-9]+$/.test(license))) {
      toast.error("Enter a valid driving license (8–20 letters/numbers)");
      return;
    }
    if (form.dateOfBirth) {
      const dob = new Date(`${form.dateOfBirth}T00:00:00`);
      if (Number.isNaN(dob.getTime()) || dob > new Date()) {
        toast.error("Date of birth cannot be in the future");
        return;
      }
    }
    if (form.alternatePhone && form.alternatePhone.length !== 10) {
      toast.error("Alternate mobile must be 10 digits");
      return;
    }

    setSaving(true);
    try {
      const response = await userAPI.updateProfile({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        // Send current phone so backend can verify it matches — not changeable.
        phone: form.phone.trim() || undefined,
        alternatePhone: form.alternatePhone || "",
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || "",
        drivingLicenseNumber: license,
        profileImage: profileImage || undefined,
      });
      const updatedUser = response?.data?.data?.user || response?.data?.user || {};
      const nextImage = resolvePhoto(updatedUser.profileImage || profileImage) || profileImage;
      const merged = {
        ...(userProfile || {}),
        ...updatedUser,
        phone: updatedUser.phone || form.phone,
        mobile: updatedUser.phone || form.phone,
        profileImage: updatedUser.profileImage || profileImage,
      };
      updateUserProfile?.(merged);
      persistLocalProfile(merged);
      setProfileImage(nextImage);
      setImagePreview(nextImage);
      window.dispatchEvent(new Event("userAuthChanged"));
      toast.success("Profile updated");
      navigate(getBikeRentProfilePath());
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!isLoggedIn && !loading) return null;

  const displayPreview = resolvePhoto(imagePreview) || imagePreview;

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Edit Profile"
        subtitle="Update your details"
        backTo={getBikeRentProfilePath()}
      />
      <main className="space-y-4 px-4 py-4 pb-8">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="relative">
              {displayPreview ? (
                <img
                  src={displayPreview}
                  alt=""
                  className="h-24 w-24 rounded-3xl object-cover ring-4 ring-orange-50"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-[#FF6A00]/10 text-2xl font-black text-[#FF6A00] ring-4 ring-orange-50">
                  {initials}
                </div>
              )}
              <button
                type="button"
                disabled={uploading || saving}
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#FF6A00] text-white shadow-md disabled:opacity-60"
                aria-label="Change profile photo"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
            </div>

            <button
              type="button"
              disabled={uploading || saving}
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 text-xs font-bold text-[#FF6A00] disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Change photo"}
            </button>
            <p className="mt-1 text-center text-[11px] text-gray-400">
              JPG, PNG, or WEBP · max 5MB
            </p>

            {uploading ? (
              <div className="mt-3 w-full max-w-[220px]">
                <div className="h-1.5 overflow-hidden rounded-full bg-orange-100">
                  <div
                    className="h-full rounded-full bg-[#FF6A00] transition-all duration-200"
                    style={{ width: `${Math.max(8, uploadProgress)}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-[10px] font-semibold text-gray-500">
                  {uploadProgress > 0 ? `${uploadProgress}%` : "Starting…"}
                </p>
              </div>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={onPickPhoto}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <Field label="Full name">
            <input
              type="text"
              value={form.name}
              onChange={setField("name")}
              autoComplete="name"
              className={inputClass}
              placeholder="Your name"
            />
          </Field>

          <Field
            label="Mobile number"
            hint="Verified contact — cannot be changed"
          >
            <div className="relative">
              <input
                type="tel"
                value={form.phone}
                readOnly
                disabled
                className={cn(inputClass, "pr-10")}
              />
              <Lock className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          </Field>

          <Field label="Email" optional>
            <input
              type="email"
              value={form.email}
              onChange={setField("email")}
              autoComplete="email"
              className={cn(inputClass, emailError && "border-red-300 focus:border-red-400 focus:ring-red-100")}
              placeholder="you@example.com"
            />
            {emailError ? (
              <span className="mt-1 block text-[11px] font-medium text-red-600">{emailError}</span>
            ) : null}
          </Field>

          <Field label="Alternate mobile" optional>
            <input
              type="tel"
              inputMode="numeric"
              value={form.alternatePhone}
              onChange={setField("alternatePhone")}
              className={inputClass}
              placeholder="10-digit number"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date of birth" optional>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={setField("dateOfBirth")}
                max={new Date().toISOString().slice(0, 10)}
                className={inputClass}
              />
            </Field>
            <Field label="Gender" optional>
              <select
                value={form.gender}
                onChange={setField("gender")}
                className={inputClass}
              >
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value || "none"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Driving license"
            optional
            hint="Used for Bike Rent bookings"
          >
            <input
              type="text"
              value={form.drivingLicenseNumber}
              onChange={setField("drivingLicenseNumber")}
              className={inputClass}
              placeholder="e.g. MH1420220012345"
              autoCapitalize="characters"
            />
          </Field>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Address
            </p>
            <Link
              to={getBikeRentAddressesPath()}
              className="inline-flex items-center gap-0.5 text-xs font-bold text-[#FF6A00]"
            >
              Manage
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {addressSummary ? (
            <div className="flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
              <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800">
                  {defaultAddress?.label || "Saved address"}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                  {addressSummary}
                </p>
              </div>
            </div>
          ) : (
            <Link
              to={getBikeRentAddressesPath()}
              className="flex items-center justify-between rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm font-semibold text-gray-600"
            >
              <span className="inline-flex items-center gap-2">
                <MapPinned className="h-4 w-4 text-[#FF6A00]" />
                Add a saved address
              </span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </Link>
          )}
        </section>

        <PrimaryButton onClick={onSave} disabled={saving || loading || uploading}>
          {saving ? "Saving…" : "Save changes"}
        </PrimaryButton>
      </main>
    </BikeRentPageShell>
  );
}
