/**
 * Phase 2 migration — construction catalogue and settings.
 *
 * The connection sets `autoIndex: false`, so Mongoose never builds indexes on its
 * own. Without this script the unique partial indexes on `slug` do not exist and
 * two categories could share one slug, which would break the customer-facing
 * lookup by slug.
 *
 * Creates (idempotent, non-destructive):
 *   - construction_categories   unique partial {slug}, {isDeleted,status,displayOrder}
 *   - construction_services     unique partial {slug}, {isDeleted,status,categoryId,displayOrder}
 *   - construction_settings     unique {key}  (guards the singleton)
 *
 * Also seeds the settings singleton so every schema default becomes a real,
 * editable row rather than an implicit value.
 *
 * Run:      node scripts/phase2-ensure-construction-catalogue-indexes.js
 * Verify:   node scripts/phase2-ensure-construction-catalogue-indexes.js --verify
 * Rollback: node scripts/phase2-ensure-construction-catalogue-indexes.js --down
 *           Refuses if any category or service exists — dropping them would
 *           discard the client's own service list.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ConstructionCategory } from '../src/modules/construction/models/constructionCategory.model.js';
import { ConstructionService } from '../src/modules/construction/models/constructionService.model.js';
import { ConstructionSettings } from '../src/modules/construction/models/constructionSettings.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const isDown = process.argv.includes('--down');
const isVerify = process.argv.includes('--verify');

const MODELS = [
  ['construction_categories', ConstructionCategory],
  ['construction_services', ConstructionService],
  ['construction_settings', ConstructionSettings],
];

const hasUniqueSlug = (idx) => idx.key?.slug === 1 && idx.unique === true;

async function ensureCollection(name) {
  const existing = await mongoose.connection.db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await mongoose.connection.db.createCollection(name);
    console.log(`  created collection ${name}`);
  }
}

async function up() {
  for (const [name, Model] of MODELS) {
    await ensureCollection(name);
    await Model.syncIndexes();
    const indexes = await Model.collection.indexes();
    console.log(`${name}: ${indexes.map((i) => i.name).join(', ')}`);
  }

  for (const [name, Model] of MODELS.slice(0, 2)) {
    const indexes = await Model.collection.indexes();
    if (!indexes.some(hasUniqueSlug)) {
      throw new Error(`CRITICAL: unique slug index missing on ${name}.`);
    }
  }

  const existing = await ConstructionSettings.findOne({ key: 'construction' }).lean();
  if (!existing) {
    await ConstructionSettings.create({ key: 'construction' });
    console.log('\n  seeded construction_settings singleton with schema defaults');
  } else {
    console.log('\n  construction_settings singleton already present');
  }

  console.log('✓ Phase 2 catalogue schema ready.');
  console.log('  Next: fill in categories and services from Admin → Construction.');
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

  const settingsCount = await ConstructionSettings.countDocuments();
  if (settingsCount === 1) {
    console.log('✓ settings singleton present (exactly one row).');
  } else {
    console.log(`✗ expected exactly 1 settings row, found ${settingsCount}.`);
    ok = false;
  }

  const [categories, services] = await Promise.all([
    ConstructionCategory.countDocuments({ isDeleted: { $ne: true } }),
    ConstructionService.countDocuments({ isDeleted: { $ne: true } }),
  ]);
  console.log(`  catalogue: ${categories} categor${categories === 1 ? 'y' : 'ies'}, ${services} service${services === 1 ? '' : 's'}`);

  // An active category with no active services is a dead end in the customer app.
  const orphanCategories = await ConstructionCategory.aggregate([
    { $match: { isDeleted: { $ne: true }, status: 'active' } },
    {
      $lookup: {
        from: 'construction_services',
        let: { cid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$categoryId', '$$cid'] }, isDeleted: { $ne: true }, status: 'active' } },
          { $limit: 1 },
        ],
        as: 'svc',
      },
    },
    { $match: { svc: { $size: 0 } } },
    { $project: { name: 1 } },
  ]);
  if (orphanCategories.length) {
    console.log(
      `  note: ${orphanCategories.length} active categor${orphanCategories.length === 1 ? 'y has' : 'ies have'} no active services `
      + `(${orphanCategories.map((c) => c.name).join(', ')}) — hidden from customers until you add some.`,
    );
  }

  if (!ok) process.exitCode = 1;
}

async function down() {
  const [categories, services] = await Promise.all([
    ConstructionCategory.countDocuments(),
    ConstructionService.countDocuments(),
  ]);
  if (categories > 0 || services > 0) {
    throw new Error(
      `Refusing to roll back: ${categories} categor${categories === 1 ? 'y' : 'ies'} and ${services} service${services === 1 ? '' : 's'} exist. `
      + 'Dropping these would discard the configured service list.',
    );
  }
  for (const name of ['construction_services', 'construction_categories', 'construction_settings']) {
    try {
      await mongoose.connection.db.collection(name).drop();
      console.log(`Rolled back: dropped ${name}.`);
    } catch (e) {
      if (e?.codeName === 'NamespaceNotFound') console.log(`${name} did not exist — nothing to drop.`);
      else throw e;
    }
  }
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
