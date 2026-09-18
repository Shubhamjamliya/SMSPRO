import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Invalid id');

/** Step 1 — Basic information */
const step1Schema = z.object({
  ownerName: z.string().min(2, 'Full name is required').max(120),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  profileImage: z.string().max(1000).optional().or(z.literal('')),
  /** The one admin-created active zone this provider serves. Existence + active status
   *  are re-checked against the DB in submitOnboarding (assertActiveZones) — this only
   *  validates shape. */
  zoneId: z.string({ required_error: 'Select your service zone' })
    .min(1, 'Select your service zone')
    .refine((v) => mongoose.Types.ObjectId.isValid(v), 'Select a valid service zone'),
});

export const validateStep1Dto = (body = {}) => {
  const result = step1Schema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  return {
    ownerName: result.data.ownerName.trim(),
    email: result.data.email?.trim().toLowerCase() || '',
    profileImage: result.data.profileImage || '',
    zoneId: result.data.zoneId,
  };
};

/** Step 2 — Professional information */
const step2Schema = z.object({
  experience: z.string().max(120).optional().or(z.literal('')),
  skills: z.array(z.string().min(1).max(80)).max(30).optional(),
  about: z.string().max(2000).optional().or(z.literal('')),
});

export const validateStep2Dto = (body = {}) => {
  const result = step2Schema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  return {
    experience: result.data.experience?.trim() || '',
    skills: (result.data.skills || []).map((s) => s.trim()).filter(Boolean),
    about: result.data.about?.trim() || '',
  };
};

/** Step 3 — Documents/KYC: PAN + Aadhaar are structured (number + image), same as
 *  Bike Rent Vendor onboarding; anything else stays a generic supplementary upload. */
const step3DocumentSchema = z.object({
  documentType: z.enum(['address_proof', 'other']),
  label: z.string().max(120).optional().or(z.literal('')),
  documentUrl: z.string().min(1, 'Document URL is required').max(1000),
});

const step3Schema = z.object({
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i, 'Enter a valid PAN, e.g. ABCDE1234F'),
  panImage: z.string().min(1, 'Upload your PAN document').max(1000),
  aadhaarNumber: z.string().regex(/^\d{12}$/, 'Aadhaar must be exactly 12 digits'),
  aadhaarImage: z.string().min(1, 'Upload your Aadhaar document').max(1000),
  documents: z.array(step3DocumentSchema).optional().default([]),
});

export const validateStep3Dto = (body = {}) => {
  const result = step3Schema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  return {
    panNumber: result.data.panNumber.trim().toUpperCase(),
    panImage: result.data.panImage,
    aadhaarNumber: result.data.aadhaarNumber.replace(/\s/g, ''),
    aadhaarImage: result.data.aadhaarImage,
    documents: result.data.documents,
  };
};

/** Step 4 — Bank / payout details */
const BANK_ACCOUNT_TYPES = ['savings', 'current', 'other'];

const step4Schema = z.object({
  bankName: z.string().max(120).optional().or(z.literal('')),
  accountHolderName: z.string().min(1, 'Account holder name is required').max(120),
  accountNumber: z.string().min(1, 'Account number is required').max(40),
  ifscCode: z.string().min(1, 'IFSC code is required').max(20),
  accountType: z.enum(BANK_ACCOUNT_TYPES).optional(),
  upiId: z.string().max(80).optional().or(z.literal('')),
});

export const validateStep4Dto = (body = {}) => {
  const result = step4Schema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  return {
    bankName: result.data.bankName?.trim() || '',
    accountHolderName: result.data.accountHolderName.trim(),
    accountNumber: result.data.accountNumber.trim(),
    ifscCode: result.data.ifscCode.trim().toUpperCase(),
    accountType: result.data.accountType || 'savings',
    upiId: result.data.upiId?.trim() || '',
  };
};

/** Step 5 — Category & Services: one category, at least one service from it, each with
 *  the provider's own price. Mirrors providerServicesBodySchema's per-service shape
 *  (catalog.validator.js) but — unlike that post-onboarding endpoint, which allows an
 *  empty list — onboarding can't be submitted with zero services selected. */
const step5Schema = z.object({
  categoryId: z.string({ required_error: 'Select a category' })
    .min(1, 'Select a category')
    .refine((v) => mongoose.Types.ObjectId.isValid(v), 'Select a valid category'),
  services: z.array(z.object({
    serviceId: objectId,
    price: z.coerce
      .number({ invalid_type_error: 'Enter a valid price' })
      .positive('Enter your price for each selected service (must be greater than ₹0)'),
  })).min(1, 'Select at least one service'),
});

/** Full onboarding submit — one combined payload (basic + professional + KYC + bank +
 *  category/services), same one-shot-submit shape as Bike Rent Vendor's registration.
 *  Reuses the per-section schemas above via merge so the field-level rules stay defined
 *  in exactly one place. */
const fullOnboardingSchema = step1Schema
  .merge(step2Schema)
  .merge(step3Schema)
  .merge(step4Schema)
  .merge(step5Schema);

export const validateFullOnboardingDto = (body = {}) => {
  const result = fullOnboardingSchema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const d = result.data;
  return {
    ownerName: d.ownerName.trim(),
    email: d.email?.trim().toLowerCase() || '',
    profileImage: d.profileImage || '',
    zoneId: d.zoneId,
    experience: d.experience?.trim() || '',
    skills: (d.skills || []).map((s) => s.trim()).filter(Boolean),
    about: d.about?.trim() || '',
    panNumber: d.panNumber.trim().toUpperCase(),
    panImage: d.panImage,
    aadhaarNumber: d.aadhaarNumber.replace(/\s/g, ''),
    aadhaarImage: d.aadhaarImage,
    documents: d.documents,
    bankName: d.bankName?.trim() || '',
    accountHolderName: d.accountHolderName.trim(),
    accountNumber: d.accountNumber.trim(),
    ifscCode: d.ifscCode.trim().toUpperCase(),
    accountType: d.accountType || 'savings',
    upiId: d.upiId?.trim() || '',
    categoryId: d.categoryId,
    services: d.services,
  };
};

/** Admin-side "Add Service Provider" — identical field rules to self-registration
 *  (reuses fullOnboardingSchema directly, so the two flows can never drift apart),
 *  plus a phone number since there's no OTP session to source it from. */
const adminOnboardSchema = fullOnboardingSchema.merge(z.object({
  phone: z.string().min(10, 'Enter a valid 10-digit mobile number').max(15),
}));

export const validateAdminOnboardServiceProviderDto = (body = {}) => {
  const result = adminOnboardSchema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const d = result.data;
  return {
    phone: d.phone.trim(),
    ownerName: d.ownerName.trim(),
    email: d.email?.trim().toLowerCase() || '',
    profileImage: d.profileImage || '',
    zoneId: d.zoneId,
    experience: d.experience?.trim() || '',
    skills: (d.skills || []).map((s) => s.trim()).filter(Boolean),
    about: d.about?.trim() || '',
    panNumber: d.panNumber.trim().toUpperCase(),
    panImage: d.panImage,
    aadhaarNumber: d.aadhaarNumber.replace(/\s/g, ''),
    aadhaarImage: d.aadhaarImage,
    documents: d.documents,
    bankName: d.bankName?.trim() || '',
    accountHolderName: d.accountHolderName.trim(),
    accountNumber: d.accountNumber.trim(),
    ifscCode: d.ifscCode.trim().toUpperCase(),
    accountType: d.accountType || 'savings',
    upiId: d.upiId?.trim() || '',
    categoryId: d.categoryId,
    services: d.services,
  };
};

export { objectId };
