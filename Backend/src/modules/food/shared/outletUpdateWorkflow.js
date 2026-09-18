/**
 * Outlet Info update approval helpers — pendingUpdates vs live restaurant fields.
 * Approval-required: Address, Legal & Compliance, Bank Account.
 */

const toComparable = (value) => {
    if (value == null) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean).sort().join(', ');
    }
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
        if (value.formattedAddress || value.address) {
            return String(value.formattedAddress || value.address || '').trim();
        }
        if (value.url) return String(value.url);
        if (value._id) return String(value._id);
        return JSON.stringify(value);
    }
    return String(value).trim();
};

const formatAddress = (doc = {}) => {
    const loc = doc.location && typeof doc.location === 'object' ? doc.location : {};
    return (
        loc.formattedAddress ||
        loc.address ||
        [loc.addressLine1 || doc.addressLine1, loc.area || doc.area, loc.city || doc.city, loc.state || doc.state, loc.pincode || doc.pincode]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(', ')
    );
};

const pushChange = (changed, field, label, beforeRaw, afterRaw) => {
    const before = toComparable(beforeRaw);
    const after = toComparable(afterRaw);
    if (before === after) return;
    changed.push({
        field,
        label,
        before: before || '—',
        after: after || '—',
    });
};

export function buildOutletUpdateChangedFields(restaurant = {}, pendingUpdates = null) {
    const pending = pendingUpdates && typeof pendingUpdates === 'object' ? pendingUpdates : null;
    if (!pending) return [];

    const changed = [];

    if (Object.prototype.hasOwnProperty.call(pending, 'location') || pending.addressLine1 !== undefined) {
        pushChange(
            changed,
            'location',
            'Outlet address',
            formatAddress(restaurant),
            pending.location
                ? formatAddress({ location: pending.location, ...pending })
                : formatAddress(pending)
        );
    }

    if (Object.prototype.hasOwnProperty.call(pending, 'zoneId')) {
        pushChange(changed, 'zoneId', 'Zone', restaurant.zoneId?._id || restaurant.zoneId, pending.zoneId);
    }

    // Legal & Compliance
    if (Object.prototype.hasOwnProperty.call(pending, 'fssaiNumber')) {
        pushChange(changed, 'fssaiNumber', 'FSSAI number', restaurant.fssaiNumber, pending.fssaiNumber);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'fssaiExpiry')) {
        pushChange(changed, 'fssaiExpiry', 'FSSAI expiry', restaurant.fssaiExpiry, pending.fssaiExpiry);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'fssaiImage')) {
        pushChange(
            changed,
            'fssaiImage',
            'FSSAI document',
            restaurant.fssaiImage?.url || restaurant.fssaiImage,
            pending.fssaiImage
        );
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'panNumber')) {
        pushChange(changed, 'panNumber', 'PAN number', restaurant.panNumber, pending.panNumber);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'nameOnPan')) {
        pushChange(changed, 'nameOnPan', 'Name on PAN', restaurant.nameOnPan, pending.nameOnPan);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'panImage')) {
        pushChange(changed, 'panImage', 'PAN image', restaurant.panImage?.url || restaurant.panImage, pending.panImage);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'gstRegistered')) {
        pushChange(changed, 'gstRegistered', 'GST registered', Boolean(restaurant.gstRegistered), Boolean(pending.gstRegistered));
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'gstNumber')) {
        pushChange(changed, 'gstNumber', 'GST number', restaurant.gstNumber, pending.gstNumber);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'gstLegalName')) {
        pushChange(changed, 'gstLegalName', 'GST legal name', restaurant.gstLegalName, pending.gstLegalName);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'gstAddress')) {
        pushChange(changed, 'gstAddress', 'GST address', restaurant.gstAddress, pending.gstAddress);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'gstImage')) {
        pushChange(changed, 'gstImage', 'GST image', restaurant.gstImage?.url || restaurant.gstImage, pending.gstImage);
    }

    // Bank Account
    if (Object.prototype.hasOwnProperty.call(pending, 'accountHolderName')) {
        pushChange(changed, 'accountHolderName', 'Account holder', restaurant.accountHolderName, pending.accountHolderName);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'accountNumber')) {
        pushChange(changed, 'accountNumber', 'Account number', restaurant.accountNumber, pending.accountNumber);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'ifscCode')) {
        pushChange(changed, 'ifscCode', 'IFSC code', restaurant.ifscCode, pending.ifscCode);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'accountType')) {
        pushChange(changed, 'accountType', 'Account type', restaurant.accountType, pending.accountType);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'upiId')) {
        pushChange(changed, 'upiId', 'UPI ID', restaurant.upiId, pending.upiId);
    }
    if (Object.prototype.hasOwnProperty.call(pending, 'upiQrImage')) {
        pushChange(
            changed,
            'upiQrImage',
            'UPI QR',
            restaurant.upiQrImage?.url || restaurant.upiQrImage,
            pending.upiQrImage
        );
    }

    return changed;
}

export function serializeOutletUpdateForAdmin(doc = {}) {
    const pendingUpdateStatus = String(doc.pendingUpdateStatus || 'none').trim();
    const pendingUpdates = doc.pendingUpdates || null;
    const changedFields = buildOutletUpdateChangedFields(doc, pendingUpdates);
    const isOutletUpdatePending = pendingUpdateStatus === 'pending';
    const isOutletUpdateRejected = pendingUpdateStatus === 'rejected';

    return {
        ...doc,
        name: doc.restaurantName || doc.name || '',
        restaurantName: doc.restaurantName || doc.name || '',
        pendingUpdateStatus,
        pendingUpdates,
        pendingUpdateReason: doc.pendingUpdateReason || '',
        pendingUpdateRequestedAt: doc.pendingUpdateRequestedAt || null,
        outletChangedFields: changedFields,
        changedFields: Array.isArray(doc.changedFields) && doc.changedFields.length
            ? doc.changedFields
            : changedFields,
        isOutletUpdate: isOutletUpdatePending || isOutletUpdateRejected,
        isOutletUpdatePending,
        isOutletUpdateRejected,
        requestType: isOutletUpdatePending || isOutletUpdateRejected
            ? 'outlet_update'
            : (doc.requestType || 'joining'),
    };
}
