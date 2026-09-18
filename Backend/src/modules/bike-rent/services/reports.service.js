import { BikeBooking } from '../models/bikeBooking.model.js';
import { BikeUnit } from '../models/bikeUnit.model.js';
import { BikeRentZone } from '../models/bikeRentZone.model.js';
import { BikeDepositLedger } from '../models/bikeDepositLedger.model.js';

const notDeleted = { isDeleted: { $ne: true } };

export async function getReportsSummary(query = {}, vendorScope = null) {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const createdAt = {};
    if (from && !Number.isNaN(from.getTime())) createdAt.$gte = from;
    if (to && !Number.isNaN(to.getTime())) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        createdAt.$lte = end;
    }
    const dateMatch = Object.keys(createdAt).length ? { createdAt } : {};
    const ownerMatch = vendorScope ? { ownerType: 'vendor', vendorId: vendorScope } : {};
    const bookingMatch = { ...notDeleted, ...dateMatch, ...ownerMatch };
    const bikeMatch = vendorScope ? { ...notDeleted, ...ownerMatch } : notDeleted;

    // Deposit ledger entries carry no vendor field — scope via the vendor's own booking ids.
    const ledgerMatch = vendorScope
        ? { bookingId: { $in: await BikeBooking.distinct('_id', bookingMatch) } }
        : dateMatch;

    const [
        byStatus,
        revenueByDay,
        lateDamage,
        zoneUtil,
        bikeUtil,
        bySource,
        durationStats,
        ledgerTotals,
        topBikes,
    ] = await Promise.all([
        BikeBooking.aggregate([
            { $match: bookingMatch },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    revenue: { $sum: { $ifNull: ['$money.totalPaid', 0] } },
                    rentalFee: { $sum: { $ifNull: ['$money.rentalFee', 0] } },
                },
            },
            { $sort: { count: -1 } },
        ]),
        BikeBooking.aggregate([
            { $match: bookingMatch },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    bookings: { $sum: 1 },
                    revenue: { $sum: { $ifNull: ['$money.totalPaid', 0] } },
                    depositsHeld: { $sum: { $ifNull: ['$money.depositHeld', 0] } },
                    depositsRefunded: { $sum: { $ifNull: ['$money.depositRefunded', 0] } },
                },
            },
            { $sort: { _id: 1 } },
            { $limit: 90 },
        ]),
        BikeBooking.aggregate([
            { $match: bookingMatch },
            {
                $group: {
                    _id: null,
                    lateFees: { $sum: { $ifNull: ['$money.lateFee', 0] } },
                    damageFees: { $sum: { $ifNull: ['$money.damageFee', 0] } },
                    depositsHeld: { $sum: { $ifNull: ['$money.depositHeld', 0] } },
                    depositsCaptured: { $sum: { $ifNull: ['$money.depositCaptured', 0] } },
                    depositsRefunded: { $sum: { $ifNull: ['$money.depositRefunded', 0] } },
                    cancelFees: { $sum: { $ifNull: ['$money.cancelFee', 0] } },
                    extensionFees: { $sum: { $ifNull: ['$money.extensionFee', 0] } },
                    totalRevenue: { $sum: { $ifNull: ['$money.totalPaid', 0] } },
                    avgDurationHours: { $avg: { $ifNull: ['$rentalDurationHours', 0] } },
                },
            },
        ]),
        BikeBooking.aggregate([
            { $match: bookingMatch },
            {
                $group: {
                    _id: '$zoneId',
                    bookings: { $sum: 1 },
                    revenue: { $sum: { $ifNull: ['$money.totalPaid', 0] } },
                    customers: { $addToSet: '$userId' },
                },
            },
            { $sort: { bookings: -1 } },
            { $limit: 20 },
        ]),
        BikeUnit.aggregate([
            { $match: bikeMatch },
            {
                $group: {
                    _id: '$availabilityStatus',
                    count: { $sum: 1 },
                },
            },
        ]),
        BikeBooking.aggregate([
            { $match: bookingMatch },
            {
                $group: {
                    _id: { $ifNull: ['$bookingSource', 'unknown'] },
                    bookings: { $sum: 1 },
                    revenue: { $sum: { $ifNull: ['$money.totalPaid', 0] } },
                },
            },
        ]),
        BikeBooking.aggregate([
            { $match: { ...bookingMatch, rentalDurationHours: { $gt: 0 } } },
            {
                $group: {
                    _id: null,
                    avgHours: { $avg: '$rentalDurationHours' },
                    maxHours: { $max: '$rentalDurationHours' },
                    minHours: { $min: '$rentalDurationHours' },
                },
            },
        ]),
        BikeDepositLedger.aggregate([
            ...(Object.keys(ledgerMatch).length
                ? [{ $match: ledgerMatch }]
                : []),
            {
                $group: {
                    _id: '$type',
                    amount: { $sum: '$amount' },
                    count: { $sum: 1 },
                },
            },
        ]),
        BikeBooking.aggregate([
            { $match: bookingMatch },
            {
                $group: {
                    _id: '$bikeId',
                    bookings: { $sum: 1 },
                    revenue: { $sum: { $ifNull: ['$money.totalPaid', 0] } },
                },
            },
            { $sort: { revenue: -1 } },
            { $limit: 10 },
        ]),
    ]);

    const zoneIds = zoneUtil.map((z) => z._id).filter(Boolean);
    const bikeIds = topBikes.map((b) => b._id).filter(Boolean);
    const [zones, bikes] = await Promise.all([
        BikeRentZone.find({ _id: { $in: zoneIds } }).select('name').lean(),
        BikeUnit.find({ _id: { $in: bikeIds } }).select('name registrationNumber').lean(),
    ]);
    const zoneNameMap = new Map(zones.map((z) => [String(z._id), z.name]));
    const bikeNameMap = new Map(bikes.map((b) => [String(b._id), b.name || b.registrationNumber]));

    const feesRow = lateDamage[0] || {};
    return {
        byStatus: byStatus.map((row) => ({
            status: row._id,
            count: row.count,
            revenue: Number(row.revenue || 0),
            rentalFee: Number(row.rentalFee || 0),
        })),
        revenueByDay: revenueByDay.map((row) => ({
            date: row._id,
            bookings: row.bookings,
            revenue: Number(row.revenue || 0),
            depositsHeld: Number(row.depositsHeld || 0),
            depositsRefunded: Number(row.depositsRefunded || 0),
        })),
        fees: {
            lateFees: Number(feesRow.lateFees || 0),
            damageFees: Number(feesRow.damageFees || 0),
            depositsHeld: Number(feesRow.depositsHeld || 0),
            depositsCaptured: Number(feesRow.depositsCaptured || 0),
            depositsRefunded: Number(feesRow.depositsRefunded || 0),
            cancelFees: Number(feesRow.cancelFees || 0),
            extensionFees: Number(feesRow.extensionFees || 0),
            totalRevenue: Number(feesRow.totalRevenue || 0),
        },
        duration: {
            avgHours: Number(durationStats[0]?.avgHours || feesRow.avgDurationHours || 0),
            maxHours: Number(durationStats[0]?.maxHours || 0),
            minHours: Number(durationStats[0]?.minHours || 0),
        },
        bySource: bySource.map((row) => ({
            source: row._id,
            bookings: row.bookings,
            revenue: Number(row.revenue || 0),
        })),
        depositLedger: ledgerTotals.map((row) => ({
            type: row._id,
            amount: Number(row.amount || 0),
            count: row.count,
        })),
        zoneUtilization: zoneUtil.map((row) => ({
            zoneId: row._id ? String(row._id) : null,
            zoneName: row._id ? (zoneNameMap.get(String(row._id)) || 'Unknown') : 'Unknown',
            bookings: row.bookings,
            revenue: Number(row.revenue || 0),
            uniqueCustomers: Array.isArray(row.customers) ? row.customers.length : 0,
        })),
        topBikes: topBikes.map((row) => ({
            bikeId: row._id ? String(row._id) : null,
            bikeName: row._id ? (bikeNameMap.get(String(row._id)) || 'Unknown') : 'Unknown',
            bookings: row.bookings,
            revenue: Number(row.revenue || 0),
        })),
        bikeAvailability: bikeUtil.map((row) => ({
            status: row._id,
            count: row.count,
        })),
    };
}
