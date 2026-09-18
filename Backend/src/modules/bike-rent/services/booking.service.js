import { BikeBooking } from '../models/bikeBooking.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import {
    parseListQuery,
    buildDateRangeFilter,
    toBikeRentPagination,
    escapeRegex,
} from '../utils/pagination.util.js';
import { mapBooking } from '../utils/mappers.util.js';
import {
    validateBookingId,
    validateBookingStatusDto,
} from '../validators/booking.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { assertTransition } from '../state/bookingStateMachine.js';
import * as bookingEngine from './bookingEngine.service.js';

const baseFilter = { isDeleted: { $ne: true } };

/** Populate bike category/zone/hub + booking zone/category so admin UI can show location details. */
const BOOKING_LIST_POPULATE = [
    {
        path: 'bikeId',
        populate: [
            { path: 'categoryId', select: 'name slug icon status' },
            { path: 'zoneId', select: 'name country status pickupHub coordinates' },
            { path: 'hubId', select: 'name address landmark instructions lat lng status zoneId maxBikes ownerType vendorId' },
        ],
    },
    { path: 'zoneId', select: 'name country status pickupHub coordinates' },
    { path: 'categoryId', select: 'name slug icon status' },
    { path: 'userId', select: 'name phone email profileImage drivingLicenseNumber drivingLicenseFront drivingLicenseBack aadhaarNumber aadhaarFront aadhaarBack' },
];

export async function listBookings(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };

    if (parsed.status) filter.status = parsed.status;
    if (query.depositStatus && String(query.depositStatus) !== 'all') {
        filter['securityDepositPayment.depositStatus'] = String(query.depositStatus).trim();
    }
    if (query.zoneId && query.zoneId !== 'all') filter.zoneId = query.zoneId;
    if (query.bikeId && query.bikeId !== 'all') filter.bikeId = query.bikeId;
    if (query.userId) filter.userId = query.userId;
    if (query.vendorId) {
        filter.ownerType = 'vendor';
        filter.vendorId = query.vendorId;
    }

    const ops = String(query.ops || '').trim();
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (ops === 'extensions') {
        filter['pendingExtension.status'] = 'requested';
    } else if (ops === 'live') {
        filter.status = { $in: ['active', 'rental_started', 'pickup_completed'] };
    } else if (ops === 'pickups') {
        filter.status = 'reserved';
        filter.startAt = { $gte: now, $lte: in24h };
    } else if (ops === 'returns') {
        filter.status = { $in: ['active', 'rental_started', 'pickup_completed'] };
        filter.endAt = { $gte: now, $lte: in24h };
    } else if (ops === 'late') {
        filter.status = { $in: ['active', 'rental_started', 'pickup_completed', 'return_requested'] };
        filter.endAt = { $lt: now };
    } else if (ops === 'refunds') {
        filter.status = { $in: ['completed', 'refund_processing'] };
        filter['depositRefund.status'] = 'processing';
    }
    if (query.pendingExtension && String(query.pendingExtension) !== 'all') {
        filter['pendingExtension.status'] = String(query.pendingExtension).trim();
    }

    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.$or = [
            { bookingNumber: { $regex: term, $options: 'i' } },
            { couponCode: { $regex: term, $options: 'i' } },
            { pickupCode: { $regex: term, $options: 'i' } },
            { 'riderSnapshot.name': { $regex: term, $options: 'i' } },
            { 'riderSnapshot.phone': { $regex: term, $options: 'i' } },
            { 'riderSnapshot.email': { $regex: term, $options: 'i' } },
            { 'bikeSnapshot.name': { $regex: term, $options: 'i' } },
            { 'bikeSnapshot.registrationNumber': { $regex: term, $options: 'i' } },
            { 'zoneSnapshot.name': { $regex: term, $options: 'i' } },
            { 'zoneSnapshot.hubName': { $regex: term, $options: 'i' } },
        ];
    }

    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;

    const [docs, total] = await Promise.all([
        BikeBooking.find(filter)
            .populate(BOOKING_LIST_POPULATE)
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeBooking.countDocuments(filter),
    ]);

    return toBikeRentPagination({
        docs: docs.map((doc) => {
            const booking = mapBooking(doc);
            // Admin must get the code from the rider — never expose it in admin APIs.
            delete booking.pickupCode;
            return booking;
        }),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

/** Throws if the booking isn't owned by this vendor — used to gate vendor booking-action routes. */
export async function assertVendorOwnsBooking(id, vendorId) {
    const bookingId = validateBookingId(id);
    const doc = await BikeBooking.findOne({ _id: bookingId, ...baseFilter })
        .select('_id ownerType vendorId')
        .lean();
    if (!doc || doc.ownerType !== 'vendor' || String(doc.vendorId) !== String(vendorId)) {
        throw new NotFoundError('Booking not found');
    }
}

export async function getBookingById(id, vendorScope = null) {
    const bookingId = validateBookingId(id);
    const doc = await BikeBooking.findOne({ _id: bookingId, ...baseFilter })
        .populate(BOOKING_LIST_POPULATE)
        .lean();
    if (!doc) throw new NotFoundError('Booking not found');
    if (vendorScope && (doc.ownerType !== 'vendor' || String(doc.vendorId) !== String(vendorScope))) {
        throw new NotFoundError('Booking not found');
    }
    const booking = mapBooking(doc);
    delete booking.pickupCode;
    try {
        const compare = await (await import('./inspection.service.js')).getInspectionCompare(bookingId);
        booking.pickupInspection = compare.pickup;
        booking.returnInspection = compare.return;
        booking.inspections = [compare.pickup, compare.return].filter(Boolean);
    } catch {
        booking.pickupInspection = null;
        booking.returnInspection = null;
        booking.inspections = [];
    }
    return booking;
}

export async function updateBookingStatus(id, body, reqUser) {
    const bookingId = validateBookingId(id);
    const { status, note } = validateBookingStatusDto(body);
    const doc = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!doc) throw new NotFoundError('Booking not found');

    if (status === 'cancelled') {
        return bookingEngine.cancelBooking(null, bookingId, { reason: note, actor: 'admin' }, reqUser);
    }
    if (status === 'no_show') {
        return bookingEngine.markNoShow(bookingId, note || 'Marked no-show by admin', reqUser);
    }
    if (status === 'expired') {
        return bookingEngine.expireBooking(bookingId, note || 'Expired by admin');
    }
    if (status === 'inspection' || status === 'completed' || status === 'deposit_refunded') {
        throw new ValidationError(
            'Use the inspection settle endpoint for return inspection and deposit settlement',
        );
    }

    assertTransition(doc.status, status);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const updated = await bookingEngine.transitionBooking(
        doc._id,
        doc.status,
        status,
        { note: note || '', performer },
    );
    return mapBooking((await BikeBooking.findById(updated._id).populate(BOOKING_LIST_POPULATE).lean()));
}

/** Prefer bookingEngine.inspectAndSettle — kept for admin service compatibility. */
export async function inspectBooking(id, body, reqUser) {
    return bookingEngine.inspectAndSettle(id, body, reqUser);
}
