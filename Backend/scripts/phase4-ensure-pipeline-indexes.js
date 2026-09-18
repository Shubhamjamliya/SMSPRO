/**
 * Phase 4 migration — enquiry → lead → site visit → quotation.
 *
 * `autoIndex: false` means Mongoose builds nothing on its own. Two of these are
 * correctness guarantees rather than optimisations:
 *
 *   construction_leads {enquiryId, contractorId}  unique — a contractor is
 *     offered a given enquiry exactly once, so re-running the matcher tops the
 *     shortlist up instead of double-offering.
 *   construction_quotation_templates {contractorId, name} unique — one template
 *     per name per contractor.
 *
 * Also builds the 2dsphere index on the enquiry site pin, without which any
 * distance-based matching would fail outright rather than degrade.
 *
 * Run:      node scripts/phase4-ensure-pipeline-indexes.js
 * Verify:   node scripts/phase4-ensure-pipeline-indexes.js --verify
 * Rollback: node scripts/phase4-ensure-pipeline-indexes.js --down
 *           Refuses if any enquiry exists.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ConstructionEnquiry } from '../src/modules/construction/models/constructionEnquiry.model.js';
import { ContractorLead } from '../src/modules/construction/models/contractorLead.model.js';
import { SiteVisit } from '../src/modules/construction/models/siteVisit.model.js';
import { Quotation } from '../src/modules/construction/models/quotation.model.js';
import { QuotationTemplate } from '../src/modules/construction/models/quotationTemplate.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const isDown = process.argv.includes('--down');
const isVerify = process.argv.includes('--verify');

const MODELS = [
  ['construction_enquiries', ConstructionEnquiry],
  ['construction_leads', ContractorLead],
  ['construction_site_visits', SiteVisit],
  ['construction_quotations', Quotation],
  ['construction_quotation_templates', QuotationTemplate],
];

const hasCompoundUnique = (indexes, keys) => indexes.some(
  (i) => i.unique === true && keys.every((k) => i.key?.[k] === 1)
    && Object.keys(i.key).length === keys.length,
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

  const leadIndexes = await ContractorLead.collection.indexes();
  if (!hasCompoundUnique(leadIndexes, ['enquiryId', 'contractorId'])) {
    throw new Error(
      'CRITICAL: unique index on construction_leads {enquiryId, contractorId} was not created. '
      + 'Re-running the matcher would double-offer enquiries.',
    );
  }

  const enquiryIndexes = await ConstructionEnquiry.collection.indexes();
  const hasGeo = enquiryIndexes.some((i) => i.key?.['site.location'] === '2dsphere');
  if (!hasGeo) throw new Error('CRITICAL: 2dsphere index on construction_enquiries.site.location missing.');

  console.log('\n✓ Unique lead index and site geo index confirmed.');
  console.log('✓ Phase 4 pipeline schema ready.');
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

  const leadIndexes = await ContractorLead.collection.indexes();
  const leadUnique = hasCompoundUnique(leadIndexes, ['enquiryId', 'contractorId']);
  console.log(leadUnique
    ? '✓ unique {enquiryId, contractorId} on leads present.'
    : '✗ CRITICAL: unique lead index MISSING — double-offers are possible.');
  if (!leadUnique) ok = false;

  const byStatus = await ConstructionEnquiry.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = byStatus.reduce((a, r) => ({ ...a, [r._id]: r.count }), {});
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`  enquiries: ${total} total`
    + (total ? ` (${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(', ')})` : ''));

  // Exactly one version per contractor per enquiry may be flagged latest —
  // two would make "the current quote" ambiguous at acceptance time.
  const dupLatest = await Quotation.aggregate([
    { $match: { isLatest: true, isDeleted: { $ne: true } } },
    { $group: { _id: { e: '$enquiryId', c: '$contractorId' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  if (dupLatest.length) {
    console.log(`✗ ${dupLatest.length} enquiry/contractor pair(s) have more than one 'latest' quotation.`);
    ok = false;
  } else {
    console.log('✓ every enquiry/contractor pair has at most one latest quotation.');
  }

  // Stage percentages must total 100 — the invariant the escrow ledger relies on.
  const badStages = await Quotation.aggregate([
    { $match: { isDeleted: { $ne: true }, 'proposedStages.0': { $exists: true } } },
    { $project: { quotationNumber: 1, sum: { $sum: '$proposedStages.percentage' } } },
    { $match: { sum: { $ne: 100 } } },
  ]);
  if (badStages.length) {
    console.log(`✗ ${badStages.length} quotation(s) have stage percentages not totalling 100: `
      + badStages.map((q) => q.quotationNumber).join(', '));
    ok = false;
  } else {
    console.log('✓ all quotation stage plans total 100%.');
  }

  if (!ok) process.exitCode = 1;
}

async function down() {
  const count = await ConstructionEnquiry.countDocuments();
  if (count > 0) {
    throw new Error(
      `Refusing to roll back: ${count} enquiry record(s) exist. `
      + 'Dropping these would discard real customer enquiries and quotations.',
    );
  }
  for (const name of [
    'construction_quotation_templates',
    'construction_quotations',
    'construction_site_visits',
    'construction_leads',
    'construction_enquiries',
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
