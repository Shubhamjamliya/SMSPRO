import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Invalid id');

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 140);

const categoryBodySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(120),
  slug: z.string().max(140).optional(),
  icon: z.string().max(500).optional(),
  description: z.string().max(1000).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const validateCreateCategoryDto = (body = {}) => {
  const result = categoryBodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const name = result.data.name.trim();
  return {
    ...result.data,
    name,
    slug: result.data.slug?.trim() || slugify(name),
    icon: result.data.icon?.trim() || '',
    description: result.data.description?.trim() || '',
    displayOrder: result.data.displayOrder ?? 0,
    status: result.data.status || 'active',
  };
};

export const validateUpdateCategoryDto = (body = {}) => {
  const result = categoryBodySchema.partial().safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const data = { ...result.data };
  if (data.name !== undefined) data.name = data.name.trim();
  if (data.slug !== undefined) data.slug = slugify(data.slug || data.name || '');
  return data;
};

// Admin price is mandatory and must be greater than ₹0 — a service can't exist
// without a real customer-facing price. `.partial()` (used for updates) keeps this
// field optional-to-omit but still rejects 0/negative if it IS provided.
const basePriceSchema = z.coerce
  .number({ invalid_type_error: 'Enter a valid price' })
  .positive('Price is required and must be greater than ₹0');

const zoneIdsSchema = z.preprocess(
  (value) => (Array.isArray(value) ? value : []),
  z.array(objectId).min(1, 'Select at least one zone where this service is available'),
);


const serviceBodySchema = z.object({
  categoryId: objectId,
  name: z.string().min(1, 'Service name is required').max(150),
  slug: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(500).optional(),
  basePrice: basePriceSchema,
  /** Estimated minutes to complete the service — informational only (no booking/slots
   *  system exists yet to consume it). */
  duration: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  zoneIds: zoneIdsSchema,
  displayOrder: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const validateCreateServiceDto = (body = {}) => {
  const result = serviceBodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const name = result.data.name.trim();
  const { zoneIds, ...rest } = result.data;
  return {
    ...rest,
    name,
    slug: result.data.slug?.trim() || slugify(name),
    description: result.data.description?.trim() || '',
    duration: result.data.duration ?? null,
    displayOrder: result.data.displayOrder ?? 0,
    status: result.data.status || 'active',
    zoneIds: [...new Set(zoneIds.map(String))],
  };
};

export const validateUpdateServiceDto = (body = {}) => {
  const result = serviceBodySchema.partial().safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const data = { ...result.data };
  if (data.name !== undefined) data.name = data.name.trim();
  if (data.slug !== undefined) data.slug = slugify(data.slug || data.name || '');
  if (data.zoneIds !== undefined) {
    data.zoneIds = [...new Set(data.zoneIds.map(String))];
    if (!data.zoneIds.length) {
      throw new ValidationError('Select at least one zone where this service is available');
    }
  }
  return data;
};

const coordinateSchema = z.object({ lat: z.coerce.number(), lng: z.coerce.number() })
  .or(z.object({ latitude: z.coerce.number(), longitude: z.coerce.number() }));

const normalizeCoordinates = (coords = []) => coords.map((c) => ({
  lat: Number(c.lat ?? c.latitude),
  lng: Number(c.lng ?? c.longitude),
}));

const zoneBodySchema = z.object({
  name: z.string().min(1, 'Zone name is required').max(120),
  country: z.string().min(1, 'Country is required').max(80).optional(),
  unit: z.enum(['kilometer', 'mile']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  coordinates: z.array(coordinateSchema).min(3, 'Draw a polygon with at least 3 points'),
  polygon: z.string().optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
});

export const validateCreateZoneDto = (body = {}) => {
  const result = zoneBodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  return {
    ...result.data,
    country: result.data.country || 'India',
    unit: result.data.unit || 'kilometer',
    coordinates: normalizeCoordinates(result.data.coordinates),
    polygon: result.data.polygon || '',
    displayOrder: result.data.displayOrder ?? 0,
    status: result.data.status || 'active',
  };
};

export const validateUpdateZoneDto = (body = {}) => {
  const result = zoneBodySchema.partial().safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const data = { ...result.data };
  if (data.coordinates) {
    if (data.coordinates.length < 3) {
      throw new ValidationError('Draw a polygon with at least 3 points');
    }
    data.coordinates = normalizeCoordinates(data.coordinates);
  }
  return data;
};

export const validateObjectId = (id, label = 'id') => {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return String(id);
};

export const validateStatusDto = (body = {}) => {
  const status = String(body.status || '').trim();
  if (!['active', 'inactive'].includes(status)) {
    throw new ValidationError('Invalid status');
  }
  return { status };
};

/** Post-onboarding provider self-management: which catalog services they offer, at what
 *  price. Zone is no longer picked here — a provider has exactly ONE admin-assigned zone
 *  (set at onboarding), so every selected service is automatically scoped to it; the
 *  service layer only needs to check that service is actually mapped to that zone. */
const providerServicesBodySchema = z.object({
  services: z.array(z.object({
    serviceId: objectId,
    price: z.coerce
      .number({ invalid_type_error: 'Enter a valid price' })
      .positive('Enter your price for each selected service (must be greater than ₹0)'),
  })).default([]),
});

export const validateProviderServicesDto = (body = {}) => {
  const result = providerServicesBodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  return result.data;
};

export { objectId };
