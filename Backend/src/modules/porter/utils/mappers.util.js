const toId = (doc) => (doc?._id ? String(doc._id) : doc?.id ? String(doc.id) : '');

export const mapZone = (doc = {}, stats = {}) => ({
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
    orders: Number(stats.orders || 0),
    drivers: Number(stats.drivers || 0),
    vehicles: Number(stats.vehicles || 0),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const mapVehicle = (doc = {}, pricing = null) => {
    const capacityConfigured = doc.capacityConfigured === true
        || (
            Number(doc.maxWeight || 0) > 0
            && Number(doc.maxLengthCm || 0) > 0
            && Number(doc.maxWidthCm || 0) > 0
            && Number(doc.maxHeightCm || 0) > 0
        );

    const base = {
        id: toId(doc),
        vehicleCode: doc.vehicleCode || doc.code || '',
        name: doc.name || '',
        category: doc.category || '',
        icon: typeof doc.icon === 'string' ? doc.icon : 'Truck',
        iconUrl: doc.iconUrl || doc.icon?.url || '',
        image: doc.iconUrl || doc.icon?.url || doc.image || '',
        description: doc.description || '',
        seats: Number(doc.seats || 0),
        minWeight: Number(doc.minWeight || 0),
        maxWeight: Number(doc.maxWeight || 0),
        maxLengthCm: Number(doc.maxLengthCm || 0),
        maxWidthCm: Number(doc.maxWidthCm || 0),
        maxHeightCm: Number(doc.maxHeightCm || 0),
        sizeLabel: doc.sizeLabel || '',
        capacityConfigured,
        capacityNote: capacityConfigured
            ? ''
            : 'Complete capacity configuration so this vehicle is visible on the user side',
        status: doc.status || 'inactive',
        supportedServices: Array.isArray(doc.supportedServices) ? doc.supportedServices : [],
        assignedDrivers: Number(doc.assignedDrivers || 0),
        count: Number(doc.count || 0),
        displayOrder: Number(doc.displayOrder || 0),
        pricingConfigured: false,
        enableDistanceCharges: true,
        basePrice: 0,
        baseDistance: 2,
        distancePrice: 10,
        serviceTax: 5,
        commissionType: 'Percentage',
        commissionValue: 10,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };

    if (!pricing) return base;

    const hasSlabs = Array.isArray(pricing.slabs) && pricing.slabs.length > 0;
    const configured = pricing.pricingConfigured !== false
        && (hasSlabs || (pricing.baseFare != null && Number(pricing.baseFare) >= 0)
            || (pricing.basePrice != null && Number(pricing.basePrice) >= 0));

    const first = hasSlabs ? pricing.slabs[0] : pricing;

    return {
        ...base,
        pricingConfigured: configured,
        enableDistanceCharges: true,
        basePrice: Number(first.baseFare ?? first.basePrice ?? 0),
        baseDistance: Number(first.baseDistanceKm ?? first.baseDistance ?? 0),
        distancePrice: Number(first.perKmRate ?? first.distancePrice ?? 0),
        freeWeightKg: Number(first.freeWeightKg || 0),
        perKgRate: Number(first.perKgRate || 0),
        platformFee: Number(first.platformFee || 0),
        serviceTax: Number(pricing.serviceTax || 0),
        commissionType: 'Percentage',
        commissionValue: Number(pricing.adminCommissionPercent || pricing.commissionValue || 0),
        adminCommissionPercent: Number(pricing.adminCommissionPercent || 0),
        freeLoadingMinutes: Number(
            pricing.freeLoadingMinutes != null ? pricing.freeLoadingMinutes : 60,
        ),
        extraLoadingPerMinCharge: Number(
            pricing.extraLoadingPerMinCharge != null ? pricing.extraLoadingPerMinCharge : 3,
        ),
        slabs: hasSlabs ? pricing.slabs : [],
        description: pricing.description || base.description,
        status: pricing.status || base.status,
        pricingId: toId(pricing),
        vehicleId: toId(doc),
        zoneId: pricing.zoneId ? String(pricing.zoneId) : null,
    };
};

export const mapPricing = (doc = {}, vehicle = null, zone = null) => {
    const slabs = Array.isArray(doc.slabs) && doc.slabs.length
        ? doc.slabs.map((s) => ({
            fromKm: Number(s.fromKm || 0),
            toKm: s.toKm == null ? null : Number(s.toKm),
            baseFare: Number(s.baseFare || 0),
            baseDistanceKm: Number(s.baseDistanceKm || 0),
            perKmRate: Number(s.perKmRate || 0),
            freeWeightKg: Number(s.freeWeightKg || 0),
            perKgRate: Number(s.perKgRate || 0),
            platformFee: Number(s.platformFee || 0),
            surgeMultiplier: Number(s.surgeMultiplier ?? 1),
        }))
        : [{
            fromKm: 0,
            toKm: null,
            baseFare: Number(doc.baseFare ?? doc.basePrice ?? 0),
            baseDistanceKm: Number(doc.baseDistanceKm ?? doc.baseDistance ?? 0),
            perKmRate: Number(doc.perKmRate ?? doc.distancePrice ?? 0),
            freeWeightKg: Number(doc.freeWeightKg || 0),
            perKgRate: Number(doc.perKgRate || 0),
            platformFee: Number(doc.platformFee || 0),
            surgeMultiplier: Number(doc.surgeMultiplier ?? 1),
        }];

    const first = slabs[0] || {};

    return {
        id: toId(doc),
        vehicleId: toId(doc.vehicleId || vehicle),
        vehicleTypeId: toId(doc.vehicleId || vehicle),
        zoneId: doc.zoneId ? String(doc.zoneId) : null,
        slabs,
        slabCount: slabs.length,
        baseFare: Number(first.baseFare || 0),
        baseDistanceKm: Number(first.baseDistanceKm || 0),
        perKmRate: Number(first.perKmRate || 0),
        freeWeightKg: Number(first.freeWeightKg || 0),
        perKgRate: Number(first.perKgRate || 0),
        platformFee: Number(first.platformFee || 0),
        surgeMultiplier: Number(first.surgeMultiplier ?? 1),
        adminCommissionPercent: Number(doc.adminCommissionPercent || 0),
        freeLoadingMinutes: Number(
            doc.freeLoadingMinutes != null ? doc.freeLoadingMinutes : 60,
        ),
        extraLoadingPerMinCharge: Number(
            doc.extraLoadingPerMinCharge != null ? doc.extraLoadingPerMinCharge : 3,
        ),
        // legacy aliases used by older UI
        basePrice: Number(first.baseFare || 0),
        baseDistance: Number(first.baseDistanceKm || 0),
        distancePrice: Number(first.perKmRate || 0),
        commissionType: 'Percentage',
        commissionValue: Number(doc.adminCommissionPercent || 0),
        pricingConfigured: doc.pricingConfigured !== false && slabs.length > 0,
        status: doc.status || 'active',
        description: doc.description || '',
        vehicle: vehicle
            ? {
                id: toId(vehicle),
                name: vehicle.name || '',
                category: vehicle.category || '',
                iconUrl: vehicle.iconUrl || '',
            }
            : null,
        zone: zone
            ? {
                id: toId(zone),
                name: zone.name || '',
            }
            : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
};

export const mapCoupon = (doc = {}) => ({
    id: toId(doc),
    code: doc.code || '',
    name: doc.name || '',
    description: doc.description || '',
    discountType: doc.discountType || 'percentage',
    discountValue: Number(doc.discountValue || 0),
    maxDiscount: Number(doc.maxDiscount || 0),
    minOrderValue: Number(doc.minOrderValue || 0),
    maxUses: Number(doc.maxUses || 0),
    usedCount: Number(doc.usedCount || 0),
    perUserLimit: Number(doc.perUserLimit || 1),
    validFrom: doc.validFrom,
    validUntil: doc.validUntil,
    firstOrderOnly: Boolean(doc.firstOrderOnly),
    newCustomerOnly: Boolean(doc.newCustomerOnly),
    active: doc.active !== false,
    autoApply: Boolean(doc.autoApply),
    zones: Array.isArray(doc.zones) ? doc.zones : ['All Zones'],
    vehicleTypes: Array.isArray(doc.vehicleTypes) ? doc.vehicleTypes : ['All'],
    customerSegment: doc.customerSegment || 'All Customers',
    status: doc.status || 'inactive',
    image: doc.image?.url || doc.image || null,
    banner: doc.banner?.url || doc.banner || null,
    campaignRevenue: Number(doc.campaignRevenue || 0),
    totalDiscountGiven: Number(doc.totalDiscountGiven || 0),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const mapBanner = (doc = {}) => ({
    id: toId(doc),
    title: doc.title || '',
    subtitle: doc.subtitle || '',
    type: doc.redirectType || doc.type || 'promotional',
    target: doc.redirectValue || doc.target || 'Home',
    redirectType: doc.redirectType || doc.type || 'promotional',
    redirectValue: doc.redirectValue || doc.target || 'Home',
    priority: Number(doc.priority || 0),
    displayOrder: Number(doc.displayOrder ?? doc.priority ?? 0),
    image: doc.image?.url || doc.image || '',
    imagePublicId: doc.image?.publicId || null,
    link: doc.link || doc.linkUrl || '',
    linkUrl: doc.link || doc.linkUrl || '',
    startDate: doc.startDate,
    endDate: doc.endDate,
    status: doc.status || 'inactive',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const mapPorterUser = (doc = {}, extras = {}) => ({
    id: toId(doc),
    name: doc.name || '',
    avatar: doc.profileImage || extras.avatar || '',
    email: doc.email || '',
    phone: doc.phone ? (doc.countryCode ? `${doc.countryCode} ${doc.phone}` : doc.phone) : '',
    zone: extras.zone || '',
    address: extras.address || (() => {
        const main = [doc.address?.street, doc.address?.city, doc.address?.state, doc.address?.zipCode].filter(Boolean).join(', ');
        if (main) return main;
        if (doc.addresses && doc.addresses.length > 0) {
            const addr = doc.addresses[0];
            return [addr.street, addr.city, addr.state, addr.zipCode].filter(Boolean).join(', ');
        }
        return '';
    })(),
    totalOrders: Number(extras.totalOrders || 0),
    completedOrders: Number(extras.completedOrders || 0),
    cancelledOrders: Number(extras.cancelledOrders || 0),
    walletBalance: Number(doc.walletBalance || 0),
    verification: doc.isVerified ? 'verified' : 'pending',
    status: doc.isActive === false ? 'inactive' : 'active',
    registeredAt: doc.createdAt,
    recentOrders: Array.isArray(extras.recentOrders) ? extras.recentOrders : [],
});

export const mapTrip = (doc = {}, extras = {}) => ({
    id: toId(doc),
    tripNumber: doc.tripNumber || '',
    userId: toId(doc.userId),
    vehicleId: toId(doc.vehicleId),
    zoneId: doc.zoneId ? String(doc.zoneId) : null,
    pickup: doc.pickup || null,
    drop: doc.drop || null,
    parcel: doc.parcel || null,
    distanceKm: Number(doc.distanceKm || 0),
    durationMin: Number(doc.durationMin || 0),
    fare: doc.fare || null,
    fareEstimateTotal: Number(doc.fareEstimateTotal || 0),
    freeLoadingMinutes: Number(doc.freeLoadingMinutes ?? 60),
    extraLoadingPerMinCharge: Number(doc.extraLoadingPerMinCharge ?? 3),
    loadingStartedAt: doc.loadingStartedAt || null,
    loadedAt: doc.loadedAt || null,
    loadingMin: Number(doc.loadingMin || 0),
    billableLoadingMin: Number(doc.billableLoadingMin || 0),
    payment: doc.payment || null,
    status: doc.status || 'quoted',
    dispatch: doc.dispatch
        ? {
            status: doc.dispatch.status || 'unassigned',
            deliveryPartnerId: doc.dispatch.deliveryPartnerId
                ? String(doc.dispatch.deliveryPartnerId)
                : null,
            offeredTo: Array.isArray(doc.dispatch.offeredTo) ? doc.dispatch.offeredTo : [],
            assignedAt: doc.dispatch.assignedAt || null,
            acceptedAt: doc.dispatch.acceptedAt || null,
            currentAttempt: Number(doc.dispatch.currentAttempt || 0),
            lastAttemptAt: doc.dispatch.lastAttemptAt || null,
        }
        : null,
    deliveryOtp: extras.includeOtp ? doc.deliveryOtp : undefined,
    dropOtp: extras.includeDropOtp ? doc.dropOtp : undefined,
    assignedAt: doc.assignedAt || null,
    arrivedAt: doc.arrivedAt || null,
    startedAt: doc.startedAt || null,
    completedAt: doc.completedAt || null,
    cancelledAt: doc.cancelledAt || null,
    cancelReason: doc.cancelReason || '',
    driverRating: doc.driverRating ?? null,
    userRating: doc.userRating ?? null,
    lastDriverLocation: doc.lastDriverLocation || null,
    module: doc.module || 'porter',
    vehicle: extras.vehicle || null,
    driver: extras.driver || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});
