import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { getAvailableBalance } from '../../../core/wallet/hold.service.js';
import { debitWallet } from '../../../core/payments/wallet.service.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectStage } from '../models/projectStage.model.js';
import { CashPaymentRequest } from '../models/cashPaymentRequest.model.js';
import { getSettings } from './settings.service.js';
import { logger } from '../../../utils/logger.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const CASH_PAYMENT_MIN_THRESHOLD = 100000; // 1 Lakh threshold

/**
 * Customer raises a Cash Payment Request for a project or stage.
 *
 * Rules:
 * 1. Project agreedValue MUST be >= 100,000 (1 Lakh).
 * 2. System checks customer wallet balance for Admin Commission Fee (e.g. 3%).
 * 3. Deducts commission fee from customer wallet to Admin account.
 * 4. Creates CashPaymentRequest in status 'pending_contractor_approval'.
 */
export const createCashPaymentRequest = async (customerId, { projectId, stageId = null, amount, notes = '' }) => {
  const project = await ConstructionProject.findOne({ _id: projectId, customerId, isDeleted: { $ne: true } });
  if (!project) throw new ValidationError('Project not found');
  if (['cancelled', 'closed'].includes(project.status)) {
    throw new ValidationError('This project is closed');
  }

  // 1. Threshold Validation (Must be >= 1 Lakh)
  if (project.agreedValue < CASH_PAYMENT_MIN_THRESHOLD) {
    throw new ValidationError(
      `Cash payment is only available for projects with an agreed value of ₹${CASH_PAYMENT_MIN_THRESHOLD.toLocaleString('en-IN')} (1 Lakh) or more. For projects under 1 Lakh, please use online payment.`,
    );
  }

  const requestedAmount = round2(amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new ValidationError('Enter a valid cash payment amount greater than zero');
  }

  // Calculate required commission
  const settings = await getSettings();
  const commSettings = settings.commission || {};
  const commPercent = Number(commSettings.value) || 3; // Default 3% commission
  const requiredCommission = round2((requestedAmount * commPercent) / 100);

  // 2. Wallet Balance Check for Commission
  const wallet = await getAvailableBalance(customerId);
  if (wallet.availableBalance < requiredCommission) {
    throw new ValidationError(
      `Insufficient wallet balance to cover the Cash Payment Admin Commission (₹${requiredCommission.toLocaleString('en-IN')}). You have ₹${wallet.availableBalance.toLocaleString('en-IN')} available. Please top-up your wallet first.`,
    );
  }

  // 3. Deduct commission from customer's wallet
  const txRef = `cash_comm_${project._id}_${Date.now()}`;
  try {
    await debitWallet({
      entityType: 'user',
      entityId: customerId,
      amount: requiredCommission,
      description: `Cash Payment Admin Commission for ${project.projectNumber}`,
      category: 'commission',
      module: 'construction',
      metadata: { projectId: project._id, projectNumber: project.projectNumber },
    });
  } catch (err) {
    logger.error(`[construction] Failed to deduct cash commission for user ${customerId}: ${err.message}`);
    throw new ValidationError(`Wallet transaction failed: ${err.message}`);
  }

  // 4. Create Cash Payment Request Record
  const cashRequest = await CashPaymentRequest.create({
    projectId: project._id,
    stageId: stageId || null,
    customerId,
    contractorId: project.contractorId,
    amount: requestedAmount,
    commissionAmount: requiredCommission,
    commissionPercent: commPercent,
    walletTransactionReference: txRef,
    status: 'pending_contractor_approval',
    notes,
  });

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'cash_payment.requested',
    after: {
      requestId: cashRequest._id,
      amount: requestedAmount,
      commissionAmount: requiredCommission,
      contractorId: String(project.contractorId),
    },
  });

  return {
    cashRequest: cashRequest.toObject(),
    commissionDeducted: requiredCommission,
    message: 'Cash payment request raised successfully. Pending contractor confirmation of cash receipt.',
  };
};

/**
 * Contractor approves cash receipt for a Cash Payment Request.
 */
export const approveCashPaymentByContractor = async (contractorId, requestId, performer = null) => {
  const cashRequest = await CashPaymentRequest.findOne({ _id: requestId, contractorId });
  if (!cashRequest) throw new ValidationError('Cash payment request not found');
  if (cashRequest.status !== 'pending_contractor_approval') {
    throw new ValidationError(`This request is already ${cashRequest.status}`);
  }

  const project = await ConstructionProject.findOne({ _id: cashRequest.projectId, isDeleted: { $ne: true } });
  if (!project) throw new ValidationError('Project not found');

  // Mark request approved
  cashRequest.status = 'approved';
  cashRequest.contractorApprovedAt = new Date();
  cashRequest.contractorApprovedBy = performer;
  await cashRequest.save();

  // Update Project Funded Amount
  project.fundedAmount = round2(project.fundedAmount + cashRequest.amount);

  // If tied to a stage, update stage status
  if (cashRequest.stageId) {
    const stage = await ProjectStage.findById(cashRequest.stageId);
    if (stage) {
      stage.status = 'payment_released';
      stage.releasedAt = new Date();
      stage.releasedAmount = Number(stage.amount) || Number(cashRequest.amount) || 0;
      stage.statusHistory.push({
        status: 'payment_released',
        reason: 'Cash payment approved by contractor',
        at: new Date(),
      });
      await stage.save();
    }
  }

  // Recalculate project.releasedAmount based on stages that have actually been paid/released
  const releasedStages = await ProjectStage.find({ projectId: project._id, status: 'payment_released' }).select('amount releasedAmount').lean();
  const totalReleasedFromStages = releasedStages.reduce((sum, s) => sum + (Number(s.releasedAmount) || Number(s.amount) || 0), 0);
  project.releasedAmount = round2(totalReleasedFromStages);

  if (project.status === 'awaiting_funding' && project.fundedAmount > 0) {
    project.status = 'active';
    project.startedAt = project.startedAt || new Date();
  }
  project.lastActivityAt = new Date();
  await project.save();

  await recordAudit({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    action: 'cash_payment.approved',
    after: {
      requestId: cashRequest._id,
      amount: cashRequest.amount,
      fundedTotal: project.fundedAmount,
    },
  });

  return {
    cashRequest: cashRequest.toObject(),
    project: project.toObject(),
  };
};

/**
 * Contractor rejects cash receipt for a Cash Payment Request.
 */
export const rejectCashPaymentByContractor = async (contractorId, requestId, reason = '') => {
  const cashRequest = await CashPaymentRequest.findOne({ _id: requestId, contractorId });
  if (!cashRequest) throw new ValidationError('Cash payment request not found');
  if (cashRequest.status !== 'pending_contractor_approval') {
    throw new ValidationError(`This request is already ${cashRequest.status}`);
  }

  cashRequest.status = 'rejected';
  cashRequest.rejectionReason = String(reason || '').trim();
  await cashRequest.save();

  return cashRequest.toObject();
};

/**
 * List Cash Payment Requests for Customer / Contractor / Admin.
 */
export const listCashPaymentRequests = async (filter = {}) => {
  return CashPaymentRequest.find(filter)
    .populate('projectId', 'projectNumber title agreedValue')
    .populate('customerId', 'name email phone')
    .populate('contractorId', 'businessName name phone')
    .populate('stageId', 'name sequence amount')
    .sort({ createdAt: -1 })
    .lean();
};
