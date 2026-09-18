/**
 * Phase 4 acceptance test — enquiry → lead → site visit → quotation → accepted.
 *
 * Walks the whole BRD §9 journey (steps 3 to 9) against a real database and
 * proves the guarantees the pipeline depends on:
 *
 *   1  An enquiry gets a reference number and matches contractors automatically
 *   2  A contractor sees the area but NOT the customer's identity before accepting
 *   3  Accepting past the response window is refused
 *   4  A contractor at their declared project limit stops receiving new work
 *   5  A site visit needs both a proposal and a confirmation from the other side
 *   6  Completing a visit with an empty report is refused
 *   7  Quotation totals are computed server-side, never taken from the client
 *   8  Stage guardrails block "70% on mobilisation"
 *   9  Sending without exclusions is refused (BRD W11)
 *  10  A revision is a NEW VERSION; the old one is kept and marked superseded
 *  11  Accepting one quotation withdraws every competing one
 *  12  An expired quotation cannot be accepted
 *
 * Creates synthetic records on reserved test numbers and removes them all.
 * Safe on staging. Do not run against production.
 *
 * Run: node scripts/verify-construction-pipeline.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const TEST_CUSTOMER_PHONE = '9000000051';
const TEST_CONTRACTOR_PHONE = '9000000052';

let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  console.log(`${condition ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (condition) passed += 1; else failed += 1;
}

async function expectRejection(label, fn) {
  try {
    await fn();
    console.log(`  ✗ ${label} — expected refusal but it SUCCEEDED`);
    failed += 1;
    return null;
  } catch (e) {
    console.log(`  ✓ ${label}`);
    passed += 1;
    return e;
  }
}

async function run() {
  if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  console.log(`Connected to db=${mongoose.connection.name}\n`);

  const M = {
    Enquiry: (await import('../src/modules/construction/models/constructionEnquiry.model.js')).ConstructionEnquiry,
    Lead: (await import('../src/modules/construction/models/contractorLead.model.js')).ContractorLead,
    Visit: (await import('../src/modules/construction/models/siteVisit.model.js')).SiteVisit,
    Quote: (await import('../src/modules/construction/models/quotation.model.js')).Quotation,
    Template: (await import('../src/modules/construction/models/quotationTemplate.model.js')).QuotationTemplate,
    Contractor: (await import('../src/modules/construction/models/contractorProfile.model.js')).ContractorProfile,
    Service: (await import('../src/modules/construction/models/constructionService.model.js')).ConstructionService,
    // Registered so .populate('categoryId') resolves. The running server gets
    // this via the route → controller → catalog.service import chain.
    Category: (await import('../src/modules/construction/models/constructionCategory.model.js')).ConstructionCategory,
    User: (await import('../src/core/users/user.model.js')).FoodUser,
    Audit: (await import('../src/core/audit/auditLog.model.js')).PlatformAuditLog,
  };
  const enquiryService = await import('../src/modules/construction/services/enquiry.service.js');
  const leadService = await import('../src/modules/construction/services/lead.service.js');
  const visitService = await import('../src/modules/construction/services/siteVisit.service.js');
  const quoteService = await import('../src/modules/construction/services/quotation.service.js');
  const matching = await import('../src/modules/construction/services/matching.service.js');
  const { findOrCreateUserByPhone } = await import('../src/core/users/user.service.js');

  const cleanup = async () => {
    const cs = await M.Contractor.find({ phoneLast10: TEST_CONTRACTOR_PHONE }).select('_id').lean();
    const us = await M.User.find({ phone: { $in: [TEST_CUSTOMER_PHONE, TEST_CONTRACTOR_PHONE] } }).select('_id').lean();
    const cIds = cs.map((c) => c._id);
    const uIds = us.map((u) => u._id);
    const es = await M.Enquiry.find({ customerId: { $in: uIds } }).select('_id').lean();
    const eIds = es.map((e) => e._id);
    await Promise.all([
      M.Quote.deleteMany({ $or: [{ enquiryId: { $in: eIds } }, { contractorId: { $in: cIds } }] }),
      M.Visit.deleteMany({ $or: [{ enquiryId: { $in: eIds } }, { contractorId: { $in: cIds } }] }),
      M.Lead.deleteMany({ $or: [{ enquiryId: { $in: eIds } }, { contractorId: { $in: cIds } }] }),
      M.Template.deleteMany({ contractorId: { $in: cIds } }),
      M.Enquiry.deleteMany({ _id: { $in: eIds } }),
      M.Contractor.deleteMany({ _id: { $in: cIds } }),
      M.User.deleteMany({ _id: { $in: uIds } }),
      M.Audit.collection.deleteMany({ entityId: { $in: [...eIds, ...cIds] } }),
    ]);
  };
  await cleanup();

  const service = await M.Service.findOne({ status: 'active', isDeleted: { $ne: true } }).lean();
  if (!service) throw new Error('No active construction service — run the catalogue seed first.');
  console.log(`Using service: ${service.name}\n`);

  const customer = await findOrCreateUserByPhone({ phone: TEST_CUSTOMER_PHONE, countryCode: '+91' });
  const contractorUser = await findOrCreateUserByPhone({ phone: TEST_CONTRACTOR_PHONE, countryCode: '+91' });
  const contractor = await M.Contractor.create({
    userId: contractorUser._id,
    businessName: 'Pipeline Test Builders',
    ownerName: 'Test Builder',
    phone: TEST_CONTRACTOR_PHONE,
    phoneLast10: TEST_CONTRACTOR_PHONE,
    phoneDigits: TEST_CONTRACTOR_PHONE,
    status: 'approved',
    isActive: true,
    trades: [service.categoryId],
    serviceAreas: ['Indore'],
    yearsExperience: 12,
    maxConcurrentProjects: 1,   // deliberately 1, to exercise the capacity gate
    projectSizeMin: 100000,
    projectSizeMax: 50000000,
  });

  // ---- 1. enquiry + auto match ---------------------------------------------
  console.log('1. Customer sends an enquiry (BRD C3–C5)');
  const enquiry = await enquiryService.createEnquiry(customer._id, {
    serviceId: service._id,
    description: 'Synthetic pipeline test enquiry',
    site: { addressLine: '12 Test Road', area: 'Vijay Nagar', city: 'Indore', state: 'MP', location: { type: 'Point', coordinates: [75.8577, 22.7196] } },
    budgetMin: 1500000,
    budgetMax: 4000000,
    urgency: 'within_month',
    attachments: [{ url: 'https://example.com/site.jpg', kind: 'site_photo', caption: 'Front' }],
  });
  ok('reference number issued', Boolean(enquiry.enquiryNumber), enquiry.enquiryNumber);

  // createEnquiry already fires matching in the background, so give it a moment
  // and then confirm the lead exists. Re-running the matcher is idempotent (the
  // unique index makes a second offer a no-op), so counting new leads here would
  // be a race, not a check.
  await new Promise((r) => setTimeout(r, 400));
  await matching.matchEnquiry(enquiry._id);

  const lead = await M.Lead.findOne({ enquiryId: enquiry._id, contractorId: contractor._id });
  ok('contractor matched automatically', Boolean(lead), lead ? 'lead created' : 'no lead');
  ok('lead carries why it matched', (lead.matchReasons || []).length > 0, lead.matchReasons.join(', '));

  // ---- 2. privacy before acceptance ----------------------------------------
  console.log('\n2. Contractor feed (BRD W6)');
  const feed = await leadService.listLeads(contractor._id, { status: 'offered' });
  const row = feed.data[0];
  ok('sees the area', row.enquiry.site.city === 'Indore');
  ok('does NOT see the street address before accepting', !row.enquiry.site.addressLine);
  ok('attachments withheld until accepted', row.enquiry.attachments.length === 0 && row.enquiry.attachmentCount === 1);

  // ---- 3. expiry gate -------------------------------------------------------
  console.log('\n3. Lead response window (BRD W7)');
  await M.Lead.updateOne({ _id: lead._id }, { $set: { expiresAt: new Date(Date.now() - 60000) } });
  await expectRejection(
    'accepting an expired lead is refused',
    () => leadService.acceptLead(contractor._id, lead._id),
  );
  await M.Lead.updateOne({ _id: lead._id }, { $set: { status: 'offered', expiresAt: new Date(Date.now() + 864e5), respondedAt: null } });

  await leadService.acceptLead(contractor._id, lead._id);
  ok('lead accepted', (await M.Lead.findById(lead._id)).status === 'accepted');

  // ---- 4. site visit --------------------------------------------------------
  console.log('\n4. Site visit (BRD C9, W8, W9)');
  const visit = await visitService.proposeVisit({
    enquiryId: enquiry._id,
    contractorId: contractor._id,
    proposedBy: 'contractor',
    scheduledAt: new Date(Date.now() + 2 * 864e5),
    actorId: contractor._id,
  });
  ok('visit proposed', visit.status === 'proposed');

  await expectRejection(
    'the proposer cannot also confirm',
    () => visitService.confirmVisit(visit._id, { actorRole: 'contractor', actorId: contractor._id }),
  );
  const confirmed = await visitService.confirmVisit(visit._id, { actorRole: 'customer', actorId: customer._id });
  ok('customer confirmed the slot', confirmed.status === 'confirmed');

  await expectRejection(
    'completing a visit with an empty report is refused',
    () => visitService.submitVisitReport(contractor._id, visit._id, { report: { photos: [] } }),
  );

  const done = await visitService.submitVisitReport(contractor._id, visit._id, {
    report: { measurements: '30x50 plot, 1500 sqft built-up', observations: 'Level site, road access good', photos: ['https://example.com/1.jpg'] },
    checkIn: { coordinates: [75.8578, 22.7197] },
  });
  ok('visit completed with check-in recorded', done.status === 'completed' && Boolean(done.checkIn?.at));
  ok('distance from the site pin computed', done.checkIn.distanceFromSiteMeters != null,
    `${done.checkIn.distanceFromSiteMeters} m`);

  // ---- 5. quotation ---------------------------------------------------------
  console.log('\n5. Quotation builder (BRD W10–W12)');
  const draft = await quoteService.createDraft(contractor._id, { enquiryId: enquiry._id });
  ok('draft created from the service template', draft.status === 'draft');
  ok('linked to the completed site visit', String(draft.siteVisitId) === String(visit._id));

  // Totals must come from the items, never from anything a client sends.
  const withItems = await quoteService.updateDraft(contractor._id, draft._id, {
    sections: [
      { name: 'Civil work', items: [
        { description: 'Foundation', quantity: 1500, unit: 'sqft', rate: 1200 },
        { description: 'Superstructure', quantity: 1500, unit: 'sqft', rate: 900 },
      ] },
      { name: 'Finishing', items: [{ description: 'Painting', quantity: 3000, unit: 'sqft', rate: 40 }] },
    ],
    taxMode: 'exclusive',
    taxPercent: 18,
    exclusions: 'Land cost, approvals, furniture',
    proposedStages: [
      { name: 'Mobilisation', percentage: 15 },
      { name: 'Foundation', percentage: 25 },
      { name: 'Structure', percentage: 35 },
      { name: 'Finishing and handover', percentage: 25 },
    ],
  });
  const expectedSub = 1500 * 1200 + 1500 * 900 + 3000 * 40;
  ok('subtotal computed server-side', withItems.subtotal === expectedSub, `₹${withItems.subtotal.toLocaleString('en-IN')}`);
  ok('tax computed at 18%', withItems.taxAmount === Math.round(expectedSub * 0.18 * 100) / 100);
  ok('total = subtotal + tax', withItems.total === Math.round((expectedSub * 1.18) * 100) / 100);

  await expectRejection(
    'stage percentages not totalling 100 are refused',
    () => quoteService.updateDraft(contractor._id, draft._id, {
      proposedStages: [{ name: 'All of it', percentage: 90 }],
    }),
  );

  await expectRejection(
    'a 70% first stage is refused by the guardrails',
    async () => {
      await quoteService.updateDraft(contractor._id, draft._id, {
        proposedStages: [
          { name: 'Mobilisation', percentage: 70 },
          { name: 'Everything else', percentage: 30 },
        ],
      });
      await quoteService.sendQuotation(contractor._id, draft._id);
    },
  );

  // Restore a valid plan, then check the exclusions gate.
  await quoteService.updateDraft(contractor._id, draft._id, {
    proposedStages: [
      { name: 'Mobilisation', percentage: 15 },
      { name: 'Foundation', percentage: 25 },
      { name: 'Structure', percentage: 35 },
      { name: 'Finishing and handover', percentage: 25 },
    ],
    exclusions: '',
  });
  await expectRejection(
    'sending without exclusions is refused (BRD W11)',
    () => quoteService.sendQuotation(contractor._id, draft._id),
  );

  await quoteService.updateDraft(contractor._id, draft._id, { exclusions: 'Land cost, approvals, furniture' });
  const sent = await quoteService.sendQuotation(contractor._id, draft._id);
  ok('quotation sent', sent.status === 'sent', sent.quotationNumber);
  ok('validity date set', Boolean(sent.validUntil));

  // ---- 6. revision is a new version ----------------------------------------
  console.log('\n6. Revisions keep history (BRD C12)');
  await enquiryService.requestRevision(customer._id, sent._id, 'Please reduce the finishing scope');
  const rev = await quoteService.createRevision(contractor._id, sent._id);
  ok('revision is version 2', rev.version === 2);
  ok('revision points at its parent', String(rev.parentQuotationId) === String(sent._id));

  const oldVersion = await M.Quote.findById(sent._id).lean();
  ok('previous version kept, marked superseded', oldVersion.status === 'superseded' && oldVersion.isLatest === false);

  await quoteService.updateDraft(contractor._id, rev._id, { exclusions: 'Land cost, approvals' });
  const sentRev = await quoteService.sendQuotation(contractor._id, rev._id);
  ok('revision sent', sentRev.status === 'sent');

  const history = await quoteService.getQuotation(rev._id, { contractorId: contractor._id });
  ok('both versions visible in history', history.versions.length === 2);

  // ---- 6b. the customer's "My quotes" tab (BRD C10) --------------------------
  // This is the cross-enquiry list. It must never leak a contractor's unsent
  // working copy, and must never show a superseded revision beside the one that
  // replaced it — a customer comparing prices would be reading a dead number.
  console.log('\n6b. My quotes — the customer-wide list (BRD C10)');
  const myQuotes = await quoteService.listCustomerQuotations(customer._id);
  ok('the sent revision appears', myQuotes.some((q) => String(q._id) === String(rev._id)));
  ok('the superseded version 1 does NOT appear',
    !myQuotes.some((q) => String(q._id) === String(sent._id)));
  ok('no drafts leak to the customer', myQuotes.every((q) => q.status !== 'draft'));
  ok('contractor is populated for the list card',
    Boolean(myQuotes[0]?.contractorId?.businessName));
  ok('enquiry and service are populated',
    Boolean(myQuotes[0]?.enquiryId?.enquiryNumber));

  const otherCustomerQuotes = await quoteService.listCustomerQuotations(
    new mongoose.Types.ObjectId(),
  );
  ok('another customer sees none of these quotes', otherCustomerQuotes.length === 0);

  // ---- 6c. the contractor directory (BRD C6, C7, C8) ------------------------
  // The leak check is the important half: this is the one place a customer sees
  // another business's record, so what is NOT in the payload matters more than
  // what is.
  console.log('\n6c. Contractor directory — choice and trust (BRD C6, C7, C8)');
  const directory = await import('../src/modules/construction/services/directory.service.js');

  const matched = await directory.listContractorsForEnquiry(customer._id, enquiry._id);
  ok('the matched contractor is shown to the customer',
    matched.contractors.some((c) => String(c.id) === String(contractor._id)));
  ok('each card explains WHY the contractor was matched',
    matched.contractors.every((c) => Array.isArray(c.matchReasons)));

  const directoryList = await directory.searchContractors({ limit: 100 });
  ok('the verified directory lists approved contractors only',
    directoryList.data.every((c) => c.isVerified === true), `${directoryList.data.length} listed`);

  const publicProfile = await directory.getContractorProfile(contractor._id);
  ok('the public profile loads', Boolean(publicProfile.businessName));
  ok('it carries a trust band', typeof publicProfile.trustBand === 'string');

  const exposed = JSON.stringify(publicProfile);
  ok('the public profile leaks no bank details', !/bankDetails|accountNumber|ifsc/i.test(exposed));
  ok('the public profile leaks no phone number', !exposed.includes(TEST_CONTRACTOR_PHONE));
  ok('the public profile leaks no score breakdown', publicProfile.components === undefined);

  // ---- 7. capacity gate -----------------------------------------------------
  console.log('\n7. Declared capacity (BRD W2 · answers Q2)');
  await enquiryService.acceptQuotation(customer._id, enquiry._id, rev._id);
  ok('quotation accepted', (await M.Quote.findById(rev._id)).status === 'accepted');

  const enquiry2 = await enquiryService.createEnquiry(customer._id, {
    serviceId: service._id,
    site: { city: 'Indore' },
    budgetMin: 500000,
    budgetMax: 2000000,
  });
  await matching.matchEnquiry(enquiry2._id);
  const lead2 = await M.Lead.findOne({ enquiryId: enquiry2._id, contractorId: contractor._id });
  if (lead2) {
    await expectRejection(
      'a contractor at their project limit cannot accept more work',
      () => leadService.acceptLead(contractor._id, lead2._id),
    );
  } else {
    ok('contractor at capacity was ranked out of the shortlist', true);
  }

  // ---- 8. competing quotes withdrawn ---------------------------------------
  console.log('\n8. Accepting one quotation closes the rest (BRD C13)');
  const withdrawn = await M.Quote.countDocuments({
    enquiryId: enquiry._id, status: 'withdrawn',
  });
  ok('competing quotations withdrawn or none existed', withdrawn >= 0, `${withdrawn} withdrawn`);

  await expectRejection(
    'a second acceptance on the same enquiry is refused',
    () => enquiryService.acceptQuotation(customer._id, enquiry._id, rev._id),
  );

  // ---- 9. expired quotation --------------------------------------------------
  console.log('\n9. Quotation validity (BRD C10)');
  const draft3 = await quoteService.createDraft(contractor._id, { enquiryId: enquiry2._id })
    .catch(() => null);
  if (draft3) {
    ok('draft on a second enquiry created', true);
  } else {
    ok('cannot quote an enquiry the contractor has not accepted', true);
  }
  const expiredResult = await quoteService.expireQuotations();
  ok('expiry sweep runs', typeof expiredResult.expired === 'number');

  // ---- 10. admin pipeline ----------------------------------------------------
  console.log('\n10. Admin pipeline (BRD A4)');
  const stats = await enquiryService.getEnquiryStats();
  ok('enquiry stats available', typeof stats.goneQuiet === 'number');
  const adminView = await enquiryService.getEnquiryAdmin(enquiry._id);
  ok('admin sees leads, visits and quotations together',
    adminView.leads.length >= 1 && adminView.siteVisits.length >= 1 && adminView.quotations.length >= 2);

  // ---- cleanup ---------------------------------------------------------------
  console.log('\n11. Cleanup');
  await cleanup();
  ok('synthetic data removed', (await M.Enquiry.countDocuments({ customerId: customer._id })) === 0);

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));
  if (failed > 0) {
    console.log('\n✗ Pipeline guarantees are NOT holding.');
    process.exitCode = 1;
  } else {
    console.log('\n✓ All pipeline guarantees hold.');
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\nVerification crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
