import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ConstructionService — one kind of construction work on offer (BRD C1, C2).
 *
 * Deliberately has NO price field, unlike every other catalogue in this platform.
 * Construction work is quoted after a site visit, never published as a rate — that
 * difference is the whole reason the module exists. What lives here instead is the
 * information a customer needs to pick the right service and know what to expect
 * (C2), plus the defaults a contractor's quote and stage plan start from.
 */
const stageTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    /** Share of the agreed project value this stage is worth. */
    percentage: { type: Number, required: true, min: 0, max: 100 },
    /** Rough working days from project start; refined per project when quoted. */
    typicalDurationDays: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

/**
 * Where a catalogue picture came from.
 *
 * Freely-licensed photo libraries (Wikimedia Commons and similar) mostly use
 * CC-BY / CC-BY-SA, which permit commercial use but REQUIRE the photographer to
 * be credited. Storing the credit next to the image is what makes that possible
 * — a URL on its own is a licence breach waiting to happen.
 *
 * Left empty for images the platform owns or uploaded itself, and for CC0 /
 * public-domain images, which carry no attribution obligation.
 */
const imageAttributionSchema = new mongoose.Schema(
  {
    author: { type: String, default: '', trim: true },
    license: { type: String, default: '', trim: true },
    sourceUrl: { type: String, default: '', trim: true },
    provider: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const constructionServiceSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionCategory',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, index: true },
    slug: { type: String, trim: true, lowercase: true },
    description: { type: String, default: '', trim: true, maxlength: 3000 },
    icon: { type: String, default: '', trim: true },
    coverImage: { type: String, default: '', trim: true },
    imageAttribution: { type: imageAttributionSchema, default: null },

    /** BRD C2 — "what it typically covers" and what it does not. Shown before the
     *  customer enquires so expectations are set early, which is also the cheapest
     *  way to prevent the scope arguments described in BRD W11. */
    covers: { type: [String], default: [] },
    excludes: { type: [String], default: [] },

    /**
     * Free text, not minutes. A bathroom renovation is "3 to 5 weeks" and a house
     * is "8 to 14 months" — ranges, not numbers, and the honest answer is a phrase.
     */
    typicalDurationText: { type: String, default: '', trim: true, maxlength: 120 },

    /** Helps a customer self-select before filling in an enquiry (BRD C3). */
    typicalBudget: {
      min: { type: Number, default: null, min: 0 },
      max: { type: Number, default: null, min: 0 },
    },

    /** Default unit a quotation's line items are measured in (BRD W10). */
    defaultUnit: {
      type: String,
      enum: ['sqft', 'sqm', 'rft', 'rmt', 'cuft', 'cum', 'nos', 'lumpsum', 'day', ''],
      default: '',
    },

    /** Sections a quote for this service starts with — civil, electrical, finishing. */
    defaultQuoteSections: { type: [String], default: [] },

    /**
     * Used only when ConstructionSettings.stages.mode is 'platform_fixed'.
     * In the default 'contractor_proposed' mode the contractor sets stages in the
     * quote and this is ignored. Percentages are validated to total 100 on save.
     */
    defaultStages: { type: [stageTemplateSchema], default: [] },

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
    collection: 'construction_services',
    timestamps: true,
  },
);

constructionServiceSchema.index({ isDeleted: 1, status: 1, categoryId: 1, displayOrder: 1 });
// See the note in constructionCategory.model.js — $ne is not a valid partial
// index expression, so this must use an equality match on isDeleted.
constructionServiceSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, slug: { $type: 'string' } } },
);

/** A stage plan that does not total 100% would silently under- or over-collect. */
constructionServiceSchema.pre('validate', function checkStageTotals(next) {
  const stages = Array.isArray(this.defaultStages) ? this.defaultStages : [];
  if (stages.length) {
    const total = Math.round(
      stages.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0) * 100,
    ) / 100;
    if (total !== 100) {
      return next(new Error(`Default stage percentages must total 100 — they currently total ${total}`));
    }
  }
  const { min, max } = this.typicalBudget || {};
  if (min != null && max != null && Number(max) < Number(min)) {
    return next(new Error('Typical budget maximum cannot be less than the minimum'));
  }
  next();
});

export const ConstructionService = mongoose.models.ConstructionService
  || mongoose.model(
    'ConstructionService',
    constructionServiceSchema,
    'construction_services',
  );
