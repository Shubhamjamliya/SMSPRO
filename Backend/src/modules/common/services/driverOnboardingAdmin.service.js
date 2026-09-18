import mongoose from "mongoose";
import { Driver } from "../../../core/models/driver.model.js";
import { FoodRefreshToken } from "../../../core/refreshTokens/refreshToken.model.js";
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../../../core/auth/errors.js";
import {
  appendReviewHistory,
  canTransitionEnrollment,
  ensureRegisteredServices,
  getEnrollment,
  serializeEnrollment,
  syncAuthorizedServices,
  syncGlobalDriverStatus,
} from "../utils/driverEnrollment.js";
import {
  getPermissionRootForModule,
  toDriverModuleKey,
  getModuleLabel,
} from "../utils/moduleKeys.js";
import { MODULE_LABELS } from "../utils/moduleSettings.js";
import { serializeDriverOnboarding } from "./driverOnboarding.service.js";
import {
  buildDriverChangedFields,
  buildDriverEnrollmentSnapshot,
} from "./driverOnboardingWorkflow.js";

const TIMELINE_LABELS = {
  submitted: "Initial Submission",
  resubmitted: "Driver Resubmitted",
  approved: "Approved",
  rejected: "Rejected",
  documents_required: "Documents Required",
  pending: "Pending Review",
};

const formatTimelineLabel = (action) =>
  TIMELINE_LABELS[action] ||
  String(action || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const performerName = (changedBy) => {
  if (!changedBy) return "";
  if (typeof changedBy === "string") return changedBy;
  return (
    changedBy.name ||
    changedBy.fullName ||
    changedBy.email ||
    changedBy.phone ||
    ""
  );
};

/**
 * Always derive a fresh field/document diff for the admin detail view when a
 * previousSubmission snapshot exists. Falls back to stored changedFields.
 */
const resolveChangedFields = (partner, enrollment) => {
  const stored = Array.isArray(enrollment.changedFields)
    ? enrollment.changedFields
    : [];
  const previous = enrollment.previousSubmission;
  if (!previous || typeof previous !== "object") return stored;

  try {
    const current = buildDriverEnrollmentSnapshot(partner, enrollment);
    const computed = buildDriverChangedFields(current, previous);
    return computed.length ? computed : stored;
  } catch {
    return stored;
  }
};

const buildEnrollmentTimeline = (enrollmentSerialized) => {
  const timeline = [];
  const history = Array.isArray(enrollmentSerialized.reviewHistory)
    ? enrollmentSerialized.reviewHistory
    : [];

  const hasSubmittedEntry = history.some((entry) =>
    ["submitted", "resubmitted"].includes(entry?.action),
  );

  if (
    !hasSubmittedEntry &&
    (enrollmentSerialized.firstSubmittedAt || enrollmentSerialized.appliedAt)
  ) {
    timeline.push({
      type: "submitted",
      label: "Initial Submission",
      note: "",
      documentsRequested: [],
      at: enrollmentSerialized.firstSubmittedAt || enrollmentSerialized.appliedAt,
      changedBy: null,
      adminName: "",
    });
  }

  for (const entry of history) {
    const action = entry.action || "";
    timeline.push({
      type: action,
      label: formatTimelineLabel(action),
      note: entry.note || "",
      documentsRequested: entry.documentsRequested || [],
      at: entry.changedAt,
      changedBy: entry.changedBy || null,
      adminName: performerName(entry.changedBy),
      rejectionReason:
        action === "rejected" || action === "documents_required"
          ? entry.note || ""
          : "",
    });
  }

  // Surface current pending state after a resubmit when history ends on resubmitted
  const last = timeline[timeline.length - 1];
  if (
    enrollmentSerialized.status === "pending" &&
    last &&
    last.type === "resubmitted"
  ) {
    timeline.push({
      type: "pending",
      label: "Pending Review",
      note: "Awaiting admin review",
      documentsRequested: [],
      at: enrollmentSerialized.submittedAt || enrollmentSerialized.lastResubmittedAt,
      changedBy: null,
      adminName: "",
    });
  }

  timeline.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  return timeline;
};

const hasModulePermission = (user, moduleKey, action = "view") => {
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const root = getPermissionRootForModule(moduleKey);
  if (!root) return false;

  const permissions = user.permissions || user.rolePermissions || {};
  const keys = Object.keys(permissions);

  // Match any permission under the module root
  return keys.some((key) => {
    if (!key.startsWith(`${root}::`)) return false;
    const entry = permissions[key];
    if (!entry) return false;
    if (action === "view") {
      return entry.view || entry.edit || entry.create || entry.delete;
    }
    return Boolean(entry[action]);
  });
};

export const assertModuleAdminAccess = (user, moduleKey, action = "view") => {
  const key = toDriverModuleKey(moduleKey);
  if (!key) throw new ValidationError("Invalid module");
  if (!hasModulePermission(user, key, action) && user?.role !== "ADMIN") {
    // Food join_request specific fallback for employees with that exact key
    if (key === "food") {
      const perms = user?.permissions || {};
      const join =
        perms["food::deliveryman_management::deliveryman::join_request"];
      if (join && (action === "view" ? join.view || join.edit : join[action])) {
        return key;
      }
    }
    if (key === "taxi") {
      const perms = user?.permissions || {};
      const join = perms["taxi::drivers::onboarding"];
      if (join && (action === "view" ? join.view || join.edit : join[action])) {
        return key;
      }
    }
    if (key === "quick-commerce") {
      const perms = user?.permissions || {};
      const join =
        perms["quick::core_management::drivers::onboarding"] ||
        perms["quick::drivers::onboarding"] ||
        perms["quick::core_management::drivers::list"];
      if (join && (action === "view" ? join.view || join.edit : join[action])) {
        return key;
      }
    }
    throw new ForbiddenError(
      "You do not have permission to manage this module's driver requests",
    );
  }
  return key;
};

const enrollmentStatusFilter = (moduleKey, status) => {
  const path = `registeredServices.${moduleKey}.status`;
  if (!status || status === "all") {
    return {
      [path]: { $in: ["pending", "rejected", "documents_required", "approved"] },
    };
  }
  return { [path]: status };
};

export const listModuleJoinRequests = async ({
  moduleKey,
  user,
  status = "pending",
  page = 1,
  limit = 50,
  search = "",
}) => {
  const key = assertModuleAdminAccess(user, moduleKey, "view");
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (safePage - 1) * safeLimit;

  const query = {
    isDeleted: { $ne: true },
    ...enrollmentStatusFilter(key, status),
  };

  if (search && String(search).trim()) {
    const q = String(search).trim();
    query.$or = [
      { name: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { vehicleNumber: { $regex: q, $options: "i" } },
    ];
  }

  const [total, rows] = await Promise.all([
    Driver.countDocuments(query),
    Driver.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select(
        "name phone email profilePhoto status isActive createdAt updatedAt registeredServices authorizedServices vehicleType vehicleName vehicleNumber vehicleBrand vehicleModel vehicleConfigurationId",
      )
      .lean(),
  ]);

  const requests = rows.map((row) => {
    const enrollment = serializeEnrollment(
      key,
      row.registeredServices?.[key] || {},
    );
    return {
      _id: row._id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      profilePhoto: row.profilePhoto,
      module: key,
      moduleLabel: getModuleLabel(key, MODULE_LABELS),
      status: enrollment.status,
      submittedAt: enrollment.submittedAt || enrollment.appliedAt || row.createdAt,
      firstSubmittedAt: enrollment.firstSubmittedAt,
      lastResubmittedAt: enrollment.lastResubmittedAt,
      submissionCount: enrollment.submissionCount,
      isResubmission: enrollment.isResubmission,
      reviewCycles: enrollment.reviewCycles,
      previousStatus: enrollment.previousStatus,
      submissionBadge: enrollment.isResubmission
        ? "Resubmission"
        : "New Submission",
      vehicleType: enrollment.vehicleName || row.vehicleType,
      vehicleNumber: enrollment.vehicleNumber || row.vehicleNumber,
      vehicleConfigurationId: enrollment.vehicleConfigurationId,
      rejectionReason: enrollment.rejectionReason,
      previousRejectionReason: enrollment.previousRejectionReason,
      documentsRequested: enrollment.documentsRequested,
      changedFieldCount: Array.isArray(enrollment.changedFields)
        ? enrollment.changedFields.length
        : 0,
    };
  });

  return { requests, total, page: safePage, limit: safeLimit };
};

export const getModuleJoinRequestDetail = async ({
  moduleKey,
  driverId,
  user,
}) => {
  const key = assertModuleAdminAccess(user, moduleKey, "view");
  if (!mongoose.isValidObjectId(driverId)) {
    throw new ValidationError("Invalid driver id");
  }

  const partner = await Driver.findById(driverId);
  if (!partner) throw new NotFoundError("Driver not found");

  ensureRegisteredServices(partner);
  const enrollment = getEnrollment(partner, key);
  if (!enrollment || enrollment.status === "not_registered") {
    throw new NotFoundError("No onboarding request found for this module");
  }

  const serialized = serializeDriverOnboarding(partner);
  const enrollmentSerialized = serializeEnrollment(key, enrollment);
  const changedFields = resolveChangedFields(partner, enrollment);
  const timeline = buildEnrollmentTimeline(enrollmentSerialized);

  return {
    ...serialized,
    module: key,
    moduleLabel: getModuleLabel(key, MODULE_LABELS),
    enrollment: {
      ...enrollmentSerialized,
      changedFields,
    },
    submissionMeta: {
      submissionNumber: enrollmentSerialized.submissionCount || 1,
      isResubmission: enrollmentSerialized.isResubmission,
      firstSubmittedOn: enrollmentSerialized.firstSubmittedAt,
      lastResubmittedOn: enrollmentSerialized.lastResubmittedAt,
      reviewCycles: enrollmentSerialized.reviewCycles,
      previousStatus: enrollmentSerialized.previousStatus,
      previousRejectionReason: enrollmentSerialized.previousRejectionReason,
      currentStatus: enrollmentSerialized.status,
      changedFieldCount: changedFields.length,
      documentChangeCount: changedFields.filter((item) => item.isDocument)
        .length,
      fieldChangeCount: changedFields.filter((item) => !item.isDocument)
        .length,
    },
    changedFields,
    timeline,
  };
};

const setEnrollmentFields = (partner, moduleKey, patch) => {
  const enrollment = getEnrollment(partner, moduleKey);
  Object.assign(enrollment, patch);
  partner.markModified("registeredServices");
  return enrollment;
};

export const approveModuleEnrollment = async ({
  moduleKey,
  driverId,
  user,
  performer = null,
}) => {
  const key = assertModuleAdminAccess(user, moduleKey, "edit");
  const partner = await Driver.findById(driverId);
  if (!partner) throw new NotFoundError("Driver not found");

  const enrollment = getEnrollment(partner, key);
  if (!canTransitionEnrollment(enrollment.status, "approved", "admin")) {
    throw new ValidationError(
      `Cannot approve module from status ${enrollment.status}`,
    );
  }

  // Require essential profile completeness
  if (!partner.name || !partner.phone) {
    throw new ValidationError("Cannot approve incomplete onboarding");
  }

  setEnrollmentFields(partner, key, {
    status: "approved",
    approvedAt: new Date(),
    rejectedAt: undefined,
    rejectionReason: undefined,
    previousRejectionReason: undefined,
    documentsRequested: [],
    changedFields: [],
    approvedBy: performer,
  });
  appendReviewHistory(getEnrollment(partner, key), {
    action: "approved",
    note: "Approved by admin",
    changedBy: performer,
  });

  syncAuthorizedServices(partner);
  syncGlobalDriverStatus(partner);

  // Mirror legacy food global fields when approving food
  if (key === "food") {
    partner.approvedAt = new Date();
    partner.approvedBy = performer;
    partner.rejectionReason = undefined;
    partner.rejectedAt = undefined;
    partner.documentsRequested = [];
  }

  await partner.save();

  try {
    const { notifyOwnerSafely } =
      await import("../../../core/notifications/firebase.service.js");
    await notifyOwnerSafely(
      { ownerType: "DELIVERY_PARTNER", ownerId: partner._id },
      {
        title: "Module Approved",
        body: `Your ${getModuleLabel(key, MODULE_LABELS)} onboarding was approved.`,
        data: {
          type: "onboarding_approved",
          module: key,
          partnerId: String(partner._id),
        },
      },
    );
  } catch {
    /* ignore */
  }

  return getModuleJoinRequestDetail({ moduleKey: key, driverId, user });
};

export const rejectModuleEnrollment = async ({
  moduleKey,
  driverId,
  reason,
  user,
  performer = null,
}) => {
  const key = assertModuleAdminAccess(user, moduleKey, "edit");
  const trimmed = String(reason || "").trim();
  if (!trimmed) {
    throw new ValidationError("Rejection reason is required");
  }

  const partner = await Driver.findById(driverId);
  if (!partner) throw new NotFoundError("Driver not found");

  const enrollment = getEnrollment(partner, key);
  if (!canTransitionEnrollment(enrollment.status, "rejected", "admin")) {
    throw new ValidationError(
      `Cannot reject module from status ${enrollment.status}`,
    );
  }

  setEnrollmentFields(partner, key, {
    status: "rejected",
    rejectedAt: new Date(),
    rejectionReason: trimmed,
    previousStatus: "pending",
    approvedAt: undefined,
    documentsRequested: [],
    rejectedBy: performer,
  });
  appendReviewHistory(getEnrollment(partner, key), {
    action: "rejected",
    note: trimmed,
    changedBy: performer,
  });

  syncAuthorizedServices(partner);
  syncGlobalDriverStatus(partner);

  if (key === "food") {
    partner.rejectionReason = trimmed;
    partner.rejectedAt = new Date();
    partner.rejectedBy = performer;
    partner.approvedAt = null;
  }

  await partner.save();

  // Only revoke sessions if no modules remain approved
  if (!(partner.authorizedServices || []).length) {
    try {
      await FoodRefreshToken.deleteMany({ userId: partner._id });
      partner.fcmTokens = [];
      partner.fcmTokenMobile = [];
      partner.availabilityStatus = "offline";
      await partner.save();
    } catch {
      /* ignore */
    }
  }

  try {
    const { notifyOwnerSafely } =
      await import("../../../core/notifications/firebase.service.js");
    await notifyOwnerSafely(
      { ownerType: "DELIVERY_PARTNER", ownerId: partner._id },
      {
        title: "Module Onboarding Update",
        body: `Your ${getModuleLabel(key, MODULE_LABELS)} application was rejected. Reason: ${trimmed}`,
        data: {
          type: "onboarding_rejected",
          module: key,
          partnerId: String(partner._id),
          reason: trimmed,
        },
      },
    );
  } catch {
    /* ignore */
  }

  return getModuleJoinRequestDetail({ moduleKey: key, driverId, user });
};

export const requestModuleDocuments = async ({
  moduleKey,
  driverId,
  documents = [],
  reason = "",
  user,
  performer = null,
}) => {
  const key = assertModuleAdminAccess(user, moduleKey, "edit");
  const docs = Array.isArray(documents)
    ? documents.map(String).filter(Boolean)
    : [];
  if (!docs.length) {
    throw new ValidationError("Select at least one document to request");
  }

  const partner = await Driver.findById(driverId);
  if (!partner) throw new NotFoundError("Driver not found");

  const enrollment = getEnrollment(partner, key);
  if (!canTransitionEnrollment(enrollment.status, "documents_required", "admin")) {
    throw new ValidationError(
      `Cannot request documents from status ${enrollment.status}`,
    );
  }

  setEnrollmentFields(partner, key, {
    status: "documents_required",
    documentsRequested: docs,
    previousStatus: enrollment.status,
    previousRejectionReason: enrollment.rejectionReason || "",
    rejectionReason: String(reason || "").trim() || undefined,
    rejectedAt: new Date(),
    rejectedBy: performer,
  });
  appendReviewHistory(getEnrollment(partner, key), {
    action: "documents_required",
    note: reason || "Additional documents requested",
    documentsRequested: docs,
    changedBy: performer,
  });

  syncAuthorizedServices(partner);
  syncGlobalDriverStatus(partner);

  if (key === "food") {
    partner.documentsRequested = docs;
    partner.rejectionReason = String(reason || "").trim() || undefined;
  }

  await partner.save();
  return getModuleJoinRequestDetail({ moduleKey: key, driverId, user });
};
