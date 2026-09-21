import { z } from 'zod';
import { ValidationError } from '../../../core/auth/errors.js';
import { SITE_ACCESS_LEVELS } from '../models/packageRequest.model.js';

const firstIssue = (result) => {
  const issue = result.error.errors[0];
  const where = issue.path.length && typeof issue.path[0] === 'string'
    ? `${issue.path.join('.')}: `
    : '';
  return `${where}${issue.message}`;
};

const parse = (schema, body) => {
  const result = schema.safeParse(body || {});
  if (!result.success) throw new ValidationError(firstIssue(result));
  return result.data;
};

/** Where the contractor was when they tapped. Optional: a phone may refuse location. */
const locationSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })
  .nullish();

export const validateStartJourneyDto = (body) => parse(z.object({ location: locationSchema }), body);

export const validateArrivalDto = (body) => parse(
  z.object({
    otp: z
      .string({ required_error: 'Enter the OTP the customer gives you' })
      .trim()
      .regex(/^\d{6}$/, 'The OTP is 6 digits'),
    location: locationSchema,
  }),
  body,
);

const optionalNumber = (max, label) => z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.coerce.number({ invalid_type_error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(max, `${label} looks too large`).nullable(),
);

const optionalBool = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.boolean().nullable(),
);

const text = (max) => z.string().max(max).optional().transform((v) => (v || '').trim());

const reportSchema = z.object({
  plotAreaSqft: optionalNumber(1000000, 'Plot area').optional().default(null),
  builtUpAreaSqft: optionalNumber(1000000, 'Built-up area').optional().default(null),
  floorsPlanned: optionalNumber(50, 'Floors').optional().default(null),
  measurements: text(2000),
  siteCondition: text(2000),
  access: z.enum([...SITE_ACCESS_LEVELS, '']).optional().default(''),
  waterAvailable: optionalBool.optional().default(null),
  electricityAvailable: optionalBool.optional().default(null),
  recommendedScope: text(2000),
  estimatedDurationDays: optionalNumber(3650, 'Duration').optional().default(null),
  observations: text(3000),
  notesForOffice: text(1000),
  photos: z.array(z.string().trim().min(1).max(1000)).max(20, 'Up to 20 photos').optional().default([]),
});

/**
 * A draft may be half-filled; a submitted report may not. Submitting is final, and what
 * the office prices the job from, so the fields that make it usable are required then.
 */
export const validateVisitReportDto = (body = {}) => {
  const { submit, report } = parse(
    z.object({ submit: z.boolean().optional().default(false), report: reportSchema }),
    body,
  );

  if (submit) {
    if (!report.measurements) throw new ValidationError('Add the site measurements before sending the report');
    if (!report.siteCondition) throw new ValidationError('Describe the site condition before sending the report');
    if (!report.access) throw new ValidationError('Say how easy the site is to access');
    if (!report.builtUpAreaSqft && !report.plotAreaSqft) {
      throw new ValidationError('Enter the plot or built-up area');
    }
    if (!report.photos.length) throw new ValidationError('Add at least one site photo');
  }
  return { submit, report };
};

const MONEY_MAX = 1000000000;

export const validateContractDto = (body = {}) => {
  const data = parse(
    z.object({
      price: z.coerce
        .number({ invalid_type_error: 'Enter the agreed price' })
        .positive('Enter the agreed price')
        .max(MONEY_MAX, 'That price looks too large'),
      advanceAmount: optionalNumber(MONEY_MAX, 'Advance').optional().default(0),
      durationDays: optionalNumber(3650, 'Duration').optional().default(null),
      scope: text(3000),
      terms: z.string({ required_error: 'Add the terms of the contract' }).trim().min(10, 'Add the terms of the contract').max(5000),
      validDays: z.coerce.number().int().min(1).max(90).optional().default(7),
    }),
    body,
  );
  const advance = data.advanceAmount || 0;
  if (advance > data.price) throw new ValidationError('The advance cannot be more than the price');
  return { ...data, advanceAmount: advance };
};

export const validateContractResponseDto = (body = {}) => parse(
  z.object({ note: z.string().max(500).optional().transform((v) => (v || '').trim()) }),
  body,
);
