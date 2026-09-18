// Shared between the admin fee-settings service (public listing) and the
// order pricing service (fee calculation), so both agree on what a store
// shows before an admin has configured anything yet.
export const DEFAULT_DELIVERY_SPEED_OPTIONS = [
    {
        code: 'eco',
        label: 'Eco',
        description: 'Budget-friendly, slower delivery',
        etaMinutesMin: 45,
        etaMinutesMax: 60,
        extraFee: 0,
        isDefault: false,
        isActive: true,
        sortOrder: 0,
    },
    {
        code: 'standard',
        label: 'Standard',
        description: 'Regular delivery speed',
        etaMinutesMin: 30,
        etaMinutesMax: 40,
        extraFee: 0,
        isDefault: true,
        isActive: true,
        sortOrder: 1,
    },
    {
        code: 'express',
        label: 'Express',
        description: 'Priority pickup, fastest delivery',
        etaMinutesMin: 15,
        etaMinutesMax: 25,
        extraFee: 19,
        isDefault: false,
        isActive: true,
        sortOrder: 2,
    },
];

export function getStoredDeliverySpeedOptions(feeDoc) {
    const configured = Array.isArray(feeDoc?.deliverySpeedOptions) ? feeDoc.deliverySpeedOptions : [];
    return configured
        .filter((option) => option?.isActive !== false)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

// Returns the admin-configured options if any exist, otherwise the built-in
// defaults above - so the feature works out of the box before an admin
// visits the Delivery Speed Options page.
export function resolveDeliverySpeedOptions(feeDoc) {
    const stored = getStoredDeliverySpeedOptions(feeDoc);
    const source = stored.length > 0 ? stored : DEFAULT_DELIVERY_SPEED_OPTIONS;
    return [...source].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

export function hasConfiguredDeliverySpeedOptions(feeDoc) {
    const configured = Array.isArray(feeDoc?.deliverySpeedOptions) ? feeDoc.deliverySpeedOptions : [];
    return configured.some((option) => option?.isActive !== false);
}

export function formatPublicDeliverySpeedOption(option = {}) {
    return {
        code: option.code,
        label: option.label,
        description: option.description || '',
        etaMinutesMin: option.etaMinutesMin,
        etaMinutesMax: option.etaMinutesMax,
        extraFee: Number(option.extraFee || 0),
        isDefault: Boolean(option.isDefault),
    };
}

export function pickDeliverySpeedOption(options, code) {
    const list = Array.isArray(options) ? options : [];
    const normalizedCode = String(code || '').trim().toLowerCase();
    return (
        list.find((option) => option.code === normalizedCode) ||
        list.find((option) => option.isDefault) ||
        list[0] ||
        null
    );
}
