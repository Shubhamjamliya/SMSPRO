import mongoose from 'mongoose';
import { FoodUser } from '../../../../core/users/user.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { geocodeAddress } from '../../../../core/location/location.service.js';
import { logger } from '../../../../utils/logger.js';

const toGeoPoint = ({ latitude, longitude }) => {
    if (latitude === undefined || longitude === undefined) return undefined;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return { type: 'Point', coordinates: [lng, lat] };
};

const normalizeZip = (dto) => String(dto.zipCode || dto.pincode || dto.postalCode || '').trim();

/**
 * Every stored address should carry coordinates (pricing, dispatch and
 * tracking all depend on them). When the client couldn't provide lat/lng
 * (e.g. manual form entry), geocode the typed address server-side.
 */
const resolveGeoPoint = async (dto) => {
    const provided = toGeoPoint(dto);
    if (provided) return provided;

    const text = [dto.street, dto.area, dto.city, dto.state, normalizeZip(dto)]
        .filter(Boolean)
        .join(', ');
    if (!text) return undefined;

    try {
        const geocoded = await geocodeAddress(text);
        if (geocoded) {
            return { type: 'Point', coordinates: [geocoded.longitude, geocoded.latitude] };
        }
    } catch (err) {
        logger.warn(`Address geocode fallback failed: ${err.message}`);
    }
    return undefined;
};

const normalizeLabel = (label) => {
    const v = String(label || '').trim();
    if (v === 'Work') return 'Office';
    if (v === 'home' || v === 'Home') return 'Home';
    if (v === 'office' || v === 'Office') return 'Office';
    if (v === 'other' || v === 'Other') return 'Other';
    return 'Other';
};

export const listAddresses = async (userId) => {
    const user = await FoodUser.findById(userId).select('addresses').lean();
    return { addresses: user?.addresses || [] };
};

export const addAddress = async (userId, dto) => {
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = {
        label: normalizeLabel(dto.label),
        street: dto.street,
        additionalDetails: dto.additionalDetails || '',
        city: dto.city,
        state: dto.state,
        zipCode: normalizeZip(dto),
        area: dto.area || '',
        landmark: dto.landmark || '',
        formattedAddress: dto.formattedAddress || '',
        placeId: dto.placeId || '',
        phone: dto.phone || '',
        location: await resolveGeoPoint(dto),
        isDefault: false
    };

    // Home/Office stay single-entry; Other always creates a new address.
    if (address.label === 'Home' || address.label === 'Office') {
        const existingIdx = user.addresses.findIndex((a) => String(a?.label) === String(address.label));
        if (existingIdx >= 0) {
            const existing = user.addresses[existingIdx];
            existing.label = address.label;
            existing.street = address.street;
            existing.additionalDetails = address.additionalDetails;
            existing.city = address.city;
            existing.state = address.state;
            existing.zipCode = address.zipCode;
            existing.area = address.area;
            existing.landmark = address.landmark;
            existing.formattedAddress = address.formattedAddress;
            existing.placeId = address.placeId;
            existing.phone = address.phone;
            if (address.location) existing.location = address.location;
            await user.save();
            return { address: existing.toObject() };
        }
    }

    // First address becomes default automatically
    if (!user.addresses.some((a) => a.isDefault)) {
        address.isDefault = true;
    }

    user.addresses.push(address);
    await user.save();
    const saved = user.addresses[user.addresses.length - 1];
    return { address: saved.toObject() };
};

export const updateAddress = async (userId, addressId, dto) => {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        throw new ValidationError('Invalid address id');
    }
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new ValidationError('Address not found');

    if (dto.label !== undefined) address.label = normalizeLabel(dto.label);
    if (dto.street !== undefined) address.street = dto.street;
    if (dto.additionalDetails !== undefined) address.additionalDetails = dto.additionalDetails || '';
    if (dto.city !== undefined) address.city = dto.city;
    if (dto.state !== undefined) address.state = dto.state;
    if (dto.zipCode !== undefined || dto.pincode !== undefined || dto.postalCode !== undefined) {
        address.zipCode = normalizeZip(dto);
    }
    if (dto.area !== undefined) address.area = dto.area || '';
    if (dto.landmark !== undefined) address.landmark = dto.landmark || '';
    if (dto.formattedAddress !== undefined) address.formattedAddress = dto.formattedAddress || '';
    if (dto.placeId !== undefined) address.placeId = dto.placeId || '';
    if (dto.phone !== undefined) address.phone = dto.phone || '';
    const location = toGeoPoint(dto) || (await resolveGeoPoint(dto));
    if (location) address.location = location;

    await user.save();
    return { address: address.toObject() };
};

export const deleteAddress = async (userId, addressId) => {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        throw new ValidationError('Invalid address id');
    }
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new ValidationError('Address not found');

    const wasDefault = !!address.isDefault;
    address.deleteOne();

    // If deleting default, promote the newest remaining address to default
    if (wasDefault) {
        const remaining = user.addresses.filter(Boolean);
        if (remaining.length) {
            remaining.forEach((a) => {
                a.isDefault = false;
            });
            remaining[remaining.length - 1].isDefault = true;
        }
    }

    await user.save();
    return { success: true };
};

export const setDefaultAddress = async (userId, addressId) => {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        throw new ValidationError('Invalid address id');
    }
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new ValidationError('Address not found');

    user.addresses.forEach((a) => {
        a.isDefault = String(a._id) === String(addressId);
    });
    await user.save();

    const updated = user.addresses.id(addressId);
    return { address: updated?.toObject() };
};

