import mongoose from 'mongoose';

const userAddressSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            enum: ['Home', 'Office', 'Other'],
            default: 'Home',
            index: true
        },
        street: {
            type: String,
            required: true,
            trim: true
        },
        additionalDetails: {
            type: String,
            default: '',
            trim: true
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        state: {
            type: String,
            required: true,
            trim: true
        },
        zipCode: {
            type: String,
            default: '',
            trim: true
        },
        area: {
            type: String,
            default: '',
            trim: true
        },
        landmark: {
            type: String,
            default: '',
            trim: true
        },
        formattedAddress: {
            type: String,
            default: '',
            trim: true
        },
        placeId: {
            type: String,
            default: '',
            trim: true
        },
        phone: {
            type: String,
            default: '',
            trim: true
        },
        location: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                // [lng, lat]
                type: [Number],
                default: undefined,
                validate: {
                    validator: (v) =>
                        v === undefined ||
                        (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))),
                    message: 'location.coordinates must be [lng, lat]'
                }
            }
        },
        isDefault: {
            type: Boolean,
            default: false,
            index: true
        }
    },
    { _id: true, timestamps: true }
);

const userSchema = new mongoose.Schema(
    {
        phone: {
            type: String,
            required: false,
            trim: true
        },
        alternatePhone: {
            type: String,
            default: '',
            trim: true
        },
        countryCode: {
            type: String,
            default: '+91'
        },
        name: {
            type: String
        },
        email: {
            type: String
        },
        profileImage: {
            type: String,
            default: ''
        },
        fcmTokens: {
            type: [String],
            default: []
        },
        fcmTokenMobile: {
            type: [String],
            default: []
        },
        dateOfBirth: {
            type: Date,
            default: null
        },
        anniversary: {
            type: Date,
            default: null
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'other', 'prefer-not-to-say', ''],
            default: ''
        },
        referralCode: {
            type: String
        },
        referredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            default: null,
            index: true
        },
        referralCount: {
            type: Number,
            default: 0,
            min: 0
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        isCodAllowed: {
            type: Boolean,
            default: true,
            index: true
        },
        role: {
            type: String,
            default: 'USER'
        },
        walletBalance: {
            type: Number,
            default: 0,
            min: 0
        },
        /**
         * DEPRECATED legacy single-address field (kept for porter admin text edits).
         * Coordinates must NOT be stored here — the app has exactly two coordinate
         * stores per user: `addresses[].location` (saved address pins, GeoJSON)
         * and `liveLocation.location` (current GPS, GeoJSON, overwritten in place).
         */
        address: {
            street: { type: String, trim: true },
            city: { type: String, trim: true },
            state: { type: String, trim: true },
            zipCode: { type: String, trim: true },
            country: { type: String, default: 'India', trim: true }
        },
        aadhaarNumber: { type: String, trim: true },
        aadhaarFront: { type: String },
        aadhaarBack: { type: String },
        panNumber: { type: String, trim: true },
        panCardImage: { type: String },
        /** Passport (Bike Rent / shared user profile) */
        passportNumber: { type: String, trim: true },
        passportImage: { type: String },
        /** Voter ID (Bike Rent / shared user profile) */
        voterIdNumber: { type: String, trim: true },
        voterIdImage: { type: String },
        /** Customer driving license (Bike Rent / shared user profile) */
        drivingLicenseNumber: {
            type: String,
            default: '',
            trim: true,
            uppercase: true,
        },
        drivingLicenseFront: { type: String, default: '' },
        drivingLicenseBack: { type: String, default: '' },
        termsAccepted: { type: Boolean, default: false },
        registrationStep: {
            type: Number,
            default: 1
        },
        isContactSynced: {
            type: Boolean,
            default: false
        },
        contactPermissionStatus: {
            type: String,
            enum: ['PENDING', 'ALLOWED', 'DENIED', 'SKIPPED'],
            default: 'PENDING'
        },
        otp: {
            type: String,
            select: false
        },
        otpExpires: {
            type: Date,
            select: false
        },
        profileImagePublicId: {
            type: String,
            default: null
        },
        isBlocked: {
            type: Boolean,
            default: false
        },
        isDeleted: {
            type: Boolean,
            default: false
        },
        accountStatus: {
            type: String,
            enum: ['active', 'deleted'],
            default: 'active'
        },
        addresses: {
            type: [userAddressSchema],
            default: []
        },

        /**
         * Last known live location of the user (device GPS), used for
         * nearby-restaurant defaults and delivery estimates before an
         * address is selected. Updated via PATCH /food/user/location.
         */
        liveLocation: {
            location: {
                type: {
                    type: String,
                    enum: ['Point'],
                    default: 'Point'
                },
                coordinates: {
                    // [lng, lat]
                    type: [Number],
                    default: undefined
                }
            },
            accuracy: { type: Number, default: null },
            street: { type: String, default: '', trim: true },
            area: { type: String, default: '', trim: true },
            landmark: { type: String, default: '', trim: true },
            city: { type: String, default: '', trim: true },
            state: { type: String, default: '', trim: true },
            zipCode: { type: String, default: '', trim: true },
            country: { type: String, default: '', trim: true },
            formattedAddress: { type: String, default: '', trim: true },
            updatedAt: { type: Date, default: null }
        },

        deletionRequest: {
            status: {
                type: String,
                enum: ['none', 'pending', 'approved', 'rejected'],
                default: 'none',
                index: true
            },
            reason: {
                type: String,
                default: '',
                trim: true
            },
            requestedAt: {
                type: Date,
                default: null
            },
            reviewedAt: {
                type: Date,
                default: null
            }
        }
    },
    {
        collection: 'users',
        timestamps: true
    }
);

userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ 'addresses.location': '2dsphere' });

export const FoodUser = mongoose.model('FoodUser', userSchema, 'common_users');

