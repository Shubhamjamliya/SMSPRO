import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Invalid id');

const categoryBodySchema = z.object({
    name: z.string().min(1, 'Category name is required').max(120),
    slug: z.string().max(140).optional(),
    icon: z.string().max(500).optional(),
    description: z.string().max(1000).optional(),
    defaultSecurityDeposit: z.coerce.number().min(0).optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    status: z.enum(['active', 'inactive']).optional(),
});

const slugify = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);

export const validateCreateCategoryDto = (body = {}) => {
    const result = categoryBodySchema.safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const name = result.data.name.trim();
    return {
        ...result.data,
        name,
        slug: (result.data.slug?.trim() || slugify(name)),
        icon: result.data.icon?.trim() || '',
        description: result.data.description?.trim() || '',
        defaultSecurityDeposit: result.data.defaultSecurityDeposit ?? 0,
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
    if (data.description !== undefined) data.description = data.description.trim();
    return data;
};

export const validateCategoryId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid category id');
    }
    return String(id);
};

export const validateCategoryStatusDto = (body = {}) => {
    const status = String(body.status || '').trim();
    if (!['active', 'inactive'].includes(status)) {
        throw new ValidationError('Invalid category status');
    }
    return { status };
};

export { objectId };
