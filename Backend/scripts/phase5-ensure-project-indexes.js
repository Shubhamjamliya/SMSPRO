/**
 * Phase 5 migration — projects, stages and staged payment.
 *
 * `autoIndex: false` means Mongoose builds nothing on its own. Four of these
 * are correctness guarantees on money, not optimisations:
 *
 *   construction_projects.quotationId          unique+SPARSE — one project per
 *     accepted quotation, so a retried acceptance cannot create a second
 *     project holding a second lot of the customer's money. Sparse because a
 *     package-request-sourced project (see next) leaves this null.
 *   construction_projects.packageRequestId     unique+sparse — same guarantee,
 *     for the package/site-visit pipeline's fixed-price contracts. NEW.
 *   construction_project_stages {projectId,sequence}  unique — stage numbering
 *     cannot collide, which is what "approved in order" relies on.
 *   construction_project_stages.releaseReference  unique partial — the
 *     idempotency key handed to the escrow ledger. Without it, a double-tapped
 *     approval could pay a contractor twice.
 *
 * RE-RUN THIS after upgrading from a build where `quotationId` was the only
 * source: `syncIndexes()` rebuilds it from a plain unique index into a
 * unique+sparse one. Skipping that step means the SECOND package-sourced
 * project ever confirmed (quotationId: null) hits a duplicate-key error on
 * the old, non-sparse index.
 *
 * Run:      node scripts/phase5-ensure-project-indexes.js
 * Verify:   node scripts/phase5-ensure-project-indexes.js --verify
 * Rollback: node scripts/phase5-ensure-project-indexes.js --down
 *           Refuses if any project holds customer money.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ConstructionProject } from '../src/modules/construction/models/constructionProject.model.js';
import { ProjectStage } from '../src/modules/construction/models/projectStage.model.js';
import { StageSubmission } from '../src/modules/construction/models/stageSubmission.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const isDown = process.argv.includes('--down');
const isVerify = process.argv.includes('--verify');

const MODELS = [
  ['construction_projects', ConstructionProject],
  ['construction_project_stages', ProjectStage],
  ['construction_stage_submissions', StageSubmission],
];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const hasUnique = (indexes, keys) => indexes.some(
  (i) => i.unique === true
    && keys.every((k) => i.key?.[k] === 1)
    && Object.keys(i.key).length === keys.length,
);

/** `sparse` matters here specifically: without it, a second `null` row is rejected as a duplicate. */
const hasSparseUnique = (indexes, key) => indexes.some(
  (i) => i.unique === true && i.sparse === true && i.key?.[key] === 1 && Object.keys(i.key).length === 1,
);

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

  const projectIdx = await ConstructionProject.collection.indexes();
  if (!hasSparseUnique(projectIdx, 'quotationId')) {
    throw new Error(
      'CRITICAL: unique+sparse index on construction_projects.quotationId was not created (or is '
      + 'still the old non-sparse one — drop it manually and re-run if syncIndexes did not replace it). '
      + 'A retried acceptance could create two projects against one quotation, and a second '
      + 'package-sourced project would fail on a spurious duplicate-null error.',
    );
  }
  if (!hasSparseUnique(projectIdx, 'packageRequestId')) {
    throw new Error(
      'CRITICAL: unique+sparse index on construction_projects.packageRequestId was not created. '
      + 'A retried contract confirmation could create two projects against one package request.',
    );
  }

  const stageIdx = await ProjectStage.collection.indexes();
  if (!hasUnique(stageIdx, ['projectId', 'sequence'])) {
    throw new Error('CRITICAL: unique {projectId, sequence} on stages was not created.');
  }
  if (!stageIdx.some((i) => i.key?.releaseReference === 1 && i.unique === true)) {
    throw new Error(
      'CRITICAL: unique index on construction_project_stages.releaseReference was not created. '
      + 'Stage payments would NOT be idempotent — do not enable funding.',
    );
  }

  console.log('\n✓ Unique project (both sources), stage-sequence and release-reference indexes confirmed.');
  console.log('✓ Phase 5 project schema ready.');
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

  const stageIdx = await ProjectStage.collection.indexes();
  const releaseUnique = stageIdx.some((i) => i.key?.releaseReference === 1 && i.unique === true);
  console.log(releaseUnique
    ? '✓ release-reference idempotency index present.'
    : '✗ CRITICAL: release-reference index MISSING — stage payments are not idempotent.');
  if (!releaseUnique) ok = false;

  const projectIdx = await ConstructionProject.collection.indexes();
  const quotationSparseUnique = hasSparseUnique(projectIdx, 'quotationId');
  console.log(quotationSparseUnique
    ? '✓ quotationId unique+sparse index present.'
    : '✗ CRITICAL: quotationId is missing its unique+sparse index (or is still the old non-sparse one).');
  if (!quotationSparseUnique) ok = false;

  const packageRequestSparseUnique = hasSparseUnique(projectIdx, 'packageRequestId');
  console.log(packageRequestSparseUnique
    ? '✓ packageRequestId unique+sparse index present.'
    : '✗ CRITICAL: packageRequestId unique+sparse index is missing.');
  if (!packageRequestSparseUnique) ok = false;

  // Never more than one project per source document, whichever pipeline created it.
  const [dupeQuotations, dupePackages] = await Promise.all([
    ConstructionProject.aggregate([
      { $match: { quotationId: { $ne: null } } },
      { $group: { _id: '$quotationId', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]),
    ConstructionProject.aggregate([
      { $match: { packageRequestId: { $ne: null } } },
      { $group: { _id: '$packageRequestId', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]),
  ]);
  if (dupeQuotations.length || dupePackages.length) {
    console.log(`✗ CRITICAL: duplicate projects found — ${dupeQuotations.length} quotation(s), ${dupePackages.length} package request(s) with more than one project.`);
    ok = false;
  } else {
    console.log('✓ no source document (quotation or package request) has more than one project.');
  }

  const byStatus = await ConstructionProject.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = byStatus.reduce((a, r) => ({ ...a, [r._id]: r.count }), {});
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`  projects: ${total} total`
    + (total ? ` (${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(', ')})` : ''));

  // ---- The money invariants BRD §13 requires ----

  // Nothing may ever have paid out more than was put in.
  const overReleased = await ConstructionProject.find({
    isDeleted: { $ne: true },
    $expr: { $gt: [{ $add: ['$releasedAmount', '$refundedAmount'] }, '$fundedAmount'] },
  }).select('projectNumber fundedAmount releasedAmount refundedAmount').lean();
  if (overReleased.length) {
    console.log(`✗ CRITICAL: ${overReleased.length} project(s) released more than they hold:`);
    overReleased.forEach((p) => console.log(`      ${p.projectNumber}`));
    ok = false;
  } else {
    console.log('✓ no project has released more than was funded.');
  }

  // Funding may never exceed the agreed price.
  const overFunded = await ConstructionProject.countDocuments({
    isDeleted: { $ne: true },
    $expr: { $gt: ['$fundedAmount', '$agreedValue'] },
  });
  console.log(overFunded === 0
    ? '✓ no project is funded beyond its agreed value.'
    : `✗ ${overFunded} project(s) funded above the agreed value.`);
  if (overFunded > 0) ok = false;

  // Stage amounts must reconstruct the agreed value exactly.
  const projects = await ConstructionProject.find({ isDeleted: { $ne: true } })
    .select('projectNumber agreedValue').lean();
  const mismatched = [];
  for (const p of projects) {
    const agg = await ProjectStage.aggregate([
      { $match: { projectId: p._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const total = round2(agg[0]?.total || 0);
    if (total !== round2(p.agreedValue)) {
      mismatched.push(`${p.projectNumber} (${total} vs ${p.agreedValue})`);
    }
  }
  if (mismatched.length) {
    console.log(`✗ ${mismatched.length} project(s) whose stages do not sum to the agreed value:`);
    mismatched.forEach((m) => console.log(`      ${m}`));
    ok = false;
  } else if (projects.length) {
    console.log('✓ every project\'s stages sum exactly to its agreed value.');
  }

  // A paid stage with no release reference would be unauditable.
  const unreferenced = await ProjectStage.countDocuments({
    status: 'payment_released',
    $or: [{ releaseReference: '' }, { releaseReference: null }],
  });
  console.log(unreferenced === 0
    ? '✓ every released stage carries an idempotency reference.'
    : `✗ ${unreferenced} released stage(s) have no release reference.`);
  if (unreferenced > 0) ok = false;

  if (!ok) process.exitCode = 1;
}

async function down() {
  const holding = await ConstructionProject.countDocuments({
    isDeleted: { $ne: true },
    $expr: {
      $gt: [{ $subtract: ['$fundedAmount', { $add: ['$releasedAmount', '$refundedAmount'] }] }, 0],
    },
  });
  if (holding > 0) {
    throw new Error(
      `Refusing to roll back: ${holding} project(s) still hold customer money. `
      + 'Release or refund them first — dropping these would orphan real funds.',
    );
  }
  const count = await ConstructionProject.countDocuments();
  if (count > 0) {
    throw new Error(`Refusing to roll back: ${count} project record(s) exist.`);
  }
  for (const name of [
    'construction_stage_submissions',
    'construction_project_stages',
    'construction_projects',
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
