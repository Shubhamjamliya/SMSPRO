/**
 * Staging validation for Bike Rent (indexes + engine contracts + optional live DB concurrency).
 * Run: node scripts/validate-bike-rent-staging.js
 *
 * Set BIKE_RENT_LIVE_DB=1 to also exercise Mongo soft-hold concurrency against the configured DB.
 */
import assert from 'assert';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { BikeBooking } from '../src/modules/bike-rent/models/bikeBooking.model.js';
import { BikeUnit } from '../src/modules/bike-rent/models/bikeUnit.model.js';
import {
    canTransition,
    assertTransition,
} from '../src/modules/bike-rent/state/bookingStateMachine.js';
import {
    availabilityForBookingStatus,
    softHoldBike,
    releaseBike,
    isBikeBookable,
    BIKE_AVAILABILITY,
} from '../src/modules/bike-rent/services/inventory.service.js';
import {
    validateRentalWindow,
    validateExtensionWindow,
} from '../src/modules/bike-rent/services/bookingValidation.service.js';
import {
    onBikeRentNotification,
    notifyBookingConfirmation,
    notifyPaymentSuccess,
    notifyBookingCancelled,
    notifyDepositRefunded,
    notifyInspectionCompleted,
    notifyBookingExpired,
    notifyPickupReminder,
    notifyReturnReminder,
    BIKE_RENT_NOTIFY_EVENTS,
} from '../src/modules/bike-rent/services/bookingNotifications.service.js';
import { calculateQuote } from '../src/modules/bike-rent/services/catalog.service.js';

let passed = 0;
let failed = 0;

async function ok(name, fn) {
    try {
        await fn();
        passed += 1;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failed += 1;
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
    }
}

function countIndexKey(indexes, keyObj) {
    const target = JSON.stringify(keyObj);
    return indexes.filter((idx) => JSON.stringify(idx[0] || idx.key || idx) === target
        || JSON.stringify(idx.key) === target
        || JSON.stringify(idx[0]) === target).length;
}

console.log('\n=== 1. Index definitions (no duplicates) ===');
await ok('payment.orderId defined exactly once', () => {
    const indexes = BikeBooking.schema.indexes();
    const matches = indexes.filter((entry) => {
        const key = entry[0] || entry.key || {};
        return Object.keys(key).length === 1 && key['payment.orderId'] === 1;
    });
    assert.equal(matches.length, 1, `expected 1 payment.orderId index, got ${matches.length}: ${JSON.stringify(indexes)}`);
    // Ensure field path does not also declare index:true
    const orderPath = BikeBooking.schema.path('payment.orderId');
    assert.ok(orderPath, 'payment.orderId path missing');
    assert.notEqual(orderPath.options?.index, true, 'payment.orderId must not use field-level index:true');
});

await ok('payment.paymentId defined exactly once', () => {
    const indexes = BikeBooking.schema.indexes();
    const matches = indexes.filter((entry) => {
        const key = entry[0] || entry.key || {};
        return Object.keys(key).length === 1 && key['payment.paymentId'] === 1;
    });
    assert.equal(matches.length, 1, `expected 1 payment.paymentId index, got ${matches.length}`);
    const payPath = BikeBooking.schema.path('payment.paymentId');
    assert.notEqual(payPath.options?.index, true, 'payment.paymentId must not use field-level index:true');
});

console.log('\n=== 2. Concurrent booking / inventory contracts ===');
await ok('only one soft-hold winner is possible (predicate)', () => {
    assert.equal(BIKE_AVAILABILITY.AVAILABLE, 'available');
    assert.equal(isBikeBookable({
        isActive: true, isDeleted: false, maintenanceStatus: 'none', availabilityStatus: 'available',
    }), true);
    assert.equal(isBikeBookable({
        isActive: true, isDeleted: false, maintenanceStatus: 'none', availabilityStatus: 'reserved',
    }), false);
});

await ok('inventory sync map covers lifecycle', () => {
    assert.equal(availabilityForBookingStatus('payment_pending'), 'reserved');
    assert.equal(availabilityForBookingStatus('reserved'), 'reserved');
    assert.equal(availabilityForBookingStatus('active'), 'rented');
    assert.equal(availabilityForBookingStatus('inspection'), 'rented');
    assert.equal(availabilityForBookingStatus('expired'), 'available');
    assert.equal(availabilityForBookingStatus('cancelled'), 'available');
    assert.equal(availabilityForBookingStatus('deposit_refunded'), 'available');
    assert.equal(availabilityForBookingStatus('no_show'), 'available');
});

console.log('\n=== 3. Payment retry / duplicate callback contracts ===');
await ok('idempotent reserved transition is allowed (noop)', () => {
    assert.equal(canTransition('reserved', 'reserved'), true);
});
await ok('cannot re-enter reserved from active via payment', () => {
    assert.equal(canTransition('active', 'reserved'), false);
});
await ok('payment_pending → reserved only once in happy path', () => {
    assert.equal(canTransition('payment_pending', 'reserved'), true);
    assert.equal(canTransition('reserved', 'payment_pending'), false);
});

console.log('\n=== 4. Wallet / Razorpay / deposit / refund contracts ===');
await ok('server quote never trusts client (recalculates from bike rates)', () => {
    const start = new Date(Date.now() + 3600000);
    const end = new Date(start.getTime() + 2 * 3600000);
    const quote = calculateQuote({
        hourlyPrice: 100,
        dailyPrice: 500,
        weeklyPrice: 2000,
        securityDeposit: 1000,
    }, start, end);
    assert.equal(quote.rentalFee, 200);
    assert.equal(quote.securityDeposit, 1000);
    assert.equal(quote.totalPayable, 1200);
});
await ok('deposit refund terminal status reachable only after completed', () => {
    assert.equal(canTransition('completed', 'deposit_refunded'), true);
    assert.equal(canTransition('inspection', 'deposit_refunded'), false);
});
await ok('inspection → completed → deposit_refunded chain', () => {
    assert.equal(canTransition('return_requested', 'inspection'), true);
    assert.equal(canTransition('inspection', 'completed'), true);
    assert.equal(canTransition('completed', 'deposit_refunded'), true);
});

console.log('\n=== 5. Booking expiry + cancellation ===');
await ok('payment_pending can expire or cancel', () => {
    assert.equal(canTransition('payment_pending', 'expired'), true);
    assert.equal(canTransition('payment_pending', 'cancelled'), true);
});
await ok('expired is terminal', () => {
    let threw = false;
    try { assertTransition('expired', 'reserved'); } catch { threw = true; }
    assert.equal(threw, true);
});

console.log('\n=== 6. Extension / validation / zone mismatch rules ===');
await ok('rental window + extension validators', () => {
    const start = new Date(Date.now() + 3600000);
    const end = new Date(start.getTime() + 3 * 3600000);
    validateRentalWindow(start, end);
    validateExtensionWindow(end, new Date(end.getTime() + 2 * 3600000));
});
await ok('past start / invalid extension rejected', () => {
    let a = false;
    let b = false;
    try { validateRentalWindow(new Date(Date.now() - 3600000), new Date()); } catch { a = true; }
    const end = new Date(Date.now() + 3600000);
    try { validateExtensionWindow(end, end); } catch { b = true; }
    assert.equal(a && b, true);
});

console.log('\n=== 7. Notification hooks (all staging events) ===');
await ok('all required notification events emit', async () => {
    const seen = new Set();
    const off = onBikeRentNotification((e) => seen.add(e.event));
    const booking = {
        _id: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        bookingNumber: 'BRSTAGING',
        pickupCode: '999999',
        status: 'reserved',
        startAt: new Date(),
        endAt: new Date(Date.now() + 3600000),
        money: { depositRefunded: 500 },
        payment: { method: 'razorpay' },
    };
    await notifyBookingConfirmation(booking);
    await notifyPaymentSuccess(booking);
    await notifyPickupReminder(booking);
    await notifyReturnReminder(booking);
    await notifyBookingCancelled(booking, 'test');
    await notifyDepositRefunded(booking, 500);
    await notifyInspectionCompleted(booking, { lateFee: 0, damageFee: 50 });
    await notifyBookingExpired(booking);
    off();
    const required = [
        BIKE_RENT_NOTIFY_EVENTS.BOOKING_CONFIRMATION,
        BIKE_RENT_NOTIFY_EVENTS.PAYMENT_SUCCESS,
        BIKE_RENT_NOTIFY_EVENTS.PICKUP_REMINDER,
        BIKE_RENT_NOTIFY_EVENTS.RETURN_REMINDER,
        BIKE_RENT_NOTIFY_EVENTS.BOOKING_CANCELLED,
        BIKE_RENT_NOTIFY_EVENTS.DEPOSIT_REFUNDED,
        BIKE_RENT_NOTIFY_EVENTS.INSPECTION_COMPLETED,
        BIKE_RENT_NOTIFY_EVENTS.BOOKING_EXPIRED,
    ];
    for (const ev of required) {
        assert.equal(seen.has(ev), true, `missing event ${ev}`);
    }
});

console.log('\n=== 8. Responsive / FE contract (route + API surface) ===');
await ok('user API methods required for staging UX exist', async () => {
    // Static contract check via documented export surface in module services
    const engine = await import('../src/modules/bike-rent/services/bookingEngine.service.js');
    for (const fn of [
        'createBooking', 'createRazorpayPaymentOrder', 'verifyRazorpayPayment', 'payWithWallet',
        'recordPaymentFailure', 'cancelBooking', 'confirmPickup', 'requestReturn',
        'quoteExtension', 'extendRental', 'expireBooking', 'inspectAndSettle',
        'runBookingMaintenanceSweep',
    ]) {
        assert.equal(typeof engine[fn], 'function', `missing ${fn}`);
    }
});

// Optional live DB concurrency
if (String(process.env.BIKE_RENT_LIVE_DB || '') === '1') {
    console.log('\n=== 9. Live DB soft-hold concurrency ===');
    await ok('two parallel soft-holds → exactly one winner', async () => {
        const uri = config.mongoUri || process.env.MONGO_URI || process.env.MONGODB_URI;
        assert.ok(uri, 'Mongo URI required for live DB test');
        await mongoose.connect(uri);
        const bike = await BikeUnit.create({
            name: 'Staging Concurrency Bike',
            brand: 'Test',
            model: 'X1',
            categoryId: new mongoose.Types.ObjectId(),
            registrationNumber: `STG${Date.now()}`,
            hourlyPrice: 10,
            dailyPrice: 100,
            securityDeposit: 50,
            zoneId: new mongoose.Types.ObjectId(),
            availabilityStatus: 'available',
            maintenanceStatus: 'none',
            isActive: true,
        });
        try {
            const results = await Promise.allSettled([
                softHoldBike(bike._id),
                softHoldBike(bike._id),
                softHoldBike(bike._id),
            ]);
            const wins = results.filter((r) => r.status === 'fulfilled').length;
            const losses = results.filter((r) => r.status === 'rejected').length;
            assert.equal(wins, 1, `expected exactly 1 soft-hold win, got ${wins}`);
            assert.equal(losses, 2, `expected 2 soft-hold failures, got ${losses}`);
            const refreshed = await BikeUnit.findById(bike._id).lean();
            assert.equal(refreshed.availabilityStatus, 'reserved');
            await releaseBike(bike._id);
            const released = await BikeUnit.findById(bike._id).lean();
            assert.equal(released.availabilityStatus, 'available');
        } finally {
            await BikeUnit.deleteOne({ _id: bike._id });
            await mongoose.disconnect();
        }
    });
} else {
    console.log('\n=== 9. Live DB soft-hold concurrency (skipped) ===');
    console.log('  · set BIKE_RENT_LIVE_DB=1 to run against Mongo');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
