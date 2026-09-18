/**
 * QC-admin only: list drivers authorized for quick-commerce.
 * Does not mutate food/taxi/porter enrollment APIs.
 */
import mongoose from 'mongoose';
import { Driver } from '../../../../core/models/driver.model.js';

const QC_MODULE = 'quick-commerce';

const baseFilter = {
  isDeleted: { $ne: true },
  authorizedServices: QC_MODULE,
};

const mapDriver = (doc = {}) => {
  const enrollment = doc.registeredServices?.[QC_MODULE] || {};
  return {
    id: String(doc._id),
    _id: doc._id,
    name: doc.name || '',
    phone: doc.phone || '',
    email: doc.email || '',
    photo: doc.profilePhoto || doc.profileImage || doc.photo || '',
    status: doc.status || 'pending',
    isActive: doc.isActive !== false,
    onlineStatus: doc.availabilityStatus || 'offline',
    activeWorkModule: doc.activeWorkModule || null,
    vehicleNumber: doc.vehicleNumber || enrollment.vehicleNumber || '',
    vehicleType: doc.vehicleType || enrollment.vehicleType || doc.vehicleModel || '',
    vehicleModel: doc.vehicleModel || '',
    rating: Number(doc.rating || 0),
    totalRatings: Number(doc.totalRatings || 0),
    authorizedServices: Array.isArray(doc.authorizedServices) ? doc.authorizedServices : [],
    qcEnrollmentStatus: enrollment.status || 'approved',
    approvedAt: enrollment.approvedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

export const listQcDrivers = async ({
  page = 1,
  limit = 50,
  search = '',
  onlineStatus = '',
} = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (safePage - 1) * safeLimit;

  const filter = { ...baseFilter };

  if (onlineStatus === 'online' || onlineStatus === 'offline') {
    filter.availabilityStatus = onlineStatus;
  }

  const q = String(search || '').trim();
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { vehicleNumber: { $regex: q, $options: 'i' } },
    ];
  }

  const [total, rows] = await Promise.all([
    Driver.countDocuments(filter),
    Driver.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select(
        'name phone email profilePhoto profileImage photo status isActive availabilityStatus activeWorkModule vehicleNumber vehicleType vehicleModel rating totalRatings authorizedServices registeredServices createdAt updatedAt',
      )
      .lean(),
  ]);

  return {
    items: rows.map(mapDriver),
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
};

export const getQcDriverById = async (driverId) => {
  if (!mongoose.Types.ObjectId.isValid(String(driverId))) {
    return null;
  }
  const doc = await Driver.findOne({
    _id: driverId,
    ...baseFilter,
  })
    .select(
      'name phone email profilePhoto profileImage photo status isActive availabilityStatus activeWorkModule vehicleNumber vehicleType vehicleModel vehicleName vehicleBrand rating totalRatings authorizedServices registeredServices lastLat lastLng lastLocationAt createdAt updatedAt',
    )
    .lean();

  return doc ? mapDriver(doc) : null;
};
