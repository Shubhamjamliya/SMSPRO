import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../utils/helpers.js';
import { logger } from '../../../utils/logger.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { PackageRequest } from '../models/packageRequest.model.js';
import { getSettings } from './settings.service.js';
import { notify, notifyAdmins, contractorName } from './notify.service.js';

/**
 * Sending a paid package request to nearby contractors, and what they do with it.
 *
 * "Nearby" here means the contractor works in the customer's city (and, when the
 * customer gave one, their locality). That is deliberately how it is defined,
 * because it is all the data there is: a contractor's profile holds a list of the
 * areas they work in and a travel radius, not a map position. Real distance would
 * need contractors to pin their location at registration.
 *
 * The request is BROADCAST to the best few (settings.matching.shortlistSize) and
 * the first to accept takes it — the customer has already paid for a visit, so
 * speed matters more than choice. If none of them answer in time, the next batch
 * gets it; if nobody covers the area at all, or the batches run out, the request is
 * flagged for the office instead of sitting silently.
 */
const alive = { isDeleted: { $ne: true } };

const adminLink = (request) => `/admin/construction/end-to-end/${
  request?.package?.segment === 'commercial' ? 'commercial' : 'residential'
}/requests`;

/** Commercial visits are never broadcast: the office chooses the contractor. */
export const isCommercial = (request) => request?.package?.segment === 'commercial';

const shortRef = (id) => `#${String(id).slice(-6).toUpperCase()}`;

/** A push to the office. Best effort — a failed alert must never undo the dispatch that raised it. */
const alertOffice = (request, title, message) => notifyAdmins({
  source: 'NEW_LEAD',
  title,
  message,
  link: adminLink(request),
  metadata: { packageRequestId: String(request._id), segment: request.package?.segment || '' },
}).catch(() => {});

/** Array filters and positional updates are not always cast by Mongoose, so ids are made real ObjectIds up front. */
const oid = (value) => new mongoose.Types.ObjectId(String(value));

const audit = (action, extra) => recordAudit({
  module: 'construction',
  entityType: 'package_request',
  ...extra,
  action,
});

// ---------- Matching ----------

const SCORE = {
  CITY_EXACT: 25,      // a listed area is exactly the customer's city
  CITY_PARTIAL: 18,    // a listed area mentions it: "Indore, Madhya Pradesh"
  AREA_EXACT: 30,      // works in the customer's own locality
  AREA_PARTIAL: 22,
  RATING: 10,
  EXPERIENCE: 5,
};

/**
 * Lower-case, punctuation to spaces, whitespace collapsed — so "Indore, M.P." and
 * "indore  mp" compare as the same words.
 */
const normalizePlace = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Whole-word containment: "indore madhya pradesh" contains "indore", "indorex" does not. */
const containsPhrase = (haystack, needle) => Boolean(needle) && ` ${haystack} `.includes(` ${needle} `);

/**
 * How well one place name a contractor typed matches the place the customer gave:
 * 'exact', 'partial' (one mentions the other as whole words), or null.
 *
 * Contractors type their areas freely — "each city or locality" — so "Indore",
 * "Indore, MP" and "Vijay Nagar, Indore" are all real answers, and demanding an
 * exact string would leave a customer in Indore matching nobody who works there.
 * Very short fragments are ignored either way so a stray "a" cannot match a city.
 */
const placeMatch = (listedArea, wanted) => {
  const area = normalizePlace(listedArea);
  const target = normalizePlace(wanted);
  if (!area || !target) return null;
  if (area === target) return 'exact';
  if (target.length >= 3 && containsPhrase(area, target)) return 'partial';
  if (area.length >= 3 && containsPhrase(target, area)) return 'partial';
  return null;
};

/** The best match among all the areas a contractor lists. */
const bestPlaceMatch = (listedAreas, wanted) => {
  let best = null;
  for (const listed of listedAreas || []) {
    const match = placeMatch(listed, wanted);
    if (match === 'exact') return 'exact';
    if (match) best = match;
  }
  return best;
};

/**
 * EVERY approved, active contractor who covers the request's place, best first —
 * including any who have already been asked. Kept separate from "who is left to
 * ask" so the office can be told the difference between "nobody works there" and
 * "everyone who works there has already been asked".
 *
 * `isActive` is only excluded when it is explicitly false, the same rule the
 * contractor login guard uses: an older profile with no value at all is not suspended.
 */
export const matchNearbyContractors = async (request) => {
  const city = request.site?.city;
  const area = request.site?.area;
  if (!normalizePlace(city) && !normalizePlace(area)) return [];

  const candidates = await ContractorProfile
    .find({
      ...alive,
      status: 'approved',
      isActive: { $ne: false },
      'serviceAreas.0': { $exists: true },
    })
    .select('businessName ownerName serviceAreas yearsExperience rating')
    .lean();

  const matches = [];
  for (const contractor of candidates) {
    const cityMatch = bestPlaceMatch(contractor.serviceAreas, city);
    const areaMatch = area ? bestPlaceMatch(contractor.serviceAreas, area) : null;
    if (!cityMatch && !areaMatch) continue;

    const reasons = [];
    let score = 0;
    if (cityMatch) {
      score += cityMatch === 'exact' ? SCORE.CITY_EXACT : SCORE.CITY_PARTIAL;
      reasons.push(`Works in ${city}`);
    }
    if (areaMatch) {
      score += areaMatch === 'exact' ? SCORE.AREA_EXACT : SCORE.AREA_PARTIAL;
      reasons.push(`Works in ${area}`);
    }
    const rating = Number(contractor.rating) || 0;
    if (rating > 0) {
      score += (rating / 5) * SCORE.RATING;
      reasons.push(`Rated ${rating.toFixed(1)}`);
    }
    const years = Number(contractor.yearsExperience) || 0;
    score += Math.min(years / 4, 1) * SCORE.EXPERIENCE;
    if (years >= 10) reasons.push(`${years} years experience`);

    matches.push({ contractor, score: Math.round(score), reasons });
  }
  return matches.sort((a, b) => b.score - a.score);
};

/** Contractors covering the place who have NOT already been offered this request, best first. */
export const rankNearbyContractors = async (request, { excludeIds = [] } = {}) => {
  const skip = new Set(excludeIds.map(String));
  return (await matchNearbyContractors(request)).filter((m) => !skip.has(String(m.contractor._id)));
};

// ---------- Sending ----------

/**
 * Offer a PAID request to the next batch of nearby contractors.
 *
 * Refuses an unpaid one. That check lives here, not only in the caller, so no
 * future code path can send a request whose visiting fee has not been verified.
 *
 * Always answers `{ sent, candidates, coverage, state, reason? }`. `coverage` is how
 * many contractors cover the place AT ALL, so a caller can tell "nobody works
 * there" (`no_coverage`) from "everyone who does has already been asked"
 * (`all_asked`) — two very different problems for the office.
 */
export const dispatchRequest = async (requestId) => {
  const request = await PackageRequest.findById(requestId).lean();
  if (!request) throw new ValidationError('Request not found');

  const paymentStatus = request.payment?.status || 'not_required';
  if (!['paid', 'not_required'].includes(paymentStatus)) {
    throw new ValidationError('The visiting fee has not been paid for this request');
  }
  if (request.assignedContractorId) return { sent: 0, candidates: 0, coverage: 0, state: 'accepted' };

  // Commercial: straight to the office, nothing goes to contractors. Claimed with a
  // conditional update so a payment reconciled by both the browser and the webhook
  // alerts the office once.
  if (isCommercial(request)) {
    const claimed = await PackageRequest.findOneAndUpdate(
      { _id: requestId, assignedContractorId: null, 'dispatch.state': { $ne: 'awaiting_admin' } },
      { $set: { 'dispatch.state': 'awaiting_admin', 'dispatch.lastDispatchedAt': new Date() } },
    ).select('_id').lean();
    if (claimed) {
      alertOffice(
        request,
        'New commercial site visit — assign a contractor',
        `${request.package?.name || 'Package'} in ${request.site?.city} (${shortRef(requestId)}) has been paid for and needs a contractor.`,
      );
      await audit('package_request.awaiting_admin', { entityId: requestId, after: { segment: 'commercial' } });
    }
    return { sent: 0, candidates: 0, coverage: 0, state: 'awaiting_admin' };
  }

  const settings = await getSettings();
  const batchSize = Number(settings.matching?.shortlistSize) || 5;
  const responseHours = Number(settings.matching?.leadResponseHours) || 24;

  const alreadyOffered = new Set((request.offers || []).map((o) => String(o.contractorId)));
  const everyone = await matchNearbyContractors(request);
  const coverage = everyone.length;
  const ranked = everyone.filter((m) => !alreadyOffered.has(String(m.contractor._id)));

  if (!ranked.length) {
    // Nobody left to ask. Say why: nobody works there, or everyone who does was asked.
    // If some offers are still open the request is simply waiting on them — it is NOT
    // unassigned, and must not be flagged as if the office needed to step in.
    const hasOpenOffers = (request.offers || []).some((o) => o.status === 'offered');
    const state = hasOpenOffers ? 'sent' : (alreadyOffered.size ? 'unassigned' : 'no_contractors');
    const reason = coverage === 0 ? 'no_coverage' : 'all_asked';
    await PackageRequest.updateOne(
      { _id: requestId, assignedContractorId: null },
      { $set: { 'dispatch.state': state, 'dispatch.lastDispatchedAt': new Date() } },
    );
    logger.warn(`[construction] package request ${requestId}: ${state} (${reason}) for ${request.site?.city}`);

    // Nobody took it and nobody is left to ask: the office has to step in. Only on the
    // transition, so a repeated sweep does not page them over and over.
    if (['unassigned', 'no_contractors'].includes(state) && request.dispatch?.state !== state) {
      alertOffice(
        request,
        state === 'no_contractors' ? 'Site visit: no contractor covers this area' : 'Site visit: nobody accepted',
        state === 'no_contractors'
          ? `${request.package?.name || 'Package'} in ${request.site?.city} (${shortRef(requestId)}) — no approved contractor works there. Assign one.`
          : `${request.package?.name || 'Package'} in ${request.site?.city} (${shortRef(requestId)}) — every contractor asked has declined or not answered. Assign one.`,
      );
    }
    return { sent: 0, candidates: 0, coverage, state, reason };
  }

  const chosen = ranked.slice(0, batchSize);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + responseHours * 60 * 60 * 1000);

  // Conditional on nobody having accepted meanwhile, so a slow re-send can never
  // push new offers onto a request that has just been taken.
  const updated = await PackageRequest.findOneAndUpdate(
    { _id: requestId, assignedContractorId: null },
    {
      $push: {
        offers: {
          $each: chosen.map((entry) => ({
            contractorId: entry.contractor._id,
            status: 'offered',
            offeredAt: now,
            expiresAt,
            matchReasons: entry.reasons,
          })),
        },
      },
      $set: { 'dispatch.state': 'sent', 'dispatch.lastDispatchedAt': now },
      $inc: { 'dispatch.rounds': 1 },
    },
    { new: true },
  ).lean();
  if (!updated) return { sent: 0, candidates: ranked.length, coverage, state: 'accepted' };

  // Tell them straight away. Best effort: a failed push must never undo an offer
  // that was legitimately made.
  for (const entry of chosen) {
    notify({
      ownerType: 'CONTRACTOR',
      ownerId: String(entry.contractor._id),
      source: 'NEW_LEAD',
      title: 'New site visit request — accept now',
      message: `${request.package?.name || 'Package'} in ${request.site?.city}`
        + ` — first to accept gets it. Reply within ${responseHours}h`,
      link: `/contractor/package-requests/${requestId}`,
      metadata: { packageRequestId: String(requestId) },
    }).catch(() => {});
  }

  await audit('package_request.dispatched', {
    entityId: requestId,
    after: { sent: chosen.length, round: updated.dispatch?.rounds, candidates: ranked.length, coverage },
  });
  logger.info(`[construction] package request ${requestId}: offered to ${chosen.length} of ${ranked.length} contractor(s)`);
  return { sent: chosen.length, candidates: ranked.length, coverage, state: 'sent' };
};

/**
 * Send a paid request to EVERY contractor who covers the place, again.
 *
 * This is the office's "nobody has picked it up" button, so unlike the automatic
 * batches it does not skip contractors who were already asked — an offer sitting
 * unseen is exactly the problem. For each contractor covering the place:
 *
 *   - never asked           -> a new offer is made
 *   - asked, still waiting  -> the offer is refreshed (new deadline) and they are reminded
 *   - asked, lapsed/withdrawn -> the offer is reopened and they are told again
 *   - asked and DECLINED    -> left alone: they answered, and asking again would be nagging
 *
 * Nobody is ever offered the request twice at once: an existing offer is reopened,
 * not duplicated. Like every path here it refuses an unpaid request.
 *
 * Answers `{ sent, newlyAsked, reminded, declined, coverage, state, reason? }`.
 */
export const resendToAll = async (requestId) => {
  const request = await PackageRequest.findById(requestId).lean();
  if (!request) throw new ValidationError('Request not found');

  const paymentStatus = request.payment?.status || 'not_required';
  if (!['paid', 'not_required'].includes(paymentStatus)) {
    throw new ValidationError('The visiting fee has not been paid for this request');
  }
  if (request.assignedContractorId) throw new ValidationError('A contractor has already taken this request');
  if (isCommercial(request)) {
    throw new ValidationError('Commercial visits are not broadcast — assign a contractor to this request instead');
  }

  const settings = await getSettings();
  const responseHours = Number(settings.matching?.leadResponseHours) || 24;

  const everyone = await matchNearbyContractors(request);
  const coverage = everyone.length;
  const current = request.dispatch?.state || 'not_sent';

  if (!coverage) {
    const hasOffers = (request.offers || []).length > 0;
    if (!hasOffers) {
      await PackageRequest.updateOne(
        { _id: requestId, assignedContractorId: null },
        { $set: { 'dispatch.state': 'no_contractors', 'dispatch.lastDispatchedAt': new Date() } },
      );
    }
    return { sent: 0, newlyAsked: 0, reminded: 0, declined: 0, coverage: 0, state: hasOffers ? current : 'no_contractors', reason: 'no_coverage' };
  }

  const existingById = new Map((request.offers || []).map((o) => [String(o.contractorId), o]));
  const toAdd = [];
  const toReopen = [];
  let declined = 0;
  for (const match of everyone) {
    const existing = existingById.get(String(match.contractor._id));
    if (!existing) toAdd.push(match);
    else if (existing.status === 'declined') declined += 1;
    else toReopen.push(match);
  }

  if (!toAdd.length && !toReopen.length) {
    return { sent: 0, newlyAsked: 0, reminded: 0, declined, coverage, state: current, reason: 'all_declined' };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + responseHours * 60 * 60 * 1000);

  // Two separate writes: Mongo will not take a push and a positional update on the
  // same array in one statement. Each is conditional on nobody having accepted meanwhile.
  if (toReopen.length) {
    await PackageRequest.updateOne(
      { _id: requestId, assignedContractorId: null },
      {
        $set: {
          'offers.$[o].status': 'offered',
          'offers.$[o].offeredAt': now,
          'offers.$[o].expiresAt': expiresAt,
          'offers.$[o].respondedAt': null,
          'offers.$[o].reminderSentAt': null,
        },
      },
      {
        arrayFilters: [{
          'o.contractorId': { $in: toReopen.map((m) => m.contractor._id) },
          'o.status': { $in: ['offered', 'expired', 'withdrawn'] },
        }],
      },
    );
  }
  if (toAdd.length) {
    await PackageRequest.updateOne(
      { _id: requestId, assignedContractorId: null },
      {
        $push: {
          offers: {
            $each: toAdd.map((entry) => ({
              contractorId: entry.contractor._id,
              status: 'offered',
              offeredAt: now,
              expiresAt,
              matchReasons: entry.reasons,
            })),
          },
        },
      },
    );
  }
  await PackageRequest.updateOne(
    { _id: requestId, assignedContractorId: null },
    { $set: { 'dispatch.state': 'sent', 'dispatch.lastDispatchedAt': now }, $inc: { 'dispatch.rounds': 1 } },
  );

  const tell = (entry, title) => notify({
    ownerType: 'CONTRACTOR',
    ownerId: String(entry.contractor._id),
    source: 'NEW_LEAD',
    title,
    message: `${request.package?.name || 'Package'} in ${request.site?.city} — reply within ${responseHours}h`,
    link: `/contractor/package-requests/${requestId}`,
    metadata: { packageRequestId: String(requestId) },
  }).catch(() => {});
  toAdd.forEach((entry) => tell(entry, 'New site visit request — accept now'));
  toReopen.forEach((entry) => tell(entry, 'Reminder: site visit request waiting'));

  await audit('package_request.resent_to_all', {
    entityId: requestId,
    after: { newlyAsked: toAdd.length, reminded: toReopen.length, declined, coverage },
  });
  logger.info(
    `[construction] package request ${requestId}: resent to all — ${toAdd.length} new, ${toReopen.length} reminded, ${declined} declined earlier`,
  );
  return {
    sent: toAdd.length + toReopen.length,
    newlyAsked: toAdd.length,
    reminded: toReopen.length,
    declined,
    coverage,
    state: 'sent',
  };
};

// ---------- What a contractor does with an offer ----------

/** Contractors whose open offer was just closed because someone else got the request. */
const notifyOffersTaken = (request, offers) => {
  for (const offer of offers) {
    notify({
      ownerType: 'CONTRACTOR',
      ownerId: String(offer.contractorId),
      source: 'NEW_LEAD',
      title: 'Site visit already taken',
      message: `${request.package?.name || 'Package'} in ${request.site?.city} was accepted by another contractor.`,
      link: '/contractor/package-requests',
      metadata: { packageRequestId: String(request._id) },
    }).catch(() => {});
  }
};

/**
 * Take a request. First to accept wins.
 *
 * One conditional update decides it: it only succeeds while nobody is assigned AND
 * this contractor still has a live offer, so two contractors tapping at the same
 * moment cannot both get it — the second finds it already taken.
 */
export const acceptOffer = async (contractorIdRaw, requestId) => {
  const contractorId = oid(contractorIdRaw);
  const now = new Date();
  const won = await PackageRequest.findOneAndUpdate(
    {
      _id: requestId,
      assignedContractorId: null,
      offers: {
        $elemMatch: {
          contractorId,
          status: 'offered',
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        },
      },
    },
    {
      $set: {
        assignedContractorId: contractorId,
        assignedAt: now,
        assignedBy: 'contractor',
        'dispatch.state': 'accepted',
        'offers.$[mine].status': 'accepted',
        'offers.$[mine].respondedAt': now,
      },
    },
    { new: true, arrayFilters: [{ 'mine.contractorId': contractorId }] },
  ).lean();

  if (!won) {
    // Work out WHY, so the contractor is told something true instead of "failed".
    const request = await PackageRequest.findById(requestId).select('assignedContractorId offers').lean();
    const mine = request?.offers?.find((o) => String(o.contractorId) === String(contractorId));
    if (!request || !mine) throw new ValidationError('This request is not available to you');
    if (request.assignedContractorId) {
      throw new ValidationError('Another contractor has already taken this request');
    }
    if (mine.status === 'declined') throw new ValidationError('You have already declined this request');
    throw new ValidationError('This request has expired');
  }

  // The others no longer need to see it as open — and should be told, so nobody keeps
  // tapping on an offer that is already gone.
  const losers = (won.offers || []).filter((o) => o.status === 'offered');
  await PackageRequest.updateOne(
    { _id: requestId },
    { $set: { 'offers.$[o].status': 'withdrawn', 'offers.$[o].respondedAt': now } },
    { arrayFilters: [{ 'o.status': 'offered' }] },
  );
  notifyOffersTaken(won, losers);

  await audit('package_request.accepted', {
    entityId: requestId,
    after: { contractorId: String(contractorId) },
    performedBy: { userId: contractorId, role: 'CONTRACTOR', actionAt: now },
  });

  // Tell the customer who is coming. Best effort.
  contractorName(contractorId)
    .then((name) => notify({
      ownerType: 'USER',
      ownerId: String(won.customerId),
      source: 'NEW_LEAD', // the same value the enquiry flow uses for "a contractor took it on"
      title: 'A contractor will visit your site',
      message: `${name || 'A contractor'} accepted your ${won.package?.name || 'package'} request in ${won.site?.city}.`,
      link: `/construction/site-visits/${requestId}`,
      metadata: { packageRequestId: String(requestId) },
    }))
    .catch(() => {});

  return won;
};

/** Turn a request down. If that was the last open offer, the next batch is tried. */
export const declineOffer = async (contractorIdRaw, requestId, { reason = 'other', note = '' } = {}) => {
  const contractorId = oid(contractorIdRaw);
  const now = new Date();
  const updated = await PackageRequest.findOneAndUpdate(
    {
      _id: requestId,
      assignedContractorId: null,
      offers: { $elemMatch: { contractorId, status: 'offered' } },
    },
    {
      $set: {
        'offers.$[mine].status': 'declined',
        'offers.$[mine].respondedAt': now,
        'offers.$[mine].declineReason': reason,
        'offers.$[mine].declineNote': note,
      },
    },
    { new: true, arrayFilters: [{ 'mine.contractorId': contractorId }] },
  ).lean();

  if (!updated) throw new ValidationError('This request is no longer open to you');

  const stillOpen = (updated.offers || []).some((o) => o.status === 'offered');
  if (!stillOpen) {
    // Everyone asked so far has said no — do not wait for the sweep, try the next batch.
    dispatchRequest(requestId).catch((err) => {
      logger.warn(`[construction] next batch failed for package request ${requestId}: ${err.message}`);
    });
  }
  return { id: String(requestId) };
};

/**
 * Sweep: offers nobody answered in time are expired, and the request moves on to the
 * next batch. Run from the same 15-minute cron as the enquiry leads.
 */
export const expireStalePackageOffers = async () => {
  const now = new Date();
  const stale = await PackageRequest.find({
    assignedContractorId: null,
    'dispatch.state': 'sent',
    offers: { $elemMatch: { status: 'offered', expiresAt: { $ne: null, $lt: now } } },
  }).select('_id').lean();

  let expired = 0;
  let resent = 0;
  for (const { _id } of stale) {
    const result = await PackageRequest.updateOne(
      { _id },
      { $set: { 'offers.$[o].status': 'expired', 'offers.$[o].respondedAt': now } },
      { arrayFilters: [{ 'o.status': 'offered', 'o.expiresAt': { $ne: null, $lt: now } }] },
    );
    expired += result.modifiedCount ? 1 : 0;

    const after = await PackageRequest.findById(_id).select('offers').lean();
    const stillOpen = (after?.offers || []).some((o) => o.status === 'offered');
    if (!stillOpen) {
      try {
        const outcome = await dispatchRequest(_id);
        if (outcome.sent > 0) resent += 1;
      } catch (err) {
        logger.warn(`[construction] re-send failed for package request ${_id}: ${err.message}`);
      }
    }
  }
  return { expired, resent };
};

/**
 * Sweep: nudge contractors whose open offer is in the last quarter of its window.
 * Each offer is reminded once (`reminderSentAt`), and only while nobody has taken the
 * request. Run from the same 15-minute cron as the expiry sweep, before it.
 */
const REMINDER_FRACTION = 0.25;

export const remindExpiringPackageOffers = async () => {
  const now = new Date();
  const candidates = await PackageRequest.find({
    assignedContractorId: null,
    'dispatch.state': 'sent',
    offers: {
      $elemMatch: { status: 'offered', reminderSentAt: null, expiresAt: { $gt: now } },
    },
  }).select('package site offers').lean();

  let reminded = 0;
  for (const request of candidates) {
    const due = (request.offers || []).filter((o) => {
      if (o.status !== 'offered' || o.reminderSentAt || !o.expiresAt) return false;
      const expires = new Date(o.expiresAt).getTime();
      const window = expires - new Date(o.offeredAt || now).getTime();
      const left = expires - now.getTime();
      return left > 0 && left <= window * REMINDER_FRACTION;
    });
    if (!due.length) continue;

    // Claim first so an overlapping run cannot remind the same offer twice.
    const claim = await PackageRequest.updateOne(
      { _id: request._id, assignedContractorId: null },
      { $set: { 'offers.$[o].reminderSentAt': now } },
      { arrayFilters: [{ 'o.contractorId': { $in: due.map((o) => o.contractorId) }, 'o.status': 'offered', 'o.reminderSentAt': null }] },
    );
    if (!claim.modifiedCount) continue;

    for (const offer of due) {
      const minutes = Math.max(1, Math.round((new Date(offer.expiresAt) - now) / 60000));
      const left = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes} min`;
      notify({
        ownerType: 'CONTRACTOR',
        ownerId: String(offer.contractorId),
        source: 'NEW_LEAD',
        title: 'Site visit request expiring — accept now',
        message: `${request.package?.name || 'Package'} in ${request.site?.city} lapses in about ${left}.`,
        link: `/contractor/package-requests/${request._id}`,
        metadata: { packageRequestId: String(request._id) },
      }).catch(() => {});
      reminded += 1;
    }
  }
  return { reminded };
};

// ---------- The office picks the contractor ----------

/**
 * Contractors the office can choose from: everyone who covers the place first (with why),
 * then the other approved, active contractors, so a request in an area nobody has listed
 * can still be given to someone.
 */
export const listAssignableContractors = async (requestId) => {
  const request = await PackageRequest.findById(requestId).select('site package offers').lean();
  if (!request) throw new ValidationError('Request not found');

  const nearby = await matchNearbyContractors(request);
  const nearbyIds = new Set(nearby.map((m) => String(m.contractor._id)));
  const offerStatus = new Map((request.offers || []).map((o) => [String(o.contractorId), o.status]));

  const others = await ContractorProfile
    .find({
      ...alive,
      status: 'approved',
      isActive: { $ne: false },
      _id: { $nin: [...nearbyIds] },
    })
    .select('businessName ownerName phone contractorCode serviceAreas rating')
    .sort({ businessName: 1 })
    .limit(100)
    .lean();

  const shape = (c, extra) => ({
    id: String(c._id),
    businessName: c.businessName,
    ownerName: c.ownerName || '',
    phone: c.phone || '',
    contractorCode: c.contractorCode || '',
    serviceAreas: c.serviceAreas || [],
    rating: c.rating || 0,
    offerStatus: offerStatus.get(String(c._id)) || null,
    ...extra,
  });

  return [
    ...nearby.map((m) => shape(m.contractor, { nearby: true, reasons: m.reasons })),
    ...others.map((c) => shape(c, { nearby: false, reasons: [] })),
  ];
};

/**
 * The office puts a specific contractor on a paid request — the normal path for
 * commercial visits, and the fallback for a residential one nobody accepted.
 *
 * One conditional update decides it (nobody assigned yet, fee not unpaid/refunded), so
 * it cannot overwrite a contractor who accepted a moment earlier. The contractor gets an
 * accepted offer so the request appears in their list exactly like one they took
 * themselves; every other open offer is withdrawn.
 */
export const assignContractor = async (requestId, contractorIdRaw, reqUser = null) => {
  const contractorId = oid(contractorIdRaw);
  const contractor = await ContractorProfile
    .findOne({ _id: contractorId, ...alive })
    .select('businessName status isActive')
    .lean();
  if (!contractor || contractor.status !== 'approved' || contractor.isActive === false) {
    throw new ValidationError('Choose an approved, active contractor');
  }

  const now = new Date();
  const claimed = await PackageRequest.findOneAndUpdate(
    {
      _id: requestId,
      assignedContractorId: null,
      'payment.status': { $in: ['paid', 'not_required'] },
      status: { $nin: ['awaiting_payment', 'lost'] },
    },
    {
      $set: {
        assignedContractorId: contractorId,
        assignedAt: now,
        assignedBy: 'admin',
        'dispatch.state': 'accepted',
        'dispatch.lastDispatchedAt': now,
      },
    },
    { new: true },
  ).lean();

  if (!claimed) {
    const existing = await PackageRequest.findById(requestId).select('assignedContractorId payment status').lean();
    if (!existing) throw new ValidationError('Request not found');
    if (existing.assignedContractorId) throw new ValidationError('A contractor has already taken this request');
    if (existing.payment?.status === 'refunded') throw new ValidationError('The visiting fee has been refunded');
    throw new ValidationError('This request has not been paid for, so it cannot be assigned yet');
  }

  // Make the chosen contractor's offer an accepted one, adding it if they were never asked.
  const upgraded = await PackageRequest.updateOne(
    { _id: requestId, 'offers.contractorId': contractorId },
    { $set: { 'offers.$[mine].status': 'accepted', 'offers.$[mine].respondedAt': now } },
    { arrayFilters: [{ 'mine.contractorId': contractorId }] },
  );
  if (!upgraded.matchedCount) {
    await PackageRequest.updateOne(
      { _id: requestId },
      {
        $push: {
          offers: {
            contractorId,
            status: 'accepted',
            offeredAt: now,
            respondedAt: now,
            matchReasons: ['Assigned by the office'],
          },
        },
      },
    );
  }

  const losers = (claimed.offers || []).filter(
    (o) => o.status === 'offered' && String(o.contractorId) !== String(contractorId),
  );
  await PackageRequest.updateOne(
    { _id: requestId },
    { $set: { 'offers.$[o].status': 'withdrawn', 'offers.$[o].respondedAt': now } },
    { arrayFilters: [{ 'o.status': 'offered' }] },
  );
  notifyOffersTaken(claimed, losers);

  const where = claimed.site?.city;
  notify({
    ownerType: 'CONTRACTOR',
    ownerId: String(contractorId),
    source: 'NEW_LEAD',
    title: 'A site visit has been assigned to you',
    message: `${claimed.package?.name || 'Package'} in ${where} (${shortRef(requestId)}) — open it for the customer's details.`,
    link: `/contractor/package-requests/${requestId}`,
    metadata: { packageRequestId: String(requestId) },
  }).catch(() => {});
  notify({
    ownerType: 'USER',
    ownerId: String(claimed.customerId),
    source: 'NEW_LEAD',
    title: 'A contractor will visit your site',
    message: `${contractor.businessName || 'A contractor'} has been assigned to your ${claimed.package?.name || 'package'} request in ${where}.`,
    link: `/construction/site-visits/${requestId}`,
    metadata: { packageRequestId: String(requestId) },
  }).catch(() => {});

  await audit('package_request.assigned', {
    entityId: requestId,
    after: { contractorId: String(contractorId), by: 'admin' },
    performedBy: reqUser ? extractPerformer(reqUser) : undefined,
  });
  return PackageRequest.findById(requestId).lean();
};

// ---------- What a contractor sees ----------

/** A request as the CONTRACTOR sees it. The customer's contact details only appear once they have accepted. */
const toContractorView = (request, contractorId, now = new Date()) => {
  const mine = (request.offers || []).find((o) => String(o.contractorId) === String(contractorId));
  const assignedToMe = String(request.assignedContractorId || '') === String(contractorId);
  const takenByOther = Boolean(request.assignedContractorId) && !assignedToMe;
  const open = !request.assignedContractorId
    && mine?.status === 'offered'
    && (!mine.expiresAt || new Date(mine.expiresAt) > now);

  return {
    id: String(request._id),
    reference: `#${String(request._id).slice(-6).toUpperCase()}`,
    package: { name: request.package?.name, segment: request.package?.segment },
    site: {
      city: request.site?.city,
      area: request.site?.area || '',
      areaPerFloor: request.site?.areaPerFloor,
      floors: request.site?.floors,
      totalBuiltUpArea: request.site?.totalBuiltUpArea,
    },
    estimatedCost: request.estimatedCost,
    visitingFee: request.visitingFee || 0,
    startWindow: request.startWindow,
    notes: request.notes || '',
    offeredAt: mine?.offeredAt || null,
    expiresAt: mine?.expiresAt || null,
    myStatus: mine?.status || null,
    canRespond: open,
    takenByOther,
    assignedToMe,
    // Where the site visit has got to, so the list can show "On the way" / "Report sent".
    visitStage: assignedToMe ? (request.visit?.stage || 'assigned') : null,
    contractStatus: assignedToMe ? (request.contract?.status || 'none') : null,
    // The exact address and pin, private until they have committed to the visit.
    siteExact: assignedToMe
      ? {
        address: request.site?.address || '',
        landmark: request.site?.landmark || '',
        pincode: request.site?.pincode || '',
        lat: request.site?.location?.coordinates?.[1] ?? null,
        lng: request.site?.location?.coordinates?.[0] ?? null,
      }
      : null,
    // Private until they have committed to the visit.
    customer: assignedToMe ? { name: request.contact?.name, phone: request.contact?.phone } : null,
  };
};

export const listContractorPackageRequests = async (contractorId, query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { 'offers.contractorId': contractorId };

  const [docs, total] = await Promise.all([
    PackageRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PackageRequest.countDocuments(filter),
  ]);
  const now = new Date();
  return buildPaginatedResult({
    docs: docs.map((doc) => toContractorView(doc, contractorId, now)),
    total,
    page,
    limit,
  });
};

export { toContractorView };
