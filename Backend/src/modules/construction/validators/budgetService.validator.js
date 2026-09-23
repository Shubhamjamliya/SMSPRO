import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const trimmedList = (values, max = 30) => (values || [])
  .map((v) => String(v || '').trim())
  .filter(Boolean)
  .slice(0, max);

const firstIssue = (result) => {
  const issue = result.error.errors[0];
  const where = issue.path.length && typeof issue.path[0] === 'string'
    ? `${issue.path.join('.')}: `
    : '';
  return `${where}${issue.message}`;
};

/** Empty string or null both mean "not set" — the form sends '' for a cleared field. */
const optionalId = z
  .union([z.string(), z.null()])
  .optional()
  .refine(
    (v) => v == null || v === '' || mongoose.Types.ObjectId.isValid(v),
    'Select a valid catalogue service',
  );

// null and '' are matched BEFORE the number: z.coerce.number() turns both into 0,
// and a cleared price must stay "no price", not become ₹0.
const optionalPrice = z
  .union([
    z.null(),
    z.literal(''),
    z.coerce.number().int('Price must be a whole number of rupees').min(0, 'Price cannot be negative'),
  ])
  .optional();

const bodySchema = z.object({
  name: z.string({ required_error: 'Service name is required' }).trim().min(1, 'Service name is required').max(160),
  tagline: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  image: z.string().max(1000).optional(),
  badge: z.string().max(40).optional(),
  price: optionalPrice,
  unit: z.string().max(40).optional(),
  visitingFee: z.coerce.number().int('Visiting fee must be a whole number of rupees').min(0, 'Visiting fee cannot be negative').optional(),
  typicalDurationText: z.string().max(120).optional(),
  features: z.array(z.string().max(200)).max(30).optional(),
  catalogueServiceId: optionalId,
  displayOrder: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const normalize = (data) => {
  const out = { ...data };
  ['name', 'tagline', 'description', 'image', 'badge', 'unit', 'typicalDurationText'].forEach((key) => {
    if (out[key] !== undefined) out[key] = out[key].trim();
  });
  if (out.features !== undefined) out.features = trimmedList(out.features);
  // '' from a cleared form field becomes a real null so it can never be cast as an id or a number.
  if (out.price === '') out.price = null;
  if (out.catalogueServiceId === '') out.catalogueServiceId = null;
  return out;
};

export const validateCreateBudgetServiceDto = (body = {}) => {
  const result = bodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return normalize({
    ...result.data,
    tagline: result.data.tagline ?? '',
    description: result.data.description ?? '',
    image: result.data.image ?? '',
    badge: result.data.badge ?? '',
    price: result.data.price ?? null,
    unit: result.data.unit ?? '',
    visitingFee: result.data.visitingFee ?? 0,
    typicalDurationText: result.data.typicalDurationText ?? '',
    features: result.data.features ?? [],
    catalogueServiceId: result.data.catalogueServiceId ?? null,
    displayOrder: result.data.displayOrder ?? 0,
    status: result.data.status || 'active',
  });
};

export const validateUpdateBudgetServiceDto = (body = {}) => {
  const result = bodySchema.partial().safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return normalize(result.data);
};
