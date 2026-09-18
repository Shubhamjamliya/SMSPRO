import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Eye,
  Loader2,
  Search,
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  CreditCard,
  Calendar,
  Image as ImageIcon,
  Landmark,
  Hash,
  Clock,
  ZoomIn,
  User,
  History,
} from "lucide-react";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import { useAuth } from "@core/context/AuthContext";
import { getCurrentUser } from "@food/utils/auth";
import {
  canPerformAdminPermissionAction,
  extractAdminPermissions,
  extractAdminRoleId,
  fetchAdminRolePermissions,
} from "@food/utils/adminPermissions";

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  onboarding: "bg-gray-100 text-gray-600",
};

const statusBadgeClass = (status) =>
  STATUS_STYLES[status] || STATUS_STYLES.onboarding;

const CHANGE_TEXT_FIELDS = {
  ownerName: "Owner name",
  businessName: "Business name",
  email: "Email",
  address: "Address",
  city: "City",
  state: "State",
  pincode: "Pincode",
  landmark: "Landmark",
  "bank.bankName": "Bank name",
  "bank.accountHolderName": "Account holder",
  "bank.accountNumber": "Account number",
  "bank.ifscCode": "IFSC code",
  "bank.accountType": "Account type",
  "bank.upiId": "UPI ID",
  "documents.panNumber": "PAN number",
  "documents.aadhaarNumber": "Aadhaar number",
  "documents.drivingLicenseNumber": "Driving licence number",
  "documents.gstNumber": "GST number",
  "documents.businessRegistrationNumber": "Business registration number",
};

const CHANGE_IMAGE_FIELDS = {
  profilePhoto: "Profile photo",
  "documents.panImage": "PAN document",
  "documents.aadhaarImage": "Aadhaar document",
  "documents.drivingLicenseImage": "Driving licence document",
  "documents.gstImage": "GST certificate",
  "documents.businessRegistrationImage": "Business registration document",
};

const getPath = (obj, path) =>
  path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

const buildVendorChanges = (previous, current) => {
  if (!previous) return null;

  const textChanges = Object.entries(CHANGE_TEXT_FIELDS)
    .map(([path, label]) => ({
      path,
      label,
      before: getPath(previous, path) || "",
      after: getPath(current, path) || "",
    }))
    .filter((c) => c.before !== c.after);

  const imageChanges = Object.entries(CHANGE_IMAGE_FIELDS)
    .map(([path, label]) => ({
      path,
      label,
      before: getPath(previous, path) || "",
      after: getPath(current, path) || "",
    }))
    .filter((c) => c.before !== c.after);

  const prevShop = Array.isArray(previous.shopImages) ? previous.shopImages : [];
  const currShop = Array.isArray(current.shopImages) ? current.shopImages : [];
  const addedShop = currShop.filter((url) => !prevShop.includes(url));
  const removedShop = prevShop.filter((url) => !currShop.includes(url));

  return { textChanges, imageChanges, addedShop, removedShop };
};

export default function VendorJoiningRequests() {
  const { user: authUser } = useAuth();
  const currentUser = useMemo(
    () => authUser || getCurrentUser("admin"),
    [authUser],
  );
  const [resolvedPermissions, setResolvedPermissions] = useState({});
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selected, setSelected] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [commissionRate, setCommissionRate] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    let mounted = true;
    const resolvePermissions = async () => {
      if (!currentUser || currentUser.role === "ADMIN") {
        if (mounted) setResolvedPermissions({});
        return;
      }
      const existing = extractAdminPermissions(currentUser);
      if (Object.keys(existing).length > 0) {
        if (mounted) setResolvedPermissions(existing);
        return;
      }
      const roleId = extractAdminRoleId(currentUser);
      if (!roleId) {
        if (mounted) setResolvedPermissions({});
        return;
      }
      try {
        const rolePermissions = await fetchAdminRolePermissions(roleId);
        if (mounted) setResolvedPermissions(rolePermissions);
      } catch {
        if (mounted) setResolvedPermissions({});
      }
    };
    resolvePermissions();
    return () => {
      mounted = false;
    };
  }, [currentUser]);

  const permissionKey = "bikeRent::vendors::joining_requests";
  const canEdit = canPerformAdminPermissionAction(
    currentUser,
    resolvedPermissions,
    permissionKey,
    "edit",
  );

  const load = async (nextSearch = search, nextStatus = statusFilter) => {
    setLoading(true);
    try {
      const data = await bikeRentAdminApi.getVendorRequests({
        status: nextStatus,
        search: nextSearch,
        limit: 100,
      });
      setRecords(data?.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load vendor requests");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const approve = async (vendor) => {
    if (!canEdit) {
      toast.error("You do not have permission to approve vendors");
      return;
    }
    setProcessing(true);
    try {
      await bikeRentAdminApi.approveVendorRequest(vendor._id || vendor.id);
      toast.success("Vendor approved");
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Approve failed");
    } finally {
      setProcessing(false);
    }
  };

  const reject = async (vendor) => {
    if (!canEdit) {
      toast.error("You do not have permission to reject vendors");
      return;
    }
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setProcessing(true);
    try {
      await bikeRentAdminApi.rejectVendorRequest(vendor._id || vendor.id, rejectReason.trim());
      toast.success("Vendor rejected");
      setRejectReason("");
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Reject failed");
    } finally {
      setProcessing(false);
    }
  };

  const saveVendorSettings = async (vendor) => {
    if (!canEdit) {
      toast.error("You do not have permission to update vendors");
      return;
    }
    setProcessing(true);
    try {
      await bikeRentAdminApi.updateVendor(vendor._id || vendor.id, {
        commissionRate: commissionRate === "" ? null : Number(commissionRate),
        isActive,
      });
      toast.success("Vendor updated");
      setSelected(null);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Update failed");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Vendor joining requests</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review Bike Rental Vendor registrations. Approved vendors can open the vendor dashboard. Global Bike Rent settings stay admin-only.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") load(search, statusFilter);
            }}
            placeholder="Search name, phone, business, city…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#FF6A00]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="onboarding">Onboarding drafts</option>
          <option value="all">All</option>
        </select>
        <button
          type="button"
          onClick={() => load(search, statusFilter)}
          className="rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white"
        >
          Search
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No vendor requests found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((item) => (
                  <tr key={item._id || item.id} className="border-t border-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{item.businessName}</p>
                      <p className="text-xs text-gray-500">
                        {item.ownerName} · {item.vendorCode || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{item.phone || "—"}</p>
                      <p className="text-xs text-gray-400">{item.email || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.city || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(item.submittedAt || item.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${statusBadgeClass(item.status)}`}
                        >
                          {item.status}
                        </span>
                        {item.status === "pending" && item.rejectedSnapshot ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold uppercase text-blue-700"
                            title="Vendor edited and resubmitted after a rejection"
                          >
                            <History className="h-3 w-3" />
                            Resubmitted
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(item);
                            setRejectReason("");
                            setCommissionRate(item.commissionRate ?? "");
                            setIsActive(item.isActive !== false);
                          }}
                          className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                          title="Review"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {item.status === "pending" && canEdit ? (
                          <>
                            <button
                              type="button"
                              onClick={() => approve(item)}
                              className="rounded-lg bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100"
                              title="Approve"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(item);
                                setRejectReason("");
                              }}
                              className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100"
                              title="Reject"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                  {selected.profilePhoto ? (
                    <button
                      type="button"
                      onClick={() => setLightboxImage(selected.profilePhoto)}
                      className="block h-full w-full"
                    >
                      <img
                        src={selected.profilePhoto}
                        alt={selected.ownerName}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-300">
                      <User className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900">{selected.businessName}</h2>
                  <p className="text-sm text-gray-500">
                    {selected.ownerName} · {selected.vendorCode || "—"}
                  </p>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${statusBadgeClass(selected.status)}`}
                    >
                      {selected.status}
                    </span>
                    {selected.status === "pending" && selected.rejectedSnapshot ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase text-blue-700">
                        <History className="h-3 w-3" />
                        Resubmitted
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl bg-gray-100 p-2 text-gray-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selected.rejectionReason ? (
              <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                Rejection reason: {selected.rejectionReason}
              </div>
            ) : selected.status === "pending" && selected.rejectedSnapshot?.rejectionReason ? (
              <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                Previously rejected for: {selected.rejectedSnapshot.rejectionReason}
              </div>
            ) : null}

            {selected.status === "pending" && selected.rejectedSnapshot ? (
              <VendorChangesPanel
                previous={selected.rejectedSnapshot}
                current={selected}
                onView={setLightboxImage}
              />
            ) : null}

            <SectionLabel>Contact & business</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info icon={Building2} label="Owner" value={selected.ownerName} />
              <Info icon={Phone} label="Phone" value={selected.phone} />
              <Info icon={Mail} label="Email" value={selected.email} />
              <Info icon={Hash} label="Vendor code" value={selected.vendorCode} />
            </div>

            <SectionLabel>Address</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info
                icon={MapPin}
                label="Address"
                value={[selected.address, selected.landmark]
                  .filter(Boolean)
                  .join(", ")}
              />
              <Info
                icon={MapPin}
                label="City / State / Pincode"
                value={[selected.city, selected.state, selected.pincode]
                  .filter(Boolean)
                  .join(", ")}
              />
            </div>

            <SectionLabel>Documents</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DocumentCard
                label="PAN card"
                number={selected.documents?.panNumber}
                image={selected.documents?.panImage}
                onView={setLightboxImage}
              />
              <DocumentCard
                label="Aadhaar card"
                number={selected.documents?.aadhaarNumber}
                image={selected.documents?.aadhaarImage}
                onView={setLightboxImage}
              />
              <DocumentCard
                label="Driving licence"
                number={selected.documents?.drivingLicenseNumber}
                image={selected.documents?.drivingLicenseImage}
                onView={setLightboxImage}
              />
              <DocumentCard
                label="GST certificate"
                number={selected.documents?.gstNumber}
                image={selected.documents?.gstImage}
                onView={setLightboxImage}
              />
              <DocumentCard
                label="Business registration"
                number={selected.documents?.businessRegistrationNumber}
                image={selected.documents?.businessRegistrationImage}
                onView={setLightboxImage}
              />
            </div>

            <SectionLabel>Bank details</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info icon={Landmark} label="Bank name" value={selected.bank?.bankName} />
              <Info icon={User} label="Account holder" value={selected.bank?.accountHolderName} />
              <Info icon={CreditCard} label="Account number" value={selected.bank?.accountNumber} />
              <Info icon={Hash} label="IFSC code" value={selected.bank?.ifscCode} />
              <Info icon={Landmark} label="Account type" value={selected.bank?.accountType} />
              <Info icon={CreditCard} label="UPI ID" value={selected.bank?.upiId} />
            </div>

            <SectionLabel>Shop images</SectionLabel>
            {selected.shopImages && selected.shopImages.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {selected.shopImages.map((url, idx) => (
                  <button
                    type="button"
                    key={url + idx}
                    onClick={() => setLightboxImage(url)}
                    className="group relative overflow-hidden rounded-xl border border-gray-100"
                  >
                    <img src={url} alt="" className="h-28 w-full object-cover" />
                    <span className="absolute inset-0 hidden items-center justify-center bg-black/30 group-hover:flex">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">
                No shop images uploaded
              </p>
            )}

            <SectionLabel>Timeline</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Info icon={Calendar} label="Submitted" value={formatDate(selected.submittedAt || selected.createdAt)} />
              {selected.status === "approved" ? (
                <Info icon={Clock} label="Approved" value={formatDate(selected.approvedAt)} />
              ) : selected.status === "rejected" ? (
                <Info icon={Clock} label="Rejected" value={formatDate(selected.rejectedAt)} />
              ) : (
                <Info icon={Clock} label="Onboarding step" value={selected.onboardingStep ? `${selected.onboardingStep} / 4` : "—"} />
              )}
            </div>

            {selected.status === "approved" && canEdit ? (
              <div className="mt-5 space-y-3 border-t border-gray-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Vendor settings</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-600">
                      Commission rate % (blank = platform default)
                    </label>
                    <input
                      value={commissionRate}
                      onChange={(e) => setCommissionRate(e.target.value)}
                      placeholder="e.g. 20"
                      className="w-40 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    Active (can log in / take bookings)
                  </label>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => saveVendorSettings(selected)}
                    className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : null}

            {selected.status === "pending" && canEdit ? (
              <div className="mt-5 space-y-3 border-t border-gray-100 pt-4">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Rejection reason (required to reject)"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => approve(selected)}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={() => reject(selected)}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {lightboxImage ? (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute right-4 top-4 rounded-xl bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxImage}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </div>
  );
}

function ImageDiffThumb({ url, label, onView }) {
  if (!url) {
    return (
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 text-center text-[9px] font-semibold uppercase text-gray-400">
        None
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onView(url)}
      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200"
      title={label}
    >
      <img src={url} alt={label} className="h-full w-full object-cover" />
    </button>
  );
}

function VendorChangesPanel({ previous, current, onView }) {
  const changes = useMemo(() => buildVendorChanges(previous, current), [previous, current]);
  if (!changes) return null;

  const { textChanges, imageChanges, addedShop, removedShop } = changes;
  const hasChanges =
    textChanges.length > 0 || imageChanges.length > 0 || addedShop.length > 0 || removedShop.length > 0;

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-amber-800">
        <History className="h-4 w-4" />
        Changes since last rejection
      </p>

      {!hasChanges ? (
        <p className="text-sm text-amber-700">Resubmitted without changing any details.</p>
      ) : (
        <div className="space-y-3">
          {textChanges.map((c) => (
            <div key={c.path} className="text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{c.label}</p>
              <p className="mt-0.5">
                <span className="text-red-600 line-through">{c.before || "—"}</span>
                <span className="mx-1.5 text-gray-400">→</span>
                <span className="font-semibold text-emerald-700">{c.after || "—"}</span>
              </p>
            </div>
          ))}

          {imageChanges.map((c) => (
            <div key={c.path} className="text-sm">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">{c.label}</p>
              <div className="flex items-center gap-2">
                <ImageDiffThumb url={c.before} label="Previous" onView={onView} />
                <span className="text-gray-400">→</span>
                <ImageDiffThumb url={c.after} label="New" onView={onView} />
              </div>
            </div>
          ))}

          {addedShop.length > 0 || removedShop.length > 0 ? (
            <div className="text-sm">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">Shop images</p>
              {addedShop.length > 0 ? (
                <p className="font-semibold text-emerald-700">+{addedShop.length} added</p>
              ) : null}
              {removedShop.length > 0 ? (
                <p className="font-semibold text-red-600">-{removedShop.length} removed</p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-gray-400 first:mt-0">
      {children}
    </p>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-sm font-semibold text-gray-800 wrap-break-word">{value || "—"}</p>
    </div>
  );
}

function DocumentCard({ label, number, image, onView }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
      {image ? (
        <button
          type="button"
          onClick={() => onView(image)}
          className="group relative block h-28 w-full"
        >
          <img src={image} alt={label} className="h-full w-full object-cover" />
          <span className="absolute inset-0 hidden items-center justify-center bg-black/30 group-hover:flex">
            <ZoomIn className="h-5 w-5 text-white" />
          </span>
        </button>
      ) : (
        <div className="flex h-28 w-full items-center justify-center bg-gray-100 text-gray-300">
          <ImageIcon className="h-6 w-6" />
        </div>
      )}
      <div className="px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="truncate text-sm font-semibold text-gray-800">{number || "Not provided"}</p>
        {!image ? <p className="text-[11px] text-gray-400">No image uploaded</p> : null}
      </div>
    </div>
  );
}
