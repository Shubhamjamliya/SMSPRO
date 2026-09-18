import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { CONSTRUCTION_UNITS } from '../models/constructionSettings.model.js';

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 140);

const trimmedList = (values, max = 40) => (values || [])
  .map((v) => String(v || '').trim())
  .filter(Boolean)
  .slice(0, max);

export const validateObjectId = (value, label = 'id') => {
  const id = String(value || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return id;
};

export const validateStatusDto = (body = {}) => {
  const result = z.object({ status: z.enum(['active', 'inactive']) }).safeParse(body);
  if (!result.success) throw new ValidationError('Status must be active or inactive');
  return result.data;
};

// ---------- Categories ----------

const categoryBodySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(120),
  slug: z.string().max(140).optional(),
  icon: z.string().max(500).optional(),
  coverImage: z.string().max(1000).optional(),
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
    slug: result.data.slug?.trim() ? slugify(result.data.slug) : slugify(name),
    icon: result.data.icon?.trim() || '',
    coverImage: result.data.coverImage?.trim() || '',
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
  if (data.icon !== undefined) data.icon = data.icon.trim();
  if (data.coverImage !== undefined) data.coverImage = data.coverImage.trim();
  if (data.description !== undefined) data.description = data.description.trim();
  return data;
};

// ---------- Services ----------

const stageTemplateSchema = z.object({
  name: z.string().min(1, 'Each stage needs a name').max(120),
  description: z.string().max(500).optional(),
  percentage: z.coerce.number().min(0).max(100),
  typicalDurationDays: z.coerce.number().int().min(0).nullable().optional(),
});

const serviceBodySchema = z.object({
  categoryId: z.string().refine(
    (v) => mongoose.Types.ObjectId.isValid(v),
    'Select a valid category',
  ),
  name: z.string().min(1, 'Service name is required').max(160),
  slug: z.string().max(160).optional(),
  description: z.string().max(3000).optional(),
  icon: z.string().max(500).optional(),
  coverImage: z.string().max(1000).optional(),
  covers: z.array(z.string().max(200)).max(40).optional(),
  excludes: z.array(z.string().max(200)).max(40).optional(),
  typicalDurationText: z.string().max(120).optional(),
  typicalBudget: z.object({
    min: z.coerce.number().min(0).nullable().optional(),
    max: z.coerce.number().min(0).nullable().optional(),
  }).optional(),
  defaultUnit: z.enum([...CONSTRUCTION_UNITS, '']).optional(),
  defaultQuoteSections: z.array(z.string().max(80)).max(20).optional(),
  defaultStages: z.array(stageTemplateSchema).max(50).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

/** Stage percentages must total 100 — the model enforces it too, but failing here
 *  gives the admin a readable message instead of a Mongoose validation error. */
const assertStageTotals = (stages) => {
  if (!stages?.length) return;
  const total = Math.round(
    stages.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0) * 100,
  ) / 100;
  if (total !== 100) {
    throw new ValidationError(
      `Stage percentages must total 100 — they currently total ${total}`,
    );
  }
};

const normalizeServiceExtras = (data) => {
  if (data.covers !== undefined) data.covers = trimmedList(data.covers);
  if (data.excludes !== undefined) data.excludes = trimmedList(data.excludes);
  if (data.defaultQuoteSections !== undefined) {
    data.defaultQuoteSections = trimmedList(data.defaultQuoteSections, 20);
  }
  if (data.defaultStages !== undefined) {
    data.defaultStages = (data.defaultStages || []).map((s) => ({
      name: s.name.trim(),
      description: s.description?.trim() || '',
      percentage: s.percentage,
      typicalDurationDays: s.typicalDurationDays ?? null,
    }));
    assertStageTotals(data.defaultStages);
  }
  if (data.typicalBudget) {
    const { min, max } = data.typicalBudget;
    if (min != null && max != null && Number(max) < Number(min)) {
      throw new ValidationError('Typical budget maximum cannot be less than the minimum');
    }
  }
  return data;
};

export const validateCreateServiceDto = (body = {}) => {
  const result = serviceBodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const name = result.data.name.trim();
  return normalizeServiceExtras({
    ...result.data,
    name,
    slug: result.data.slug?.trim() ? slugify(result.data.slug) : slugify(name),
    description: result.data.description?.trim() || '',
    icon: result.data.icon?.trim() || '',
    coverImage: result.data.coverImage?.trim() || '',
    covers: trimmedList(result.data.covers),
    excludes: trimmedList(result.data.excludes),
    typicalDurationText: result.data.typicalDurationText?.trim() || '',
    typicalBudget: result.data.typicalBudget || { min: null, max: null },
    defaultUnit: result.data.defaultUnit || '',
    defaultQuoteSections: trimmedList(result.data.defaultQuoteSections, 20),
    defaultStages: result.data.defaultStages || [],
    displayOrder: result.data.displayOrder ?? 0,
    status: result.data.status || 'active',
  });
};

export const validateUpdateServiceDto = (body = {}) => {
  const result = serviceBodySchema.partial().safeParse(body);
  if (!result.success) throw new ValidationError(result.error.errors[0].message);
  const data = { ...result.data };
  if (data.name !== undefined) data.name = data.name.trim();
  if (data.slug !== undefined) data.slug = slugify(data.slug || data.name || '');
  if (data.description !== undefined) data.description = data.description.trim();
  if (data.icon !== undefined) data.icon = data.icon.trim();
  if (data.coverImage !== undefined) data.coverImage = data.coverImage.trim();
  if (data.typicalDurationText !== undefined) {
    data.typicalDurationText = data.typicalDurationText.trim();
  }
  return normalizeServiceExtras(data);
};
