import mongoose from 'mongoose';
import { Driver } from '../../../core/models/driver.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { parseListQuery, toPorterPagination, escapeRegex } from '../utils/pagination.util.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { PorterTrip } from '../models/porterTrip.model.js';
import { PorterZone } from '../models/porterZone.model.js';
import { countActivePorterVehicles } from './vehicle.service.js';

const PORTER_MODULE_KEYS = ['porter', 'parcel'];

const tripBaseFilter = { isDeleted: { $ne: true } };

const ACTIVE_STATUSES = ['searching', 'assigned', 'en_route_pickup', 'at_pickup', 'in_transit', 'at_drop'];
const PENDING_STATUSES = ['searching', 'quoted'];
const CANCELLED_STATUSES = ['cancelled_by_user', 'cancelled_by_driver', 'cancelled_by_system'];

const getDateRangeByPeriod = (periodRaw) => {
  const period = String(periodRaw || 'today').trim().toLowerCase();
  if (!period || period === 'all' || period === 'overall') return null;

  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'week') {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start: monthStart, end: monthEnd };
  }

  if (period === 'year') {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start: yearStart, end: yearEnd };
  }

  return null;
};

const parseDashboardDateRange = (query = {}) => {
  const period = String(query.period || 'today').trim().toLowerCase();

  if (period === 'custom') {
    const from = query.createdFrom ? new Date(query.createdFrom) : null;
    const to = query.createdTo ? new Date(query.createdTo) : null;
    if (!from || Number.isNaN(from.getTime())) {
      throw new ValidationError('createdFrom is required for custom date range');
    }
    from.setHours(0, 0, 0, 0);
    const range = { start: from };
    if (to && !Number.isNaN(to.getTime())) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      range.end = end;
    }
    return range;
  }

  return getDateRangeByPeriod(period);
};

const buildTripDateFilter = (periodRange) => {
  if (!periodRange) return {};
  const createdAt = { $gte: periodRange.start };
  if (periodRange.end) createdAt.$lte = periodRange.end;
  return { createdAt };
};

const baseDriverFilter = {
  isDeleted: { $ne: true },
  authorizedServices: { $in: PORTER_MODULE_KEYS },
};

const mapDriver = (doc = {}) => {
  const enrollment =
    doc.registeredServices?.porter
    || doc.registeredServices?.parcel
    || {};

  return {
    id: String(doc._id),
    name: doc.name || '',
    phone: doc.phone || '',
    email: doc.email || '',
    photo: doc.profileImage || doc.photo || '',
    status: doc.status || 'pending',
    isActive: doc.isActive !== false,
    onlineStatus: doc.availabilityStatus || 'offline',
    activeWorkModule: doc.activeWorkModule || null,
    vehicleNumber:
      enrollment.vehicleNumber
      || doc.vehicleNumber
      || '',
    vehicleType:
      enrollment.vehicleName
      || doc.vehicleName
      || doc.vehicleType
      || doc.vehicleModel
      || '',
    vehicleModel: doc.vehicleModel || enrollment.vehicleModel || '',
    vehicleConfigurationId: enrollment.vehicleConfigurationId
      ? String(enrollment.vehicleConfigurationId)
      : doc.vehicleConfigurationId
        ? String(doc.vehicleConfigurationId)
        : null,
    rating: Number(doc.rating || 0),
    totalRatings: Number(doc.totalRatings || 0),
    authorizedServices: doc.authorizedServices || [],
    lastLat: doc.lastLat ?? null,
    lastLng: doc.lastLng ?? null,
    lastLocationAt: doc.lastLocationAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

export async function listPorterDrivers(query = {}) {
  validateListQuery(query);
  const parsed = parseListQuery(query);
  const filter = { ...baseDriverFilter };

  if (parsed.status && parsed.status !== 'all') {
    filter.status = parsed.status;
  }
  if (query.onlineStatus === 'online' || query.online === 'online') {
    filter.availabilityStatus = 'online';
  }
  if (query.onlineStatus === 'offline' || query.online === 'offline') {
    filter.availabilityStatus = 'offline';
  }

  if (parsed.search) {
    const term = escapeRegex(parsed.search);
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { vehicleNumber: { $regex: term, $options: 'i' } },
      { 'registeredServices.porter.vehicleNumber': { $regex: term, $options: 'i' } },
    ];
  }

  const [docs, total] = await Promise.all([
    Driver.find(filter)
      .sort({ createdAt: -1 })
      .skip(parsed.skip)
      .limit(parsed.limit)
      .select(
        'name phone email profileImage photo status isActive availabilityStatus activeWorkModule vehicleNumber vehicleName vehicleType vehicleModel vehicleConfigurationId rating totalRatings authorizedServices registeredServices.porter registeredServices.parcel lastLat lastLng lastLocationAt createdAt updatedAt',
      )
      .lean(),
    Driver.countDocuments(filter),
  ]);

  return toPorterPagination({
    docs: docs.map(mapDriver),
    total,
    page: parsed.page,
    limit: parsed.limit,
  });
}

export async function getPorterDriverById(id) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new ValidationError('Invalid driver id');
  }
  const doc = await Driver.findOne({ _id: id, ...baseDriverFilter }).lean();
  if (!doc) throw new NotFoundError('Porter driver not found');
  return mapDriver(doc);
}

export async function patchPorterDriverStatus(id, body = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new ValidationError('Invalid driver id');
  }
  const status = String(body.status || '').trim();
  const allowed = ['approved', 'pending', 'rejected', 'documents_required', 'suspended'];
  const doc = await Driver.findOne({ _id: id, ...baseDriverFilter });
  if (!doc) throw new NotFoundError('Porter driver not found');

  if (status === 'active' || status === 'approved') {
    doc.status = 'approved';
    doc.isActive = true;
  } else if (status === 'suspended' || status === 'inactive') {
    doc.isActive = false;
    doc.availabilityStatus = 'offline';
  } else if (allowed.includes(status)) {
    doc.status = status;
  } else {
    throw new ValidationError('Invalid status');
  }

  await doc.save();
  return mapDriver(doc.toObject());
}

export async function getPorterDashboardStats(query = {}) {
  const period = String(query.period || 'today').trim().toLowerCase();
  const periodRange = parseDashboardDateRange(query);
  const tripFilter = {
    ...tripBaseFilter,
    ...buildTripDateFilter(periodRange),
  };

  const completedFilter = { ...tripFilter, status: 'completed' };

  const [
    activeVehicles,
    activeZones,
    completed,
    cancelled,
    inTransit,
    pending,
    revenueAgg,
    recentTrips,
  ] = await Promise.all([
    countActivePorterVehicles(),
    PorterZone.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
    PorterTrip.countDocuments(completedFilter),
    PorterTrip.countDocuments({ ...tripFilter, status: { $in: CANCELLED_STATUSES } }),
    PorterTrip.countDocuments({ ...tripFilter, status: { $in: ACTIVE_STATUSES } }),
    PorterTrip.countDocuments({ ...tripFilter, status: { $in: PENDING_STATUSES } }),
    PorterTrip.aggregate([
      { $match: completedFilter },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$fare.total', '$fareEstimateTotal'] } },
        },
      },
    ]),
    PorterTrip.find(tripFilter)
      .sort({ createdAt: -1 })
      .limit(10)
      .select('tripNumber status pickup drop fare fareEstimateTotal createdAt')
      .lean(),
  ]);

  return {
    period,
    range: periodRange
      ? {
          from: periodRange.start,
          to: periodRange.end || null,
        }
      : null,
    kpis: {
      totalOrders: completed,
      activeVehicles,
      activeZones,
      revenue: Number(revenueAgg?.[0]?.total || 0),
      inTransit,
      completed,
      pending,
      cancelled,
    },
    recentTrips: recentTrips.map((trip) => ({
      id: trip.tripNumber || String(trip._id),
      tripNumber: trip.tripNumber || '',
      pickup: trip.pickup?.address || '',
      drop: trip.drop?.address || '',
      amount: Number(trip.fare?.total ?? trip.fareEstimateTotal ?? 0),
      status: trip.status,
      createdAt: trip.createdAt,
    })),
  };
}
