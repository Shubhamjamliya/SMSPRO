import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ConstructionMaterial — one construction material on sale: a brand of cement,
 * a grade of TMT bar, a tile.
 *
 * Unlike ConstructionService, a material DOES carry a price. A service is quoted
 * after a site visit because every site differs; a bag of cement costs what it
 * costs. That is the "transparent pricing" the customer app promises under
 * Material Services.
 *
 * The price is the list rate the customer sees. It is copied into a
 * MaterialRequest at the moment they ask for a quote, so changing a price later
 * never rewrites a request that was already made.
 */
const constructionMaterialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    brand: { type: String, default: '', trim: true, maxlength: 80 },

    /**
     * Free text on purpose (Cement, Steel, Tiles…). Admin picks the groupings and a
     * new one should never need a release; the customer app builds its filter chips
     * from whatever categories currently have active materials.
     */
    category: { type: String, required: true, trim: true, maxlength: 80, index: true },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    image: { type: String, default: '', trim: true },

    /** Rupees per `unit`. Not forced to whole rupees — steel is priced per kg. */
    price: { type: Number, required: true, min: 0 },
    /** What the price is for, e.g. "per bag (50 kg)", "per kg", "per sq.ft". */
    unit: { type: String, default: 'per unit', trim: true, maxlength: 40 },
    /** Smallest quantity worth requesting; the app's quantity control starts here. */
    minOrderQty: { type: Number, default: 1, min: 0 },
    /** Out-of-stock items stay visible but cannot be added to a request. */
    inStock: { type: Boolean, default: true },
    specifications: { type: [String], default: [] },

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
    collection: 'construction_materials',
    timestamps: true,
  },
);

constructionMaterialSchema.index({ isDeleted: 1, status: 1, category: 1, displayOrder: 1 });

export const ConstructionMaterial = mongoose.models.ConstructionMaterial
  || mongoose.model(
    'ConstructionMaterial',
    constructionMaterialSchema,
    'construction_materials',
  );
