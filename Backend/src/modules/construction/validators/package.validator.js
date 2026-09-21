import { z } from 'zod';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  PACKAGE_ICONS,
  PACKAGE_SEGMENTS,
  PACKAGE_THEMES,
} from '../models/constructionPackage.model.js';

const trimmedList = (values, max = 40) => (values || [])
  .map((v) => String(v || '').trim())
  .filter(Boolean)
  .slice(0, max);

export const validateSegment = (value) => {
  const result = z.enum(PACKAGE_SEGMENTS).safeParse(value);
  if (!result.success) throw new ValidationError('Segment must be residential or commercial');
  return result.data;
};

const packageBodySchema = z.object({
  segment: z.enum(PACKAGE_SEGMENTS, {
    errorMap: () => ({ message: 'Segment must be residential or commercial' }),
  }),
  name: z
    .string({ required_error: 'Package name is required' })
    .trim()
    .min(1, 'Package name is required')
    .max(120),
  tagline: z.string().max(160).optional(),
  // A blank must be "missing", not 0 — z.coerce.number() would turn '' and null into ₹0.
  price: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce
      .number({ required_error: 'Price is required', invalid_type_error: 'Price is required' })
      .int('Price must be a whole number of rupees')
      .min(0, 'Price cannot be negative'),
  ),
  unit: z.string().max(40).optional(),
  // A blank must be "no fee", not an error — but never a negative or fractional rupee amount.
  visitingFee: z.preprocess(
    (v) => (v === '' || v === null ? 0 : v),
    z.coerce
      .number({ invalid_type_error: 'Visiting fee must be a number' })
      .int('Visiting fee must be a whole number of rupees')
      .min(0, 'Visiting fee cannot be negative')
      .max(1000000, 'Visiting fee is too large'),
  ).optional(),
  badge: z.string().max(40).optional(),
  isPopular: z.boolean().optional(),
  theme: z.enum(PACKAGE_THEMES).optional(),
  icon: z.enum(PACKAGE_ICONS).optional(),
  features: z.array(z.string().max(200)).max(40).optional(),
  description: z.string().max(1000).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const normalize = (data) => {
  const out = { ...data };
  if (out.name !== undefined) out.name = out.name.trim();
  if (out.tagline !== undefined) out.tagline = out.tagline.trim();
  if (out.unit !== undefined) out.unit = out.unit.trim();
  if (out.badge !== undefined) out.badge = out.badge.trim();
  if (out.description !== undefined) out.description = out.description.trim();
  if (out.features !== undefined) out.features = trimmedList(out.features);
  return out;
};

export const validateCreatePackageDto = (body = {}) => {
  const result = packageBodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  return normalize({
    ...result.data,
    tagline: result.data.tagline ?? '',
    unit: result.data.unit?.trim() || 'per sq.ft',
    visitingFee: result.data.visitingFee ?? 0,
    badge: result.data.badge ?? '',
    isPopular: result.data.isPopular ?? false,
    theme: result.data.theme || 'slate',
    icon: result.data.icon || 'building',
    features: result.data.features || [],
    description: result.data.description ?? '',
    displayOrder: result.data.displayOrder ?? 0,
    status: result.data.status || 'active',
  });
};

/** The segment is fixed once a package exists — moving one between segments is a delete and re-add. */
export const validateUpdatePackageDto = (body = {}) => {
  const result = packageBodySchema.omit({ segment: true }).partial().safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const data = normalize(result.data);
  if (data.unit === '') data.unit = 'per sq.ft';
  return data;
};
