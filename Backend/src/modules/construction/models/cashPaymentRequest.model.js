import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const CASH_PAYMENT_STATUSES = [
  'pending_contractor_approval',
  'approved',
  'rejected',
  'cancelled',
];

const cashPaymentRequestSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionProject',
      required: true,
      index: true,
    },
    stageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectStage',
      default: null,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    commissionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    commissionPercent: {
      type: Number,
      default: 0,
      min: 0,
    },

    walletTransactionReference: {
      type: String,
      trim: true,
      default: '',
    },

    status: {
      type: String,
      enum: CASH_PAYMENT_STATUSES,
      default: 'pending_contractor_approval',
      index: true,
    },

    contractorApprovedAt: {
      type: Date,
      default: null,
    },
    contractorApprovedBy: {
      type: actionPerformerSchema,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
  },
  {
    collection: 'construction_cash_payments',
    timestamps: true,
  },
);

cashPaymentRequestSchema.index({ projectId: 1, status: 1, createdAt: -1 });
cashPaymentRequestSchema.index({ contractorId: 1, status: 1, createdAt: -1 });

export const CashPaymentRequest =
  mongoose.models.CashPaymentRequest ||
  mongoose.model('CashPaymentRequest', cashPaymentRequestSchema, 'construction_cash_payments');

export const CASH_PAYMENT_STATUS_VALUES = CASH_PAYMENT_STATUSES;
