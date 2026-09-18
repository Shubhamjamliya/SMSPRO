import { ValidationError } from '../../../../core/auth/errors.js';
import { QuickSellerWithdrawalSettings } from '../models/sellerWithdrawalSettings.model.js';

const DEFAULT_SETTINGS = {
  minWithdrawalAmount: 100,
  maxWithdrawalAmount: 0,
  isActive: true,
};

const normalizeAmount = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

export function serializeSellerWithdrawalSettings(doc = {}) {
  const minWithdrawalAmount = normalizeAmount(
    doc.minWithdrawalAmount,
    DEFAULT_SETTINGS.minWithdrawalAmount,
  );
  const maxWithdrawalAmount = normalizeAmount(
    doc.maxWithdrawalAmount,
    DEFAULT_SETTINGS.maxWithdrawalAmount,
  );

  return {
    minWithdrawalAmount,
    maxWithdrawalAmount,
    minAmount: minWithdrawalAmount,
    maxAmount: maxWithdrawalAmount,
  };
}

export async function getSellerWithdrawalSettings() {
  const doc = await QuickSellerWithdrawalSettings.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  return serializeSellerWithdrawalSettings(doc || DEFAULT_SETTINGS);
}

export function validateWithdrawalAmountAgainstLimits(amount, limits = {}) {
  const parsedAmount = normalizeAmount(amount);
  const minAmount = normalizeAmount(
    limits.minWithdrawalAmount ?? limits.minAmount,
    DEFAULT_SETTINGS.minWithdrawalAmount,
  );
  const maxAmount = normalizeAmount(
    limits.maxWithdrawalAmount ?? limits.maxAmount,
    DEFAULT_SETTINGS.maxWithdrawalAmount,
  );

  if (!parsedAmount) {
    throw new ValidationError('Enter a valid withdrawal amount');
  }
  if (parsedAmount < minAmount) {
    throw new ValidationError(
      `Minimum withdrawal amount is ₹${minAmount.toLocaleString('en-IN')}`,
    );
  }
  if (maxAmount > 0 && parsedAmount > maxAmount) {
    throw new ValidationError(
      `Maximum withdrawal amount is ₹${maxAmount.toLocaleString('en-IN')}`,
    );
  }

  return parsedAmount;
}

export async function upsertSellerWithdrawalSettings(body = {}) {
  const nextMin =
    body.minWithdrawalAmount !== undefined
      ? body.minWithdrawalAmount
      : body.minAmount;
  const nextMax =
    body.maxWithdrawalAmount !== undefined
      ? body.maxWithdrawalAmount
      : body.maxAmount;

  const minWithdrawalAmount =
    nextMin !== undefined
      ? normalizeAmount(nextMin, DEFAULT_SETTINGS.minWithdrawalAmount)
      : undefined;
  const maxWithdrawalAmount =
    nextMax !== undefined
      ? normalizeAmount(nextMax, DEFAULT_SETTINGS.maxWithdrawalAmount)
      : undefined;

  const existing = await QuickSellerWithdrawalSettings.findOne({ isActive: true }).sort(
    { createdAt: -1 },
  );

  const resolvedMin =
    minWithdrawalAmount !== undefined
      ? minWithdrawalAmount
      : normalizeAmount(existing?.minWithdrawalAmount, DEFAULT_SETTINGS.minWithdrawalAmount);
  const resolvedMax =
    maxWithdrawalAmount !== undefined
      ? maxWithdrawalAmount
      : normalizeAmount(existing?.maxWithdrawalAmount, DEFAULT_SETTINGS.maxWithdrawalAmount);

  if (resolvedMax > 0 && resolvedMax < resolvedMin) {
    throw new ValidationError('Maximum amount must be greater than or equal to minimum amount');
  }

  if (existing) {
    if (minWithdrawalAmount !== undefined) {
      existing.minWithdrawalAmount = resolvedMin;
    }
    if (maxWithdrawalAmount !== undefined) {
      existing.maxWithdrawalAmount = resolvedMax;
    }
    await existing.save();
    return serializeSellerWithdrawalSettings(existing.toObject());
  }

  const created = await QuickSellerWithdrawalSettings.create({
    minWithdrawalAmount: resolvedMin,
    maxWithdrawalAmount: resolvedMax,
    isActive: true,
  });
  return serializeSellerWithdrawalSettings(created.toObject());
}
