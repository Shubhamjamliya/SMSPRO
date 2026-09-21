import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ConstructionBudgetService — one offering listed under Budget Friendly in the
 * customer app.
 *
 * Deliberately NOT a ConstructionService. The general catalogue is the list of
 * work that can be enquired about and quoted, and everything downstream — the
 * enquiry, contractor matching, the quotation, the project — hangs off it. A
 * budget-friendly offering is a showcase card: what it is, what it roughly costs,
 * what it includes. Keeping it in its own collection means editing a card can
 * never disturb an enquiry or a live project.
 *
 * The bridge is `catalogueServiceId`. Point it at the catalogue service that
 * enquiries for this offering should go to and the customer can tap through into
 * the normal enquiry flow. Leave it empty and the card is informational only.
 */
const constructionBudgetServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    tagline: { type: String, default: '', trim: true, maxlength: 160 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    image: { type: String, default: '', trim: true },
    /** Small label on the card, e.g. "Save more", "Popular". */
    badge: { type: String, default: '', trim: true, maxlength: 40 },

    /**
     * A "from" price, in whole rupees per `unit`. Optional: construction is usually
     * quoted after a site visit, and an empty price shows exactly that on the card
     * instead of an invented figure.
     */
    price: { type: Number, default: null, min: 0 },
    unit: { type: String, default: '', trim: true, maxlength: 40 },
    typicalDurationText: { type: String, default: '', trim: true, maxlength: 120 },
    /** What is included — shown as ticks on the card. */
    features: { type: [String], default: [] },

    /** The catalogue service enquiries for this offering are sent to. */
    catalogueServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionService',
      default: null,
      index: true,
    },

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
    collection: 'construction_budget_services',
    timestamps: true,
  },
);

constructionBudgetServiceSchema.index({ isDeleted: 1, status: 1, displayOrder: 1 });

export const ConstructionBudgetService = mongoose.models.ConstructionBudgetService
  || mongoose.model(
    'ConstructionBudgetService',
    constructionBudgetServiceSchema,
    'construction_budget_services',
  );
