import { z } from 'zod';
import { ValidationError } from '../../../core/auth/errors.js';

const firstIssue = (result) => {
  const issue = result.error.errors[0];
  const where = issue.path.length && typeof issue.path[0] === 'string'
    ? `${issue.path.join('.')}: `
    : '';
  return `${where}${issue.message}`;
};

/**
 * A banner link is followed by every customer, so it is checked strictly rather
 * than trusted. Allowed: nothing, an in-app path ("/construction/..."), or an
 * http(s) URL. A protocol-relative "//evil.example" and schemes such as
 * `javascript:` or `data:` are rejected.
 */
export const isSafeLink = (value) => {
  const link = String(value || '').trim();
  if (!link) return true;
  if (link.startsWith('/')) return !link.startsWith('//') && !/[\\\s]/.test(link);
  try {
    const url = new URL(link);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

/** '' and null both mean "no date". Anything else must parse as a real date. */
const optionalDate = z
  .union([z.null(), z.literal(''), z.string()])
  .optional()
  .refine((v) => v == null || v === '' || !Number.isNaN(new Date(v).getTime()), 'Enter a valid date');

const bodySchema = z.object({
  image: z.string({ required_error: 'A banner needs an image' }).trim().min(1, 'A banner needs an image').max(1000),
  title: z.string().max(120).optional(),
  subtitle: z.string().max(200).optional(),
  link: z.string().max(500).optional().refine(isSafeLink, 'Link must be an in-app path like /construction/enquiries, or a full https:// address'),
  startDate: optionalDate,
  endDate: optionalDate,
  displayOrder: z.coerce.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const toDate = (v) => (v == null || v === '' ? null : new Date(v));

const normalize = (data) => {
  const out = { ...data };
  ['image', 'title', 'subtitle', 'link'].forEach((key) => {
    if (out[key] !== undefined) out[key] = out[key].trim();
  });
  if (out.startDate !== undefined) out.startDate = toDate(out.startDate);
  if (out.endDate !== undefined) out.endDate = toDate(out.endDate);
  return out;
};

const assertDateOrder = ({ startDate, endDate }) => {
  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    throw new ValidationError('The end date cannot be before the start date');
  }
};

export const validateCreateBannerDto = (body = {}) => {
  const result = bodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const data = normalize({
    ...result.data,
    title: result.data.title ?? '',
    subtitle: result.data.subtitle ?? '',
    link: result.data.link ?? '',
    startDate: result.data.startDate ?? null,
    endDate: result.data.endDate ?? null,
    displayOrder: result.data.displayOrder ?? 0,
    status: result.data.status || 'active',
  });
  assertDateOrder(data);
  return data;
};

/**
 * Partial update. The start/end ordering is checked here only when BOTH arrive in
 * the same request; the service re-checks against the stored value for the case
 * where only one of them is being changed.
 */
export const validateUpdateBannerDto = (body = {}) => {
  const result = bodySchema.partial().safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const data = normalize(result.data);
  assertDateOrder(data);
  return data;
};

export { assertDateOrder };
