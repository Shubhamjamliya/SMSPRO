/**
 * Sanity checks for bike rental cancellation refund calculator.
 * Run: node scripts/test-cancellation-billing.js
 */
import { calculateCancellationRefund } from '../src/modules/bike-rent/services/cancellation.service.js';

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const pickup = new Date('2026-07-22T17:00:00.000Z'); // 5:00 PM UTC for test

{
    // Free cancel 1h before pickup → free until 4:00 PM
    const r = calculateCancellationRefund({
        cancellationTime: new Date('2026-07-22T15:30:00.000Z'),
        pickupTime: pickup,
        bookingStatus: 'reserved',
        rentalFee: 1500,
        totalPaid: 3500,
        depositHeld: 2000,
        freeCancelBeforePickupMinutes: 60,
        cancellationChargeType: 'fixed',
        cancellationChargeFixed: 200,
    });
    assert(r.withinFreeWindow === true, '3:30 is within free window');
    assert(r.cancellationCharge === 0, 'no charge in free window');
    assert(r.securityDepositRefund === 2000, 'full deposit refund');
    assert(r.rentalRefund === 1500, 'full rental refund');
    assert(r.walletCreditAmount === 3500, 'full wallet credit');
}

{
    const r = calculateCancellationRefund({
        cancellationTime: new Date('2026-07-22T16:30:00.000Z'),
        pickupTime: pickup,
        bookingStatus: 'reserved',
        rentalFee: 1500,
        totalPaid: 3500,
        depositHeld: 2000,
        freeCancelBeforePickupMinutes: 60,
        cancellationChargeType: 'fixed',
        cancellationChargeFixed: 200,
    });
    assert(r.withinFreeWindow === false, '4:30 is after free window');
    assert(r.cancellationCharge === 200, 'fixed charge applied');
    assert(r.securityDepositRefund === 2000, 'deposit still refunded');
    assert(r.rentalRefund === 1300, 'rental minus fee');
    assert(r.walletCreditAmount === 3300, 'net wallet credit');
}

{
    const r = calculateCancellationRefund({
        cancellationTime: new Date('2026-07-22T16:30:00.000Z'),
        pickupTime: pickup,
        bookingStatus: 'reserved',
        rentalFee: 1000,
        totalPaid: 1000,
        depositHeld: 0,
        freeCancelBeforePickupMinutes: 60,
        cancellationChargeType: 'percent',
        cancellationChargePercent: 10,
    });
    assert(r.cancellationCharge === 100, '10% of rental');
    assert(r.rentalRefund === 900, 'net rental refund');
}

{
    const r = calculateCancellationRefund({
        cancellationTime: new Date(),
        pickupTime: pickup,
        bookingStatus: 'payment_pending',
        rentalFee: 1500,
        totalPaid: 0,
        depositHeld: 0,
        freeCancelBeforePickupMinutes: 60,
        cancellationChargeType: 'fixed',
        cancellationChargeFixed: 200,
    });
    assert(r.cancellationCharge === 0, 'pre-payment always free');
    assert(r.walletCreditAmount === 0, 'nothing to refund');
}

console.log('cancellation billing tests passed');
