import mongoose from 'mongoose';

/**
 * Generic cache for Google Maps lookups (reverse geocode, geocode, road distance).
 * Keyed by a deterministic string (e.g. "rev:22.71961:75.85770" or
 * "dist:22.71961,75.85770:22.75000,75.89000"). Entries expire via TTL index.
 */
const geoCacheSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        kind: { type: String, enum: ['reverse', 'geocode', 'distance', 'place'], required: true, index: true },
        payload: { type: mongoose.Schema.Types.Mixed, default: null },
        expiresAt: { type: Date, required: true }
    },
    { collection: 'geo_cache', timestamps: true }
);

geoCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GeoCache = mongoose.model('GeoCache', geoCacheSchema, 'geo_cache');
