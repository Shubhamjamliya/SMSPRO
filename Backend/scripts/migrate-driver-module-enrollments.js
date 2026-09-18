import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const mongoUrl =
  process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.DATABASE_URL;

const DRIVER_MODULE_KEYS = [
  "food",
  "quick-commerce",
  "porter",
  "parcel",
  "taxi",
];

const toEnrollment = (raw = {}) => {
  const status = ["pending", "approved", "rejected", "documents_required"].includes(
    raw.status,
  )
    ? raw.status
    : raw.status === "not_registered"
      ? "not_registered"
      : "not_registered";

  return {
    status,
    appliedAt: raw.appliedAt || null,
    submittedAt: raw.submittedAt || raw.appliedAt || null,
    firstSubmittedAt: raw.firstSubmittedAt || raw.appliedAt || raw.submittedAt || null,
    lastResubmittedAt: raw.lastResubmittedAt || null,
    submissionCount: Number(raw.submissionCount || 0) || (status !== "not_registered" ? 1 : 0),
    previousStatus: raw.previousStatus || null,
    previousRejectionReason: raw.previousRejectionReason || "",
    previousSubmission: raw.previousSubmission || null,
    changedFields: Array.isArray(raw.changedFields) ? raw.changedFields : [],
    approvedAt: raw.approvedAt || null,
    rejectedAt: raw.rejectedAt || null,
    rejectionReason: raw.rejectionReason || "",
    documentsRequested: Array.isArray(raw.documentsRequested)
      ? raw.documentsRequested
      : [],
    vehicleConfigurationId: raw.vehicleConfigurationId || null,
    vehicleName: raw.vehicleName || "",
    vehicleNumber: raw.vehicleNumber || "",
    vehicleBrand: raw.vehicleBrand || "",
    vehicleModel: raw.vehicleModel || "",
    documents: raw.documents || {},
    approvedBy: raw.approvedBy || null,
    rejectedBy: raw.rejectedBy || null,
    reviewHistory: Array.isArray(raw.reviewHistory) ? raw.reviewHistory : [],
  };
};

const deriveAuthorized = (doc, enrollments) => {
  const approved = DRIVER_MODULE_KEYS.filter(
    (key) => enrollments[key]?.status === "approved",
  );
  if (approved.length) return approved;

  // Legacy: globally approved food driver without per-module stamp
  if (doc.status === "approved") return ["food"];
  return [];
};

const deriveGlobalStatus = (enrollments, fallbackStatus) => {
  const statuses = DRIVER_MODULE_KEYS.map((key) => enrollments[key]?.status);
  if (statuses.includes("approved")) return "approved";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("documents_required")) return "documents_required";
  if (statuses.includes("rejected")) return "rejected";
  return fallbackStatus || "pending";
};

async function migrate() {
  if (!mongoUrl) {
    throw new Error("Missing MongoDB connection string");
  }

  await mongoose.connect(mongoUrl);
  const collection = mongoose.connection.collection("food_delivery_partners");

  const cursor = collection.find({});
  let scanned = 0;
  let modified = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    scanned += 1;

    const existing = doc.registeredServices || {};
    const enrollments = {};

    for (const key of DRIVER_MODULE_KEYS) {
      enrollments[key] = toEnrollment(existing[key] || {});
    }

    // Bootstrap food enrollment from legacy global status when needed
    if (
      enrollments.food.status === "not_registered" &&
      ["pending", "approved", "rejected", "documents_required"].includes(
        doc.status,
      )
    ) {
      enrollments.food = toEnrollment({
        status: doc.status,
        appliedAt: doc.createdAt,
        submittedAt: doc.createdAt,
        approvedAt: doc.approvedAt,
        rejectedAt: doc.rejectedAt,
        rejectionReason: doc.rejectionReason,
        documentsRequested: doc.documentsRequested,
        approvedBy: doc.approvedBy,
        rejectedBy: doc.rejectedBy,
        vehicleName: doc.vehicleName || doc.vehicleType || "",
        vehicleNumber: doc.vehicleNumber || "",
        vehicleBrand: doc.vehicleBrand || "",
        vehicleModel: doc.vehicleModel || "",
        reviewHistory:
          Array.isArray(existing.food?.reviewHistory) &&
          existing.food.reviewHistory.length
            ? existing.food.reviewHistory
            : [
                {
                  action:
                    doc.status === "approved"
                      ? "approved"
                      : doc.status === "rejected"
                        ? "rejected"
                        : doc.status === "documents_required"
                          ? "documents_required"
                          : "submitted",
                  note: doc.rejectionReason || "",
                  documentsRequested: doc.documentsRequested || [],
                  changedAt:
                    doc.approvedAt ||
                    doc.rejectedAt ||
                    doc.updatedAt ||
                    doc.createdAt ||
                    new Date(),
                  changedBy: doc.approvedBy || doc.rejectedBy || null,
                },
              ],
      });
    }

    // Seed vehicle snapshot onto food enrollment from top-level fields
    if (
      enrollments.food.status !== "not_registered" &&
      !enrollments.food.vehicleName
    ) {
      enrollments.food.vehicleName = doc.vehicleName || doc.vehicleType || "";
      enrollments.food.vehicleNumber = doc.vehicleNumber || "";
      enrollments.food.vehicleBrand = doc.vehicleBrand || "";
      enrollments.food.vehicleModel = doc.vehicleModel || "";
    }

    // Copy top-level document URLs into food enrollment.documents when empty
    if (enrollments.food.status !== "not_registered") {
      const docKeys = [
        "profilePhoto",
        "aadharFront",
        "aadharBack",
        "aadharPhoto",
        "panPhoto",
        "drivingLicenseFront",
        "drivingLicenseBack",
        "drivingLicensePhoto",
        "rcPhoto",
        "rcFront",
        "rcBack",
        "insurancePhoto",
        "pucPhoto",
        "vehiclePermitPhoto",
        "fitnessCertificatePhoto",
        "vehicleImage",
        "bankProof",
      ];
      const existingDocs =
        enrollments.food.documents && typeof enrollments.food.documents === "object"
          ? { ...enrollments.food.documents }
          : {};
      for (const key of docKeys) {
        if (existingDocs[key]) continue;
        const url = doc[key];
        if (url) {
          existingDocs[key] = {
            url,
            publicId: "",
            key,
            uploadedAt: doc.updatedAt || doc.createdAt || new Date(),
          };
        }
      }
      // Alias legacy single-side docs
      if (!existingDocs.aadharFront && existingDocs.aadharPhoto) {
        existingDocs.aadharFront = existingDocs.aadharPhoto;
      }
      if (!existingDocs.drivingLicenseFront && existingDocs.drivingLicensePhoto) {
        existingDocs.drivingLicenseFront = existingDocs.drivingLicensePhoto;
      }
      if (!existingDocs.rcFront && existingDocs.rcPhoto) {
        existingDocs.rcFront = existingDocs.rcPhoto;
      }
      enrollments.food.documents = existingDocs;

      if (!enrollments.food.firstSubmittedAt) {
        enrollments.food.firstSubmittedAt =
          enrollments.food.appliedAt || doc.createdAt || null;
      }
      if (!enrollments.food.submissionCount) {
        enrollments.food.submissionCount =
          enrollments.food.status === "not_registered" ? 0 : 1;
      }
    }

    const authorizedServices = deriveAuthorized(doc, enrollments);
    const status = deriveGlobalStatus(enrollments, doc.status);
    const isActive = authorizedServices.length > 0 && doc.isDeleted !== true;

    const result = await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          registeredServices: enrollments,
          authorizedServices,
          status,
          isActive,
        },
      },
    );

    if (result.modifiedCount) modified += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned,
        modified,
        message:
          "Driver module enrollments migrated; unauthorized defaults cleared",
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
