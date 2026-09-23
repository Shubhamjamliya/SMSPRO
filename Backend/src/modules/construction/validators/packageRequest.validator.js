import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  OFFER_DECLINE_REASONS,
  PACKAGE_REQUEST_OFFICE_STATUSES,
  START_WINDOWS,
} from '../models/packageRequest.model.js';
import { cleanPhone, tidy } from './material.validator.js';

const firstIssue = (result) => {
  const issue = result.error.errors[0];
  const where = issue.path.length && typeof issue.path[0] === 'string'
    ? `${issue.path.join('.')}: `
    : '';
  return `${where}${issue.message}`;
};

/**
 * What the customer sends: WHICH package or budget-friendly service, and the site
 * details. Never a price, a fee or a total — the server looks the source up and
 * works those out itself, so a tampered request cannot understate what it costs or
 * waive the visiting fee. Exactly one of `packageId` / `serviceId` is expected —
 * the two catalogues are booked through this same form.
 */
const objectId = (message) => z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), message);

const requestSchema = z.object({
  packageId: objectId('Choose a package').optional(),
  serviceId: objectId('Choose a service').optional(),
  contact: z.object({
    name: z.string({ required_error: 'Please enter your name' }).trim().min(1, 'Please enter your name').max(120),
    phone: z.string({ required_error: 'Please enter a phone number' }),
  }),
  city: z.string({ required_error: 'Please enter the site city' }).trim().min(1, 'Please enter the site city').max(120),
  area: z.string().max(120).optional(),
  address: z.string().max(400).optional(),
  landmark: z.string().max(200).optional(),
  state: z.string().max(80).optional(),
  pincode: z.string().max(12).optional(),
  /** The map pin. Optional so a customer whose map will not load can still book by typing the address. */
  location: z
    .object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    })
    .nullish(),
  areaPerFloor: z.coerce
    .number({ invalid_type_error: 'Enter the built-up area' })
    .min(100, 'The built-up area must be at least 100 sq.ft')
    .max(100000, 'That built-up area looks too large'),
  floors: z.coerce
    .number({ invalid_type_error: 'Choose the number of floors' })
    .int('Choose the number of floors')
    .min(1, 'Choose the number of floors')
    .max(10, 'Up to 10 floors'),
  startWindow: z.enum(START_WINDOWS).optional(),
  notes: z.string().max(1000).optional(),
});

export const validatePackageRequestDto = (body = {}) => {
  const result = requestSchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const d = result.data;
  if (!d.packageId && !d.serviceId) throw new ValidationError('Choose a package or a service');
  if (d.packageId && d.serviceId) throw new ValidationError('Choose either a package or a service, not both');

  const phone = cleanPhone(d.contact.phone);
  if (phone.digits.length < 7 || phone.digits.length > 15) {
    throw new ValidationError('Please enter a valid phone number');
  }

  return {
    packageId: d.packageId,
    serviceId: d.serviceId,
    contact: { name: tidy(d.contact.name), phone: phone.value },
    city: tidy(d.city),
    area: tidy(d.area),
    address: tidy(d.address),
    landmark: tidy(d.landmark),
    state: tidy(d.state),
    pincode: tidy(d.pincode),
    location: d.location ? { lat: d.location.lat, lng: d.location.lng } : null,
    areaPerFloor: d.areaPerFloor,
    floors: d.floors,
    startWindow: d.startWindow || 'Next 30 Days',
    notes: d.notes?.trim() || '',
  };
};

/** Razorpay's three checkout fields, after a payment. */
export const validatePaymentVerificationDto = (body = {}) => {
  const schema = z.object({
    razorpayOrderId: z.string({ required_error: 'Payment details are missing' }).trim().min(1, 'Payment details are missing'),
    razorpayPaymentId: z.string({ required_error: 'Payment details are missing' }).trim().min(1, 'Payment details are missing'),
    razorpaySignature: z.string({ required_error: 'Payment details are missing' }).trim().min(1, 'Payment details are missing'),
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return result.data;
};

export const validatePackageRequestStatusDto = (body = {}) => {
  const schema = z.object({
    status: z.enum(PACKAGE_REQUEST_OFFICE_STATUSES, {
      errorMap: () => ({ message: `Status must be one of: ${PACKAGE_REQUEST_OFFICE_STATUSES.join(', ')}` }),
    }),
    adminNote: z.string().max(1000).optional(),
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return {
    status: result.data.status,
    adminNote: result.data.adminNote === undefined ? undefined : result.data.adminNote.trim(),
  };
};

export const validateOfferDeclineDto = (body = {}) => {
  const schema = z.object({
    reason: z.enum(OFFER_DECLINE_REASONS).optional(),
    note: z.string().max(500).optional(),
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return { reason: result.data.reason || 'other', note: result.data.note?.trim() || '' };
};

export const validateAssignDto = (body = {}) => {
  const schema = z.object({
    contractorId: z
      .string({ required_error: 'Choose a contractor' })
      .refine((v) => mongoose.Types.ObjectId.isValid(v), 'Choose a contractor'),
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return result.data;
};

export const validateRefundDto = (body = {}) => {
  const schema = z.object({ reason: z.string().trim().min(3, 'Give a short reason for the refund').max(300) });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return result.data;
};
