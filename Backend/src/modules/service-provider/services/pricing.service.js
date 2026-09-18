import { ValidationError } from '../../../core/auth/errors.js';
import { ServiceProviderFeeSettings } from '../models/feeSettings.model.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const getFeeSettings = async () => {
  let doc = await ServiceProviderFeeSettings.findOne();
  if (!doc) doc = await ServiceProviderFeeSettings.create({});
  return doc;
};

export const updateFeeSettings = async (body = {}, admin = null) => {
  const platformFeeType = body.platformFeeType === 'percent' ? 'percent' : 'fixed';
  const platformFeeValue = Number(body.platformFeeValue);
  const taxPercent = Number(body.taxPercent);
  if (!Number.isFinite(platformFeeValue) || platformFeeValue < 0) {
    throw new ValidationError('Enter a valid platform fee');
  }
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
    throw new ValidationError('Tax percent must be between 0 and 100');
  }

  const doc = await getFeeSettings();
  doc.platformFeeType = platformFeeType;
  doc.platformFeeValue = platformFeeValue;
  doc.taxPercent = taxPercent;
  doc.updatedBy = admin?._id || admin?.id || null;
  await doc.save();
  return doc.toObject();
};

/**
 * The single place booking price math happens — every caller (slot quote, booking
 * creation, payment amount) goes through this so there's no duplicated pricing logic
 * anywhere. Tax is applied on (adminPrice + platformFee), matching how GST is charged
 * on a subtotal-plus-fee basis elsewhere in this app (Food's order pricing).
 */
export const computeBookingPricing = async (adminPrice) => {
  const settings = await getFeeSettings();
  const base = Number(adminPrice) || 0;

  const platformFee = settings.platformFeeType === 'percent'
    ? round2((base * Number(settings.platformFeeValue || 0)) / 100)
    : round2(Number(settings.platformFeeValue || 0));

  const taxableAmount = base + platformFee;
  const taxAmount = round2((taxableAmount * Number(settings.taxPercent || 0)) / 100);
  const totalAmount = round2(base + platformFee + taxAmount);

  return { adminPrice: round2(base), platformFee, taxAmount, totalAmount };
};
