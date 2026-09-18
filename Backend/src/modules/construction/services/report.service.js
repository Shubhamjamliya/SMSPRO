import { ValidationError } from '../../../core/auth/errors.js';
import { ConstructionEnquiry } from '../models/constructionEnquiry.model.js';
import { Quotation } from '../models/quotation.model.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectStage } from '../models/projectStage.model.js';
import { ProjectDispute } from '../models/projectDispute.model.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { ContractorScore } from '../models/contractorScore.model.js';

/**
 * BRD A9 — reports.
 *
 * "Enquiries, conversion rates, average project values, delays, contractor
 * performance and revenue — by city and by period. These numbers tell you which
 * services and which cities are actually worth investing in."
 *
 * That last sentence is the brief: every report here has to support a DECISION
 * about where to spend money. So the cuts are by city, by service and by month,
 * and each one carries the two numbers an investment decision needs — how much
 * demand there is, and how much of it converts.
 *
 * A note on commission: the platform's revenue is the commission on released
 * payments, not the contract value. Reporting contract value as revenue would
 * overstate the business by roughly twenty times, so `revenue` here means
 * commission earned and `grossValue` is kept separate and clearly named.
 */

const alive = { isDeleted: { $ne: true } };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

/** Reports are always bounded — an unbounded scan of a growing table is a trap. */
const parseRange = ({ from, to, days } = {}) => {
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(end.getTime())) throw new ValidationError('Invalid "to" date');

  let start;
  if (from) {
    start = new Date(from);
    if (Number.isNaN(start.getTime())) throw new ValidationError('Invalid "from" date');
  } else {
    start = new Date(end.getTime() - (Number(days) || 90) * 86400000);
  }
  if (start > end) throw new ValidationError('The start date is after the end date');

  return { start, end };
};

/**
 * BRD A9 — demand and conversion, cut by city.
 *
 * The headline question this answers: is a city producing enquiries that turn
 * into money, or just enquiries?
 */
export const getCityReport = async (query = {}) => {
  const { start, end } = parseRange(query);
  const window = { createdAt: { $gte: start, $lte: end } };

  const [enquiries, projects] = await Promise.all([
    ConstructionEnquiry.aggregate([
      { $match: { ...alive, ...window } },
      {
        $group: {
          _id: { $ifNull: ['$site.city', 'Not stated'] },
          enquiries: { $sum: 1 },
          converted: {
            $sum: { $cond: [{ $in: ['$status', ['converted', 'accepted']] }, 1, 0] },
          },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'closed_lost'] }, 1, 0] } },
        },
      },
    ]),
    ConstructionProject.aggregate([
      { $match: { ...alive, ...window } },
      {
        $lookup: {
          from: 'construction_enquiries',
          localField: 'enquiryId',
          foreignField: '_id',
          as: 'enquiry',
        },
      },
      { $unwind: { path: '$enquiry', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$enquiry.site.city', 'Not stated'] },
          projects: { $sum: 1 },
          grossValue: { $sum: '$agreedValue' },
          released: { $sum: '$releasedAmount' },
          commission: { $sum: '$commission.collectedAmount' },
          completed: {
            $sum: { $cond: [{ $in: ['$status', ['completed', 'closed']] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const byCity = new Map();
  for (const e of enquiries) {
    byCity.set(e._id, {
      city: e._id,
      enquiries: e.enquiries,
      converted: e.converted,
      lost: e.lost,
      projects: 0,
      grossValue: 0,
      released: 0,
      revenue: 0,
      completed: 0,
    });
  }
  for (const p of projects) {
    const row = byCity.get(p._id) || {
      city: p._id, enquiries: 0, converted: 0, lost: 0,
      projects: 0, grossValue: 0, released: 0, revenue: 0, completed: 0,
    };
    row.projects = p.projects;
    row.grossValue = round2(p.grossValue);
    row.released = round2(p.released);
    row.revenue = round2(p.commission);
    row.completed = p.completed;
    byCity.set(p._id, row);
  }

  const rows = [...byCity.values()].map((r) => ({
    ...r,
    conversionRate: r.enquiries > 0 ? round1((r.converted / r.enquiries) * 100) : 0,
    averageProjectValue: r.projects > 0 ? round2(r.grossValue / r.projects) : 0,
  })).sort((a, b) => b.grossValue - a.grossValue);

  return { from: start, to: end, rows };
};

/** BRD A9 — which services actually earn. */
export const getServiceReport = async (query = {}) => {
  const { start, end } = parseRange(query);

  const rows = await ConstructionEnquiry.aggregate([
    { $match: { ...alive, createdAt: { $gte: start, $lte: end } } },
    {
      $lookup: {
        from: 'construction_services',
        localField: 'serviceId',
        foreignField: '_id',
        as: 'service',
      },
    },
    { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ['$service.name', 'Unknown service'] },
        enquiries: { $sum: 1 },
        converted: {
          $sum: { $cond: [{ $in: ['$status', ['converted', 'accepted']] }, 1, 0] },
        },
      },
    },
    { $sort: { enquiries: -1 } },
  ]);

  // Project value has to come from the projects themselves, not the enquiry.
  const projectValues = await ConstructionProject.aggregate([
    { $match: { ...alive, createdAt: { $gte: start, $lte: end } } },
    {
      $lookup: {
        from: 'construction_services',
        localField: 'serviceId',
        foreignField: '_id',
        as: 'service',
      },
    },
    { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ['$service.name', 'Unknown service'] },
        projects: { $sum: 1 },
        grossValue: { $sum: '$agreedValue' },
        revenue: { $sum: '$commission.collectedAmount' },
      },
    },
  ]);
  const valueByService = new Map(projectValues.map((p) => [p._id, p]));

  return {
    from: start,
    to: end,
    rows: rows.map((r) => {
      const v = valueByService.get(r._id) || { projects: 0, grossValue: 0, revenue: 0 };
      return {
        service: r._id,
        enquiries: r.enquiries,
        converted: r.converted,
        conversionRate: r.enquiries > 0 ? round1((r.converted / r.enquiries) * 100) : 0,
        projects: v.projects,
        grossValue: round2(v.grossValue),
        revenue: round2(v.revenue),
        averageProjectValue: v.projects > 0 ? round2(v.grossValue / v.projects) : 0,
      };
    }),
  };
};

/** BRD A9 — the trend, month by month. */
export const getPeriodReport = async (query = {}) => {
  const { start, end } = parseRange({ days: 365, ...query });
  const bucket = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };

  const [enquiries, projects, releases] = await Promise.all([
    ConstructionEnquiry.aggregate([
      { $match: { ...alive, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: bucket, enquiries: { $sum: 1 },
        converted: { $sum: { $cond: [{ $in: ['$status', ['converted', 'accepted']] }, 1, 0] } } } },
    ]),
    ConstructionProject.aggregate([
      { $match: { ...alive, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: bucket, projects: { $sum: 1 },
        grossValue: { $sum: '$agreedValue' }, revenue: { $sum: '$commission.collectedAmount' } } },
    ]),
    // Released money is dated by when it moved, not when the project started.
    ProjectStage.aggregate([
      { $match: { status: 'payment_released', releasedAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$releasedAt' } },
          released: { $sum: '$releasedAmount' },
          payments: { $sum: 1 },
        },
      },
    ]),
  ]);

  const months = new Map();
  const touch = (key) => {
    if (!months.has(key)) {
      months.set(key, {
        month: key, enquiries: 0, converted: 0, projects: 0,
        grossValue: 0, revenue: 0, released: 0, payments: 0,
      });
    }
    return months.get(key);
  };

  enquiries.forEach((r) => Object.assign(touch(r._id), {
    enquiries: r.enquiries, converted: r.converted,
  }));
  projects.forEach((r) => Object.assign(touch(r._id), {
    projects: r.projects, grossValue: round2(r.grossValue), revenue: round2(r.revenue),
  }));
  releases.forEach((r) => Object.assign(touch(r._id), {
    released: round2(r.released), payments: r.payments,
  }));

  return {
    from: start,
    to: end,
    rows: [...months.values()]
      .map((m) => ({
        ...m,
        conversionRate: m.enquiries > 0 ? round1((m.converted / m.enquiries) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
};

/**
 * BRD A9 — contractor performance.
 *
 * The trust score already computes most of this nightly, so this joins it with
 * live project figures rather than recalculating and risking two different
 * answers to the same question.
 */
export const getContractorReport = async (query = {}) => {
  const { start, end } = parseRange(query);

  const [projectAgg, disputeAgg, contractors, scores] = await Promise.all([
    ConstructionProject.aggregate([
      { $match: { ...alive, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$contractorId',
          projects: { $sum: 1 },
          grossValue: { $sum: '$agreedValue' },
          released: { $sum: '$releasedAmount' },
          revenue: { $sum: '$commission.collectedAmount' },
          completed: { $sum: { $cond: [{ $in: ['$status', ['completed', 'closed']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        },
      },
    ]),
    ProjectDispute.aggregate([
      { $match: { ...alive, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$contractorId',
          disputes: { $sum: 1 },
          upheld: {
            $sum: {
              $cond: [{ $in: ['$outcome', ['refunded_to_customer', 'split']] }, 1, 0],
            },
          },
        },
      },
    ]),
    ContractorProfile.find({ ...alive })
      .select('businessName contractorCode rating totalRatings status serviceAreas').lean(),
    ContractorScore.find({}).select('contractorId score band isProvisional').lean(),
  ]);

  const projectsById = new Map(projectAgg.map((p) => [String(p._id), p]));
  const disputesById = new Map(disputeAgg.map((d) => [String(d._id), d]));
  const scoreById = new Map(scores.map((s) => [String(s.contractorId), s]));

  const rows = contractors.map((c) => {
    const id = String(c._id);
    const p = projectsById.get(id) || {
      projects: 0, grossValue: 0, released: 0, revenue: 0, completed: 0, cancelled: 0,
    };
    const d = disputesById.get(id) || { disputes: 0, upheld: 0 };
    const s = scoreById.get(id);

    return {
      contractorId: id,
      businessName: c.businessName,
      contractorCode: c.contractorCode || '',
      status: c.status,
      cities: c.serviceAreas || [],
      rating: round1(c.rating),
      totalRatings: c.totalRatings || 0,
      trustScore: s?.isProvisional ? null : (s?.score ?? null),
      band: s?.band || 'new',
      projects: p.projects,
      completed: p.completed,
      cancelled: p.cancelled,
      grossValue: round2(p.grossValue),
      released: round2(p.released),
      revenue: round2(p.revenue),
      disputes: d.disputes,
      disputesUpheld: d.upheld,
    };
  })
    // Contractors with no activity in the window are noise in a performance report.
    .filter((r) => r.projects > 0 || r.disputes > 0)
    .sort((a, b) => b.grossValue - a.grossValue);

  return { from: start, to: end, rows };
};

/**
 * BRD A9 — delays.
 *
 * Measured against each stage's target date, which is what both sides actually
 * agreed to, rather than against the project's overall completion date.
 */
export const getDelayReport = async (query = {}) => {
  const { start, end } = parseRange(query);
  const now = new Date();

  const stages = await ProjectStage.find({
    createdAt: { $gte: start, $lte: end },
    targetDate: { $ne: null },
  })
    .populate('projectId', 'projectNumber title status')
    .populate('contractorId', 'businessName contractorCode')
    .select('name amount targetDate status releasedAt approvedAt submittedAt projectId contractorId sequence')
    .lean();

  const rows = stages.map((s) => {
    const done = ['approved', 'payment_released'].includes(s.status);
    const finishedAt = s.releasedAt || s.approvedAt || null;
    const reference = done && finishedAt ? new Date(finishedAt) : now;
    const target = new Date(s.targetDate);
    const daysLate = Math.round((reference - target) / 86400000);

    return {
      stageId: String(s._id),
      projectNumber: s.projectId?.projectNumber || '',
      projectId: s.projectId?._id ? String(s.projectId._id) : null,
      contractor: s.contractorId?.businessName || '',
      contractorId: s.contractorId?._id ? String(s.contractorId._id) : null,
      stage: s.name,
      sequence: s.sequence,
      amount: round2(s.amount),
      targetDate: s.targetDate,
      status: s.status,
      finished: done,
      daysLate: daysLate > 0 ? daysLate : 0,
      isLate: daysLate > 0,
    };
  });

  const late = rows.filter((r) => r.isLate);
  const byContractor = new Map();
  for (const r of late) {
    if (!r.contractorId) continue;
    const cur = byContractor.get(r.contractorId)
      || { contractorId: r.contractorId, contractor: r.contractor, lateStages: 0, totalDaysLate: 0 };
    cur.lateStages += 1;
    cur.totalDaysLate += r.daysLate;
    byContractor.set(r.contractorId, cur);
  }

  return {
    from: start,
    to: end,
    summary: {
      stagesWithTarget: rows.length,
      lateStages: late.length,
      onTimeRate: rows.length > 0
        ? round1(((rows.length - late.length) / rows.length) * 100)
        : 100,
      averageDaysLate: late.length > 0
        ? round1(late.reduce((s, r) => s + r.daysLate, 0) / late.length)
        : 0,
      valueDelayed: round2(late.filter((r) => !r.finished).reduce((s, r) => s + r.amount, 0)),
    },
    worstContractors: [...byContractor.values()]
      .map((c) => ({ ...c, averageDaysLate: round1(c.totalDaysLate / c.lateStages) }))
      .sort((a, b) => b.lateStages - a.lateStages)
      .slice(0, 10),
    rows: late.sort((a, b) => b.daysLate - a.daysLate).slice(0, 200),
  };
};

export { parseRange };
