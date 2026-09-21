import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ConstructionBanner — a picture shown in the carousel at the top of the
 * construction home screen in the customer app.
 *
 * The image is the banner; title and subtitle are optional text laid over it.
 * A banner can lead somewhere (`link`) and can be scheduled: with no start or end
 * date it runs until it is switched off, with dates it appears and disappears on
 * its own. That is what lets a festival offer be set up a week ahead and left.
 */
const constructionBannerSchema = new mongoose.Schema(
  {
    image: { type: String, required: true, trim: true },
    title: { type: String, default: '', trim: true, maxlength: 120 },
    subtitle: { type: String, default: '', trim: true, maxlength: 200 },

    /**
     * Where a tap goes: an in-app path ("/construction/enquiries") or a full
     * https:// URL. Empty means the banner is not tappable. Validated on the way
     * in so nothing like `javascript:` can ever be stored.
     */
    link: { type: String, default: '', trim: true, maxlength: 500 },

    /** Both optional. Null start = already started; null end = never ends. */
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    displayOrder: { type: Number, default: 0, index: true },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: actionPerformerSchema, default: null },
    createdBy: { type: actionPerformerSchema, default: null },
    updatedBy: { type: actionPerformerSchema, default: null },
  },
  {
    collection: 'construction_banners',
    timestamps: true,
  },
);

constructionBannerSchema.index({ isDeleted: 1, status: 1, displayOrder: 1 });

export const ConstructionBanner = mongoose.models.ConstructionBanner
  || mongoose.model('ConstructionBanner', constructionBannerSchema, 'construction_banners');
