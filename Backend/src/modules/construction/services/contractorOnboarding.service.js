import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { ContractorDocument } from '../models/contractorDocument.model.js';
import { ContractorPortfolio } from '../models/contractorPortfolio.model.js';
import { ConstructionCategory } from '../models/constructionCategory.model.js';
import { createContractorSession, serializeContractor, pushStatusHistory } from './contractorAuth.service.js';
import { listCategories } from './catalog.service.js';

const alive = { isDeleted: { $ne: true } };

/** A contractor may only edit their own registration while it is still open. */
const getEditableContractor = async (contractorId) => {
  const contractor = await ContractorProfile.findOne({ _id: contractorId, ...alive });
  if (!contractor) throw new ValidationError('Contractor not found');
  if (contractor.status === 'approved') {
    throw new ValidationError('Your registration is already approved. Contact support to change these details.');
  }
  if (contractor.status === 'pending_approval') {
    throw new ValidationError('Your registration is under review and cannot be changed right now.');
  }
  return contractor;
};

/** Every selected trade must be a real, active category — never trusted from the client. */
const assertActiveTrades = async (tradeIds) => {
  const found = await ConstructionCategory
    .find({ _id: { $in: tradeIds }, ...alive, status: 'active' })
    .select('_id')
    .lean();
  if (found.length !== tradeIds.length) {
    throw new ValidationError('One or more selected types of work are not available');
  }
  return found.map((c) => String(c._id));
};

/** Save progress between steps without validating the whole form. */
export const saveDraft = async (contractorId, data) => {
  const contractor = await getEditableContractor(contractorId);

  const assignable = { ...data };
  delete assignable.onboardingStep;

  if (assignable.trades?.length) {
    assignable.trades = await assertActiveTrades(assignable.trades);
  }

  // Identity and bank fields live in sub-documents; the draft payload is flat.
  const documentKeys = ['panNumber', 'panImage', 'aadhaarNumber', 'aadhaarImage', 'gstNumber', 'gstImage'];
  const bankKeys = ['bankName', 'accountHolderName', 'accountNumber', 'ifscCode', 'accountType', 'upiId'];
  for (const key of documentKeys) {
    if (assignable[key] !== undefined) {
      contractor.documents = { ...(contractor.documents?.toObject?.() ?? contractor.documents ?? {}), [key]: assignable[key] };
      delete assignable[key];
    }
  }
  for (const key of bankKeys) {
    if (assignable[key] !== undefined) {
      contractor.bank = { ...(contractor.bank?.toObject?.() ?? contractor.bank ?? {}), [key]: assignable[key] };
      delete assignable[key];
    }
  }

  Object.assign(contractor, assignable);
  if (data.onboardingStep) {
    // Only ever move the marker forward — a contractor stepping back to review
    // an earlier screen must not lose the progress they have already made.
    contractor.onboardingStep = Math.max(contractor.onboardingStep || 1, data.onboardingStep);
  }
  await contractor.save();
  return { contractor: serializeContractor(contractor), resumeStep: contractor.onboardingStep };
};

/**
 * One-shot submit — validate everything, save it, and move to pending approval.
 *
 * Mints a fresh token pair on success, so a registration that took longer than
 * the access token's lifetime does not dump the contractor back at the login
 * screen the moment they finish.
 */
export const submitOnboarding = async (contractorId, data) => {
  const contractor = await getEditableContractor(contractorId);
  const trades = await assertActiveTrades(data.trades);

  // Rule 6 — verification rests on documents, so an application without at least
  // one licence or registration cannot be reviewed meaningfully.
  const documentCount = await ContractorDocument.countDocuments({
    contractorId: contractor._id,
    ...alive,
  });
  if (documentCount === 0) {
    throw new ValidationError(
      'Upload at least one licence or registration before submitting — your verification depends on it.',
    );
  }

  contractor.businessName = data.businessName;
  contractor.businessType = data.businessType;
  contractor.ownerName = data.ownerName;
  contractor.email = data.email;
  contractor.profileImage = data.profileImage;
  contractor.yearsExperience = data.yearsExperience;
  contractor.about = data.about;
  contractor.trades = trades;
  contractor.serviceAreas = data.serviceAreas;
  contractor.travelRadiusKm = data.travelRadiusKm;
  contractor.projectSizeMin = data.projectSizeMin;
  contractor.projectSizeMax = data.projectSizeMax;
  contractor.maxConcurrentProjects = data.maxConcurrentProjects;
  contractor.documents = {
    panNumber: data.panNumber,
    panImage: data.panImage,
    aadhaarNumber: data.aadhaarNumber,
    aadhaarImage: data.aadhaarImage,
    gstNumber: data.gstNumber,
    gstImage: data.gstImage,
  };
  contractor.bank = {
    bankName: data.bankName,
    accountHolderName: data.accountHolderName,
    accountNumber: data.accountNumber,
    ifscCode: data.ifscCode,
    accountType: data.accountType,
    upiId: data.upiId,
  };

  contractor.status = 'pending_approval';
  contractor.onboardingStep = 7;
  contractor.submittedAt = new Date();
  contractor.rejectionReason = '';
  pushStatusHistory(contractor, 'pending_approval', { reason: 'Submitted for verification' });
  await contractor.save();

  await recordAudit({
    module: 'construction',
    entityType: 'contractor',
    entityId: contractor._id,
    action: 'contractor.submitted',
    after: { status: 'pending_approval', businessName: contractor.businessName },
  });

  return createContractorSession(contractor);
};

/** Everything the registration wizard needs to resume where it left off. */
/**
 * Update a contractor's own profile after they have been approved.
 *
 * WHAT IS EDITABLE, AND WHY THE REST IS NOT
 *
 * Everything here is either presentation (photo, description) or a working
 * preference the contractor is entitled to change at will (where they travel,
 * what size of job they want, how many they can run at once). Changing any of it
 * cannot mislead a customer about who was verified.
 *
 * `businessName`, `ownerName` and `trades` are deliberately NOT editable. Your
 * team checked those against documents before approving. Letting a contractor
 * quietly rename themselves or add a trade nobody verified would hollow out the
 * verified badge that the whole module rests on — those go back through review.
 *
 * Bank details are excluded too, but for a different reason: changing where
 * money lands deserves its own deliberate path rather than riding along in a
 * general profile save.
 */
const EDITABLE_PROFILE_FIELDS = [
  'profileImage',
  'about',
  'email',
  'serviceAreas',
  'travelRadiusKm',
  'projectSizeMin',
  'projectSizeMax',
  'maxConcurrentProjects',
];

const LOCKED_PROFILE_FIELDS = {
  businessName: 'business name',
  ownerName: "owner's name",
  trades: 'trades',
  status: 'verification status',
  contractorCode: 'contractor code',
};

export const updateOwnProfile = async (contractorId, data = {}, reqUser = null) => {
  const contractor = await ContractorProfile.findById(contractorId);
  if (!contractor || contractor.isDeleted) throw new ValidationError('Contractor not found');

  const attemptedLock = Object.keys(LOCKED_PROFILE_FIELDS)
    .filter((f) => data[f] !== undefined);
  if (attemptedLock.length) {
    const names = attemptedLock.map((f) => LOCKED_PROFILE_FIELDS[f]).join(', ');
    throw new ValidationError(
      `Your ${names} was checked by our team when you were verified, so it cannot be `
      + 'changed here. Contact support if it is wrong.',
    );
  }

  const before = {};
  const after = {};

  for (const field of EDITABLE_PROFILE_FIELDS) {
    if (data[field] === undefined) continue;

    let value = data[field];
    if (field === 'serviceAreas') {
      value = (Array.isArray(value) ? value : [])
        .map((a) => String(a).trim())
        .filter(Boolean)
        .slice(0, 25);
      if (value.length === 0) {
        throw new ValidationError('Keep at least one city you work in');
      }
    } else if (['travelRadiusKm', 'projectSizeMin', 'projectSizeMax', 'maxConcurrentProjects']
      .includes(field)) {
      value = value === null || value === '' ? null : Number(value);
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        throw new ValidationError(`${field} must be a number that is zero or more`);
      }
    } else {
      value = String(value ?? '').trim();
    }

    if (String(contractor[field] ?? '') !== String(value ?? '')) {
      before[field] = contractor[field];
      after[field] = value;
      contractor[field] = value;
    }
  }

  if (Number(contractor.projectSizeMin) > 0 && Number(contractor.projectSizeMax) > 0
    && Number(contractor.projectSizeMin) > Number(contractor.projectSizeMax)) {
    throw new ValidationError('The smallest project you take cannot be larger than the largest');
  }

  if (Object.keys(after).length === 0) {
    return serializeContractor(await ContractorProfile.findById(contractorId)
      .populate('trades', 'name slug status'));
  }

  await contractor.save();

  await recordAudit({
    module: 'construction',
    entityType: 'contractor',
    entityId: contractor._id,
    action: 'contractor.profile_updated',
    before,
    after,
    performedBy: extractPerformer(reqUser) || null,
  });

  return serializeContractor(await ContractorProfile.findById(contractorId)
    .populate('trades', 'name slug status'));
};

export const getOnboardingDraft = async (contractorId) => {
  const contractor = await ContractorProfile.findOne({ _id: contractorId, ...alive })
    .populate('trades', 'name slug status');
  if (!contractor) throw new ValidationError('Contractor not found');

  const [documents, portfolio, availableTrades] = await Promise.all([
    ContractorDocument.find({ contractorId: contractor._id, ...alive }).sort({ createdAt: -1 }).lean(),
    ContractorPortfolio.find({ contractorId: contractor._id, ...alive }).sort({ displayOrder: 1, createdAt: -1 }).lean(),
    listCategories({ status: 'active' }),
  ]);

  return {
    contractor: serializeContractor(contractor),
    resumeStep: contractor.onboardingStep || 1,
    documents,
    portfolio,
    availableTrades,
  };
};

// ---------- Documents (BRD W3) ----------

export const addDocument = async (contractorId, data) => {
  const contractor = await ContractorProfile.findOne({ _id: contractorId, ...alive });
  if (!contractor) throw new ValidationError('Contractor not found');

  const document = await ContractorDocument.create({
    ...data,
    contractorId: contractor._id,
    status: 'pending',
  });
  return document.toObject();
};

export const listDocuments = async (contractorId) =>
  ContractorDocument.find({ contractorId, ...alive }).sort({ createdAt: -1 }).lean();

export const deleteDocument = async (contractorId, documentId) => {
  const document = await ContractorDocument.findOne({ _id: documentId, contractorId, ...alive });
  if (!document) throw new ValidationError('Document not found');
  if (document.status === 'verified') {
    throw new ValidationError('A verified document cannot be removed. Contact support.');
  }
  document.isDeleted = true;
  await document.save();
  return { id: String(documentId) };
};

// ---------- Portfolio (BRD W5) ----------

export const addPortfolioEntry = async (contractorId, data) => {
  const entry = await ContractorPortfolio.create({ ...data, contractorId });
  return entry.toObject();
};

export const listPortfolio = async (contractorId) =>
  ContractorPortfolio.find({ contractorId, ...alive })
    .populate('categoryId', 'name slug')
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean();

export const updatePortfolioEntry = async (contractorId, entryId, data) => {
  const entry = await ContractorPortfolio.findOne({ _id: entryId, contractorId, ...alive });
  if (!entry) throw new ValidationError('Portfolio entry not found');
  Object.assign(entry, data);
  await entry.save();
  return entry.toObject();
};

export const deletePortfolioEntry = async (contractorId, entryId) => {
  const entry = await ContractorPortfolio.findOne({ _id: entryId, contractorId, ...alive });
  if (!entry) throw new ValidationError('Portfolio entry not found');
  entry.isDeleted = true;
  await entry.save();
  return { id: String(entryId) };
};

/** Trades a contractor can pick during onboarding — reachable before approval. */
export const getSelectableTrades = () => listCategories({ status: 'active' });
