import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const requirePlace = (place, label) => {
    if (!place || typeof place !== 'object') {
        throw new ValidationError(`${label} is required`);
    }
    const lat = Number(place.lat ?? place.latitude);
    const lng = Number(place.lng ?? place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new ValidationError(`${label} lat/lng are required`);
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new ValidationError(`Invalid ${label} coordinates`);
    }
    return {
        address: String(place.address || '').trim(),
        lat,
        lng,
        placeId: String(place.placeId || '').trim(),
    };
};

export const validateRideId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid ride id');
    }
    return String(id);
};

export const validateQuoteDto = (body = {}) => {
    const pickup = requirePlace(body.pickup, 'Pickup');
    const drop = requirePlace(body.drop, 'Drop');
    const vehicleTypeId = String(body.vehicleTypeId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(vehicleTypeId)) {
        throw new ValidationError('Valid vehicleTypeId is required');
    }
    return {
        pickup,
        drop,
        vehicleTypeId,
        zoneId: body.zoneId && mongoose.Types.ObjectId.isValid(String(body.zoneId))
            ? String(body.zoneId)
            : null,
        paymentMethod: String(body.paymentMethod || body.payment?.method || 'cash').trim() || 'cash',
        couponCode: String(body.couponCode || body.coupon || '').trim().toUpperCase() || null,
        // Optional client-cached road distance (reuse until pickup/drop change)
        distanceKm: (() => {
            const n = Number(body.distanceKm);
            return Number.isFinite(n) && n > 0 ? n : null;
        })(),
        durationMin: (() => {
            const n = Number(body.durationMin);
            return Number.isFinite(n) && n > 0 ? n : null;
        })(),
    };
};

export const validateCreateRideDto = (body = {}) => {
    const quote = validateQuoteDto(body);
    return {
        ...quote,
        paymentMethod: String(body.paymentMethod || body.payment?.method || 'cash').trim() || 'cash',
    };
};

export const validateCancelRideDto = (body = {}) => ({
    reason: String(body.reason || body.cancelReason || '').trim().slice(0, 500),
});

export const validateStartRideDto = (body = {}) => {
    const otp = String(body.otp || body.rideOtp || '').trim();
    if (!/^\d{6}$/.test(otp)) {
        throw new ValidationError('Valid 6-digit OTP is required');
    }
    return { otp };
};
