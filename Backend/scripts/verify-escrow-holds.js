/**
 * Phase 0 acceptance test — escrow holds against a real database.
 *
 * Proves the guarantees the construction module's payment model rests on:
 *
 *   1  A hold reserves money without moving it
 *   2  Held money is NOT spendable through the shared debit path
 *      (this is the cross-module regression: food/taxi/porter/quick/bike-rent
 *       and service-provider all debit through `deductWalletBalance`)
 *   3  Unheld money IS still spendable
 *   4  A release pays the payee exactly once, even when retried
 *   5  A refund returns money to spendable without paying anyone
 *   6  held === released + refunded + outstanding, always
 *   7  The ledger is append-only and cannot be edited or deleted
 *
 * Creates a synthetic user, runs against real collections, and removes
 * everything it created. Safe on staging. Do not run against production.
 *
 * Run: node scripts/verify-escrow-holds.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodUserWallet } from '../src/modules/food/user/models/userWallet.model.js';
import { deductWalletBalance } from '../src/modules/food/user/services/userWallet.service.js';
import { Transaction } from '../src/core/payments/models/transaction.model.js';
import { ConstructionContractorWallet } from '../src/core/payments/models/contractorWallet.model.js';
import { WalletHold } from '../src/core/wallet/models/walletHold.model.js';
import { WalletHoldLedger } from '../src/core/wallet/models/walletHoldLedger.model.js';
import {
    createHold,
    releaseHold,
    refundHold,
    getAvailableBalance,
    reconcileHold,
    reconcileUserLock,
} from '../src/core/wallet/hold.service.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;

const USER_ID = new mongoose.Types.ObjectId();
const CONTRACTOR_ID = new mongoose.Types.ObjectId();
const PROJECT_ID = new mongoose.Types.ObjectId();
const MODULE = 'construction';
const REF_TYPE = 'construction_project';

let passed = 0;
let failed = 0;

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

function check(label, actual, expected) {
    const ok = money(actual) === money(expected);
    console.log(`${ok ? '  ✓' : '  ✗'} ${label}: ${money(actual)}${ok ? '' : ` (expected ${money(expected)})`}`);
    if (ok) passed += 1; else failed += 1;
}

function assertTrue(label, condition) {
    console.log(`${condition ? '  ✓' : '  ✗'} ${label}`);
    if (condition) passed += 1; else failed += 1;
}

async function walletState() {
    const w = await FoodUserWallet.findOne({ userId: USER_ID }).select('balance lockedAmount').lean();
    return { balance: money(w?.balance), locked: money(w?.lockedAmount) };
}

async function expectRejection(label, fn) {
    try {
        await fn();
        console.log(`  ✗ ${label} — expected a rejection but it SUCCEEDED`);
        failed += 1;
    } catch {
        console.log(`  ✓ ${label}`);
        passed += 1;
    }
}

async function run() {
    if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
    console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
    await mongoose.connect(mongoUrl);
    console.log('Connected.\n');

    // ---- setup: a wallet with ₹100,000 -------------------------------------
    await FoodUserWallet.create({ userId: USER_ID, balance: 100000, transactions: [] });
    console.log('1. Funded synthetic wallet with ₹100,000');
    check('balance', (await walletState()).balance, 100000);
    check('available', (await getAvailableBalance(USER_ID)).availableBalance, 100000);

    // ---- 1. a hold reserves without moving ---------------------------------
    console.log('\n2. Hold ₹60,000 for a project');
    const held = await createHold({
        userId: USER_ID,
        module: MODULE,
        refType: REF_TYPE,
        refId: PROJECT_ID,
        amount: 60000,
        reference: `project_fund_${PROJECT_ID}_1`,
        reason: 'Project funding',
    });
    const afterHold = await walletState();
    check('balance unchanged', afterHold.balance, 100000);
    check('lockedAmount', afterHold.locked, 60000);
    check('available', (await getAvailableBalance(USER_ID)).availableBalance, 40000);
    check('hold outstanding', held.hold.outstanding, 60000);

    // ---- 2. held money is not spendable elsewhere --------------------------
    console.log('\n3. Cross-module spend guard (the regression that matters)');
    await expectRejection(
        'a ₹50,000 debit is REFUSED (only ₹40,000 available)',
        () => deductWalletBalance(USER_ID, 50000, 'Food order', { orderId: `test_food_${Date.now()}` }),
    );

    // ---- 3. unheld money is still spendable --------------------------------
    await deductWalletBalance(USER_ID, 10000, 'Food order', { orderId: `test_food_ok_${Date.now()}` });
    const afterSpend = await walletState();
    check('balance after ₹10,000 order', afterSpend.balance, 90000);
    check('lockedAmount untouched by the order', afterSpend.locked, 60000);
    check('available', (await getAvailableBalance(USER_ID)).availableBalance, 30000);

    // ---- 4. release pays once, even on retry -------------------------------
    console.log('\n4. Release stage 1 (₹20,000) to the contractor');
    const STAGE_REF = `stage_release_${PROJECT_ID}_s1`;
    const rel = await releaseHold({
        holdId: held.hold.id,
        amount: 20000,
        reference: STAGE_REF,
        reason: 'Stage 1 approved',
        payee: { entityType: 'contractor', entityId: CONTRACTOR_ID },
    });
    const afterRelease = await walletState();
    check('customer balance', afterRelease.balance, 70000);
    check('lockedAmount', afterRelease.locked, 40000);
    check('hold outstanding', rel.hold.outstanding, 40000);
    const cw1 = await ConstructionContractorWallet.findOne({ contractorId: CONTRACTOR_ID }).lean();
    check('contractor balance', cw1?.balance, 20000);
    check('contractor totalEarnings', cw1?.totalEarnings, 20000);

    console.log('\n5. Retry the SAME release reference (double-tap / network retry)');
    const retry = await releaseHold({
        holdId: held.hold.id,
        amount: 20000,
        reference: STAGE_REF,
        reason: 'Stage 1 approved',
        payee: { entityType: 'contractor', entityId: CONTRACTOR_ID },
    });
    assertTrue('reported as alreadyProcessed', retry.alreadyProcessed === true);
    const afterRetry = await walletState();
    check('customer balance UNCHANGED', afterRetry.balance, 70000);
    check('lockedAmount UNCHANGED', afterRetry.locked, 40000);
    const cw2 = await ConstructionContractorWallet.findOne({ contractorId: CONTRACTOR_ID }).lean();
    check('contractor paid exactly ONCE', cw2?.balance, 20000);

    // ---- 5. over-release is refused ----------------------------------------
    console.log('\n6. Guard rails');
    await expectRejection(
        'releasing more than is held is REFUSED',
        () => releaseHold({
            holdId: held.hold.id,
            amount: 999999,
            reference: `overdraw_${Date.now()}`,
            payee: { entityType: 'contractor', entityId: CONTRACTOR_ID },
        }),
    );
    await expectRejection(
        'an operation without a reference is REFUSED',
        () => releaseHold({ holdId: held.hold.id, amount: 100 }),
    );

    // ---- 6. refund returns money to spendable ------------------------------
    console.log('\n7. Refund the remaining ₹40,000 (project cancelled)');
    const refunded = await refundHold({
        holdId: held.hold.id,
        amount: 40000,
        reference: `project_cancel_${PROJECT_ID}`,
        reason: 'Project cancelled',
    });
    const afterRefund = await walletState();
    check('balance unchanged by refund', afterRefund.balance, 70000);
    check('lockedAmount cleared', afterRefund.locked, 0);
    check('available is full balance again', (await getAvailableBalance(USER_ID)).availableBalance, 70000);
    check('hold outstanding', refunded.hold.outstanding, 0);
    assertTrue('hold auto-settled', refunded.hold.status === 'settled');

    // ---- 7b. concurrency: one hold must not spend another hold's lock -------
    console.log('\n8. Two holds at once, and concurrent releases');
    const PROJECT_A = new mongoose.Types.ObjectId();
    const PROJECT_B = new mongoose.Types.ObjectId();
    const holdA = await createHold({
        userId: USER_ID, module: MODULE, refType: REF_TYPE, refId: PROJECT_A,
        amount: 30000, reference: `fund_${PROJECT_A}`, reason: 'Project A',
    });
    const holdB = await createHold({
        userId: USER_ID, module: MODULE, refType: REF_TYPE, refId: PROJECT_B,
        amount: 30000, reference: `fund_${PROJECT_B}`, reason: 'Project B',
    });
    check('lockedAmount across two holds', (await walletState()).locked, 60000);
    check('available', (await getAvailableBalance(USER_ID)).availableBalance, 10000);

    // Two releases of ₹20,000 each against hold A (which holds only ₹30,000),
    // fired together with DIFFERENT references so idempotency cannot mask the
    // race. The wallet lock is ₹60,000 — enough to wrongly permit both if the
    // guard were the aggregate lock rather than the hold itself.
    const results = await Promise.allSettled([
        releaseHold({
            holdId: holdA.hold.id, amount: 20000, reference: `race_a1_${PROJECT_A}`,
            reason: 'Race 1', payee: { entityType: 'contractor', entityId: CONTRACTOR_ID },
        }),
        releaseHold({
            holdId: holdA.hold.id, amount: 20000, reference: `race_a2_${PROJECT_A}`,
            reason: 'Race 2', payee: { entityType: 'contractor', entityId: CONTRACTOR_ID },
        }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    assertTrue(`exactly one of two racing releases succeeded (got ${fulfilled})`, fulfilled === 1);

    const holdADoc = await WalletHold.findById(holdA.hold.id).lean();
    const holdBDoc = await WalletHold.findById(holdB.hold.id).lean();
    check('hold A released', holdADoc?.amountReleased, 20000);
    check('hold B untouched', holdBDoc?.amountReleased, 0);
    check('hold B still holds its full amount', holdBDoc?.amountHeld, 30000);
    const cwRace = await ConstructionContractorWallet.findOne({ contractorId: CONTRACTOR_ID }).lean();
    check('contractor paid 20,000 + 20,000 total', cwRace?.balance, 40000);

    const lockRecRace = await reconcileUserLock(USER_ID);
    assertTrue('wallet lock still matches active holds after the race', lockRecRace.inSync === true);

    // ---- 7. the invariant ---------------------------------------------------
    console.log('\n9. Reconciliation');
    const rec = await reconcileHold(held.hold.id);
    assertTrue('hold totals match the ledger', rec.inSync === true);
    check('ledger held', rec.ledger.amountHeld, 60000);
    check('ledger released', rec.ledger.amountReleased, 20000);
    check('ledger refunded', rec.ledger.amountRefunded, 40000);
    assertTrue(
        'invariant held === released + refunded + outstanding',
        money(rec.ledger.amountHeld)
        === money(rec.ledger.amountReleased + rec.ledger.amountRefunded + rec.ledger.outstanding),
    );
    const lockRec = await reconcileUserLock(USER_ID);
    assertTrue('wallet lock matches active holds', lockRec.inSync === true);

    // ---- 8. the ledger is immutable ----------------------------------------
    console.log('\n10. Append-only enforcement');
    const anyEntry = await WalletHoldLedger.findOne({ holdId: held.hold.id });
    await expectRejection(
        'updateOne on the ledger is REFUSED',
        () => WalletHoldLedger.updateOne({ _id: anyEntry._id }, { $set: { amount: 1 } }),
    );
    await expectRejection(
        'deleteOne on the ledger is REFUSED',
        () => WalletHoldLedger.deleteOne({ _id: anyEntry._id }),
    );
    await expectRejection(
        'editing and re-saving a ledger row is REFUSED',
        async () => { anyEntry.amount = 1; await anyEntry.save(); },
    );

    // ---- cleanup ------------------------------------------------------------
    console.log('\n11. Cleanup');
    // Bypass the append-only guards via the driver — these are synthetic rows.
    await WalletHoldLedger.collection.deleteMany({ userId: USER_ID });
    await WalletHold.collection.deleteMany({ userId: USER_ID });
    await FoodUserWallet.deleteMany({ userId: USER_ID });
    await ConstructionContractorWallet.deleteMany({ contractorId: CONTRACTOR_ID });
    await Transaction.deleteMany({
        $or: [{ entityId: USER_ID }, { entityId: CONTRACTOR_ID }],
    });
    console.log('  ✓ synthetic data removed');

    console.log(`\n${'='.repeat(52)}`);
    console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
    console.log('='.repeat(52));
    if (failed > 0) {
        console.log('\n✗ Escrow guarantees are NOT holding. Do not proceed to Phase 1.');
        process.exitCode = 1;
    } else {
        console.log('\n✓ All escrow guarantees hold.');
    }

    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error('\nVerification crashed:', err.message);
    console.error(err.stack);
    try {
        await WalletHoldLedger.collection.deleteMany({ userId: USER_ID });
        await WalletHold.collection.deleteMany({ userId: USER_ID });
        await FoodUserWallet.deleteMany({ userId: USER_ID });
        await ConstructionContractorWallet.deleteMany({ contractorId: CONTRACTOR_ID });
        await Transaction.deleteMany({ $or: [{ entityId: USER_ID }, { entityId: CONTRACTOR_ID }] });
        console.error('(synthetic data cleaned up)');
    } catch { /* best effort */ }
    process.exit(1);
});
