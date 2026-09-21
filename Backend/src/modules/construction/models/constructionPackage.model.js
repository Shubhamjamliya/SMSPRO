import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ConstructionPackage — a priced offering on the customer app's Residential and
 * Commercial screens (Silver / Gold / Diamond / Platinum homes, office fitouts…).
 *
 * This is a different thing from ConstructionService. A service has no price by
 * design — it is quoted after a site visit. A package is the opposite: a headline
 * rate per unit that the customer can use to size a budget before they enquire.
 * It is an indication, not a quote; the contractor's quotation still decides the
 * real number.
 *
 * `theme` and `icon` are keys, not CSS or component names. The customer app maps
 * them to real styles, so the admin panel can offer a fixed, safe palette and the
 * back end never stores markup.
 */
export const PACKAGE_SEGMENTS = ['residential', 'commercial'];
export const PACKAGE_THEMES = ['slate', 'amber', 'cyan', 'purple', 'blue', 'emerald'];
export const PACKAGE_ICONS = [
  'shield',
  'crown',
  'sparkles',
  'award',
  'building',
  'hardhat',
  'layers',
  'home',
];

const constructionPackageSchema = new mongoose.Schema(
  {
    segment: { type: String, enum: PACKAGE_SEGMENTS, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    tagline: { type: String, default: '', trim: true, maxlength: 160 },

    /** Rate in rupees per `unit`. Whole rupees — the app parses it back out of a string. */
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'per sq.ft', trim: true, maxlength: 40 },

    /**
     * What the customer pays up front for the site visit, in whole rupees. Set per
     * package from the admin panel. 0 means the visit is free and the request goes
     * straight to contractors; above 0 the customer pays first and the request is only
     * sent once the payment has been verified.
     */
    visitingFee: { type: Number, default: 0, min: 0 },

    /** Small label on the card, e.g. "Most Popular", "Luxury". */
    badge: { type: String, default: '', trim: true, maxlength: 40 },
    isPopular: { type: Boolean, default: false },
    theme: { type: String, enum: PACKAGE_THEMES, default: 'slate' },
    icon: { type: String, enum: PACKAGE_ICONS, default: 'building' },

    /** Residential cards list what is included; commercial cards use a short description. */
    features: { type: [String], default: [] },
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
    collection: 'construction_packages',
    timestamps: true,
  },
);

constructionPackageSchema.index({ isDeleted: 1, segment: 1, status: 1, displayOrder: 1 });

export const ConstructionPackage = mongoose.models.ConstructionPackage
  || mongoose.model(
    'ConstructionPackage',
    constructionPackageSchema,
    'construction_packages',
  );
