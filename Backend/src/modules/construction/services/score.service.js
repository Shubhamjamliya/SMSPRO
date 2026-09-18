import { ValidationError } from '../../../core/auth/errors.js';
import { logger } from '../../../utils/logger.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { ContractorDocument } from '../models/contractorDocument.model.js';
import { ContractorLead } from '../models/contractorLead.model.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectStage } from '../models/projectStage.model.js';
import { ProjectDispute } from '../models/projectDispute.model.js';
import { ContractorScore } from '../models/contractorScore.model.js';

/**
 * Contractor trust score (BRD W18).
 *
 * "A score built from completed work, customer ratings, complaint history,
 * whether documents are current, and how quickly they respond."
 *
 * The score is recalculated, never incremented. Every component is derived from
 * rows that already exist, so a missed event or a replayed one cannot corrupt
 * it — the worst case is a number that is a day stale, which the nightly job
 * fixes. An incrementing counter would drift silently and there would be no way
 * to tell that it had.
 *
 * Each component is stored with its own value, weight and a plain-English
 * reason, because a contractor who cannot see why their score moved cannot act
 * on it, and a score nobody can act on changes nobody's behaviour.
 */

const alive = { isDeleted: { $ne: true } };
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number(n) || 0));
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const WEIGHTS = {
  completion: 25,
  rating: 25,
  disputes: 20,
  compliance: 15,
  response: 15,
};

/** Below this, there is not enough history for a number to mean anything. */
const MIN_PROJECTS_FOR_FULL_SCORE = 3;

const bandFor = (score, isProvisional) => {
  if (isProvisional) return 'new';
  if (score >= 85) return 'excellent';
  if (score >= 65) return 'good';
  return 'building';
};

/**
 * Recalculate one contractor's score from source data.
 *
 * Read-only against everything except the score row itself, so it is safe to
 * run at any time, for anyone, as often as you like.
 */
export const recalculateScore = async (contractorId) => {
  const contractor = await ContractorProfile.findOne({ _id: contractorId, ...alive }).lean();
  if (!contractor) throw new ValidationError('Contractor not found');

  const [projects, disputes, documents, leads, stages] = await Promise.all([
    ConstructionProject.find({ contractorId, ...alive })
      .select('status agreedValue').lean(),
    ProjectDispute.find({ contractorId, ...alive })
      .select('status outcome raisedByType').lean(),
    ContractorDocument.find({ contractorId, isDeleted: { $ne: true } })
      .select('status expiresAt').lean(),
    ContractorLead.find({ contractorId })
      .select('status offeredAt respondedAt').lean(),
    ProjectStage.find({ contractorId })
      .select('status statusHistory').lean(),
  ]);

  const completed = projects.filter((p) => ['completed', 'closed'].includes(p.status)).length;
  const cancelled = projects.filter((p) => p.status === 'cancelled').length;
  const active = projects.filter((p) => ['active', 'handover_pending', 'on_hold'].includes(p.status)).length;
  const finished = completed + cancelled;

  // ---- 1. completion (25) ---------------------------------------------------
  // Of the projects that reached an end, how many ended well.
  let completionValue = 0;
  let completionDetail = 'No finished projects yet';
  if (finished > 0) {
    completionValue = clamp((completed / finished) * 100);
    completionDetail = cancelled === 0
      ? `All ${completed} finished project${completed === 1 ? '' : 's'} completed`
      : `${completed} of ${finished} finished projects completed`;
  }

  // ---- 2. rating (25) -------------------------------------------------------
  const averageRating = Number(contractor.rating) || 0;
  const totalRatings = Number(contractor.totalRatings) || 0;
  let ratingValue = 0;
  let ratingDetail = 'No customer ratings yet';
  if (totalRatings > 0) {
    ratingValue = clamp((averageRating / 5) * 100);
    ratingDetail = `${round1(averageRating)} out of 5 from ${totalRatings} rating${totalRatings === 1 ? '' : 's'}`;
  }

  // ---- 3. disputes (20) -----------------------------------------------------
  // Only disputes the CUSTOMER raised count against the contractor, and only
  // those that were actually upheld. A contractor who raises a dispute to get
  // paid for finished work is using the system correctly, and a customer
  // complaint that support dismissed is not evidence of anything.
  const against = disputes.filter((d) => d.raisedByType === 'CUSTOMER');
  const upheld = against.filter((d) => d.status === 'resolved'
    && ['refunded_to_customer', 'split'].includes(d.outcome)).length;

  let disputeValue = 100;
  let disputeDetail = 'No complaints upheld';
  if (finished > 0 && upheld > 0) {
    // One upheld complaint in ten projects costs about 10 points; three in
    // three costs everything.
    disputeValue = clamp(100 - ((upheld / finished) * 100));
    disputeDetail = `${upheld} complaint${upheld === 1 ? '' : 's'} upheld across ${finished} projects`;
  } else if (upheld > 0) {
    disputeValue = clamp(100 - (upheld * 25));
    disputeDetail = `${upheld} complaint${upheld === 1 ? '' : 's'} upheld`;
  }

  // ---- 4. compliance (15) ---------------------------------------------------
  // Entirely within the contractor's control, so it is scored strictly.
  const now = Date.now();
  const expired = documents.filter((d) => d.expiresAt
    && new Date(d.expiresAt).getTime() < now).length;
  const verified = documents.filter((d) => d.status === 'verified').length;

  let complianceValue = 0;
  let complianceDetail = 'No documents on file';
  if (documents.length > 0) {
    complianceValue = expired > 0
      ? clamp(100 - (expired * 40))
      : clamp((verified / documents.length) * 100);
    complianceDetail = expired > 0
      ? `${expired} document${expired === 1 ? ' has' : 's have'} expired — renew to recover these points`
      : `${verified} of ${documents.length} documents verified`;
  }

  // ---- 5. response (15) -----------------------------------------------------
  // BRD W7: "a fast decline is far better for the customer than a slow non-answer."
  const answered = leads.filter((l) => ['accepted', 'declined'].includes(l.status));
  const responseHours = answered
    .filter((l) => l.respondedAt && l.offeredAt)
    .map((l) => (new Date(l.respondedAt) - new Date(l.offeredAt)) / 3600000)
    .sort((a, b) => a - b);
  const median = responseHours.length
    ? responseHours[Math.floor(responseHours.length / 2)]
    : 0;

  let responseValue = 0;
  let responseDetail = 'No enquiries answered yet';
  if (leads.length > 0) {
    const answerRate = answered.length / leads.length;
    // Under 4 hours is full marks; 48 hours or worse scores nothing on speed.
    const speed = median <= 4 ? 1 : median >= 48 ? 0 : 1 - ((median - 4) / 44);
    responseValue = clamp(((answerRate * 0.6) + (speed * 0.4)) * 100);
    responseDetail = answered.length === 0
      ? `${leads.length} enquiries received, none answered`
      : `Answered ${answered.length} of ${leads.length}, typically within ${Math.round(median)}h`;
  }

  // ---- weighted total -------------------------------------------------------
  const components = {
    completion: { value: round1(completionValue), weight: WEIGHTS.completion, detail: completionDetail },
    rating: { value: round1(ratingValue), weight: WEIGHTS.rating, detail: ratingDetail },
    disputes: { value: round1(disputeValue), weight: WEIGHTS.disputes, detail: disputeDetail },
    compliance: { value: round1(complianceValue), weight: WEIGHTS.compliance, detail: complianceDetail },
    response: { value: round1(responseValue), weight: WEIGHTS.response, detail: responseDetail },
  };

  const score = round1(
    Object.values(components).reduce((sum, c) => sum + ((c.value * c.weight) / 100), 0),
  );

  const isProvisional = completed < MIN_PROJECTS_FOR_FULL_SCORE;

  const stagesSubmitted = stages.filter((s) => (s.statusHistory || [])
    .some((h) => h.status === 'submitted_for_approval')).length;
  const rejectedFirstTime = stages.filter((s) => (s.statusHistory || [])
    .some((h) => h.status === 'rejected')).length;

  const previous = await ContractorScore.findOne({ contractorId }).select('score').lean();

  const saved = await ContractorScore.findOneAndUpdate(
    { contractorId },
    {
      $set: {
        score,
        band: bandFor(score, isProvisional),
        isProvisional,
        components,
        stats: {
          projectsCompleted: completed,
          projectsCancelled: cancelled,
          projectsActive: active,
          averageRating: round1(averageRating),
          totalRatings,
          disputesRaisedAgainst: against.length,
          disputesUpheld: upheld,
          expiredDocuments: expired,
          leadsReceived: leads.length,
          leadsAnswered: answered.length,
          medianResponseHours: round1(median),
          stagesSubmitted,
          stagesRejectedFirstTime: rejectedFirstTime,
        },
        previousScore: previous?.score || 0,
        calculatedAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return saved;
};

/** The contractor's own view of their score (BRD W18). */
export const getMyScore = async (contractorId) => {
  let score = await ContractorScore.findOne({ contractorId }).lean();
  if (!score) score = await recalculateScore(contractorId);

  // Ordered worst-first: the contractor wants to know what to fix, not what is
  // already fine.
  const improvements = Object.entries(score.components || {})
    .map(([key, c]) => ({
      area: key,
      value: c.value,
      weight: c.weight,
      detail: c.detail,
      pointsAvailable: round1(((100 - c.value) * c.weight) / 100),
    }))
    .filter((c) => c.pointsAvailable >= 0.5)
    .sort((a, b) => b.pointsAvailable - a.pointsAvailable);

  return { ...score, improvements };
};

/** The public badge a customer sees. Never exposes the component breakdown. */
export const getPublicScore = async (contractorId) => {
  const score = await ContractorScore.findOne({ contractorId })
    .select('score band isProvisional stats.projectsCompleted stats.averageRating stats.totalRatings')
    .lean();
  if (!score) return null;

  return {
    band: score.band,
    isProvisional: score.isProvisional,
    // A provisional score is not shown as a number — "New" is honest, "41" is not.
    score: score.isProvisional ? null : score.score,
    projectsCompleted: score.stats?.projectsCompleted || 0,
    averageRating: score.stats?.averageRating || 0,
    totalRatings: score.stats?.totalRatings || 0,
  };
};

/**
 * Nightly recalculation for every approved contractor.
 *
 * Sequential on purpose. This runs at 03:30 with nobody waiting on it, and a
 * parallel sweep across every contractor is a good way to exhaust the connection
 * pool for the sake of finishing a background job a few seconds sooner.
 */
export const recalculateAllScores = async () => {
  const contractors = await ContractorProfile
    .find({ status: 'approved', ...alive })
    .select('_id businessName')
    .lean();

  let updated = 0;
  const failures = [];

  for (const contractor of contractors) {
    try {
      await recalculateScore(contractor._id);
      updated += 1;
    } catch (error) {
      failures.push({ contractorId: String(contractor._id), error: error.message });
      logger.warn(`[construction] score failed for ${contractor.businessName}: ${error.message}`);
    }
  }

  return { total: contractors.length, updated, failures };
};

export { WEIGHTS, MIN_PROJECTS_FOR_FULL_SCORE };
