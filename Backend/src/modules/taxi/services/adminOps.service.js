import { Driver } from '../../../core/models/driver.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { TaxiRide } from '../models/taxiRide.model.js';
import { TaxiVehicleType } from '../models/taxiVehicleType.model.js';
import { TaxiZone } from '../models/taxiZone.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { parseListQuery, buildDateRangeFilter, toTaxiPagination, escapeRegex } from '../utils/pagination.util.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import mongoose from 'mongoose';

const baseDriverFilter = {
  isDeleted: { $ne: true },
  authorizedServices: 'taxi',
};

const mapDriver = (doc = {}) => ({
  id: String(doc._id),
  name: doc.name || '',
  phone: doc.phone || '',
  email: doc.email || '',
  photo: doc.profileImage || doc.photo || '',
  status: doc.status || 'pending',
  isActive: doc.isActive !== false,
  onlineStatus: doc.availabilityStatus || 'offline',
  activeWorkModule: doc.activeWorkModule || null,
  vehicleNumber: doc.vehicleNumber || '',
  vehicleType: doc.vehicleType || doc.vehicleModel || '',
  vehicleModel: doc.vehicleModel || '',
  rating: Number(doc.rating || 0),
  totalRatings: Number(doc.totalRatings || 0),
  authorizedServices: doc.authorizedServices || [],
  lastLat: doc.lastLat ?? null,
  lastLng: doc.lastLng ?? null,
  lastLocationAt: doc.lastLocationAt || null,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const mapCustomer = (doc = {}, rideStats = {}) => ({
  id: String(doc._id),
  name: doc.name || '',
  email: doc.email || '',
  phone: doc.phone || '',
  countryCode: doc.countryCode || '+91',
  photo: doc.profileImage || '',
  walletBalance: Number(doc.walletBalance || 0),
  isActive: doc.isActive !== false,
  isVerified: Boolean(doc.isVerified),
  totalRides: Number(rideStats.total || 0),
  completedRides: Number(rideStats.completed || 0),
  createdAt: doc.createdAt,
});

export async function listTaxiDrivers(query = {}) {
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
    ];
  }

  const [docs, total] = await Promise.all([
    Driver.find(filter)
      .sort({ createdAt: -1 })
      .skip(parsed.skip)
      .limit(parsed.limit)
      .select(
        'name phone email profileImage photo status isActive availabilityStatus activeWorkModule vehicleNumber vehicleType vehicleModel rating totalRatings authorizedServices lastLat lastLng lastLocationAt createdAt updatedAt',
      )
      .lean(),
    Driver.countDocuments(filter),
  ]);

  return toTaxiPagination({
    docs: docs.map(mapDriver),
    total,
    page: parsed.page,
    limit: parsed.limit,
  });
}

export async function getTaxiDriverById(id) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new ValidationError('Invalid driver id');
  }
  const doc = await Driver.findOne({ _id: id, ...baseDriverFilter }).lean();
  if (!doc) throw new NotFoundError('Taxi driver not found');
  return mapDriver(doc);
}

export async function patchTaxiDriverStatus(id, body = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw new ValidationError('Invalid driver id');
  }
  const status = String(body.status || '').trim();
  const allowed = ['approved', 'pending', 'rejected', 'documents_required', 'suspended'];
  // Map UI "active"/"suspended" onto driver fields
  const doc = await Driver.findOne({ _id: id, ...baseDriverFilter });
  if (!doc) throw new NotFoundError('Taxi driver not found');

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

export async function listTaxiCustomers(query = {}) {
  validateListQuery(query);
  const parsed = parseListQuery(query);

  // Prefer customers who have taxi rides; fall back to empty if none
  const riderIds = await TaxiRide.distinct('userId', { isDeleted: { $ne: true } });
  const filter = {
    role: 'USER',
    isDeleted: { $ne: true },
  };
  if (riderIds.length) {
    filter._id = { $in: riderIds };
  } else {
    // No taxi riders yet — return empty rather than dumping all platform users
    return toTaxiPagination({ docs: [], total: 0, page: parsed.page, limit: parsed.limit });
  }

  if (parsed.status === 'active') filter.isActive = true;
  if (parsed.status === 'inactive') filter.isActive = false;

  if (parsed.search) {
    const term = escapeRegex(parsed.search);
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
    ];
  }

  const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
  if (dateRange) filter.createdAt = dateRange;

  const [docs, total] = await Promise.all([
    FoodUser.find(filter)
      .sort({ createdAt: -1 })
      .skip(parsed.skip)
      .limit(parsed.limit)
      .select('name email phone countryCode profileImage walletBalance isVerified isActive createdAt')
      .lean(),
    FoodUser.countDocuments(filter),
  ]);

  const stats = await TaxiRide.aggregate([
    { $match: { userId: { $in: docs.map((d) => d._id) }, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: '$userId',
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
      },
    },
  ]);
  const statsMap = Object.fromEntries(stats.map((s) => [String(s._id), s]));

  return toTaxiPagination({
    docs: docs.map((d) => mapCustomer(d, statsMap[String(d._id)])),
    total,
    page: parsed.page,
    limit: parsed.limit,
  });
}

/** Fleet view: taxi drivers with vehicle fields */
export async function listTaxiFleet(query = {}) {
  const data = await listTaxiDrivers(query);
  data.records = (data.records || []).map((d) => ({
    id: d.id,
    driverId: d.id,
    driverName: d.name,
    driverPhone: d.phone,
    vehicleNumber: d.vehicleNumber || '—',
    vehicleType: d.vehicleType || d.vehicleModel || '—',
    status: d.isActive && d.status === 'approved' ? 'active' : 'inactive',
    onlineStatus: d.onlineStatus,
    rating: d.rating,
  }));
  return data;
}

export async function getTaxiDashboardStats() {
  const activeRideStatuses = ['assigned', 'arriving', 'arrived', 'in_progress'];
  const pendingStatuses = ['requested', 'searching'];
  const cancelledStatuses = [
    'cancelled_by_rider',
    'cancelled_by_driver',
    'cancelled_by_system',
    'no_show',
  ];

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalDrivers,
    onlineDrivers,
    activeRides,
    pendingRequests,
    completedToday,
    cancelledToday,
    revenueAgg,
    recentRides,
    vehicleTypes,
    zones,
  ] = await Promise.all([
    Driver.countDocuments(baseDriverFilter),
    Driver.countDocuments({ ...baseDriverFilter, availabilityStatus: 'online' }),
    TaxiRide.countDocuments({ isDeleted: { $ne: true }, status: { $in: activeRideStatuses } }),
    TaxiRide.countDocuments({ isDeleted: { $ne: true }, status: { $in: pendingStatuses } }),
    TaxiRide.countDocuments({
      isDeleted: { $ne: true },
      status: 'completed',
      completedAt: { $gte: startOfDay },
    }),
    TaxiRide.countDocuments({
      isDeleted: { $ne: true },
      status: { $in: cancelledStatuses },
      cancelledAt: { $gte: startOfDay },
    }),
    TaxiRide.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          status: 'completed',
          completedAt: { $gte: startOfDay },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$fare.total', '$fareEstimateTotal'] } },
        },
      },
    ]),
    TaxiRide.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('rideNumber status pickup drop fareEstimateTotal fare createdAt dispatch')
      .lean(),
    TaxiVehicleType.countDocuments({ isDeleted: { $ne: true } }),
    TaxiZone.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
  ]);

  return {
    kpis: {
      totalDrivers,
      onlineDrivers,
      activeRides,
      pendingRequests,
      completedToday,
      cancelledToday,
      revenueToday: Number(revenueAgg?.[0]?.total || 0),
      vehicleTypes,
      activeZones: zones,
    },
    recentRides: recentRides.map((r) => ({
      id: String(r._id),
      rideNumber: r.rideNumber,
      status: r.status,
      pickup: r.pickup?.address || '',
      drop: r.drop?.address || '',
      fare: Number(r.fare?.total ?? r.fareEstimateTotal ?? 0),
      createdAt: r.createdAt,
    })),
  };
}
