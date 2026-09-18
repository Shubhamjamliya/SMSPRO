import mongoose from 'mongoose';

/**
 * Canonical address building blocks, shared across modules so every stored
 * address carries the same fields (user address book, order deliveryAddress,
 * restaurant, seller, porter stops).
 *
 * Conventions:
 * - Geo is ALWAYS a GeoJSON Point: { type: 'Point', coordinates: [lng, lat] }.
 * - Postal code field is `zipCode` in Mongo (legacy name); `pincode` is accepted
 *   as an input alias by `normalizeAddressInput`.
 */

export const geoPointSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: {
            // [lng, lat]
            type: [Number],
            default: undefined,
            validate: {
                validator: (v) =>
                    v === undefined ||
                    (Array.isArray(v) &&
                        v.length === 2 &&
                        v.every((n) => typeof n === 'number' && Number.isFinite(n))),
                message: 'location.coordinates must be [lng, lat]'
            }
        }
    },
    { _id: false }
);

/** Field definitions for a canonical address. Spread into schemas that need them. */
export const canonicalAddressFields = {
    street: { type: String, default: '', trim: true },
    area: { type: String, default: '', trim: true },
    landmark: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    zipCode: { type: String, default: '', trim: true },
    country: { type: String, default: 'India', trim: true },
    formattedAddress: { type: String, default: '', trim: true },
    placeId: { type: String, default: '', trim: true },
    location: { type: geoPointSchema, default: undefined }
};

const cleanStr = (v) => String(v ?? '').trim();

/**
 * Normalize any of the address shapes floating around the app
 * (zipCode/pincode/postalCode, {lat,lng} vs GeoJSON, name vs formattedAddress)
 * into the canonical shape. Returns plain object; missing coords -> location undefined.
 */
export const normalizeAddressInput = (input = {}) => {
    const zip = cleanStr(input.zipCode || input.pincode || input.postalCode || input.postcode);

    let lat = Number(input.latitude ?? input.lat);
    let lng = Number(input.longitude ?? input.lng);
    const geo = input.location?.coordinates;
    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && Array.isArray(geo) && geo.length === 2) {
        lng = Number(geo[0]);
        lat = Number(geo[1]);
    }
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

    return {
        street: cleanStr(input.street || input.addressLine1 || input.addressLine),
        area: cleanStr(input.area || input.sublocality),
        landmark: cleanStr(input.landmark),
        city: cleanStr(input.city),
        state: cleanStr(input.state),
        zipCode: zip,
        country: cleanStr(input.country) || 'India',
        formattedAddress: cleanStr(input.formattedAddress || input.address || input.name),
        placeId: cleanStr(input.placeId),
        location: hasCoords ? { type: 'Point', coordinates: [lng, lat] } : undefined
    };
};

/** Convenience: extract {lat, lng} from a canonical (or legacy) address, else null. */
export const getAddressLatLng = (address = {}) => {
    const geo = address?.location?.coordinates;
    if (Array.isArray(geo) && geo.length === 2 && geo.every((n) => Number.isFinite(Number(n)))) {
        return { lat: Number(geo[1]), lng: Number(geo[0]) };
    }
    const lat = Number(address?.latitude ?? address?.lat ?? address?.coordinates?.lat);
    const lng = Number(address?.longitude ?? address?.lng ?? address?.coordinates?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return null;
};
