import { uploadDeferredMediaItems } from "../components/MediaUploadField";

/**
 * Single source of truth for the bike add/edit form — shared by the admin and vendor
 * "Add/Edit Bike" modals so the two surfaces cannot silently drift apart on fields,
 * limits, or validation.
 */

export const BIKE_FORM_LIMITS = {
  name: 160,
  brand: 120,
  model: 120,
  registrationNumber: 40,
  engineNumber: 80,
  chassisNumber: 80,
  description: 5000,
  seatingCapacityMin: 1,
  seatingCapacityMax: 10,
  maxImages: 12,
};

export const EMPTY_BIKE_FORM = {
  name: "",
  brand: "",
  model: "",
  categoryId: "",
  registrationNumber: "",
  engineNumber: "",
  chassisNumber: "",
  fuelType: "petrol",
  transmission: "manual",
  seatingCapacity: "2",
  helmetIncluded: true,
  description: "",
  hourlyPrice: "",
  dailyPrice: "",
  weeklyPrice: "",
  securityDeposit: "",
  zoneId: "",
  hubId: "",
  availabilityStatus: "available",
  maintenanceStatus: "none",
  isActive: true,
  images: [],
  primaryImage: null,
  rcDoc: null,
  insuranceDoc: null,
  pucDoc: null,
  requiredDocuments: [],
  settingsOverride: null,
};

export const trimBikeValue = (value) => String(value ?? "").trim();
export const isBikeValueBlank = (value) => trimBikeValue(value).length === 0;
export const getBikeEntityId = (item) => item?.id || item?._id;

export const toBikeMediaItem = (doc = {}) => {
  if (!doc?.url) return null;
  return {
    url: String(doc.url),
    publicId: doc.publicId || "",
    resourceType: doc.resourceType || "",
    name: String(doc.url).split("/").pop() || "file",
    isLocal: false,
  };
};

/** Map an API bike record into form state (used when opening the edit modal). */
export const normalizeBikeForm = (bike) => {
  const images = (bike.images || []).map((image) => toBikeMediaItem(image)).filter(Boolean);
  const primaryFromList = (bike.images || []).find((image) => image.isPrimary);
  return {
    ...EMPTY_BIKE_FORM,
    ...bike,
    name: bike.name || "",
    brand: bike.brand || "",
    model: bike.model || "",
    categoryId: getBikeEntityId(bike.category) || bike.categoryId || "",
    registrationNumber: bike.registrationNumber || "",
    engineNumber: bike.engineNumber || "",
    chassisNumber: bike.chassisNumber || "",
    fuelType: bike.fuelType || "petrol",
    transmission: bike.transmission || "manual",
    seatingCapacity: String(bike.seatingCapacity ?? 2),
    helmetIncluded: bike.helmetIncluded !== false,
    description: bike.description || "",
    hourlyPrice: bike.hourlyPrice === 0 || bike.hourlyPrice ? String(bike.hourlyPrice) : "",
    dailyPrice: bike.dailyPrice === 0 || bike.dailyPrice ? String(bike.dailyPrice) : "",
    weeklyPrice: bike.weeklyPrice === 0 || bike.weeklyPrice ? String(bike.weeklyPrice) : "",
    securityDeposit:
      bike.securityDeposit === 0 || bike.securityDeposit ? String(bike.securityDeposit) : "",
    zoneId: getBikeEntityId(bike.zone) || bike.zoneId || "",
    hubId: getBikeEntityId(bike.hub) || bike.hubId || "",
    availabilityStatus: bike.availabilityStatus || "available",
    maintenanceStatus: bike.maintenanceStatus || "none",
    isActive: bike.isActive !== false,
    images,
    primaryImage: toBikeMediaItem(primaryFromList) || images[0] || null,
    rcDoc: toBikeMediaItem(bike.rcDoc),
    insuranceDoc: toBikeMediaItem(bike.insuranceDoc),
    pucDoc: toBikeMediaItem(bike.pucDoc),
    requiredDocuments: Array.isArray(bike.requiredDocuments)
      ? bike.requiredDocuments.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    settingsOverride: bike.settingsOverride && typeof bike.settingsOverride === "object"
      ? { ...bike.settingsOverride }
      : null,
  };
};

const revokeLocalBikeMedia = (item) => {
  const blob = item?.previewUrl || (item?.isLocal ? item?.url : "");
  if (blob?.startsWith?.("blob:")) {
    try { URL.revokeObjectURL(blob); } catch { /* ignore */ }
  }
};

export const revokeBikeFormMedia = (form) => {
  (form.images || []).forEach(revokeLocalBikeMedia);
  revokeLocalBikeMedia(form.primaryImage);
  revokeLocalBikeMedia(form.rcDoc);
  revokeLocalBikeMedia(form.insuranceDoc);
  revokeLocalBikeMedia(form.pucDoc);
};

export function validateBikeForm(form) {
  const errors = {};
  const requiredText = [
    ["name", "Bike name", BIKE_FORM_LIMITS.name],
    ["brand", "Brand", BIKE_FORM_LIMITS.brand],
    ["model", "Model", BIKE_FORM_LIMITS.model],
    ["registrationNumber", "Registration number", BIKE_FORM_LIMITS.registrationNumber],
  ];

  requiredText.forEach(([key, label, max]) => {
    const value = trimBikeValue(form[key]);
    if (!value) errors[key] = `${label} is required`;
    else if (value.length > max) errors[key] = `${label} must be at most ${max} characters`;
  });

  if (isBikeValueBlank(form.categoryId)) errors.categoryId = "Category is required";
  if (isBikeValueBlank(form.zoneId)) errors.zoneId = "Zone is required";
  if (isBikeValueBlank(form.hubId)) errors.hubId = "Pickup hub is required";

  const registration = trimBikeValue(form.registrationNumber).toUpperCase();
  if (registration && !/^[A-Z0-9\- ]{4,40}$/.test(registration)) {
    errors.registrationNumber = "Use 4–40 letters, numbers, spaces, or hyphens";
  }

  const engine = trimBikeValue(form.engineNumber);
  if (engine) {
    if (engine.length > BIKE_FORM_LIMITS.engineNumber) {
      errors.engineNumber = `Engine number must be at most ${BIKE_FORM_LIMITS.engineNumber} characters`;
    } else if (/^\s+$/.test(String(form.engineNumber || ""))) {
      errors.engineNumber = "Engine number cannot be only spaces";
    }
  }

  const chassis = trimBikeValue(form.chassisNumber);
  if (chassis && chassis.length > BIKE_FORM_LIMITS.chassisNumber) {
    errors.chassisNumber = `Chassis number must be at most ${BIKE_FORM_LIMITS.chassisNumber} characters`;
  }

  const description = trimBikeValue(form.description);
  if (String(form.description || "").length && !description) {
    errors.description = "Description cannot be only spaces";
  } else if (description.length > BIKE_FORM_LIMITS.description) {
    errors.description = `Description must be at most ${BIKE_FORM_LIMITS.description} characters`;
  }

  const seating = Number(form.seatingCapacity);
  if (
    !Number.isInteger(seating)
    || seating < BIKE_FORM_LIMITS.seatingCapacityMin
    || seating > BIKE_FORM_LIMITS.seatingCapacityMax
  ) {
    errors.seatingCapacity = `Seating capacity must be an integer from ${BIKE_FORM_LIMITS.seatingCapacityMin} to ${BIKE_FORM_LIMITS.seatingCapacityMax}`;
  }

  const moneyFields = [
    ["hourlyPrice", "Hourly price"],
    ["dailyPrice", "Full day price"],
    ["weeklyPrice", "Full week price"],
    ["securityDeposit", "Security deposit"],
  ];
  moneyFields.forEach(([key, label]) => {
    const raw = trimBikeValue(form[key]);
    if (!raw) {
      errors[key] = `${label} is required`;
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      errors[key] = `${label} must be a valid amount (max 2 decimals)`;
      return;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      errors[key] = `${label} cannot be negative`;
    }
  });

  if (!["petrol", "diesel", "electric", "hybrid", "cng", "other"].includes(form.fuelType)) {
    errors.fuelType = "Select a valid fuel type";
  }
  if (!["manual", "automatic", "cvt", "other"].includes(form.transmission)) {
    errors.transmission = "Select a valid transmission";
  }
  if (
    !["available", "reserved", "rented", "maintenance", "disabled", "unavailable"].includes(
      form.availabilityStatus,
    )
  ) {
    errors.availabilityStatus = "Select a valid availability status";
  }
  if (!["none", "maintenance"].includes(form.maintenanceStatus)) {
    errors.maintenanceStatus = "Select a valid maintenance status";
  }

  if ((form.images || []).length > BIKE_FORM_LIMITS.maxImages) {
    errors.images = `You can add up to ${BIKE_FORM_LIMITS.maxImages} images`;
  }

  return errors;
}

/** Upload every deferred (local-file) media item on the form. Throws on first failure. */
export async function uploadBikeFormMedia(form, { onPhase } = {}) {
  onPhase?.("Uploading media…");
  const uploadedImages = await uploadDeferredMediaItems(form.images || [], {
    folder: "bike-rent/bikes",
  });
  const uploadedPrimary = form.primaryImage
    ? await uploadDeferredMediaItems([form.primaryImage], { folder: "bike-rent/bikes" })
    : [];
  const uploadedRc = form.rcDoc
    ? await uploadDeferredMediaItems([form.rcDoc], { folder: "bike-rent/docs" })
    : [];
  const uploadedInsurance = form.insuranceDoc
    ? await uploadDeferredMediaItems([form.insuranceDoc], { folder: "bike-rent/docs" })
    : [];
  const uploadedPuc = form.pucDoc
    ? await uploadDeferredMediaItems([form.pucDoc], { folder: "bike-rent/docs" })
    : [];
  return { uploadedImages, uploadedPrimary, uploadedRc, uploadedInsurance, uploadedPuc };
}

/** Assemble the API payload from form state + already-uploaded media URLs. */
export function buildBikePayload(form, uploadedMedia, documentCatalog = []) {
  const { uploadedImages, uploadedPrimary, uploadedRc, uploadedInsurance, uploadedPuc } = uploadedMedia;
  const primaryUrl = uploadedPrimary[0]?.url || "";
  const imageUrls = [
    ...new Set([primaryUrl, ...uploadedImages.map((item) => item.url)].filter(Boolean)),
  ];
  const primaryPublicId =
    uploadedPrimary[0]?.publicId
    || uploadedImages.find((item) => item.url === primaryUrl)?.publicId
    || "";

  return {
    name: trimBikeValue(form.name),
    brand: trimBikeValue(form.brand),
    model: trimBikeValue(form.model),
    categoryId: form.categoryId,
    registrationNumber: trimBikeValue(form.registrationNumber).toUpperCase(),
    engineNumber: trimBikeValue(form.engineNumber),
    chassisNumber: trimBikeValue(form.chassisNumber),
    fuelType: form.fuelType,
    transmission: form.transmission,
    seatingCapacity: Number(form.seatingCapacity),
    helmetIncluded: Boolean(form.helmetIncluded),
    description: trimBikeValue(form.description),
    hourlyPrice: Number(form.hourlyPrice),
    dailyPrice: Number(form.dailyPrice),
    weeklyPrice: Number(form.weeklyPrice),
    securityDeposit: Number(form.securityDeposit),
    zoneId: form.zoneId,
    hubId: form.hubId,
    availabilityStatus: form.availabilityStatus,
    maintenanceStatus: form.maintenanceStatus,
    isActive: Boolean(form.isActive),
    images: imageUrls.map((url, index) => ({
      url,
      publicId:
        url === primaryUrl
          ? primaryPublicId
          : uploadedImages.find((item) => item.url === url)?.publicId || "",
      isPrimary: url === primaryUrl || (!primaryUrl && index === 0),
    })),
    rcDoc: uploadedRc[0]
      ? { url: uploadedRc[0].url, publicId: uploadedRc[0].publicId || "" }
      : { url: "", publicId: "" },
    insuranceDoc: uploadedInsurance[0]
      ? { url: uploadedInsurance[0].url, publicId: uploadedInsurance[0].publicId || "" }
      : { url: "", publicId: "" },
    pucDoc: uploadedPuc[0]
      ? { url: uploadedPuc[0].url, publicId: uploadedPuc[0].publicId || "" }
      : { url: "", publicId: "" },
    requiredDocuments: (form.requiredDocuments || []).filter((key) =>
      documentCatalog.some((d) => d.key === key)),
    settingsOverride: form.settingsOverride && Object.keys(form.settingsOverride).length
      ? form.settingsOverride
      : null,
  };
}
