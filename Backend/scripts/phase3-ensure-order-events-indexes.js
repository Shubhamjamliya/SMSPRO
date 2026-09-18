/**
 * Phase 3 migration — ensure indexes for the durable order-event log (/sync + outbox).
 *
 * Creates (idempotent, non-destructive) on `food_order_events`:
 *   - { ownerType, ownerId, seq }  (/sync?since_seq=N)
 *   - { eventId }                  (dedup / lookup)
 *   - { publishedAt }              (relay worker — Phase 3B)
 *   - TTL { createdAt } 7 days
 *
 * Run:      node scripts/phase3-ensure-order-events-indexes.js
 * Rollback: node scripts/phase3-ensure-order-events-indexes.js --down   (drops the collection)
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodOrderEvent } from '../src/modules/food/orders/models/orderEvent.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const isDown = process.argv.includes('--down');

async function run() {
  if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  console.log('Connected.');

  if (isDown) {
    try {
      await mongoose.connection.db.collection('food_order_events').drop();
      console.log('Rolled back: dropped food_order_events collection.');
    } catch (e) {
      if (e?.codeName === 'NamespaceNotFound') console.log('food_order_events did not exist — nothing to drop.');
      else throw e;
    }
  } else {
    await FoodOrderEvent.syncIndexes();
    const indexes = await FoodOrderEvent.collection.indexes();
    console.log('food_order_events indexes:', indexes.map((i) => i.name).join(', '));
    console.log('Done.');
  }

  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
