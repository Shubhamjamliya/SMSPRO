import { useState, useMemo, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { Search, Download, ChevronDown, Calendar, Eye, FileDown, FileSpreadsheet, FileText, X, Mail, Phone, MapPin, Package, IndianRupee, Calendar as CalendarIcon, User, CheckCircle, XCircle } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { exportCustomersToCSV, exportCustomersToExcel, exportCustomersToPDF } from "@food/components/admin/customers/customersExportUtils"
import { adminAPI } from "@food/api"
import useInfiniteList from "@food/hooks/useInfiniteList"
import AdminTable from "@/shared/components/admin/AdminTable"
import RefreshButton from "@/shared/components/ui/RefreshButton"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }


export default function Customers() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [userDetails, setUserDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showUserDetails, setShowUserDetails] = useState(false)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([])
  const [bulkCodLoading, setBulkCodLoading] = useState(false)
  const [codUpdatingId, setCodUpdatingId] = useState(null)

  // User Contacts state
  const [userContacts, setUserContacts] = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactsSearchQuery, setContactsSearchQuery] = useState("")

  const filteredUserContacts = useMemo(() => {
    if (!contactsSearchQuery.trim()) return userContacts
    const query = contactsSearchQuery.toLowerCase().trim()
    return userContacts.filter(c =>
      (c.contactName || "").toLowerCase().includes(query) ||
      (c.contactNumber || "").includes(query)
    )
  }, [userContacts, contactsSearchQuery])

  const [filters, setFilters] = useState({
    orderDate: "",
    joiningDate: "",
    status: "",
    sortBy: "",
    chooseFirst: "",
  })

  const [draftFilters, setDraftFilters] = useState({
    orderDate: "",
    joiningDate: "",
    status: "",
    sortBy: "",
    chooseFirst: "",
  })

  const customerQueryFilters = useMemo(() => ({
    ...(filters.orderDate && { orderDate: filters.orderDate }),
    ...(filters.status && { status: filters.status }),
    ...(filters.joiningDate && { joiningDate: filters.joiningDate }),
    ...(filters.sortBy && { sortBy: filters.sortBy }),
    ...(filters.chooseFirst && { chooseFirst: filters.chooseFirst }),
  }), [filters.orderDate, filters.status, filters.joiningDate, filters.sortBy, filters.chooseFirst])

  const {
    items: customers,
    setItems: setCustomers,
    total: totalCustomers,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    search: cachedSearchQuery,
    setSearch: setCachedSearchQuery,
    refresh: refreshCustomers,
  } = useInfiniteList(
    async (params, config) => {
      const response = await adminAPI.getCustomers(params, config)
      const data = response?.data?.data || response?.data
      const list = data?.customers || data?.users || []
      return {
        items: Array.isArray(list) ? list : [],
        total: data?.total || data?.pagination?.total || list.length || 0,
      }
    },
    {
      pageSize: 20,
      filters: customerQueryFilters,
      cacheKey: "admin-customers",
    },
  )

  useEffect(() => {
    setSearchQuery(cachedSearchQuery)
  }, [cachedSearchQuery])

  const filteredCustomers = useMemo(() => {
    let result = [...customers]

    // Sort by options (for local sorting if backend didn't handle it fully)
    if (filters.sortBy) {
      if (filters.sortBy === "name-asc") {
        result.sort((a, b) => a.name.localeCompare(b.name))
      } else if (filters.sortBy === "name-desc") {
        result.sort((a, b) => b.name.localeCompare(a.name))
      } else if (filters.sortBy === "orders-asc") {
        result.sort((a, b) => a.totalOrder - b.totalOrder)
      } else if (filters.sortBy === "orders-desc") {
        result.sort((a, b) => b.totalOrder - a.totalOrder)
      }
    }

    return result
  }, [customers, filters])

  const getCustomerId = (customer) => customer?._id || customer?.id || customer?.sl || null
  const selectedCustomersCount = selectedCustomerIds.length
  const allVisibleSelected =
    filteredCustomers.length > 0 &&
    filteredCustomers.every((customer) => selectedCustomerIds.includes(getCustomerId(customer)))

  const handleDraftFilterChange = (field, value) => {
    setDraftFilters(prev => ({ ...prev, [field]: value }))
  }

  const formatDateTime = (value) => {
    if (!value) return "-"
    try {
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return String(value)
      const day = String(d.getDate()).padStart(2, "0")
      const month = d.toLocaleString("en-GB", { month: "short" })
      const year = d.getFullYear()
      const time = d.toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      return `${day} ${month} ${year}, ${time}`
    } catch {
      return String(value)
    }
  }

  const [searchParams] = useSearchParams()
  const userIdFromUrl = searchParams.get("userId")

  useEffect(() => {
    if (userIdFromUrl && customers.length > 0) {
      const customer = customers.find(c => c.id === userIdFromUrl || c._id === userIdFromUrl)
      if (customer) {
        handleViewDetails(customer.id || customer.sl || customer._id)
      }
    }
  }, [userIdFromUrl, customers])

  const handleToggleStatus = async (customerId) => {
    try {
      // Find customer
      const customer = customers.find(c => (c._id || c.id) === customerId)
      if (!customer) return

      const newStatus = !customer.status

      // Optimistically update UI
      setCustomers(customers.map(c =>
        c.id === customerId ? { ...c, status: newStatus } : c
      ))

      // Call API to update user status
      await adminAPI.updateCustomerStatus(customerId, newStatus)
      toast.success(`User ${newStatus ? 'activated' : 'deactivated'} successfully`)
    } catch (error) {
      debugError('Error updating status:', error)
      toast.error('Failed to update status')
      // Revert optimistic update
      setCustomers(customers.map(c =>
        c.id === customerId ? { ...c, status: !c.status } : c
      ))
    }
  }

  const handleToggleCodAccess = async (customerId) => {
    try {
      const customer = customers.find((c) => getCustomerId(c) === customerId)
      if (!customer) return
      const nextCodAccess = !(customer.isCodAllowed !== false)
      setCodUpdatingId(customerId)

      setCustomers((prev) =>
        prev.map((c) =>
          getCustomerId(c) === customerId ? { ...c, isCodAllowed: nextCodAccess } : c
        )
      )

      await adminAPI.updateCustomerCodAccess(customerId, nextCodAccess)
      toast.success(`COD ${nextCodAccess ? "enabled" : "disabled"} for user`)
    } catch (error) {
      debugError("Error updating COD access:", error)
      toast.error("Failed to update COD access")
      setCustomers((prev) =>
        prev.map((c) =>
          getCustomerId(c) === customerId ? { ...c, isCodAllowed: !(c.isCodAllowed !== false) } : c
        )
      )
    } finally {
      setCodUpdatingId(null)
    }
  }

  const toggleCustomerSelection = (customerId) => {
    if (!customerId) return
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    )
  }

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleIds = filteredCustomers.map((customer) => getCustomerId(customer)).filter(Boolean)
      setSelectedCustomerIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
      return
    }
    const visibleIds = filteredCustomers.map((customer) => getCustomerId(customer)).filter(Boolean)
    setSelectedCustomerIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
  }

  const handleBulkCodAccess = async (isCodAllowed) => {
    if (!selectedCustomerIds.length) {
      toast.error("Please select at least one customer")
      return
    }
    try {
      setBulkCodLoading(true)
      await adminAPI.bulkUpdateCustomerCodAccess(selectedCustomerIds, isCodAllowed)
      setCustomers((prev) =>
        prev.map((customer) =>
          selectedCustomerIds.includes(getCustomerId(customer))
            ? { ...customer, isCodAllowed: isCodAllowed !== false }
            : customer
        )
      )
      toast.success(`COD ${isCodAllowed ? "enabled" : "disabled"} for selected users`)
      setSelectedCustomerIds([])
    } catch (error) {
      debugError("Error in bulk COD update:", error)
      toast.error("Failed to update selected users")
    } finally {
      setBulkCodLoading(false)
    }
  }

  const handleViewDetails = async (customerId) => {
    try {
      setLoadingDetails(true)
      setShowUserDetails(true)
      setSelectedCustomer(customerId)
      setUserContacts([])
      setContactsSearchQuery("")
      setLoadingContacts(true)

      const response = await adminAPI.getCustomerById(customerId)
      const data = response?.data?.data || response?.data

      if (data?.user) {
        setUserDetails(data.user)

        // Fetch contacts in parallel
        try {
          const contactsRes = await adminAPI.getCustomerContacts(customerId, { limit: 500 })
          const contactsData = contactsRes?.data?.data?.contacts || contactsRes?.data?.contacts || []
          setUserContacts(contactsData)
        } catch (contactsError) {
          debugError('Error fetching customer contacts:', contactsError)
          toast.error('Failed to load user contacts')
        } finally {
          setLoadingContacts(false)
        }
      } else {
        toast.error('Failed to load user details')
        setShowUserDetails(false)
      }
    } catch (error) {
      debugError('Error fetching user details:', error)
      toast.error('Failed to load user details')
      setShowUserDetails(false)
    } finally {
      setLoadingDetails(false)
    }
  }

  const handleExport = (format) => {
    if (filteredCustomers.length === 0) {
      toast.error("No customers to export")
      return
    }

    const filename = "customers"
    try {
      switch (format) {
        case "csv":
          exportCustomersToCSV(filteredCustomers, filename)
          toast.success("CSV export started")
          break
        case "excel":
          exportCustomersToExcel(filteredCustomers, filename)
          toast.success("Excel export started")
          break
        case "pdf":
          exportCustomersToPDF(filteredCustomers, filename)
          toast.success("PDF download started")
          break
        default:
          toast.error("Invalid export format")
          break
      }
    } catch (error) {
      debugError("Export error:", error)
      toast.error("Failed to export customers")
    }
  }

  const getInitials = (name) => {
    if (!name) return "NA"
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "NA"
  }

  return (
    <div className="p-4 lg:p-6 bg-[#ffffffcc]">
      <div className="max-w-7xl mx-auto">
        {/* Filters Section */}
        <div className="bg-white rounded-xl shadow-sm border border-[#EDE8E0] p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#5C5247] mb-2">
                Order Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={draftFilters.orderDate}
                  onChange={(e) => handleDraftFilterChange("orderDate", e.target.value)}
                  className="w-full px-4 py-2.5 border border-[#EDE8E0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00] text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#5C5247] mb-2">
                Customer Joining Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={draftFilters.joiningDate}
                  onChange={(e) => handleDraftFilterChange("joiningDate", e.target.value)}
                  className="w-full px-4 py-2.5 border border-[#EDE8E0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00] text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#5C5247] mb-2">
                Customer status
              </label>
              <select
                value={draftFilters.status}
                onChange={(e) => handleDraftFilterChange("status", e.target.value)}
                className="w-full px-4 py-2.5 border border-[#EDE8E0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00] text-sm"
              >
                <option value="">Select Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#5C5247] mb-2">
                Sort By
              </label>
              <select
                value={draftFilters.sortBy}
                onChange={(e) => handleDraftFilterChange("sortBy", e.target.value)}
                className="w-full px-4 py-2.5 border border-[#EDE8E0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00] text-sm"
              >
                <option value="">Select Customer Sorting Order</option>
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="orders-asc">Orders (Low to High)</option>
                <option value="orders-desc">Orders (High to Low)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#5C5247] mb-2">
                Choose First
              </label>
              <input
                type="number"
                value={draftFilters.chooseFirst}
                onChange={(e) => handleDraftFilterChange("chooseFirst", e.target.value)}
                placeholder="Ex: 100"
                className="w-full px-4 py-2.5 border border-[#EDE8E0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00] text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setFilters(draftFilters)
                }}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-[#FF6A00] text-white hover:bg-[#E85D04] transition-all"
              >
                Apply Filters
              </button>
              <button
                onClick={() => {
                  const empty = {
                    orderDate: "",
                    joiningDate: "",
                    status: "",
                    sortBy: "",
                    chooseFirst: "",
                  }
                  setDraftFilters(empty)
                  setFilters(empty)
                }}
                className="px-6 py-2.5 text-sm font-medium rounded-lg border border-[#EDE8E0] bg-white text-[#5C5247] hover:bg-[#FFF3EB] hover:text-[#FF6A00] transition-all"
              >
                Reset Filters
              </button>
            </div>
            <div className="text-sm text-[#5C5247]">
              {loading ? 'Loading...' : `Showing ${filteredCustomers.length} of ${totalCustomers} customers`}
            </div>
          </div>
        </div>

        {/* Customer List Section */}
        <div className="bg-white rounded-xl shadow-sm border border-[#EDE8E0] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-[#1A1A1A]">Customer list</h2>
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-[#FFF3EB] text-[#FF6A00]">
                {filteredCustomers.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[200px]">
                <input
                  type="text"
                  placeholder="Ex: Search by name"
                  value={searchQuery}
                  onChange={(e) => setCachedSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-[#EDE8E0] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00]"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E8F7E]" />
              </div>

              <RefreshButton onClick={refreshCustomers} loading={loading} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-4 py-2.5 text-sm font-medium rounded-lg border border-[#EDE8E0] bg-white hover:bg-[#FFF3EB] hover:text-[#FF6A00] text-[#5C5247] flex items-center gap-2 transition-all">
                    <Download className="w-4 h-4" />
                    <span className="font-bold">Export</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-[#EDE8E0] rounded-lg shadow-lg z-50">
                  <DropdownMenuLabel className="text-[#1A1A1A]">Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#EDE8E0]" />
                  <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer hover:bg-[#FFF3EB] hover:text-[#FF6A00] focus:bg-[#FFF3EB] focus:text-[#FF6A00]">
                    <FileDown className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer hover:bg-[#FFF3EB] hover:text-[#FF6A00] focus:bg-[#FFF3EB] focus:text-[#FF6A00]">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer hover:bg-[#FFF3EB] hover:text-[#FF6A00] focus:bg-[#FFF3EB] focus:text-[#FF6A00]">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#EDE8E0] bg-[#FAF7F2] px-4 py-3">
            <p className="text-sm text-[#5C5247]">
              {selectedCustomersCount > 0
                ? `${selectedCustomersCount} customer selected`
                : "Select customers for bulk COD action"}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkCodAccess(true)}
                disabled={bulkCodLoading || selectedCustomersCount === 0}
                className="px-3 py-2 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Enable COD
              </button>
              <button
                onClick={() => handleBulkCodAccess(false)}
                disabled={bulkCodLoading || selectedCustomersCount === 0}
                className="px-3 py-2 text-xs font-semibold rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Disable COD
              </button>
            </div>
          </div>

          {/* Table */}
          <AdminTable
            loading={loading}
            skeletonRows={6}
            data={filteredCustomers}
            getRowId={(customer, index) => getCustomerId(customer) || index}
            columns={[
              {
                key: "select",
                header: (
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4 rounded border-[#EDE8E0] text-[#FF6A00] focus:ring-[#FF6A00]"
                  />
                ),
                align: "center",
                width: "4%",
                cell: (customer) => (
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.includes(getCustomerId(customer))}
                    onChange={() => toggleCustomerSelection(getCustomerId(customer))}
                    className="h-4 w-4 rounded border-[#EDE8E0] text-[#FF6A00] focus:ring-[#FF6A00]"
                  />
                ),
              },
              {
                key: "sl",
                header: "Sl",
                width: "5%",
                cell: (customer, index) => (
                  <span className="text-sm font-medium text-[#5C5247]">{index + 1}</span>
                ),
              },
              {
                key: "name",
                header: "Name",
                cell: (customer) => (
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full bg-[#FAF7F2] text-[#5C5247] flex items-center justify-center shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition-all border border-[#EDE8E0]"
                      onClick={() => handleViewDetails(customer._id || customer.id || customer.sl)}
                    >
                      {customer.profileImage ? (
                        <img
                          src={customer.profileImage}
                          alt={customer.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none"
                          }}
                        />
                      ) : (
                        <span className="text-xs font-semibold">{getInitials(customer.name)}</span>
                      )}
                    </div>
                    <span
                      className="text-sm font-medium text-[#1A1A1A] cursor-pointer hover:text-[#FF6A00] transition-colors"
                      onClick={() => handleViewDetails(customer._id || customer.id || customer.sl)}
                    >
                      {customer.name}
                    </span>
                  </div>
                ),
              },
              {
                key: "contact",
                header: "Contact Information",
                cell: (customer) => (
                  <div className="flex flex-col">
                    <span className="text-sm text-[#5C5247]">{customer.email}</span>
                    <span className="text-xs text-[#9E8F7E]">{customer.phone}</span>
                  </div>
                ),
              },
              {
                key: "totalOrder",
                header: "Total Order",
                cell: (customer) => (
                  <span className="text-sm text-[#5C5247]">{customer.totalOrder || 0}</span>
                ),
              },
              {
                key: "totalOrderAmount",
                header: "Total Order Amount",
                cell: (customer) => (
                  <span className="text-sm font-medium text-[#1A1A1A]">
                    {"\u20B9"} {(customer.totalOrderAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                ),
              },
              {
                key: "joiningDate",
                header: "Joining Date",
                cell: (customer) => (
                  <span className="text-sm text-[#5C5247]">{formatDateTime(customer.joiningDate)}</span>
                ),
              },
              {
                key: "codAccess",
                header: "COD Access",
                cell: (customer) => (
                  <button
                    onClick={() => handleToggleCodAccess(getCustomerId(customer))}
                    disabled={codUpdatingId === getCustomerId(customer)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60 ${customer.isCodAllowed !== false ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${customer.isCodAllowed !== false ? "translate-x-6" : "translate-x-1"
                        }`}
                    />
                  </button>
                ),
              },
              {
                key: "status",
                header: "Active/Inactive",
                cell: (customer) => (
                  <button
                    onClick={() => handleToggleStatus(getCustomerId(customer))}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${customer.status ? "bg-red-500" : "bg-slate-300"
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${customer.status ? "translate-x-6" : "translate-x-1"
                        }`}
                    />
                  </button>
                ),
              },
              {
                key: "actions",
                header: "Actions",
                align: "center",
                cell: (customer) => (
                  <button
                    onClick={() => handleViewDetails(customer._id || customer.id || customer.sl)}
                    className="p-1.5 rounded text-[#FF6A00] hover:bg-[#FFF3EB] transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                ),
              },
            ]}
            emptyState={{
              title: "No customers found",
              description: "Try a different search or filter combination.",
            }}
            infiniteScroll={{ onLoadMore: loadMore, hasMore, loadingMore, total: totalCustomers }}
            renderMobileCard={(customer) => (
              <div className="rounded-xl border border-[#EDE8E0] bg-white p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.includes(getCustomerId(customer))}
                    onChange={() => toggleCustomerSelection(getCustomerId(customer))}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-[#EDE8E0] text-[#FF6A00] focus:ring-[#FF6A00]"
                  />
                  <div
                    className="w-11 h-11 shrink-0 rounded-full bg-[#FAF7F2] text-[#5C5247] flex items-center justify-center overflow-hidden cursor-pointer border border-[#EDE8E0]"
                    onClick={() => handleViewDetails(customer._id || customer.id || customer.sl)}
                  >
                    {customer.profileImage ? (
                      <img
                        src={customer.profileImage}
                        alt={customer.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none"
                        }}
                      />
                    ) : (
                      <span className="text-xs font-semibold">{getInitials(customer.name)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-semibold text-[#1A1A1A] cursor-pointer hover:text-[#FF6A00]"
                      onClick={() => handleViewDetails(customer._id || customer.id || customer.sl)}
                    >
                      {customer.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[#5C5247]">{customer.email}</p>
                    <p className="truncate text-xs text-[#9E8F7E]">{customer.phone}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5C5247]">
                      <span>Orders: {customer.totalOrder || 0}</span>
                      <span className="text-[#EDE8E0]">\u2022</span>
                      <span>
                        {"\u20B9"} {(customer.totalOrderAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#9E8F7E]">Joined: {formatDateTime(customer.joiningDate)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EDE8E0] pt-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9E8F7E]">COD</span>
                      <button
                        onClick={() => handleToggleCodAccess(getCustomerId(customer))}
                        disabled={codUpdatingId === getCustomerId(customer)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${customer.isCodAllowed !== false ? "bg-emerald-600" : "bg-slate-300"
                          }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${customer.isCodAllowed !== false ? "translate-x-4" : "translate-x-1"
                            }`}
                        />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9E8F7E]">Active</span>
                      <button
                        onClick={() => handleToggleStatus(getCustomerId(customer))}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${customer.status ? "bg-red-500" : "bg-slate-300"
                          }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${customer.status ? "translate-x-4" : "translate-x-1"
                            }`}
                        />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => handleViewDetails(customer._id || customer.id || customer.sl)}
                    className="rounded-lg p-1.5 text-[#FF6A00] hover:bg-[#FFF3EB]"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          />
          {!loading && totalCustomers > 0 && (
            <p className="mt-3 text-sm text-[#5C5247]">
              Loaded <span className="font-semibold text-[#1A1A1A]">{filteredCustomers.length}</span>
              {" "}of <span className="font-semibold text-[#1A1A1A]">{totalCustomers}</span> customers
            </p>
          )}
        </div>
      </div>

      {/* User Details Modal */}
      <Dialog open={showUserDetails} onOpenChange={setShowUserDetails}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto mx-auto p-0 gap-0 bg-[#FAF7F2] border-[#EDE8E0]">
          <DialogHeader className="px-6 pt-6 pb-4 bg-white border-b border-[#EDE8E0]">
            <DialogTitle className="pr-12 text-xl font-bold text-[#1A1A1A]">User Details</DialogTitle>
          </DialogHeader>

          {loadingDetails ? (
            <div className="px-6 py-8 text-center bg-white">
              <div className="text-sm text-[#9E8F7E]">Loading user details...</div>
            </div>
          ) : userDetails ? (
            <div className="space-y-4 px-6 py-5">
              {/* Profile Section */}
              <div className="bg-white border border-[#EDE8E0] rounded-xl p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#EDE8E0] flex items-center justify-center flex-shrink-0">
                    {userDetails.profileImage ? (
                      <img src={userDetails.profileImage} alt={userDetails.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <User className="w-8 h-8 text-[#9E8F7E]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-lg font-bold text-[#1A1A1A]">{userDetails.name}</h3>
                      {userDetails.isActive ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-[#EAF4EA] text-[#2E7D32] flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div className="flex items-center gap-2 text-sm text-[#5C5247] min-w-0">
                        <Mail className="w-4 h-4 text-[#9E8F7E]" />
                        <span className="truncate">{userDetails.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#5C5247] min-w-0">
                        <Phone className="w-4 h-4 text-[#9E8F7E]" />
                        <span>{userDetails.phone}</span>
                        {userDetails.phoneVerified && (
                          <CheckCircle className="w-3 h-3 text-[#2E7D32]" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#5C5247]">
                        <CalendarIcon className="w-4 h-4 text-[#9E8F7E]" />
                        <span>Joined: {formatDateTime(userDetails.joiningDate)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Statistics Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#FFF3EB] border border-[#EDE8E0] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-[#FF6A00]" />
                    <span className="text-xs font-semibold text-[#5C5247]">Total Orders</span>
                  </div>
                  <p className="text-xl font-bold text-[#FF6A00]">{userDetails.totalOrders || 0}</p>
                </div>
                <div className="bg-[#EAF4EA] border border-[#EDE8E0] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <IndianRupee className="w-4 h-4 text-[#2E7D32]" />
                    <span className="text-xs font-semibold text-[#5C5247]">Total Spent</span>
                  </div>
                  <p className="text-xl font-bold text-[#2E7D32]">
                    {"\u20B9"}{(userDetails.totalOrderAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-white border border-[#EDE8E0] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="w-4 h-4 text-[#9E8F7E]" />
                    <span className="text-xs font-semibold text-[#5C5247]">Member Since</span>
                  </div>
                  <p className="text-base font-bold text-[#1A1A1A]">{formatDateTime(userDetails.joiningDate)}</p>
                </div>
              </div>

              {/* Addresses Section */}
              {userDetails.addresses && userDetails.addresses.length > 0 && (
                <div>
                  <h4 className="text-base font-bold text-[#1A1A1A] mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#FF6A00]" />
                    Addresses
                  </h4>
                  <div className="space-y-2">
                    {userDetails.addresses.map((address, index) => (
                      <div key={index} className="bg-white rounded-xl p-3 border border-[#EDE8E0]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-[#1A1A1A]">{address.label || 'Address'}</span>
                          {address.isDefault && (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-[#FFF3EB] text-[#FF6A00] border border-[#EDE8E0]">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[#5C5247]">
                          {address.street}
                          {address.additionalDetails && `, ${address.additionalDetails}`}
                          {address.city && `, ${address.city}`}
                          {address.state && `, ${address.state}`}
                          {address.zipCode && ` - ${address.zipCode}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Orders Section */}
              {userDetails.orders && userDetails.orders.length > 0 && (
                <div>
                  <h4 className="text-base font-bold text-[#1A1A1A] mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#FF6A00]" />
                    Recent Orders
                  </h4>
                  <div className="space-y-2">
                    {userDetails.orders.slice(0, 5).map((order, index) => (
                      <div key={index} className="bg-white rounded-xl p-3 border border-[#EDE8E0] flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[#1A1A1A]">{order.orderId}</p>
                          <p className="text-xs text-[#5C5247]">{order.restaurantName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-[#1A1A1A]">{"\u20B9"}{(order.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          <p className="text-xs text-[#5C5247] capitalize">{order.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Uploaded Contacts Section */}
              <div className="mt-4 border-t border-[#EDE8E0] pt-4">
                <h4 className="text-base font-bold text-[#1A1A1A] mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#FF6A00]" />
                  Uploaded Contacts ({userContacts.length})
                </h4>
                {loadingContacts ? (
                  <div className="py-4 text-center text-sm text-[#5C5247]">Loading contacts...</div>
                ) : userContacts.length === 0 ? (
                  <div className="bg-white rounded-xl p-4 border border-[#EDE8E0] text-center text-sm text-[#5C5247]">
                    No contacts uploaded by this user.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search contacts by name or phone..."
                        value={contactsSearchQuery}
                        onChange={(e) => setContactsSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[#EDE8E0] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00]"
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E8F7E]" />
                    </div>

                    <div className="bg-white border border-[#EDE8E0] rounded-xl max-h-48 overflow-y-auto divide-y divide-[#EDE8E0]">
                      {filteredUserContacts.length === 0 ? (
                        <div className="py-4 text-center text-sm text-[#5C5247]">No matching contacts found</div>
                      ) : (
                        filteredUserContacts.map((contact, index) => (
                          <div key={contact._id || index} className="px-4 py-2.5 flex justify-between items-center hover:bg-[#FAF7F2] transition-colors">
                            <span className="text-sm font-semibold text-[#1A1A1A]">{contact.contactName}</span>
                            <span className="text-sm text-[#5C5247] font-mono">{contact.contactNumber}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Additional Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {userDetails.gender && (
                  <div className="bg-white rounded-xl p-3 border border-[#EDE8E0]">
                    <p className="text-xs font-semibold text-[#5C5247] mb-1">Gender</p>
                    <p className="text-sm text-[#1A1A1A] capitalize">{userDetails.gender}</p>
                  </div>
                )}
                {userDetails.dateOfBirth && (
                  <div className="bg-white rounded-xl p-3 border border-[#EDE8E0]">
                    <p className="text-xs font-semibold text-[#5C5247] mb-1">Date of Birth</p>
                    <p className="text-sm text-[#1A1A1A]">
                      {new Date(userDetails.dateOfBirth).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center bg-white">
              <div className="text-sm text-[#9E8F7E]">No user details available</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

