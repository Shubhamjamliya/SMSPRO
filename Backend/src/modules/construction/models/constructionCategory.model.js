import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ConstructionCategory — the top level of the service list customers browse (BRD C1).
 *
 * Fully admin-managed (BRD A8): the list will change often and must never need a
 * software release. This is also what settles BRD open question 3 — SMS Pro Venture
 * fills in their own categories rather than us guessing them in code.
 */
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

const constructionCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    slug: { type: String, trim: true, lowercase: true },
    icon: { type: String, default: '', trim: true },
    /** Shown on the category card in the customer app. */
    coverImage: { type: String, default: '', trim: true },
    imageAttribution: { type: imageAttributionSchema, default: null },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
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
    collection: 'construction_categories',
    timestamps: true,
  },
);

constructionCategorySchema.index({ isDeleted: 1, status: 1, displayOrder: 1 });
// partialFilterExpression only supports equality-style operators — $ne is rejected
// outright by MongoDB, which silently leaves the index unbuilt. `isDeleted: false`
// is equivalent here because the field has a schema default and is always stored.
constructionCategorySchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, slug: { $type: 'string' } } },
);

export const ConstructionCategory = mongoose.models.ConstructionCategory
  || mongoose.model(
    'ConstructionCategory',
    constructionCategorySchema,
    'construction_categories',
  );
