import mongoose from "mongoose";
import { Driver } from "../../../../core/models/driver.model.js";
import { FoodDeliveryCashDeposit } from "../models/foodDeliveryCashDeposit.model.js";
import { DeliverySupportTicket } from "../models/supportTicket.model.js";
import { DeliveryBonusTransaction } from "../../admin/models/deliveryBonusTransaction.model.js";
import { FoodEarningAddon } from "../../admin/models/earningAddon.model.js";
import { FoodOrder } from "../../orders/models/order.model.js";
import { SellerReturn } from "../../../quick-commerce/seller/models/sellerReturn.model.js";
import { resolveReturnPickupCharge } from "../../../quick-commerce/utils/return.helpers.js";
import { uploadImageBuffer } from "../../../../services/cloudinary.service.js";
import { ValidationError } from "../../../../core/auth/errors.js";
import { getDeliveryCashLimitSettings } from "../../admin/services/admin.service.js";
import {
  ensureDailyPassEligibility,
  activateDailyPass,
} from "../../subscriptions/services/wallet.service.js";
import { resolveFoodRiderEarning } from "../../orders/services/deliveryFeeCalculation.service.js";

const pickFirstFile = (files, ...names) => {
  for (const name of names) {
    if (files?.[name]?.[0]) return files[name][0];
  }
  return null;
};

const assertUniqueIdentity = async ({
  phone,
  aadharNumber,
  drivingLicenseNumber,
  vehicleNumber,
  excludeId,
}) => {
  const exclude = excludeId ? { _id: { $ne: excludeId } } : {};

  const phoneClash = await Driver.findOne({ phone, ...exclude })
    .select("_id status")
    .lean();
  if (
    phoneClash &&
    !["rejected", "documents_required"].includes(phoneClash.status)
  ) {
    throw new ValidationError(
      "Delivery partner with this phone already exists",
    );
  }

  if (aadharNumber) {
    const aadhaarClash = await Driver.findOne({ aadharNumber, ...exclude })
      .select("_id")
      .lean();
    if (aadhaarClash) {
      throw new ValidationError("This Aadhaar number is already registered");
    }
  }

  if (drivingLicenseNumber) {
    const dlClash = await Driver.findOne({ drivingLicenseNumber, ...exclude })
      .select("_id")
      .lean();
    if (dlClash) {
      throw new ValidationError(
        "This driving license number is already registered",
      );
    }
  }

  if (vehicleNumber) {
    const vehicleClash = await Driver.findOne({ vehicleNumber, ...exclude })
      .select("_id")
      .lean();
    if (vehicleClash) {
      throw new ValidationError("This vehicle number is already registered");
    }
  }
};

const uploadOnboardingImages = async (files) => {
  const images = {};
  const map = [
    ["profilePhoto", "profilePhoto", "food/delivery/profile"],
    ["aadharFront", "aadharFront", "food/delivery/aadhar"],
    ["aadharBack", "aadharBack", "food/delivery/aadhar"],
    ["drivingLicenseFront", "drivingLicenseFront", "food/delivery/license"],
    ["drivingLicenseBack", "drivingLicenseBack", "food/delivery/license"],
    ["rcPhoto", "rcPhoto", "food/delivery/rc"],
    ["insurancePhoto", "insurancePhoto", "food/delivery/insurance"],
    ["vehicleImage", "vehicleImage", "food/delivery/vehicle"],
    ["panPhoto", "panPhoto", "food/delivery/pan"],
  ];

  for (const [field, destKey, folder] of map) {
    const aliases =
      field === "aadharFront"
        ? ["aadharFront", "aadharPhoto"]
        : field === "drivingLicenseFront"
          ? ["drivingLicenseFront", "drivingLicensePhoto"]
          : [field];
    const file = pickFirstFile(files, ...aliases);
    if (file) {
      images[destKey] = await uploadImageBuffer(file.buffer, folder);
      // Keep legacy mirrors for admin UIs that still read old keys
      if (field === "aadharFront") images.aadharPhoto = images[destKey];
      if (field === "drivingLicenseFront")
        images.drivingLicensePhoto = images[destKey];
    }
  }
  return images;
};

export const registerDeliveryPartner = async (payload, files) => {
  const {
    name,
    phone,
    email,
    countryCode,
    dateOfBirth,
    vehicleType,
    vehicleName,
    vehicleNumber,
    drivingLicenseNumber,
    drivingLicenseExpiry,
    aadharNumber,
    bankAccountHolderName,
    bankAccountNumber,
    bankIfscCode,
    emergencyContactName,
    emergencyContactPhone,
    partnerAgreement,
    termsAccepted,
    privacyAccepted,
    fcmToken,
    platform,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = payload;
  const refRaw =
    typeof payload?.ref === "string" ? String(payload.ref).trim() : "";

  const { validateDeliveryDocumentsRequired } =
    await import("../validators/delivery.validator.js");

  let partner;
  const existing = await Driver.findOne({ phone });
  if (existing) {
    if (!["rejected", "documents_required"].includes(existing.status)) {
      throw new ValidationError(
        "Delivery partner with this phone already exists",
      );
    }
    partner = existing;
  }

  const isPartialReupload =
    partner &&
    partner.status === "documents_required" &&
    Array.isArray(partner.documentsRequested) &&
    partner.documentsRequested.length > 0;

  validateDeliveryDocumentsRequired(files, vehicleType, {
    allowPartial: isPartialReupload,
    requestedDocs: isPartialReupload ? partner.documentsRequested : [],
  });

  await assertUniqueIdentity({
    phone,
    aadharNumber,
    drivingLicenseNumber: drivingLicenseNumber || undefined,
    vehicleNumber: vehicleNumber || undefined,
    excludeId: partner?._id,
  });

  const images = await uploadOnboardingImages(files);

  const partnerData = {
    name,
    phone,
    email: email && String(email).trim() ? String(email).trim() : undefined,
    countryCode,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    vehicleType,
    vehicleName: vehicleName || vehicleType,
    vehicleNumber: vehicleNumber || undefined,
    drivingLicenseNumber: drivingLicenseNumber || undefined,
    drivingLicenseExpiry: drivingLicenseExpiry
      ? new Date(drivingLicenseExpiry)
      : undefined,
    aadharNumber,
    bankAccountHolderName,
    bankAccountNumber,
    bankIfscCode,
    emergencyContactName,
    emergencyContactPhone,
    agreements: {
      partnerAgreement: partnerAgreement === true,
      termsAccepted: termsAccepted === true,
      privacyAccepted: privacyAccepted === true,
      acceptedAt: new Date(),
    },
    status: "pending",
    isActive: false,
    availabilityStatus: "offline",
    documentsRequested: [],
    rejectionReason: null,
    rejectedAt: undefined,
    onboardingStep: "submitted",
    registeredServices: {
      food: {
        status: "pending",
        appliedAt: new Date(),
      },
    },
    ...images,
  };

  if (partner) {
    const { verifyAndConsumeOnboardingPayment } =
      await import("../../../common/services/onboardingFee.service.js");
    await verifyAndConsumeOnboardingPayment({
      role: "DELIVERY_PARTNER",
      paymentDetails: { razorpayOrderId, razorpayPaymentId, razorpaySignature },
      userDetails: { name, phone, email },
      entityId: partner._id,
    });

    Object.assign(partner, partnerData);
    if (partner.registeredServices?.food) {
      partner.registeredServices.food.status = "pending";
      partner.registeredServices.food.appliedAt = new Date();
      partner.registeredServices.food.rejectionReason = undefined;
    }

    if (razorpayOrderId) {
      const { OnboardingPaymentLog } =
        await import("../../../common/models/onboardingPaymentLog.model.js");
      await OnboardingPaymentLog.updateOne(
        { razorpayOrderId },
        { $set: { entityId: partner._id } },
      );
    }
  } else {
    const { verifyAndConsumeOnboardingPayment } =
      await import("../../../common/services/onboardingFee.service.js");
    await verifyAndConsumeOnboardingPayment({
      role: "DELIVERY_PARTNER",
      paymentDetails: { razorpayOrderId, razorpayPaymentId, razorpaySignature },
      userDetails: { name, phone, email },
    });

    partner = await Driver.create(partnerData);

    if (razorpayOrderId) {
      const { OnboardingPaymentLog } =
        await import("../../../common/models/onboardingPaymentLog.model.js");
      await OnboardingPaymentLog.updateOne(
        { razorpayOrderId },
        { $set: { entityId: partner._id } },
      );
    }
  }

  if (fcmToken) {
    if (platform === "mobile") {
      partner.fcmTokenMobile = [fcmToken];
    } else {
      partner.fcmTokens = [fcmToken];
    }
  }

  if (!partner.referralCode) {
    partner.referralCode = String(partner._id);
  }

  if (refRaw && String(refRaw) !== String(partner._id)) {
    let referrer = null;
    if (mongoose.Types.ObjectId.isValid(refRaw)) {
      referrer = await Driver.findById(refRaw).select("_id").lean();
    }
    if (!referrer) {
      referrer = await Driver.findOne({
        $or: [{ referralCode: refRaw }, { phone: refRaw }],
      })
        .select("_id")
        .lean();
    }
    if (referrer) {
      partner.referredBy = referrer._id;
    }
  }

  await partner.save();

  try {
    const { notifyAdminsSafely } =
      await import("../../../../core/notifications/firebase.service.js");
    void notifyAdminsSafely({
      title: "New Delivery Partner Registration 🚲",
      body: `A new delivery partner "${partner.name}" has signed up and is pending approval.`,
      data: {
        type: "new_registration",
        subType: "delivery_partner",
        id: String(partner._id),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "Failed to notify admins of new delivery partner registration:",
      e,
    );
  }

  return partner.toObject();
};

/** Partial re-upload for partners in documents_required status */
export const resubmitRequestedDocuments = async (partnerId, files) => {
  const partner = await Driver.findById(partnerId);
  if (!partner) {
    throw new ValidationError("Delivery partner not found");
  }
  if (partner.status !== "documents_required") {
    throw new ValidationError(
      "No document re-upload is pending for this account",
    );
  }
  const requested = Array.isArray(partner.documentsRequested)
    ? partner.documentsRequested
    : [];
  if (!requested.length) {
    throw new ValidationError("No documents were requested for re-upload");
  }

  const { validateDeliveryDocumentsRequired } =
    await import("../validators/delivery.validator.js");
  validateDeliveryDocumentsRequired(files, partner.vehicleType, {
    allowPartial: true,
    requestedDocs: requested,
  });

  const images = await uploadOnboardingImages(files);
  Object.assign(partner, images);
  partner.status = "pending";
  partner.isActive = false;
  partner.availabilityStatus = "offline";
  partner.documentsRequested = [];
  partner.rejectionReason = null;
  partner.rejectedAt = undefined;
  if (partner.registeredServices?.food) {
    partner.registeredServices.food.status = "pending";
    partner.registeredServices.food.appliedAt = new Date();
    partner.registeredServices.food.rejectionReason = undefined;
  }
  await partner.save();

  try {
    const { notifyAdminsSafely } =
      await import("../../../../core/notifications/firebase.service.js");
    void notifyAdminsSafely({
      title: "Delivery Partner Documents Re-uploaded 📄",
      body: `"${partner.name}" re-uploaded requested documents and is pending review.`,
      data: {
        type: "documents_resubmitted",
        subType: "delivery_partner",
        id: String(partner._id),
      },
    });
  } catch (e) {
    console.error("Failed to notify admins of document resubmit:", e);
  }

  return partner.toObject();
};

/** Public onboarding status lookup (phone only — no PII beyond status). */
export const getDeliveryOnboardingStatus = async (phoneRaw) => {
  const digits = String(phoneRaw || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (!last10 || last10.length < 8) {
    throw new ValidationError("Valid phone number is required");
  }

  const partner = await Driver.findOne({
    $or: [
      { phone: last10 },
      { phone: digits },
      { phone: { $regex: new RegExp(`${last10}$`) } },
    ],
  })
    .select(
      "status isActive rejectionReason documentsRequested approvedAt rejectedAt",
    )
    .lean();

  if (!partner) {
    return {
      found: false,
      status: null,
      message: "No delivery partner registration found for this number.",
    };
  }

  const status = partner.status || "pending";
  let message = "Your account is pending admin verification.";
  if (status === "approved") {
    message = "Your account has been approved. You can sign in and go online.";
  } else if (status === "rejected") {
    message = partner.rejectionReason || "Your application was rejected.";
  } else if (status === "documents_required") {
    message =
      partner.rejectionReason || "Please re-upload the requested documents.";
  }

  return {
    found: true,
    status,
    isActive: partner.isActive !== false && status === "approved",
    rejectionReason: partner.rejectionReason || null,
    documentsRequested: partner.documentsRequested || [],
    approvedAt: partner.approvedAt || null,
    rejectedAt: partner.rejectedAt || null,
    message,
  };
};

export const updateDeliveryPartnerProfile = async (userId, payload, files) => {
  const partner = await Driver.findById(userId);
  if (!partner) {
    throw new ValidationError("Delivery partner not found");
  }

  const {
    name,
    countryCode,
    email,
    dateOfBirth,
    vehicleType,
    vehicleName,
    vehicleNumber,
    drivingLicenseNumber,
    drivingLicenseExpiry,
    aadharNumber,
    panNumber,
    bankAccountHolderName,
    bankAccountNumber,
    bankIfscCode,
    emergencyContactName,
    emergencyContactPhone,
    partnerAgreement,
    termsAccepted,
    privacyAccepted,
    fcmToken,
    platform,
  } = payload;

  const nextVehicleType =
    vehicleType !== undefined ? vehicleType : partner.vehicleType;
  const isPartialReupload =
    partner.status === "documents_required" &&
    Array.isArray(partner.documentsRequested) &&
    partner.documentsRequested.length > 0;

  if (files && Object.keys(files).length > 0) {
    const { validateDeliveryDocumentsRequired } =
      await import("../validators/delivery.validator.js");
    if (isPartialReupload) {
      validateDeliveryDocumentsRequired(files, nextVehicleType, {
        allowPartial: true,
        requestedDocs: partner.documentsRequested,
      });
    }
    const images = await uploadOnboardingImages(files);
    Object.assign(partner, images);
  }

  if (name) partner.name = name;
  if (countryCode !== undefined) partner.countryCode = countryCode;
  if (email !== undefined)
    partner.email =
      email && String(email).trim() ? String(email).trim() : undefined;
  if (dateOfBirth) partner.dateOfBirth = new Date(dateOfBirth);
  if (vehicleType !== undefined) partner.vehicleType = vehicleType;
  if (vehicleName !== undefined) partner.vehicleName = vehicleName;
  if (vehicleNumber !== undefined)
    partner.vehicleNumber = vehicleNumber || undefined;
  if (drivingLicenseNumber !== undefined)
    partner.drivingLicenseNumber = drivingLicenseNumber || undefined;
  if (drivingLicenseExpiry !== undefined) {
    partner.drivingLicenseExpiry = drivingLicenseExpiry
      ? new Date(drivingLicenseExpiry)
      : undefined;
  }
  if (aadharNumber !== undefined)
    partner.aadharNumber = aadharNumber || undefined;
  if (panNumber !== undefined) partner.panNumber = panNumber;
  if (bankAccountHolderName !== undefined)
    partner.bankAccountHolderName = bankAccountHolderName;
  if (bankAccountNumber !== undefined)
    partner.bankAccountNumber = bankAccountNumber;
  if (bankIfscCode !== undefined)
    partner.bankIfscCode = bankIfscCode
      ? String(bankIfscCode).toUpperCase()
      : undefined;
  if (emergencyContactName !== undefined)
    partner.emergencyContactName = emergencyContactName;
  if (emergencyContactPhone !== undefined)
    partner.emergencyContactPhone = emergencyContactPhone;

  if (
    partnerAgreement === true ||
    termsAccepted === true ||
    privacyAccepted === true
  ) {
    partner.agreements = {
      partnerAgreement:
        partnerAgreement === true ||
        partner.agreements?.partnerAgreement === true,
      termsAccepted:
        termsAccepted === true || partner.agreements?.termsAccepted === true,
      privacyAccepted:
        privacyAccepted === true ||
        partner.agreements?.privacyAccepted === true,
      acceptedAt: new Date(),
    };
  }

  await assertUniqueIdentity({
    phone: partner.phone,
    aadharNumber: partner.aadharNumber,
    drivingLicenseNumber: partner.drivingLicenseNumber,
    vehicleNumber: partner.vehicleNumber,
    excludeId: partner._id,
  });

  if (fcmToken) {
    if (platform === "mobile") {
      if (!partner.fcmTokenMobile) partner.fcmTokenMobile = [];
      if (!partner.fcmTokenMobile.includes(fcmToken)) {
        partner.fcmTokenMobile.push(fcmToken);
      }
    } else {
      if (!partner.fcmTokens) partner.fcmTokens = [];
      if (!partner.fcmTokens.includes(fcmToken)) {
        partner.fcmTokens.push(fcmToken);
      }
    }
  }

  // Re-upload flow: move back to pending only after required docs were uploaded
  if (isPartialReupload) {
    const uploadedSomething = files && Object.keys(files).length > 0;
    if (!uploadedSomething) {
      throw new ValidationError(
        "Please upload the requested documents before resubmitting",
      );
    }
    partner.status = "pending";
    partner.isActive = false;
    partner.availabilityStatus = "offline";
    partner.documentsRequested = [];
    partner.rejectionReason = null;
    partner.rejectedAt = undefined;
    if (partner.registeredServices?.food) {
      partner.registeredServices.food.status = "pending";
      partner.registeredServices.food.appliedAt = new Date();
    }
  } else if (partner.status === "rejected") {
    // Full re-apply via authenticated profile requires files for a complete profile;
    // do not silently flip status without document validation on this path.
    if (files && Object.keys(files).length > 0) {
      partner.status = "pending";
      partner.isActive = false;
      partner.availabilityStatus = "offline";
      partner.documentsRequested = [];
      partner.rejectionReason = null;
      partner.rejectedAt = undefined;
      if (partner.registeredServices?.food) {
        partner.registeredServices.food.status = "pending";
        partner.registeredServices.food.appliedAt = new Date();
      }
    }
  }

  await partner.save();
  return {
    partner: partner.toObject(),
    requiresReapproval: partner.status === "pending",
  };
};

export const updateDeliveryPartnerDetails = async (userId, payload) => {
  const partner = await Driver.findById(userId);
  if (!partner) {
    throw new ValidationError("Delivery partner not found");
  }

  const vehicle = payload?.vehicle;
  if (vehicle && typeof vehicle === "object") {
    if (vehicle.number !== undefined)
      partner.vehicleNumber = String(vehicle.number || "").trim();
    if (vehicle.type !== undefined)
      partner.vehicleType = String(vehicle.type || "").trim();
    if (vehicle.brand !== undefined)
      partner.vehicleName = String(vehicle.brand || "").trim();
    if (vehicle.model !== undefined)
      partner.vehicleName = String(vehicle.model || "").trim();
  }

  if (payload?.profilePhoto !== undefined) {
    partner.profilePhoto = payload.profilePhoto
      ? String(payload.profilePhoto).trim()
      : "";
  }

  await partner.save();
  return partner.toObject();
};

export const updateDeliveryPartnerProfilePhotoBase64 = async (
  userId,
  payload,
) => {
  const partner = await Driver.findById(userId);
  if (!partner) {
    throw new ValidationError("Delivery partner not found");
  }
  const base64 = payload?.base64;
  const mimeType = payload?.mimeType || "image/jpeg";
  if (!base64 || typeof base64 !== "string") {
    throw new ValidationError("base64 is required");
  }
  const buffer = Buffer.from(base64, "base64");
  if (!buffer || !buffer.length) {
    throw new ValidationError("Invalid base64 image");
  }
  if (buffer.length > 8 * 1024 * 1024) {
    throw new ValidationError("Image too large (max 8MB)");
  }
  // uploadImageBuffer expects raw bytes; mimeType is ignored by current implementation, but buffer is valid.
  partner.profilePhoto = await uploadImageBuffer(
    buffer,
    "food/delivery/profile",
  );
  await partner.save();
  return partner.toObject();
};

export const updateDeliveryPartnerBankDetails = async (
  userId,
  payload,
  files,
) => {
  const partner = await Driver.findById(userId);
  if (!partner) {
    throw new ValidationError("Delivery partner not found");
  }

  // Handle both nested JSON and flat FormData from multer
  let bankDetails = payload?.documents?.bankDetails;
  let panDetails = payload?.documents?.pan;

  // Multer flattens FormData keys like 'documents[bankDetails][accountNumber]'
  if (!bankDetails && payload) {
    const b = {};
    if (payload["documents[bankDetails][accountHolderName]"] !== undefined)
      b.accountHolderName =
        payload["documents[bankDetails][accountHolderName]"];
    if (payload["documents[bankDetails][accountNumber]"] !== undefined)
      b.accountNumber = payload["documents[bankDetails][accountNumber]"];
    if (payload["documents[bankDetails][ifscCode]"] !== undefined)
      b.ifscCode = payload["documents[bankDetails][ifscCode]"];
    if (payload["documents[bankDetails][bankName]"] !== undefined)
      b.bankName = payload["documents[bankDetails][bankName]"];
    if (payload["documents[bankDetails][upiId]"] !== undefined)
      b.upiId = payload["documents[bankDetails][upiId]"];
    if (Object.keys(b).length > 0) bankDetails = b;
  }

  if (!panDetails && payload?.["documents[pan][number]"] !== undefined) {
    panDetails = { number: payload["documents[pan][number]"] };
  }

  if (bankDetails) {
    const b = bankDetails;
    if (b.accountHolderName !== undefined)
      partner.bankAccountHolderName = b.accountHolderName
        ? String(b.accountHolderName).trim()
        : "";
    if (b.accountNumber !== undefined)
      partner.bankAccountNumber = b.accountNumber
        ? String(b.accountNumber).trim()
        : "";
    if (b.ifscCode !== undefined)
      partner.bankIfscCode = b.ifscCode
        ? String(b.ifscCode).trim().toUpperCase()
        : "";
    if (b.bankName !== undefined)
      partner.bankName = b.bankName ? String(b.bankName).trim() : "";
    if (b.upiId !== undefined)
      partner.upiId = b.upiId ? String(b.upiId).trim() : "";
  }

  if (panDetails?.number !== undefined) {
    partner.panNumber = panDetails.number
      ? String(panDetails.number).trim().toUpperCase()
      : "";
  }

  if (files?.upiQrCode?.[0]) {
    partner.upiQrCode = await uploadImageBuffer(
      files.upiQrCode[0].buffer,
      "food/delivery/upi",
    );
  } else if (
    payload.removeUpiQrCode === "true" ||
    payload.removeUpiQrCode === true
  ) {
    partner.upiQrCode = null;
  }

  await partner.save();
  return partner.toObject();
};

function generateTicketId() {
  const n = Date.now().toString(36).slice(-6).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TKT-${n}${r}`;
}

export const listSupportTicketsByPartner = async (deliveryPartnerId) => {
  const list = await DeliverySupportTicket.find({ deliveryPartnerId })
    .sort({ createdAt: -1 })
    .lean();
  return list;
};

export const createSupportTicket = async (deliveryPartnerId, payload) => {
  const {
    subject,
    description,
    category = "other",
    priority = "medium",
  } = payload;
  if (!subject || !description || subject.trim().length < 3) {
    throw new ValidationError("Subject is required (min 3 characters)");
  }
  if (description.trim().length < 10) {
    throw new ValidationError("Description must be at least 10 characters");
  }
  let ticketId = generateTicketId();
  let exists = await DeliverySupportTicket.findOne({ ticketId }).lean();
  while (exists) {
    ticketId = generateTicketId();
    exists = await DeliverySupportTicket.findOne({ ticketId }).lean();
  }
  const ticket = await DeliverySupportTicket.create({
    deliveryPartnerId,
    ticketId,
    subject: subject.trim(),
    description: description.trim(),
    category: ["payment", "account", "technical", "order", "other"].includes(
      category,
    )
      ? category
      : "other",
    priority: ["low", "medium", "high", "urgent"].includes(priority)
      ? priority
      : "medium",
    status: "open",
  });
  return ticket.toObject();
};

export const getSupportTicketByIdAndPartner = async (
  ticketId,
  deliveryPartnerId,
) => {
  const ticket = await DeliverySupportTicket.findOne({
    _id: ticketId,
    deliveryPartnerId,
  }).lean();
  return ticket;
};

export const updateDeliveryAvailability = async (userId, payload) => {
  const partner = await Driver.findById(userId);
  if (!partner) {
    throw new ValidationError("Delivery partner not found");
  }
  const { status } = payload || {};
  const latitude = Number(payload?.latitude);
  const longitude = Number(payload?.longitude);
  const hasCoords =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  let validStatus = "offline";
  if (status === "online" || status === true) validStatus = "online";
  else if (status === "offline" || status === false) validStatus = "offline";

  // Fast path for the frequent location pings (every ~7s while online):
  // no status transition -> atomic coordinate update, skipping full-document
  // validation (a legacy field failing validation must not kill live tracking).
  if (hasCoords && partner.availabilityStatus === validStatus) {
    await Driver.updateOne(
      { _id: userId },
      {
        $set: {
          lastLocation: { type: "Point", coordinates: [longitude, latitude] },
          lastLat: latitude,
          lastLng: longitude,
          lastLocationAt: new Date(),
        },
      },
    );
    return { availabilityStatus: partner.availabilityStatus };
  }

  // PHASE 3C-1: SUBSCRIPTION TRIGGER (OFFLINE -> ONLINE ONLY)
  if (partner.availabilityStatus === "offline" && validStatus === "online") {
    const eligibility = await ensureDailyPassEligibility(
      userId,
      "DELIVERY_PARTNER",
    );
    const confirmPass = payload?.confirmPass === true;

    // Daily pass confirmation only — no low-subscription-balance gate
    if (eligibility.shouldDeduct) {
      if (!confirmPass) {
        throw new ValidationError("PASS_REQUIRED");
      }
      const result = await activateDailyPass(userId, "DELIVERY_PARTNER");
      if (!result.success) {
        throw new ValidationError(
          result.reason === "LOW_BALANCE"
            ? "Unable to activate daily pass. Please recharge your subscription wallet."
            : "Failed to activate daily pass.",
        );
      }
    }

    // Only approved + active partners may go online
    if (partner.status !== "approved") {
      throw new ValidationError(
        "Your account is pending verification. You cannot go online yet.",
      );
    }
    if (partner.isActive === false) {
      throw new ValidationError(
        "Your account is inactive. Please contact support.",
      );
    }
    const { getDeliveryPartnerWalletEnhanced } =
      await import("./deliveryFinance.service.js");
    const wallet = await getDeliveryPartnerWalletEnhanced(userId);
    // Block if: (1) admin set limit to 0 OR (2) delivery boy has exhausted their limit
    const cashLimitHit =
      wallet.totalCashLimit === 0 || wallet.availableCashLimit <= 0;
    if (cashLimitHit) {
      throw new ValidationError("CASH_LIMIT_EXCEEDED");
    }
  }

  partner.availabilityStatus = validStatus;
  if (payload?.activeModule != null || payload?.activeWorkModule != null) {
    const moduleKey = String(
      payload.activeModule || payload.activeWorkModule || "",
    )
      .trim()
      .toLowerCase();
    partner.activeWorkModule = moduleKey || null;
  }
  if (hasCoords) {
    partner.lastLocation = {
      type: "Point",
      coordinates: [longitude, latitude],
    };
    partner.lastLat = latitude;
    partner.lastLng = longitude;
    partner.lastLocationAt = new Date();
  }
  await partner.save();
  return { availabilityStatus: partner.availabilityStatus };
};

// ----- Delivery partner wallet (Pocket / requests page) -----
const sumReturnPickupEarnings = async (partnerId, range = null) => {
  const match = {
    "dispatch.deliveryPartnerId": partnerId,
    "dispatch.status": "completed",
  };
  if (range) {
    match["deliveryState.completedAt"] = { $gte: range.start, $lte: range.end };
  }

  const agg = await SellerReturn.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: { $ifNull: ["$riderEarning", 0] } },
        totalTrips: { $sum: 1 },
      },
    },
  ]);

  return {
    totalEarnings: Number(agg?.[0]?.totalEarnings) || 0,
    totalTrips: Number(agg?.[0]?.totalTrips) || 0,
  };
};

const listReturnPickupWalletTransactions = async (partnerId, limit = 2000) => {
  const returns = await SellerReturn.find({
    "dispatch.deliveryPartnerId": partnerId,
    "dispatch.status": "completed",
  })
    .sort({ "deliveryState.completedAt": -1, updatedAt: -1 })
    .select("orderId riderEarning deliveryState dispatch createdAt")
    .limit(limit)
    .lean();

  return (returns || []).map((row) => {
    const completedAt =
      row?.deliveryState?.completedAt ||
      row?.dispatch?.completedAt ||
      row?.updatedAt ||
      row?.createdAt;
    const date = completedAt || new Date();
    return {
      _id: row._id,
      type: "payment",
      amount: Number(row.riderEarning) || 0,
      status: "Completed",
      date,
      createdAt: date,
      orderId: row.orderId || String(row._id),
      paymentMethod: "prepaid",
      metadata: {
        orderId: row.orderId || String(row._id),
        returnId: String(row._id),
        tripType: "return_pickup",
        documentType: "seller_return",
      },
      description: `Return pickup earning - ${row.orderId || row._id}`,
    };
  });
};

export const getDeliveryPartnerWallet = async (deliveryPartnerId) => {
  if (
    !deliveryPartnerId ||
    !mongoose.Types.ObjectId.isValid(deliveryPartnerId)
  ) {
    throw new ValidationError("Delivery partner not found");
  }
  const partner = await Driver.findById(deliveryPartnerId).lean();
  if (!partner) {
    throw new ValidationError("Delivery partner not found");
  }

  const cashLimitSettings = await getDeliveryCashLimitSettings();
  const totalCashLimit = Number(cashLimitSettings.deliveryCashLimit) || 0;
  const deliveryWithdrawalLimit =
    Number(cashLimitSettings.deliveryWithdrawalLimit) || 100;
  const minWalletToReceiveOrders =
    Number(cashLimitSettings.minWalletToReceiveOrders) || 0;

  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);

  // Earnings paid to rider through completed deliveries
  const [earningsAgg, cashAgg, returnPickupEarnings] = await Promise.all([
    FoodOrder.aggregate([
      {
        $match: {
          "dispatch.deliveryPartnerId": partnerId,
          orderStatus: "delivered",
        },
      },
      {
        $group: {
          _id: null,
          totalEarned: { $sum: { $ifNull: ["$riderEarning", 0] } },
        },
      },
    ]),
    FoodOrder.aggregate([
      {
        $match: {
          "dispatch.deliveryPartnerId": partnerId,
          orderStatus: "delivered",
          "payment.method": "cash",
          "payment.status": "paid",
        },
      },
      {
        $group: {
          _id: null,
          cashInHand: {
            $sum: {
              $ifNull: [
                "$payment.amountDue",
                { $ifNull: ["$pricing.total", 0] },
              ],
            },
          },
        },
      },
    ]),
    sumReturnPickupEarnings(partnerId),
  ]);

  const totalEarned =
    (Number(earningsAgg?.[0]?.totalEarned) || 0) +
    (Number(returnPickupEarnings?.totalEarnings) || 0);
  const foodCashInHand = Number(cashAgg?.[0]?.cashInHand) || 0;
  let porterCashInHand = 0;
  try {
    const { PorterTrip } = await import("../../../porter/models/porterTrip.model.js");
    const porterCashAgg = await PorterTrip.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          status: "completed",
          "dispatch.deliveryPartnerId": partnerId,
          "payment.status": "paid",
          $or: [
            { "payment.method": { $in: ["cash", "cod"] } },
            { "payment.cashCollectedAmount": { $gt: 0 } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          cash: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ["$payment.cashCollectedAmount", 0] }, 0] },
                { $ifNull: ["$payment.cashCollectedAmount", 0] },
                {
                  $max: [
                    { $ifNull: ["$payment.amountPaid", 0] },
                    { $ifNull: ["$fare.total", 0] },
                    { $ifNull: ["$fareEstimateTotal", 0] },
                    0,
                  ],
                },
              ],
            },
          },
        },
      },
    ]);
    porterCashInHand = Number(porterCashAgg?.[0]?.cash) || 0;
  } catch {
    porterCashInHand = 0;
  }
  const rawCashInHand = foodCashInHand + porterCashInHand;

  // Subtract deposits already made by this partner (admin records deposit → reduces cashInHand)
  const depositAgg = await FoodDeliveryCashDeposit.aggregate([
    {
      $match: {
        deliveryPartnerId: partnerId,
        status: "Completed",
      },
    },
    {
      $group: {
        _id: null,
        totalDeposited: { $sum: { $ifNull: ["$amount", 0] } },
      },
    },
  ]);
  const totalDeposited = Number(depositAgg?.[0]?.totalDeposited) || 0;
  const cashInHand = Math.max(0, rawCashInHand - totalDeposited);

  // Admin-set delivery bonuses / earning addons
  const bonusAgg = await DeliveryBonusTransaction.aggregate([
    { $match: { deliveryPartnerId: partnerId } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const totalBonus = bonusAgg?.[0] ? Number(bonusAgg[0].total) : 0;

  // Keep transactions list reasonably small (UI only needs recent data for charts)
  const [paymentTxList, bonusTxList, returnPickupTxList] = await Promise.all([
    FoodOrder.find({
      "dispatch.deliveryPartnerId": partnerId,
      orderStatus: "delivered",
    })
      .sort({ "deliveryState.deliveredAt": -1, createdAt: -1 })
      .select(
        "orderId riderEarning payment orderStatus deliveryState createdAt",
      )
      .limit(2000)
      .lean(),
    DeliveryBonusTransaction.find({ deliveryPartnerId: partnerId })
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean(),
    listReturnPickupWalletTransactions(partnerId, 2000),
  ]);

  const paymentTransactions = (paymentTxList || []).map((o) => {
    const deliveredAt = o?.deliveryState?.deliveredAt || o?.deliveredAt || null;
    const date = deliveredAt || o?.createdAt || new Date();
    return {
      _id: o._id,
      type: "payment",
      amount: Number(o.riderEarning) || 0,
      status: "Completed",
      date,
      createdAt: date,
      orderId: o.orderId || String(o._id),
      paymentMethod: o?.payment?.method || "",
      metadata: { orderId: o.orderId || String(o._id) },
      description:
        o?.payment?.method === "cash"
          ? "COD delivery earning"
          : "Online delivery earning",
    };
  });

  // Frontend weekly earnings expects bonus transactions as `earning_addon`.
  const bonusTransactions = (bonusTxList || []).map((t) => ({
    _id: t._id,
    type: "earning_addon",
    amount: Number(t.amount) || 0,
    status: "Completed",
    date: t.createdAt,
    createdAt: t.createdAt,
    metadata: { reference: t.reference || "" },
    description: t.reference ? `Bonus - ${t.reference}` : "Bonus",
  }));

  const totalWithdrawn = 0;
  const totalBalance = totalEarned + totalBonus;
  const availableCashLimit = Math.max(0, totalCashLimit - cashInHand);

  return {
    totalBalance,
    pocketBalance: totalBalance,
    cashInHand,
    totalWithdrawn,
    totalEarned,
    totalCashLimit,
    availableCashLimit,
    deliveryWithdrawalLimit,
    minWalletToReceiveOrders,
    canReceiveOrders:
      minWalletToReceiveOrders <= 0 || totalBalance >= minWalletToReceiveOrders,
    walletShortfall: Math.max(0, minWalletToReceiveOrders - totalBalance),
    transactions: [
      ...paymentTransactions,
      ...returnPickupTxList,
      ...bonusTransactions,
    ].sort((a, b) => {
      const ad = a?.date ? new Date(a.date).getTime() : 0;
      const bd = b?.date ? new Date(b.date).getTime() : 0;
      return bd - ad;
    }),
    joiningBonusClaimed: false,
    joiningBonusAmount: 0,
  };
};

// ----- Delivery partner earnings summary (Pocket / requests page) -----
export const getDeliveryPartnerEarnings = async (
  deliveryPartnerId,
  query = {},
) => {
  if (
    !deliveryPartnerId ||
    !mongoose.Types.ObjectId.isValid(deliveryPartnerId)
  ) {
    throw new ValidationError("Delivery partner not found");
  }
  const period = String(query.period || "week").toLowerCase();
  const date = query.date ? new Date(query.date) : new Date();
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 1000);

  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);

  let range = null;
  if (period === "today") {
    range = { start: toStartOfDay(date), end: toEndOfDay(date) };
  } else if (period === "week") {
    range = getWeekRange(date);
  } else if (period === "month") {
    range = getMonthRange(date);
  } else if (period === "all") {
    range = null;
  } else {
    // fallback to week
    range = getWeekRange(date);
  }

  const match = {
    "dispatch.deliveryPartnerId": partnerId,
    orderStatus: "delivered",
  };
  if (range) {
    match["deliveryState.deliveredAt"] = { $gte: range.start, $lte: range.end };
  }

  const [totalOrders, agg, returnPickupEarnings] = await Promise.all([
    FoodOrder.countDocuments(match),
    FoodOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: { $ifNull: ["$riderEarning", 0] } },
        },
      },
    ]),
    sumReturnPickupEarnings(partnerId, range),
  ]);

  const totalEarnings =
    (Number(agg?.[0]?.totalEarnings) || 0) +
    (Number(returnPickupEarnings?.totalEarnings) || 0);
  const combinedOrders =
    totalOrders + (Number(returnPickupEarnings?.totalTrips) || 0);

  // Frontend only strongly relies on totalEarnings + totalOrders.
  const summary = {
    totalEarnings,
    totalOrders: combinedOrders,
    totalHours: 0,
    totalMinutes: 0,
    orderEarning: totalEarnings,
    incentive: 0,
    otherEarnings: 0,
  };

  return {
    summary,
    period,
    date: date.toISOString(),
    pagination: { page, limit, total: combinedOrders },
  };
};

const normalizeStatusFilter = (status) => {
  if (!status) return null;
  const s = String(status || "").trim();
  if (!s || s.toUpperCase() === "ALL TRIPS") return null;
  // UI uses Completed/Cancelled/Pending
  return s;
};

const toStartOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const toEndOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const getWeekRange = (anchorDate) => {
  const d = new Date(anchorDate);
  const start = toStartOfDay(d);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  const end = toEndOfDay(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
};

const getMonthRange = (anchorDate) => {
  const d = new Date(anchorDate);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const computeRange = (period, date) => {
  const p = String(period || "daily").toLowerCase();
  const anchor =
    date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  if (p === "weekly" || p === "week") return getWeekRange(anchor);
  if (p === "monthly" || p === "month") return getMonthRange(anchor);
  // daily
  return { start: toStartOfDay(anchor), end: toEndOfDay(anchor) };
};

const toTripDto = (order) => {
  const createdAt = order?.createdAt || null;
  const deliveredAt =
    order?.deliveryState?.deliveredAt ||
    order?.deliveredAt ||
    order?.completedAt ||
    null;
  const dateForUi = deliveredAt || createdAt || order?.updatedAt || null;

  const time = dateForUi
    ? new Date(dateForUi).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const orderStatus = String(
    order?.orderStatus || order?.status || "",
  ).toLowerCase();
  const isDelivered =
    orderStatus === "delivered" ||
    String(order?.deliveryState?.currentPhase || "").toLowerCase() ===
      "delivered";
  const isCancelled =
    orderStatus.startsWith("cancelled") ||
    String(order?.deliveryState?.status || "")
      .toLowerCase()
      .includes("cancel");

  const status = isDelivered
    ? "Completed"
    : isCancelled
      ? "Cancelled"
      : "Pending";

  const restaurantName =
    order?.restaurantId?.restaurantName ||
    order?.restaurantName ||
    order?.restaurant?.restaurantName ||
    "";

  const paymentMethod = order?.payment?.method || order?.paymentMethod || "";
  const pricingTotal =
    Number(order?.pricing?.total) || Number(order?.totalAmount) || 0;

  const riderBaseDeliveryFee = Number(order?.pricing?.riderBaseDeliveryFee || 0);
  const deliveryExtraFee = Number(order?.pricing?.deliveryExtraFee || 0);
  const earningAmount =
    Number(order?.riderEarning) > 0
      ? Number(order.riderEarning)
      : String(order?.orderType || "").toLowerCase() === "food"
        ? resolveFoodRiderEarning(order?.pricing || {})
        : Number(
            order?.deliveryEarning ||
              order?.pricing?.deliveryFee ||
              order?.deliveryFee ||
              0,
          ) || 0;
  const codAmount =
    paymentMethod === "cash" ? Number(order?.payment?.amountDue) || 0 : 0;
  const codCollectedAmount =
    paymentMethod === "cash" && order?.payment?.status === "paid"
      ? codAmount
      : 0;

  const orderType = String(order?.orderType || "").toLowerCase().trim();
  let moduleKey = "food";
  if (orderType === "quick" || orderType === "quick_commerce" || orderType === "quick-commerce") {
    moduleKey = "quick-commerce";
  } else if (orderType === "porter") {
    moduleKey = "porter";
  } else if (orderType === "parcel") {
    moduleKey = "parcel";
  } else if (orderType === "taxi") {
    moduleKey = "taxi";
  } else if (orderType === "mixed") {
    const items = Array.isArray(order?.items) ? order.items : [];
    const hasQuick = items.some(
      (i) => String(i?.type || i?.orderType || "").toLowerCase() === "quick",
    );
    const hasFood = items.some((i) => {
      const t = String(i?.type || i?.orderType || "food").toLowerCase();
      return t !== "quick";
    });
    moduleKey = hasQuick && !hasFood ? "quick-commerce" : "food";
  } else if (order?.module) {
    moduleKey = String(order.module).toLowerCase().replace(/_/g, "-");
    if (moduleKey === "quick" || moduleKey === "quickcommerce") {
      moduleKey = "quick-commerce";
    }
  }

  return {
    id: order?._id,
    _id: order?._id,
    orderId: order?.orderId || order?._id,
    status,
    module: moduleKey,
    moduleKey,
    orderType: orderType || moduleKey,
    restaurantName,
    restaurant: restaurantName,
    items: order?.items || order?.orderItems || [],
    orderItems: order?.orderItems || order?.items || [],
    paymentMethod,
    totalAmount: pricingTotal,
    orderTotal: pricingTotal,
    codAmount: codAmount,
    codCollectedAmount,
    deliveryEarning: earningAmount,
    earningAmount: earningAmount,
    riderBaseDeliveryFee,
    deliveryExtraFee,
    amount: earningAmount, // legacy fallback
    createdAt: order?.createdAt,
    deliveredAt: deliveredAt,
    completedAt: deliveredAt,
    date: dateForUi,
    time,
    _sortAt: dateForUi ? new Date(dateForUi).getTime() : 0,
  };
};

const toReturnPickupTripDto = (returnDoc) => {
  const completedAt =
    returnDoc?.deliveryState?.completedAt ||
    returnDoc?.dispatch?.completedAt ||
    returnDoc?.updatedAt ||
    null;
  const dateForUi = completedAt || returnDoc?.createdAt || null;
  const time = dateForUi
    ? new Date(dateForUi).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const breakdown = returnDoc?.pickupPricingBreakdown || null;
  const earningAmount = resolveReturnPickupCharge(returnDoc);
  const distanceKm = Number(
    returnDoc?.pickupDistanceKm ?? breakdown?.distanceKm ?? 0,
  );

  return {
    id: returnDoc?._id,
    _id: returnDoc?._id,
    orderId: returnDoc?.orderId,
    returnId: String(returnDoc?._id || ""),
    documentType: "seller_return",
    tripType: "return_pickup",
    isReturnPickup: true,
    countsAsOrder: false,
    module: "food",
    moduleKey: "food",
    orderType: "food",
    status:
      returnDoc?.dispatch?.status === "completed" ? "Completed" : "Pending",
    restaurantName: "Return Pickup",
    restaurant: "Return Pickup",
    items: returnDoc?.returnItems || [],
    paymentMethod: "prepaid",
    totalAmount: Number(returnDoc?.returnRefundAmount || 0),
    orderTotal: Number(returnDoc?.returnRefundAmount || 0),
    codAmount: 0,
    codCollectedAmount: 0,
    deliveryEarning: earningAmount,
    earningAmount,
    amount: earningAmount,
    distanceKm,
    pickupDistanceKm: distanceKm,
    pickupPricingBreakdown: breakdown,
    baseFee: Number(breakdown?.basePayout ?? 0),
    baseKm: Number(breakdown?.baseKm ?? 0),
    extraKm: Number(breakdown?.extraKm ?? 0),
    perKmRate: Number(breakdown?.perKmRate ?? 0),
    createdAt: returnDoc?.createdAt,
    deliveredAt: completedAt,
    completedAt,
    date: dateForUi,
    time,
  };
};

export const getDeliveryPartnerTripHistory = async (
  deliveryPartnerId,
  query = {},
) => {
  if (
    !deliveryPartnerId ||
    !mongoose.Types.ObjectId.isValid(deliveryPartnerId)
  ) {
    throw new ValidationError("Delivery partner not found");
  }
  const period = query.period || "daily";
  const date = query.date ? new Date(query.date) : new Date();
  const statusFilter = normalizeStatusFilter(query.status);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 1000);

  const { start, end } = computeRange(period, date);

  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const match = { "dispatch.deliveryPartnerId": partnerId };

  const sf = String(statusFilter || "").toLowerCase();
  if (sf === "completed") {
    match.orderStatus = "delivered";
    match["deliveryState.deliveredAt"] = { $gte: start, $lte: end };
  } else if (sf === "cancelled") {
    match.orderStatus = { $regex: "^cancelled", $options: "i" };
    match.createdAt = { $gte: start, $lte: end };
  } else if (sf === "pending") {
    match.createdAt = { $gte: start, $lte: end };
    // Pending = not delivered and not cancelled
    match.$and = [
      { orderStatus: { $ne: "delivered" } },
      { orderStatus: { $not: { $regex: "^cancelled", $options: "i" } } },
    ];
  } else {
    // ALL TRIPS: show anything created in range, and compute earnings only for delivered orders.
    match.createdAt = { $gte: start, $lte: end };
  }

  const orders = await FoodOrder.find(match)
    .populate({ path: "restaurantId", select: "restaurantName" })
    .sort({ "deliveryState.deliveredAt": -1, createdAt: -1 })
    .limit(limit)
    .lean();

  const returnMatch = { "dispatch.deliveryPartnerId": partnerId };
  if (sf === "completed") {
    returnMatch["dispatch.status"] = "completed";
    returnMatch["deliveryState.completedAt"] = { $gte: start, $lte: end };
  } else if (sf === "cancelled") {
    returnMatch.returnStatus = "return_cancelled";
    returnMatch.createdAt = { $gte: start, $lte: end };
  } else if (sf === "pending") {
    returnMatch.createdAt = { $gte: start, $lte: end };
    returnMatch["dispatch.status"] = { $ne: "completed" };
    returnMatch.returnStatus = { $ne: "return_cancelled" };
  } else {
    returnMatch.createdAt = { $gte: start, $lte: end };
  }

  const returnPickups = await SellerReturn.find(returnMatch)
    .sort({ "deliveryState.completedAt": -1, createdAt: -1 })
    .limit(limit)
    .lean();

  const forwardTrips = (orders || []).map(toTripDto);
  const returnTrips = (returnPickups || []).map(toReturnPickupTripDto);
  const mergedTrips = [...forwardTrips, ...returnTrips]
    .sort(
      (a, b) =>
        new Date(b.completedAt || b.deliveredAt || b.createdAt) -
        new Date(a.completedAt || a.deliveredAt || a.createdAt),
    )
    .slice(0, limit);

  return {
    period,
    date: (date || new Date()).toISOString(),
    range: { start: start.toISOString(), end: end.toISOString() },
    trips: mergedTrips,
  };
};

export const getDeliveryPocketDetails = async (
  deliveryPartnerId,
  query = {},
) => {
  if (
    !deliveryPartnerId ||
    !mongoose.Types.ObjectId.isValid(deliveryPartnerId)
  ) {
    throw new ValidationError("Delivery partner not found");
  }

  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 1000, 1), 2000);

  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);

  const [orders, returnPickups, bonusTxList] = await Promise.all([
    FoodOrder.find({
      "dispatch.deliveryPartnerId": partnerId,
      orderStatus: "delivered",
    })
      .populate({ path: "restaurantId", select: "restaurantName" })
      .sort({
        "deliveryState.deliveredAt": -1,
        deliveredAt: -1,
        completedAt: -1,
        updatedAt: -1,
        createdAt: -1,
      })
      .limit(limit)
      .lean(),
    SellerReturn.find({
      "dispatch.deliveryPartnerId": partnerId,
      "dispatch.status": "completed",
    })
      .sort({ "deliveryState.completedAt": -1, updatedAt: -1 })
      .limit(limit)
      .lean(),
    DeliveryBonusTransaction.find({
      deliveryPartnerId: partnerId,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
  ]);

  const trips = [
    ...(orders || []).map(toTripDto),
    ...(returnPickups || []).map(toReturnPickupTripDto),
  ]
    .sort(
      (a, b) =>
        new Date(b.completedAt || b.deliveredAt || b.createdAt) -
        new Date(a.completedAt || a.deliveredAt || a.createdAt),
    )
    .slice(0, limit);

  const paymentTransactions = [
    ...(orders || []).map((o) => ({
      _id: o._id,
      type: "payment",
      amount: Number(o.riderEarning) || 0,
      status: "Completed",
      date: o?.deliveryState?.deliveredAt || o?.deliveredAt || o?.createdAt,
      createdAt:
        o?.deliveryState?.deliveredAt || o?.deliveredAt || o?.createdAt,
      orderId: o.orderId || String(o._id),
      metadata: { orderId: o.orderId || String(o._id) },
      description: o?.restaurantId?.restaurantName
        ? `Order earning - ${o.restaurantId.restaurantName}`
        : "Order earning",
    })),
    ...(returnPickups || []).map((row) => ({
      _id: row._id,
      type: "payment",
      amount: Number(row.riderEarning) || 0,
      status: "Completed",
      date:
        row?.deliveryState?.completedAt ||
        row?.dispatch?.completedAt ||
        row?.updatedAt ||
        row?.createdAt,
      createdAt:
        row?.deliveryState?.completedAt ||
        row?.dispatch?.completedAt ||
        row?.updatedAt ||
        row?.createdAt,
      orderId: row.orderId || String(row._id),
      metadata: {
        orderId: row.orderId || String(row._id),
        returnId: String(row._id),
        tripType: "return_pickup",
      },
      description: `Return pickup earning - ${row.orderId || row._id}`,
    })),
  ];

  const bonusTransactions = (bonusTxList || []).map((t) => ({
    _id: t._id,
    type: "bonus",
    amount: Number(t.amount) || 0,
    status: "Completed",
    date: t.createdAt,
    createdAt: t.createdAt,
    metadata: { reference: t.reference || "" },
    description: t.reference ? `Bonus - ${t.reference}` : "Bonus",
  }));

  const totalEarning = paymentTransactions.reduce(
    (sum, t) => sum + (Number(t.amount) || 0),
    0,
  );
  const totalBonus = bonusTransactions.reduce(
    (sum, t) => sum + (Number(t.amount) || 0),
    0,
  );

  return {
    week: { start: start.toISOString(), end: end.toISOString() },
    summary: {
      totalEarning,
      totalBonus,
      grandTotal: totalEarning + totalBonus,
    },
    trips,
    transactions: {
      payment: paymentTransactions,
      bonus: bonusTransactions,
    },
  };
};

export const getActiveEarningAddonsForPartner = async (deliveryPartnerId) => {
  if (
    !deliveryPartnerId ||
    !mongoose.Types.ObjectId.isValid(deliveryPartnerId)
  ) {
    throw new ValidationError("Delivery partner not found");
  }

  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const now = new Date();

  const addons = await FoodEarningAddon.find({
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .sort({ endDate: 1, createdAt: 1 })
    .lean();

  const liveAddons = (addons || []).filter((addon) => {
    if (!addon) return false;
    const maxRedemptions = Number(addon.maxRedemptions);
    if (!Number.isFinite(maxRedemptions) || maxRedemptions <= 0) return true;
    return Number(addon.currentRedemptions || 0) < maxRedemptions;
  });

  const offers = await Promise.all(
    liveAddons.map(async (addon) => {
      const startDate = addon.startDate ? new Date(addon.startDate) : null;
      const endDate = addon.endDate ? new Date(addon.endDate) : null;

      const baseMatch = {
        "dispatch.deliveryPartnerId": partnerId,
        orderStatus: "delivered",
      };

      if (startDate && endDate) {
        baseMatch["deliveryState.deliveredAt"] = {
          $gte: startDate,
          $lte: endDate,
        };
      }

      const [currentOrders, earningsAgg] = await Promise.all([
        FoodOrder.countDocuments(baseMatch),
        FoodOrder.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$riderEarning", 0] } },
            },
          },
        ]),
      ]);

      const currentEarnings = Number(earningsAgg?.[0]?.total) || 0;

      return {
        id: addon._id,
        title: addon.title || "Earnings Guarantee",
        description: addon.description || "",
        targetAmount: Number(addon.earningAmount) || 0,
        targetOrders: Number(addon.requiredOrders) || 0,
        currentOrders: Number(currentOrders) || 0,
        currentEarnings,
        startDate,
        endDate,
        validTill: endDate ? endDate.toISOString() : null,
        isLive: true,
      };
    }),
  );

  return {
    activeOffer: offers[0] || null,
    offers,
  };
};

export const deleteDeliveryPartnerAccount = async (userId) => {
  const partner = await Driver.findById(userId);
  if (!partner) {
    throw new ValidationError("Delivery partner not found");
  }

  // Soft delete
  partner.isDeleted = true;
  partner.accountStatus = "deleted";
  partner.isActive = false;
  partner.availabilityStatus = "offline";
  await partner.save();

  // Invalidate refresh tokens
  const { FoodRefreshToken } =
    await import("../../../../core/refreshTokens/refreshToken.model.js");
  await FoodRefreshToken.deleteMany({ userId });

  return {
    success: true,
    message: "Delivery account soft deleted successfully",
  };
};
