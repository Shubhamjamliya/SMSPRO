import mongoose from 'mongoose';
import { Transaction } from './models/transaction.model.js';
import { FoodUserWallet } from '../../modules/food/user/models/userWallet.model.js';
import { FoodRestaurantWallet } from '../../modules/food/restaurant/models/restaurantWallet.model.js';
import { FoodDeliveryWallet } from '../../modules/food/delivery/models/deliveryWallet.model.js';
import { FoodAdminWallet } from '../../modules/food/admin/models/adminWallet.model.js';
import { ConstructionContractorWallet } from './models/contractorWallet.model.js';
import { logger } from '../../utils/logger.js';

/**
 * Resolve the wallet model + id-field for a given entity.
 * Returns { Model, filter } so callers can findOne/updateOne generically.
 */
function resolveWallet(entityType, entityId) {
    switch (entityType) {
        case 'user': {
            const id = new mongoose.Types.ObjectId(entityId);
            return { Model: FoodUserWallet, filter: { userId: id }, idField: 'userId' };
        }
        case 'restaurant': {
            const id = new mongoose.Types.ObjectId(entityId);
            return { Model: FoodRestaurantWallet, filter: { restaurantId: id }, idField: 'restaurantId' };
        }
        case 'deliveryBoy': {
            const id = new mongoose.Types.ObjectId(entityId);
            return { Model: FoodDeliveryWallet, filter: { deliveryPartnerId: id }, idField: 'deliveryPartnerId' };
        }
        case 'contractor': {
            const id = new mongoose.Types.ObjectId(entityId);
            return {
                Model: ConstructionContractorWallet,
                filter: { contractorId: id },
                idField: 'contractorId',
            };
        }
        case 'admin':
            return { Model: FoodAdminWallet, filter: { key: 'platform' }, idField: 'key' };
        default:
            throw new Error(`Unknown entityType: ${entityType}`);
    }
}

/** Entity types whose lifetime `totalEarnings` is incremented on credit. */
const EARNING_ENTITY_TYPES = new Set(['restaurant', 'deliveryBoy', 'contractor']);

/** Fixed ObjectId for admin entity used in Transaction documents (singleton) */
const ADMIN_ENTITY_OID = new mongoose.Types.ObjectId('000000000000000000000001');

/**
 * Ensure wallet exists, creating it if needed. Returns the wallet document.
 */
export async function ensureWallet(entityType, entityId) {
    const { Model, filter, idField } = resolveWallet(entityType, entityId);
    let wallet = await Model.findOne(filter);
    if (!wallet) {
        const createPayload = { ...filter, balance: 0 };
        wallet = await Model.create(createPayload);
    }
    return wallet;
}

/**
 * Get balance for an entity wallet.
 */
export async function getBalance(entityType, entityId) {
    const wallet = await ensureWallet(entityType, entityId);
    return {
        balance: Number(wallet.balance) || 0,
        lockedAmount: Number(wallet.lockedAmount) || 0,
        availableBalance: (Number(wallet.balance) || 0) - (Number(wallet.lockedAmount) || 0)
    };
}

/**
 * CORE ATOMIC OPERATION: Record a transaction AND update wallet balance
 * in a single MongoDB transaction. This is the ONLY way to change wallet balances.
 *
 * @param {Object} payload
 * @param {string} payload.entityType - 'user' | 'restaurant' | 'deliveryBoy' | 'admin'
 * @param {string} payload.entityId - ObjectId of the entity
 * @param {string} payload.type - 'credit' | 'debit'
 * @param {number} payload.amount - positive amount
 * @param {string} payload.description - human readable
 * @param {string} [payload.category] - transaction category
 * @param {string} [payload.orderId] - linked order
 * @param {string} [payload.paymentId] - linked payment
 * @param {Object} [payload.metadata] - extra data
 * @returns {Object} { transaction, wallet }
 */
export async function recordTransaction(payload) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const result = await recordTransactionInSession(session, payload);
        await session.commitTransaction();
        return result;
    } catch (err) {
        await session.abortTransaction();
        logger.error(`recordTransaction failed: ${err.message}`);
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Session-scoped body of `recordTransaction`.
 *
 * Exported so callers that must move money across several collections in ONE
 * transaction (notably `core/wallet/hold.service.releaseHold`, which debits the
 * customer, decrements the hold and credits the payee together) can compose with
 * it instead of duplicating the ledger+wallet write. The caller owns the session
 * and is responsible for commit/abort.
 */
export async function recordTransactionInSession(session, payload) {
    const {
        entityType, entityId, type, amount,
        description = '', category = 'other',
        orderId = null, paymentId = null,
        metadata = undefined, module = 'food',
        countAsEarning = true,
        // Deliberately opt-in, per call — NOT a general escape hatch. The only
        // legitimate use today is a platform fee that must be collected the
        // instant an action happens even though the payee has not earned
        // enough yet (construction's site-visit acceptance fee): the wallet
        // goes negative and is netted out automatically the next time this
        // entity is credited, since balance is just a running total. This must
        // never be used to debit money that is meant to still be reserved
        // (that is what `lockedAmount` / the hold service are for).
        allowNegative = false,
    } = payload;

    if (!['credit', 'debit'].includes(type)) throw new Error('type must be credit or debit');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');

    const { Model, filter } = resolveWallet(entityType, entityId);

    // 1. Ensure wallet exists
    let wallet = await Model.findOne(filter).session(session);
    if (!wallet) {
        [wallet] = await Model.create([{ ...filter, balance: 0 }], { session });
    }

    // 2. Compute new balance
    const currentBalance = Number(wallet.balance) || 0;
    const lockedAmount = Number(wallet.lockedAmount) || 0;
    const newBalance = type === 'credit'
        ? currentBalance + amount
        : currentBalance - amount;

    // Debit guard: prevent negative balance (except admin wallet, and a caller that
    // has explicitly opted into `allowNegative` — see its doc comment above).
    // Escrow-held money is counted in `balance` but is NOT spendable, so the guard is
    // against available balance. Beyond that one opt-in, there is deliberately no
    // override flag: `releaseHold` decrements `lockedAmount` before calling this, so
    // by the time the debit runs the money is genuinely free. A general escape hatch
    // here is how holds get bypassed later.
    if (type === 'debit' && entityType !== 'admin' && !allowNegative) {
        if (currentBalance - lockedAmount - amount < 0) {
            if (lockedAmount > 0 && currentBalance - amount >= 0) {
                throw new Error(
                    `Insufficient available balance. Current: ${currentBalance}, `
                    + `locked: ${lockedAmount}, debit: ${amount}`,
                );
            }
            throw new Error(`Insufficient balance. Current: ${currentBalance}, Debit: ${amount}`);
        }
    }

    // 3. Create transaction row
    const entityOid = entityType === 'admin'
        ? ADMIN_ENTITY_OID
        : new mongoose.Types.ObjectId(entityId);

    const [txn] = await Transaction.create([{
        paymentId: paymentId ? new mongoose.Types.ObjectId(paymentId) : null,
        orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
        entityType,
        entityId: entityOid,
        type,
        amount,
        balanceAfter: newBalance,
        currency: 'INR',
        status: 'completed',
        description,
        category,
        module,
        metadata
    }], { session });

    // 4. Update wallet balance atomically, plus lifetime totals by entity + type
    if (type === 'credit') {
        if (EARNING_ENTITY_TYPES.has(entityType) && countAsEarning !== false) {
            await Model.updateOne(filter, {
                $set: { balance: newBalance },
                $inc: { totalEarnings: amount }
            }, { session });
        } else if (entityType === 'admin') {
            await Model.updateOne(filter, {
                $set: { balance: newBalance },
                $inc: { totalRevenue: amount }
            }, { session });
        } else {
            await Model.updateOne(filter, { $set: { balance: newBalance } }, { session });
        }
    } else {
        await Model.updateOne(filter, { $set: { balance: newBalance } }, { session });
    }

    logger.info(`Transaction recorded: ${type} ${amount} INR for ${entityType}:${entityId} → balance ${newBalance}`);

    return {
        transaction: txn.toObject(),
        wallet: { balance: newBalance }
    };
}

/**
 * List transactions for an entity with pagination.
 */
export async function getTransactionsByEntity(entityType, entityId, { page = 1, limit = 20 } = {}) {
    const skip = (Math.max(1, page) - 1) * limit;
    const entityOid = entityType === 'admin'
        ? ADMIN_ENTITY_OID
        : new mongoose.Types.ObjectId(entityId);
    const filter = {
        entityType,
        entityId: entityOid
    };

    const [docs, total] = await Promise.all([
        Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Transaction.countDocuments(filter)
    ]);

    return {
        transactions: docs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

/**
 * Get transactions for a specific order across all entities.
 */
export async function getTransactionsByOrder(orderId) {
    return Transaction.find({ orderId: new mongoose.Types.ObjectId(orderId) })
        .sort({ createdAt: -1 })
        .lean();
}
