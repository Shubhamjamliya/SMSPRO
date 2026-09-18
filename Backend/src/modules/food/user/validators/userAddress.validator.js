import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const labelSchema = z.enum(['Home', 'Office', 'Other']).default('Home');

const optionalTrimmed = (max) =>
    z.string().max(max).optional().or(z.literal('')).transform((s) => String(s || '').trim());

const createAddressSchema = z.object({
    label: labelSchema.optional(),
    street: z.string().min(1, 'Street is required').max(200).transform((s) => s.trim()),
    additionalDetails: optionalTrimmed(500),
    city: z.string().min(1, 'City is required').max(100).transform((s) => s.trim()),
    state: z.string().min(1, 'State is required').max(100).transform((s) => s.trim()),
    zipCode: optionalTrimmed(20),
    // Accepted aliases for zipCode (normalized in the service)
    pincode: optionalTrimmed(20),
    postalCode: optionalTrimmed(20),
    area: optionalTrimmed(200),
    landmark: optionalTrimmed(200),
    formattedAddress: optionalTrimmed(500),
    placeId: optionalTrimmed(200),
    phone: optionalTrimmed(20),
    // Coordinates are strongly preferred but optional: when missing, the
    // service geocodes the typed address server-side so every stored address
    // still ends up with a GeoJSON point.
    latitude: z.coerce.number().finite().min(-90).max(90).optional(),
    longitude: z.coerce.number().finite().min(-180).max(180).optional()
}).refine(
    (data) => (data.latitude === undefined) === (data.longitude === undefined),
    { message: 'latitude and longitude must be provided together' }
);

// For PATCH: absent fields must stay undefined (not be coerced to ''),
// otherwise a partial update would silently wipe stored values.
const patchTrimmed = (max) =>
    z.string().max(max).optional().transform((s) => (s === undefined ? undefined : String(s).trim()));

const updateAddressSchema = z.object({
    label: labelSchema.optional(),
    street: z.string().min(1).max(200).transform((s) => s.trim()).optional(),
    additionalDetails: patchTrimmed(500),
    city: z.string().min(1).max(100).transform((s) => s.trim()).optional(),
    state: z.string().min(1).max(100).transform((s) => s.trim()).optional(),
    zipCode: patchTrimmed(20),
    pincode: patchTrimmed(20),
    postalCode: patchTrimmed(20),
    area: patchTrimmed(200),
    landmark: patchTrimmed(200),
    formattedAddress: patchTrimmed(500),
    placeId: patchTrimmed(200),
    phone: patchTrimmed(20),
    latitude: z.coerce.number().finite().min(-90).max(90).optional(),
    longitude: z.coerce.number().finite().min(-180).max(180).optional()
});

export const validateCreateAddressDto = (body) => {
    const result = createAddressSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};

export const validateUpdateAddressDto = (body) => {
    const result = updateAddressSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    if (!Object.keys(result.data || {}).length) {
        throw new ValidationError('No fields to update');
    }
    return result.data;
};
