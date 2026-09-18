/**
 * Sanity checks for no-show policy calculator.
 * Run: node scripts/test-no-show-policy.js
 */
import { calculateNoShowRefund, buildNoShowPolicyMessage } from '../src/modules/bike-rent/services/noShowPolicy.service.js';

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const pickup = new Date('2026-07-22T12:00:00.000Z');

{
    const r = calculateNoShowRefund({
        pickupTime: pickup,
        now: new Date('2026-07-22T12:20:00.000Z'),
        graceMinutes: 30,
        depositHeld: 2000,
        refundRule: 'full',
    });
    assert(r.isEligible === false, 'within grace — not eligible');
}

{
    const r = calculateNoShowRefund({
        pickupTime: pickup,
        now: new Date('2026-07-22T12:31:00.000Z'),
        graceMinutes: 30,
        depositHeld: 2000,
        refundRule: 'full',
    });
    assert(r.isEligible === true, 'past grace — eligible');
    assert(r.depositRefund === 2000, 'full refund');
    assert(r.walletCreditAmount === 2000, 'wallet credit 2000');
}

{
    const r = calculateNoShowRefund({
        pickupTime: pickup,
        now: new Date('2026-07-22T12:31:00.000Z'),
        graceMinutes: 30,
        depositHeld: 2000,
        refundRule: 'partial',
        refundMode: 'percent',
        refundPercent: 50,
    });
    assert(r.depositRefund === 1000, '50% refund');
    assert(r.depositCaptured === 1000, '50% retained');
}

{
    const r = calculateNoShowRefund({
        pickupTime: pickup,
        now: new Date('2026-07-22T12:31:00.000Z'),
        graceMinutes: 30,
        depositHeld: 2000,
        refundRule: 'none',
    });
    assert(r.depositRefund === 0, 'no refund');
    assert(r.depositCaptured === 2000, 'full retained');
}

{
    const r = calculateNoShowRefund({
        pickupTime: pickup,
        now: new Date('2026-07-22T12:31:00.000Z'),
        graceMinutes: 30,
        depositHeld: 2000,
        refundRule: 'full',
        penaltyAmount: 200,
    });
    assert(r.depositRefund === 1800, 'full after penalty');
    assert(r.penaltyAmount === 200, 'penalty applied');
}

{
    const msg = buildNoShowPolicyMessage({ graceMinutes: 30, refundRule: 'full' });
    assert(msg.includes('30 minutes'), 'message includes grace');
}

console.log('no-show policy tests passed');
