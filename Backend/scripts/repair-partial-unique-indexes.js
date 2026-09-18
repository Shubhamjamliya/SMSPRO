/**
 * Build the unique indexes that never existed.
 *
 * THE BUG
 * `partialFilterExpression` accepts only equality-style operators. MongoDB reads
 * `$ne` as `$not` and rejects the ENTIRE index specification — so fifteen index
 * definitions across bike-rent, service-provider, quick-commerce and food were
 * silently never built. Every uniqueness guarantee they declare has been absent
 * from the database the whole time:
 *
 *   bike_categories.slug            duplicate category slugs
 *   bike_rent_hubs.code             duplicate hub codes
 *   bike_units.registrationNumber   the same bike registered twice
 *   sp_services.slug, sp_categories.slug
 *   qc_carts / qc_wishlists         two carts for one user or session
 *   qc_sellers.isAdminHub           more than one admin hub
 *   qc_seller_transactions.referenceId   a payout recorded twice
 *   food_user_subscriptions         a restaurant or rider billed twice over
 *
 * The model definitions are now corrected. This script builds the indexes, and
 * REFUSES where existing data already violates the constraint — because the
 * duplicates are a real problem that needs a person, not a script that picks a
 * winner at random.
 *
 * Run:    node scripts/repair-partial-unique-indexes.js --check   (read-only)
 *         node scripts/repair-partial-unique-indexes.js           (builds them)
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const CHECK_ONLY = process.argv.includes('--check');

/**
 * Each entry: the collection, the index, and the filter that decides which
 * documents the uniqueness applies to.
 */
const TARGETS = [
  {
    collection: 'bike_categories',
    key: { slug: 1 },
    filter: { isDeleted: false, slug: { $type: 'string' } },
    name: 'slug_unique_active',
    groupBy: ['slug'],
  },
  {
    collection: 'bike_rent_hubs',
    key: { code: 1 },
    filter: { isDeleted: false },
    name: 'code_unique_active',
    groupBy: ['code'],
  },
  {
    collection: 'bike_units',
    key: { registrationNumber: 1 },
    filter: { isDeleted: false },
    name: 'registration_unique_active',
    groupBy: ['registrationNumber'],
  },
  {
    collection: 'service_provider_services',
    key: { slug: 1 },
    filter: { isDeleted: false, slug: { $type: 'string' } },
    name: 'slug_unique_active',
    groupBy: ['slug'],
  },
  {
    collection: 'service_provider_categories',
    key: { slug: 1 },
    filter: { isDeleted: false, slug: { $type: 'string' } },
    name: 'slug_unique_active',
    groupBy: ['slug'],
  },
  {
    collection: 'qc_carts',
    key: { userId: 1 },
    filter: { userId: { $type: 'objectId' } },
    name: 'user_cart_unique',
    groupBy: ['userId'],
  },
  {
    collection: 'qc_wishlists',
    key: { userId: 1 },
    filter: { userId: { $type: 'objectId' } },
    name: 'user_wishlist_unique',
    groupBy: ['userId'],
  },
  {
    collection: 'qc_seller_transactions',
    key: { referenceId: 1 },
    filter: { referenceId: { $type: 'string', $gt: '' } },
    name: 'reference_unique',
    groupBy: ['referenceId'],
  },
  {
    collection: 'food_user_subscriptions',
    key: { restaurantId: 1 },
    filter: { restaurantId: { $type: 'objectId' }, status: { $in: ['active', 'grace'] } },
    name: 'restaurant_active_subscription_unique',
    groupBy: ['restaurantId'],
  },
  {
    collection: 'food_user_subscriptions',
    key: { deliveryBoyId: 1 },
    filter: { deliveryBoyId: { $type: 'objectId' }, status: { $in: ['active', 'grace'] } },
    name: 'delivery_active_subscription_unique',
    groupBy: ['deliveryBoyId'],
  },
];

/** Are there already documents that would violate this index? */
async function findDuplicates(db, target) {
  const groupId = target.groupBy.reduce((acc, f) => ({ ...acc, [f]: `$${f}` }), {});
  const rows = await db.collection(target.collection).aggregate([
    { $match: target.filter },
    { $group: { _id: groupId, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]).toArray();
  return rows;
}

async function run() {
  if (!mongoUrl) throw new Error('No MongoDB URI found. Check Backend/.env');
  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  const db = mongoose.connection.db;
  const { version } = await db.admin().serverInfo();
  console.log(`Connected to db=${mongoose.connection.name} (MongoDB ${version})`);
  console.log(CHECK_ONLY ? 'Mode: CHECK ONLY — nothing will be built\n' : 'Mode: building indexes\n');

  let built = 0;
  let already = 0;
  let blocked = 0;
  let missing = 0;

  for (const target of TARGETS) {
    const label = `${target.collection}.${Object.keys(target.key).join('+')}`;

    const exists = await db.listCollections({ name: target.collection }).toArray();
    if (exists.length === 0) {
      console.log(`  –  ${label.padEnd(52)} collection does not exist yet`);
      missing += 1;
      continue;
    }

    const indexes = await db.collection(target.collection).indexes();
    if (indexes.some((i) => i.name === target.name)) {
      console.log(`  ✓  ${label.padEnd(52)} already present`);
      already += 1;
      continue;
    }

    const duplicates = await findDuplicates(db, target);
    if (duplicates.length > 0) {
      const total = duplicates.reduce((s, d) => s + d.count, 0);
      console.log(`  ✗  ${label.padEnd(52)} BLOCKED — ${duplicates.length} duplicate group(s), ${total} rows`);
      duplicates.slice(0, 3).forEach((d) => {
        console.log(`         ${JSON.stringify(d._id)} appears ${d.count} times`);
      });
      console.log('         Resolve these by hand, then re-run. A script must not');
      console.log('         pick which duplicate survives.');
      blocked += 1;
      continue;
    }

    if (CHECK_ONLY) {
      console.log(`  ·  ${label.padEnd(52)} ready to build (no duplicates)`);
      continue;
    }

    try {
      await db.collection(target.collection).createIndex(target.key, {
        unique: true,
        partialFilterExpression: target.filter,
        name: target.name,
      });
      console.log(`  ✓  ${label.padEnd(52)} BUILT`);
      built += 1;
    } catch (error) {
      console.log(`  ✗  ${label.padEnd(52)} failed: ${error.message.split('::')[0].trim()}`);
      blocked += 1;
    }
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log(
    CHECK_ONLY
      ? `  already present: ${already}   blocked by duplicates: ${blocked}   `
        + `collection absent: ${missing}`
      : `  built: ${built}   already present: ${already}   blocked: ${blocked}   `
        + `collection absent: ${missing}`,
  );
  console.log('='.repeat(64));

  if (blocked > 0) {
    console.log('\nSome constraints could not be applied. Until they are, the data can');
    console.log('continue to accumulate duplicates.');
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
