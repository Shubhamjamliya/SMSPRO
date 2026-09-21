import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { MATERIAL_REQUEST_STATUSES } from '../models/materialRequest.model.js';

const trimmedList = (values, max = 30) => (values || [])
  .map((v) => String(v || '').trim())
  .filter(Boolean)
  .slice(0, max);

/** "Steel   bars" and "steel bars" should group together, so collapse the whitespace. */
export const tidy = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const firstIssue = (result) => {
  const issue = result.error.errors[0];
  const where = issue.path.length && typeof issue.path[0] === 'string'
    ? `${issue.path.join('.')}: `
    : '';
  return `${where}${issue.message}`;
};

const objectId = z
  .string()
  .refine((v) => mongoose.Types.ObjectId.isValid(v), 'Invalid id');

// ---------- Materials (admin) ----------

const materialBodySchema = z.object({
  name: z.string({ required_error: 'Material name is required' }).trim().min(1, 'Material name is required').max(160),
  brand: z.string().max(80).optional(),
  category: z.string({ required_error: 'Category is required' }).trim().min(1, 'Category is required').max(80),
  description: z.string().max(1000).optional(),
  image: z.string().max(1000).optional(),
  // A blank must be "missing", not 0 — z.coerce.number() would turn '' and null into ₹0.
  price: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce
      .number({ required_error: 'Price is required', invalid_type_error: 'Price is required' })
      .min(0, 'Price cannot be negative')
      .max(100000000, 'Price is too large'),
  ),
  unit: z.string().max(40).optional(),
  minOrderQty: z.coerce.number().gt(0, 'Minimum quantity must be more than zero').max(1000000).optional(),
  inStock: z.boolean().optional(),
  specifications: z.array(z.string().max(200)).max(30).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const normalizeMaterial = (data) => {
  const out = { ...data };
  if (out.name !== undefined) out.name = tidy(out.name);
  if (out.brand !== undefined) out.brand = tidy(out.brand);
  if (out.category !== undefined) out.category = tidy(out.category);
  if (out.description !== undefined) out.description = out.description.trim();
  if (out.image !== undefined) out.image = out.image.trim();
  if (out.unit !== undefined) out.unit = tidy(out.unit) || 'per unit';
  if (out.specifications !== undefined) out.specifications = trimmedList(out.specifications);
  return out;
};

export const validateCreateMaterialDto = (body = {}) => {
  const result = materialBodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return normalizeMaterial({
    ...result.data,
    brand: result.data.brand ?? '',
    description: result.data.description ?? '',
    image: result.data.image ?? '',
    unit: result.data.unit ?? 'per unit',
    minOrderQty: result.data.minOrderQty ?? 1,
    inStock: result.data.inStock ?? true,
    specifications: result.data.specifications ?? [],
    displayOrder: result.data.displayOrder ?? 0,
    status: result.data.status || 'active',
  });
};

export const validateUpdateMaterialDto = (body = {}) => {
  const result = materialBodySchema.partial().safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return normalizeMaterial(result.data);
};

// ---------- Requests ----------

/** Digits with an optional leading +; 7–15 of them covers every real phone number. */
export const cleanPhone = (value) => {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  return { digits, value: (raw.startsWith('+') ? '+' : '') + digits };
};

const requestSchema = z.object({
  contact: z.object({
    name: z.string({ required_error: 'Please enter your name' }).trim().min(1, 'Please enter your name').max(120),
    phone: z.string({ required_error: 'Please enter a phone number' }),
  }),
  delivery: z.object({
    city: z.string({ required_error: 'Which city should this be delivered to?' })
      .trim().min(1, 'Which city should this be delivered to?').max(120),
    address: z.string().max(400).optional(),
  }),
  notes: z.string().max(1000).optional(),
  items: z.array(z.object({
    materialId: objectId,
    quantity: z.coerce.number({ invalid_type_error: 'Enter a quantity' })
      .gt(0, 'Quantity must be more than zero')
      .max(1000000, 'Quantity is too large'),
  })).min(1, 'Add at least one material').max(50, 'A request can hold at most 50 materials'),
});

export const validateMaterialRequestDto = (body = {}) => {
  const result = requestSchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const d = result.data;

  const phone = cleanPhone(d.contact.phone);
  if (phone.digits.length < 7 || phone.digits.length > 15) {
    throw new ValidationError('Please enter a valid phone number');
  }

  // The same material added twice is one line with the quantities added up.
  const merged = new Map();
  for (const item of d.items) {
    merged.set(item.materialId, (merged.get(item.materialId) || 0) + item.quantity);
  }

  return {
    contact: { name: tidy(d.contact.name), phone: phone.value },
    delivery: { city: tidy(d.delivery.city), address: d.delivery.address?.trim() || '' },
    notes: d.notes?.trim() || '',
    items: [...merged].map(([materialId, quantity]) => ({ materialId, quantity })),
  };
};

export const validateRequestStatusDto = (body = {}) => {
  const schema = z.object({
    status: z.enum(MATERIAL_REQUEST_STATUSES, {
      errorMap: () => ({ message: `Status must be one of: ${MATERIAL_REQUEST_STATUSES.join(', ')}` }),
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
