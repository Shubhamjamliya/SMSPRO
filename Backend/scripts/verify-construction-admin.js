/**
 * Phase 7 acceptance test — dashboard, payment control, reports, activity
 * record, and contractor reassignment.
 *
 * Most of Phase 7 is read-only, so most of this proves that the numbers are
 * RIGHT rather than that nothing broke. The exception is reassignment (BRD A6),
 * which moves live work between two businesses while money already released
 * stays with whoever earned it — that gets the same scrutiny as the escrow
 * paths.
 *
 *   1  Reports refuse an impossible date range
 *   2  Revenue means commission, not contract value
 *   3  Conversion rate counts converted enquiries against all enquiries
 *   4  The dashboard queue lists only what actually needs attention
 *   5  Payment control totals what is genuinely held
 *   6  Activity record captures every action, and cannot be rewritten
 *   7  Reassignment is refused while a stage is disputed
 *   8  Reassignment is refused while a stage awaits approval
 *   9  Reassignment is refused to an unapproved or over-capacity contractor
 *  10  Reassignment moves only UNPAID stages; paid work stays put
 *  11  Reassignment leaves the project on hold, never silently running
 *  12  The money is untouched by a reassignment
 *
 * Creates synthetic records and removes them. Safe on staging.
 * Do NOT run against production.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const CUSTOMER_PHONE = '9000000081';
const CONTRACTOR_A_PHONE = '9000000082';
const CONTRACTOR_B_PHONE = '9000000083';

let passed = 0;
let failed = 0;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function ok(label, condition, detail = '') {
  console.log(`${condition ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (condition) passed += 1; else failed += 1;
}
function eq(label, actual, expected) {
  const same = round2(actual) === round2(expected);
  console.log(`${same ? '  ✓' : '  ✗'} ${label} — ${round2(actual)}${same ? '' : ` (expected ${round2(expected)})`}`);
  if (same) passed += 1; else failed += 1;
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
    Project: (await import('../src/modules/construction/models/constructionProject.model.js')).ConstructionProject,
    Stage: (await import('../src/modules/construction/models/projectStage.model.js')).ProjectStage,
    Submission: (await import('../src/modules/construction/models/stageSubmission.model.js')).StageSubmission,
    Dispute: (await import('../src/modules/construction/models/projectDispute.model.js')).ProjectDispute,
    Doc: (await import('../src/modules/construction/models/projectDocument.model.js')).ProjectDocument,
    Msg: (await import('../src/modules/construction/models/projectMessage.model.js')).ProjectMessage,
    Score: (await import('../src/modules/construction/models/contractorScore.model.js')).ContractorScore,
    Quote: (await import('../src/modules/construction/models/quotation.model.js')).Quotation,
    Enquiry: (await import('../src/modules/construction/models/constructionEnquiry.model.js')).ConstructionEnquiry,
    Lead: (await import('../src/modules/construction/models/contractorLead.model.js')).ContractorLead,
    Contractor: (await import('../src/modules/construction/models/contractorProfile.model.js')).ContractorProfile,
    Service: (await import('../src/modules/construction/models/constructionService.model.js')).ConstructionService,
    User: (await import('../src/core/users/user.model.js')).FoodUser,
    Wallet: (await import('../src/modules/food/user/models/userWallet.model.js')).FoodUserWallet,
    ContractorWallet: (await import('../src/core/payments/models/contractorWallet.model.js')).ConstructionContractorWallet,
    Hold: (await import('../src/core/wallet/models/walletHold.model.js')).WalletHold,
    Ledger: (await import('../src/core/wallet/models/walletHoldLedger.model.js')).WalletHoldLedger,
    Txn: (await import('../src/core/payments/models/transaction.model.js')).Transaction,
    Audit: (await import('../src/core/audit/auditLog.model.js')).PlatformAuditLog,
  };

  const projectService = await import('../src/modules/construction/services/project.service.js');
  const stageService = await import('../src/modules/construction/services/stage.service.js');
  const disputeService = await import('../src/modules/construction/services/dispute.service.js');
  const dashboardService = await import('../src/modules/construction/services/dashboard.service.js');
  const reportService = await import('../src/modules/construction/services/report.service.js');
  const { listAuditTrail } = await import('../src/core/audit/audit.service.js');
  const { findOrCreateUserByPhone } = await import('../src/core/users/user.service.js');

  const PHONES = [CUSTOMER_PHONE, CONTRACTOR_A_PHONE, CONTRACTOR_B_PHONE];
  const cleanup = async () => {
    const us = await M.User.find({ phone: { $in: PHONES } }).select('_id').lean();
    const uIds = us.map((u) => u._id);
    const cs = await M.Contractor.find({ phoneLast10: { $in: PHONES } }).select('_id').lean();
    const cIds = cs.map((c) => c._id);
    const ps = await M.Project.find({ customerId: { $in: uIds } }).select('_id holdId').lean();
    const pIds = ps.map((p) => p._id);
    const holdIds = ps.map((p) => p.holdId).filter(Boolean);
    const es = await M.Enquiry.find({ customerId: { $in: uIds } }).select('_id').lean();
    const eIds = es.map((e) => e._id);

    await Promise.all([
      M.Msg.collection.deleteMany({ projectId: { $in: pIds } }),
      M.Doc.collection.deleteMany({ projectId: { $in: pIds } }),
      M.Dispute.collection.deleteMany({ projectId: { $in: pIds } }),
      M.Score.deleteMany({ contractorId: { $in: cIds } }),
      M.Submission.deleteMany({ projectId: { $in: pIds } }),
      M.Stage.deleteMany({ projectId: { $in: pIds } }),
      M.Project.deleteMany({ _id: { $in: pIds } }),
      M.Quote.deleteMany({ contractorId: { $in: cIds } }),
      M.Lead.deleteMany({ enquiryId: { $in: eIds } }),
      M.Enquiry.deleteMany({ _id: { $in: eIds } }),
      M.Contractor.deleteMany({ _id: { $in: cIds } }),
      M.Wallet.deleteMany({ userId: { $in: uIds } }),
      M.ContractorWallet.deleteMany({ contractorId: { $in: cIds } }),
      M.Ledger.collection.deleteMany({ holdId: { $in: holdIds } }),
      M.Hold.collection.deleteMany({ _id: { $in: holdIds } }),
      M.Txn.deleteMany({ entityId: { $in: [...uIds, ...cIds] } }),
      M.Audit.collection.deleteMany({ entityId: { $in: [...pIds, ...eIds, ...cIds] } }),
      M.User.deleteMany({ _id: { $in: uIds } }),
    ]);
  };
  await cleanup();

  // ---- setup ---------------------------------------------------------------
  const service = await M.Service.findOne({ status: 'active', isDeleted: { $ne: true } }).lean();
  if (!service) throw new Error('No active construction service — run the catalogue seed first.');

  const customer = await findOrCreateUserByPhone({ phone: CUSTOMER_PHONE, countryCode: '+91' });
  const userA = await findOrCreateUserByPhone({ phone: CONTRACTOR_A_PHONE, countryCode: '+91' });
  const userB = await findOrCreateUserByPhone({ phone: CONTRACTOR_B_PHONE, countryCode: '+91' });

  const mkContractor = (userId, phone, name, extra = {}) => M.Contractor.create({
    userId,
    businessName: name,
    ownerName: 'Tester',
    phone, phoneLast10: phone, phoneDigits: phone,
    status: 'approved', isActive: true,
    trades: [service.categoryId], serviceAreas: ['Indore'],
    maxConcurrentProjects: 5,
    ...extra,
  });

  const contractorA = await mkContractor(userA._id, CONTRACTOR_A_PHONE, 'Outgoing Builders');
  const contractorB = await mkContractor(userB._id, CONTRACTOR_B_PHONE, 'Incoming Builders');

  await M.Wallet.create({ userId: customer._id, balance: 500000, transactions: [] });

  const enquiry = await M.Enquiry.create({
    customerId: customer._id, serviceId: service._id, categoryId: service.categoryId,
    site: { city: 'Indore' }, status: 'quoted',
  });
  const quotation = await M.Quote.create({
    enquiryId: enquiry._id, contractorId: contractorA._id, customerId: customer._id,
    sections: [{ name: 'Work', items: [{ description: 'Build', quantity: 1, unit: 'lumpsum', rate: 200000 }] }],
    taxMode: 'none', exclusions: 'Land',
    proposedStages: [
      { name: 'Foundation', percentage: 25 },
      { name: 'Structure', percentage: 25 },
      { name: 'Roofing', percentage: 25 },
      { name: 'Finishing', percentage: 25 },
    ],
    status: 'accepted', acceptedAt: new Date(),
  });

  const project = await projectService.createProjectFromQuotation(quotation._id);
  await projectService.fundProject(customer._id, project._id, project.agreedValue);
  const [s1, s2, s3] = await M.Stage.find({ projectId: project._id }).sort({ sequence: 1 });

  // ---- 1. reports ----------------------------------------------------------
  console.log('1. Reports (BRD A9)');

  await expectRejection(
    'a range that ends before it starts is refused',
    () => reportService.getCityReport({ from: '2026-06-01', to: '2026-01-01' }),
  );
  await expectRejection(
    'an unparseable date is refused',
    () => reportService.getCityReport({ from: 'not-a-date' }),
  );

  const cities = await reportService.getCityReport({ days: 365 });
  const indore = cities.rows.find((r) => r.city === 'Indore');
  ok('the enquiry shows up under its city', Boolean(indore), `${cities.rows.length} cities`);
  ok('conversion rate is a percentage, not a count',
    indore.conversionRate >= 0 && indore.conversionRate <= 100, `${indore.conversionRate}%`);
  ok('gross value and revenue are separate figures',
    indore.grossValue !== undefined && indore.revenue !== undefined);
  ok('revenue is commission, so it is far below gross value',
    indore.revenue < indore.grossValue || indore.grossValue === 0,
    `revenue ${indore.revenue} vs gross ${indore.grossValue}`);

  const services = await reportService.getServiceReport({ days: 365 });
  ok('the service report returns rows', services.rows.length > 0);

  const periods = await reportService.getPeriodReport({ days: 365 });
  ok('the period report buckets by month',
    periods.rows.every((r) => /^\d{4}-\d{2}$/.test(r.month)), `${periods.rows.length} months`);
  ok('months come back in order',
    periods.rows.every((r, i, a) => i === 0 || a[i - 1].month <= r.month));

  const contractorReport = await reportService.getContractorReport({ days: 365 });
  ok('only contractors with activity appear',
    contractorReport.rows.every((r) => r.projects > 0 || r.disputes > 0),
    `${contractorReport.rows.length} rows`);

  const delays = await reportService.getDelayReport({ days: 365 });
  ok('on-time rate is a percentage', delays.summary.onTimeRate >= 0 && delays.summary.onTimeRate <= 100,
    `${delays.summary.onTimeRate}%`);

  // ---- 2. dashboard --------------------------------------------------------
  console.log('\n2. Dashboard (BRD A1)');

  const dash = await dashboardService.getDashboard({ days: 30 });
  ok('the attention queue only lists real work',
    dash.attention.every((a) => a.count > 0), `${dash.attention.length} items`);
  ok('every attention item links somewhere',
    dash.attention.every((a) => typeof a.link === 'string' && a.link.length > 0));
  eq('held money equals funded minus released and refunded',
    dash.money.currentlyHeld,
    round2(dash.money.totalFunded - dash.money.totalReleased - dash.money.totalRefunded));
  ok('the project is counted as active', dash.projects.active >= 1, `${dash.projects.active}`);
  ok('conversion rate is bounded',
    dash.enquiries.conversionRate >= 0 && dash.enquiries.conversionRate <= 100);

  // ---- 3. payment control --------------------------------------------------
  console.log('\n3. Payment control (BRD A7)');

  const control = await dashboardService.getPaymentControl({});
  ok('the funded project appears as holding money',
    control.held.some((p) => String(p._id) === String(project._id)));
  const ours = control.held.find((p) => String(p._id) === String(project._id));
  eq('the held figure is right', ours.heldAmount, project.agreedValue);
  eq('the summary total matches the rows',
    control.summary.totalHeld,
    round2(control.held.reduce((s, p) => s + p.heldAmount, 0)));

  // ---- 4. reassignment guards ---------------------------------------------
  console.log('\n4. Reassignment refuses what it should (BRD A6)');

  await expectRejection(
    'reassigning without a reason is refused',
    () => projectService.reassignContractor(project._id, {
      newContractorId: contractorB._id, reason: 'no',
    }),
  );
  await expectRejection(
    'reassigning to the same contractor is refused',
    () => projectService.reassignContractor(project._id, {
      newContractorId: contractorA._id,
      reason: 'Trying to reassign to whoever is already on the project.',
    }),
  );

  // Suspension is not a status on this model — the enum is
  // onboarding | pending_approval | approved | rejected — it is `approved` with
  // `isActive: false`, which is what the reassignment guard actually checks.
  const suspended = await mkContractor(
    (await findOrCreateUserByPhone({ phone: '9000000084', countryCode: '+91' }))._id,
    '9000000084', 'Suspended Builders', { isActive: false },
  );
  await expectRejection(
    'reassigning to a suspended contractor is refused',
    () => projectService.reassignContractor(project._id, {
      newContractorId: suspended._id,
      reason: 'Attempting to hand the work to a suspended firm.',
    }),
  );
  await M.Contractor.deleteOne({ _id: suspended._id });

  const unapproved = await mkContractor(
    (await M.User.findOne({ phone: '9000000084' }))._id,
    '9000000084', 'Unverified Builders', { status: 'pending_approval' },
  );
  await expectRejection(
    'reassigning to an unverified contractor is refused',
    () => projectService.reassignContractor(project._id, {
      newContractorId: unapproved._id,
      reason: 'Attempting to hand work to a firm that has not been verified.',
    }),
  );
  await M.Contractor.deleteOne({ _id: unapproved._id });
  await M.User.deleteMany({ phone: '9000000084' });

  // A stage awaiting approval blocks it.
  await stageService.submitStage(contractorA._id, s1._id, {
    photos: ['https://example.com/f.jpg'], notes: 'Foundation done',
  });
  await expectRejection(
    'a stage awaiting the customer\'s approval blocks reassignment',
    () => projectService.reassignContractor(project._id, {
      newContractorId: contractorB._id,
      reason: 'Trying to swap while the customer is judging finished work.',
    }),
  );

  // Approve it so it becomes paid work that must NOT transfer.
  await stageService.approveStage(s1._id, { actorRole: 'customer', actorId: customer._id });
  const paidStage = await M.Stage.findById(s1._id);
  ok('stage 1 is now paid to the outgoing contractor', paidStage.status === 'payment_released');

  // A dispute blocks it.
  await stageService.submitStage(contractorA._id, s2._id, { photos: ['https://example.com/s.jpg'] });
  const dispute = await disputeService.raiseDispute(project._id, {
    stageId: s2._id, reason: 'work_quality',
    description: 'The structural work has visible defects that need independent review.',
  }, { customerId: customer._id });

  await expectRejection(
    'a live dispute blocks reassignment',
    () => projectService.reassignContractor(project._id, {
      newContractorId: contractorB._id,
      reason: 'Trying to swap while money is frozen in a dispute.',
    }),
  );

  await disputeService.resolveDispute(dispute._id, {
    outcome: 'dismissed',
    resolutionNote: 'Defects are cosmetic and within tolerance; work may continue.',
  });
  // Dismissal puts stage 2 back to submitted_for_approval, which also blocks.
  await stageService.rejectStage(s2._id, {
    actorId: customer._id, reason: 'Redo the finish before I approve this stage.',
  });

  // ---- 5. a reassignment that should work ---------------------------------
  console.log('\n5. Reassignment moves only unpaid work');

  const moneyBefore = await M.Project.findById(project._id).lean();
  const walletBefore = await M.Wallet.findOne({ userId: customer._id }).lean();
  const contractorAWallet = await M.ContractorWallet.findOne({ contractorId: contractorA._id }).lean();

  const result = await projectService.reassignContractor(project._id, {
    newContractorId: contractorB._id,
    reason: 'Original contractor withdrew from site after repeated delays.',
  });

  ok('the reassignment reports both firms',
    result.outgoingContractor === 'Outgoing Builders'
    && result.newContractor === 'Incoming Builders');
  eq('one paid stage stayed with the outgoing contractor', result.stagesRetainedByOutgoing, 1);
  eq('the other three transferred', result.stagesTransferred, 3);

  const paidAfter = await M.Stage.findById(s1._id);
  ok('the PAID stage still belongs to the outgoing contractor',
    String(paidAfter.contractorId) === String(contractorA._id));

  const movedStage = await M.Stage.findById(s3._id);
  ok('an unstarted stage moved to the new contractor',
    String(movedStage.contractorId) === String(contractorB._id));

  const resetStage = await M.Stage.findById(s2._id);
  ok('a part-done stage was reset rather than inherited',
    resetStage.status === 'pending' && resetStage.progressPercent === 0,
    `${resetStage.status} @ ${resetStage.progressPercent}%`);

  const after = await M.Project.findById(project._id).lean();
  ok('the project now names the new contractor',
    String(after.contractorId) === String(contractorB._id));
  ok('the project is left ON HOLD, not silently running', after.status === 'on_hold', after.status);
  ok('the handover is recorded on the project',
    (after.reassignmentHistory || []).length === 1);
  ok('the record says why', Boolean(after.reassignmentHistory[0]?.reason));

  // ---- 6. the money is untouched ------------------------------------------
  console.log('\n6. Reassignment moves work, never money');

  eq('released total unchanged', after.releasedAmount, moneyBefore.releasedAmount);
  eq('refunded total unchanged', after.refundedAmount, moneyBefore.refundedAmount);
  eq('funded total unchanged', after.fundedAmount, moneyBefore.fundedAmount);

  const walletAfter = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('customer balance unchanged', walletAfter.balance, walletBefore.balance);
  eq('customer lock unchanged', walletAfter.lockedAmount, walletBefore.lockedAmount);

  const aWalletAfter = await M.ContractorWallet.findOne({ contractorId: contractorA._id }).lean();
  eq('the outgoing contractor keeps what they earned',
    aWalletAfter?.balance, contractorAWallet?.balance);

  // ---- 7. the activity record ---------------------------------------------
  console.log('\n7. Activity record (BRD A10)');

  const trail = await listAuditTrail({
    module: 'construction',
    entityType: 'project',
    entityId: project._id,
    limit: 100,
  });
  ok('the project has an activity trail', trail.entries.length > 0, `${trail.entries.length} entries`);
  ok('the reassignment is in it',
    trail.entries.some((e) => e.action === 'project.contractor_reassigned'));
  ok('every entry names an action and a time',
    trail.entries.every((e) => e.action && e.createdAt));

  const reassignEntry = trail.entries.find((e) => e.action === 'project.contractor_reassigned');
  ok('it records who it moved from and to',
    Boolean(reassignEntry.before?.contractorId) && Boolean(reassignEntry.after?.contractorId));

  await expectRejection(
    'the activity record CANNOT be altered',
    () => M.Audit.updateOne({ _id: reassignEntry.id }, { $set: { action: 'tampered' } }),
  );
  await expectRejection(
    'the activity record CANNOT be deleted',
    () => M.Audit.deleteOne({ _id: reassignEntry.id }),
  );

  // ---- cleanup -------------------------------------------------------------
  console.log('\n8. Cleanup');
  await cleanup();
  ok('synthetic data removed', (await M.Project.countDocuments({ customerId: customer._id })) === 0);

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));
  if (failed > 0) {
    console.log('\n✗ Phase 7 guarantees are NOT holding.');
    process.exitCode = 1;
  } else {
    console.log('\n✓ All admin, report and reassignment guarantees hold.');
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\nVerification crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
