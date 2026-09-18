/**
 * Quick sanity checks for late return billing calculator.
 * Run: node scripts/test-late-billing.js
 */
import { calculateLateReturnCharges } from '../src/modules/bike-rent/services/lateBilling.service.js';

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const base = {
    scheduledReturnTime: '2026-07-22T14:00:00.000Z',
    hourlyCharge: 100,
    securityDeposit: 2000,
    gracePeriodMinutes: 0,
};

{
    const r = calculateLateReturnCharges({
        ...base,
        actualReturnTime: '2026-07-22T15:00:00.000Z',
    });
    assert(r.extraHours === 1, '1 hour late → 1 billable hour');
    assert(r.totalLateCharge === 100, '1 × 100 = 100');
    assert(r.depositDeduction === 100, 'deduct from deposit');
    assert(r.refundableAmount === 1900, 'refundable 1900');
    assert(r.remainingPayable === 0, 'no remaining');
}

{
    const r = calculateLateReturnCharges({
        ...base,
        securityDeposit: 200,
        actualReturnTime: '2026-07-22T19:00:00.000Z',
    });
    assert(r.extraHours === 5, '5 hours late');
    assert(r.totalLateCharge === 500, '5 × 100');
    assert(r.depositDeduction === 200, 'cap at deposit');
    assert(r.remainingPayable === 300, 'remaining 300');
    assert(r.refundableAmount === 0, 'no refund');
}

{
    const r = calculateLateReturnCharges({
        ...base,
        gracePeriodMinutes: 15,
        actualReturnTime: '2026-07-22T14:10:00.000Z',
    });
    assert(r.isLate === false, 'within grace → not late');
    assert(r.totalLateCharge === 0, 'no charge in grace');
}

{
    const r = calculateLateReturnCharges({
        ...base,
        actualReturnTime: '2026-07-22T14:01:00.000Z',
    });
    assert(r.extraHours === 1, '1 minute late bills as 1 hour');
}

{
    const r = calculateLateReturnCharges({
        ...base,
        maxLateCharge: 250,
        actualReturnTime: '2026-07-22T18:00:00.000Z',
    });
    assert(r.totalLateCharge === 250, 'max cap applied');
}

console.log('late billing tests passed');
