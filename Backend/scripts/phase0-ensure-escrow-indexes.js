/**
 * Phase 0 migration — escrow hold ledger + platform audit log.
 *
 * The connection sets `autoIndex: false`, so Mongoose does NOT build indexes on
 * its own. This script is therefore REQUIRED before any escrow code runs: the
 * unique index on `wallet_hold_ledger.reference` is the entire idempotency
 * guarantee. Without it a retried stage release would pay a contractor twice and
 * nothing would stop it.
 *
 * Creates (idempotent, non-destructive):
 *   - wallet_holds           unique {module, refType, refId}, {userId,status,createdAt}
 *   - wallet_hold_ledger     UNIQUE partial {reference}  ← the idempotency gate
 *                            plus {holdId,createdAt} and {userId,entryType,createdAt}
 *   - platform_audit_logs    {module,entityType,entityId,createdAt}, {module,action,createdAt}
 *   - construction_contractor_wallets   unique {contractorId}
 *   - payments               partial {refType,refId,createdAt} for non-order payables
 *   - food_user_wallets      no index change; `lockedAmount` defaults to 0 and
 *                            needs no backfill
 *
 * Run:      node scripts/phase0-ensure-escrow-indexes.js
 * Verify:   node scripts/phase0-ensure-escrow-indexes.js --verify
 * Rollback: node scripts/phase0-ensure-escrow-indexes.js --down
 *           Drops ONLY the two new escrow collections and the audit log, and
 *           refuses if any hold has money outstanding. It never touches
 *           food_user_wallets, payments or transactions.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { WalletHold } from '../src/core/wallet/models/walletHold.model.js';
import { WalletHoldLedger } from '../src/core/wallet/models/walletHoldLedger.model.js';
import { PlatformAuditLog } from '../src/core/audit/auditLog.model.js';
import { ConstructionContractorWallet } from '../src/core/payments/models/contractorWallet.model.js';
import { Payment } from '../src/core/payments/models/payment.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const isDown = process.argv.includes('--down');
const isVerify = process.argv.includes('--verify');

const MODELS = [
    ['wallet_holds', WalletHold],
    ['wallet_hold_ledger', WalletHoldLedger],
    ['platform_audit_logs', PlatformAuditLog],
    ['construction_contractor_wallets', ConstructionContractorWallet],
    ['payments', Payment],
];

/** The one index the whole escrow model depends on. */
const isIdempotencyIndex = (idx) => idx.key?.reference === 1 && idx.unique === true;

async function ensureCollection(name) {
    const existing = await mongoose.connection.db.listCollections({ name }).toArray();
    if (existing.length === 0) {
        await mongoose.connection.db.createCollection(name);
        console.log(`  created collection ${name}`);
    }
}

async function up() {
    for (const [name, Model] of MODELS) {
        // Create the collection first so index builds and the first transactional
        // write never race against implicit creation.
        await ensureCollection(name);
        await Model.syncIndexes();
        const indexes = await Model.collection.indexes();
        console.log(`${name}: ${indexes.map((i) => i.name).join(', ')}`);
    }

    const ledgerIndexes = await WalletHoldLedger.collection.indexes();
    if (!ledgerIndexes.some(isIdempotencyIndex)) {
        throw new Error(
            'CRITICAL: unique index on wallet_hold_ledger.reference was not created. '
            + 'Escrow operations are NOT idempotent — do not enable the construction module.',
        );
    }
    console.log('\n✓ Idempotency index on wallet_hold_ledger.reference confirmed.');
    console.log('✓ Phase 0 escrow schema ready.');
}

async function verify() {
    let ok = true;
    for (const [name, Model] of MODELS) {
        const exists = await mongoose.connection.db.listCollections({ name }).toArray();
        if (exists.length === 0) {
            console.log(`✗ ${name}: collection missing`);
            ok = false;
            continue;
        }
        const indexes = await Model.collection.indexes();
        console.log(`✓ ${name}: ${indexes.map((i) => i.name).join(', ')}`);
    }

    const ledgerIndexes = await WalletHoldLedger.collection.indexes();
    if (ledgerIndexes.some(isIdempotencyIndex)) {
        console.log('\n✓ Idempotency index on wallet_hold_ledger.reference present.');
    } else {
        console.log('\n✗ CRITICAL: unique index on wallet_hold_ledger.reference is MISSING.');
        ok = false;
    }

    // A quick integrity read: no hold may show more paid out than was ever held.
    const overdrawn = await WalletHold.countDocuments({
        $expr: {
            $gt: [
                { $add: ['$amountReleased', '$amountRefunded'] },
                '$amountHeld',
            ],
        },
    });
    if (overdrawn > 0) {
        console.log(`✗ ${overdrawn} hold(s) have released+refunded exceeding held — investigate.`);
        ok = false;
    } else {
        console.log('✓ No over-released holds.');
    }

    if (!ok) process.exitCode = 1;
}

async function down() {
    const outstanding = await WalletHold.countDocuments({
        status: 'active',
        $expr: {
            $gt: [
                { $subtract: ['$amountHeld', { $add: ['$amountReleased', '$amountRefunded'] }] },
                0,
            ],
        },
    });
    if (outstanding > 0) {
        throw new Error(
            `Refusing to roll back: ${outstanding} hold(s) still have customer money reserved. `
            + 'Release or refund them first — dropping these collections would orphan real funds.',
        );
    }

    for (const name of ['wallet_hold_ledger', 'wallet_holds', 'platform_audit_logs']) {
        try {
            await mongoose.connection.db.collection(name).drop();
            console.log(`Rolled back: dropped ${name}.`);
        } catch (e) {
            if (e?.codeName === 'NamespaceNotFound') console.log(`${name} did not exist — nothing to drop.`);
            else throw e;
        }
    }
    console.log(
        '\nNote: food_user_wallets.lockedAmount is left in place (harmless, defaults to 0), '
        + 'and construction_contractor_wallets is kept in case it holds balances.',
    );
}

async function run() {
    if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
    console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
    await mongoose.connect(mongoUrl);
    console.log('Connected.\n');

    if (isDown) await down();
    else if (isVerify) await verify();
    else await up();

    await mongoose.disconnect();
    console.log('\nDisconnected.');
}

run().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
