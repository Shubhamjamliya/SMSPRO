import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const seatsBodySchema = z.object({
    seats: z.coerce.number().int().min(1, 'Seats must be at least 1').max(20, 'Seats cannot exceed 20'),
});

export const validateVehicleSeatsDto = (body = {}) => {
    const result = seatsBodySchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return { seats: result.data.seats };
};

/** @deprecated Vehicle create moved to Global Settings */
export const validateCreateVehicleTypeDto = () => {
    throw new ValidationError('Create vehicles in Global Settings → Vehicle Configuration.');
};

export const validateUpdateVehicleTypeDto = (body = {}) => validateVehicleSeatsDto(body);

export const validateVehicleTypeId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid vehicle type id');
    }
    return String(id);
};

export const validateVehicleTypeStatusDto = () => {
    throw new ValidationError('Change vehicle status in Global Settings → Vehicle Configuration.');
};
