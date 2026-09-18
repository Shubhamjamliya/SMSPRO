const toId = (doc) => (doc?._id ? String(doc._id) : doc?.id ? String(doc.id) : '');

export const mapZone = (doc = {}) => ({
    id: toId(doc),
    name: doc.name || '',
    country: doc.country || 'India',
    unit: doc.unit || 'kilometer',
    status: doc.status || 'inactive',
    polygon: doc.polygon || (Array.isArray(doc.coordinates) && doc.coordinates.length
        ? `${doc.coordinates.length}-point polygon`
        : 'No area selected'),
    coordinates: Array.isArray(doc.coordinates)
        ? doc.coordinates.map((c) => ({
            lat: Number(c.lat ?? c.latitude),
            lng: Number(c.lng ?? c.longitude),
        }))
        : [],
    displayOrder: Number(doc.displayOrder || 0),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const mapVehicleType = (doc = {}) => {
    const seats = Number(doc.seats || 0);
    const seatsConfigured = doc.seatsConfigured === true || seats >= 1;

    return {
        id: toId(doc),
        name: doc.name || '',
        code: doc.code || '',
        category: doc.category || '',
        icon: doc.icon || 'Car',
        iconUrl: doc.iconUrl || '',
        seats,
        seatsConfigured,
        seatsNote: seatsConfigured
            ? ''
            : (doc.seatsNote || 'Complete seats configuration so this vehicle is ready for taxi booking'),
        status: doc.status || 'inactive',
        displayOrder: Number(doc.displayOrder || 0),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
};

export const mapSurgeSlot = (doc = {}) => ({
    id: toId(doc),
    name: doc.name || '',
    daysOfWeek: Array.isArray(doc.daysOfWeek) ? doc.daysOfWeek.map(Number) : [],
    startTime: doc.startTime || '00:00',
    endTime: doc.endTime || '00:00',
    amount: Number(doc.amount || 0),
    priority: Number(doc.priority || 0),
    isActive: doc.isActive !== false,
    status: doc.isActive === false ? 'inactive' : 'active',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const mapCoupon = (doc = {}, zones = [], vehicles = []) => ({
    id: toId(doc),
    code: doc.code || '',
    name: doc.name || '',
    description: doc.description || '',
    discountType: doc.discountType || 'percentage',
    discountValue: Number(doc.discountValue || 0),
    maxDiscount: Number(doc.maxDiscount || 0),
    minFare: Number(doc.minFare || 0),
    usageLimit: Number(doc.usageLimit || 0),
    usedCount: Number(doc.usedCount || 0),
    perUserLimit: Number(doc.perUserLimit || 1),
    validFrom: doc.validFrom,
    validUntil: doc.validUntil,
    customerScope: doc.customerScope || 'all',
    firstRideOnly: Boolean(doc.firstRideOnly),
    waivePlatformFee: Boolean(doc.waivePlatformFee),
    autoApply: Boolean(doc.autoApply),
    showInBooking: doc.showInBooking !== false,
    zoneIds: Array.isArray(doc.zoneIds) ? doc.zoneIds.map((id) => String(id)) : [],
    vehicleTypeIds: Array.isArray(doc.vehicleTypeIds)
        ? doc.vehicleTypeIds.map((id) => String(id))
        : [],
    zones: (zones || []).map((z) => ({ id: toId(z), name: z.name || '' })),
    vehicles: (vehicles || []).map((v) => ({
        id: toId(v),
        name: v.name || '',
        code: v.code || '',
    })),
    status: doc.status || 'inactive',
    totalDiscountGiven: Number(doc.totalDiscountGiven || 0),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const mapPricing = (doc = {}, vehicleType = null, zone = null) => {
    const slabs = Array.isArray(doc.slabs) && doc.slabs.length
        ? doc.slabs.map((s) => ({
            fromKm: Number(s.fromKm || 0),
            toKm: s.toKm == null ? null : Number(s.toKm),
            baseFare: Number(s.baseFare || 0),
            baseDistanceKm: Number(s.baseDistanceKm || 0),
            perKmRate: Number(s.perKmRate || 0),
            perMinRate: Number(s.perMinRate || 0),
            freeWaitMinutes: Number(s.freeWaitMinutes || 0),
            perMinWaitRate: Number(s.perMinWaitRate || 0),
            platformFee: Number(s.platformFee || 0),
            surgeMultiplier: Number(s.surgeMultiplier ?? 1),
        }))
        : [{
            fromKm: 0,
            toKm: null,
            baseFare: Number(doc.baseFare || 0),
            baseDistanceKm: Number(doc.baseDistanceKm || 0),
            perKmRate: Number(doc.perKmRate || 0),
            perMinRate: Number(doc.perMinRate || 0),
            freeWaitMinutes: Number(doc.freeWaitMinutes || 0),
            perMinWaitRate: Number(doc.perMinWaitRate || 0),
            platformFee: Number(doc.platformFee || 0),
            surgeMultiplier: Number(doc.surgeMultiplier ?? 1),
        }];

    const first = slabs[0] || {};

    return {
        id: toId(doc),
        vehicleTypeId: toId(doc.vehicleTypeId || vehicleType),
        zoneId: doc.zoneId ? String(doc.zoneId) : null,
        slabs,
        slabCount: slabs.length,
        baseFare: Number(first.baseFare || 0),
        baseDistanceKm: Number(first.baseDistanceKm || 0),
        perKmRate: Number(first.perKmRate || 0),
        perMinRate: Number(first.perMinRate || 0),
        freeWaitMinutes: Number(first.freeWaitMinutes || 0),
        perMinWaitRate: Number(first.perMinWaitRate || 0),
        platformFee: Number(first.platformFee || 0),
        surgeMultiplier: Number(first.surgeMultiplier ?? 1),
        adminCommissionPercent: Number(doc.adminCommissionPercent || 0),
        status: doc.status || 'active',
        vehicleType: vehicleType
            ? { id: toId(vehicleType), name: vehicleType.name, category: vehicleType.category, code: vehicleType.code }
            : null,
        zone: zone ? { id: toId(zone), name: zone.name } : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
};

export const mapRide = (doc = {}, extras = {}) => ({
    id: toId(doc),
    rideNumber: doc.rideNumber || '',
    userId: toId(doc.userId),
    vehicleTypeId: toId(doc.vehicleTypeId),
    zoneId: doc.zoneId ? String(doc.zoneId) : null,
    pickup: doc.pickup || null,
    drop: doc.drop || null,
    distanceKm: Number(doc.distanceKm || 0),
    durationMin: Number(doc.durationMin || 0),
    waitingMin: Number(doc.waitingMin || 0),
    fare: doc.fare || null,
    fareBreakdown: doc.fareBreakdown || null,
    fareEstimateTotal: Number(doc.fareEstimateTotal || 0),
    coupon: doc.coupon
        ? {
            couponId: doc.coupon.couponId ? String(doc.coupon.couponId) : null,
            code: doc.coupon.code || '',
            name: doc.coupon.name || '',
            discountType: doc.coupon.discountType || null,
            discountValue: Number(doc.coupon.discountValue || 0),
            discountAmount: Number(doc.coupon.discountAmount || 0),
            waivePlatformFee: Boolean(doc.coupon.waivePlatformFee),
        }
        : null,
    payment: doc.payment
        ? {
            method: doc.payment.method || 'cash',
            status: doc.payment.status || 'pending',
            paymentId: doc.payment.paymentId || null,
            razorpayOrderId: doc.payment.razorpayOrderId || null,
            razorpayPaymentId: doc.payment.razorpayPaymentId || null,
            paymentLinkId: doc.payment.paymentLinkId || doc.payment.qr?.paymentLinkId || null,
            shortUrl: doc.payment.shortUrl || doc.payment.qr?.shortUrl || null,
            qr: doc.payment.qr || null,
            paidAt: doc.payment.paidAt || null,
            collectedBy: doc.payment.collectedBy || null,
        }
        : null,
    status: doc.status || 'requested',
    dispatch: doc.dispatch
        ? {
            status: doc.dispatch.status || 'unassigned',
            deliveryPartnerId: doc.dispatch.deliveryPartnerId
                ? String(doc.dispatch.deliveryPartnerId)
                : null,
            offeredTo: Array.isArray(doc.dispatch.offeredTo) ? doc.dispatch.offeredTo : [],
            assignedAt: doc.dispatch.assignedAt || null,
            acceptedAt: doc.dispatch.acceptedAt || null,
        }
        : null,
    rideOtp: extras.includeOtp ? doc.rideOtp : undefined,
    assignedAt: doc.assignedAt || null,
    arrivedAt: doc.arrivedAt || null,
    startedAt: doc.startedAt || null,
    reachedDropAt: doc.reachedDropAt || null,
    completedAt: doc.completedAt || null,
    cancelledAt: doc.cancelledAt || null,
    cancelReason: doc.cancelReason || '',
    earningsCreditedAt: doc.earningsCreditedAt || null,
    driverRating: doc.driverRating ?? null,
    userRating: doc.userRating ?? null,
    lastDriverLocation: doc.lastDriverLocation || null,
    module: doc.module || 'taxi',
    vehicleType: extras.vehicleType || null,
    driver: extras.driver || null,
    rider: extras.rider || null,
    userPhone: extras.rider?.phone || extras.userPhone || null,
    userName: extras.rider?.name || extras.userName || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});
