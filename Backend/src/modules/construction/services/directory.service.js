import { ValidationError } from '../../../core/auth/errors.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../utils/helpers.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { ContractorPortfolio } from '../models/contractorPortfolio.model.js';
import { ContractorDocument } from '../models/contractorDocument.model.js';
import { ContractorLead } from '../models/contractorLead.model.js';
import { ConstructionEnquiry } from '../models/constructionEnquiry.model.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ContractorScore } from '../models/contractorScore.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ConstructionService } from '../models/constructionService.model.js';

/**
 * The customer's view of contractors (BRD C6, C7, C8).
 *
 * "Choice is the main reason a customer would use a platform rather than ask a
 * relative", and "this is where trust is actually created — without it, every
 * contractor looks identical."
 *
 * Everything here is deliberately READ-ONLY and deliberately narrow. A customer
 * gets the facts that help them choose — verified badges, trust band, completed
 * work, reviews — and nothing that belongs to the contractor's own business:
 * no bank details, no document files, no earnings, no internal notes, and never
 * the trust-score component breakdown.
 */

const alive = { isDeleted: { $ne: true } };
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

/**
 * The public shape. Built by hand rather than by deleting fields from the
 * profile, because a `.select()` that forgets one field leaks a bank account,
 * whereas an allow-list that forgets one merely omits a badge.
 */
const publicCard = (contractor, score, extra = {}) => ({
  id: String(contractor._id),
  businessName: contractor.businessName,
  contractorCode: contractor.contractorCode || '',
  profileImage: contractor.profileImage || '',
  about: contractor.about || '',
  cities: contractor.serviceAreas || [],
  trades: contractor.trades || [],
  yearsExperience: contractor.yearsExperience || 0,
  rating: round1(contractor.rating),
  totalRatings: contractor.totalRatings || 0,
  completedProjects: contractor.completedProjects || 0,
  /** BRD C6 — "verification status". True only once your team approved them. */
  isVerified: contractor.status === 'approved' && contractor.isActive !== false,
  /** A provisional score shows as a band, never as a misleading number. */
  trustBand: score?.band || 'new',
  trustScore: score && !score.isProvisional ? score.score : null,
  ...extra,
});

/**
 * BRD C6 — the contractors matched to one enquiry.
 *
 * Scoped to the enquiry rather than being a global directory, because that is
 * what the BRD asks for and because it is the honest thing to show: these are
 * the firms that were actually offered this job and can actually take it.
 *
 * `matchReasons` comes straight from the matching service, so a customer can see
 * WHY each contractor was put in front of them rather than having to trust a
 * ranking they cannot inspect.
 */
export const listContractorsForEnquiry = async (customerId, enquiryId) => {
  const enquiry = await ConstructionEnquiry
    .findOne({ _id: enquiryId, customerId, ...alive })
    .lean();
  if (!enquiry) throw new ValidationError('Enquiry not found');

  const leads = await ContractorLead
    .find({ enquiryId: enquiry._id, status: { $nin: ['expired', 'withdrawn'] } })
    .sort({ matchScore: -1, offeredAt: 1 })
    .lean();

  if (leads.length === 0) {
    return { enquiryId: String(enquiry._id), contractors: [], stillMatching: true };
  }

  const ids = leads.map((l) => l.contractorId);
  const [contractors, scores, similar] = await Promise.all([
    ContractorProfile.find({ _id: { $in: ids }, ...alive }).lean(),
    ContractorScore.find({ contractorId: { $in: ids } }).lean(),
    // BRD C6 — "how many similar projects they have completed".
    ConstructionProject.aggregate([
      {
        $match: {
          contractorId: { $in: ids },
          serviceId: enquiry.serviceId,
          status: { $in: ['completed', 'closed'] },
          isDeleted: { $ne: true },
        },
      },
      { $group: { _id: '$contractorId', count: { $sum: 1 } } },
    ]),
  ]);

  const byId = new Map(contractors.map((c) => [String(c._id), c]));
  const scoreById = new Map(scores.map((s) => [String(s.contractorId), s]));
  const similarById = new Map(similar.map((s) => [String(s._id), s.count]));

  return {
    enquiryId: String(enquiry._id),
    stillMatching: false,
    contractors: leads
      .map((lead) => {
        const contractor = byId.get(String(lead.contractorId));
        if (!contractor) return null;
        return publicCard(contractor, scoreById.get(String(lead.contractorId)), {
          similarProjectsCompleted: similarById.get(String(lead.contractorId)) || 0,
          leadStatus: lead.status,
          /** Transparent matching — the customer sees why this firm is here. */
          matchReasons: lead.matchReasons || [],
          respondedAt: lead.respondedAt || null,
        });
      })
      .filter(Boolean),
  };
};

/**
 * BRD C8 — the searchable directory.
 *
 * "Narrow the list by type of work, distance, rating, verification level or
 * availability."
 *
 * Only approved, active contractors are ever listed. A customer browsing this
 * must never see a firm your team rejected or suspended — the whole promise of
 * the module is that everyone on it has been checked.
 */
export const searchContractors = async (query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);

  const filter = {
    ...alive,
    status: 'approved',
    isActive: { $ne: false },
  };

  if (query.trade) filter.trades = query.trade;
  if (query.city) filter.serviceAreas = new RegExp(escapeRegex(String(query.city).trim()), 'i');
  if (query.minRating) filter.rating = { $gte: Number(query.minRating) || 0 };

  const search = String(query.search || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ businessName: rx }, { about: rx }, { contractorCode: rx }];
  }

  // BRD C8 "availability" — a contractor at their declared capacity cannot take
  // on more work, so offering them to a customer wastes everyone's time.
  const wantAvailable = query.available === 'true' || query.available === true;

  const [docs, total] = await Promise.all([
    ContractorProfile.find(filter)
      .sort({ rating: -1, completedProjects: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ContractorProfile.countDocuments(filter),
  ]);

  const ids = docs.map((d) => d._id);
  const [scores, liveCounts] = await Promise.all([
    ContractorScore.find({ contractorId: { $in: ids } }).lean(),
    ConstructionProject.aggregate([
      {
        $match: {
          contractorId: { $in: ids },
          status: { $in: ['active', 'handover_pending', 'awaiting_funding'] },
          isDeleted: { $ne: true },
        },
      },
      { $group: { _id: '$contractorId', count: { $sum: 1 } } },
    ]),
  ]);

  const scoreById = new Map(scores.map((s) => [String(s.contractorId), s]));
  const liveById = new Map(liveCounts.map((c) => [String(c._id), c.count]));

  let rows = docs.map((c) => {
    const live = liveById.get(String(c._id)) || 0;
    const cap = Number(c.maxConcurrentProjects) || 0;
    return publicCard(c, scoreById.get(String(c._id)), {
      isAvailable: cap === 0 || live < cap,
      liveProjects: live,
    });
  });

  if (wantAvailable) rows = rows.filter((r) => r.isAvailable);

  return buildPaginatedResult({ docs: rows, total, page, limit });
};

/**
 * BRD C7 — one contractor's full public page.
 *
 * "Verification badges, trust score, photographs of completed work, the kinds of
 * work they specialise in, and reviews from past customers."
 *
 * Reviews are read from completed projects rather than a separate reviews table,
 * so a review can only exist where a real project was actually finished and paid
 * for. There is no way to post one without having been a customer.
 */
export const getContractorProfile = async (contractorId) => {
  const contractor = await ContractorProfile
    .findOne({ _id: contractorId, status: 'approved', ...alive })
    .lean();
  if (!contractor) throw new ValidationError('Contractor not found');

  const [score, portfolio, documents, reviewProjects, liveCount] = await Promise.all([
    ContractorScore.findOne({ contractorId }).lean(),
    ContractorPortfolio.find({ contractorId, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 }).limit(24).lean(),
    // Only which KINDS of document are verified — never the files themselves.
    ContractorDocument.find({ contractorId, status: 'verified', isDeleted: { $ne: true } })
      .select('documentType').lean(),
    ConstructionProject.find({
      contractorId,
      rating: { $ne: null },
      status: { $in: ['completed', 'closed'] },
      ...alive,
    })
      .populate('customerId', 'name')
      .populate('serviceId', 'name')
      .select('rating review updatedAt customerId serviceId')
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean(),
    ConstructionProject.countDocuments({
      contractorId,
      status: { $in: ['active', 'handover_pending', 'awaiting_funding'] },
      ...alive,
    }),
  ]);

  const cap = Number(contractor.maxConcurrentProjects) || 0;

  return {
    ...publicCard(contractor, score, {
      isAvailable: cap === 0 || liveCount < cap,
    }),

    /** BRD C7 — the badges, as kinds only. */
    verifiedDocuments: [...new Set(documents.map((d) => d.documentType))],

    /** BRD C7, W5 — photographs of completed work. */
    portfolio: portfolio.map((p) => ({
      id: String(p._id),
      title: p.title || '',
      description: p.description || '',
      images: p.images || [],
      isVerified: p.verified === true,
      location: p.location || '',
      completedAt: p.completedAt || null,
    })),

    /**
     * BRD C7 — reviews. Names are shortened to a first name and an initial:
     * a customer leaving an honest review about someone's building work should
     * not be fully identifiable to every visitor.
     */
    reviews: reviewProjects
      .filter((p) => String(p.review || '').trim().length > 0 || p.rating)
      .map((p) => ({
        rating: p.rating,
        review: p.review || '',
        service: p.serviceId?.name || '',
        by: shortenName(p.customerId?.name),
        at: p.updatedAt,
      })),
  };
};

/** "Rajesh Kumar Sharma" -> "Rajesh K." */
const shortenName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A customer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
};

const REGEX_SPECIALS = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
const escapeRegex = (value) => String(value)
  .split('')
  .map((ch) => (REGEX_SPECIALS.has(ch) ? `\\${ch}` : ch))
  .join('');

export { publicCard };
