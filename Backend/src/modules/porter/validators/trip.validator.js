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

const normalizeParcel = (parcel = {}) => {
    if (!parcel || typeof parcel !== 'object') {
        return { description: '', weightKg: 0, size: '', goodsTypeId: null, goodsTypeName: '' };
    }
    const weightKg = Number(parcel.weightKg ?? parcel.weight ?? 0);
    const goodsTypeIdRaw = parcel.goodsTypeId || null;
    const goodsTypeId = goodsTypeIdRaw && mongoose.Types.ObjectId.isValid(String(goodsTypeIdRaw))
        ? String(goodsTypeIdRaw)
        : null;
    return {
        description: String(parcel.description || '').trim().slice(0, 500),
        weightKg: Number.isFinite(weightKg) && weightKg >= 0 ? weightKg : 0,
        size: String(parcel.size || '').trim().slice(0, 80),
        goodsTypeId,
        goodsTypeName: String(parcel.goodsTypeName || '').trim().slice(0, 80),
    };
};

export const validateTripId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid trip id');
    }
    return String(id);
};

export const validateQuoteDto = (body = {}) => {
    const pickup = requirePlace(body.pickup, 'Pickup');
    const drop = requirePlace(body.drop, 'Drop');
    const vehicleId = String(body.vehicleId || body.vehicleTypeId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
        throw new ValidationError('Valid vehicleId is required');
    }
    return {
        pickup,
        drop,
        vehicleId,
        zoneId: body.zoneId && mongoose.Types.ObjectId.isValid(String(body.zoneId))
            ? String(body.zoneId)
            : null,
        parcel: normalizeParcel(body.parcel),
        paymentMethod: String(body.paymentMethod || body.payment?.method || 'cash').trim() || 'cash',
    };
};

export const validateCreateTripDto = (body = {}) => {
    const quote = validateQuoteDto(body);
    return {
        ...quote,
        paymentMethod: String(body.paymentMethod || body.payment?.method || 'cash').trim() || 'cash',
    };
};

export const validateCancelTripDto = (body = {}) => ({
    reason: String(body.reason || body.cancelReason || '').trim().slice(0, 500),
});

export const validateStartTripDto = (body = {}) => {
    const otp = String(body.otp || body.deliveryOtp || '').trim();
    if (!/^\d{6}$/.test(otp)) {
        throw new ValidationError('Valid 6-digit OTP is required');
    }
    return { otp };
};
