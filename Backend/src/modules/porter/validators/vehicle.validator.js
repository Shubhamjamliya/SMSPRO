import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const capacityBodySchema = z.object({
    maxWeight: z.coerce.number().min(0, 'Max weight must be >= 0'),
    maxLengthCm: z.coerce.number().min(0, 'Length must be >= 0').optional().default(0),
    maxWidthCm: z.coerce.number().min(0, 'Width must be >= 0').optional().default(0),
    maxHeightCm: z.coerce.number().min(0, 'Height must be >= 0').optional().default(0),
    sizeLabel: z.string().max(120).optional().default(''),
    description: z.string().max(500).optional().default(''),
});

export const validateVehicleCapacityDto = (body = {}) => {
    const result = capacityBodySchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    const data = result.data;
    if (data.maxWeight <= 0) {
        throw new ValidationError('Max weight is required');
    }
    if (!(data.maxLengthCm > 0 && data.maxWidthCm > 0 && data.maxHeightCm > 0)) {
        throw new ValidationError('Size capacity (length, width, height in cm) is required');
    }
    return {
        minWeight: 0,
        maxWeight: data.maxWeight,
        maxLengthCm: data.maxLengthCm,
        maxWidthCm: data.maxWidthCm,
        maxHeightCm: data.maxHeightCm,
        sizeLabel: String(data.sizeLabel || '').trim(),
        description: String(data.description || '').trim(),
    };
};

/** @deprecated Vehicle create moved to Global Settings */
export const validateCreateVehicleDto = () => {
    throw new ValidationError('Create vehicles in Global Settings → Vehicle Configuration.');
};

/** Capacity updates use validateVehicleCapacityDto */
export const validateUpdateVehicleDto = (body = {}) => validateVehicleCapacityDto(body);

export const validateVehicleId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid vehicle id');
    }
    return String(id);
};

export const validateVehicleStatusDto = () => {
    throw new ValidationError('Change vehicle status in Global Settings → Vehicle Configuration.');
};
