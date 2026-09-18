import { sendResponse } from "../../../utils/response.js";
import { resolveActionPerformerSnapshot } from "../../../core/utils/performer.js";
import * as adminOnboarding from "../services/driverOnboardingAdmin.service.js";

const getActor = async (req) => {
  try {
    return await resolveActionPerformerSnapshot(req.user);
  } catch {
    return null;
  }
};

const enrichUser = async (req) => {
  const user = { ...(req.user || {}) };
  if (user.role === "EMPLOYEE" && user.userId) {
    try {
      const { FoodAdmin } = await import("../../../core/admin/admin.model.js");
      const { getCachedRolePermissions } =
        await import("../../../core/auth/auth.middleware.js");
      const employee = await FoodAdmin.findById(user.userId)
        .select("adminRoleId")
        .lean();
      if (employee?.adminRoleId) {
        user.permissions =
          (await getCachedRolePermissions(employee.adminRoleId)) || {};
      }
    } catch {
      user.permissions = {};
    }
  }
  return user;
};

export const listJoinRequests = async (req, res, next) => {
  try {
    const moduleKey = req.params.module || req.query.module || "food";
    const user = await enrichUser(req);
    const data = await adminOnboarding.listModuleJoinRequests({
      moduleKey,
      user,
      status: req.query.status || "pending",
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search || "",
    });
    return sendResponse(res, 200, "Join requests fetched", data);
  } catch (error) {
    next(error);
  }
};

export const getJoinRequestDetail = async (req, res, next) => {
  try {
    const moduleKey = req.params.module || req.query.module || "food";
    const user = await enrichUser(req);
    const data = await adminOnboarding.getModuleJoinRequestDetail({
      moduleKey,
      driverId: req.params.id,
      user,
    });
    return sendResponse(res, 200, "Join request detail fetched", data);
  } catch (error) {
    next(error);
  }
};

export const approveJoinRequest = async (req, res, next) => {
  try {
    const moduleKey = req.params.module || req.query.module || "food";
    const user = await enrichUser(req);
    const performer = await getActor(req);
    const data = await adminOnboarding.approveModuleEnrollment({
      moduleKey,
      driverId: req.params.id,
      user,
      performer,
    });
    return sendResponse(res, 200, "Driver module approved", data);
  } catch (error) {
    next(error);
  }
};

export const rejectJoinRequest = async (req, res, next) => {
  try {
    const moduleKey = req.params.module || req.query.module || "food";
    const reason = req.body?.reason || req.body?.rejectionReason || "";
    const user = await enrichUser(req);
    const performer = await getActor(req);
    const data = await adminOnboarding.rejectModuleEnrollment({
      moduleKey,
      driverId: req.params.id,
      reason,
      user,
      performer,
    });
    return sendResponse(res, 200, "Driver module rejected", data);
  } catch (error) {
    next(error);
  }
};

export const requestJoinDocuments = async (req, res, next) => {
  try {
    const moduleKey = req.params.module || req.query.module || "food";
    const user = await enrichUser(req);
    const performer = await getActor(req);
    const data = await adminOnboarding.requestModuleDocuments({
      moduleKey,
      driverId: req.params.id,
      documents: req.body?.documents || [],
      reason: req.body?.reason || "",
      user,
      performer,
    });
    return sendResponse(res, 200, "Documents requested", data);
  } catch (error) {
    next(error);
  }
};
