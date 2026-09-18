import mongoose from 'mongoose';

/**
 * ContractorPortfolio — photographs and descriptions of completed work (BRD W5).
 *
 * Good work is a contractor's best sales tool and most have no way to show it.
 * These entries appear on the public contractor profile (BRD C7), which is where
 * a customer actually decides whether to trust someone — without it, every
 * contractor on the list looks identical.
 *
 * Entries are self-declared, so they carry a `verified` flag your team can set
 * once a project completed on the platform. Work done off-platform can still be
 * shown; it simply is not badged.
 */
const contractorPortfolioSchema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    /** Which kind of work this was — lets the profile group past work sensibly. */
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionCategory',
      default: null,
    },
    images: { type: [String], default: [] },
    location: { type: String, trim: true, default: '' },
    /** Indicative value. Optional — many contractors will not want to publish it. */
    projectValue: { type: Number, default: null, min: 0 },
    completedAt: { type: Date, default: null },

    /** Set by your team when this entry corresponds to a project completed on
     *  the platform. Self-declared work stays unverified rather than hidden. */
    verified: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'construction_contractor_portfolio',
    timestamps: true,
  },
);

contractorPortfolioSchema.index({ contractorId: 1, isDeleted: 1, displayOrder: 1 });

contractorPortfolioSchema.pre('validate', function checkImages(next) {
  if (!Array.isArray(this.images) || this.images.length === 0) {
    return next(new Error('Add at least one photograph of the completed work'));
  }
  if (this.images.length > 12) {
    return next(new Error('A portfolio entry can hold at most 12 photographs'));
  }
  next();
});

export const ContractorPortfolio = mongoose.models.ContractorPortfolio
  || mongoose.model(
    'ContractorPortfolio',
    contractorPortfolioSchema,
    'construction_contractor_portfolio',
  );
