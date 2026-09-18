import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { SiteVisit } from '../models/siteVisit.model.js';
import { ConstructionEnquiry } from '../models/constructionEnquiry.model.js';
import { ContractorLead } from '../models/contractorLead.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { ConstructionService } from '../models/constructionService.model.js';
import { getSettings } from './settings.service.js';
import { touchEnquiry } from './enquiry.service.js';
import { notifyVisitProposed, notifyVisitConfirmed, contractorName } from './notify.service.js';

const alive = { isDeleted: { $ne: true } };

/** Metres between two [lng, lat] pairs — used to sanity-check a site check-in. */
const distanceMeters = ([lng1, lat1], [lng2, lat2]) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/** The contractor must have accepted the lead before touching the enquiry's visits. */
const assertContractorOnEnquiry = async (contractorId, enquiryId) => {
  const lead = await ContractorLead.findOne({
    enquiryId, contractorId, status: 'accepted',
  }).select('_id').lean();
  if (!lead) throw new ValidationError('You have not taken on this enquiry');
  return lead;
};

/**
 * BRD C9 / W8 — propose a visit. Either side may suggest a slot; the other
 * confirms. "Missed visits waste a full day for both parties", so both a
 * proposal and a confirmation are explicit rather than implied.
 */
export const proposeVisit = async ({ enquiryId, contractorId, proposedBy, scheduledAt, actorId }) => {
  const enquiry = await ConstructionEnquiry.findOne({ _id: enquiryId, ...alive });
  if (!enquiry) throw new ValidationError('Enquiry not found');
  if (['converted', 'closed_lost', 'expired'].includes(enquiry.status)) {
    throw new ValidationError('This enquiry is closed');
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) throw new ValidationError('Pick a valid date and time');
  if (when.getTime() < Date.now()) throw new ValidationError('Pick a time in the future');

  if (proposedBy === 'contractor') {
    await assertContractorOnEnquiry(contractorId, enquiryId);
  } else if (String(enquiry.customerId) !== String(actorId)) {
    throw new ValidationError('Enquiry not found');
  }

  // One live visit per contractor per enquiry — a second proposal replaces the
  // first rather than leaving two appointments nobody knows which to attend.
  const existing = await SiteVisit.findOne({
    enquiryId, contractorId, status: { $in: ['proposed', 'confirmed'] },
  });
  if (existing) {
    existing.rescheduledFrom = existing.scheduledAt;
    existing.scheduledAt = when;
    existing.proposedBy = proposedBy;
    existing.status = 'proposed';
    existing.confirmedAt = null;
    await existing.save();
    touchEnquiry(enquiry, null, '');
    await enquiry.save();
    return existing.toObject();
  }

  const settings = await getSettings();
  const charged = settings.money?.siteVisitCharged === true;

  const visit = await SiteVisit.create({
    enquiryId,
    contractorId,
    customerId: enquiry.customerId,
    scheduledAt: when,
    proposedBy,
    status: 'proposed',
    feeAmount: charged ? Number(settings.money?.siteVisitFee) || 0 : 0,
  });

  touchEnquiry(enquiry, 'visit_scheduled', 'Site visit proposed');
  await enquiry.save();

  // Whoever did NOT propose has to confirm, so they are the one to tell.
  (async () => {
    const name = proposedBy === 'contractor'
      ? await contractorName(contractorId)
      : 'The customer';
    await notifyVisitProposed({
      toOwnerType: proposedBy === 'contractor' ? 'USER' : 'CONTRACTOR',
      toOwnerId: proposedBy === 'contractor' ? enquiry.customerId : contractorId,
      byName: name,
      scheduledAt: when,
      enquiry: { id: enquiry._id },
      visitId: visit._id,
    });
  })().catch(() => {});

  await recordAudit({
    module: 'construction',
    entityType: 'site_visit',
    entityId: visit._id,
    action: 'visit.proposed',
    after: { enquiryId: String(enquiryId), scheduledAt: when, proposedBy },
  });

  return visit.toObject();
};

/** The other side accepts the slot. */
export const confirmVisit = async (visitId, { actorRole, actorId }) => {
  const visit = await SiteVisit.findById(visitId);
  if (!visit) throw new ValidationError('Site visit not found');
  if (visit.status !== 'proposed') {
    throw new ValidationError(`This visit is already ${visit.status}`);
  }
  // Whoever proposed cannot also confirm — that would make confirmation meaningless.
  if (visit.proposedBy === actorRole) {
    throw new ValidationError('Waiting for the other side to confirm this time');
  }
  const ownerId = actorRole === 'customer' ? visit.customerId : visit.contractorId;
  if (String(ownerId) !== String(actorId)) throw new ValidationError('Site visit not found');

  visit.status = 'confirmed';
  visit.confirmedAt = new Date();
  await visit.save();

  const enquiry = await ConstructionEnquiry.findById(visit.enquiryId);
  if (enquiry) {
    touchEnquiry(enquiry, 'visit_scheduled', 'Site visit confirmed');
    await enquiry.save();
  }

  // Tell the side that proposed it — they have been waiting on this answer.
  notifyVisitConfirmed({
    toOwnerType: visit.proposedBy === 'contractor' ? 'CONTRACTOR' : 'USER',
    toOwnerId: visit.proposedBy === 'contractor' ? visit.contractorId : visit.customerId,
    scheduledAt: visit.scheduledAt,
    enquiry: { id: visit.enquiryId },
    visitId: visit._id,
  }).catch(() => {});

  return visit.toObject();
};

export const cancelVisit = async (visitId, { actorRole, actorId, reason }) => {
  const visit = await SiteVisit.findById(visitId);
  if (!visit) throw new ValidationError('Site visit not found');
  if (['completed', 'cancelled'].includes(visit.status)) {
    throw new ValidationError(`This visit is already ${visit.status}`);
  }
  const ownerId = actorRole === 'customer' ? visit.customerId : visit.contractorId;
  if (String(ownerId) !== String(actorId)) throw new ValidationError('Site visit not found');

  visit.status = 'cancelled';
  visit.cancelReason = String(reason || '').trim();
  await visit.save();
  return visit.toObject();
};

/**
 * BRD W9 — the structured on-site form.
 *
 * `checkIn` records that the contractor was actually at the site. The distance
 * from the enquiry's pin is stored rather than enforced: a site pin can be
 * wrong, and refusing a genuine visit over a map inaccuracy would be worse than
 * recording the discrepancy for someone to look at.
 */
export const submitVisitReport = async (contractorId, visitId, { report, checkIn }) => {
  const visit = await SiteVisit.findOne({ _id: visitId, contractorId });
  if (!visit) throw new ValidationError('Site visit not found');
  if (visit.status === 'completed') throw new ValidationError('This visit is already recorded');
  if (visit.status === 'cancelled') throw new ValidationError('This visit was cancelled');

  visit.report = {
    measurements: report.measurements || '',
    siteCondition: report.siteCondition || '',
    access: report.access || '',
    waterAvailable: report.waterAvailable ?? null,
    electricityAvailable: report.electricityAvailable ?? null,
    observations: report.observations || '',
    photos: report.photos || [],
  };

  if (checkIn?.coordinates?.length === 2) {
    visit.checkIn = { at: new Date(), location: { type: 'Point', coordinates: checkIn.coordinates } };

    const enquiry = await ConstructionEnquiry.findById(visit.enquiryId).select('site.location').lean();
    const sitePin = enquiry?.site?.location?.coordinates;
    if (sitePin?.length === 2) {
      visit.checkIn.distanceFromSiteMeters = distanceMeters(checkIn.coordinates, sitePin);
    }
  }

  visit.status = 'completed';
  visit.completedAt = new Date();
  await visit.save();

  const enquiry = await ConstructionEnquiry.findById(visit.enquiryId);
  if (enquiry) {
    touchEnquiry(enquiry, 'visit_completed', 'Site visit completed');
    await enquiry.save();
  }

  await recordAudit({
    module: 'construction',
    entityType: 'site_visit',
    entityId: visit._id,
    action: 'visit.completed',
    after: {
      enquiryId: String(visit.enquiryId),
      photoCount: visit.report.photos.length,
      checkedIn: Boolean(visit.checkIn?.at),
      distanceFromSiteMeters: visit.checkIn?.distanceFromSiteMeters ?? null,
    },
  });

  return visit.toObject();
};

export const listContractorVisits = async (contractorId, query = {}) => {
  const filter = { contractorId };
  if (query.status) filter.status = query.status;
  if (query.upcoming === 'true') {
    filter.status = { $in: ['proposed', 'confirmed'] };
    filter.scheduledAt = { $gte: new Date() };
  }
  return SiteVisit.find(filter)
    .populate({
      path: 'enquiryId',
      select: 'enquiryNumber site description serviceId',
      populate: { path: 'serviceId', select: 'name' },
    })
    .sort({ scheduledAt: 1 })
    .limit(100)
    .lean();
};

export const getVisit = async (visitId, { contractorId, customerId } = {}) => {
  const filter = { _id: visitId };
  if (contractorId) filter.contractorId = contractorId;
  if (customerId) filter.customerId = customerId;

  const visit = await SiteVisit.findOne(filter)
    .populate({
      path: 'enquiryId',
      select: 'enquiryNumber site description budgetMin budgetMax attachments serviceId',
      populate: { path: 'serviceId', select: 'name' },
    })
    .populate('contractorId', 'businessName contractorCode phone rating')
    .lean();
  if (!visit) throw new ValidationError('Site visit not found');
  return visit;
};
