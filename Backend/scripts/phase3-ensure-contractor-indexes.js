/**
 * Phase 3 migration — contractor onboarding.
 *
 * `autoIndex: false` on the connection means Mongoose builds nothing on its own.
 * Two of these indexes are correctness guarantees rather than optimisations:
 *
 *   construction_contractors.userId      unique — one contractor account per
 *                                        platform identity (BRD Rule 1)
 *   construction_contractors.phoneLast10 unique — stops the same number being
 *                                        registered twice under two businesses
 *
 * Note both use `isDeleted: false` rather than `{ $ne: true }`. MongoDB rejects
 * $ne inside partialFilterExpression outright, which silently leaves the index
 * unbuilt — the exact bug that bit Phase 2.
 *
 * Run:      node scripts/phase3-ensure-contractor-indexes.js
 * Verify:   node scripts/phase3-ensure-contractor-indexes.js --verify
 * Rollback: node scripts/phase3-ensure-contractor-indexes.js --down
 *           Refuses if any contractor exists.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ContractorProfile } from '../src/modules/construction/models/contractorProfile.model.js';
import { ContractorDocument } from '../src/modules/construction/models/contractorDocument.model.js';
import { ContractorPortfolio } from '../src/modules/construction/models/contractorPortfolio.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const isDown = process.argv.includes('--down');
const isVerify = process.argv.includes('--verify');

const MODELS = [
  ['construction_contractors', ContractorProfile],
  ['construction_contractor_documents', ContractorDocument],
  ['construction_contractor_portfolio', ContractorPortfolio],
];

const REQUIRED_UNIQUE = [
  ['construction_contractors', 'userId'],
  ['construction_contractors', 'phoneLast10'],
];

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

  const contractorIndexes = await ContractorProfile.collection.indexes();
  for (const [, field] of REQUIRED_UNIQUE) {
    const found = contractorIndexes.some((i) => i.key?.[field] === 1 && i.unique === true);
    if (!found) {
      throw new Error(
        `CRITICAL: unique index on construction_contractors.${field} was not created. `
        + 'Duplicate contractor accounts would be possible — do not open registration.',
      );
    }
  }

  console.log('\n✓ Unique indexes on userId and phoneLast10 confirmed.');
  console.log('✓ Phase 3 contractor schema ready.');
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

  const contractorIndexes = await ContractorProfile.collection.indexes();
  for (const [, field] of REQUIRED_UNIQUE) {
    const found = contractorIndexes.some((i) => i.key?.[field] === 1 && i.unique === true);
    console.log(found
      ? `✓ unique index on ${field} present.`
      : `✗ CRITICAL: unique index on ${field} MISSING.`);
    if (!found) ok = false;
  }

  const byStatus = await ContractorProfile.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = byStatus.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  console.log(
    `  contractors: ${counts.onboarding || 0} registering, ${counts.pending_approval || 0} awaiting review, `
    + `${counts.approved || 0} approved, ${counts.rejected || 0} rejected`,
  );

  // An approved contractor holding an expired document is live on the platform
  // with an incomplete verification — the thing Rule 6 exists to prevent.
  const { findApprovedContractorsWithLapsedDocuments } = await import(
    '../src/modules/construction/services/documentExpiry.service.js'
  );
  const lapsed = await findApprovedContractorsWithLapsedDocuments();
  if (lapsed.length) {
    console.log(`  ⚠ ${lapsed.length} approved contractor(s) hold an expired document:`);
    for (const c of lapsed) {
      console.log(`      ${c.contractorCode || c._id} — ${c.businessName} (${c.lapsedDocuments.length})`);
    }
  } else {
    console.log('  ✓ no approved contractor holds an expired document.');
  }

  if (!ok) process.exitCode = 1;
}

async function down() {
  const count = await ContractorProfile.countDocuments();
  if (count > 0) {
    throw new Error(
      `Refusing to roll back: ${count} contractor record(s) exist. `
      + 'Dropping these would discard real registrations and their verification history.',
    );
  }
  for (const name of [
    'construction_contractor_portfolio',
    'construction_contractor_documents',
    'construction_contractors',
  ]) {
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
  console.log(`Connected to db=${mongoose.connection.name}\n`);

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
