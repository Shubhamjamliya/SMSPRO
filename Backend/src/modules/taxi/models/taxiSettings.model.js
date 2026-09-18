import mongoose from 'mongoose';

/**
 * Singleton taxi module settings (one document, key = "default").
 */
const taxiSettingsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            default: 'default',
            unique: true,
            index: true,
        },
        /** Max distance (km) from pickup to offer a ride to a driver */
        searchRadiusKm: {
            type: Number,
            default: 8,
            min: 1,
            max: 100,
        },
    },
    {
        collection: 'taxi_settings',
        timestamps: true,
    },
);

export const TaxiSettings = mongoose.models.TaxiSettings
    || mongoose.model('TaxiSettings', taxiSettingsSchema, 'taxi_settings');
