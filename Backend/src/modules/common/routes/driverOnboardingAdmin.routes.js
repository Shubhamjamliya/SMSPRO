import express from "express";
import { authMiddleware } from "../../../core/auth/auth.middleware.js";
import { requireRoles } from "../../../core/roles/role.middleware.js";
import * as controller from "../controllers/driverOnboardingAdmin.controller.js";

const router = express.Router();

router.use(authMiddleware, requireRoles("ADMIN", "EMPLOYEE"));

router.get("/:module/join-requests", controller.listJoinRequests);
router.get("/:module/join-requests/:id", controller.getJoinRequestDetail);
router.patch("/:module/join-requests/:id/approve", controller.approveJoinRequest);
router.patch("/:module/join-requests/:id/reject", controller.rejectJoinRequest);
router.patch(
  "/:module/join-requests/:id/request-documents",
  controller.requestJoinDocuments,
);

export default router;
