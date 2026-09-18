import mongoose from 'mongoose';

/**
 * QuotationTemplate — a contractor's saved starting point (BRD W13).
 *
 * "Speed of quoting directly affects how many jobs a contractor wins" — a
 * similar job should take minutes rather than hours. Templates hold structure
 * and rates, never a customer or an enquiry.
 *
 * Deliberately NOT versioned or validated to 100%: a template is a draft aid,
 * and a contractor may reasonably save a partial one. The real Quotation
 * enforces every rule when it is actually built.
 */
const templateItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 500 },
    quantity: { type: Number, default: 1, min: 0 },
    unit: { type: String, trim: true, default: '' },
    rate: { type: Number, default: 0, min: 0 },
    remarks: { type: String, trim: true, default: '', maxlength: 300 },
  },
  { _id: false },
);

const templateSectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    items: { type: [templateItemSchema], default: [] },
  },
  { _id: false },
);

const templateStageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, default: '', maxlength: 500 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    targetDays: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const quotationTemplateSchema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    /** Optional link to the kind of work this template suits. */
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionCategory',
      default: null,
    },
    sections: { type: [templateSectionSchema], default: [] },
    terms: { type: String, trim: true, default: '', maxlength: 5000 },
    exclusions: { type: String, trim: true, default: '', maxlength: 5000 },
    proposedStages: { type: [templateStageSchema], default: [] },
    /** How often it has been used — lets the UI put the useful ones first. */
    useCount: { type: Number, default: 0, min: 0 },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'construction_quotation_templates',
    timestamps: true,
  },
);

quotationTemplateSchema.index({ contractorId: 1, isDeleted: 1, useCount: -1 });
quotationTemplateSchema.index(
  { contractorId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

export const QuotationTemplate = mongoose.models.QuotationTemplate
  || mongoose.model(
    'QuotationTemplate',
    quotationTemplateSchema,
    'construction_quotation_templates',
  );
