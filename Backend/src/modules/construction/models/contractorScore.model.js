import mongoose from 'mongoose';

/**
 * ContractorScore — the trust score (BRD W18).
 *
 * "A score built from completed work, customer ratings, complaint history,
 * whether documents are current, and how quickly they respond. Gives contractors
 * a concrete reason to behave well, and gives customers something to compare."
 *
 * WHY THIS IS A TABLE AND NOT A COMPUTED PROPERTY
 * A score a contractor cannot interrogate is a score they will not trust, and
 * one they cannot act on. Storing each component separately means the contractor
 * screen can say "your documents are expired, that is costing you 15 points"
 * instead of showing a number that moved for reasons nobody can explain. It also
 * makes the score cheap to sort and filter on during matching.
 *
 * THE COMPONENTS, and why each is weighted as it is
 *
 *   completion  25  Finishing what you start is the single strongest signal in
 *                   construction. Abandoned projects are the failure mode that
 *                   hurts customers most.
 *   rating      25  What customers actually said. Equal weight to completion:
 *                   finishing badly is not much better than not finishing.
 *   disputes    20  Complaint history. Weighted heavily because a contractor who
 *                   generates disputes costs the platform real support time and
 *                   costs customers real money.
 *   compliance  15  Whether licence and insurance are current. Binary-ish and
 *                   entirely within the contractor's control, so it is a fair
 *                   thing to score and an easy thing to fix.
 *   response    15  How quickly they answer leads. Matters commercially — BRD W7
 *                   says a fast decline beats a slow non-answer — but it is the
 *                   weakest signal of actual build quality, so it is smallest.
 *
 * A NEW CONTRACTOR IS NOT A BAD CONTRACTOR
 * With no history, every component would score zero and a newly approved
 * contractor would look worse than one with a string of complaints. So a
 * contractor below `minProjectsForFullScore` is marked `provisional` and shown
 * as "New" rather than as a low number.
 */
const componentSchema = new mongoose.Schema(
  {
    /** 0–100 before weighting. */
    value: { type: Number, default: 0, min: 0, max: 100 },
    weight: { type: Number, default: 0, min: 0, max: 100 },
    /** Plain-English reason, shown to the contractor on their own screen. */
    detail: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { _id: false },
);

const contractorScoreSchema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      unique: true,
      index: true,
    },

    /** 0–100, the weighted sum of the components below. */
    score: { type: Number, default: 0, min: 0, max: 100, index: true },
    band: {
      type: String,
      enum: ['new', 'building', 'good', 'excellent'],
      default: 'new',
      index: true,
    },
    /** True while there is too little history for the number to mean anything. */
    isProvisional: { type: Boolean, default: true },

    components: {
      completion: { type: componentSchema, default: () => ({}) },
      rating: { type: componentSchema, default: () => ({}) },
      disputes: { type: componentSchema, default: () => ({}) },
      compliance: { type: componentSchema, default: () => ({}) },
      response: { type: componentSchema, default: () => ({}) },
    },

    /** The raw counts the components were derived from — shown as evidence. */
    stats: {
      projectsCompleted: { type: Number, default: 0, min: 0 },
      projectsCancelled: { type: Number, default: 0, min: 0 },
      projectsActive: { type: Number, default: 0, min: 0 },
      averageRating: { type: Number, default: 0, min: 0, max: 5 },
      totalRatings: { type: Number, default: 0, min: 0 },
      disputesRaisedAgainst: { type: Number, default: 0, min: 0 },
      disputesUpheld: { type: Number, default: 0, min: 0 },
      expiredDocuments: { type: Number, default: 0, min: 0 },
      leadsReceived: { type: Number, default: 0, min: 0 },
      leadsAnswered: { type: Number, default: 0, min: 0 },
      medianResponseHours: { type: Number, default: 0, min: 0 },
      stagesRejectedFirstTime: { type: Number, default: 0, min: 0 },
      stagesSubmitted: { type: Number, default: 0, min: 0 },
    },

    /** Movement since the last recalculation, so the UI can show a direction. */
    previousScore: { type: Number, default: 0, min: 0, max: 100 },
    calculatedAt: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'construction_contractor_scores',
    timestamps: true,
  },
);

// Leaderboards and matching tie-breaks read this ordering.
contractorScoreSchema.index({ score: -1, calculatedAt: -1 });

export const ContractorScore = mongoose.models.ContractorScore
  || mongoose.model('ContractorScore', contractorScoreSchema);

export { contractorScoreSchema };
