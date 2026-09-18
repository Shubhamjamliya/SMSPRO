import { useEffect, useMemo, useState } from "react"
import { Share2, Users, Wallet, CircleCheck, Clock3, CircleX, Gift, Loader2 } from "lucide-react"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import { getCurrentUser } from "@food/utils/auth"

const statusMeta = {
  credited: { label: "Credited",         icon: CircleCheck, bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-400" },
  pending:  { label: "Pending Approval", icon: Clock3,       bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400" },
  rejected: { label: "Rejected",         icon: CircleX,      bg: "bg-red-50 dark:bg-red-900/20",     text: "text-red-700 dark:text-red-400" },
}

export default function RestaurantReferEarn() {
  const companyName = useCompanyName()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ referralCount: 0, totalReferralEarnings: 0, rewardAmount: 0, totalInvited: 0, creditedCount: 0, pendingCount: 0, rejectedCount: 0 })
  const [referredRestaurants, setReferredRestaurants] = useState([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        try {
          const profileRes = await restaurantAPI.getCurrentRestaurant()
          const profileData = profileRes?.data?.data?.restaurant || profileRes?.data?.restaurant
          if (profileData && !cancelled) setProfile(profileData)
        } catch {
          if (!cancelled) setProfile(getCurrentUser("restaurant"))
        }

        const res = await restaurantAPI.getReferralDetails()
        const nextStats = res?.data?.data?.stats || {}
        const nextReferred = res?.data?.data?.referredRestaurants || []
        if (!cancelled) {
          setStats({
            referralCount: Number(nextStats.referralCount) || 0,
            totalReferralEarnings: Number(nextStats.totalReferralEarnings) || 0,
            rewardAmount: Number(nextStats.rewardAmount) || 0,
            totalInvited: Number(nextStats.totalInvited) || 0,
            creditedCount: Number(nextStats.creditedCount) || 0,
            pendingCount: Number(nextStats.pendingCount) || 0,
            rejectedCount: Number(nextStats.rejectedCount) || 0,
          })
          setReferredRestaurants(Array.isArray(nextReferred) ? nextReferred : [])
        }
      } catch {
        if (!cancelled) toast.error("Failed to load referral details")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const refCode = profile?.referralCode || profile?._id || ""
  const referralLink = refCode
    ? `${window.location.origin}/food/restaurant/onboarding?ref=${encodeURIComponent(String(refCode))}`
    : ""

  const shareText = useMemo(() => {
    const reward = stats.rewardAmount > 0 ? `₹${stats.rewardAmount}` : "rewards"
    return `Join ${companyName} as a Restaurant Partner and earn ${reward} on approval! Use my referral link:`
  }, [companyName, stats.rewardAmount])

  const handleShare = async () => {
    if (!referralLink) { toast.error("Referral link unavailable"); return }
    try {
      if (navigator.share) {
        await navigator.share({ title: `${companyName} Restaurant Referral`, text: shareText, url: referralLink })
        return
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareText} ${referralLink}`)
        toast.success("Referral link copied")
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`, "_blank", "noopener,noreferrer")
    } catch (error) {
      if (error?.name !== "AbortError") toast.error("Unable to share right now")
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <h1 className="text-base font-bold text-gray-900 dark:text-white">Refer & Earn</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Invite restaurants and earn rewards</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Hero card */}
        <div className="bg-gradient-to-br from-[#FF6A00] to-[#e05e00] rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Gift className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-bold">Earn per successful referral</p>
              <p className="text-2xl font-black">₹{stats.rewardAmount}</p>
            </div>
          </div>
          <p className="text-sm text-orange-100 mb-4 leading-relaxed">
            Invite restaurants to join {companyName} and earn ₹{stats.rewardAmount} when they get approved!
          </p>
          <button
            onClick={handleShare}
            disabled={!referralLink}
            className="w-full h-11 bg-white text-[#FF6A00] font-bold text-sm rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <Share2 className="w-4 h-4" strokeWidth={2.5} />
            Share Referral Link
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Users,        label: "Invited",   value: stats.totalInvited },
            { icon: CircleCheck,  label: "Approved",  value: stats.creditedCount },
            { icon: Wallet,       label: "Earned",    value: `₹${stats.totalReferralEarnings}` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-3 text-center">
              <Icon className="w-4 h-4 text-[#FF6A00] mx-auto mb-1.5" strokeWidth={2} />
              <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Referred restaurants */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800/60">
            <p className="text-sm font-bold text-gray-900 dark:text-white">Referred Restaurants</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2">
              <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
            </div>
          ) : referredRestaurants.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">No referrals yet.</p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Share your link to start inviting!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
              {referredRestaurants.map((item) => {
                const meta = statusMeta[item?.status] || statusMeta.pending
                const StatusIcon = meta.icon
                const invitedDate = item?.invitedAt ? new Date(item.invitedAt) : null
                const dateText = invitedDate && !isNaN(invitedDate) ? invitedDate.toLocaleDateString("en-IN") : "—"
                return (
                  <div key={item?.id || item?.refereeId} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item?.name || "Restaurant"}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item?.phone || "Phone hidden"}</p>
                      <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">Joined {dateText}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${meta.bg} ${meta.text}`}>
                        <StatusIcon className="w-3 h-3" strokeWidth={2} />
                        {meta.label}
                      </span>
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mt-1.5">+₹{Number(item?.earnedAmount) || 0}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
