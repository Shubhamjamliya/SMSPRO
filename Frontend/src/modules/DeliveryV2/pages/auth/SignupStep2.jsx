import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, X, Check, Camera, Image as ImageIcon } from "lucide-react";
import { deliveryAPI } from "@food/api";
import { toast } from "sonner";
import { openCamera, openGallery } from "@food/utils/imageUploadUtils";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";
import {
  DOC_KEYS,
  ALL_DOC_KEYS,
  ONBOARDING_STEPS,
  VEHICLE_OPTIONS,
  emptyUploadedDocs,
  loadSignupDetails,
  saveFileToDB,
  getFileFromDB,
  getCachedSignupFile,
  removeFileFromDB,
  isMotorizedVehicle,
  resolveVehicleRequirements,
  validateVehicleStep,
  validateAddressStep,
  getResubmitModules,
  loadHighlightedFields,
  syncPrimaryVehicleFields,
} from "../../utils/signupDraft";
import { resolveIdentityRequirementsForVehicle } from "../../utils/vehicleIdentityRules";
import {
  hasBinaryUpload,
  toUploadFile,
  hasDocumentValue,
  validateDocumentsStep,
  buildRegistrationFormData,
  clearSignupSession,
  getFriendlyRegistrationError,
} from "../../utils/signupSubmit";
import { persistOnboardingDraftStep } from "../../utils/onboardingDraftApi";
import { focusFirstInvalidField } from "../../utils/signupStepValidation";
import { DeliveryStepper } from "../../components/ui/deliveryUi";
import {
  useDriverOnboardingConfig,
  buildMultiModuleDocumentPlan,
} from "../../hooks/useDriverOnboardingConfig";
import useServerOnboardingDraft from "../../hooks/useServerOnboardingDraft";
const fieldClass = (hasError) =>
  `w-full min-h-[48px] px-4 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-orange/30 ${
    hasError ? "border-red-500" : "border-gray-300"
  }`;

function SharedDocumentRow({
  label,
  required = true,
  sharedFrom,
  hasUpload = false,
  highlighted = false,
}) {
  const fromLabel = sharedFrom
    ? `${sharedFrom.moduleLabel}${sharedFrom.vehicleName ? ` · ${sharedFrom.vehicleName}` : ""}`
    : "another service";

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 flex items-start justify-between gap-3 ${
        highlighted
          ? "border-amber-400 bg-amber-50/40"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">
          {label}
          {required ? (
            <span className="text-red-500 ml-0.5">*</span>
          ) : (
            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Optional
            </span>
          )}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
          Uses the same file uploaded for {fromLabel}
        </p>
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          hasUpload
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-200 text-slate-600"
        }`}
      >
        {hasUpload ? (
          <>
            <Check className="w-3 h-3" /> Shared
          </>
        ) : (
          "Awaiting upload"
        )}
      </span>
    </div>
  );
}

function DocumentUpload({
  docType,
  label,
  file,
  uploaded,
  onCamera,
  onGallery,
  onRemove,
  restoring,
  highlighted = false,
  required = true,
  alsoUsedBy = [],
  error = "",
}) {
  const binary = toUploadFile(file, docType);
  const preview =
    (binary
      ? binary._previewUrl || (binary._previewUrl = URL.createObjectURL(binary))
      : null) ||
    (typeof uploaded === "string" && !uploaded.startsWith("blob:")
      ? uploaded
      : null) ||
    (uploaded?.url && !String(uploaded.url).startsWith("blob:")
      ? uploaded.url
      : null);
  const isExistingServerDoc =
    Boolean(preview) &&
    !binary &&
    ((typeof uploaded === "string" && !uploaded.startsWith("blob:")) ||
      Boolean(uploaded?.url));

  return (
    <div
      data-field={docType}
      className={`border rounded-xl overflow-hidden bg-white ${
        error
          ? "border-red-500 ring-1 ring-red-200"
          : highlighted
            ? "border-amber-400 ring-2 ring-amber-200/60"
            : "border-gray-200"
      }`}
    >
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">
            {label}
            {required ? (
              <span className="text-red-500 ml-0.5">*</span>
            ) : (
              <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Optional
              </span>
            )}
          </p>
          {alsoUsedBy?.length ? (
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Also used for{" "}
              {alsoUsedBy
                .map(
                  (item) =>
                    `${item.moduleLabel}${item.vehicleName ? ` · ${item.vehicleName}` : ""}`,
                )
                .join(", ")}
            </p>
          ) : null}
          {highlighted ? (
            <p className="text-[11px] font-semibold text-amber-700">Needs review</p>
          ) : null}
        </div>
        {preview && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full shrink-0">
            <Check className="w-3 h-3" />{" "}
            {isExistingServerDoc ? "On file" : "Uploaded"}
          </span>
        )}
      </div>
      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt={label}
            className="w-full h-40 sm:h-48 object-cover"
          />
          {isExistingServerDoc ? (
            <p className="absolute bottom-2 left-2 right-12 rounded-lg bg-black/55 px-2 py-1 text-[11px] text-white">
              Previously uploaded — replace only if this needs correction
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(docType)}
            className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full"
            aria-label={`Remove ${label}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="p-4 flex flex-col items-center justify-center min-h-[140px] bg-gray-50 border-t border-dashed border-gray-200">
          {restoring ? (
            <p className="text-sm text-gray-500">Restoring…</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
              <button
                type="button"
                onClick={() => onCamera(docType, label)}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-primary-orange text-white text-sm font-medium active:scale-95"
              >
                <Camera className="w-4 h-4" /> Take photo
              </button>
              <button
                type="button"
                onClick={() => onGallery(docType)}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-800 text-sm font-medium active:scale-95"
              >
                <ImageIcon className="w-4 h-4" /> Gallery
              </button>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-3">
            JPG, PNG, WEBP · max 5MB
          </p>
        </div>
      )}
      {error ? (
        <p className="px-3 py-2 text-xs text-red-500 border-t border-red-100 bg-red-50/50">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function SignupStep2() {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const submitLock = useRef(false);
  const { modules, loading: configLoading } = useDriverOnboardingConfig();

  const documentsRequested = useMemo(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("deliveryDocumentsRequested") || "[]",
      );
    } catch {
      return [];
    }
  }, []);
  const isPartialReupload = documentsRequested.length > 0;

  const {
    loading: draftLoading,
    ready: draftReady,
    details: serverDetails,
    docMarkers: serverDocMarkers,
    setDetails: setServerDetails,
  } = useServerOnboardingDraft({
    redirectIfUnauthenticated: !isPartialReupload,
  });

  const resubmitModules = useMemo(() => getResubmitModules(), []);

  const [formData, setFormData] = useState(serverDetails);
  const [errors, setErrors] = useState({});

  // In resubmit mode only the flagged modules are editable/submittable
  useEffect(() => {
    if (!resubmitModules.length) return;
    setFormData((prev) => {
      const filtered = (prev.selectedModules || []).filter((key) =>
        resubmitModules.includes(key),
      );
      const next = filtered.length ? filtered : [...resubmitModules];
      if (
        next.length === (prev.selectedModules || []).length &&
        next.every((key, i) => prev.selectedModules[i] === key)
      ) {
        return prev;
      }
      return { ...prev, selectedModules: next };
    });
  }, [resubmitModules]);

  useEffect(() => {
    if (!draftReady) return;
    setFormData(serverDetails);
    if (!isPartialReupload) {
      if (Object.keys(validateAddressStep(serverDetails)).length) {
        toast.error("Complete address details first");
        navigate("/food/delivery/signup/address", { replace: true });
      }
    }
  }, [draftReady, serverDetails, isPartialReupload, navigate]);

  const visibleModules = useMemo(
    () =>
      resubmitModules.length
        ? modules.filter((item) => resubmitModules.includes(item.key))
        : modules,
    [modules, resubmitModules],
  );

  const hasConfigModules = visibleModules.length > 0;
  const motorized = isMotorizedVehicle(formData.vehicleType);

  const { needsDl, needsPlate } = useMemo(
    () => resolveVehicleRequirements(formData, { modules }),
    [formData, modules],
  );

  const docLabels = useMemo(() => {
    const labels = { ...DOC_KEYS };
    for (const module of modules) {
      for (const vehicle of module.vehicles || []) {
        for (const doc of vehicle.documents || []) {
          for (const upload of doc.uploadFields || []) {
            labels[upload.field] = upload.label || doc.label || upload.field;
          }
        }
      }
    }
    return labels;
  }, [modules]);

  const moduleVehicleSelections = useMemo(() => {
    if (!modules.length || !(formData.selectedModules || []).length) return [];
    return (formData.selectedModules || [])
      .map((moduleKey) => {
        const moduleDef = modules.find((item) => item.key === moduleKey);
        const vehicleId =
          formData.moduleVehicles?.[moduleKey]?.vehicleConfigurationId;
        const vehicle = moduleDef?.vehicles?.find(
          (item) => item.id === vehicleId,
        );
        if (!vehicle) return null;
        return {
          moduleKey,
          moduleLabel: moduleDef?.label || moduleKey,
          vehicle,
        };
      })
      .filter(Boolean);
  }, [modules, formData.selectedModules, formData.moduleVehicles]);

  const documentPlan = useMemo(
    () => buildMultiModuleDocumentPlan(moduleVehicleSelections),
    [moduleVehicleSelections],
  );

  /** Flat list for validation + restore (deduped by field). */
  const documentFields = useMemo(() => {
    if (documentsRequested.length > 0) {
      return documentsRequested
        .filter((k) => ALL_DOC_KEYS.includes(k) || Boolean(docLabels[k]))
        .map((field) => ({
          field,
          label: docLabels[field] || DOC_KEYS[field] || field,
          required: true,
          documentKey: field,
        }));
    }

    if (hasConfigModules) {
      return documentPlan.configuredFields.map((item) => ({
        ...item,
        label:
          item.label ||
          docLabels[item.field] ||
          DOC_KEYS[item.field] ||
          item.field,
      }));
    }

    // Legacy fallback when no Vehicle Configuration modules are available
    const base = ["profilePhoto", "aadharFront", "aadharBack"];
    const fields = motorized
      ? [
          ...base,
          "drivingLicenseFront",
          "drivingLicenseBack",
          "rcPhoto",
          "insurancePhoto",
        ]
      : base;
    return fields.map((field) => ({
      field,
      label: docLabels[field] || DOC_KEYS[field] || field,
      required: true,
      documentKey: field,
    }));
  }, [
    documentsRequested,
    hasConfigModules,
    documentPlan,
    docLabels,
    motorized,
  ]);

  const documentGroups = useMemo(() => {
    if (documentsRequested.length > 0 || !hasConfigModules) return [];
    return documentPlan.groups.map((group) => ({
      ...group,
      fields: group.fields.map((item) => ({
        ...item,
        label:
          item.label ||
          docLabels[item.field] ||
          DOC_KEYS[item.field] ||
          item.field,
      })),
    }));
  }, [
    documentsRequested,
    hasConfigModules,
    documentPlan,
    docLabels,
  ]);

  const requiredDocs = useMemo(
    () =>
      documentFields
        .filter((item) => item.required !== false)
        .map((item) => item.field),
    [documentFields],
  );

  const visibleDocKeys = useMemo(
    () => documentFields.map((item) => item.field),
    [documentFields],
  );

  const requiredDocsKey = visibleDocKeys.join("|");
  const highlightedFields = useMemo(
    () => new Set(loadHighlightedFields()),
    [],
  );

  const [documents, setDocuments] = useState(() =>
    ALL_DOC_KEYS.reduce((acc, k) => ({ ...acc, [k]: null }), {}),
  );
  const [uploadedDocs, setUploadedDocs] = useState(() => emptyUploadedDocs());
  const [restoring, setRestoring] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const documentsRef = useRef(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);
  const uploadedDocsRef = useRef(uploadedDocs);
  useEffect(() => {
    uploadedDocsRef.current = uploadedDocs;
  }, [uploadedDocs]);

  // Hydrate document URL markers from the authenticated driver's server draft
  useEffect(() => {
    if (!draftReady) return;
    setUploadedDocs((prev) => ({
      ...emptyUploadedDocs(),
      ...prev,
      ...serverDocMarkers,
    }));
  }, [draftReady, serverDocMarkers]);

  // For partial re-upload we only need phone on the draft
  useEffect(() => {
    if (!isPartialReupload) return;
    if (formData?.phone) return;
    try {
      const user = JSON.parse(localStorage.getItem("delivery_user") || "null");
      const phone = String(user?.phone || "")
        .replace(/\D/g, "")
        .slice(-10);
      if (phone) {
        setFormData((prev) => ({ ...prev, phone, countryCode: "+91" }));
      }
    } catch {
      /* ignore */
    }
  }, [isPartialReupload, formData?.phone]);

  // Optional same-session File cache. Flutter IndexedDB often hangs — restore
  // from the in-memory cache so RC Front is not lost after the camera returns.
  useEffect(() => {
    let cancelled = false;
    let safetyTimer = null;

    const finish = () => {
      if (!cancelled) setRestoring(false);
    };

    // Same-session IndexedDB cache is unreliable inside Flutter's WebView.
    const inFlutterWebView =
      typeof window !== "undefined" &&
      Boolean(window.flutter_inappwebview);

    const restoreMemory = () => {
      const restored = {};
      for (const key of visibleDocKeys) {
        if (hasBinaryUpload(documentsRef.current[key])) continue;
        const file = toUploadFile(getCachedSignupFile(key), key);
        if (file) restored[key] = file;
      }
      if (Object.keys(restored).length) {
        setDocuments((prev) => ({ ...prev, ...restored }));
      }
    };

    if (inFlutterWebView || !visibleDocKeys.length) {
      restoreMemory();
      setRestoring(false);
      return () => {
        cancelled = true;
      };
    }

    setRestoring(true);
    safetyTimer = setTimeout(finish, 4000);

    (async () => {
      try {
        const restored = {};
        for (const key of visibleDocKeys) {
          if (cancelled) return;
          if (hasBinaryUpload(documentsRef.current[key])) continue;
          if (hasDocumentValue(null, uploadedDocsRef.current[key])) continue;
          const raw = await getFileFromDB(key);
          const file = toUploadFile(raw, key);
          if (file) restored[key] = file;
        }
        if (!cancelled && Object.keys(restored).length) {
          setDocuments((prev) => ({ ...prev, ...restored }));
        }
      } catch {
        /* IndexedDB / File reconstruction can fail in WebViews — show upload UI */
      } finally {
        if (safetyTimer) clearTimeout(safetyTimer);
        finish();
      }
    })();

    return () => {
      cancelled = true;
      if (safetyTimer) clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredDocsKey, draftReady]);

  useEffect(() => {
    sessionStorage.setItem("deliverySignupDocs", JSON.stringify(uploadedDocs));
  }, [uploadedDocs]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset > 80 ? inset : 0);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(documentsRef.current).forEach((file) => {
        if (file instanceof File && file._previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(file._previewUrl);
        }
      });
    };
  }, []);

  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let next = value;
    if (name === "drivingLicenseNumber" || name === "vehicleNumber") {
      next = String(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, name === "vehicleNumber" ? 10 : 16);
    }
    setField(name, next);
  };

  const toggleModule = (moduleKey) => {
    setFormData((prev) => {
      const selected = Array.isArray(prev.selectedModules)
        ? prev.selectedModules
        : [];
      const next = selected.includes(moduleKey)
        ? selected.filter((key) => key !== moduleKey)
        : [...selected, moduleKey];
      return { ...prev, selectedModules: next };
    });
    setErrors((prev) => ({
      ...prev,
      selectedModules: "",
      [`vehicle_${moduleKey}`]: "",
    }));
  };

  const pickModuleVehicle = (moduleKey, vehicle) => {
    setFormData((prev) => {
      const existing = prev.moduleVehicles?.[moduleKey] || {};
      return {
        ...prev,
        moduleVehicles: {
          ...(prev.moduleVehicles || {}),
          [moduleKey]: {
            ...existing,
            vehicleConfigurationId: vehicle.id,
            vehicleName: vehicle.name,
          },
        },
      };
    });
    setErrors((prev) => ({
      ...prev,
      [`vehicle_${moduleKey}`]: "",
      [`vehicleNumber_${moduleKey}`]: "",
      [`vehicleBrand_${moduleKey}`]: "",
      [`vehicleModel_${moduleKey}`]: "",
    }));
  };

  const setModuleVehicleField = (moduleKey, field, value) => {
    let next = value;
    if (field === "vehicleNumber") {
      next = String(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 10);
    }
    setFormData((prev) => ({
      ...prev,
      moduleVehicles: {
        ...(prev.moduleVehicles || {}),
        [moduleKey]: {
          ...(prev.moduleVehicles?.[moduleKey] || {}),
          [field]: next,
        },
      },
    }));
    const errorKey = `${field}_${moduleKey}`;
    if (errors[errorKey]) {
      setErrors((prev) => ({ ...prev, [errorKey]: "" }));
    }
  };

  const handleLegacyVehicleSelect = (id) => {
    setFormData((prev) => ({
      ...prev,
      vehicleType: id,
      ...(id === "bicycle"
        ? {
            vehicleNumber: "",
            drivingLicenseNumber: "",
            drivingLicenseExpiry: "",
          }
        : {}),
    }));
    if (errors.vehicleType) setErrors((prev) => ({ ...prev, vehicleType: "" }));
  };

  const handleFileSelect = async (docType, file) => {
    if (!file) return;
    const normalized = toUploadFile(file, docType);
    const mime = String(normalized?.type || "").toLowerCase();
    const looksLikeImage =
      !mime ||
      mime.startsWith("image/") ||
      mime === "application/octet-stream";
    if (!normalized || !looksLikeImage) {
      toast.error("Please select an image file");
      return;
    }
    if (normalized.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }
    setDocuments((prev) => {
      const old = prev[docType];
      if (old?._previewUrl) URL.revokeObjectURL(old._previewUrl);
      return { ...prev, [docType]: normalized };
    });
    setUploadedDocs((prev) => ({ ...prev, [docType]: { file: true } }));
    if (errors[docType]) {
      setErrors((prev) => ({ ...prev, [docType]: "" }));
    }
    await saveFileToDB(docType, normalized);
    toast.success(`${docLabels[docType] || docType} selected`);
  };

  const handleRemove = (docType) => {
    setDocuments((prev) => {
      const file = prev[docType];
      if (file?._previewUrl) URL.revokeObjectURL(file._previewUrl);
      return { ...prev, [docType]: null };
    });
    setUploadedDocs((prev) => ({ ...prev, [docType]: null }));
    removeFileFromDB(docType);
  };

  /** Legacy flow: admin requested specific documents — submit them directly */
  const runPartialSubmit = async () => {
    if (submitLock.current) return;
    const liveDocs = documentsRef.current;
    const docErrors = validateDocumentsStep({
      requiredFields: requiredDocs,
      documents: liveDocs,
      uploadedDocs: {},
      labels: docLabels,
    });
    // Partial re-upload requires fresh binaries
    const missing = requiredDocs.filter((key) => !hasBinaryUpload(liveDocs[key]));
    if (missing.length) {
      const nextErrors = Object.fromEntries(
        missing.map((key) => [
          key,
          docErrors[key] || `${docLabels[key] || key} is required`,
        ]),
      );
      setErrors((prev) => ({ ...prev, ...nextErrors }));
      toast.error(
        `Please re-select: ${missing.map((k) => docLabels[k] || k).join(", ")}`,
      );
      setUploadedDocs((prev) => {
        const next = { ...prev };
        missing.forEach((k) => {
          next[k] = null;
        });
        return next;
      });
      requestAnimationFrame(() => focusFirstInvalidField(nextErrors));
      return;
    }
    submitLock.current = true;
    setIsSubmitting(true);
    try {
      const details = loadSignupDetails() || {};
      if (!details?.phone) {
        toast.error("Session expired. Please start again.");
        navigate("/food/delivery/login", { replace: true });
        return;
      }
      const fd = await buildRegistrationFormData(details, liveDocs, {
        partial: true,
      });
      const response = await deliveryAPI.register(fd);
      if (!response?.data?.success) {
        throw new Error(
          response?.data?.message ||
            response?.data?.error ||
            "Submission failed. Please try again.",
        );
      }
      const phoneDisplay = `${details.countryCode || "+91"} ${String(details.phone).replace(/\D/g, "").slice(-10)}`;
      clearSignupSession();
      sessionStorage.setItem("deliveryPendingPhone", phoneDisplay);
      sessionStorage.removeItem("deliveryNeedsRegistration");
      toast.success("Submitted. Verification is in progress.");
      setTimeout(
        () =>
          navigate("/food/delivery/verification", {
            replace: true,
            state: { phone: phoneDisplay },
          }),
        800,
      );
    } catch (error) {
      toast.error(getFriendlyRegistrationError(error));
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  const handleContinue = async (e) => {
    e?.preventDefault?.();
    if (isSubmitting) return;

    if (isPartialReupload) {
      runPartialSubmit();
      return;
    }

    const vehicleErrors = validateVehicleStep(formData, { modules });
    const documentErrors = validateDocumentsStep({
      requiredFields: requiredDocs,
      documents,
      uploadedDocs,
      labels: docLabels,
    });
    const nextErrors = { ...vehicleErrors, ...documentErrors };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error(
        Object.keys(vehicleErrors).length
          ? "Please complete vehicle details"
          : "Please upload required documents",
      );
      requestAnimationFrame(() => focusFirstInvalidField(nextErrors));
      return;
    }

    setIsSubmitting(true);
    try {
      const details = syncPrimaryVehicleFields({
        ...formData,
        vehicleNumber: (formData.vehicleNumber || "").trim().toUpperCase(),
        vehicleBrand: (formData.vehicleBrand || "").trim(),
        vehicleModel: (formData.vehicleModel || "").trim(),
        drivingLicenseNumber: (formData.drivingLicenseNumber || "")
          .trim()
          .toUpperCase(),
      });
      // Normalize per-module plates
      const moduleVehicles = { ...(details.moduleVehicles || {}) };
      for (const key of Object.keys(moduleVehicles)) {
        const pick = moduleVehicles[key] || {};
        moduleVehicles[key] = {
          ...pick,
          vehicleNumber: String(pick.vehicleNumber || "")
            .trim()
            .toUpperCase(),
          vehicleBrand: String(pick.vehicleBrand || "").trim(),
          vehicleModel: String(pick.vehicleModel || "").trim(),
        };
      }
      details.moduleVehicles = moduleVehicles;

      const filesToUpload = {};
      for (const key of Object.keys(documents)) {
        if (hasBinaryUpload(documents[key])) {
          filesToUpload[key] = documents[key];
        }
      }
      const saved = await persistOnboardingDraftStep({
        details,
        step: "review",
        documents: filesToUpload,
      });
      setServerDetails(saved.details);
      setFormData(saved.details);
      if (saved.docs) {
        setUploadedDocs((prev) => ({ ...prev, ...saved.docs }));
      }
      const savedDocUrl = (value) => {
        if (typeof value === "string") return value.trim();
        if (value && typeof value === "object" && value.url) {
          return String(value.url).trim();
        }
        return "";
      };
      // Keep local binaries until Cloudinary URLs exist — APK WebView
      // uploads can succeed on JSON fields while dropping files.
      const confirmedKeys = Object.keys(filesToUpload).filter((key) =>
        savedDocUrl(saved.docs?.[key]),
      );
      if (confirmedKeys.length) {
        setDocuments((prev) => {
          const next = { ...prev };
          for (const key of confirmedKeys) next[key] = null;
          return next;
        });
      }
      navigate("/food/delivery/signup/review");
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const rejectionReason = sessionStorage.getItem("deliveryRejectionReason");

  return (
    <div
      className="min-h-screen bg-slate-50 flex flex-col"
      style={{ paddingBottom: keyboardInset ? keyboardInset + 16 : undefined }}
    >
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-3 sm:px-4 py-3 flex items-center gap-3 border-b border-slate-200">
        <button
          type="button"
          onClick={goBack}
          className="p-2 -ml-1 hover:bg-gray-100 rounded-full"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
            {isPartialReupload ? "Upload documents" : "Vehicle & documents"}
          </h1>
          <p className="text-xs text-gray-500 truncate">
            {isPartialReupload
              ? "Re-upload the requested documents"
              : "Step 3 of 4 · Vehicle & documents"}
          </p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {!isPartialReupload && (
          <DeliveryStepper step={3} steps={ONBOARDING_STEPS} />
        )}

        {rejectionReason && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            {rejectionReason}
          </div>
        )}

        {resubmitModules.length > 0 && !isPartialReupload && (
          <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-900">
            You are resubmitting your application for:{" "}
            <span className="font-semibold capitalize">
              {resubmitModules.join(", ").replace(/-/g, " ")}
            </span>
            . Review your details and update the rejected items.
          </div>
        )}

        <form onSubmit={handleContinue} className="space-y-5" noValidate>
          {!isPartialReupload && hasConfigModules && (
            <section
              data-field="selectedModules"
              className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4 shadow-sm"
            >
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  Where do you want to work?
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select one or more services and your vehicle for each
                </p>
              </div>

              {visibleModules.map((module) => {
                const selected = (formData.selectedModules || []).includes(
                  module.key,
                );
                const pick = formData.moduleVehicles?.[module.key];
                return (
                  <div
                    key={module.key}
                    data-field={`vehicle_${module.key}`}
                    className={`rounded-xl border-2 transition-all ${
                      selected
                        ? "border-primary-orange bg-orange-50/40"
                        : errors[`vehicle_${module.key}`]
                          ? "border-red-500 bg-white"
                          : "border-gray-200 bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleModule(module.key)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-3"
                    >
                      <span className="text-sm font-semibold text-gray-900">
                        {module.label || module.key}
                      </span>
                      <span
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                          selected
                            ? "bg-primary-orange border-primary-orange text-white"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {selected ? <Check className="w-3.5 h-3.5" /> : null}
                      </span>
                    </button>

                    {selected && (
                      <div className="px-3 pb-3 space-y-2">
                        <p className="text-xs font-medium text-gray-600">
                          Choose vehicle
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {(module.vehicles || []).map((vehicle) => {
                            const isPicked =
                              pick?.vehicleConfigurationId === vehicle.id;
                            return (
                              <button
                                key={vehicle.id}
                                type="button"
                                onClick={() =>
                                  pickModuleVehicle(module.key, vehicle)
                                }
                                className={`flex flex-col items-center justify-center gap-1 min-h-[72px] rounded-xl border-2 px-2 py-2 transition-all ${
                                  isPicked
                                    ? "border-primary-orange bg-orange-50 text-orange-800"
                                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                                }`}
                              >
                                {vehicle.icon ? (
                                  <img
                                    src={vehicle.icon}
                                    alt=""
                                    className="w-8 h-8 object-contain"
                                  />
                                ) : (
                                  <span className="text-xl" aria-hidden>
                                    🚗
                                  </span>
                                )}
                                <span className="text-[11px] sm:text-xs font-semibold truncate max-w-full">
                                  {vehicle.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {errors[`vehicle_${module.key}`] && (
                          <p className="text-red-500 text-xs">
                            {errors[`vehicle_${module.key}`]}
                          </p>
                        )}

                        {(() => {
                          if (!pick?.vehicleConfigurationId) return null;
                          const vehicleDef = (module.vehicles || []).find(
                            (item) => item.id === pick.vehicleConfigurationId,
                          );
                          const identity =
                            resolveIdentityRequirementsForVehicle(vehicleDef);
                          if (!identity.needsPlate) return null;
                          return (
                            <div className="mt-3 space-y-2.5 rounded-xl border border-orange-100 bg-white p-3">
                              <p className="text-xs font-semibold text-gray-800">
                                {module.label || module.key} ·{" "}
                                {pick.vehicleName || "Vehicle"} details
                              </p>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Brand <span className="text-red-500">*</span>
                                </label>
                                <input
                                  name={`vehicleBrand_${module.key}`}
                                  data-field={`vehicleBrand_${module.key}`}
                                  value={pick.vehicleBrand || ""}
                                  onChange={(e) =>
                                    setModuleVehicleField(
                                      module.key,
                                      "vehicleBrand",
                                      e.target.value,
                                    )
                                  }
                                  className={fieldClass(
                                    errors[`vehicleBrand_${module.key}`],
                                  )}
                                  placeholder="e.g. Honda"
                                />
                                {errors[`vehicleBrand_${module.key}`] ? (
                                  <p className="text-red-500 text-xs mt-1">
                                    {errors[`vehicleBrand_${module.key}`]}
                                  </p>
                                ) : null}
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Model <span className="text-red-500">*</span>
                                </label>
                                <input
                                  name={`vehicleModel_${module.key}`}
                                  data-field={`vehicleModel_${module.key}`}
                                  value={pick.vehicleModel || ""}
                                  onChange={(e) =>
                                    setModuleVehicleField(
                                      module.key,
                                      "vehicleModel",
                                      e.target.value,
                                    )
                                  }
                                  className={fieldClass(
                                    errors[`vehicleModel_${module.key}`],
                                  )}
                                  placeholder="e.g. Activa 6G"
                                />
                                {errors[`vehicleModel_${module.key}`] ? (
                                  <p className="text-red-500 text-xs mt-1">
                                    {errors[`vehicleModel_${module.key}`]}
                                  </p>
                                ) : null}
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Vehicle number{" "}
                                  <span className="text-red-500">*</span>
                                </label>
                                <input
                                  name={`vehicleNumber_${module.key}`}
                                  data-field={`vehicleNumber_${module.key}`}
                                  value={pick.vehicleNumber || ""}
                                  onChange={(e) =>
                                    setModuleVehicleField(
                                      module.key,
                                      "vehicleNumber",
                                      e.target.value,
                                    )
                                  }
                                  className={fieldClass(
                                    errors[`vehicleNumber_${module.key}`],
                                  )}
                                  placeholder="MH12AB1234"
                                />
                                {errors[`vehicleNumber_${module.key}`] ? (
                                  <p className="text-red-500 text-xs mt-1">
                                    {errors[`vehicleNumber_${module.key}`]}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
              {errors.selectedModules && (
                <p className="text-red-500 text-xs">{errors.selectedModules}</p>
              )}
            </section>
          )}

          {!isPartialReupload && !hasConfigModules && configLoading && (
            <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm">
              <p className="text-sm text-gray-500">Loading vehicle options…</p>
            </section>
          )}

          {!isPartialReupload && !hasConfigModules && !configLoading && (
            <section
              data-field="vehicleType"
              className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4 shadow-sm"
            >
              <h2 className="text-base font-bold text-gray-900">Vehicle</h2>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {VEHICLE_OPTIONS.map((v) => {
                  const selected = formData.vehicleType === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleLegacyVehicleSelect(v.id)}
                      className={`flex flex-col items-center justify-center gap-1 min-h-[88px] rounded-xl border-2 px-2 py-3 transition-all ${
                        selected
                          ? "border-primary-orange bg-orange-50 text-orange-800"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-2xl" aria-hidden>
                        {v.icon}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold">
                        {v.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.vehicleType && (
                <p className="text-red-500 text-xs">{errors.vehicleType}</p>
              )}
              {formData.vehicleType === "bicycle" && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  Bicycle partners do not need RC, insurance, or a driving
                  license.
                </p>
              )}
            </section>
          )}

          {!isPartialReupload &&
            ((hasConfigModules && needsDl) ||
              (!hasConfigModules && (needsPlate || needsDl))) && (
            <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 space-y-4 shadow-sm">
              <h2 className="text-base font-bold text-gray-900">
                {hasConfigModules ? "Driving license" : "Vehicle details"}
              </h2>
              {!hasConfigModules ? (
                <p className="text-xs text-gray-500 -mt-2">
                  Enter once — used for all selected services. Document photos
                  are uploaded separately below.
                </p>
              ) : (
                <p className="text-xs text-gray-500 -mt-2">
                  Your license is shared across all selected services.
                </p>
              )}

              {!hasConfigModules && needsPlate && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vehicle brand <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="vehicleBrand"
                      value={formData.vehicleBrand}
                      onChange={handleChange}
                      className={fieldClass(errors.vehicleBrand)}
                      placeholder="e.g. Honda"
                    />
                    {errors.vehicleBrand && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.vehicleBrand}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vehicle model <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="vehicleModel"
                      value={formData.vehicleModel}
                      onChange={handleChange}
                      className={fieldClass(errors.vehicleModel)}
                      placeholder="e.g. Activa 6G"
                    />
                    {errors.vehicleModel && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.vehicleModel}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vehicle number <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="vehicleNumber"
                      value={formData.vehicleNumber}
                      onChange={handleChange}
                      className={fieldClass(errors.vehicleNumber)}
                      placeholder="MH12AB1234"
                    />
                    {errors.vehicleNumber && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.vehicleNumber}
                      </p>
                    )}
                  </div>
                </>
              )}

              {needsDl && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Driving license number{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="drivingLicenseNumber"
                      value={formData.drivingLicenseNumber}
                      onChange={handleChange}
                      className={fieldClass(errors.drivingLicenseNumber)}
                      placeholder="MH1220110012345"
                    />
                    {errors.drivingLicenseNumber && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.drivingLicenseNumber}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      License expiry <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="drivingLicenseExpiry"
                      type="date"
                      value={formData.drivingLicenseExpiry}
                      onChange={handleChange}
                      min={new Date().toISOString().slice(0, 10)}
                      className={fieldClass(errors.drivingLicenseExpiry)}
                    />
                    {errors.drivingLicenseExpiry && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.drivingLicenseExpiry}
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
          )}

          <section className="space-y-3">
            {!isPartialReupload && (
              <div className="px-1">
                <h2 className="text-base font-bold text-gray-900">Documents</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {documentGroups.length > 1
                    ? "Grouped by service. Shared documents are uploaded once and reused."
                    : "Based on your selected vehicle. Mandatory fields are marked *"}
                </p>
              </div>
            )}

            {documentFields.length === 0 && !isPartialReupload ? (
              <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-xl px-3 py-3">
                {hasConfigModules
                  ? "Select a service and vehicle above to load its document checklist."
                  : "Select a vehicle above to see the required documents."}
              </p>
            ) : documentGroups.length > 0 ? (
              documentGroups.map((group) => (
                <div
                  key={group.moduleKey}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
                >
                  <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {group.moduleLabel}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        Vehicle: {group.vehicleName}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {
                        group.fields.filter((f) => f.required !== false).length
                      }{" "}
                      required
                    </span>
                  </div>
                  <div className="p-3 space-y-2.5">
                    {group.fields.map((item) => {
                      const hasUpload = hasDocumentValue(
                        documents[item.field],
                        uploadedDocs[item.field],
                      );
                      if (item.sharedFrom) {
                        return (
                          <SharedDocumentRow
                            key={`${group.moduleKey}-${item.field}`}
                            label={item.label}
                            required={item.required !== false}
                            sharedFrom={item.sharedFrom}
                            hasUpload={hasUpload}
                            highlighted={highlightedFields.has(item.field)}
                          />
                        );
                      }
                      return (
                        <DocumentUpload
                          key={`${group.moduleKey}-${item.field}`}
                          docType={item.field}
                          label={item.label}
                          required={item.required !== false}
                          alsoUsedBy={item.alsoUsedBy || []}
                          file={documents[item.field]}
                          uploaded={uploadedDocs[item.field]}
                          restoring={restoring && !documents[item.field]}
                          highlighted={highlightedFields.has(item.field)}
                          error={errors[item.field] || ""}
                          onCamera={(docType) =>
                            openCamera({
                              onSelectFile: (file) =>
                                handleFileSelect(docType, file),
                              fileNamePrefix: `signup-${docType}`,
                            })
                          }
                          onGallery={(docType) =>
                            openGallery({
                              onSelectFile: (file) =>
                                handleFileSelect(docType, file),
                              fileNamePrefix: `signup-${docType}`,
                            })
                          }
                          onRemove={handleRemove}
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              documentFields.map((item) => (
                <DocumentUpload
                  key={item.field}
                  docType={item.field}
                  label={
                    item.label ||
                    docLabels[item.field] ||
                    DOC_KEYS[item.field] ||
                    item.field
                  }
                  required={item.required !== false}
                  file={documents[item.field]}
                  uploaded={uploadedDocs[item.field]}
                  restoring={restoring && !documents[item.field]}
                  highlighted={highlightedFields.has(item.field)}
                  error={errors[item.field] || ""}
                  onCamera={(docType) =>
                    openCamera({
                      onSelectFile: (file) => handleFileSelect(docType, file),
                      fileNamePrefix: `signup-${docType}`,
                    })
                  }
                  onGallery={(docType) =>
                    openGallery({
                      onSelectFile: (file) => handleFileSelect(docType, file),
                      fileNamePrefix: `signup-${docType}`,
                    })
                  }
                  onRemove={handleRemove}
                />
              ))
            )}
          </section>

          <div className="h-24" />
        </form>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 px-3 sm:px-4 py-3">
        <div className="max-w-lg mx-auto">
          <button
            type="button"
            onClick={handleContinue}
            disabled={isSubmitting || restoring || draftLoading}
            className="w-full min-h-[52px] rounded-xl bg-primary-orange text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPartialReupload
              ? isSubmitting
                ? "Submitting…"
                : "Submit for verification"
              : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
