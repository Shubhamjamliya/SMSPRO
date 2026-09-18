/**
 * Restaurant onboarding resubmission helpers — mirrors category/menu previousApproved + changedFields.
 */

const DIFF_FIELDS = [
    { key: 'restaurantName', label: 'Restaurant name' },
    { key: 'ownerName', label: 'Owner name' },
    { key: 'ownerEmail', label: 'Owner email' },
    { key: 'ownerPhone', label: 'Owner phone' },
    { key: 'primaryContactNumber', label: 'Primary contact' },
    { key: 'pureVegRestaurant', label: 'Pure veg' },
    { key: 'zoneId', label: 'Zone' },
    { key: 'formattedAddress', label: 'Address' },
    { key: 'addressLine1', label: 'Address line 1' },
    { key: 'area', label: 'Area' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'pincode', label: 'Pincode' },
    { key: 'cuisines', label: 'Cuisines' },
    { key: 'openingTime', label: 'Opening time' },
    { key: 'closingTime', label: 'Closing time' },
    { key: 'openDays', label: 'Open days' },
    { key: 'panNumber', label: 'PAN number' },
    { key: 'nameOnPan', label: 'Name on PAN' },
    { key: 'gstRegistered', label: 'GST registered' },
    { key: 'gstNumber', label: 'GST number' },
    { key: 'gstLegalName', label: 'GST legal name' },
    { key: 'fssaiNumber', label: 'FSSAI number' },
    { key: 'fssaiExpiry', label: 'FSSAI expiry' },
    { key: 'accountNumber', label: 'Account number' },
    { key: 'ifscCode', label: 'IFSC code' },
    { key: 'accountHolderName', label: 'Account holder' },
    { key: 'accountType', label: 'Account type' },
    { key: 'estimatedDeliveryTime', label: 'Delivery time' },
    { key: 'featuredDish', label: 'Featured dish' },
    { key: 'offer', label: 'Offer' },
    { key: 'profileImage', label: 'Profile image' },
    { key: 'panImage', label: 'PAN image' },
    { key: 'gstImage', label: 'GST image' },
    { key: 'fssaiImage', label: 'FSSAI image' },
    { key: 'menuImages', label: 'Menu images' },
];

const toComparable = (value) => {
    if (value == null) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (item && typeof item === 'object') return String(item.url || item.publicId || item);
                return String(item || '');
            })
            .filter(Boolean)
            .sort()
            .join(', ');
    }
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
        if (value.url) return String(value.url);
        if (value._id) return String(value._id);
        return JSON.stringify(value);
    }
    return String(value).trim();
};

const readField = (doc = {}, key) => {
    const loc = doc.location && typeof doc.location === 'object' ? doc.location : {};
    switch (key) {
        case 'formattedAddress':
            return loc.formattedAddress || loc.address || doc.formattedAddress || '';
        case 'addressLine1':
            return loc.addressLine1 || doc.addressLine1 || '';
        case 'area':
            return loc.area || doc.area || '';
        case 'city':
            return loc.city || doc.city || '';
        case 'state':
            return loc.state || doc.state || '';
        case 'pincode':
            return loc.pincode || doc.pincode || '';
        case 'zoneId':
            return doc.zoneId?._id || doc.zoneId || '';
        case 'fssaiExpiry':
            return doc.fssaiExpiry ? String(doc.fssaiExpiry).slice(0, 10) : '';
        case 'cuisines':
        case 'openDays':
        case 'menuImages':
            return Array.isArray(doc[key]) ? doc[key] : [];
        default:
            return doc[key];
    }
};

export function buildRestaurantSubmissionSnapshot(doc = {}) {
    const snapshot = {};
    for (const { key } of DIFF_FIELDS) {
        const value = readField(doc, key);
        if (key === 'menuImages') {
            snapshot[key] = Array.isArray(value)
                ? value.map((item) => (typeof item === 'string' ? item : item?.url || '')).filter(Boolean)
                : [];
        } else if (['profileImage', 'panImage', 'gstImage', 'fssaiImage'].includes(key)) {
            snapshot[key] = typeof value === 'string' ? value : (value?.url || '');
        } else if (key === 'zoneId') {
            snapshot[key] = value ? String(value) : '';
        } else if (key === 'pureVegRestaurant' || key === 'gstRegistered') {
            snapshot[key] = Boolean(value);
        } else if (Array.isArray(value)) {
            snapshot[key] = value.map((item) => String(item || '').trim()).filter(Boolean);
        } else if (value == null) {
            snapshot[key] = '';
        } else {
            snapshot[key] = value;
        }
    }
    snapshot.capturedAt = new Date();
    return snapshot;
}

export function buildRestaurantChangedFields(current = {}, previous = null) {
    if (!previous || typeof previous !== 'object') return [];

    const changed = [];
    for (const { key, label } of DIFF_FIELDS) {
        const beforeRaw = previous[key];
        const afterRaw = readField(current, key);
        const before = toComparable(beforeRaw);
        const after = toComparable(
            ['profileImage', 'panImage', 'gstImage', 'fssaiImage'].includes(key)
                ? (typeof afterRaw === 'string' ? afterRaw : afterRaw?.url || '')
                : key === 'menuImages'
                    ? (Array.isArray(afterRaw)
                        ? afterRaw.map((item) => (typeof item === 'string' ? item : item?.url || '')).filter(Boolean)
                        : [])
                    : afterRaw
        );

        if (before !== after) {
            changed.push({
                field: key,
                label,
                before: before || '—',
                after: after || '—',
            });
        }
    }
    return changed;
}

export function appendRestaurantStatusHistory(doc, entry = {}) {
    if (!doc) return;
    if (!Array.isArray(doc.statusHistory)) doc.statusHistory = [];
    doc.statusHistory.push({
        action: entry.action,
        note: entry.note || '',
        changedAt: entry.changedAt || new Date(),
        changedBy: entry.changedBy || null,
    });
}

/**
 * Freeze the rejected submission as the admin "before" baseline.
 * Must run BEFORE any edit/resubmit field updates, otherwise diffs are empty.
 */
export function ensureRestaurantResubmitBaseline(doc) {
    if (!doc) return null;
    if (doc.previousSubmission && typeof doc.previousSubmission === 'object') {
        return doc.previousSubmission;
    }
    const snapshot = buildRestaurantSubmissionSnapshot(doc);
    doc.previousSubmission = snapshot;
    return snapshot;
}

export function serializeRestaurantOnboardingForAdmin(doc = {}) {
    const previousSubmission = doc.previousSubmission || null;
    const changedFields = buildRestaurantChangedFields(doc, previousSubmission);
    const status = String(doc.status || '').trim();
    const isResubmission = status === 'pending' && Boolean(previousSubmission);

    return {
        ...doc,
        name: doc.restaurantName || doc.name || '',
        restaurantName: doc.restaurantName || doc.name || '',
        previousSubmission,
        changedFields,
        isResubmission,
        isNewSubmission: status === 'pending' && !previousSubmission,
        changedFieldCount: changedFields.length,
    };
}
