import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  CONTRACTOR_BUSINESS_TYPES,
  CONTRACTOR_BANK_ACCOUNT_TYPES,
} from '../models/contractorProfile.model.js';
import { CONTRACTOR_DOCUMENT_TYPES } from '../models/contractorDocument.model.js';

const objectId = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  'Invalid id',
);

const optionalText = (max) => z.string().max(max).optional().or(z.literal(''));

const firstIssue = (result) => {
  const issue = result.error.errors[0];
  const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${where}${issue.message}`;
};

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/**
 * The whole registration form, validated in one pass on submit.
 *
 * Steps exist for the UI's benefit — the contractor fills the form over seven
 * screens and can leave halfway — but the server validates everything together
 * when they submit. A half-checked application must never reach the approval
 * queue, because your team would then be verifying incomplete data.
 */
const fullOnboardingSchema = z.object({
  // Step 1 — business
  businessName: z.string().min(2, 'Business name is required').max(160),
  businessType: z.enum(CONTRACTOR_BUSINESS_TYPES),
  ownerName: z.string().min(2, 'Owner name is required').max(120),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  profileImage: optionalText(1000),
  yearsExperience: z.coerce.number().int().min(0).max(100),
  about: optionalText(2000),

  // Step 2 — trades and capacity
  trades: z.array(objectId).min(1, 'Select at least one type of work you take on').max(20),
  projectSizeMin: z.coerce.number().min(0).nullable().optional(),
  projectSizeMax: z.coerce.number().min(0).nullable().optional(),
  maxConcurrentProjects: z.coerce.number().int().min(1).max(100),

  // Step 3 — coverage
  serviceAreas: z.array(z.string().min(1).max(120)).min(1, 'Add at least one area you work in').max(50),
  travelRadiusKm: z.coerce.number().min(0).max(1000).nullable().optional(),

  // Step 4 — identity KYC
  panNumber: z.string().min(1, 'PAN number is required').max(20),
  panImage: z.string().min(1, 'Upload a copy of your PAN card').max(1000),
  aadhaarNumber: z.string().min(1, 'Aadhaar number is required').max(20),
  aadhaarImage: z.string().min(1, 'Upload a copy of your Aadhaar').max(1000),
  gstNumber: optionalText(20),
  gstImage: optionalText(1000),

  // Step 6 — bank details
  bankName: z.string().min(2, 'Bank name is required').max(120),
  accountHolderName: z.string().min(2, 'Account holder name is required').max(120),
  accountNumber: z.string().min(6, 'Enter a valid account number').max(30),
  ifscCode: z.string().min(11, 'Enter a valid IFSC code').max(11),
  accountType: z.enum(CONTRACTOR_BANK_ACCOUNT_TYPES),
  upiId: optionalText(120),
});

export const validateFullOnboardingDto = (body = {}) => {
  const result = fullOnboardingSchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const d = result.data;

  const pan = d.panNumber.trim().toUpperCase();
  if (!PAN_RE.test(pan)) {
    throw new ValidationError('PAN must look like ABCDE1234F');
  }
  const aadhaar = d.aadhaarNumber.replace(/\s/g, '');
  if (!/^[0-9]{12}$/.test(aadhaar)) {
    throw new ValidationError('Aadhaar must be 12 digits');
  }
  const ifsc = d.ifscCode.trim().toUpperCase();
  if (!IFSC_RE.test(ifsc)) {
    throw new ValidationError('IFSC must look like HDFC0001234');
  }
  const gst = (d.gstNumber || '').trim().toUpperCase();
  if (gst && !GST_RE.test(gst)) {
    throw new ValidationError('GST number is not in a valid format');
  }
  if (
    d.projectSizeMin != null
    && d.projectSizeMax != null
    && Number(d.projectSizeMax) < Number(d.projectSizeMin)
  ) {
    throw new ValidationError('Maximum project size cannot be less than the minimum');
  }

  return {
    businessName: d.businessName.trim(),
    businessType: d.businessType,
    ownerName: d.ownerName.trim(),
    email: d.email?.trim().toLowerCase() || '',
    profileImage: d.profileImage?.trim() || '',
    yearsExperience: d.yearsExperience,
    about: d.about?.trim() || '',
    trades: [...new Set(d.trades.map(String))],
    projectSizeMin: d.projectSizeMin ?? null,
    projectSizeMax: d.projectSizeMax ?? null,
    maxConcurrentProjects: d.maxConcurrentProjects,
    serviceAreas: [...new Set(d.serviceAreas.map((a) => a.trim()).filter(Boolean))],
    travelRadiusKm: d.travelRadiusKm ?? null,
    panNumber: pan,
    panImage: d.panImage.trim(),
    aadhaarNumber: aadhaar,
    aadhaarImage: d.aadhaarImage.trim(),
    gstNumber: gst,
    gstImage: d.gstImage?.trim() || '',
    bankName: d.bankName.trim(),
    accountHolderName: d.accountHolderName.trim(),
    accountNumber: d.accountNumber.trim(),
    ifscCode: ifsc,
    accountType: d.accountType,
    upiId: d.upiId?.trim() || '',
  };
};

/** Saves progress without validating the whole form — used between steps. */
const draftSchema = fullOnboardingSchema.partial().extend({
  onboardingStep: z.coerce.number().int().min(1).max(7).optional(),
});

export const validateDraftDto = (body = {}) => {
  const result = draftSchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return result.data;
};

// ---------- Documents (BRD W3) ----------

const documentSchema = z.object({
  type: z.enum(CONTRACTOR_DOCUMENT_TYPES),
  label: optionalText(160),
  documentNumber: optionalText(60),
  fileUrl: z.string().min(1, 'Upload the document').max(1000),
  issuedAt: z.string().datetime().nullable().optional().or(z.literal('')),
  expiresAt: z.string().datetime().nullable().optional().or(z.literal('')),
});

export const validateDocumentDto = (body = {}) => {
  const result = documentSchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const d = result.data;

  const issuedAt = d.issuedAt ? new Date(d.issuedAt) : null;
  const expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
  if (issuedAt && expiresAt && expiresAt <= issuedAt) {
    throw new ValidationError('Expiry date must be after the issue date');
  }
  if (d.type === 'other' && !d.label?.trim()) {
    throw new ValidationError('Name the document when the type is "other"');
  }
  // A licence that has already lapsed cannot support a verification claim.
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    throw new ValidationError('This document has already expired — upload a current one');
  }

  return {
    type: d.type,
    label: d.label?.trim() || '',
    documentNumber: d.documentNumber?.trim() || '',
    fileUrl: d.fileUrl.trim(),
    issuedAt,
    expiresAt,
  };
};

// ---------- Portfolio (BRD W5) ----------

const portfolioSchema = z.object({
  title: z.string().min(2, 'Give this project a title').max(160),
  description: optionalText(2000),
  categoryId: objectId.nullable().optional(),
  images: z.array(z.string().min(1).max(1000)).min(1, 'Add at least one photograph').max(12),
  location: optionalText(160),
  projectValue: z.coerce.number().min(0).nullable().optional(),
  completedAt: z.string().datetime().nullable().optional().or(z.literal('')),
  displayOrder: z.coerce.number().int().min(0).optional(),
});

export const validatePortfolioDto = (body = {}) => {
  const result = portfolioSchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const d = result.data;
  return {
    title: d.title.trim(),
    description: d.description?.trim() || '',
    categoryId: d.categoryId || null,
    images: d.images.map((i) => i.trim()).filter(Boolean),
    location: d.location?.trim() || '',
    projectValue: d.projectValue ?? null,
    completedAt: d.completedAt ? new Date(d.completedAt) : null,
    displayOrder: d.displayOrder ?? 0,
  };
};

export const validateObjectId = (value, label = 'id') => {
  const id = String(value || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return id;
};
