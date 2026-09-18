import mongoose from 'mongoose';

/**
 * SiteVisit — the visit where a rough enquiry becomes a quotable job
 * (BRD C9, W8, W9).
 *
 * The structured report matters more than the appointment: it is what makes the
 * quote accurate, and it protects both sides if site conditions are disputed
 * later. `checkIn` records that the contractor was physically there, which is
 * exactly what BRD W9 asks for.
 */
const VISIT_STATUSES = ['proposed', 'confirmed', 'completed', 'cancelled', 'no_show'];

const ACCESS_LEVELS = ['easy', 'moderate', 'difficult', ''];

const visitReportSchema = new mongoose.Schema(
  {
    measurements: { type: String, trim: true, default: '', maxlength: 2000 },
    siteCondition: { type: String, trim: true, default: '', maxlength: 2000 },
    access: { type: String, enum: ACCESS_LEVELS, default: '' },
    waterAvailable: { type: Boolean, default: null },
    electricityAvailable: { type: Boolean, default: null },
    observations: { type: String, trim: true, default: '', maxlength: 3000 },
    photos: { type: [String], default: [] },
  },
  { _id: false },
);

const siteVisitSchema = new mongoose.Schema(
  {
    enquiryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionEnquiry',
      required: true,
      index: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },

    scheduledAt: { type: Date, required: true, index: true },
    /** Who suggested this slot — either side may propose, the other confirms. */
    proposedBy: { type: String, enum: ['customer', 'contractor'], required: true },
    confirmedAt: { type: Date, default: null },

    status: { type: String, enum: VISIT_STATUSES, default: 'proposed', index: true },
    cancelReason: { type: String, trim: true, default: '' },
    rescheduledFrom: { type: Date, default: null },

    /** Proof the contractor actually attended (BRD W9). */
    checkIn: {
      at: { type: Date, default: null },
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: undefined },
      },
      /** Metres from the enquiry's site pin. Large values are worth a look. */
      distanceFromSiteMeters: { type: Number, default: null },
    },

    report: { type: visitReportSchema, default: () => ({}) },
    completedAt: { type: Date, default: null },

    /** Set when settings.money.siteVisitCharged is on at the time of booking. */
    feeAmount: { type: Number, default: 0, min: 0 },
    feePaid: { type: Boolean, default: false },

    remindersSentAt: { type: [Date], default: [] },
  },
  {
    collection: 'construction_site_visits',
    timestamps: true,
  },
);

siteVisitSchema.index({ contractorId: 1, status: 1, scheduledAt: 1 });
siteVisitSchema.index({ enquiryId: 1, status: 1 });

siteVisitSchema.pre('validate', function checkCompletion(next) {
  if (this.status === 'completed') {
    const r = this.report || {};
    // A "completed" visit with an empty report is worthless — the report is the
    // entire point, and the quote that follows depends on it.
    if (!String(r.measurements || '').trim() && !String(r.observations || '').trim()) {
      return next(new Error('Record measurements or observations before completing the visit'));
    }
  }
  next();
});

export const SiteVisit = mongoose.models.SiteVisit
  || mongoose.model('SiteVisit', siteVisitSchema, 'construction_site_visits');

export const SITE_VISIT_STATUSES = VISIT_STATUSES;
