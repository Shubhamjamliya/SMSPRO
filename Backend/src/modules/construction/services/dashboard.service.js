import mongoose from 'mongoose';
import { ConstructionEnquiry } from '../models/constructionEnquiry.model.js';
import { ContractorLead } from '../models/contractorLead.model.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { ContractorDocument } from '../models/contractorDocument.model.js';
import { Quotation } from '../models/quotation.model.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectStage } from '../models/projectStage.model.js';
import { ProjectDispute } from '../models/projectDispute.model.js';
import { PackageRequest } from '../models/packageRequest.model.js';
import { MaterialRequest } from '../models/materialRequest.model.js';
import { getSettings } from './settings.service.js';

/**
 * BRD A1 — the operations dashboard.
 *
 * "The whole picture at a glance: enquiries received, live projects, total
 * value, stages due, and anything needing attention. The screen your operations
 * team will keep open all day."
 *
 * That last sentence decides the design. A screen someone keeps open all day is
 * not a report — it is a WORK QUEUE. So the top of it is `attention`: the things
 * that will become a phone call if nobody touches them today, each with a count
 * and a link. The counts and charts underneath are context, not the point.
 *
 * Everything is derived at read time. There is no rollup table to drift out of
 * sync, and at the volumes this module will see for years, aggregating a few
 * thousand documents is cheaper than maintaining a cache that can be wrong.
 */

const alive = { isDeleted: { $ne: true } };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const countBy = (rows) => rows.reduce((acc, r) => ({ ...acc, [r._id ?? 'unknown']: r.count }), {});

/**
 * The things that need a person today.
 *
 * Ordered by consequence, not by count: money frozen in a dispute outranks an
 * unread enquiry, because one is a customer whose funds are stuck and the other
 * is a lead that is merely going cold.
 */
async function buildAttentionQueue(settings, packages, extras) {
  const now = new Date();
  const quietHours = Number(settings.matching?.leadResponseHours) || 24;
  const quietBefore = new Date(now.getTime() - quietHours * 3600000);
  const staleApprovalDays = Number(settings.stages?.autoApproveAfterDays) || 7;
  const staleBefore = new Date(now.getTime() - staleApprovalDays * 86400000);
  const soon = new Date(now.getTime() + 7 * 86400000);

  const [
    liveDisputes,
    staleApprovals,
    unmatched,
    quietEnquiries,
    pendingContractors,
    expiredDocs,
    overdueStages,
    unfundedProjects,
    heldProjects,
  ] = await Promise.all([
    ProjectDispute.find({ status: { $in: ['open', 'under_review'] }, ...alive })
      .select('frozenAmount').lean(),
    ProjectStage.countDocuments({
      status: 'submitted_for_approval',
      submittedAt: { $lt: staleBefore },
    }),
    ConstructionEnquiry.countDocuments({
      status: { $in: ['submitted', 'matching'] },
      ...alive,
    }),
    ConstructionEnquiry.countDocuments({
      status: { $in: ['submitted', 'matching', 'quoted', 'negotiating'] },
      updatedAt: { $lt: quietBefore },
      ...alive,
    }),
    ContractorProfile.countDocuments({ status: 'pending_approval', ...alive }),
    ContractorDocument.countDocuments({
      expiresAt: { $lt: now, $ne: null },
      isDeleted: { $ne: true },
    }),
    ProjectStage.countDocuments({
      status: { $nin: ['approved', 'payment_released', 'skipped'] },
      targetDate: { $lt: now, $ne: null },
    }),
    ConstructionProject.countDocuments({ status: 'awaiting_funding', ...alive }),
    ConstructionProject.countDocuments({ status: 'on_hold', ...alive }),
  ]);

  const frozenMoney = round2(liveDisputes.reduce((s, d) => s + (d.frozenAmount || 0), 0));

  const seg = (key) => packages.segments[key];
  const path = (key, page) => `/admin/construction/end-to-end/${key}/${page}`;
  const nice = (key) => (key === 'commercial' ? 'Commercial' : 'Residential');

  const items = [
    {
      key: 'disputes',
      label: 'Disputes waiting on a decision',
      count: liveDisputes.length,
      amount: frozenMoney,
      severity: 'critical',
      detail: frozenMoney > 0
        ? `${round2(frozenMoney).toLocaleString('en-IN')} of customer money is frozen`
        : 'No money frozen',
      link: '/admin/construction/disputes',
    },
    {
      key: 'stale_approvals',
      label: 'Stages the customer has not approved',
      count: staleApprovals,
      severity: 'critical',
      detail: `Submitted more than ${staleApprovalDays} days ago — the contractor is unpaid`,
      link: '/admin/construction/projects',
    },
    // The site visit flow: paid bookings and finished reports are customers waiting on the office.
    ...SEGMENTS.map((key) => ({
      key: `${key}_needs_contractor`,
      label: `${nice(key)} visits need a contractor`,
      count: seg(key).needsContractor,
      severity: 'high',
      detail: key === 'commercial'
        ? 'Paid for — commercial visits are assigned by your team'
        : 'Nobody accepted, or no contractor covers the area',
      link: path(key, 'requests'),
    })),
    ...SEGMENTS.map((key) => ({
      key: `${key}_to_quote`,
      label: `${nice(key)} site reports to quote`,
      count: seg(key).toQuote,
      severity: 'high',
      detail: 'The contractor has visited — the customer is waiting for a price',
      link: path(key, 'quotations'),
    })),
    {
      key: 'pending_contractors',
      label: 'Contractors waiting for verification',
      count: pendingContractors,
      severity: 'high',
      detail: 'They cannot receive any work until reviewed',
      link: '/admin/construction/contractors',
    },
    {
      key: 'unmatched_enquiries',
      label: 'Enquiries with no contractor yet',
      count: unmatched,
      severity: 'high',
      detail: 'A customer is waiting for a first response',
      link: '/admin/construction/enquiries',
    },
    {
      key: 'material_requests',
      label: 'New material quote requests',
      count: extras.materials.new,
      severity: 'medium',
      detail: 'Customers are waiting for a price on materials',
      link: '/admin/construction/material-requests',
    },
    {
      key: 'quiet_enquiries',
      label: 'Enquiries that have gone quiet',
      count: quietEnquiries,
      severity: 'medium',
      detail: `Nothing has happened in ${quietHours}h`,
      link: '/admin/construction/enquiries',
    },
    {
      key: 'overdue_stages',
      label: 'Stages past their target date',
      count: overdueStages,
      severity: 'medium',
      detail: 'Both sides have been alerted automatically',
      link: '/admin/construction/projects',
    },
    {
      key: 'expired_documents',
      label: 'Contractors with expired documents',
      count: expiredDocs,
      severity: 'medium',
      detail: 'Licence or insurance has lapsed',
      link: '/admin/construction/contractors',
    },
    {
      key: 'on_hold',
      label: 'Projects on hold',
      count: heldProjects,
      severity: 'medium',
      detail: 'Paused by your team — nothing can be released',
      link: '/admin/construction/projects',
    },
    {
      key: 'awaiting_funding',
      label: 'Projects waiting for the customer to pay in',
      count: unfundedProjects,
      severity: 'low',
      detail: 'Work cannot start until money is held',
      link: '/admin/construction/projects',
    },
  ];

  // Only surface what actually needs doing. A queue full of zeroes trains
  // people to stop reading it.
  return items.filter((i) => i.count > 0);
}

const SEGMENTS = ['residential', 'commercial'];
const KOLKATA = 'Asia/Kolkata';

const zeroSegment = () => ({
  booked: 0, inPeriod: 0, feesCollected: 0,
  needsContractor: 0, offersOut: 0, assigned: 0, inProgress: 0,
  reportsIn: 0, toQuote: 0,
  quotesSent: 0, quotesSentValue: 0,
  accepted: 0, acceptedValue: 0, declined: 0,
});

/** 1 when the condition holds, else 0 — for summing inside a $group. */
const flag = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

/**
 * Package site visits, per segment, from booking to an accepted quotation.
 *
 * Only REAL bookings count: a request still waiting for its visiting fee has not been sent
 * to anyone and is not the office's concern yet. "Needs a contractor" is the office's queue —
 * commercial visits (never broadcast) and residential ones nobody took.
 */
async function getPackageStats(since) {
  const stage = { $ifNull: ['$visit.stage', 'assigned'] };
  const noContractor = { $eq: [{ $ifNull: ['$assignedContractorId', null] }, null] };
  const contractStatus = { $ifNull: ['$contract.status', 'none'] };
  const open = { $and: [{ $ne: ['$payment.status', 'refunded'] }, { $ne: ['$status', 'lost'] }] };

  const [bySegment, daily] = await Promise.all([
    PackageRequest.aggregate([
      { $match: { status: { $ne: 'awaiting_payment' } } },
      {
        $group: {
          _id: '$package.segment',
          booked: { $sum: 1 },
          inPeriod: flag({ $gte: ['$createdAt', since] }),
          feesCollected: { $sum: { $cond: [{ $eq: ['$payment.status', 'paid'] }, '$payment.amount', 0] } },
          needsContractor: flag({
            $and: [noContractor, open, { $in: ['$dispatch.state', ['awaiting_admin', 'unassigned', 'no_contractors']] }],
          }),
          offersOut: flag({ $and: [noContractor, open, { $eq: ['$dispatch.state', 'sent'] }] }),
          assigned: flag({ $not: [noContractor] }),
          inProgress: flag({ $and: [{ $not: [noContractor] }, { $in: [stage, ['assigned', 'on_the_way', 'arrived']] }] }),
          reportsIn: flag({ $eq: [stage, 'report_submitted'] }),
          toQuote: flag({ $and: [{ $eq: [stage, 'report_submitted'] }, { $eq: [contractStatus, 'none'] }] }),
          quotesSent: flag({ $eq: [contractStatus, 'sent'] }),
          quotesSentValue: { $sum: { $cond: [{ $eq: [contractStatus, 'sent'] }, '$contract.price', 0] } },
          accepted: flag({ $eq: [contractStatus, 'accepted'] }),
          acceptedValue: { $sum: { $cond: [{ $eq: [contractStatus, 'accepted'] }, '$contract.price', 0] } },
          declined: flag({ $eq: [contractStatus, 'rejected'] }),
        },
      },
    ]),
    // Bookings per day for the trend chart, in the office's own time zone.
    PackageRequest.aggregate([
      { $match: { status: { $ne: 'awaiting_payment' }, createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: KOLKATA } },
            segment: '$package.segment',
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const segments = Object.fromEntries(SEGMENTS.map((k) => [k, zeroSegment()]));
  for (const row of bySegment) {
    if (!segments[row._id]) continue;
    const { _id, ...figures } = row;
    segments[_id] = {
      ...segments[_id],
      ...figures,
      feesCollected: round2(figures.feesCollected),
      quotesSentValue: round2(figures.quotesSentValue),
      acceptedValue: round2(figures.acceptedValue),
    };
  }

  const sum = (key) => SEGMENTS.reduce((t, k) => t + segments[k][key], 0);
  return {
    segments,
    totals: {
      booked: sum('booked'),
      inPeriod: sum('inPeriod'),
      feesCollected: round2(sum('feesCollected')),
      needsContractor: sum('needsContractor'),
      inProgress: sum('inProgress'),
      toQuote: sum('toQuote'),
      quotesSent: sum('quotesSent'),
      quotesSentValue: round2(sum('quotesSentValue')),
      accepted: sum('accepted'),
      acceptedValue: round2(sum('acceptedValue')),
    },
    daily,
  };
}

/** One entry per day in the window (zeros included), so a quiet day is a short bar, not a gap. */
function buildTrend(daily, days) {
  const span = Math.min(Math.max(Number(days) || 30, 7), 90);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: KOLKATA });
  const byDay = new Map();
  for (const { _id, count } of daily) {
    const entry = byDay.get(_id.day) || { residential: 0, commercial: 0 };
    if (entry[_id.segment] !== undefined) entry[_id.segment] += count;
    byDay.set(_id.day, entry);
  }
  const out = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const day = fmt.format(new Date(Date.now() - i * 86400000));
    const entry = byDay.get(day) || { residential: 0, commercial: 0 };
    out.push({ date: day, ...entry, total: entry.residential + entry.commercial });
  }
  return out;
}

/** Budget Friendly requests (enquiries raised from a Budget Friendly card) and material quote requests. */
async function getBudgetAndMaterials(since) {
  const budget = { budgetServiceId: { $ne: null }, ...alive };
  const [budgetTotal, budgetInPeriod, budgetOpen, materialByStatus] = await Promise.all([
    ConstructionEnquiry.countDocuments(budget),
    ConstructionEnquiry.countDocuments({ ...budget, createdAt: { $gte: since } }),
    ConstructionEnquiry.countDocuments({
      ...budget,
      status: { $nin: ['converted', 'closed_lost', 'expired', 'accepted'] },
    }),
    MaterialRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const materials = countBy(materialByStatus);
  return {
    budget: { total: budgetTotal, inPeriod: budgetInPeriod, open: budgetOpen },
    materials: {
      total: Object.values(materials).reduce((a, b) => a + b, 0),
      new: materials.new || 0,
      byStatus: materials,
    },
  };
}

/** BRD A1 — the dashboard payload. */
export const getDashboard = async ({ days = 30 } = {}) => {
  const settings = await getSettings();
  const since = new Date(Date.now() - (Number(days) || 30) * 86400000);

  // The attention queue needs the package and material figures, so they are gathered first.
  const [packageStats, extras] = await Promise.all([getPackageStats(since), getBudgetAndMaterials(since)]);

  const [
    attention,
    enquiryStatus,
    projectStatus,
    money,
    recentEnquiries,
    contractorCounts,
    quotationAgg,
    stagesDueSoon,
    topContractors,
  ] = await Promise.all([
    buildAttentionQueue(settings, packageStats, extras),

    ConstructionEnquiry.aggregate([
      { $match: alive },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    ConstructionProject.aggregate([
      { $match: alive },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    ConstructionProject.aggregate([
      { $match: { ...alive, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: null,
          agreed: { $sum: '$agreedValue' },
          funded: { $sum: '$fundedAmount' },
          released: { $sum: '$releasedAmount' },
          refunded: { $sum: '$refundedAmount' },
        },
      },
    ]),

    ConstructionEnquiry.countDocuments({ createdAt: { $gte: since }, ...alive }),

    ContractorProfile.aggregate([
      { $match: alive },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    Quotation.aggregate([
      { $match: { isLatest: true, ...alive } },
      { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$total' } } },
    ]),

    ProjectStage.find({
      status: { $nin: ['approved', 'payment_released', 'skipped'] },
      targetDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 86400000) },
    })
      .populate('projectId', 'projectNumber title')
      .select('name amount targetDate projectId status')
      .sort({ targetDate: 1 })
      .limit(15)
      .lean(),

    ConstructionProject.aggregate([
      { $match: { ...alive, status: { $in: ['completed', 'closed'] } } },
      {
        $group: {
          _id: '$contractorId',
          projects: { $sum: 1 },
          value: { $sum: '$agreedValue' },
        },
      },
      { $sort: { value: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const m = money[0] || { agreed: 0, funded: 0, released: 0, refunded: 0 };
  const enquiries = countBy(enquiryStatus);
  const projects = countBy(projectStatus);
  const contractors = countBy(contractorCounts);
  const suspendedCount = await ContractorProfile.countDocuments({
    status: 'approved', isActive: false, ...alive,
  });
  const quotes = quotationAgg.reduce(
    (acc, r) => ({ ...acc, [r._id]: { count: r.count, value: round2(r.value) } }),
    {},
  );

  // Fill in contractor names for the leaderboard.
  const contractorIds = topContractors.map((t) => t._id).filter(Boolean);
  const names = await ContractorProfile.find({ _id: { $in: contractorIds } })
    .select('businessName contractorCode rating').lean();
  const nameById = new Map(names.map((n) => [String(n._id), n]));

  const totalEnquiries = Object.values(enquiries).reduce((a, b) => a + b, 0);
  const converted = (enquiries.converted || 0) + (enquiries.accepted || 0);

  return {
    generatedAt: new Date(),
    periodDays: Number(days) || 30,

    /** The work queue. This is the point of the screen. */
    attention,

    enquiries: {
      total: totalEnquiries,
      inPeriod: recentEnquiries,
      byStatus: enquiries,
      /** BRD A9 — how many enquiries actually became projects. */
      conversionRate: totalEnquiries > 0
        ? Math.round((converted / totalEnquiries) * 1000) / 10
        : 0,
    },

    projects: {
      total: Object.values(projects).reduce((a, b) => a + b, 0),
      byStatus: projects,
      active: projects.active || 0,
      completed: (projects.completed || 0) + (projects.closed || 0),
    },

    money: {
      totalAgreedValue: round2(m.agreed),
      totalFunded: round2(m.funded),
      totalReleased: round2(m.released),
      totalRefunded: round2(m.refunded),
      /** What the platform is holding right now. The number ops watches. */
      currentlyHeld: round2(m.funded - m.released - m.refunded),
    },

    contractors: {
      total: Object.values(contractors).reduce((a, b) => a + b, 0),
      approved: contractors.approved || 0,
      // The status enum is onboarding | pending_approval | approved | rejected.
      // There is no `suspended` status — a suspended contractor is `approved`
      // with `isActive: false` — so it is counted separately rather than being
      // read off a status that does not exist.
      pendingApproval: contractors.pending_approval || 0,
      onboarding: contractors.onboarding || 0,
      rejected: contractors.rejected || 0,
      suspended: suspendedCount,
    },

    quotations: quotes,

    /** Residential and commercial site visits, from booking to an accepted quotation. */
    packages: {
      segments: packageStats.segments,
      totals: packageStats.totals,
      trend: buildTrend(packageStats.daily, days),
    },
    budget: extras.budget,
    materials: extras.materials,

    /** BRD A1 — "stages due". */
    stagesDueSoon: stagesDueSoon.map((s) => ({
      id: String(s._id),
      name: s.name,
      amount: round2(s.amount),
      targetDate: s.targetDate,
      status: s.status,
      projectNumber: s.projectId?.projectNumber || '',
      projectTitle: s.projectId?.title || '',
      projectId: s.projectId?._id ? String(s.projectId._id) : null,
    })),

    topContractors: topContractors.map((t) => ({
      contractorId: String(t._id),
      businessName: nameById.get(String(t._id))?.businessName || 'Unknown',
      contractorCode: nameById.get(String(t._id))?.contractorCode || '',
      rating: nameById.get(String(t._id))?.rating || 0,
      projects: t.projects,
      value: round2(t.value),
    })),
  };
};

/**
 * BRD A7 — payment control.
 *
 * "Oversight of all held money and all releases, with the power to block or
 * approve a release."
 *
 * The blocking power already exists in two forms — putting a project on hold
 * stops every release on it, and a dispute freezes one stage — so this is the
 * oversight half: every rupee currently held, every release that has happened,
 * and every stage sitting in the approval queue with money attached.
 */
export const getPaymentControl = async (query = {}) => {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

  const [held, awaitingApproval, recentReleases, frozen] = await Promise.all([
    ConstructionProject.find({
      ...alive,
      status: { $nin: ['cancelled', 'closed'] },
      $expr: {
        $gt: [{ $subtract: ['$fundedAmount', { $add: ['$releasedAmount', '$refundedAmount'] }] }, 0],
      },
    })
      .populate('customerId', 'name phone')
      .populate('contractorId', 'businessName contractorCode')
      .select('projectNumber title agreedValue fundedAmount releasedAmount refundedAmount status retentionPercent lastActivityAt')
      .sort({ lastActivityAt: -1 })
      .limit(limit)
      .lean(),

    ProjectStage.find({ status: 'submitted_for_approval' })
      .populate('projectId', 'projectNumber title customerId contractorId')
      .select('name amount submittedAt projectId sequence')
      .sort({ submittedAt: 1 })
      .limit(limit)
      .lean(),

    ProjectStage.find({ status: 'payment_released' })
      .populate('projectId', 'projectNumber title')
      .populate('contractorId', 'businessName')
      .select('name releasedAmount retainedAmount releasedAt approvedVia projectId contractorId')
      .sort({ releasedAt: -1 })
      .limit(limit)
      .lean(),

    ProjectDispute.find({ status: { $in: ['open', 'under_review'] }, frozenAmount: { $gt: 0 }, ...alive })
      .populate('projectId', 'projectNumber title')
      .select('disputeNumber frozenAmount status createdAt projectId stageId')
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const heldTotal = round2(held.reduce(
    (s, p) => s + (p.fundedAmount - p.releasedAmount - p.refundedAmount), 0,
  ));

  return {
    summary: {
      projectsHoldingMoney: held.length,
      totalHeld: heldTotal,
      stagesAwaitingApproval: awaitingApproval.length,
      valueAwaitingApproval: round2(awaitingApproval.reduce((s, x) => s + (x.amount || 0), 0)),
      disputesFreezing: frozen.length,
      valueFrozen: round2(frozen.reduce((s, d) => s + (d.frozenAmount || 0), 0)),
    },
    held: held.map((p) => ({
      ...p,
      heldAmount: round2(p.fundedAmount - p.releasedAmount - p.refundedAmount),
    })),
    awaitingApproval,
    recentReleases,
    frozen,
  };
};

export { round2 };
