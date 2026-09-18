import React, { useState, useEffect } from "react"
import { AlertCircle, RotateCcw, Search, Trash2, ShieldAlert } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

export default function DeletedAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [actionLoading, setActionLoading] = useState(null) // ID of account currently being reactivated

  useEffect(() => {
    fetchDeletedAccounts()
  }, [])

  const fetchDeletedAccounts = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getDeletedAccounts()
      if (response?.data?.success && response?.data?.data) {
        setAccounts(response.data.data)
      }
    } catch (error) {
      toast.error("Failed to fetch deleted accounts")
    } finally {
      setLoading(false)
    }
  }

  const handleReactivate = async (account) => {
    const confirmMsg = `Are you sure you want to reactivate the ${account.role} account for "${account.name}"?`
    if (!window.confirm(confirmMsg)) return

    try {
      setActionLoading(account.id)
      const response = await adminAPI.reactivateAccount(account.id, account.role)
      if (response?.data?.success) {
        toast.success(`${account.role} account reactivated successfully`)
        fetchDeletedAccounts()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reactivate account")
    } finally {
      setActionLoading(null)
    }
  }

  // Filter accounts based on search query and role filter
  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = 
      acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.detail.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesRole = roleFilter === "all" || acc.role === roleFilter

    return matchesSearch && matchesRole
  })

  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case "User":
        return "bg-blue-50 text-blue-700 border-blue-100"
      case "Seller":
        return "bg-amber-50 text-amber-700 border-amber-100"
      case "Restaurant":
        return "bg-emerald-50 text-emerald-700 border-emerald-100"
      case "Delivery Boy":
        return "bg-purple-50 text-purple-700 border-purple-100"
      default:
        return "bg-slate-50 text-slate-700 border-slate-100"
    }
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-neutral-200 overflow-x-hidden w-full" style={{ maxWidth: '100vw', boxSizing: 'border-box' }}>
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full overflow-hidden" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
        {/* Page Title */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#334257] mb-2">Deleted Accounts Management</h1>
            <p className="text-sm text-[#8a94aa]">Review soft-deleted profiles and reactivate them</p>
          </div>
          <button
            onClick={fetchDeletedAccounts}
            className="px-4 py-2 bg-white border border-[#e3e6ef] text-[#334257] text-sm font-medium rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
          >
            <RotateCcw size={16} /> Refresh List
          </button>
        </div>

        {/* Warning Information */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-red-600 mt-0.5">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-red-800 mb-1">Administrative Restorations</h4>
            <p className="text-xs sm:text-sm text-red-700">
              Below is the consolidated history of deleted profiles from the system. Reactivating a profile will restore their access permission immediately, re-register their login credentials, and preserve all past transactions, ledger items, and order listings.
            </p>
          </div>
        </div>

        {/* Controls & Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-4 mb-6 flex flex-col md:flex-row gap-4">
          {/* Search Box */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Search size={18} />
            </span>
            <input
              type="text"
              placeholder="Search by name, phone, email, details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 h-10 bg-white border border-[#e3e6ef] rounded-md text-sm text-[#4a5671] focus:outline-none focus:ring-1 focus:ring-[#006fbd]"
            />
          </div>

          {/* Role Filter */}
          <div className="flex flex-wrap gap-2">
            {["all", "User", "Seller", "Restaurant", "Delivery Boy"].map((roleOption) => (
              <button
                key={roleOption}
                onClick={() => setRoleFilter(roleOption)}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  roleFilter === roleOption
                    ? "bg-[#006fbd] text-white border border-[#006fbd]"
                    : "bg-white text-[#4a5671] border border-[#e3e6ef] hover:bg-gray-50"
                }`}
              >
                {roleOption === "all" ? "All Roles" : roleOption}
              </button>
            ))}
          </div>
        </div>

        {/* Accounts Table Card */}
        <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006fbd]"></div>
              <span className="text-sm text-[#8a94aa]">Fetching records...</span>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 text-gray-400 border border-gray-100">
                <Trash2 size={24} />
              </div>
              <h3 className="text-base font-semibold text-[#334257] mb-1">No Deleted Accounts Found</h3>
              <p className="text-sm text-[#8a94aa] max-w-md">
                {searchQuery || roleFilter !== "all" 
                  ? "No accounts match your current query or selected role filters." 
                  : "All accounts in the ecosystem are active. No deleted history registered."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-[#e3e6ef]">
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase">Profile</th>
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase">Role Type</th>
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase">Contact details</th>
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase">Details / Metadata</th>
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase">Deletion Date</th>
                    <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-[#8a94aa] uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e6ef]">
                  {filteredAccounts.map((account) => (
                    <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                      {/* Profile info */}
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                            {account.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#334257]">{account.name}</p>
                            <p className="text-xs text-[#8a94aa] mt-0.5">ID: {account.id.slice(-8)}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role type */}
                      <td className="px-4 sm:px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium inline-block ${getRoleBadgeStyle(account.role)}`}>
                          {account.role}
                        </span>
                      </td>

                      {/* Contact */}
                      <td className="px-4 sm:px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-[#334257]">{account.phone}</p>
                          <p className="text-xs text-[#8a94aa]">{account.email}</p>
                        </div>
                      </td>

                      {/* Details */}
                      <td className="px-4 sm:px-6 py-4">
                        <span className="text-xs text-[#334257] bg-gray-100 px-2 py-1 rounded">
                          {account.detail}
                        </span>
                      </td>

                      {/* Deletion date */}
                      <td className="px-4 sm:px-6 py-4">
                        <span className="text-sm text-[#4a5671]">
                          {new Date(account.deletedAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <button
                          onClick={() => handleReactivate(account)}
                          disabled={actionLoading === account.id}
                          className="px-3 py-1.5 bg-[#006fbd] hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          <RotateCcw size={14} className={actionLoading === account.id ? "animate-spin" : ""} />
                          {actionLoading === account.id ? "Activating..." : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
