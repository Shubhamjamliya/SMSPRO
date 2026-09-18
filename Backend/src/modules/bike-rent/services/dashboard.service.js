import { BikeRentZone } from '../models/bikeRentZone.model.js';
import { BikeCategory } from '../models/bikeCategory.model.js';
import { BikeUnit } from '../models/bikeUnit.model.js';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { BIKE_BOOKING_STATUS } from '../state/bookingStateMachine.js';

const notDeleted = { isDeleted: { $ne: true } };

export async function getDashboardStats(vendorScope = null) {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const bikeFilter = vendorScope
        ? { ...notDeleted, ownerType: 'vendor', vendorId: vendorScope }
        : notDeleted;
    const bookingFilter = vendorScope
        ? { ...notDeleted, ownerType: 'vendor', vendorId: vendorScope }
        : notDeleted;

    const [
        zonesActive,
        zonesTotal,
        categoriesActive,
        bikesTotal,
        bikesAvailable,
        bikesMaintenance,
        bikesRented,
        bikesReserved,
        bookingsTotal,
        bookingsActive,
        bookingsCompleted,
        activeRentals,
        upcomingPickups,
        upcomingReturns,
        lateReturns,
        extensionRequests,
        pendingDeposits,
        pendingRefunds,
        revenueAgg,
    ] = await Promise.all([
        BikeRentZone.countDocuments({ ...notDeleted, status: 'active' }),
        BikeRentZone.countDocuments(notDeleted),
        BikeCategory.countDocuments({ ...notDeleted, status: 'active' }),
        BikeUnit.countDocuments(bikeFilter),
        BikeUnit.countDocuments({
            ...bikeFilter,
            isActive: true,
            availabilityStatus: 'available',
            maintenanceStatus: 'none',
        }),
        BikeUnit.countDocuments({ ...bikeFilter, maintenanceStatus: 'maintenance' }),
        BikeUnit.countDocuments({
            ...bikeFilter,
            availabilityStatus: 'rented',
        }),
        BikeUnit.countDocuments({
            ...bikeFilter,
            availabilityStatus: 'reserved',
        }),
        BikeBooking.countDocuments(bookingFilter),
        BikeBooking.countDocuments({
            ...bookingFilter,
            status: {
                $in: [
                    'reserved',
                    'pickup_completed',
                    'rental_started',
                    'active',
                    'return_requested',
                    'inspection',
                ],
            },
        }),
        BikeBooking.countDocuments({
            ...bookingFilter,
            status: { $in: ['completed', 'deposit_refunded'] },
        }),
        BikeBooking.countDocuments({
            ...bookingFilter,
            status: { $in: ['active', 'rental_started', 'pickup_completed'] },
        }),
        BikeBooking.countDocuments({
            ...bookingFilter,
            status: 'reserved',
            startAt: { $gte: now, $lte: in24h },
        }),
        BikeBooking.countDocuments({
            ...bookingFilter,
            status: { $in: ['active', 'rental_started', 'pickup_completed'] },
            endAt: { $gte: now, $lte: in24h },
        }),
        BikeBooking.countDocuments({
            ...bookingFilter,
            status: { $in: ['active', 'rental_started', 'pickup_completed', 'return_requested'] },
            endAt: { $lt: now },
        }),
        BikeBooking.countDocuments({
            ...bookingFilter,
            'pendingExtension.status': 'requested',
        }),
        BikeBooking.countDocuments({
            ...bookingFilter,
            status: { $in: ['reserved', 'payment_pending', BIKE_BOOKING_STATUS.RESERVED] },
            $or: [
                { 'securityDepositPayment.status': { $in: ['pending', 'pending_collection'] } },
                { 'money.depositHeld': { $lte: 0 }, 'money.securityDeposit': { $gt: 0 } },
            ],
        }),
        BikeBooking.countDocuments({
            ...bookingFilter,
            status: { $in: ['completed', 'refund_processing'] },
            'depositRefund.status': 'processing',
        }),
        BikeBooking.aggregate([
            { $match: { ...bookingFilter, status: { $in: ['completed', 'deposit_refunded', 'active', 'reserved'] } } },
            {
                $group: {
                    _id: null,
                    revenue: { $sum: { $ifNull: ['$money.totalPaid', 0] } },
                    depositsHeld: { $sum: { $ifNull: ['$money.depositHeld', 0] } },
                },
            },
        ]),
    ]);

    const recentBookings = await BikeBooking.find(bookingFilter)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('bikeId', 'name registrationNumber')
        .select('bookingNumber status startAt endAt money createdAt bikeId')
        .lean();

    return {
        zonesActive,
        zonesTotal,
        categoriesActive,
        bikesTotal,
        bikesAvailable,
        bikesMaintenance,
        bikesRented,
        bikesReserved,
        bookingsTotal,
        bookingsActive,
        bookingsCompleted,
        activeRentals,
        upcomingPickups,
        upcomingReturns,
        lateReturns,
        extensionRequests,
        pendingDeposits,
        pendingRefunds,
        revenue: Number(revenueAgg[0]?.revenue || 0),
        depositsHeld: Number(revenueAgg[0]?.depositsHeld || 0),
        utilizationPercent: bikesTotal
            ? Math.round(((bikesRented + bikesReserved) / bikesTotal) * 100)
            : 0,
        recentBookings: recentBookings.map((b) => ({
            id: String(b._id),
            bookingNumber: b.bookingNumber,
            status: b.status,
            startAt: b.startAt,
            endAt: b.endAt,
            totalPaid: Number(b.money?.totalPaid || 0),
            bikeName: b.bikeId?.name || '',
            registrationNumber: b.bikeId?.registrationNumber || '',
            createdAt: b.createdAt,
        })),
    };
}
