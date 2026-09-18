import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Bike,
  Ticket,
  LogOut,
  Loader2,
  Trash2,
  AlertTriangle,
  Truck,
  ChevronRight,
  Share2,
  User,
  FileText,
} from "lucide-react"
import { deliveryAPI } from "@food/api"
import { toast } from "sonner"
import { clearModuleAuth } from "@food/utils/auth"
import VehicleSwitcherSheet from "@/modules/DeliveryV2/components/modals/VehicleSwitcherSheet"
import { useDeliveryStore } from "@/modules/DeliveryV2/store/useDeliveryStore"
import {
  ProfileCompactHeader,
  ProfileServiceChips,
} from "@/modules/DeliveryV2/components/profile"
import {
  getAuthorizedServicesFromUser,
  getModuleDisplayName,
  flattenDriverEnrollments,
  beginModuleEditResubmit,
} from "@/modules/DeliveryV2/utils/driverModuleAccess"

/**
 * Compact profile hub — mobile-first account & settings entry.
 */
export const ProfileV2 = () => {
  const navigate = useNavigate()
  const isOnline = useDeliveryStore((s) => s.isOnline)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [referralReward, setReferralReward] = useState(0)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [logoutSubmitting, setLogoutSubmitting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showVehicleSwitcher, setShowVehicleSwitcher] = useState(false)
  const [resubmitting, setResubmitting] = useState("")

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfile(response.data.data.profile)
        }
      } catch {
        toast.error("Failed to load profile data")
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  useEffect(() => {
    deliveryAPI
      .getReferralStats()
      .then((res) => {
        const reward = res?.data?.data?.stats?.rewardAmount
        setReferralReward(Number(reward) || 0)
      })
      .catch(() => {})
  }, [])

  const enrollments = useMemo(
    () => flattenDriverEnrollments(profile),
    [profile],
  )

  useEffect(() => {
    if (!enrollments.length) return
    useDeliveryStore.getState().setModuleEnrollments(enrollments)
  }, [enrollments])

  const handleResubmit = async (enrollment) => {
    if (resubmitting) return
    setResubmitting(enrollment.module || "all")
    try {
      await beginModuleEditResubmit({
        enrollment,
        phone: profile?.phone,
        navigate,
      })
    } finally {
      setResubmitting("")
    }
  }

  const authorized = getAuthorizedServicesFromUser(profile)
  const verificationTone =
    authorized.length > 0 ||
    ["approved", "active"].includes(String(profile?.status || "").toLowerCase())
      ? "approved"
      : String(profile?.status || "").toLowerCase() === "rejected"
        ? "rejected"
        : "pending"
  const verificationLabel =
    authorized.length > 0
      ? `Verified · ${authorized.map(getModuleDisplayName).join(", ")}`
      : profile?.status
        ? String(profile.status).replace(/_/g, " ")
        : "Pending"

  const refId = profile?._id || profile?.id || profile?.referralCode || ""
  const referralLink = refId
    ? `${window.location.origin}/food/delivery/signup?ref=${encodeURIComponent(String(refId))}`
    : ""

  const handleShareReferral = async () => {
    if (!referralLink) return
    const rewardText = referralReward > 0 ? `₹${referralReward}` : "rewards"
    const shareText = `Join as a delivery partner and earn ${rewardText}.`
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Delivery referral",
          text: shareText,
          url: referralLink,
        })
      } else {
        const fallbackUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`
        window.open(fallbackUrl, "_blank", "noopener,noreferrer")
      }
    } catch {
      /* ignore */
    }
  }

  const handleLogout = async () => {
    if (logoutSubmitting) return
    setShowLogoutConfirm(false)
    try {
      setLogoutSubmitting(true)
      await deliveryAPI.logout()
    } catch {
      /* ignore */
    }
    clearModuleAuth("delivery")
    localStorage.removeItem("app:isOnline")
    toast.success("Logged out successfully")
    navigate("/food/delivery/login", { replace: true })
    setLogoutSubmitting(false)
  }

  const handleDeleteAccount = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      await deliveryAPI.deleteAccount()
      clearModuleAuth("delivery")
      localStorage.removeItem("app:isOnline")
      toast.success("Account deleted successfully")
      navigate("/food/delivery/login", { replace: true })
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          "Failed to delete account. Please try again.",
      )
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-primary-orange" />
          <span className="text-sm font-medium">Loading profile…</span>
        </div>
      </div>
    )
  }

  const menuItemClass =
    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-200 active:bg-slate-50 text-left"

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 pb-6">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-3 py-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-primary-orange">
          <User className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-slate-900 leading-tight">My Profile</h1>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
            Account & settings
          </p>
        </div>
      </div>

      <div className="px-3 pt-3 space-y-3 max-w-lg mx-auto">
        <ProfileCompactHeader
          name={profile?.name}
          driverId={profile?.deliveryId}
          city={profile?.location?.city || profile?.city}
          phone={profile?.phone}
          photoUrl={profile?.profileImage?.url || profile?.profilePhoto}
          isOnline={isOnline}
          verificationLabel={verificationLabel}
          verificationTone={verificationTone}
          onClick={() => navigate("/food/delivery/profile/details")}
        />

        {enrollments.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Service status
              </p>
              <button
                type="button"
                onClick={() => navigate("/food/delivery/verification", {
                  state: { phone: String(profile?.phone || "").replace(/\D/g, "").slice(-10) },
                })}
                className="text-[10px] font-bold text-primary-orange uppercase tracking-wide"
              >
                Manage
              </button>
            </div>
            <ProfileServiceChips
              enrollments={enrollments}
              resubmitting={resubmitting}
              onResubmit={handleResubmit}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => navigate("/food/delivery/history")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-2.5 active:bg-slate-50"
          >
            <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <Bike className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-900">Trips</span>
          </button>
          <button
            type="button"
            onClick={() => setShowVehicleSwitcher(true)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-2.5 active:bg-slate-50"
          >
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-900">Vehicles</span>
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => navigate("/food/delivery/profile/details")}
            className={menuItemClass + " border-0 rounded-none"}
          >
            <FileText className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="flex-1 text-sm font-semibold text-slate-900">
              Profile details
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/food/delivery/profile/documents")}
            className={menuItemClass + " border-0 rounded-none"}
          >
            <FileText className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="flex-1 text-sm font-semibold text-slate-900">
              Documents
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/food/delivery/help/tickets")}
            className={menuItemClass + " border-0 rounded-none"}
          >
            <Ticket className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="flex-1 text-sm font-semibold text-slate-900">
              Support tickets
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">
              Share & Earn{referralReward > 0 ? ` ₹${referralReward}` : ""}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Invite partners to join the fleet.
            </p>
          </div>
          <button
            type="button"
            onClick={handleShareReferral}
            className="shrink-0 h-9 px-3 rounded-lg bg-primary-orange text-white text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>
        </div>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-red-100 text-red-600 active:bg-red-50"
          >
            <LogOut className="w-4 h-4" />
            <span className="flex-1 text-sm font-semibold text-left">Log out</span>
            <ChevronRight className="w-4 h-4 text-red-200" />
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-red-100 text-red-600 active:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            <span className="flex-1 text-sm font-semibold text-left">
              Delete account
            </span>
            <ChevronRight className="w-4 h-4 text-red-200" />
          </button>
        </div>
      </div>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center px-4"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              Log out?
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              You will be signed out from your delivery account.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutSubmitting}
                className="flex-1 h-10 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {logoutSubmitting ? "Logging out…" : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center px-4"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-slate-900">
                Delete account?
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              This marks your partner account inactive. Transaction history stays
              archived.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="flex-1 h-10 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <VehicleSwitcherSheet
        isOpen={showVehicleSwitcher}
        onClose={() => setShowVehicleSwitcher(false)}
      />
    </div>
  )
}

export default ProfileV2
