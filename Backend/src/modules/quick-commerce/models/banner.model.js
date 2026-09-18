import mongoose from 'mongoose';

const BANNER_STATUS = Object.freeze({
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  EXPIRED: 'expired',
});

const quickBannerSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    startAt: {
      type: Date,
      required: true,
      index: true,
    },
    endAt: {
      type: Date,
      required: true,
      index: true,
    },
    headerCategoryIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'quick_category' }],
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'At least one header category is required',
      },
    },
    // Empty array = Global Zone
    zoneIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'quick_zone' }],
      default: [],
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    isEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

quickBannerSchema.index({ isEnabled: 1, isDefault: 1, startAt: 1, endAt: 1 });
quickBannerSchema.index({ headerCategoryIds: 1, isEnabled: 1 });
quickBannerSchema.index({ zoneIds: 1, isEnabled: 1 });

export const BANNER_STATUS_VALUES = BANNER_STATUS;

export const QuickBanner = mongoose.model(
  'quick_banner',
  quickBannerSchema,
  'quick_banners',
);
