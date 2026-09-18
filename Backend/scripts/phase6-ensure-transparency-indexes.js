/**
 * Phase 6 migration — documents (C19), messaging (C20), disputes (Q15), score (W18).
 *
 * `autoIndex: false` means Mongoose builds nothing on its own. One index here is
 * a correctness guarantee on money, not an optimisation:
 *
 *   construction_disputes.stageId  unique, partial on live statuses — one live
 *     dispute per stage. Without it, two people arguing about the same stage
 *     produce two freezes and two resolutions against one pot of money, which is
 *     how a stage gets paid out twice.
 *
 * Run:      node scripts/phase6-ensure-transparency-indexes.js
 * Verify:   node scripts/phase6-ensure-transparency-indexes.js --verify
 * Rollback: node scripts/phase6-ensure-transparency-indexes.js --down
 *           Refuses while any dispute is still freezing customer money.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ProjectDocument } from '../src/modules/construction/models/projectDocument.model.js';
import { ProjectMessage } from '../src/modules/construction/models/projectMessage.model.js';
import { ProjectDispute } from '../src/modules/construction/models/projectDispute.model.js';
import { ContractorScore } from '../src/modules/construction/models/contractorScore.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const isDown = process.argv.includes('--down');
const isVerify = process.argv.includes('--verify');

const MODELS = [
  ['construction_project_documents', ProjectDocument],
  ['construction_project_messages', ProjectMessage],
  ['construction_disputes', ProjectDispute],
  ['construction_contractor_scores', ContractorScore],
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

  const disputeIdx = await ProjectDispute.collection.indexes();
  const liveDispute = disputeIdx.find((i) => i.name === 'one_live_dispute_per_stage');
  if (!liveDispute || liveDispute.unique !== true) {
    throw new Error(
      'CRITICAL: the unique partial index on construction_disputes.stageId was not created. '
      + 'Two live disputes could freeze and settle the same stage twice. '
      + 'Note: partialFilterExpression with $in needs MongoDB 5.0 or newer.',
    );
  }
  console.log(`\n  live-dispute filter: ${JSON.stringify(liveDispute.partialFilterExpression)}`);

  const scoreIdx = await ContractorScore.collection.indexes();
  if (!scoreIdx.some((i) => i.key?.contractorId === 1 && i.unique === true)) {
    throw new Error('CRITICAL: unique contractorId on construction_contractor_scores was not created.');
  }

  console.log('\n✓ One-live-dispute-per-stage and one-score-per-contractor indexes confirmed.');
  console.log('✓ Phase 6 transparency schema ready.');
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

  const disputeIdx = await ProjectDispute.collection.indexes();
  const live = disputeIdx.some((i) => i.name === 'one_live_dispute_per_stage' && i.unique === true);
  console.log(live
    ? '✓ one-live-dispute-per-stage index present.'
    : '✗ CRITICAL: a stage could carry two live disputes — do not enable disputes.');
  if (!live) ok = false;

  // ---- the invariants Phase 6 has to hold ----

  // A resolved dispute must have allocated exactly what it froze.
  const resolved = await ProjectDispute.find({
    status: 'resolved',
    outcome: { $ne: 'dismissed' },
    isDeleted: { $ne: true },
  }).select('disputeNumber frozenAmount amountToContractor amountToCustomer').lean();

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const mismatched = resolved.filter((d) => round2(d.amountToContractor + d.amountToCustomer)
    !== round2(d.frozenAmount));
  if (mismatched.length) {
    console.log(`✗ CRITICAL: ${mismatched.length} dispute(s) did not allocate the frozen amount:`);
    mismatched.forEach((d) => console.log(
      `      ${d.disputeNumber}: froze ${d.frozenAmount}, allocated `
      + `${round2(d.amountToContractor + d.amountToCustomer)}`,
    ));
    ok = false;
  } else {
    console.log('✓ every resolved dispute allocated exactly what it froze.');
  }

  // A live dispute must correspond to a frozen stage, or the money is not
  // actually held and the freeze is a fiction.
  const { ProjectStage } = await import('../src/modules/construction/models/projectStage.model.js');
  const liveWithStage = await ProjectDispute.find({
    status: { $in: ['open', 'under_review'] },
    stageId: { $ne: null },
    isDeleted: { $ne: true },
  }).select('disputeNumber stageId').lean();

  const unfrozen = [];
  for (const d of liveWithStage) {
    const stage = await ProjectStage.findById(d.stageId).select('status').lean();
    if (stage && stage.status !== 'disputed') unfrozen.push(`${d.disputeNumber} (${stage.status})`);
  }
  if (unfrozen.length) {
    console.log(`✗ ${unfrozen.length} live dispute(s) whose stage is NOT frozen: ${unfrozen.join(', ')}`);
    ok = false;
  } else {
    console.log('✓ every live dispute has its stage frozen.');
  }

  // A frozen stage with no live dispute can never be released or resubmitted.
  const orphanFrozen = await ProjectStage.find({ status: 'disputed' }).select('_id name').lean();
  const stranded = [];
  for (const stage of orphanFrozen) {
    const open = await ProjectDispute.countDocuments({
      stageId: stage._id,
      status: { $in: ['open', 'under_review'] },
      isDeleted: { $ne: true },
    });
    if (open === 0) stranded.push(stage.name);
  }
  if (stranded.length) {
    console.log(`✗ ${stranded.length} stage(s) frozen with no live dispute: ${stranded.join(', ')}`);
    ok = false;
  } else {
    console.log('✓ no stage is frozen without a live dispute.');
  }

  // Document version chains must have exactly one current version each.
  const groups = await ProjectDocument.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: '$documentGroupId', latest: { $sum: { $cond: ['$isLatest', 1, 0] } } } },
    { $match: { latest: { $ne: 1 } } },
  ]);
  console.log(groups.length === 0
    ? '✓ every document has exactly one current version.'
    : `✗ ${groups.length} document group(s) have zero or multiple current versions.`);
  if (groups.length) ok = false;

  const counts = await Promise.all(MODELS.map(async ([name, Model]) => {
    const n = await Model.countDocuments({});
    return `${name.replace('construction_', '')}: ${n}`;
  }));
  console.log(`  rows — ${counts.join(', ')}`);

  if (!ok) process.exitCode = 1;
}

async function down() {
  const freezing = await ProjectDispute.countDocuments({
    status: { $in: ['open', 'under_review'] },
    frozenAmount: { $gt: 0 },
    isDeleted: { $ne: true },
  });
  if (freezing > 0) {
    throw new Error(
      `Refusing to roll back: ${freezing} dispute(s) are still freezing customer money. `
      + 'Resolve them first — dropping these would strand the freeze with nothing to lift it.',
    );
  }

  const messages = await ProjectMessage.countDocuments({});
  if (messages > 0) {
    throw new Error(
      `Refusing to roll back: ${messages} project message(s) exist. BRD C20 makes the `
      + 'conversation a permanent record — dropping it destroys evidence of what was agreed.',
    );
  }

  const documents = await ProjectDocument.countDocuments({});
  if (documents > 0) {
    throw new Error(
      `Refusing to roll back: ${documents} project document(s) exist. These are the papers `
      + 'BRD C19 says people need years later.',
    );
  }

  for (const name of [
    'construction_contractor_scores',
    'construction_disputes',
    'construction_project_messages',
    'construction_project_documents',
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

  const { version } = await mongoose.connection.db.admin().serverInfo();
  console.log(`Connected to db=${mongoose.connection.name} (MongoDB ${version})\n`);

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
