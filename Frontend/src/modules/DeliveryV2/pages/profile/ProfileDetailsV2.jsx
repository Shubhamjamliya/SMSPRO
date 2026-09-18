import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Edit2,
  Eye,
  X,
  Loader2,
  User,
  Camera,
  QrCode,
  Smartphone,
  Banknote,
  Shield,
  Info,
  AlertCircle,
  MapPin,
  Truck,
  FileText,
  Bike,
  Car,
  Image as ImageIcon,
} from "lucide-react";
import BottomPopup from "@delivery/components/BottomPopup";
import { toast } from "sonner";
import {
  openCamera,
  isFlutterBridgeAvailable,
} from "@food/utils/imageUploadUtils";
import { deliveryAPI } from "@food/api";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";
import {
  beginModuleEditResubmit,
  flattenDriverEnrollments,
  getAuthorizedServicesFromUser,
  getModuleDisplayName,
} from "../../utils/driverModuleAccess";
import { useDeliveryStore } from "@/modules/DeliveryV2/store/useDeliveryStore";
import {
  ProfileCompactHeader,
  ProfileSection,
  ProfileInfoRow,
  ProfileServiceChips,
  ProfileDocGrid,
} from "@/modules/DeliveryV2/components/profile";

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

/**
 * ProfileDetailsV2 - Betterised Premium UI for Delivery Partner Profile.
 */
export const ProfileDetailsV2 = () => {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const isOnline = useDeliveryStore((s) => s.isOnline);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [showVehiclePopup, setShowVehiclePopup] = useState(false);
  const [vehicleInput, setVehicleInput] = useState({
    number: "",
    brand: "",
    type: "",
  });
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showBankDetailsPopup, setShowBankDetailsPopup] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [bankDetails, setBankDetails] = useState({
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
    panNumber: "",
    upiId: "",
    upiQrCode: null,
  });
  const [upiQrFile, setUpiQrFile] = useState(null);
  const [upiQrPreview, setUpiQrPreview] = useState(null);
  const upiQrInputRef = useRef(null);

  const [bankDetailsErrors, setBankDetailsErrors] = useState({});
  const [isUpdatingBankDetails, setIsUpdatingBankDetails] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef(null);
  const profileCameraInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null); // 'profilePhoto' only for instant picker
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [activePicker, setActivePicker] = useState(null); // { target: 'profilePhoto' | 'upiQrCode', ref: any, title: string }
  const [moduleEnrollments, setModuleEnrollments] = useState([]);
  const [resubmitting, setResubmitting] = useState("");
  const drivingLicenseInputRef = useRef(null);
  const upiQrCameraInputRef = useRef(null);

  // Fetch profile data
  useEffect(() => {
    const parseWalletBalance = (response) => {
      const data = response?.data;
      const wallet =
        (data?.success && data?.data?.wallet) ||
        data?.wallet ||
        data?.data ||
        data;
      const possibleBalance =
        wallet?.totalBalance || wallet?.balance || wallet?.pocketBalance || 0;
      return Number(possibleBalance) || 0;
    };

    const fetchWalletBalance = async () => {
      try {
        const walletResponse = await deliveryAPI.getWallet();
        setWalletBalance(parseWalletBalance(walletResponse));
      } catch (error) {
        debugError("Error fetching wallet balance:", error);
      }
    };

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const [profileResponse] = await Promise.allSettled([
          deliveryAPI.getProfile(),
          fetchWalletBalance(),
        ]);

        if (
          profileResponse?.status === "fulfilled" &&
          profileResponse?.value?.data?.success &&
          profileResponse?.value?.data?.data?.profile
        ) {
          const profileData = profileResponse.value.data.data.profile;
          setProfile(profileData);
          const enrollments = flattenDriverEnrollments(profileData);
          setModuleEnrollments(enrollments);
          if (enrollments.length) {
            useDeliveryStore.getState().setModuleEnrollments(enrollments);
          }
          const vNum = profileData?.vehicle?.number || "";
          const vBrand = profileData?.vehicle?.brand || "";
          const vType = profileData?.vehicle?.type || "";
          setVehicleNumber(vNum);
          setVehicleBrand(vBrand);
          setVehicleType(vType);
          setVehicleInput({ number: vNum, brand: vBrand, type: vType });
          // Set bank details
          setBankDetails({
            accountHolderName:
              profileData?.documents?.bankDetails?.accountHolderName || "",
            accountNumber:
              profileData?.documents?.bankDetails?.accountNumber || "",
            ifscCode: profileData?.documents?.bankDetails?.ifscCode || "",
            bankName: profileData?.documents?.bankDetails?.bankName || "",
            panNumber: profileData?.documents?.pan?.number || "",
            upiId: profileData?.documents?.bankDetails?.upiId || "",
            upiQrCode: profileData?.documents?.bankDetails?.upiQrCode || null,
          });
        } else {
          throw new Error("Profile fetch failed");
        }
      } catch (error) {
        debugError("Error fetching profile:", error);
        if (error.response?.status === 401) {
          toast.error("Session expired. Please login again.");
          setTimeout(() => {
            navigate("/food/delivery/login", { replace: true });
          }, 2000);
        } else {
          toast.error(
            error?.response?.data?.message || "Failed to load profile data",
          );
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const isAdminApproved =
    ["approved", "active"].includes(
      String(profile?.status || "").toLowerCase(),
    ) || getAuthorizedServicesFromUser(profile).length > 0;

  const startEditResubmit = async (enrollment) => {
    if (resubmitting) return;
    setResubmitting(enrollment?.module || "all");
    try {
      await beginModuleEditResubmit({
        enrollment,
        phone: profile?.phone,
        navigate,
      });
    } finally {
      setResubmitting("");
    }
  };

  const getDocumentVerificationLabel = (doc) => {
    if (!doc?.document) return "Not uploaded";
    if (doc?.verified || isAdminApproved) return "Verified";
    return "Pending Verification";
  };

  const getDocumentNumber = (doc) => {
    return String(
      doc?.number || doc?.idNumber || doc?.documentNumber || "",
    ).trim();
  };

  const getDrivingLicenseNumber = () =>
    String(
      profile?.documents?.drivingLicense?.number ||
        profile?.documents?.drivingLicense?.idNumber ||
        profile?.documents?.drivingLicense?.documentNumber ||
        profile?.drivingLicenseNumber ||
        profile?.documents?.drivingLicenseNumber ||
        "",
    ).trim();

  const parseNumericValue = (...values) => {
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
    }
    return null;
  };

  const ratingValue = parseNumericValue(
    profile?.metrics?.rating,
    profile?.ratings?.average,
    profile?.averageRating,
    profile?.rating,
    profile?.stats?.averageRating,
    profile?.analytics?.averageRating,
  );

  const ratingCount = Number(
    profile?.metrics?.ratingCount ||
      profile?.ratings?.count ||
      profile?.totalRatings ||
      profile?.reviewCount ||
      profile?.reviewsCount ||
      profile?.stats?.totalRatings ||
      profile?.analytics?.totalRatings ||
      0,
  );

  const ratingDisplay = ratingValue
    ? `${ratingValue.toFixed(1)}${ratingCount > 0 ? ` (${ratingCount})` : ""}`
    : "-";

  const getRiderLevel = () => {
    if (!Number.isFinite(ratingValue) || ratingValue <= 0 || ratingCount <= 0)
      return "New Rider";
    if (ratingValue >= 4.8 && ratingCount >= 100) return "Champion";
    if (ratingValue >= 4.6 && ratingCount >= 50) return "Elite";
    if (ratingValue >= 4.3 && ratingCount >= 20) return "Pro";
    if (ratingValue >= 4.0 && ratingCount >= 10) return "Rising";
    return "Starter";
  };
  const riderLevel = getRiderLevel();

  const profileImageUrl =
    profile?.profileImage?.url || profile?.documents?.photo || null;

  const refreshProfile = async () => {
    const response = await deliveryAPI.getProfile();
    if (response?.data?.success && response?.data?.data?.profile) {
      setProfile(response.data.data.profile);
      const pd = response.data.data.profile;
      setBankDetails({
        accountHolderName: pd?.documents?.bankDetails?.accountHolderName || "",
        accountNumber: pd?.documents?.bankDetails?.accountNumber || "",
        ifscCode: pd?.documents?.bankDetails?.ifscCode || "",
        bankName: pd?.documents?.bankDetails?.bankName || "",
        panNumber: pd?.documents?.pan?.number || "",
        upiId: pd?.documents?.bankDetails?.upiId || "",
        upiQrCode: pd?.documents?.bankDetails?.upiQrCode || null,
      });
    }
  };

  const handleTakeCameraPhoto = (target) => {
    if (isFlutterBridgeAvailable()) {
      openCamera({
        onSelectFile: (file) => {
          if (target === "profilePhoto") {
            setUploadTarget("profilePhoto");
            uploadProfileFile(file);
            return;
          }

          if (target === "upiQrCode") {
            uploadUpiQrFile(file);
          }
        },
        fileNamePrefix: `profile-${target}`,
      });
      return;
    }

    if (target === "profilePhoto") {
      profileCameraInputRef.current?.click();
      return;
    }

    if (target === "upiQrCode") {
      upiQrCameraInputRef.current?.click();
    }
  };

  const handlePickFromGallery = (target, ref) => {
    setUploadTarget(target);
    ref.current?.click();
  };

  const uploadProfileFile = async (file) => {
    try {
      setIsUploadingImage(true);
      const formData = new FormData();
      formData.append("profilePhoto", file);
      const response = await deliveryAPI.updateProfileMultipart(formData);
      if (response?.data?.success) {
        toast.success("Profile photo updated");
        await refreshProfile();
      } else {
        toast.error(response?.data?.message || "Update failed");
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Update failed");
    } finally {
      setIsUploadingImage(false);
      setUploadTarget(null);
    }
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    if (uploadTarget === "profilePhoto") {
      uploadProfileFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProfileCameraSelected = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadTarget("profilePhoto");
      await uploadProfileFile(file);
    }
    if (profileCameraInputRef.current) profileCameraInputRef.current.value = "";
  };

  const handleDeletePhoto = async () => {
    try {
      setIsDeletingImage(true);
      const response = await deliveryAPI.updateProfileDetails({
        profilePhoto: "",
      });
      // Backend might return different structures; check for success
      if (response?.status === 200) {
        toast.success("Profile photo removed");
        await refreshProfile();
        setShowDeletePopup(false);
      } else {
        toast.error("Failed to remove photo");
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Delete failed");
    } finally {
      setIsDeletingImage(false);
    }
  };

  const handleUpiQrSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadUpiQrFile(file);
    if (upiQrInputRef.current) upiQrInputRef.current.value = "";
  };

  const handleUpiQrCameraSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadUpiQrFile(file);
    if (upiQrCameraInputRef.current) upiQrCameraInputRef.current.value = "";
  };

  const uploadUpiQrFile = (file) => {
    if (!file) return;

    if (!String(file.type || "").startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setUpiQrFile(file);
    setUpiQrPreview(URL.createObjectURL(file));
    toast.success("UPI QR selected");
  };

  const submitBankDetails = async () => {
    setIsUpdatingBankDetails(true);
    try {
      // Validation
      const { accountNumber, ifscCode, panNumber, upiId } = bankDetails;

      if (accountNumber && !/^\d{9,18}$/.test(accountNumber.trim())) {
        return toast.error("Invalid Account Number (9-18 digits)");
      }

      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (ifscCode && !ifscRegex.test(ifscCode.trim().toUpperCase())) {
        return toast.error("Invalid IFSC Code (e.g. SBIN0001234)");
      }

      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (panNumber && !panRegex.test(panNumber.trim().toUpperCase())) {
        return toast.error("Invalid PAN Card format (e.g. ABCDE1234F)");
      }

      const upiRegex = /^[\w\.-]+@[\w\.-]+$/;
      if (upiId && !upiRegex.test(upiId.trim())) {
        return toast.error("Invalid UPI ID (e.g. user@bank)");
      }

      // Send as FormData to support optional QR upload
      const formData = new FormData();
      formData.append(
        "documents[bankDetails][accountHolderName]",
        (bankDetails.accountHolderName || "").trim(),
      );
      formData.append(
        "documents[bankDetails][accountNumber]",
        (bankDetails.accountNumber || "").trim(),
      );
      formData.append(
        "documents[bankDetails][ifscCode]",
        (bankDetails.ifscCode || "").trim().toUpperCase(),
      );
      formData.append(
        "documents[bankDetails][bankName]",
        (bankDetails.bankName || "").trim(),
      );
      formData.append(
        "documents[bankDetails][upiId]",
        (bankDetails.upiId || "").trim(),
      );
      formData.append(
        "documents[pan][number]",
        (bankDetails.panNumber || "").trim().toUpperCase(),
      );

      if (upiQrFile) {
        formData.append("upiQrCode", upiQrFile);
      } else if (bankDetails.upiQrCode === null) {
        // Explicitly tell backend to remove the existing QR code
        formData.append("removeUpiQrCode", "true");
      }

      await deliveryAPI.updateBankDetailsMultipart(formData);
      toast.success("Bank details updated");
      setShowBankDetailsPopup(false);
      setUpiQrFile(null);
      setUpiQrPreview(null);
      await refreshProfile();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Update failed");
    } finally {
      setIsUpdatingBankDetails(false);
    }
  };

  const authorizedModules = getAuthorizedServicesFromUser(profile);
  const verificationTone =
    authorizedModules.length > 0 || isAdminApproved
      ? "approved"
      : String(profile?.status || "").toLowerCase() === "rejected"
        ? "rejected"
        : "pending";
  const verificationLabel =
    authorizedModules.length > 0
      ? `Verified · ${authorizedModules.map(getModuleDisplayName).join(", ")}`
      : String(profile?.status || "Pending").replace(/_/g, " ");

  const documentItems = [
    {
      label: "Aadhar Card",
      doc: profile?.documents?.aadhar,
      number: getDocumentNumber(profile?.documents?.aadhar),
      statusLabel: getDocumentVerificationLabel(profile?.documents?.aadhar),
    },
    {
      label: "PAN Card",
      doc: profile?.documents?.pan,
      number: getDocumentNumber(profile?.documents?.pan),
      statusLabel: getDocumentVerificationLabel(profile?.documents?.pan),
    },
    {
      label: "Driving License",
      doc: profile?.documents?.drivingLicense,
      number:
        getDrivingLicenseNumber() ||
        getDocumentNumber(profile?.documents?.drivingLicense),
      statusLabel: getDocumentVerificationLabel(
        profile?.documents?.drivingLicense,
      ),
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-primary-orange" />
          <span className="text-sm font-medium">Loading profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200 px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-slate-700" />
          </button>
          <h1 className="text-sm font-bold text-slate-900 truncate">
            Profile details
          </h1>
        </div>
        <span className="shrink-0 rounded-full bg-slate-900 text-white px-2.5 py-1 text-[10px] font-bold">
          {profile?.deliveryId || "…"}
        </span>
      </div>

      <div className="px-3 pt-3 space-y-2.5 max-w-lg mx-auto">
        <ProfileCompactHeader
          name={profile?.name}
          driverId={profile?.deliveryId}
          city={profile?.location?.city || profile?.city}
          phone={profile?.phone}
          photoUrl={profileImageUrl}
          isOnline={isOnline}
          verificationLabel={verificationLabel}
          verificationTone={verificationTone}
          uploading={isUploadingImage}
          onCamera={() => handleTakeCameraPhoto("profilePhoto")}
          onGallery={() =>
            handlePickFromGallery("profilePhoto", fileInputRef)
          }
          onRemovePhoto={
            profileImageUrl ? () => setShowDeletePopup(true) : undefined
          }
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
              Level
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">
              {riderLevel}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
              Rating
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">
              {ratingDisplay}
            </p>
          </div>
        </div>

        {moduleEnrollments.length > 0 ? (
          <ProfileSection title="Service status" icon={Shield} defaultOpen>
            <ProfileServiceChips
              enrollments={moduleEnrollments}
              resubmitting={resubmitting}
              onResubmit={startEditResubmit}
            />
          </ProfileSection>
        ) : null}

        <ProfileSection title="Personal information" icon={User} defaultOpen>
          <ProfileInfoRow label="Full name" value={profile?.name} icon={User} />
          <ProfileInfoRow
            label="Date of birth"
            value={
              profile?.dateOfBirth
                ? new Date(profile.dateOfBirth).toLocaleDateString()
                : null
            }
          />
          <ProfileInfoRow
            label="City"
            value={profile?.location?.city || profile?.city}
            icon={MapPin}
          />
          <ProfileInfoRow
            label="Address"
            value={
              profile?.location?.addressLine1 ||
              profile?.address ||
              [profile?.location?.city, profile?.location?.state]
                .filter(Boolean)
                .join(", ")
            }
            icon={MapPin}
          />
        </ProfileSection>

        <ProfileSection title="Contact information" icon={Smartphone} defaultOpen>
          <ProfileInfoRow
            label="Phone"
            value={profile?.phone}
            icon={Smartphone}
          />
          <ProfileInfoRow label="Email" value={profile?.email} />
          <ProfileInfoRow
            label="Emergency contact"
            value={
              profile?.emergencyContact?.name || profile?.emergencyContactName
                ? `${profile?.emergencyContact?.name || profile?.emergencyContactName}${
                    profile?.emergencyContact?.phone ||
                    profile?.emergencyContactPhone
                      ? ` · ${
                          profile?.emergencyContact?.phone ||
                          profile?.emergencyContactPhone
                        }`
                      : ""
                  }`
                : null
            }
          />
        </ProfileSection>

        <ProfileSection
          title="Vehicle information"
          icon={Truck}
          defaultOpen
          action={
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setVehicleInput({
                  number: vehicleNumber,
                  brand: vehicleBrand,
                  type: vehicleType,
                });
                setShowVehiclePopup(true);
              }}
              className="text-[10px] font-bold uppercase tracking-wide text-primary-orange"
            >
              Edit
            </button>
          }
        >
          <ProfileInfoRow
            label="Vehicle"
            value={
              [
                profile?.vehicle?.type || vehicleType,
                profile?.vehicle?.brand || vehicleBrand,
                vehicleNumber,
              ]
                .filter(Boolean)
                .map((v) => String(v).toUpperCase())
                .join(" · ") || "Not added"
            }
            icon={Truck}
            action={
              !vehicleNumber ? (
                <span className="text-[9px] font-bold uppercase text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                  Missing
                </span>
              ) : null
            }
          />
        </ProfileSection>

        <ProfileSection
          title="Bank details"
          icon={Banknote}
          defaultOpen={false}
          action={
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setBankDetails({
                  accountHolderName:
                    profile?.documents?.bankDetails?.accountHolderName || "",
                  accountNumber:
                    profile?.documents?.bankDetails?.accountNumber || "",
                  ifscCode: profile?.documents?.bankDetails?.ifscCode || "",
                  bankName: profile?.documents?.bankDetails?.bankName || "",
                  panNumber: profile?.documents?.pan?.number || "",
                  upiId: profile?.documents?.bankDetails?.upiId || "",
                  upiQrCode:
                    profile?.documents?.bankDetails?.upiQrCode || null,
                });
                setUpiQrFile(null);
                setUpiQrPreview(null);
                setShowBankDetailsPopup(true);
              }}
              className="text-[10px] font-bold uppercase tracking-wide text-primary-orange"
            >
              Edit
            </button>
          }
        >
          <ProfileInfoRow
            label="Bank"
            value={bankDetails.bankName}
            icon={Banknote}
          />
          <ProfileInfoRow
            label="Account"
            value={
              bankDetails.accountNumber
                ? `•••• ${String(bankDetails.accountNumber).slice(-4)}`
                : null
            }
          />
          <ProfileInfoRow label="IFSC" value={bankDetails.ifscCode} />
          <ProfileInfoRow
            label="Holder"
            value={bankDetails.accountHolderName}
          />
          <ProfileInfoRow
            label="UPI"
            value={bankDetails.upiId}
            icon={Smartphone}
          />
          {bankDetails.upiQrCode ? (
            <button
              type="button"
              onClick={() => {
                setSelectedDocument({
                  name: "UPI Scanner",
                  url: bankDetails.upiQrCode,
                });
                setShowDocumentModal(true);
              }}
              className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600"
            >
              <QrCode className="w-3.5 h-3.5" /> View UPI QR
            </button>
          ) : null}
        </ProfileSection>

        <ProfileSection
          title="Documents"
          icon={Shield}
          defaultOpen
          action={
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                navigate("/food/delivery/profile/documents");
              }}
              className="text-[10px] font-bold uppercase tracking-wide text-primary-orange"
            >
              View all
            </button>
          }
        >
          <ProfileDocGrid
            items={documentItems}
            onPreview={(item) => {
              setSelectedDocument({
                name: item.label,
                url: item.doc?.document || item.url,
              });
              setShowDocumentModal(true);
            }}
          />
        </ProfileSection>

        <ProfileSection
          title="Account information"
          icon={Info}
          defaultOpen={false}
        >
          <ProfileInfoRow label="Partner ID" value={profile?.deliveryId} />
          <ProfileInfoRow label="Account status" value={profile?.status} />
          <ProfileInfoRow
            label="Wallet"
            value={
              walletBalance != null
                ? `₹${Number(walletBalance).toFixed(2)}`
                : null
            }
            icon={Banknote}
          />
        </ProfileSection>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
        style={{ display: "none" }}
      />
      <input
        ref={profileCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleProfileCameraSelected}
        style={{ display: "none" }}
      />

      {/* ─── MODALS ─── */}

      {/* Delete Confirmation Popup */}
      <BottomPopup
        isOpen={showDeletePopup}
        onClose={() => setShowDeletePopup(false)}
        title="Remove Photo?"
        showCloseButton={false}
      >
        <div className="pb-10 pt-4 text-center">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-xl font-black text-gray-950 mb-2 uppercase tracking-tight">
            Are you sure?
          </h3>
          <p className="text-sm font-medium text-gray-500 mb-8 max-w-[200px] mx-auto">
            This will remove your current profile picture.
          </p>

          <div className="grid grid-cols-2 gap-3 px-2">
            <button
              onClick={() => setShowDeletePopup(false)}
              className="bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={handleDeletePhoto}
              disabled={isDeletingImage}
              className="bg-red-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-orange-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              {isDeletingImage ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Yes, Remove"
              )}
            </button>
          </div>
        </div>
      </BottomPopup>

      {/* Vehicle Popup */}
      <BottomPopup
        isOpen={showVehiclePopup}
        onClose={() => setShowVehiclePopup(false)}
        title="Vehicle Info"
        closeOnHandleClick={true}
        showCloseButton={false}
      >
        <div className="space-y-4 pb-10">
          <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex flex-col gap-4">
            {/* Type Selection */}
            <div className="flex items-center gap-4 w-full">
              <div className="w-8 h-8 flex items-center justify-center">
                {(() => {
                  const t = String(vehicleInput.type || "").toLowerCase();
                  if (t.includes("car"))
                    return <Car className="w-5 h-5 text-red-500" />;
                  if (t.includes("bicycle"))
                    return <Bike className="w-5 h-5 text-red-500" />;
                  return <Truck className="w-5 h-5 text-red-500" />;
                })()}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                  Vehicle Type
                </p>
                <select
                  value={vehicleInput.type}
                  onChange={(e) =>
                    setVehicleInput({ ...vehicleInput, type: e.target.value })
                  }
                  className="w-full bg-transparent text-lg font-black text-black outline-none border-b-2 border-transparent focus:border-red-500 cursor-pointer"
                >
                  <option value="bike">Bike</option>
                  <option value="scooter">Scooter</option>
                  <option value="bicycle">Bicycle</option>
                  <option value="electric_bike">Electric Bike</option>
                  <option value="car">Car</option>
                </select>
              </div>
            </div>

            <div className="h-px bg-gray-200 w-full" />

            {/* Name/Brand Input */}
            <div className="flex items-center gap-4 w-full">
              <div className="w-8 h-8 flex items-center justify-center">
                <Plus className="w-4 h-4 text-red-500/50" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                  Vehicle Name/Brand
                </p>
                <input
                  type="text"
                  value={vehicleInput.brand}
                  onChange={(e) =>
                    setVehicleInput({ ...vehicleInput, brand: e.target.value })
                  }
                  placeholder="E.g. Honda Splendor"
                  className="w-full bg-transparent text-lg font-black text-black outline-none border-b-2 border-transparent focus:border-red-500 placeholder:text-gray-200"
                />
              </div>
            </div>

            <div className="h-px bg-gray-200 w-full" />

            {/* Number Input */}
            <div className="flex items-center gap-4 w-full">
              <div className="w-8 h-8 flex items-center justify-center">
                <QrCode className="w-4 h-4 text-red-500/50" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                  Vehicle Number
                </p>
                <input
                  type="text"
                  value={vehicleInput.number}
                  onChange={(e) =>
                    setVehicleInput({
                      ...vehicleInput,
                      number: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="E.g. UP 80 AB 1234"
                  className="w-full bg-transparent text-lg font-black text-black outline-none border-b-2 border-transparent focus:border-red-500 placeholder:text-gray-200"
                />
              </div>
            </div>
          </div>

          <button
            onClick={async () => {
              const num = vehicleInput.number.trim();
              const brand = vehicleInput.brand.trim();
              const type = vehicleInput.type;
              const isBicycle = type === "bicycle";

              if (!isBicycle && !num)
                return toast.error("Vehicle number is required");
              if (!brand) return toast.error("Vehicle brand is required");

              if (!isBicycle && num) {
                // Improved validation for Indian vehicle numbers
                // Accept common formats like MH12AB1234 or MH12A1234
                const numRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,2}[0-9]{4}$/i;
                if (!numRegex.test(num.replace(/\s+/g, ""))) {
                  return toast.error(
                    "Please enter a valid vehicle number (e.g. MH12AB1234)",
                  );
                }
              }

              try {
                await deliveryAPI.updateProfileDetails({
                  vehicle: {
                    number: num,
                    brand: brand,
                    type: type,
                  },
                });
                setVehicleNumber(num);
                setVehicleBrand(brand);
                setVehicleType(type);
                setShowVehiclePopup(false);
                toast.success("Flight details updated!");
                await refreshProfile();
              } catch (e) {
                toast.error("Cloud storage sync failed");
              }
            }}
            className="w-full bg-black text-white py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-gray-900 transition-all active:scale-95"
          >
            Save Changes
          </button>
        </div>
      </BottomPopup>

      {/* Bank Details Modal (Expanded with UPI) */}
      <BottomPopup
        isOpen={showBankDetailsPopup}
        onClose={() => setShowBankDetailsPopup(false)}
        title="Bank & Payments"
        maxHeight="85vh"
        closeOnHandleClick={true}
        showCloseButton={false}
      >
        <div className="space-y-5 pb-10">
          <div className="grid gap-4">
            {[
              {
                label: "Account Holder",
                key: "accountHolderName",
                icon: User,
                maxLength: 60,
              },
              {
                label: "Account Number",
                key: "accountNumber",
                icon: Banknote,
                maxLength: 18,
                isNumeric: true,
              },
              {
                label: "IFSC Code",
                key: "ifscCode",
                icon: Shield,
                format: (v) => v.toUpperCase(),
                maxLength: 11,
              },
              {
                label: "Bank Name",
                key: "bankName",
                icon: MapPin,
                maxLength: 60,
              },
              {
                label: "PAN Number",
                key: "panNumber",
                icon: FileText,
                format: (v) => v.toUpperCase(),
                maxLength: 10,
              },
              {
                label: "UPI ID",
                key: "upiId",
                icon: Smartphone,
                maxLength: 60,
              },
            ].map((field) => (
              <div
                key={field.key}
                className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 group focus-within:border-red-500/50 transition-all"
              >
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                  <field.icon className="w-3.5 h-3.5" /> {field.label}
                </label>
                <input
                  type="text"
                  value={bankDetails[field.key]}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (field.isNumeric) val = val.replace(/\D/g, "");
                    if (field.maxLength && val.length > field.maxLength) return;
                    if (field.format) val = field.format(val);
                    setBankDetails({ ...bankDetails, [field.key]: val });
                  }}
                  className="w-full bg-transparent text-sm font-bold text-gray-950 outline-none"
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                />
              </div>
            ))}

            {/* UPI Scanner Upload */}
            <div className="bg-purple-50 p-6 rounded-3xl border border-purple-100 flex flex-col items-center gap-4 text-center">
              <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest">
                UPI Payment QR Scanner
              </p>

              {upiQrPreview || bankDetails.upiQrCode ? (
                <div className="relative">
                  <img
                    src={upiQrPreview || bankDetails.upiQrCode}
                    alt="QR Preview"
                    className="w-32 h-32 rounded-xl object-cover border-4 border-white shadow-xl"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setUpiQrFile(null);
                      setUpiQrPreview(null);
                      setBankDetails((prev) => ({ ...prev, upiQrCode: null }));
                    }}
                    className="absolute -top-3 -right-3 bg-red-500 text-white p-1.5 rounded-full shadow-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-full flex gap-3">
                  <div
                    onClick={() => handleTakeCameraPhoto("upiQrCode")}
                    className="flex-1 aspect-square rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-gray-100 transition-all"
                  >
                    <Camera className="w-6 h-6 text-purple-300" />
                    <span className="text-[8px] font-black text-purple-400 uppercase">
                      Camera
                    </span>
                  </div>
                  <div
                    onClick={() =>
                      handlePickFromGallery("upiQrCode", upiQrInputRef)
                    }
                    className="flex-1 aspect-square rounded-3xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-gray-100 transition-all"
                  >
                    <ImageIcon className="w-6 h-6 text-purple-300" />
                    <span className="text-[8px] font-black text-purple-400 uppercase">
                      Gallery
                    </span>
                  </div>
                </div>
              )}
              <input
                ref={upiQrInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpiQrSelected}
              />
              <input
                ref={upiQrCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleUpiQrCameraSelected}
              />
              <p className="text-[9px] text-purple-400 font-medium">
                Upload your UPI QR code from Google Pay, PhonePe, etc. to
                receive easy payouts.
              </p>
            </div>
          </div>

          <button
            onClick={submitBankDetails}
            disabled={isUpdatingBankDetails}
            className="w-full bg-black text-white py-5 rounded-[1.5rem] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-gray-900 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isUpdatingBankDetails ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> saving...
              </>
            ) : (
              "Update Systems"
            )}
          </button>
        </div>
      </BottomPopup>

      {/* Document Viewer Popup */}
      <BottomPopup
        isOpen={showDocumentModal}
        onClose={() => setShowDocumentModal(false)}
        title={selectedDocument?.name || "Document"}
        maxHeight="95vh"
        showCloseButton={false}
        closeOnHandleClick={true}
      >
        <div className="flex items-center justify-center py-4">
          <img
            src={selectedDocument?.url}
            alt="Document"
            className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-lg"
          />
        </div>
      </BottomPopup>
    </div>
  );
};

export default ProfileDetailsV2;
