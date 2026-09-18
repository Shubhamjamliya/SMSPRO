import mongoose from 'mongoose';

/**
 * Singleton Porter module settings (one document, key = "default").
 */
const porterSettingsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            default: 'default',
            unique: true,
            index: true,
        },
        /** Max distance (km) from pickup to show / offer a vehicle type */
        searchRadiusKm: {
            type: Number,
            default: 5,
            min: 1,
            max: 100,
        },
        /** Items not allowed on Porter trips (shown in booking sheet) */
        restrictedItems: {
            type: [String],
            default: [],
        },
    },
    {
        collection: 'porter_settings',
        timestamps: true,
    },
);

export const PorterSettings = mongoose.models.PorterSettings
    || mongoose.model('PorterSettings', porterSettingsSchema, 'porter_settings');
