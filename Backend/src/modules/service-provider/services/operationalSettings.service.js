import { ValidationError } from '../../../core/auth/errors.js';
import { ServiceProviderOperationalSettings } from '../models/operationalSettings.model.js';

export const getOperationalSettings = async () => {
  let doc = await ServiceProviderOperationalSettings.findOne();
  if (!doc) doc = await ServiceProviderOperationalSettings.create({});
  return doc;
};

export const updateOperationalSettings = async (body = {}, admin = null) => {
  const requestTimeoutSeconds = Number(body.requestTimeoutSeconds);
  const freeCancelBeforeMinutes = Number(body.freeCancelBeforeMinutes);
  const cancellationChargeType = body.cancellationChargeType === 'fixed' ? 'fixed' : 'percent';
  const cancellationChargeValue = Number(body.cancellationChargeValue);
  const maxProviderCancellations = Number(body.maxProviderCancellations);

  if (!Number.isFinite(requestTimeoutSeconds) || requestTimeoutSeconds < 15 || requestTimeoutSeconds > 900) {
    throw new ValidationError('Request timeout must be between 15 and 900 seconds');
  }
  if (!Number.isFinite(freeCancelBeforeMinutes) || freeCancelBeforeMinutes < 0) {
    throw new ValidationError('Enter a valid free-cancellation window');
  }
  if (!Number.isFinite(cancellationChargeValue) || cancellationChargeValue < 0) {
    throw new ValidationError('Enter a valid cancellation charge');
  }
  if (!Number.isFinite(maxProviderCancellations) || maxProviderCancellations < 1) {
    throw new ValidationError('Enter a valid provider cancellation limit');
  }

  const doc = await getOperationalSettings();
  doc.requestTimeoutSeconds = requestTimeoutSeconds;
  doc.freeCancelBeforeMinutes = freeCancelBeforeMinutes;
  doc.cancellationChargeType = cancellationChargeType;
  doc.cancellationChargeValue = cancellationChargeValue;
  doc.maxProviderCancellations = maxProviderCancellations;
  doc.updatedBy = admin?._id || admin?.id || null;
  await doc.save();
  return doc.toObject();
};
