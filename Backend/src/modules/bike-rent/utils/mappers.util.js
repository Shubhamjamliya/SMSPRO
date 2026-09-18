const toId = (doc) => {
    if (!doc) return null;
    // Unpopulated Mongoose/BSON ObjectId — stringify via toHexString, not the raw id Buffer.
    if (typeof doc.toHexString === 'function') return doc.toHexString();
    if (typeof doc === 'string') return doc;
    if (doc.id) return String(doc.id);
    if (doc._id) return String(doc._id);
    return String(doc);
};

/** True when a ref field was actually .populate()'d (a real sub-doc), not just an unpopulated ObjectId. */
const isPopulated = (value) =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof value.toHexString !== 'function';

export const mapHub = (doc = {}, stats = {}) => {
    const zone = isPopulated(doc.zoneId)
        ? { id: toId(doc.zoneId), name: doc.zoneId.name || '' }
        : null;
    const maxBikes =
        doc.maxBikes == null || doc.maxBikes === ''
            ? null
            : Number(doc.maxBikes);
    return {
        id: toId(doc),
        zoneId: zone?.id || toId(doc.zoneId) || null,
        zoneName: zone?.name || '',
        zone,
        name: doc.name || '',
        address: doc.address || '',
        landmark: doc.landmark || '',
        instructions: doc.instructions || '',
        lat: doc.lat == null ? null : Number(doc.lat),
        lng: doc.lng == null ? null : Number(doc.lng),
        /** Max bikes allowed at this hub (null = unlimited) */
        maxBikes: Number.isFinite(maxBikes) && maxBikes > 0 ? maxBikes : null,
        /** Assigned bikes currently on this hub */
        bikeCount: Number(stats.bikeCount ?? doc.bikeCount ?? 0),
        status: doc.status || 'inactive',
        displayOrder: Number(doc.displayOrder || 0),
        ownerType: doc.ownerType || 'admin',
        vendorId: toId(doc.vendorId),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
};

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
    pickupHub: {
        name: doc.pickupHub?.name || '',
        address: doc.pickupHub?.address || '',
        landmark: doc.pickupHub?.landmark || '',
        instructions: doc.pickupHub?.instructions || '',
        lat: doc.pickupHub?.lat == null ? null : Number(doc.pickupHub.lat),
        lng: doc.pickupHub?.lng == null ? null : Number(doc.pickupHub.lng),
    },
    bikes: Number(stats.bikes || 0),
    availableBikes: Number(stats.availableBikes || 0),
    /** Total pickup hubs in this zone (active + inactive, not deleted) */
    hubCount: Number(stats.hubCount || 0),
    ownerType: doc.ownerType || 'admin',
    vendorId: toId(doc.vendorId),
    vendor: isPopulated(doc.vendorId)
        ? {
            id: toId(doc.vendorId),
            businessName: doc.vendorId.businessName || '',
            vendorCode: doc.vendorId.vendorCode || '',
        }
        : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const mapCategory = (doc = {}) => ({
    id: toId(doc),
    name: doc.name || '',
    slug: doc.slug || '',
    icon: doc.icon || '',
    description: doc.description || '',
    defaultSecurityDeposit: Number(doc.defaultSecurityDeposit || 0),
    displayOrder: Number(doc.displayOrder || 0),
    status: doc.status || 'inactive',
    ownerType: doc.ownerType || 'admin',
    vendorId: toId(doc.vendorId),
    approvalStatus: doc.approvalStatus || 'approved',
    rejectionReason: doc.rejectionReason || '',
    approvalHistory: Array.isArray(doc.approvalHistory)
        ? doc.approvalHistory.map((h) => ({
            status: h.status || '',
            reason: h.reason || '',
            changedAt: h.changedAt,
            changedByName: h.changedBy?.name || '',
        }))
        : [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const mapBike = (doc = {}) => {
    const category = isPopulated(doc.categoryId)
        ? mapCategory(doc.categoryId)
        : null;
    const zone = isPopulated(doc.zoneId)
        ? mapZone(doc.zoneId)
        : null;
    const hub = isPopulated(doc.hubId)
        ? mapHub(doc.hubId)
        : null;

    return {
        id: toId(doc),
        name: doc.name || '',
        brand: doc.brand || '',
        model: doc.model || '',
        categoryId: category?.id || toId(doc.categoryId) || null,
        category,
        categoryName: category?.name || '',
        registrationNumber: doc.registrationNumber || '',
        engineNumber: doc.engineNumber || '',
        chassisNumber: doc.chassisNumber || '',
        fuelType: doc.fuelType || 'petrol',
        transmission: doc.transmission || 'manual',
        seatingCapacity: Number(doc.seatingCapacity || 2),
        helmetIncluded: Boolean(doc.helmetIncluded),
        description: doc.description || '',
        requiredDocuments: Array.isArray(doc.requiredDocuments)
            ? doc.requiredDocuments
                .map((item) => String(item || '').trim())
                .filter(Boolean)
            : [],
        images: Array.isArray(doc.images)
            ? doc.images
                .map((image) => ({
                    url: String(image?.url || '').trim(),
                    publicId: String(image?.publicId || '').trim(),
                    isPrimary: Boolean(image?.isPrimary),
                }))
                .filter((image) => Boolean(image.url) && !image.url.startsWith('blob:'))
            : [],
        rcDoc: {
            url: String(doc.rcDoc?.url || '').trim(),
            publicId: String(doc.rcDoc?.publicId || '').trim(),
        },
        insuranceDoc: {
            url: String(doc.insuranceDoc?.url || '').trim(),
            publicId: String(doc.insuranceDoc?.publicId || '').trim(),
        },
        pucDoc: {
            url: String(doc.pucDoc?.url || '').trim(),
            publicId: String(doc.pucDoc?.publicId || '').trim(),
        },
        hourlyPrice: Number(doc.hourlyPrice || 0),
        dailyPrice: Number(doc.dailyPrice || 0),
        weeklyPrice: Number(doc.weeklyPrice || 0),
        securityDeposit: Number(doc.securityDeposit || 0),
        zoneId: zone?.id || toId(doc.zoneId) || null,
        zone,
        zoneName: zone?.name || '',
        hubId: hub?.id || toId(doc.hubId) || null,
        hub,
        hubName: hub?.name || '',
        pickupHub: hub
            ? {
                name: hub.name,
                address: hub.address,
                landmark: hub.landmark,
                instructions: hub.instructions,
                lat: hub.lat,
                lng: hub.lng,
            }
            : (zone?.pickupHub || null),
        availabilityStatus: doc.availabilityStatus || 'available',
        maintenanceStatus: doc.maintenanceStatus || 'none',
        isActive: Boolean(doc.isActive),
        settingsOverride: doc.settingsOverride && typeof doc.settingsOverride === 'object'
            ? { ...doc.settingsOverride }
            : null,
        ownerType: doc.ownerType || 'admin',
        vendorId: toId(doc.vendorId),
        vendor: isPopulated(doc.vendorId)
            ? {
                id: toId(doc.vendorId),
                businessName: doc.vendorId.businessName || '',
                ownerName: doc.vendorId.ownerName || '',
                vendorCode: doc.vendorId.vendorCode || '',
            }
            : null,
        approvalStatus: doc.approvalStatus || 'approved',
        rejectionReason: doc.rejectionReason || '',
        rejectedSnapshot: doc.rejectedSnapshot || null,
        approvalHistory: Array.isArray(doc.approvalHistory)
            ? doc.approvalHistory.map((h) => ({
                status: h.status || '',
                reason: h.reason || '',
                changedAt: h.changedAt,
                changedByName: h.changedBy?.name || '',
            }))
            : [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
};

export const mapPricing = (doc = {}) => ({
    id: toId(doc),
    name: doc.name || '',
    scope: doc.scope || 'global',
    categoryId: toId(doc.categoryId),
    zoneId: toId(doc.zoneId),
    bikeId: toId(doc.bikeId),
    vendorId: toId(doc.vendorId),
    hourlyPrice: doc.hourlyPrice == null ? null : Number(doc.hourlyPrice),
    dailyPrice: doc.dailyPrice == null ? null : Number(doc.dailyPrice),
    weeklyPrice: doc.weeklyPrice == null ? null : Number(doc.weeklyPrice),
    securityDeposit: doc.securityDeposit == null ? null : Number(doc.securityDeposit),
    overtimeRatePerHour: Number(doc.overtimeRatePerHour || 0),
    taxPercent: Number(doc.taxPercent || 0),
    status: doc.status || 'inactive',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

export const mapBooking = (doc = {}) => {
    const bike = isPopulated(doc.bikeId) ? mapBike(doc.bikeId) : null;
    const populatedZone = isPopulated(doc.zoneId)
        ? mapZone(doc.zoneId)
        : null;
    const populatedCategory = isPopulated(doc.categoryId)
        ? mapCategory(doc.categoryId)
        : null;
    const rider = doc.riderSnapshot && typeof doc.riderSnapshot === 'object'
        ? doc.riderSnapshot
        : null;
    const populatedUser = isPopulated(doc.userId)
        ? doc.userId
        : null;
    const customer = {
        id: toId(populatedUser) || toId(doc.userId) || null,
        name: rider?.name || populatedUser?.name || '',
        phone: rider?.phone || populatedUser?.phone || '',
        email: rider?.email || populatedUser?.email || '',
        profileImage: populatedUser?.profileImage || '',
        drivingLicenseNumber:
            rider?.drivingLicenseNumber || populatedUser?.drivingLicenseNumber || '',
        aadhaarNumber: populatedUser?.aadhaarNumber || '',
        documents: {
            drivingLicenseFront: populatedUser?.drivingLicenseFront || '',
            drivingLicenseBack: populatedUser?.drivingLicenseBack || '',
            aadhaarFront: populatedUser?.aadhaarFront || '',
            aadhaarBack: populatedUser?.aadhaarBack || '',
        },
    };

    const snapHub = doc.zoneSnapshot?.pickupHub && typeof doc.zoneSnapshot.pickupHub === 'object'
        ? doc.zoneSnapshot.pickupHub
        : {};
    const bikeHub = bike?.pickupHub || bike?.hub || {};
    const zoneHub = populatedZone?.pickupHub || bike?.zone?.pickupHub || {};
    const pickupHub = {
        name: snapHub.name || bikeHub.name || zoneHub.name || doc.zoneSnapshot?.hubName || bike?.hubName || '',
        address: snapHub.address || bikeHub.address || zoneHub.address || '',
        landmark: snapHub.landmark || bikeHub.landmark || zoneHub.landmark || '',
        instructions: snapHub.instructions || bikeHub.instructions || zoneHub.instructions || '',
        lat: snapHub.lat ?? bikeHub.lat ?? zoneHub.lat ?? null,
        lng: snapHub.lng ?? bikeHub.lng ?? zoneHub.lng ?? null,
    };

    const zoneName = doc.zoneSnapshot?.name || populatedZone?.name || bike?.zoneName || '';
    const hubName = doc.zoneSnapshot?.hubName || pickupHub.name || bike?.hubName || '';
    const categoryName = doc.bikeSnapshot?.categoryName
        || bike?.categoryName
        || populatedCategory?.name
        || '';

    const bikeSnapshot = {
        ...(doc.bikeSnapshot || {}),
        name: doc.bikeSnapshot?.name || bike?.name || '',
        brand: doc.bikeSnapshot?.brand || bike?.brand || '',
        model: doc.bikeSnapshot?.model || bike?.model || '',
        registrationNumber: doc.bikeSnapshot?.registrationNumber || bike?.registrationNumber || '',
        categoryId: doc.bikeSnapshot?.categoryId || bike?.categoryId || toId(doc.categoryId) || null,
        categoryName,
        zoneName,
        hubName,
        hourlyPrice: doc.bikeSnapshot?.hourlyPrice ?? bike?.hourlyPrice ?? null,
        dailyPrice: doc.bikeSnapshot?.dailyPrice ?? bike?.dailyPrice ?? null,
        weeklyPrice: doc.bikeSnapshot?.weeklyPrice ?? bike?.weeklyPrice ?? null,
        securityDeposit: doc.bikeSnapshot?.securityDeposit ?? bike?.securityDeposit ?? null,
        images: Array.isArray(doc.bikeSnapshot?.images) && doc.bikeSnapshot.images.length
            ? doc.bikeSnapshot.images
            : (bike?.images || []),
        primaryImage: doc.bikeSnapshot?.primaryImage
            || bike?.images?.find((img) => img.isPrimary)?.url
            || bike?.images?.[0]?.url
            || '',
    };

    const zoneSnapshot = {
        ...(doc.zoneSnapshot || {}),
        id: doc.zoneSnapshot?.id || populatedZone?.id || bike?.zoneId || toId(doc.zoneId),
        name: zoneName,
        hubId: doc.zoneSnapshot?.hubId || bike?.hubId || null,
        hubName,
        pickupHub,
    };

    if (bike) {
        if (!bike.categoryName && categoryName) bike.categoryName = categoryName;
        if (!bike.zoneName && zoneName) bike.zoneName = zoneName;
        if (!bike.hubName && hubName) bike.hubName = hubName;
        if (!bike.pickupHub?.name && pickupHub.name) bike.pickupHub = pickupHub;
    }

    return {
        id: toId(doc),
        bookingNumber: doc.bookingNumber || '',
        userId: customer.id || toId(doc.userId),
        customer,
        customerName: customer.name || '',
        bikeId: bike?.id || toId(doc.bikeId),
        bike,
        bikeName: bike?.name || bikeSnapshot.name || '',
        zoneId: populatedZone?.id || toId(doc.zoneId) || bike?.zoneId || null,
        categoryId: populatedCategory?.id || toId(doc.categoryId) || bike?.categoryId || null,
        categoryName,
        zoneName,
        hubName,
        locationLabel: [hubName, zoneName].filter(Boolean).join(' · ') || zoneName || hubName || '',
        status: doc.status || 'requested',
        startAt: doc.startAt,
        endAt: doc.endAt,
        actualStartAt: doc.actualStartAt,
        actualEndAt: doc.actualEndAt,
        pickupCode: doc.pickupCode || '',
        pickupCompletedAt: doc.pickupCompletedAt,
        returnRequestedAt: doc.returnRequestedAt,
        inspectionNotes: doc.inspectionNotes || '',
        cancellationReason: doc.cancellationReason || '',
        cancelledAt: doc.cancelledAt,
        cancelledBy: doc.cancelledBy || '',
        rejectionReason: doc.rejectionReason || '',
        rejectedAt: doc.rejectedAt || null,
        approvedAt: doc.approvedAt || null,
        expiresAt: doc.expiresAt,
        couponCode: doc.couponCode || '',
        couponApplied: doc.couponApplied || null,
        bookingSource: doc.bookingSource || 'app',
        rentalDurationHours: Number(doc.rentalDurationHours || 0),
        reportSnapshot: doc.reportSnapshot || null,
        money: doc.money || {},
        securityDepositPayment: doc.securityDepositPayment || {
            depositAmount: Number(doc.money?.securityDeposit || 0),
            depositStatus: Number(doc.money?.securityDeposit || 0) > 0
                ? (Number(doc.money?.depositHeld || 0) > 0 ? 'paid' : 'pending_online')
                : 'not_required',
            depositPaymentMethod: '',
            transactionId: '',
            paidAt: null,
            collectedBy: null,
            history: [],
            originalAmount: Number(doc.money?.securityDeposit || 0),
            deductedAmount: Number(doc.money?.depositCaptured || 0),
            refundableAmount: Math.max(
                0,
                Number(doc.money?.depositHeld || 0)
                    - Number(doc.money?.depositCaptured || 0)
                    - Number(doc.money?.depositRefunded || 0),
            ),
        },
        lateReturn: doc.lateReturn || null,
        cancellation: doc.cancellation || null,
        noShow: doc.noShow || null,
        depositRefund: doc.depositRefund || null,
        payment: doc.payment || {},
        paymentAttempts: Array.isArray(doc.paymentAttempts) ? doc.paymentAttempts : [],
        extensionHistory: Array.isArray(doc.extensionHistory) ? doc.extensionHistory : [],
        pendingExtension: doc.pendingExtension || null,
        reassignmentHistory: Array.isArray(doc.reassignmentHistory) ? doc.reassignmentHistory : [],
        bikeSnapshot,
        zoneSnapshot,
        quoteSnapshot: doc.quoteSnapshot || null,
        riderSnapshot: rider,
        returnNotes: doc.returnNotes || '',
        returnPhotos: Array.isArray(doc.returnPhotos) ? doc.returnPhotos : [],
        pickupInspectionId: toId(doc.pickupInspectionId),
        returnInspectionId: toId(doc.returnInspectionId),
        pickupWindowEndsAt: doc.pickupWindowEndsAt || null,
        vendorId: toId(doc.vendorId),
        ownerType: doc.ownerType || 'admin',
        statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory : [],
        rating: doc.rating || null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
};

export const mapSettings = (doc = {}) => ({
    unpaidBookingTtlMinutes: Number(doc.unpaidBookingTtlMinutes ?? 15),
    pickupWindowMinutes: Number(doc.pickupWindowMinutes ?? 30),
    cancelFeePercentAfterReserve: Number(
        doc.cancelFeePercentAfterReserve
            ?? doc.cancellationChargePercent
            ?? 10,
    ),
    freeCancelBeforePickupMinutes: Number(doc.freeCancelBeforePickupMinutes ?? 60),
    cancellationChargeType: ['percent', 'fixed'].includes(String(doc.cancellationChargeType || ''))
        ? String(doc.cancellationChargeType)
        : 'percent',
    cancellationChargePercent: Number(
        doc.cancellationChargePercent
            ?? doc.cancelFeePercentAfterReserve
            ?? 10,
    ),
    cancellationChargeFixed: Number(doc.cancellationChargeFixed ?? 200),
    lateFeePerHour: Number(doc.lateFeePerHour ?? 100),
    lateReturnGraceMinutes: Number(doc.lateReturnGraceMinutes ?? 0),
    lateReturnMaxCharge: doc.lateReturnMaxCharge == null
        ? null
        : Number(doc.lateReturnMaxCharge),
    allowWeeklyPricing: Boolean(doc.allowWeeklyPricing !== false),
    depositRefundDays: Number(doc.depositRefundDays ?? 1),
    depositRefundHours: Number(doc.depositRefundHours ?? 24),
    securityDepositPaymentMode: ['online', 'pay_at_pickup', 'both'].includes(
        String(doc.securityDepositPaymentMode || ''),
    )
        ? String(doc.securityDepositPaymentMode)
        : 'both',
    noShowPolicyEnabled: Boolean(doc.noShowPolicyEnabled !== false),
    noShowGraceMinutes: Number(
        doc.noShowGraceMinutes
            ?? doc.pickupWindowMinutes
            ?? 30,
    ),
    noShowRefundRule: ['full', 'partial', 'none'].includes(String(doc.noShowRefundRule || ''))
        ? String(doc.noShowRefundRule)
        : 'full',
    noShowRefundMode: ['percent', 'fixed'].includes(String(doc.noShowRefundMode || ''))
        ? String(doc.noShowRefundMode)
        : 'percent',
    noShowRefundPercent: Number(doc.noShowRefundPercent ?? 20),
    noShowRefundFixed: Number(doc.noShowRefundFixed ?? 500),
    noShowPenaltyAmount: Number(doc.noShowPenaltyAmount ?? 0),
    minBookingDurationHours: Number(doc.minBookingDurationHours ?? 1),
    maxBookingDurationHours: Number(doc.maxBookingDurationHours ?? 12),
    turnaroundBufferMinutes: Number(doc.turnaroundBufferMinutes ?? 30),
    supportPhone: doc.supportPhone || '',
    supportEmail: doc.supportEmail || '',
    termsHtml: doc.termsHtml || '',
    outOfServiceMessage: doc.outOfServiceMessage || '',
    defaultVendorCommissionPercent: Number(doc.defaultVendorCommissionPercent ?? 20),
    settlementDayOfMonth: Number(doc.settlementDayOfMonth ?? 0),
    documentTypes: Array.isArray(doc.documentTypes)
        ? doc.documentTypes.map((d) => ({
            key: d.key || '',
            label: d.label || '',
            active: d.active !== false,
        }))
        : [],
    updatedAt: doc.updatedAt || null,
});
