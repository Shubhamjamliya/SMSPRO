import mongoose from "mongoose";
import { FoodDeliveryCashDeposit } from "../models/foodDeliveryCashDeposit.model.js";
import {
  registerDeliveryPartner,
  updateDeliveryPartnerProfile,
  updateDeliveryPartnerBankDetails,
  listSupportTicketsByPartner,
  createSupportTicket,
  getSupportTicketByIdAndPartner,
  updateDeliveryPartnerDetails,
  updateDeliveryPartnerProfilePhotoBase64,
  updateDeliveryAvailability,
  getDeliveryPartnerWallet,
  getDeliveryPartnerEarnings,
  getDeliveryPartnerTripHistory,
  getDeliveryPocketDetails,
  getActiveEarningAddonsForPartner,
  deleteDeliveryPartnerAccount,
  resubmitRequestedDocuments,
  getDeliveryOnboardingStatus,
} from "../services/delivery.service.js";
import {
  createDeliveryCashDepositOrder,
  createDeliveryWalletTopupOrder,
  getDeliveryPartnerWalletEnhanced,
  requestDeliveryWithdrawal,
  verifyDeliveryCashDepositPayment,
  verifyDeliveryWalletTopupPayment,
  submitDeliveryManualDeposit,
} from "../services/deliveryFinance.service.js";
import {
  getDeliveryCashLimitSettings,
  getDeliveryEmergencyHelp,
} from "../../admin/services/admin.service.js";
import { DeliveryBonusTransaction } from "../../admin/models/deliveryBonusTransaction.model.js";
import {
  validateDeliveryRegisterDto,
  validateDeliveryProfileUpdateDto,
  validateDeliveryBankDetailsDto,
} from "../validators/delivery.validator.js";
import { sendResponse } from "../../../../utils/response.js";
import { getDeliveryReferralStats } from "../services/deliveryReferral.service.js";

export const registerDeliveryPartnerController = async (req, res, next) => {
  try {
    const phone = String(req.body?.phone || "")
      .replace(/\D/g, "")
      .slice(0, 15);
    if (phone) {
      const { Driver } =
        await import("../../../../core/models/driver.model.js");
      const existing = await Driver.findOne({ phone }).select(
        "status documentsRequested registeredServices authorizedServices",
      );
      if (
        existing?.status === "documents_required" &&
        Array.isArray(existing.documentsRequested) &&
        existing.documentsRequested.length > 0
      ) {
        const { verifyDeliveryDocsResubmitToken } =
          await import("../../../../core/auth/token.util.js");
        try {
          verifyDeliveryDocsResubmitToken(
            req.body?.docsResubmitToken || req.headers["x-docs-resubmit-token"],
            phone,
          );
        } catch (err) {
          const { ValidationError } =
            await import("../../../../core/auth/errors.js");
          throw new ValidationError(
            err?.message ||
              "OTP verification required before re-uploading documents",
          );
        }
        const partner = await resubmitRequestedDocuments(
          existing._id,
          req.files,
        );
        return sendResponse(
          res,
          200,
          "Documents re-uploaded successfully. Pending verification.",
          partner,
        );
      }
    }

    const {
      submitDriverOnboarding,
    } = await import("../../../common/services/driverOnboarding.service.js");

    // Prefer shared module onboarding; fall back to legacy validator path
    // only when no moduleSelections / vehicleConfigurationId provided and
    // classic vehicleType is present.
    const hasModulePayload =
      req.body?.moduleSelections ||
      req.body?.modulesJson ||
      req.body?.vehicleConfigurationId ||
      (req.body?.modules && String(req.body.modules).includes(","));

    if (hasModulePayload || !req.body?.vehicleType) {
      const partner = await submitDriverOnboarding({
        body: req.body,
        files: req.files,
      });
      return sendResponse(
        res,
        201,
        "Driver onboarding submitted successfully",
        partner,
      );
    }

    const validated = validateDeliveryRegisterDto(req.body);
    // Bridge legacy bike/scooter/bicycle into shared submit with food module
    const partner = await submitDriverOnboarding({
      body: {
        ...validated,
        modules: "food",
        vehicleType: validated.vehicleType,
      },
      files: req.files,
    });
    return sendResponse(
      res,
      201,
      "Delivery partner registered successfully",
      partner,
    );
  } catch (error) {
    if (error?.code === 11000) {
      const { ValidationError } =
        await import("../../../../core/auth/errors.js");
      const key = Object.keys(error.keyPattern || {})[0] || "";
      const messages = {
        phone: "Delivery partner with this phone already exists",
        aadharNumber: "This Aadhaar number is already registered",
        drivingLicenseNumber:
          "This driving license number is already registered",
        vehicleNumber: "This vehicle number is already registered",
      };
      return next(
        new ValidationError(messages[key] || "Duplicate record already exists"),
      );
    }
    next(error);
  }
};

export const getDeliveryOnboardingStatusController = async (req, res, next) => {
  try {
    const phone = req.query?.phone || req.body?.phone;
    const {
      getDriverOnboardingByPhone,
    } = await import("../../../common/services/driverOnboarding.service.js");
    const data = await getDriverOnboardingByPhone(phone);
    return sendResponse(res, 200, "Onboarding status fetched", data);
  } catch (error) {
    next(error);
  }
};

export const getDriverOnboardingConfigController = async (req, res, next) => {
  try {
    const {
      getOnboardingConfig,
    } = await import("../../../common/services/driverOnboarding.service.js");
    const data = await getOnboardingConfig();
    return sendResponse(res, 200, "Driver onboarding configuration fetched", data);
  } catch (error) {
    next(error);
  }
};

export const resubmitDriverModulesController = async (req, res, next) => {
  try {
    const {
      resubmitRejectedModules,
    } = await import("../../../common/services/driverOnboarding.service.js");
    let modules = req.body?.modules || req.body?.moduleKeys || [];
    if (typeof modules === "string") {
      try {
        modules = JSON.parse(modules);
      } catch {
        modules = modules.split(",").map((item) => item.trim());
      }
    }
    const data = await resubmitRejectedModules({
      driverId: req.user.userId,
      body: req.body,
      files: req.files,
      modules,
    });
    return sendResponse(res, 200, "Module onboarding resubmitted", data);
  } catch (error) {
    next(error);
  }
};

export const getMyDriverOnboardingController = async (req, res, next) => {
  try {
    const { Driver } =
      await import("../../../../core/models/driver.model.js");
    const {
      serializeDriverOnboarding,
    } = await import("../../../common/services/driverOnboarding.service.js");
    const partner = await Driver.findById(req.user.userId);
    if (!partner) {
      const { NotFoundError } =
        await import("../../../../core/auth/errors.js");
      throw new NotFoundError("Driver not found");
    }
    return sendResponse(
      res,
      200,
      "Driver onboarding profile fetched",
      serializeDriverOnboarding(partner),
    );
  } catch (error) {
    next(error);
  }
};

export const getDriverOnboardingDraftController = async (req, res, next) => {
  try {
    const {
      getDriverOnboardingDraft,
    } = await import("../../../common/services/driverOnboarding.service.js");
    const data = await getDriverOnboardingDraft(req.user.userId);
    return sendResponse(res, 200, "Onboarding draft fetched", data);
  } catch (error) {
    next(error);
  }
};

export const saveDriverOnboardingDraftController = async (req, res, next) => {
  try {
    const {
      saveDriverOnboardingDraft,
    } = await import("../../../common/services/driverOnboarding.service.js");
    const data = await saveDriverOnboardingDraft({
      driverId: req.user.userId,
      body: req.body || {},
      files: req.files || null,
    });
    return sendResponse(res, 200, "Onboarding draft saved", data);
  } catch (error) {
    next(error);
  }
};

export const updateDeliveryPartnerProfileController = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.user?.userId;
    const validated = validateDeliveryProfileUpdateDto(req.body);
    const result = await updateDeliveryPartnerProfile(
      userId,
      validated,
      req.files,
    );
    return sendResponse(res, 200, "Profile updated successfully", result);
  } catch (error) {
    next(error);
  }
};

export const updateDeliveryPartnerDetailsController = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.user?.userId;
    const partner = await updateDeliveryPartnerDetails(userId, req.body || {});
    return sendResponse(res, 200, "Profile updated successfully", { partner });
  } catch (error) {
    next(error);
  }
};

export const updateDeliveryPartnerProfilePhotoBase64Controller = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.user?.userId;
    const partner = await updateDeliveryPartnerProfilePhotoBase64(
      userId,
      req.body || {},
    );
    return sendResponse(res, 200, "Profile photo updated successfully", {
      partner,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDeliveryPartnerBankDetailsController = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.user?.userId;
    const validated = validateDeliveryBankDetailsDto(req.body);
    const partner = await updateDeliveryPartnerBankDetails(
      userId,
      validated,
      req.files,
    );
    const data = {
      bankDetails: {
        accountHolderName: partner.bankAccountHolderName,
        accountNumber: partner.bankAccountNumber,
        ifscCode: partner.bankIfscCode,
        bankName: partner.bankName,
        upiId: partner.upiId,
        upiQrCode: partner.upiQrCode,
      },
      panNumber: partner.panNumber,
    };
    return sendResponse(res, 200, "Bank details updated successfully", data);
  } catch (error) {
    next(error);
  }
};

export const listSupportTicketsController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const tickets = await listSupportTicketsByPartner(deliveryPartnerId);
    return sendResponse(res, 200, "Tickets fetched successfully", { tickets });
  } catch (error) {
    next(error);
  }
};

export const createSupportTicketController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const ticket = await createSupportTicket(deliveryPartnerId, req.body);
    return sendResponse(res, 201, "Ticket created successfully", ticket);
  } catch (error) {
    next(error);
  }
};

export const getSupportTicketByIdController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const ticket = await getSupportTicketByIdAndPartner(
      req.params.id,
      deliveryPartnerId,
    );
    if (!ticket) {
      return res
        .status(404)
        .json({ success: false, message: "Ticket not found" });
    }
    return sendResponse(res, 200, "Ticket fetched successfully", ticket);
  } catch (error) {
    next(error);
  }
};

export const updateAvailabilityController = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const data = await updateDeliveryAvailability(userId, req.body || {});
    return sendResponse(res, 200, "Availability updated successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getWalletController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const requestedTypeRaw = String(req.query?.type || "")
      .trim()
      .toLowerCase();
    const rawLimit = Number.parseInt(String(req.query?.limit || ""), 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;

    const normalizeWalletTransaction = (tx) => ({
      ...tx,
      id: tx?.id || tx?._id,
      _id: tx?._id || tx?.id,
      amount: Number(tx?.amount) || 0,
      date: tx?.date || tx?.createdAt,
      createdAt: tx?.createdAt || tx?.date,
    });

    if (
      requestedTypeRaw === "bonus" ||
      requestedTypeRaw === "deposit" ||
      requestedTypeRaw === "withdrawal" ||
      requestedTypeRaw === "deduction"
    ) {
      if (
        !deliveryPartnerId ||
        !mongoose.Types.ObjectId.isValid(deliveryPartnerId)
      ) {
        return sendResponse(res, 200, "Wallet fetched successfully", {
          wallet: { transactions: [] },
        });
      }

      const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);

      if (requestedTypeRaw === "bonus") {
        const bonusList = await DeliveryBonusTransaction.find({
          deliveryPartnerId,
        })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        wallet.transactions = (bonusList || []).map((b) => ({
          id: b._id,
          _id: b._id,
          type: "bonus",
          amount: b.amount || 0,
          status: "Completed",
          date: b.createdAt,
          createdAt: b.createdAt,
          description: b.reference || "Bonus",
          transactionId: b.transactionId,
        }));
      } else if (requestedTypeRaw === "deposit") {
        const partnerObjId = new mongoose.Types.ObjectId(deliveryPartnerId);
        const deposits = await FoodDeliveryCashDeposit.find({
          deliveryPartnerId: partnerObjId,
          status: { $in: ["Completed", "Pending", "Failed"] },
        })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        wallet.transactions = deposits.map((d) => ({
          id: d._id,
          _id: d._id,
          type: "deposit",
          amount: d.amount || 0,
          status:
            d.status === "Completed"
              ? "Completed"
              : d.status === "Failed"
                ? "Rejected"
                : "Pending",
          rejectionReason:
            d.status === "Failed" ? d.adminNote || "No reason specified" : "",
          date: d.createdAt,
          createdAt: d.createdAt,
          description: "Cash limit settlement",
        }));
      } else if (requestedTypeRaw === "withdrawal") {
        const withdrawals = await mongoose
          .model("FoodDeliveryWithdrawal")
          .find({
            deliveryPartnerId,
          })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        wallet.transactions = withdrawals.map((w) => ({
          id: w._id,
          _id: w._id,
          type:
            w.status === "denied" || w.status === "rejected"
              ? "rejection"
              : "withdrawal",
          amount: w.amount || 0,
          status:
            w.status === "pending"
              ? "Pending"
              : w.status === "approved"
                ? "Completed"
                : "Rejected",
          date: w.createdAt,
          createdAt: w.createdAt,
          description: `Withdrawal Request - ${w.paymentMethod}`,
        }));
      } else if (requestedTypeRaw === "deduction") {
        // Return both deposits and withdrawals for deduction statement
        const [deposits, withdrawals] = await Promise.all([
          mongoose
            .model("FoodDeliveryCashDeposit")
            .find({ deliveryPartnerId, status: "Completed" })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean(),
          mongoose
            .model("FoodDeliveryWithdrawal")
            .find({ deliveryPartnerId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean(),
        ]);

        const txs = [
          ...deposits.map((d) => ({
            id: d._id,
            _id: d._id,
            type: "deposit",
            amount: d.amount,
            status: d.status,
            createdAt: d.createdAt,
            description: "Limit settlement",
          })),
          ...withdrawals.map((w) => ({
            id: w._id,
            _id: w._id,
            type: "withdrawal",
            amount: w.amount,
            status: w.status,
            createdAt: w.createdAt,
            description: `Withdrawal - ${w.paymentMethod}`,
          })),
        ]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, limit);

        wallet.transactions = txs;
      }

      const pendingManualDeposit = await FoodDeliveryCashDeposit.findOne({
        deliveryPartnerId: new mongoose.Types.ObjectId(deliveryPartnerId),
        status: "Pending",
        depositType: {
          $in: ["admin_bank", "admin_upi", "admin_qr"],
        },
      }).lean();

      wallet.pendingManualDeposit = pendingManualDeposit
        ? {
            id: pendingManualDeposit._id,
            amount: Number(pendingManualDeposit.amount) || 0,
            depositType: pendingManualDeposit.depositType,
            status: pendingManualDeposit.status,
            createdAt: pendingManualDeposit.createdAt,
          }
        : null;

      return sendResponse(res, 200, "Wallet fetched successfully", { wallet });
    }

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);

    const pendingManualDeposit = await FoodDeliveryCashDeposit.findOne({
      deliveryPartnerId: new mongoose.Types.ObjectId(deliveryPartnerId),
      status: "Pending",
      depositType: { $in: ["admin_bank", "admin_upi", "admin_qr"] },
    }).lean();

    wallet.pendingManualDeposit = pendingManualDeposit
      ? {
          id: pendingManualDeposit._id,
          amount: Number(pendingManualDeposit.amount) || 0,
          depositType: pendingManualDeposit.depositType,
          status: pendingManualDeposit.status,
          createdAt: pendingManualDeposit.createdAt,
        }
      : null;

    return sendResponse(res, 200, "Wallet fetched successfully", { wallet });
  } catch (error) {
    next(error);
  }
};

export const createWithdrawalRequestController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const result = await requestDeliveryWithdrawal(
      deliveryPartnerId,
      req.body || {},
    );
    return sendResponse(res, 201, "Withdrawal request submitted successfully", {
      withdrawal: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getEarningsController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const data = await getDeliveryPartnerEarnings(
      deliveryPartnerId,
      req.query || {},
    );
    return sendResponse(res, 200, "Earnings fetched successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getActiveEarningAddonsController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const data = await getActiveEarningAddonsForPartner(deliveryPartnerId);
    return sendResponse(
      res,
      200,
      "Active earning addons fetched successfully",
      data,
    );
  } catch (error) {
    next(error);
  }
};

export const createCashDepositOrderController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const amount = req.body?.amount;
    const data = await createDeliveryCashDepositOrder(
      deliveryPartnerId,
      amount,
    );
    return sendResponse(
      res,
      201,
      "Cash deposit order created successfully",
      data,
    );
  } catch (error) {
    next(error);
  }
};

export const verifyCashDepositPaymentController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const data = await verifyDeliveryCashDepositPayment(deliveryPartnerId, {
      razorpayOrderId: req.body?.razorpay_order_id,
      razorpayPaymentId: req.body?.razorpay_payment_id,
      razorpaySignature: req.body?.razorpay_signature,
      amount: req.body?.amount,
    });
    return sendResponse(res, 200, "Cash deposit verified successfully", data);
  } catch (error) {
    next(error);
  }
};

export const createWalletTopupOrderController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const data = await createDeliveryWalletTopupOrder(
      deliveryPartnerId,
      req.body?.amount,
    );
    return sendResponse(
      res,
      201,
      "Wallet top-up order created successfully",
      data,
    );
  } catch (error) {
    next(error);
  }
};

export const verifyWalletTopupPaymentController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const data = await verifyDeliveryWalletTopupPayment(deliveryPartnerId, {
      razorpayOrderId: req.body?.razorpay_order_id,
      razorpayPaymentId: req.body?.razorpay_payment_id,
      razorpaySignature: req.body?.razorpay_signature,
      amount: req.body?.amount,
    });
    return sendResponse(res, 200, "Wallet deposit verified successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getTripHistoryController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const data = await getDeliveryPartnerTripHistory(
      deliveryPartnerId,
      req.query || {},
    );
    return sendResponse(res, 200, "Trip history fetched successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getPocketDetailsController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const data = await getDeliveryPocketDetails(
      deliveryPartnerId,
      req.query || {},
    );
    return sendResponse(res, 200, "Pocket details fetched successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getEmergencyHelpController = async (req, res, next) => {
  try {
    const data = await getDeliveryEmergencyHelp();
    return sendResponse(res, 200, "Emergency help fetched successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getCashLimitController = async (req, res, next) => {
  try {
    const data = await getDeliveryCashLimitSettings();
    return sendResponse(res, 200, "Cash limit fetched successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getDeliveryReferralStatsController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const stats = await getDeliveryReferralStats(deliveryPartnerId);
    return sendResponse(res, 200, "Referral stats fetched successfully", {
      stats,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteDeliveryPartnerAccountController = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.user?.userId;
    const result = await deleteDeliveryPartnerAccount(userId);
    return sendResponse(res, 200, "Account deleted successfully", result);
  } catch (error) {
    next(error);
  }
};

export const submitDeliveryManualDepositController = async (req, res, next) => {
  try {
    const deliveryPartnerId = req.user?.userId;
    const payload = req.body;
    const file = req.file; // Uploaded receipt/proof
    const data = await submitDeliveryManualDeposit(
      deliveryPartnerId,
      payload,
      file,
    );
    return sendResponse(
      res,
      201,
      "Cash deposit request submitted successfully",
      data,
    );
  } catch (error) {
    next(error);
  }
};

