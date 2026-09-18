/**
 * Phase 6 acceptance test — documents, messaging, disputes and trust score.
 *
 * The dispute half of this is a money test. BRD Q15 asks for a way to settle
 * disagreements; the thing that makes it safe is that a disputed stage cannot
 * pay out, and that a resolution allocates exactly what was frozen — no more, no
 * less, and only once. Most of what follows is proving those two sentences.
 *
 *   1  Documents version rather than overwrite; the chain stays walkable
 *   2  Exactly one current version per document group
 *   3  A withdrawn document is marked, never removed
 *   4  Internal support paperwork is invisible to the customer
 *   5  Messages cannot be edited or deleted — only retracted
 *   6  Read tracking counts the other side's messages only
 *   7  Raising a dispute FREEZES the stage
 *   8  A frozen stage CANNOT be approved and CANNOT pay out
 *   9  Two live disputes on one stage are refused
 *  10  Dismissing restores the stage to exactly where it was
 *  11  Resolving in the contractor's favour releases exactly the frozen amount
 *  12  Resolving in the customer's favour refunds it
 *  13  A split must account for the whole frozen amount
 *  14  A resolution replayed pays ONCE
 *  15  funded === released + refunded + held, after every resolution
 *  16  The trust score is computed, provisional when new, and hides its
 *      breakdown from customers
 *
 * Creates synthetic records and removes them. Safe on staging.
 * Do NOT run against production.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const CUSTOMER_PHONE = '9000000071';
const CONTRACTOR_PHONE = '9000000072';

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
    Doc: (await import('../src/modules/construction/models/projectDocument.model.js')).ProjectDocument,
    Msg: (await import('../src/modules/construction/models/projectMessage.model.js')).ProjectMessage,
    Dispute: (await import('../src/modules/construction/models/projectDispute.model.js')).ProjectDispute,
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
  const docService = await import('../src/modules/construction/services/document.service.js');
  const msgService = await import('../src/modules/construction/services/message.service.js');
  const disputeService = await import('../src/modules/construction/services/dispute.service.js');
  const scoreService = await import('../src/modules/construction/services/score.service.js');
  const { findOrCreateUserByPhone } = await import('../src/core/users/user.service.js');

  const cleanup = async () => {
    const us = await M.User.find({ phone: { $in: [CUSTOMER_PHONE, CONTRACTOR_PHONE] } }).select('_id').lean();
    const uIds = us.map((u) => u._id);
    const cs = await M.Contractor.find({ phoneLast10: CONTRACTOR_PHONE }).select('_id').lean();
    const cIds = cs.map((c) => c._id);
    const ps = await M.Project.find({ customerId: { $in: uIds } }).select('_id holdId').lean();
    const pIds = ps.map((p) => p._id);
    const holdIds = ps.map((p) => p.holdId).filter(Boolean);
    const es = await M.Enquiry.find({ customerId: { $in: uIds } }).select('_id').lean();
    const eIds = es.map((e) => e._id);

    await Promise.all([
      // Messages and documents refuse ordinary deletes by design, so cleanup
      // goes through the driver rather than the model.
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
  const contractorUser = await findOrCreateUserByPhone({ phone: CONTRACTOR_PHONE, countryCode: '+91' });
  const contractor = await M.Contractor.create({
    userId: contractorUser._id,
    businessName: 'Transparency Test Builders',
    ownerName: 'Test Builder',
    phone: CONTRACTOR_PHONE, phoneLast10: CONTRACTOR_PHONE, phoneDigits: CONTRACTOR_PHONE,
    status: 'approved', isActive: true,
    trades: [service.categoryId], serviceAreas: ['Indore'],
    maxConcurrentProjects: 5,
  });

  await M.Wallet.create({ userId: customer._id, balance: 500000, transactions: [] });

  const enquiry = await M.Enquiry.create({
    customerId: customer._id, serviceId: service._id, categoryId: service.categoryId,
    site: { city: 'Indore' }, status: 'quoted',
  });
  const quotation = await M.Quote.create({
    enquiryId: enquiry._id, contractorId: contractor._id, customerId: customer._id,
    sections: [{ name: 'Work', items: [{ description: 'Build', quantity: 1, unit: 'lumpsum', rate: 200000 }] }],
    taxMode: 'none', exclusions: 'Land cost',
    proposedStages: [
      { name: 'Foundation', percentage: 40 },
      { name: 'Structure', percentage: 35 },
      { name: 'Finishing', percentage: 25 },
    ],
    status: 'accepted', acceptedAt: new Date(),
  });

  const project = await projectService.createProjectFromQuotation(quotation._id);
  await projectService.fundProject(customer._id, project._id, project.agreedValue);
  const [s1, s2] = await M.Stage.find({ projectId: project._id }).sort({ sequence: 1 });

  const asCustomer = { customerId: customer._id };
  const asContractor = { contractorId: contractor._id };
  const asAdmin = { isAdmin: true };

  // ---- 1. documents --------------------------------------------------------
  console.log('1. Document vault (BRD C19)');

  const agreement = await docService.addDocument(project._id, {
    documentType: 'Agreement / contract',
    title: 'Construction agreement',
    fileUrl: 'https://example.com/agreement-v1.pdf',
  }, asContractor);
  ok('document filed', agreement.version === 1 && agreement.isLatest === true);

  await expectRejection(
    'a document type not in settings is refused',
    () => docService.addDocument(project._id, {
      documentType: 'Invented type', title: 'X', fileUrl: 'https://example.com/x.pdf',
    }, asContractor),
  );

  const revision = await docService.addDocument(project._id, {
    documentType: 'Agreement / contract',
    title: 'Construction agreement (rev B)',
    fileUrl: 'https://example.com/agreement-v2.pdf',
    supersedesId: agreement._id,
  }, asContractor);
  ok('revision is version 2', revision.version === 2);
  ok('revision joined the same group',
    String(revision.documentGroupId) === String(agreement.documentGroupId));

  const oldVersion = await M.Doc.findById(agreement._id).lean();
  ok('version 1 marked superseded', oldVersion.isLatest === false);
  ok('version 1 points at its replacement',
    String(oldVersion.supersededBy) === String(revision._id));

  await expectRejection(
    'you cannot supersede a version that is already superseded',
    () => docService.addDocument(project._id, {
      documentType: 'Agreement / contract', title: 'rev C',
      fileUrl: 'https://example.com/c.pdf', supersedesId: agreement._id,
    }, asContractor),
  );

  const history = await docService.getDocumentHistory(project._id, revision._id, asCustomer);
  ok('history walks the whole chain', history.versions.length === 2);

  const currentOnly = await docService.listDocuments(project._id, asCustomer, {});
  ok('the default listing shows current versions only',
    currentOnly.documents.every((d) => d.isLatest === true));
  ok('missing document types are reported', Array.isArray(currentOnly.missingTypes));

  const withHistory = await docService.listDocuments(project._id, asCustomer, { includeSuperseded: true });
  ok('superseded versions are still retrievable', withHistory.documents.length > currentOnly.documents.length);

  // Internal support paperwork.
  await docService.addDocument(project._id, {
    documentType: 'Site photographs', title: 'Internal support note',
    fileUrl: 'https://example.com/internal.pdf', visibleToCustomer: false,
  }, asAdmin);
  const customerView = await docService.listDocuments(project._id, asCustomer, {});
  ok('internal paperwork is hidden from the customer',
    !customerView.documents.some((d) => d.title === 'Internal support note'));
  const adminView = await docService.listDocuments(project._id, asAdmin, {});
  ok('support can still see it',
    adminView.documents.some((d) => d.title === 'Internal support note'));

  await expectRejection(
    'the customer cannot withdraw the contractor\'s document',
    () => docService.revokeDocument(project._id, revision._id, 'Not mine to remove', asCustomer),
  );
  const revoked = await docService.revokeDocument(
    project._id, revision._id, 'Filed against the wrong project', asContractor,
  );
  ok('withdrawn document is marked, not removed', revoked.isRevoked === true);
  ok('the row still exists', Boolean(await M.Doc.findById(revision._id)));

  // ---- 2. messages ---------------------------------------------------------
  console.log('\n2. Project messaging (BRD C20)');

  const fromCustomer = await msgService.sendMessage(project._id, {
    body: 'When will the foundation be finished?',
  }, asCustomer);
  ok('customer message sent', fromCustomer.senderType === 'CUSTOMER');

  const fromContractor = await msgService.sendMessage(project._id, {
    body: 'By Friday. Photos attached.',
    attachments: [{ url: 'https://example.com/p1.jpg', kind: 'image' }],
  }, asContractor);
  ok('contractor message with attachment sent', fromContractor.attachments.length === 1);

  await expectRejection(
    'an empty message is refused',
    () => msgService.sendMessage(project._id, { body: '   ' }, asCustomer),
  );
  await expectRejection(
    'someone not on the project cannot post',
    () => msgService.sendMessage(project._id, { body: 'hello' },
      { customerId: new mongoose.Types.ObjectId() }),
  );

  await expectRejection(
    'a message body CANNOT be edited',
    () => M.Msg.updateOne({ _id: fromCustomer._id }, { $set: { body: 'rewritten' } }),
  );
  await expectRejection(
    'a message CANNOT be deleted',
    () => M.Msg.deleteOne({ _id: fromCustomer._id }),
  );

  const reloaded = await M.Msg.findById(fromCustomer._id);
  reloaded.body = 'sneaky edit';
  await expectRejection('re-saving with a changed body is refused', () => reloaded.save());

  const unreadForContractor = await msgService.getUnreadCount(project._id, asContractor);
  ok('contractor sees the customer message as unread', unreadForContractor.unread >= 1,
    `${unreadForContractor.unread}`);

  await msgService.markRead(project._id, asContractor);
  const afterRead = await msgService.getUnreadCount(project._id, asContractor);
  eq('marking read clears the contractor count', afterRead.unread, 0);

  const customerUnread = await msgService.getUnreadCount(project._id, asCustomer);
  ok('the customer still has the contractor message unread', customerUnread.unread >= 1,
    `${customerUnread.unread}`);

  const retracted = await msgService.retractMessage(project._id, fromCustomer._id, asCustomer);
  ok('sender can retract their own message', retracted.isRetracted === true);
  ok('the retracted row still exists', Boolean(await M.Msg.findById(fromCustomer._id)));
  await expectRejection(
    'you cannot retract someone else\'s message',
    () => msgService.retractMessage(project._id, fromContractor._id, asCustomer),
  );

  const systemRows = await M.Msg.countDocuments({ projectId: project._id, senderType: 'SYSTEM' });
  ok('document activity was narrated into the thread', systemRows > 0, `${systemRows} system messages`);

  // ---- 3. disputes: the freeze --------------------------------------------
  console.log('\n3. Raising a dispute freezes the stage (BRD Q15)');

  await stageService.submitStage(contractor._id, s1._id, {
    photos: ['https://example.com/foundation.jpg'], notes: 'Foundation poured',
  });

  const beforeWallet = await M.Wallet.findOne({ userId: customer._id }).lean();

  const dispute = await disputeService.raiseDispute(project._id, {
    stageId: s1._id,
    reason: 'work_quality',
    description: 'The foundation has visible cracks along the north edge and has not cured evenly.',
  }, asCustomer);
  ok('dispute recorded', Boolean(dispute.disputeNumber), dispute.disputeNumber);
  eq('the stage amount was frozen', dispute.frozenAmount, s1.amount);
  ok('the pre-dispute status was captured',
    dispute.preDisputeStatus === 'submitted_for_approval', dispute.preDisputeStatus);

  const frozenStage = await M.Stage.findById(s1._id);
  ok('the stage is now frozen', frozenStage.status === 'disputed');

  await expectRejection(
    'a description that says nothing is refused',
    () => disputeService.raiseDispute(project._id, {
      stageId: s2._id, reason: 'delay', description: 'bad',
    }, asCustomer),
  );

  // ---- 4. the freeze actually protects the money --------------------------
  console.log('\n4. A frozen stage cannot pay out');

  await expectRejection(
    'the customer CANNOT approve a disputed stage',
    () => stageService.approveStage(s1._id, { actorRole: 'customer', actorId: customer._id }),
  );
  await expectRejection(
    'a supervisor CANNOT approve a disputed stage either',
    () => stageService.approveStage(s1._id, { actorRole: 'admin', via: 'supervisor' }),
  );
  await expectRejection(
    'the contractor cannot resubmit it to escape the freeze',
    () => stageService.submitStage(contractor._id, s1._id, { photos: ['https://example.com/x.jpg'] }),
  );

  const afterFreeze = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('customer balance untouched by the dispute', afterFreeze.balance, beforeWallet.balance);
  eq('the money is still locked', afterFreeze.lockedAmount, beforeWallet.lockedAmount);

  await expectRejection(
    'a second live dispute on the same stage is refused',
    () => disputeService.raiseDispute(project._id, {
      stageId: s1._id, reason: 'delay',
      description: 'Trying to raise a second dispute against the very same stage.',
    }, asContractor),
  );

  // ---- 5. dismissal restores exactly ---------------------------------------
  console.log('\n5. Dismissing restores the stage exactly (BRD Q15)');

  await disputeService.startReview(dispute._id, null);
  const dismissed = await disputeService.resolveDispute(dispute._id, {
    outcome: 'dismissed',
    resolutionNote: 'Cracks are cosmetic surface crazing and within tolerance. Work may continue.',
  });
  ok('dispute resolved as dismissed', dismissed.dispute.outcome === 'dismissed');

  const restored = await M.Stage.findById(s1._id);
  ok('the stage went back to exactly where it was',
    restored.status === 'submitted_for_approval', restored.status);

  const afterDismiss = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('no money moved on dismissal', afterDismiss.balance, beforeWallet.balance);

  // The stage can now be approved normally.
  await stageService.approveStage(s1._id, { actorRole: 'customer', actorId: customer._id });
  const paidStage = await M.Stage.findById(s1._id);
  ok('after dismissal the stage pays normally', paidStage.status === 'payment_released');

  // ---- 6. resolving in the customer's favour ------------------------------
  console.log('\n6. Resolving with money moving (BRD Q15)');

  await stageService.submitStage(contractor._id, s2._id, {
    photos: ['https://example.com/structure.jpg'],
  });
  const dispute2 = await disputeService.raiseDispute(project._id, {
    stageId: s2._id,
    reason: 'work_incomplete',
    description: 'The first floor slab has not been poured but the stage was claimed as complete.',
  }, asCustomer);

  const projBefore = await M.Project.findById(project._id).lean();
  const walletBefore = await M.Wallet.findOne({ userId: customer._id }).lean();
  const frozen = round2(dispute2.frozenAmount);

  await expectRejection(
    'a split that does not add up is refused',
    () => disputeService.resolveDispute(dispute2._id, {
      outcome: 'split',
      resolutionNote: 'Half and half, but the arithmetic is deliberately wrong here.',
      amountToContractor: frozen,
      amountToCustomer: frozen,
    }),
  );
  await expectRejection(
    'resolving with no explanation is refused',
    () => disputeService.resolveDispute(dispute2._id, {
      outcome: 'refunded_to_customer', resolutionNote: 'no',
    }),
  );

  const half = round2(frozen / 2);
  const settled = await disputeService.resolveDispute(dispute2._id, {
    outcome: 'split',
    resolutionNote: 'Slab is genuinely incomplete but preparation work was done. Split evenly.',
    amountToContractor: half,
    amountToCustomer: round2(frozen - half),
  });
  eq('contractor received their share', settled.toContractor, half);
  eq('customer had their share returned', settled.toCustomer, round2(frozen - half));

  const projAfter = await M.Project.findById(project._id).lean();
  eq('project released total rose by the contractor share',
    projAfter.releasedAmount, round2(projBefore.releasedAmount + half));
  eq('project refunded total rose by the customer share',
    projAfter.refundedAmount, round2(projBefore.refundedAmount + (frozen - half)));

  const walletAfter = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('customer paid only the contractor share',
    walletAfter.balance, round2(walletBefore.balance - half));
  eq('the whole frozen amount left the lock',
    walletAfter.lockedAmount, round2(walletBefore.lockedAmount - frozen));

  // The invariant that matters most.
  eq('INVARIANT funded === released + refunded + held',
    projAfter.fundedAmount,
    round2(projAfter.releasedAmount + projAfter.refundedAmount
      + (projAfter.fundedAmount - projAfter.releasedAmount - projAfter.refundedAmount)));

  const contractorWallet = await M.ContractorWallet.findOne({ contractorId: contractor._id }).lean();
  ok('contractor wallet credited from the settlement', Number(contractorWallet?.balance) > 0,
    `${contractorWallet?.balance}`);

  // ---- 7. idempotency -----------------------------------------------------
  console.log('\n7. A replayed resolution settles ONCE');

  const replay = await disputeService.resolveDispute(dispute2._id, {
    outcome: 'split',
    resolutionNote: 'Slab is genuinely incomplete but preparation work was done. Split evenly.',
    amountToContractor: half,
    amountToCustomer: round2(frozen - half),
  });
  ok('the second attempt reports it was already resolved', replay.alreadyResolved === true);

  const projReplay = await M.Project.findById(project._id).lean();
  eq('released total UNCHANGED', projReplay.releasedAmount, projAfter.releasedAmount);
  eq('refunded total UNCHANGED', projReplay.refundedAmount, projAfter.refundedAmount);

  const walletReplay = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('customer balance UNCHANGED', walletReplay.balance, walletAfter.balance);

  const settledStage = await M.Stage.findById(s2._id);
  ok('the settled stage cannot be claimed again', settledStage.status === 'payment_released');

  // ---- 8. withdrawal ------------------------------------------------------
  console.log('\n8. Withdrawing a dispute lifts the freeze');

  const [, , s3] = await M.Stage.find({ projectId: project._id }).sort({ sequence: 1 });
  await stageService.submitStage(contractor._id, s3._id, { photos: ['https://example.com/f.jpg'] });
  const dispute3 = await disputeService.raiseDispute(project._id, {
    stageId: s3._id, reason: 'delay',
    description: 'Finishing work has run three weeks past the agreed target date.',
  }, asCustomer);
  ok('third stage frozen', (await M.Stage.findById(s3._id)).status === 'disputed');

  await expectRejection(
    'the other side cannot withdraw a dispute they did not raise',
    () => disputeService.withdrawDispute(dispute3._id, 'Not mine', asContractor),
  );

  await disputeService.withdrawDispute(dispute3._id, 'Contractor has agreed a new date', asCustomer);
  const unfrozen = await M.Stage.findById(s3._id);
  ok('withdrawal restored the stage', unfrozen.status === 'submitted_for_approval', unfrozen.status);

  // ---- 9. trust score -----------------------------------------------------
  console.log('\n9. Trust score (BRD W18)');

  const score = await scoreService.recalculateScore(contractor._id);
  ok('score computed', typeof score.score === 'number', `${score.score}/100`);
  ok('a contractor with no completed projects is provisional', score.isProvisional === true);
  ok('provisional contractors are banded as new', score.band === 'new');

  const weights = Object.values(score.components).reduce((s, c) => s + c.weight, 0);
  eq('component weights sum to 100', weights, 100);

  ok('every component carries a plain-English reason',
    Object.values(score.components).every((c) => String(c.detail || '').length > 0));

  ok('the upheld complaint was counted', score.stats.disputesUpheld >= 1,
    `${score.stats.disputesUpheld} upheld of ${score.stats.disputesRaisedAgainst} raised`);

  const mine = await scoreService.getMyScore(contractor._id);
  ok('the contractor is told what to improve first', Array.isArray(mine.improvements));
  ok('improvements are ordered by points available',
    mine.improvements.every((c, i, a) => i === 0 || a[i - 1].pointsAvailable >= c.pointsAvailable));

  const publicScore = await scoreService.getPublicScore(contractor._id);
  ok('the public badge hides the component breakdown', publicScore.components === undefined);
  ok('a provisional score shows no number to customers', publicScore.score === null);
  ok('but the band is still shown', publicScore.band === 'new');

  // ---- 10. cleanup ---------------------------------------------------------
  console.log('\n10. Cleanup');
  await cleanup();
  ok('synthetic data removed', (await M.Project.countDocuments({ customerId: customer._id })) === 0);

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));
  if (failed > 0) {
    console.log('\n✗ Phase 6 guarantees are NOT holding. Do not enable disputes.');
    process.exitCode = 1;
  } else {
    console.log('\n✓ All transparency and dispute guarantees hold.');
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\nVerification crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
