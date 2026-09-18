import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const phoneSchema = z
    .string()
    .min(8, 'Phone must be at least 8 digits')
    .max(15, 'Phone must be at most 15 digits');

const emailSchema = z.string().email('Invalid email').optional().or(z.literal(''));
const requiredEmailSchema = z.string().email('Invalid email');
const pincodeSchema = z.string().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits');
const requiredBooleanSchema = z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    }
    return value;
}, z.boolean({ required_error: 'Please select whether the restaurant is pure veg' }));
const optionalBooleanSchema = z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    }
    return value;
}, z.boolean().optional());

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const normalizeTimeValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
        const h = Number(hhmm[1]);
        const m = Number(hhmm[2]);
        if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return '';
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (ampm) {
        let h = Number(ampm[1]);
        const m = Number(ampm[2]);
        const p = ampm[3].toUpperCase();
        if (!Number.isFinite(h) || !Number.isFinite(m) || h < 1 || h > 12 || m < 0 || m > 59) return '';
        if (p === 'AM') h = h === 12 ? 0 : h;
        if (p === 'PM') h = h === 12 ? 12 : h + 12;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    return '';
};

const timeToMinutes = (value) => {
    const normalized = normalizeTimeValue(value);
    if (!normalized) return null;
    const [h, m] = normalized.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
};

const dayTimingSchema = z.object({
    day: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
    openingTime: z.string().optional(),
    closingTime: z.string().optional(),
    isOpen: z.boolean().default(true)
});

const dayTimingsArraySchema = z.union([z.string(), z.array(dayTimingSchema)])
    .optional()
    .transform((val) => {
        if (typeof val === 'string') {
            try { return JSON.parse(val); } catch (e) { return []; }
        }
        return val || [];
    });

const restaurantRegisterSchema = z.object({
    restaurantName: z.string().optional().or(z.literal('')),
    ownerName: z.string().optional().or(z.literal('')),
    ownerEmail: emailSchema,
    ownerPhone: phoneSchema.optional(),
    primaryContactNumber: z
        .string()
        .regex(/^\d{10}$/, 'Primary contact number must be exactly 10 digits')
        .optional()
        .or(z.literal('')),
    pureVegRestaurant: requiredBooleanSchema,
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    area: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    landmark: z.string().optional(),
    formattedAddress: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    zoneId: z.string().optional(),
    cuisines: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .transform((val) => {
            if (Array.isArray(val)) return val.map((c) => c.trim()).filter(Boolean);
            return val ? val.split(',').map((c) => c.trim()).filter(Boolean) : [];
        }),
    openingTime: z.string().optional(),
    closingTime: z.string().optional(),
    estimatedDeliveryTime: z.string().optional(),
    dayTimings: dayTimingsArraySchema,
    openDays: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .transform((val) => {
            if (Array.isArray(val)) return val.map((d) => d.trim()).filter(Boolean);
            return val ? val.split(',').map((d) => d.trim()).filter(Boolean) : [];
        }),
    panNumber: z
        .string()
        .regex(panRegex, 'Invalid PAN format')
        .optional()
        .or(z.literal('')),
    nameOnPan: z.string().optional(),
    gstRegistered: z
        .string()
        .optional()
        .transform((val) => val === 'true' || val === '1'),
    gstNumber: z.string().optional(),
    gstLegalName: z.string().optional(),
    gstAddress: z.string().optional(),
    fssaiNumber: z.string().optional(),
    fssaiExpiry: z.string().optional(),
    accountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    accountHolderName: z.string().optional(),
    accountType: z.string().optional(),
        estimatedDeliveryTime: z.string().optional(),
    featuredDish: z.string().optional(),
    offer: z.string().optional(),
    razorpayOrderId: z.string().optional(),
    razorpayPaymentId: z.string().optional(),
    razorpaySignature: z.string().optional(),
    finalizeOnboarding: z.string().optional()
});

export const validateRestaurantRegisterDto = (body) => {
    const result = restaurantRegisterSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }

    const data = result.data;
    if (data.dayTimings && Array.isArray(data.dayTimings)) {
        for (const dt of data.dayTimings) {
            if (dt.isOpen) {
                const openingMinutes = timeToMinutes(dt.openingTime);
                const closingMinutes = timeToMinutes(dt.closingTime);
                if (openingMinutes !== null && closingMinutes !== null) {
                    if (openingMinutes === closingMinutes) {
                        throw new ValidationError(`Opening and closing time cannot be the same for ${dt.day}`);
                    }
                    if (closingMinutes < openingMinutes) {
                        throw new ValidationError(`Closing time cannot be less than opening time for ${dt.day}`);
                    }
                }
            }
        }
    } else {
        const openingMinutes = timeToMinutes(data.openingTime);
        const closingMinutes = timeToMinutes(data.closingTime);
        if (openingMinutes !== null && closingMinutes !== null) {
            if (openingMinutes === closingMinutes) {
                throw new ValidationError('Opening time and closing time cannot be same');
            }
            if (closingMinutes < openingMinutes) {
                throw new ValidationError('Closing time cannot be less than opening time');
            }
        }
    }
    const isFinalizeOnboarding =
        data.finalizeOnboarding === true ||
        data.finalizeOnboarding === 'true' ||
        data.finalizeOnboarding === '1';
    if (!isFinalizeOnboarding) {
        if (!String(data.restaurantName || '').trim()) {
            throw new ValidationError('Restaurant name is required');
        }
        if (!String(data.ownerName || '').trim()) {
            throw new ValidationError('Owner name is required');
        }
    }
    return {
        ...data,
        gstRegistered: data.gstRegistered ?? false,
        finalizeOnboarding: data.finalizeOnboarding ?? false
    };
};

const tenDigitPhoneSchema = z
    .string()
    .regex(/^\d{10}$/, 'Phone number must be exactly 10 digits');

const loginPhoneSchema = z
    .string()
    .min(1, 'Primary contact number is required')
    .transform((value) => String(value || '').replace(/\D/g, '').slice(-10))
    .refine((value) => /^\d{10}$/.test(value), 'Primary contact number must be exactly 10 digits');

const onboardingStep1Schema = z.object({
    restaurantName: z.string().min(1, 'Restaurant name is required'),
    ownerName: z.string().min(1, 'Owner name is required'),
    ownerEmail: requiredEmailSchema,
    ownerPhone: tenDigitPhoneSchema.optional().or(z.literal('')),
    primaryContactNumber: loginPhoneSchema,
    pureVegRestaurant: requiredBooleanSchema,
    addressLine1: z.string().min(1, 'Address line 1 is required'),
    addressLine2: z.string().optional(),
    area: z.string().min(1, 'Area is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    pincode: pincodeSchema,
    landmark: z.string().optional(),
    formattedAddress: z.string().optional(),
    latitude: z.string().min(1, 'Latitude is required'),
    longitude: z.string().min(1, 'Longitude is required'),
    zoneId: z.string().min(1, 'Zone is required'),
});

const onboardingStep2Schema = z.object({
    ownerPhone: phoneSchema.optional(),
    primaryContactNumber: loginPhoneSchema.optional(),
    cuisines: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .transform((val) => {
            if (Array.isArray(val)) return val.map((c) => c.trim()).filter(Boolean);
            return val ? val.split(',').map((c) => c.trim()).filter(Boolean) : [];
        })
        .refine((value) => value.length > 0, 'At least one cuisine is required'),
    openingTime: z.string().min(1, 'Opening time is required'),
    closingTime: z.string().min(1, 'Closing time is required'),
    dayTimings: dayTimingsArraySchema,
    openDays: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .transform((val) => {
            if (Array.isArray(val)) return val.map((d) => d.trim()).filter(Boolean);
            return val ? val.split(',').map((d) => d.trim()).filter(Boolean) : [];
        })
        .refine((value) => value.length > 0, 'At least one open day is required'),
    showRestaurantToUsersWithoutItems: optionalBooleanSchema,
}).refine(
    (data) => Boolean(data.primaryContactNumber || data.ownerPhone),
    { message: 'Primary contact number is required', path: ['primaryContactNumber'] }
);

const onboardingStep3Schema = z.object({
    ownerPhone: phoneSchema.optional(),
    primaryContactNumber: loginPhoneSchema.optional(),
    panNumber: z
        .string()
        .regex(panRegex, 'Invalid PAN format'),
    nameOnPan: z.string().min(1, 'Name on PAN is required'),
    gstRegistered: z
        .string()
        .optional()
        .transform((val) => val === 'true' || val === '1'),
    gstNumber: z.string().optional(),
    gstLegalName: z.string().optional(),
    gstAddress: z.string().optional(),
    fssaiNumber: z.string().regex(/^\d{14}$/, 'FSSAI number must be 14 digits'),
    fssaiExpiry: z.string().min(1, 'FSSAI expiry is required'),
    accountNumber: z.string().regex(/^\d{9,18}$/, 'Account number must be 9 to 18 digits'),
    ifscCode: z.string().regex(/^[A-Z0-9]{11}$/, 'IFSC code must be 11 characters'),
    accountHolderName: z.string().min(1, 'Account holder name is required'),
    accountType: z.string().min(1, 'Account type is required'),
}).refine(
    (data) => Boolean(data.primaryContactNumber || data.ownerPhone),
    { message: 'Primary contact number is required', path: ['primaryContactNumber'] }
);

export const validateOnboardingStepDto = (stepNum, body) => {
    const step = Number(stepNum);
    const schema = step === 1 ? onboardingStep1Schema : step === 2 ? onboardingStep2Schema : step === 3 ? onboardingStep3Schema : null;
    if (!schema) {
        throw new ValidationError('Invalid onboarding step');
    }
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    const data = result.data;
    if (step === 2) {
        if (data.dayTimings && Array.isArray(data.dayTimings) && data.dayTimings.length > 0) {
            let hasOpenDay = false;
            for (const dt of data.dayTimings) {
                if (dt.isOpen) {
                    hasOpenDay = true;
                    const openingMinutes = timeToMinutes(dt.openingTime);
                    const closingMinutes = timeToMinutes(dt.closingTime);
                    if (openingMinutes !== null && closingMinutes !== null) {
                        if (openingMinutes === closingMinutes) {
                            throw new ValidationError(`Opening and closing time cannot be the same for ${dt.day}`);
                        }
                        if (closingMinutes < openingMinutes) {
                            throw new ValidationError(`Closing time cannot be less than opening time for ${dt.day}`);
                        }
                    } else {
                        throw new ValidationError(`Opening and closing time are required for ${dt.day}`);
                    }
                }
            }
            if (!hasOpenDay) {
                throw new ValidationError('Please set at least one day as open');
            }
        } else {
            const openingMinutes = timeToMinutes(data.openingTime);
            const closingMinutes = timeToMinutes(data.closingTime);
            if (openingMinutes !== null && closingMinutes !== null) {
                if (openingMinutes === closingMinutes) {
                    throw new ValidationError('Opening time and closing time cannot be same');
                }
                if (closingMinutes < openingMinutes) {
                    throw new ValidationError('Closing time cannot be less than opening time');
                }
            }
        }
    }
    return {
        ...data,
        gstRegistered: data.gstRegistered ?? false
    };
};

