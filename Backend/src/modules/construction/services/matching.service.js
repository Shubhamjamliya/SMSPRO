import { ContractorProfile } from '../models/contractorProfile.model.js';
import { ContractorLead } from '../models/contractorLead.model.js';
import { ConstructionEnquiry } from '../models/constructionEnquiry.model.js';
import { getSettings } from './settings.service.js';
import { logger } from '../../../utils/logger.js';
import { notifyNewLead } from './notify.service.js';

/**
 * Matching — which verified contractors see an enquiry (BRD C6, W6 · Q4, Q5).
 *
 * The default `shortlist` mode implements the BRD's own recommendation: the app
 * suggests a handful of verified contractors and the customer chooses. That is
 * the answer to Q4 this build assumes, and it is a setting rather than a
 * hardcoded rule — switch `leadDistributionMode` to change it.
 *
 * Scoring is deliberately transparent. Every candidate carries the reasons it
 * was picked, so when SMS Pro asks "why did this enquiry go to those three?",
 * the answer is on the lead row rather than buried in a ranking function.
 */
const alive = { isDeleted: { $ne: true } };

const SCORE = {
  TRADE_MATCH: 40,        // does the declared trade cover this work at all
  AREA_MATCH: 25,         // do they actually work in this city
  BUDGET_FIT: 15,         // is the job inside the size band they take on
  CAPACITY_FREE: 10,      // are they below their declared concurrent limit
  EXPERIENCE: 5,          // years in the trade
  RATING: 5,              // customer rating so far
};

const normalizeArea = (value) => String(value || '').trim().toLowerCase();

/**
 * Score one contractor against one enquiry.
 * Returns null when they are not eligible at all, rather than a zero score —
 * an ineligible contractor should never appear in a shortlist at any position.
 */
const scoreContractor = (contractor, enquiry) => {
  const reasons = [];
  let score = 0;

  // Trade is non-negotiable: a contractor who does not do this work cannot quote.
  const trades = (contractor.trades || []).map(String);
  if (!trades.includes(String(enquiry.categoryId))) return null;
  score += SCORE.TRADE_MATCH;
  reasons.push('Works in this trade');

  // Area is a strong signal but not a hard gate — a contractor with a large
  // travel radius may legitimately take work outside their listed cities.
  const city = normalizeArea(enquiry.site?.city);
  const areas = (contractor.serviceAreas || []).map(normalizeArea);
  if (city && areas.includes(city)) {
    score += SCORE.AREA_MATCH;
    reasons.push(`Works in ${enquiry.site.city}`);
  } else if (Number(contractor.travelRadiusKm) >= 50) {
    score += Math.round(SCORE.AREA_MATCH / 2);
    reasons.push('Travels widely');
  }

  // Budget fit — only judged when both sides declared something.
  const budget = enquiry.budgetMax ?? enquiry.budgetMin;
  const min = contractor.projectSizeMin;
  const max = contractor.projectSizeMax;
  if (budget != null && (min != null || max != null)) {
    const aboveFloor = min == null || budget >= min;
    const belowCeiling = max == null || budget <= max;
    if (aboveFloor && belowCeiling) {
      score += SCORE.BUDGET_FIT;
      reasons.push('Takes projects this size');
    }
  } else {
    // No declared band on either side is not a mark against them.
    score += Math.round(SCORE.BUDGET_FIT / 2);
  }

  const years = Number(contractor.yearsExperience) || 0;
  score += Math.min(years / 4, 1) * SCORE.EXPERIENCE;
  if (years >= 10) reasons.push(`${years} years experience`);

  const rating = Number(contractor.rating) || 0;
  if (rating > 0) {
    score += (rating / 5) * SCORE.RATING;
    reasons.push(`Rated ${rating.toFixed(1)}`);
  }

  return { score: Math.round(score), reasons };
};

/**
 * Contractors currently at or above their declared concurrent-project limit.
 *
 * BRD W2 asks contractors how many projects they can run at once, and BRD Q2's
 * real concern is capacity. This honours the declared number instead of locking
 * anyone out: a contractor at capacity simply stops receiving NEW enquiries and
 * keeps everything they already have.
 */
const findContractorsAtCapacity = async (contractorIds) => {
  if (!contractorIds.length) return new Set();

  // Live commitments = enquiries where this contractor is the accepted party and
  // work has not finished. Until Phase 5 creates projects, accepted quotations
  // are the best available proxy.
  const { Quotation } = await import('../models/quotation.model.js');
  const live = await Quotation.aggregate([
    {
      $match: {
        contractorId: { $in: contractorIds },
        status: 'accepted',
        isDeleted: { $ne: true },
      },
    },
    { $group: { _id: '$contractorId', count: { $sum: 1 } } },
  ]);

  const liveById = new Map(live.map((r) => [String(r._id), r.count]));
  const contractors = await ContractorProfile
    .find({ _id: { $in: contractorIds } })
    .select('maxConcurrentProjects')
    .lean();

  const atCapacity = new Set();
  for (const c of contractors) {
    const limit = Number(c.maxConcurrentProjects) || 3;
    if ((liveById.get(String(c._id)) || 0) >= limit) atCapacity.add(String(c._id));
  }
  return atCapacity;
};

/** Rank every eligible contractor for an enquiry, best first. */
export const rankCandidates = async (enquiry) => {
  const candidates = await ContractorProfile.find({
    ...alive,
    status: 'approved',
    isActive: true,
    trades: enquiry.categoryId,
  })
    .select('businessName ownerName contractorCode trades serviceAreas travelRadiusKm '
      + 'projectSizeMin projectSizeMax maxConcurrentProjects yearsExperience rating '
      + 'totalRatings trustScore completedProjects profileImage')
    .lean();

  if (!candidates.length) return [];

  const atCapacity = await findContractorsAtCapacity(candidates.map((c) => c._id));

  return candidates
    .map((contractor) => {
      const scored = scoreContractor(contractor, enquiry);
      if (!scored) return null;

      const full = atCapacity.has(String(contractor._id));
      if (!full) {
        scored.score += SCORE.CAPACITY_FREE;
      } else {
        scored.reasons.push('At their project limit');
      }
      return { contractor, ...scored, atCapacity: full };
    })
    .filter(Boolean)
    // A contractor at capacity ranks below every available one, but is not
    // removed — if nobody else covers the trade, they are better than silence.
    .sort((a, b) => (a.atCapacity === b.atCapacity ? b.score - a.score : a.atCapacity ? 1 : -1));
};

/**
 * Build the shortlist for an enquiry and create the leads.
 *
 * Idempotent: leads are unique on (enquiryId, contractorId), so re-running this
 * after new contractors are approved tops the shortlist up rather than
 * duplicating offers.
 */
export const matchEnquiry = async (enquiryId) => {
  const enquiry = await ConstructionEnquiry.findOne({ _id: enquiryId, ...alive });
  if (!enquiry) throw new Error('Enquiry not found');

  const settings = await getSettings();
  const mode = settings.matching?.leadDistributionMode || 'shortlist';
  const shortlistSize = Number(settings.matching?.shortlistSize) || 5;
  const responseHours = Number(settings.matching?.leadResponseHours) || 24;

  const ranked = await rankCandidates(enquiry);
  if (!ranked.length) {
    logger.warn(`[construction] no contractor matches enquiry ${enquiry.enquiryNumber}`);
    return { matched: 0, candidates: 0, mode };
  }

  const take = mode === 'broadcast' ? ranked.length
    : mode === 'round_robin' ? 1
      : shortlistSize;
  const chosen = ranked.slice(0, take);

  const expiresAt = new Date(Date.now() + responseHours * 60 * 60 * 1000);
  let created = 0;

  for (const entry of chosen) {
    try {
      await ContractorLead.create({
        enquiryId: enquiry._id,
        contractorId: entry.contractor._id,
        status: 'offered',
        offeredAt: new Date(),
        expiresAt,
        matchScore: entry.score,
        matchReasons: entry.reasons,
      });
      created += 1;

      // BRD W6 — tell them straight away. Best effort: a failed push must never
      // undo a lead that was legitimately created.
      notifyNewLead({
        contractorId: entry.contractor._id,
        enquiry: {
          id: enquiry._id,
          enquiryNumber: enquiry.enquiryNumber,
          serviceName: null,
          city: enquiry.site?.city,
        },
        expiresAt,
      }).catch(() => {});
    } catch (err) {
      // Duplicate key means this contractor already had this enquiry offered —
      // exactly what the unique index is there to prevent.
      if (err?.code !== 11000) throw err;
    }
  }

  const shortlistIds = chosen.map((e) => e.contractor._id);
  const existing = new Set((enquiry.shortlistedContractorIds || []).map(String));
  for (const id of shortlistIds) {
    if (!existing.has(String(id))) enquiry.shortlistedContractorIds.push(id);
  }
  if (enquiry.status === 'submitted') enquiry.status = 'matching';
  enquiry.lastActivityAt = new Date();
  await enquiry.save();

  logger.info(
    `[construction] enquiry ${enquiry.enquiryNumber}: ${created} lead(s) from `
    + `${ranked.length} candidate(s), mode=${mode}`,
  );

  return { matched: created, candidates: ranked.length, mode };
};

/**
 * Expire leads nobody answered and top the shortlist back up.
 *
 * BRD W7: "a fast decline is far better for the customer than a slow
 * non-answer". A lead left unanswered is the slowest possible non-answer, so it
 * is reclaimed and the enquiry offered to the next contractor down the ranking.
 */
export const expireStaleLeads = async () => {
  const now = new Date();
  const stale = await ContractorLead.find({
    status: 'offered',
    expiresAt: { $ne: null, $lt: now },
  }).select('_id enquiryId').lean();

  if (!stale.length) return { expired: 0, rematched: 0 };

  await ContractorLead.updateMany(
    { _id: { $in: stale.map((l) => l._id) } },
    { $set: { status: 'expired', respondedAt: now } },
  );

  // Re-match each affected enquiry that is still open, so it keeps moving.
  const enquiryIds = [...new Set(stale.map((l) => String(l.enquiryId)))];
  let rematched = 0;
  for (const id of enquiryIds) {
    const enquiry = await ConstructionEnquiry.findById(id).select('status').lean();
    if (!enquiry || !['submitted', 'matching'].includes(enquiry.status)) continue;
    try {
      const result = await matchEnquiry(id);
      if (result.matched > 0) rematched += 1;
    } catch (err) {
      logger.warn(`[construction] re-match failed for enquiry ${id}: ${err.message}`);
    }
  }

  logger.info(`[construction] expired ${stale.length} lead(s), re-matched ${rematched} enquiry(ies)`);
  return { expired: stale.length, rematched };
};
