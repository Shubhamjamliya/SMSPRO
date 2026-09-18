/**
 * Escrow hold service — the platform primitive behind "money in, held, released
 * as work is approved".
 *
 * The model in one line: a hold NEVER moves money. It marks part of the
 * customer's balance as spoken for, and only an explicit release actually pays
 * anyone. That is what makes the arrangement fair to both sides — the customer
 * cannot be charged for work that was not done, and the contractor can see the
 * money exists before starting.
 *
 * Three collections move together and must never drift:
 *   food_user_wallets.lockedAmount   how much of the customer's balance is claimed
 *   wallet_holds                     per-commitment totals (a CACHE)
 *   wallet_hold_ledger               append-only source of truth
 *
 * Every mutation runs inside one MongoDB transaction, so the three either all
 * move or none do. Every mutation also requires a stable `reference`, which is
 * unique-indexed on the ledger — a retried release therefore pays exactly once.
 *
 * Requires a replica set (transactions). This is not a new dependency:
 * `core/payments/transaction.service.recordTransaction` has used sessions since
 * the food module shipped.
 *
 * Run `node scripts/phase0-ensure-escrow-indexes.js` before first use — the
 * connection sets `autoIndex: false`, so the unique `reference` index that
 * guarantees idempotency is created by that script, not by Mongoose.
 */
import mongoose from 'mongoose';
import { ValidationError } from '../auth/errors.js';
import { FoodUserWallet } from '../../modules/food/user/models/userWallet.model.js';
import { recordTransactionInSession } from '../payments/transaction.service.js';
import { logger } from '../../utils/logger.js';
import { WalletHold } from './models/walletHold.model.js';
import { WalletHoldLedger } from './models/walletHoldLedger.model.js';

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Half a paisa.
 *
 * Every guard below compares two doubles inside MongoDB, where `$subtract`
 * carries floating-point error: after a few releases, an outstanding balance of
 * exactly 16666.67 is stored as 16666.669999999984. Comparing `>= 16666.67`
 * then fails by 1.5e-11 and blocks the FINAL, legitimate release of a hold —
 * money would be stranded with no way to pay it out.
 *
 * The tolerance is far below any real rupee value and far above the noise, so
 * it cannot let a materially larger release slip through.
 */
const EPSILON = 0.005;

const toObjectId = (value, label = 'id') => {
    const id = String(value || '').trim();
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError(`Invalid ${label}`);
    }
    return new mongoose.Types.ObjectId(id);
};

const assertAmount = (value, label = 'Amount') => {
    const amount = roundMoney(value);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError(`${label} must be greater than 0`);
    }
    return amount;
};

const assertReference = (reference) => {
    const ref = String(reference || '').trim();
    if (!ref) {
        // Without a reference there is no idempotency and a retry pays twice.
        throw new ValidationError('A stable `reference` is required for every escrow operation');
    }
    return ref;
};

const isDuplicateReference = (err) => err?.code === 11000
    && JSON.stringify(err?.keyPattern || err?.keyValue || {}).includes('reference');

const outstandingOf = (hold) => roundMoney(
    (Number(hold?.amountHeld) || 0)
    - (Number(hold?.amountReleased) || 0)
    - (Number(hold?.amountRefunded) || 0),
);

const serializeHold = (hold) => {
    if (!hold) return null;
    const doc = typeof hold.toObject === 'function' ? hold.toObject() : { ...hold };
    return {
        id: String(doc._id),
        userId: String(doc.userId),
        module: doc.module,
        refType: doc.refType,
        refId: doc.refId ? String(doc.refId) : null,
        currency: doc.currency || 'INR',
        amountHeld: roundMoney(doc.amountHeld),
        amountReleased: roundMoney(doc.amountReleased),
        amountRefunded: roundMoney(doc.amountRefunded),
        outstanding: outstandingOf(doc),
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        closedAt: doc.closedAt || null,
    };
};

async function withTransaction(fn) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const result = await fn(session);
        await session.commitTransaction();
        return result;
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

/** Replay helper — returns the state as it stands after an operation already ran. */
async function replayFromReference(reference) {
    const entry = await WalletHoldLedger.findOne({ reference }).lean();
    if (!entry) return null;
    const hold = await WalletHold.findById(entry.holdId).lean();
    return {
        alreadyProcessed: true,
        hold: serializeHold(hold),
        entryId: String(entry._id),
        amount: roundMoney(entry.amount),
    };
}

/** Ensure the customer's wallet row exists. Safe to call repeatedly. */
async function ensureUserWallet(userOid) {
    const existing = await FoodUserWallet.findOne({ userId: userOid }).select('_id').lean();
    if (existing) return;
    try {
        await FoodUserWallet.create({ userId: userOid, balance: 0, transactions: [] });
    } catch (err) {
        if (err?.code !== 11000) throw err; // lost a create race — the row exists now
    }
}

/**
 * Find-or-create the hold envelope for a commitment.
 * Created outside the money transaction and with zero totals, so a failed
 * funding attempt leaves at worst an empty envelope the next attempt reuses.
 */
async function ensureHold({ userOid, module, refType, refOid, performedBy, meta }) {
    const query = { module, refType, refId: refOid };
    const existing = await WalletHold.findOne(query);
    if (existing) return existing;
    try {
        return await WalletHold.create({
            userId: userOid,
            module,
            refType,
            refId: refOid,
            currency: 'INR',
            amountHeld: 0,
            amountReleased: 0,
            amountRefunded: 0,
            status: 'active',
            createdBy: performedBy || null,
            meta: meta || null,
        });
    } catch (err) {
        if (err?.code === 11000) {
            const raced = await WalletHold.findOne(query);
            if (raced) return raced;
        }
        throw err;
    }
}

/** Spendable balance = balance − lockedAmount. */
export async function getAvailableBalance(userId) {
    const oid = toObjectId(userId, 'user id');
    const wallet = await FoodUserWallet.findOne({ userId: oid })
        .select('balance lockedAmount')
        .lean();
    const balance = roundMoney(wallet?.balance);
    const locked = roundMoney(wallet?.lockedAmount);
    return {
        userId: String(oid),
        balance,
        lockedAmount: locked,
        availableBalance: roundMoney(balance - locked),
        currency: 'INR',
    };
}

/**
 * Lock money against a commitment. The customer's balance does not change —
 * `lockedAmount` rises, so the funds stop being spendable anywhere else.
 *
 * @param {object}  params
 * @param {string}  params.userId
 * @param {string}  params.module     owning module, e.g. 'construction'
 * @param {string}  params.refType    e.g. 'construction_project'
 * @param {string}  params.refId
 * @param {number}  params.amount
 * @param {string}  params.reference  stable idempotency key — REQUIRED
 */
export async function createHold({
    userId, module, refType, refId, amount,
    reason = 'Funds held', reference, performedBy = null, meta = null,
} = {}) {
    const userOid = toObjectId(userId, 'user id');
    const refOid = toObjectId(refId, 'reference id');
    const holdAmount = assertAmount(amount, 'Hold amount');
    const ref = assertReference(reference);
    const moduleKey = String(module || '').trim();
    const refTypeKey = String(refType || '').trim();
    if (!moduleKey) throw new ValidationError('module is required');
    if (!refTypeKey) throw new ValidationError('refType is required');

    await ensureUserWallet(userOid);
    const hold = await ensureHold({
        userOid, module: moduleKey, refType: refTypeKey, refOid, performedBy, meta,
    });

    if (hold.status !== 'active') {
        throw new ValidationError(`This hold is ${hold.status} and cannot take further funds`);
    }
    if (String(hold.userId) !== String(userOid)) {
        throw new ValidationError('This commitment is already held against a different user');
    }

    try {
        return await withTransaction(async (session) => {
            // 1. Lock the funds, refusing if they are not genuinely available.
            //    The guard lives in the filter so it is atomic against concurrent debits.
            const lockedWallet = await FoodUserWallet.findOneAndUpdate(
                {
                    userId: userOid,
                    $expr: {
                        $gte: [
                            { $subtract: ['$balance', { $ifNull: ['$lockedAmount', 0] }] },
                            holdAmount,
                        ],
                    },
                },
                { $inc: { lockedAmount: holdAmount } },
                { new: true, session },
            );
            if (!lockedWallet) {
                const snap = await FoodUserWallet.findOne({ userId: userOid })
                    .select('balance lockedAmount')
                    .session(session)
                    .lean();
                const available = roundMoney(
                    (Number(snap?.balance) || 0) - (Number(snap?.lockedAmount) || 0),
                );
                throw new ValidationError(
                    `Insufficient available balance to hold ₹${holdAmount.toFixed(2)}. `
                    + `Available: ₹${available.toFixed(2)}.`,
                );
            }

            // 2. Grow the hold, re-checking status inside the transaction so a
            //    concurrent cancel cannot be overtaken by a late funding call.
            const updatedHold = await WalletHold.findOneAndUpdate(
                { _id: hold._id, status: 'active' },
                { $inc: { amountHeld: holdAmount } },
                { new: true, session },
            );
            if (!updatedHold) {
                throw new ValidationError('This hold is no longer active and cannot take further funds');
            }

            // 3. Ledger last, so `outstandingAfter` records the true post-state rather
            //    than a value computed from a pre-transaction read. The unique
            //    `reference` index still gates idempotency: a duplicate throws here
            //    and aborts the whole transaction, unwinding steps 1 and 2.
            const [entry] = await WalletHoldLedger.create([{
                holdId: hold._id,
                userId: userOid,
                module: moduleKey,
                entryType: 'hold',
                amount: holdAmount,
                currency: 'INR',
                outstandingAfter: outstandingOf(updatedHold),
                reason,
                reference: ref,
                performedBy,
                meta,
            }], { session });

            logger.info(
                `Escrow hold: +${holdAmount} for user:${userOid} `
                + `(${moduleKey}/${refTypeKey}/${refOid}) ref=${ref}`,
            );

            return {
                alreadyProcessed: false,
                hold: serializeHold(updatedHold),
                entryId: String(entry._id),
                amount: holdAmount,
            };
        });
    } catch (err) {
        if (isDuplicateReference(err)) {
            const replay = await replayFromReference(ref);
            if (replay) return replay;
        }
        throw err;
    }
}

/**
 * Pay part of a hold out to a payee. This is the only path that turns held money
 * into someone else's money, and it is the transition that must be gated on
 * approved, evidenced work.
 *
 * Sequence inside one transaction: write the ledger row, drop the customer's
 * lock, debit the customer, credit the payee, then settle the hold if nothing
 * is left. The lock drops *before* the debit so the standard available-balance
 * guard in `recordTransactionInSession` passes honestly rather than being
 * overridden.
 *
 * @param {object} params.payee  { entityType, entityId } — omit to release back
 *                               to nobody (rare; prefer refundHold)
 */
export async function releaseHold({
    holdId, amount, reference, reason = 'Stage payment released',
    payee = null, performedBy = null, meta = null,
    category = 'escrow_release', payeeCategory = 'escrow_release',
    description = '', payeeDescription = '',
} = {}) {
    const holdOid = toObjectId(holdId, 'hold id');
    const releaseAmount = assertAmount(amount, 'Release amount');
    const ref = assertReference(reference);

    const hold = await WalletHold.findById(holdOid);
    if (!hold) throw new ValidationError('Hold not found');
    if (hold.status === 'cancelled') {
        throw new ValidationError('This hold was cancelled and cannot release funds');
    }
    const available = outstandingOf(hold);
    if (releaseAmount > available) {
        throw new ValidationError(
            `Cannot release ₹${releaseAmount.toFixed(2)} — only ₹${available.toFixed(2)} is still held.`,
        );
    }
    if (payee && !payee.entityType) {
        throw new ValidationError('payee.entityType is required when a payee is given');
    }

    try {
        return await withTransaction(async (session) => {
            // 1. Decrement the hold FIRST, with the outstanding check in the filter.
            //    The hold — not the wallet's aggregate lockedAmount — is the
            //    authoritative guard: a user may hold money for several projects at
            //    once, so a sufficient wallet lock does not prove THIS hold can
            //    afford the release. Two concurrent releases race here and exactly
            //    one wins.
            const decremented = await WalletHold.findOneAndUpdate(
                {
                    _id: hold._id,
                    status: { $ne: 'cancelled' },
                    $expr: {
                        $gte: [
                            {
                                $subtract: [
                                    '$amountHeld',
                                    { $add: ['$amountReleased', '$amountRefunded'] },
                                ],
                            },
                            releaseAmount - EPSILON,
                        ],
                    },
                },
                { $inc: { amountReleased: releaseAmount } },
                { new: true, session },
            );
            if (!decremented) {
                throw new ValidationError(
                    `Cannot release ₹${releaseAmount.toFixed(2)} — the held amount changed. `
                    + 'Re-read the hold and try again.',
                );
            }
            const outstandingAfter = outstandingOf(decremented);

            // 2. Read the customer's wallet to stamp opening/closing on the visible
            //    history row, then drop the lock and record the movement together.
            const wallet = await FoodUserWallet.findOne({ userId: hold.userId })
                .select('balance lockedAmount')
                .session(session)
                .lean();
            const openingBalance = roundMoney(wallet?.balance);
            const closingBalance = roundMoney(openingBalance - releaseAmount);

            const unlocked = await FoodUserWallet.findOneAndUpdate(
                {
                    userId: hold.userId,
                    $expr: { $gte: [{ $ifNull: ['$lockedAmount', 0] }, releaseAmount - EPSILON] },
                },
                {
                    $inc: { lockedAmount: -releaseAmount },
                    $push: {
                        transactions: {
                            $each: [{
                                type: 'deduction',
                                amount: releaseAmount,
                                status: 'Completed',
                                description: description || reason,
                                reason: 'ESCROW_RELEASE',
                                openingBalance,
                                closingBalance,
                                metadata: {
                                    source: hold.module,
                                    module: hold.module,
                                    reasonCode: 'ESCROW_RELEASE',
                                    holdId: String(hold._id),
                                    refType: hold.refType,
                                    refId: String(hold.refId),
                                    referenceId: ref,
                                },
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            }],
                            $position: 0,
                        },
                    },
                },
                { new: true, session },
            );
            if (!unlocked) {
                // lockedAmount drifted below the hold's own accounting — refuse rather
                // than pay out money the wallet does not actually have reserved.
                throw new ValidationError(
                    'Wallet lock is out of sync with this hold. Run reconcileHold before releasing.',
                );
            }

            // 3. Debit the customer through the shared ledger. The lock is already
            //    gone, so the normal available-balance guard applies with no
            //    special casing.
            await recordTransactionInSession(session, {
                entityType: 'user',
                entityId: String(hold.userId),
                type: 'debit',
                amount: releaseAmount,
                description: description || reason,
                category,
                module: hold.module,
                metadata: {
                    holdId: String(hold._id),
                    refType: hold.refType,
                    refId: String(hold.refId),
                    reference: ref,
                },
            });

            // 4. Credit the payee.
            let payeeResult = null;
            if (payee) {
                payeeResult = await recordTransactionInSession(session, {
                    entityType: String(payee.entityType),
                    entityId: String(payee.entityId),
                    type: 'credit',
                    amount: releaseAmount,
                    description: payeeDescription || description || reason,
                    category: payeeCategory,
                    module: hold.module,
                    metadata: {
                        holdId: String(hold._id),
                        refType: hold.refType,
                        refId: String(hold.refId),
                        reference: ref,
                        fromUserId: String(hold.userId),
                    },
                });
            }

            // 5. Ledger last, recording the true post-state. The unique `reference`
            //    index gates idempotency: a retry throws here and aborts everything
            //    above, so the contractor is paid exactly once.
            const [entry] = await WalletHoldLedger.create([{
                holdId: hold._id,
                userId: hold.userId,
                module: hold.module,
                entryType: 'release',
                amount: releaseAmount,
                currency: 'INR',
                outstandingAfter,
                reason,
                reference: ref,
                payee: payee
                    ? {
                        entityType: String(payee.entityType),
                        entityId: payee.entityId ? toObjectId(payee.entityId, 'payee id') : null,
                    }
                    : undefined,
                performedBy,
                meta,
            }], { session });

            let updatedHold = decremented;
            if (outstandingAfter === 0) {
                updatedHold = await WalletHold.findOneAndUpdate(
                    { _id: hold._id },
                    { $set: { status: 'settled', closedAt: new Date() } },
                    { new: true, session },
                );
            }

            logger.info(
                `Escrow release: ${releaseAmount} from hold:${hold._id} `
                + `→ ${payee ? `${payee.entityType}:${payee.entityId}` : 'no payee'} ref=${ref}`,
            );

            return {
                alreadyProcessed: false,
                hold: serializeHold(updatedHold),
                entryId: String(entry._id),
                amount: releaseAmount,
                payeeBalance: payeeResult?.wallet?.balance ?? null,
            };
        });
    } catch (err) {
        if (isDuplicateReference(err)) {
            const replay = await replayFromReference(ref);
            if (replay) return replay;
        }
        throw err;
    }
}

/**
 * Give held money back to the customer. Unlike a release, no money leaves the
 * wallet — the lock simply drops and the balance becomes spendable again.
 */
export async function refundHold({
    holdId, amount, reference, reason = 'Held funds returned',
    performedBy = null, meta = null,
} = {}) {
    const holdOid = toObjectId(holdId, 'hold id');
    const refundAmount = assertAmount(amount, 'Refund amount');
    const ref = assertReference(reference);

    const hold = await WalletHold.findById(holdOid);
    if (!hold) throw new ValidationError('Hold not found');
    const available = outstandingOf(hold);
    if (refundAmount > available) {
        throw new ValidationError(
            `Cannot return ₹${refundAmount.toFixed(2)} — only ₹${available.toFixed(2)} is still held.`,
        );
    }

    try {
        return await withTransaction(async (session) => {
            // 1. Decrement the hold first, guarded on its own outstanding amount —
            //    same reasoning as releaseHold: the wallet's aggregate lock spans
            //    every hold the user has, so it cannot authorise THIS one.
            const decremented = await WalletHold.findOneAndUpdate(
                {
                    _id: hold._id,
                    $expr: {
                        $gte: [
                            {
                                $subtract: [
                                    '$amountHeld',
                                    { $add: ['$amountReleased', '$amountRefunded'] },
                                ],
                            },
                            refundAmount - EPSILON,
                        ],
                    },
                },
                { $inc: { amountRefunded: refundAmount } },
                { new: true, session },
            );
            if (!decremented) {
                throw new ValidationError(
                    `Cannot return ₹${refundAmount.toFixed(2)} — the held amount changed. `
                    + 'Re-read the hold and try again.',
                );
            }
            const outstandingAfter = outstandingOf(decremented);

            // 2. Drop the lock. No balance change — the money was never moved, it
            //    simply becomes spendable again.
            const unlocked = await FoodUserWallet.findOneAndUpdate(
                {
                    userId: hold.userId,
                    $expr: { $gte: [{ $ifNull: ['$lockedAmount', 0] }, refundAmount - EPSILON] },
                },
                { $inc: { lockedAmount: -refundAmount } },
                { new: true, session },
            );
            if (!unlocked) {
                throw new ValidationError(
                    'Wallet lock is out of sync with this hold. Run reconcileHold before refunding.',
                );
            }

            // 3. Ledger last — the idempotency gate.
            const [entry] = await WalletHoldLedger.create([{
                holdId: hold._id,
                userId: hold.userId,
                module: hold.module,
                entryType: 'refund',
                amount: refundAmount,
                currency: 'INR',
                outstandingAfter,
                reason,
                reference: ref,
                performedBy,
                meta,
            }], { session });

            let updatedHold = decremented;
            if (outstandingAfter === 0) {
                updatedHold = await WalletHold.findOneAndUpdate(
                    { _id: hold._id },
                    { $set: { status: 'settled', closedAt: new Date() } },
                    { new: true, session },
                );
            }

            logger.info(`Escrow refund: ${refundAmount} released back from hold:${hold._id} ref=${ref}`);

            return {
                alreadyProcessed: false,
                hold: serializeHold(updatedHold),
                entryId: String(entry._id),
                amount: refundAmount,
            };
        });
    } catch (err) {
        if (isDuplicateReference(err)) {
            const replay = await replayFromReference(ref);
            if (replay) return replay;
        }
        throw err;
    }
}

/** Return everything still held and close the hold for good. */
export async function cancelHold({
    holdId, reference, reason = 'Commitment cancelled', performedBy = null, meta = null,
} = {}) {
    const holdOid = toObjectId(holdId, 'hold id');
    const hold = await WalletHold.findById(holdOid);
    if (!hold) throw new ValidationError('Hold not found');

    const remaining = outstandingOf(hold);
    if (remaining > 0) {
        await refundHold({
            holdId: holdOid,
            amount: remaining,
            reference: assertReference(reference),
            reason,
            performedBy,
            meta,
        });
    }

    const closed = await WalletHold.findOneAndUpdate(
        { _id: holdOid },
        { $set: { status: 'cancelled', closedAt: new Date() } },
        { new: true },
    );
    logger.info(`Escrow hold cancelled: ${holdOid} (returned ${remaining})`);
    return { hold: serializeHold(closed), returnedAmount: remaining };
}

/** Look up the hold for a commitment, if one exists. */
export async function getHoldForRef({ module, refType, refId }) {
    const hold = await WalletHold.findOne({
        module: String(module || '').trim(),
        refType: String(refType || '').trim(),
        refId: toObjectId(refId, 'reference id'),
    }).lean();
    return serializeHold(hold);
}

export async function getHoldById(holdId) {
    const hold = await WalletHold.findById(toObjectId(holdId, 'hold id')).lean();
    return serializeHold(hold);
}

/** Full audit trail for a hold, oldest first — this is what a dispute reads. */
export async function listHoldLedger(holdId, { limit = 200 } = {}) {
    const entries = await WalletHoldLedger.find({ holdId: toObjectId(holdId, 'hold id') })
        .sort({ createdAt: 1 })
        .limit(Math.min(Math.max(1, limit), 1000))
        .lean();
    return entries.map((e) => ({
        id: String(e._id),
        entryType: e.entryType,
        amount: roundMoney(e.amount),
        outstandingAfter: e.outstandingAfter,
        reason: e.reason || '',
        reference: e.reference || '',
        payee: e.payee?.entityType
            ? { entityType: e.payee.entityType, entityId: e.payee.entityId ? String(e.payee.entityId) : null }
            : null,
        performedBy: e.performedBy || null,
        createdAt: e.createdAt,
    }));
}

/**
 * Recompute a hold's totals from the ledger and report any drift.
 *
 * The ledger is authoritative; the hold row is a cache. `repair: true` rewrites
 * the cache to match the ledger — it never touches the ledger itself.
 * Intended for the nightly reconciliation job and for support investigation.
 */
export async function reconcileHold(holdId, { repair = false } = {}) {
    const holdOid = toObjectId(holdId, 'hold id');
    const hold = await WalletHold.findById(holdOid);
    if (!hold) throw new ValidationError('Hold not found');

    const totals = await WalletHoldLedger.aggregate([
        { $match: { holdId: holdOid } },
        { $group: { _id: '$entryType', total: { $sum: '$amount' } } },
    ]);
    const byType = totals.reduce((acc, row) => {
        acc[row._id] = roundMoney(row.total);
        return acc;
    }, {});

    const ledgerHeld = roundMoney(byType.hold || 0);
    const ledgerReleased = roundMoney(byType.release || 0);
    const ledgerRefunded = roundMoney(byType.refund || 0);

    const drift = {
        amountHeld: roundMoney(ledgerHeld - (Number(hold.amountHeld) || 0)),
        amountReleased: roundMoney(ledgerReleased - (Number(hold.amountReleased) || 0)),
        amountRefunded: roundMoney(ledgerRefunded - (Number(hold.amountRefunded) || 0)),
    };
    const inSync = drift.amountHeld === 0
        && drift.amountReleased === 0
        && drift.amountRefunded === 0;

    if (!inSync && repair) {
        await WalletHold.updateOne(
            { _id: holdOid },
            {
                $set: {
                    amountHeld: ledgerHeld,
                    amountReleased: ledgerReleased,
                    amountRefunded: ledgerRefunded,
                },
            },
        );
        logger.warn(`Escrow hold ${holdOid} repaired from ledger: ${JSON.stringify(drift)}`);
    } else if (!inSync) {
        logger.error(`Escrow hold ${holdOid} DRIFT detected: ${JSON.stringify(drift)}`);
    }

    return {
        holdId: String(holdOid),
        inSync,
        drift,
        ledger: {
            amountHeld: ledgerHeld,
            amountReleased: ledgerReleased,
            amountRefunded: ledgerRefunded,
            outstanding: roundMoney(ledgerHeld - ledgerReleased - ledgerRefunded),
        },
        repaired: Boolean(!inSync && repair),
    };
}

/**
 * Cross-check a user's `lockedAmount` against the sum of their active holds.
 * A mismatch means money is either over-reserved (customer cannot spend their
 * own funds) or under-reserved (held money is spendable) — both need alerting.
 */
export async function reconcileUserLock(userId, { repair = false } = {}) {
    const userOid = toObjectId(userId, 'user id');

    const [agg] = await WalletHold.aggregate([
        { $match: { userId: userOid, status: 'active' } },
        {
            $group: {
                _id: null,
                outstanding: {
                    $sum: {
                        $subtract: [
                            '$amountHeld',
                            { $add: ['$amountReleased', '$amountRefunded'] },
                        ],
                    },
                },
            },
        },
    ]);
    const expectedLock = roundMoney(agg?.outstanding || 0);

    const wallet = await FoodUserWallet.findOne({ userId: userOid })
        .select('balance lockedAmount')
        .lean();
    const actualLock = roundMoney(wallet?.lockedAmount);
    const drift = roundMoney(expectedLock - actualLock);

    if (drift !== 0 && repair) {
        await FoodUserWallet.updateOne(
            { userId: userOid },
            { $set: { lockedAmount: expectedLock } },
        );
        logger.warn(`Wallet lock repaired for user:${userOid} ${actualLock} → ${expectedLock}`);
    } else if (drift !== 0) {
        logger.error(`Wallet lock DRIFT for user:${userOid} expected=${expectedLock} actual=${actualLock}`);
    }

    return {
        userId: String(userOid),
        expectedLock,
        actualLock,
        drift,
        inSync: drift === 0,
        repaired: Boolean(drift !== 0 && repair),
    };
}

/** Convenience for admin screens: every hold currently reserving a user's money. */
export async function listActiveHoldsForUser(userId) {
    const holds = await WalletHold.find({
        userId: toObjectId(userId, 'user id'),
        status: 'active',
    }).sort({ createdAt: -1 }).lean();
    return holds.map(serializeHold);
}

export { WalletHold, WalletHoldLedger };
