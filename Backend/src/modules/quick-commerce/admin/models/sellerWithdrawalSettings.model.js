import mongoose from 'mongoose';

const sellerWithdrawalSettingsSchema = new mongoose.Schema(
  {
    minWithdrawalAmount: { type: Number, default: 100, min: 0 },
    /** 0 = no upper cap (only limited by available balance) */
    maxWithdrawalAmount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { collection: 'quick_seller_withdrawal_settings', timestamps: true },
);

sellerWithdrawalSettingsSchema.index({ isActive: 1, createdAt: -1 });

export const QuickSellerWithdrawalSettings = mongoose.model(
  'QuickSellerWithdrawalSettings',
  sellerWithdrawalSettingsSchema,
  'quick_seller_withdrawal_settings',
);
