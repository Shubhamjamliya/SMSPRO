import mongoose from 'mongoose';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import {
    parseListQuery,
    toBikeRentPagination,
    escapeRegex,
} from '../utils/pagination.util.js';
import { validateListQuery } from '../validators/listQuery.validator.js';

const toId = (v) => (v ? String(v) : null);

const CUSTOMER_LIST_SELECT = [
    'name',
    'email',
    'phone',
    'alternatePhone',
    'countryCode',
    'profileImage',
    'isActive',
    'isVerified',
    'isBlocked',
    'walletBalance',
    'createdAt',
].join(' ');

const CUSTOMER_DETAIL_SELECT = [
    'name',
    'email',
    'phone',
    'alternatePhone',
    'countryCode',
    'profileImage',
    'gender',
    'dateOfBirth',
    'anniversary',
    'referralCode',
    'referralCount',
    'walletBalance',
    'isActive',
    'isVerified',
    'isBlocked',
    'isCodAllowed',
    'accountStatus',
    'role',
    'drivingLicenseNumber',
    'drivingLicenseFront',
    'drivingLicenseBack',
    'aadhaarNumber',
    'panNumber',
    'aadhaarFront',
    'aadhaarBack',
    'panCardImage',
    'address',
    'addresses',
    'termsAccepted',
    'createdAt',
    'updatedAt',
].join(' ');

const ACTIVE_BOOKING_STATUSES = [
    'reserved',
    'pickup_completed',
    'rental_started',
    'active',
    'return_requested',
    'inspection',
    'refund_processing',
];

const COMPLETED_BOOKING_STATUSES = ['completed', 'deposit_refunded'];

function mapAddress(addr) {
    if (!addr) return null;
    return {
        id: toId(addr._id),
        label: addr.label || 'Other',
        street: addr.street || '',
        additionalDetails: addr.additionalDetails || '',
        city: addr.city || '',
        state: addr.state || '',
        zipCode: addr.zipCode || '',
        area: addr.area || '',
        landmark: addr.landmark || '',
        formattedAddress: addr.formattedAddress || '',
        phone: addr.phone || '',
        isDefault: Boolean(addr.isDefault),
    };
}

function formatLegacyAddress(address) {
    if (!address || typeof address !== 'object') return null;
    const parts = [address.street, address.city, address.state, address.zipCode, address.country]
        .map((part) => String(part || '').trim())
        .filter(Boolean);
    if (!parts.length) return null;
    return {
        street: address.street || '',
        city: address.city || '',
        state: address.state || '',
        zipCode: address.zipCode || '',
        country: address.country || 'India',
        formatted: parts.join(', '),
    };
}

function mapBookingSummary(b) {
    const money = b.money || {};
    return {
        id: toId(b._id),
        bookingNumber: b.bookingNumber || '',
        status: b.status || '',
        startAt: b.startAt || null,
        endAt: b.endAt || null,
        createdAt: b.createdAt || null,
        bikeName: b.bikeSnapshot?.name || '',
        bikeBrand: b.bikeSnapshot?.brand || '',
        bikeModel: b.bikeSnapshot?.model || '',
        registrationNumber: b.bikeSnapshot?.registrationNumber || '',
        zoneName: b.zoneSnapshot?.name || '',
        hubName: b.zoneSnapshot?.pickupHub?.name || '',
        riderName: b.riderSnapshot?.name || '',
        riderPhone: b.riderSnapshot?.phone || '',
        drivingLicenseNumber: b.riderSnapshot?.drivingLicenseNumber || '',
        rentalFee: Number(money.rentalFee || 0),
        securityDeposit: Number(money.securityDeposit || 0),
        discountAmount: Number(money.discountAmount || 0),
        totalPayable: Number(money.totalPayable || 0),
        totalPaid: Number(money.totalPaid || 0),
        // Aliases used by older UI bindings
        totalAmount: Number(money.totalPaid || money.totalPayable || 0),
        money: {
            rentalFee: Number(money.rentalFee || 0),
            securityDeposit: Number(money.securityDeposit || 0),
            totalPaid: Number(money.totalPaid || 0),
            totalPayable: Number(money.totalPayable || 0),
        },
    };
}

export async function listCustomers(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);

    const userIds = await BikeBooking.distinct('userId', { isDeleted: { $ne: true } });
    if (!userIds.length) {
        return toBikeRentPagination({
            docs: [],
            total: 0,
            page: parsed.page,
            limit: parsed.limit,
        });
    }

    const filter = { _id: { $in: userIds }, isDeleted: { $ne: true } };
    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { email: { $regex: term, $options: 'i' } },
            { phone: { $regex: term, $options: 'i' } },
            { alternatePhone: { $regex: term, $options: 'i' } },
        ];
    }

    const [users, total] = await Promise.all([
        FoodUser.find(filter)
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .select(CUSTOMER_LIST_SELECT)
            .lean(),
        FoodUser.countDocuments(filter),
    ]);

    const counts = await BikeBooking.aggregate([
        {
            $match: {
                isDeleted: { $ne: true },
                userId: { $in: users.map((u) => u._id) },
            },
        },
        {
            $group: {
                _id: '$userId',
                bookings: { $sum: 1 },
                completed: {
                    $sum: {
                        $cond: [{ $in: ['$status', COMPLETED_BOOKING_STATUSES] }, 1, 0],
                    },
                },
                active: {
                    $sum: {
                        $cond: [{ $in: ['$status', ACTIVE_BOOKING_STATUSES] }, 1, 0],
                    },
                },
                totalSpent: { $sum: { $ifNull: ['$money.totalPaid', 0] } },
            },
        },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));

    const docs = users.map((u) => {
        const stats = countMap.get(String(u._id)) || {};
        const bookingsCount = Number(stats.bookings || 0);
        const totalSpend = Number(stats.totalSpent || 0);
        return {
            id: toId(u._id),
            name: u.name || '',
            email: u.email || '',
            phone: u.phone || '',
            alternatePhone: u.alternatePhone || '',
            countryCode: u.countryCode || '+91',
            profileImage: u.profileImage || '',
            isActive: u.isActive !== false,
            isVerified: Boolean(u.isVerified),
            isBlocked: Boolean(u.isBlocked),
            walletBalance: Number(u.walletBalance || 0),
            bookingsCount,
            bookings: bookingsCount,
            completed: Number(stats.completed || 0),
            active: Number(stats.active || 0),
            totalSpend,
            totalSpent: totalSpend,
            totalAmount: totalSpend,
            status: u.isBlocked ? 'blocked' : (u.isActive === false ? 'inactive' : 'active'),
            createdAt: u.createdAt,
        };
    });

    return toBikeRentPagination({
        docs,
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function getCustomerById(id) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid customer id');
    }

    const user = await FoodUser.findOne({ _id: id, isDeleted: { $ne: true } })
        .select(CUSTOMER_DETAIL_SELECT)
        .lean();
    if (!user) throw new NotFoundError('Customer not found');

    const [statsRows, bookings] = await Promise.all([
        BikeBooking.aggregate([
            {
                $match: {
                    userId: user._id,
                    isDeleted: { $ne: true },
                },
            },
            {
                $group: {
                    _id: null,
                    bookingsCount: { $sum: 1 },
                    completed: {
                        $sum: {
                            $cond: [{ $in: ['$status', COMPLETED_BOOKING_STATUSES] }, 1, 0],
                        },
                    },
                    active: {
                        $sum: {
                            $cond: [{ $in: ['$status', ACTIVE_BOOKING_STATUSES] }, 1, 0],
                        },
                    },
                    cancelled: {
                        $sum: {
                            $cond: [{ $in: ['$status', ['cancelled', 'rejected', 'expired', 'no_show']] }, 1, 0],
                        },
                    },
                    totalSpend: { $sum: { $ifNull: ['$money.totalPaid', 0] } },
                    totalDeposit: { $sum: { $ifNull: ['$money.securityDeposit', 0] } },
                },
            },
        ]),
        BikeBooking.find({
            userId: user._id,
            isDeleted: { $ne: true },
        })
            .sort({ createdAt: -1 })
            .limit(50)
            .select('bookingNumber status startAt endAt money createdAt bikeSnapshot zoneSnapshot riderSnapshot')
            .lean(),
    ]);

    const stats = statsRows[0] || {};
    const addresses = Array.isArray(user.addresses)
        ? user.addresses.map(mapAddress).filter(Boolean)
        : [];

    return {
        id: toId(user._id),
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        alternatePhone: user.alternatePhone || '',
        countryCode: user.countryCode || '+91',
        profileImage: user.profileImage || '',
        gender: user.gender || '',
        dateOfBirth: user.dateOfBirth || null,
        anniversary: user.anniversary || null,
        referralCode: user.referralCode || '',
        referralCount: Number(user.referralCount || 0),
        walletBalance: Number(user.walletBalance || 0),
        isActive: user.isActive !== false,
        isVerified: Boolean(user.isVerified),
        isBlocked: Boolean(user.isBlocked),
        isCodAllowed: user.isCodAllowed !== false,
        accountStatus: user.accountStatus || 'active',
        role: user.role || 'USER',
        drivingLicenseNumber: user.drivingLicenseNumber || '',
        aadhaarNumber: user.aadhaarNumber || '',
        panNumber: user.panNumber || '',
        documents: {
            aadhaarFront: user.aadhaarFront || '',
            aadhaarBack: user.aadhaarBack || '',
            drivingLicenseFront: user.drivingLicenseFront || '',
            drivingLicenseBack: user.drivingLicenseBack || '',
            panCardImage: user.panCardImage || '',
            hasAadhaarFront: Boolean(user.aadhaarFront),
            hasAadhaarBack: Boolean(user.aadhaarBack),
            hasDrivingLicenseFront: Boolean(user.drivingLicenseFront),
            hasDrivingLicenseBack: Boolean(user.drivingLicenseBack),
            hasPanCard: Boolean(user.panCardImage),
        },
        address: formatLegacyAddress(user.address),
        addresses,
        termsAccepted: Boolean(user.termsAccepted),
        createdAt: user.createdAt || null,
        updatedAt: user.updatedAt || null,
        status: user.isBlocked ? 'blocked' : (user.isActive === false ? 'inactive' : 'active'),
        bookingsCount: Number(stats.bookingsCount || 0),
        completed: Number(stats.completed || 0),
        active: Number(stats.active || 0),
        cancelled: Number(stats.cancelled || 0),
        totalSpend: Number(stats.totalSpend || 0),
        totalAmount: Number(stats.totalSpend || 0),
        totalDeposit: Number(stats.totalDeposit || 0),
        bookings: bookings.map(mapBookingSummary),
    };
}
