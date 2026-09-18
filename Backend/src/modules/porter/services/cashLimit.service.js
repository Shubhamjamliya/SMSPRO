import { ValidationError } from '../../../core/auth/errors.js';

/**
 * Porter COD cash uses the shared delivery cash limit (same Driver + Pocket deposits as food).
 * available = deliveryCashLimit − (food COD cash + porter cash held)
 */

export async function getPorterDriverCashAvailability(driverId) {
    const { getDeliveryPartnerWalletEnhanced } = await import(
        '../../food/delivery/services/deliveryFinance.service.js'
    );
    const wallet = await getDeliveryPartnerWalletEnhanced(driverId);
    return {
        totalCashLimit: Number(wallet.totalCashLimit || 0),
        cashInHand: Number(wallet.cashInHand || 0),
        availableCashLimit: Number(wallet.availableCashLimit || 0),
        canCollectCash: Number(wallet.availableCashLimit || 0) > 0
            && Number(wallet.totalCashLimit || 0) > 0,
    };
}

/**
 * Skip COD offers when remaining limit cannot cover the trip value.
 */
export async function canOfferPorterCodToDriver(driverId, orderAmount) {
    const need = Math.max(0, Number(orderAmount || 0));
    const info = await getPorterDriverCashAvailability(driverId);
    if (!(info.totalCashLimit > 0)) return false;
    if (need <= 0) return info.availableCashLimit > 0;
    return info.availableCashLimit + 0.009 >= need;
}

export async function assertCanCollectPorterCash(driverId, amount) {
    const need = Math.max(0, Number(amount || 0));
    if (!(need > 0)) return;
    const info = await getPorterDriverCashAvailability(driverId);
    if (!(info.totalCashLimit > 0)) {
        throw new ValidationError(
            'Cash collection is blocked. Delivery cash limit is not configured. Contact admin.',
        );
    }
    if (info.availableCashLimit + 0.009 < need) {
        throw new ValidationError(
            `Cash limit exceeded. Available ₹${Math.round(info.availableCashLimit)}, this collection needs ₹${Math.round(need)}. Deposit cash first.`,
        );
    }
    return info;
}

export async function enforcePorterDriverCashLimitAfterCollect(driverId) {
    try {
        const { enforceCashLimitForAllOnlinePartners } = await import(
            '../../food/orders/services/order-dispatch.service.js'
        );
        await enforceCashLimitForAllOnlinePartners();
    } catch {
        // Non-fatal — trip already collected
        try {
            const info = await getPorterDriverCashAvailability(driverId);
            if (info.totalCashLimit === 0 || info.availableCashLimit <= 0) {
                const { Driver } = await import('../../../core/models/driver.model.js');
                await Driver.updateOne(
                    { _id: driverId, availabilityStatus: 'online' },
                    { $set: { availabilityStatus: 'offline' } },
                );
            }
        } catch {
            /* ignore */
        }
    }
}
