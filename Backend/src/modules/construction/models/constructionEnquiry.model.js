import mongoose from 'mongoose';
import { Counter } from '../../../core/models/counter.model.js';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ConstructionEnquiry — a customer's request for work (BRD C3–C5, A4).
 *
 * The unit of the whole pipeline: every lead, site visit and quotation hangs off
 * one of these, and accepting a quotation turns it into a Project (Phase 5).
 *
 * `enquiryNumber` exists because BRD C5 asks for a reference the customer can
 * quote back — "silence after submitting a form makes people assume it failed".
 */
const ENQUIRY_STATUSES = [
  'submitted',        // customer sent it; matching has not run yet
  'matching',         // shortlist built, waiting on contractors to accept
  'visit_scheduled',  // at least one site visit booked
  'visit_completed',  // a contractor has surveyed the site
  'quoted',           // at least one quotation sent
  'negotiating',      // customer asked for a revision
  'accepted',         // customer accepted a quotation
  'converted',        // a Project was created from it (Phase 5)
  'closed_lost',      // customer walked away, or nobody quoted
  'expired',          // went stale with no activity
];

const URGENCY = ['flexible', 'within_month', 'within_week', 'immediate'];

const SITE_CONDITIONS = [
  'empty_plot',
  'existing_structure',
  'partially_built',
  'demolition_needed',
  'other',
];

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    /** BRD C4 distinguishes three kinds, and they mean different things to a
     *  contractor: what is there now, what was drawn, what the customer wants. */
    kind: {
      type: String,
      enum: ['site_photo', 'drawing', 'reference', 'other'],
      default: 'site_photo',
    },
    caption: { type: String, trim: true, default: '', maxlength: 200 },
  },
  { _id: false },
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ENQUIRY_STATUSES, required: true },
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: actionPerformerSchema, default: null },
  },
  { _id: false },
);

const constructionEnquirySchema = new mongoose.Schema(
  {
    enquiryNumber: { type: String, unique: true, sparse: true, trim: true },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionService',
      required: true,
      index: true,
    },
    /** Denormalised from the service so matching can filter on a contractor's
     *  trades without a join on every candidate. */
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionCategory',
      required: true,
      index: true,
    },

    description: { type: String, trim: true, default: '', maxlength: 3000 },

    // ---------- Where the work is (BRD C3) ----------
    site: {
      addressLine: { type: String, trim: true, default: '' },
      area: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '', index: true },
      state: { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true, default: '' },
      landmark: { type: String, trim: true, default: '' },
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: undefined },
      },
      plotArea: { type: Number, default: null, min: 0 },
      builtUpArea: { type: Number, default: null, min: 0 },
      areaUnit: { type: String, enum: ['sqft', 'sqm', 'sqyd', ''], default: 'sqft' },
      floors: { type: Number, default: null, min: 0, max: 200 },
      currentCondition: { type: String, enum: [...SITE_CONDITIONS, ''], default: '' },
    },

    /**
     * Set when the enquiry was raised from a Budget Friendly card, so the office can see
     * which offering it came from. Null for an enquiry raised from the general catalogue.
     */
    budgetServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionBudgetService',
      default: null,
      index: true,
    },

    // ---------- What they can spend and when (BRD C3) ----------
    budgetMin: { type: Number, default: null, min: 0 },
    budgetMax: { type: Number, default: null, min: 0 },
    urgency: { type: String, enum: URGENCY, default: 'flexible' },
    preferredStartDate: { type: Date, default: null },

    attachments: { type: [attachmentSchema], default: [] },

    // ---------- Pipeline ----------
    status: {
      type: String,
      enum: ENQUIRY_STATUSES,
      default: 'submitted',
      index: true,
    },
    statusHistory: { type: [statusHistorySchema], default: [] },

    /** Contractors shortlisted for this enquiry. Written by the matching pass;
     *  the customer chooses from these (the Q4 answer this build assumes). */
    shortlistedContractorIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
    }],

    acceptedQuotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      default: null,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionProject',
      default: null,
    },

    closedReason: { type: String, trim: true, default: '' },

    /**
     * BRD A4 — "enquiries that have gone quiet are highlighted so someone can
     * follow up. Every lost enquiry is lost revenue, and most are lost through
     * simple neglect." Bumped on every meaningful event.
     */
    lastActivityAt: { type: Date, default: Date.now, index: true },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'construction_enquiries',
    timestamps: true,
  },
);

constructionEnquirySchema.index({ customerId: 1, createdAt: -1 });
constructionEnquirySchema.index({ status: 1, lastActivityAt: 1 });
constructionEnquirySchema.index({ categoryId: 1, status: 1, 'site.city': 1 });
constructionEnquirySchema.index({ 'site.location': '2dsphere' });

/**
 * Drop the geo sub-document entirely when there is no pin.
 *
 * `location.type` has a schema default of 'Point' but `coordinates` does not, so
 * an enquiry submitted without a map pin persists as `{ type: 'Point' }` — which
 * the 2dsphere index rejects outright ("Point must be an array or object"),
 * failing the whole save. Picking a pin is optional in the form, so this must be
 * a valid state rather than an error.
 */
constructionEnquirySchema.pre('validate', function stripEmptyGeo(next) {
  const coords = this.site?.location?.coordinates;
  if (this.site && (!Array.isArray(coords) || coords.length !== 2)) {
    this.site.location = undefined;
  }
  next();
});

constructionEnquirySchema.pre('validate', function checkBudget(next) {
  if (
    this.budgetMin != null
    && this.budgetMax != null
    && Number(this.budgetMax) < Number(this.budgetMin)
  ) {
    return next(new Error('Maximum budget cannot be less than the minimum'));
  }
  next();
});

constructionEnquirySchema.pre('save', async function assignNumber(next) {
  if (!this.isNew || this.enquiryNumber) return next();
  try {
    const counter = await Counter.findOneAndUpdate(
      { model: 'ConstructionEnquiry' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    this.enquiryNumber = `ENQ${String(counter.seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

export const ConstructionEnquiry = mongoose.models.ConstructionEnquiry
  || mongoose.model('ConstructionEnquiry', constructionEnquirySchema, 'construction_enquiries');

export const ENQUIRY_STATUS_VALUES = ENQUIRY_STATUSES;
export const ENQUIRY_URGENCY_VALUES = URGENCY;
export const ENQUIRY_SITE_CONDITIONS = SITE_CONDITIONS;
