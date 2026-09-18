import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { ConstructionSettings } from '../models/constructionSettings.model.js';

const SINGLETON_KEY = 'construction';

/** Sections an admin may update, and which permission action each one needs. */
const SECTIONS = ['quotation', 'stages', 'matching', 'commission', 'money', 'cancellation'];

let cache = { at: 0, doc: null };
const CACHE_MS = 10_000;

export const invalidateSettingsCache = () => {
  cache = { at: 0, doc: null };
};

/**
 * Read the settings, creating the singleton on first access so every default in
 * the schema becomes a real, editable row rather than an implicit value.
 */
export const getSettings = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && cache.doc && now - cache.at < CACHE_MS) return cache.doc;

  let doc = await ConstructionSettings.findOne({ key: SINGLETON_KEY }).lean();
  if (!doc) {
    try {
      const created = await ConstructionSettings.create({ key: SINGLETON_KEY });
      doc = created.toObject();
    } catch (err) {
      // Lost a create race — the row exists now.
      if (err?.code !== 11000) throw err;
      doc = await ConstructionSettings.findOne({ key: SINGLETON_KEY }).lean();
    }
  }
  cache = { at: now, doc };
  return doc;
};

/**
 * Merge a partial update into the settings.
 *
 * Sections are merged field by field rather than replaced, because the admin UI
 * saves one card at a time — a payload containing only `stages` must not blank
 * out `quotation`. Arrays ARE replaced wholesale, since a shorter list is a
 * deliberate removal.
 */
export const updateSettings = async (patch, reqUser = null) => {
  const doc = await ConstructionSettings.findOne({ key: SINGLETON_KEY })
    || await ConstructionSettings.create({ key: SINGLETON_KEY });

  const before = {};
  const after = {};

  for (const section of SECTIONS) {
    if (patch[section] === undefined) continue;
    const current = doc[section]?.toObject?.() ?? { ...(doc[section] || {}) };
    before[section] = current;
    doc.set(section, { ...current, ...patch[section] });
    after[section] = patch[section];
  }

  if (patch.documentTypes !== undefined) {
    before.documentTypes = doc.documentTypes;
    doc.documentTypes = patch.documentTypes;
    after.documentTypes = patch.documentTypes;
  }

  const performer = extractPerformer(reqUser);
  doc.updatedBy = performer;
  await doc.save();
  invalidateSettingsCache();

  await recordAudit({
    module: 'construction',
    entityType: 'settings',
    entityId: doc._id,
    action: 'settings.updated',
    before,
    after,
    performedBy: performer,
  });

  return doc.toObject();
};

/**
 * The subset of settings the customer and contractor apps are allowed to see.
 * Commission and cancellation terms are internal commercial policy and are
 * deliberately not exposed.
 */
export const getPublicSettings = async () => {
  const s = await getSettings();
  return {
    quotation: {
      lineItemFields: s.quotation?.lineItemFields || [],
      allowedUnits: s.quotation?.allowedUnits || [],
      sectionsEnabled: s.quotation?.sectionsEnabled !== false,
      defaultSections: s.quotation?.defaultSections || [],
      taxMode: s.quotation?.taxMode,
      taxLabel: s.quotation?.taxLabel,
      defaultTaxPercent: s.quotation?.defaultTaxPercent,
      defaultValidityDays: s.quotation?.defaultValidityDays,
      requireExclusions: s.quotation?.requireExclusions !== false,
    },
    stages: {
      mode: s.stages?.mode,
      minStages: s.stages?.minStages,
      maxStages: s.stages?.maxStages,
      maxSingleStagePercent: s.stages?.maxSingleStagePercent,
      maxFirstStagePercent: s.stages?.maxFirstStagePercent,
      minFinalStagePercent: s.stages?.minFinalStagePercent,
      stageApprovalMode: s.stages?.stageApprovalMode,
      approvalEscalationDays: s.stages?.approvalEscalationDays,
    },
    money: {
      retentionPercent: s.money?.retentionPercent,
      defectLiabilityDays: s.money?.defectLiabilityDays,
      siteVisitCharged: s.money?.siteVisitCharged === true,
      siteVisitFee: s.money?.siteVisitCharged ? s.money?.siteVisitFee : 0,
      variationOrdersEnabled: s.money?.variationOrdersEnabled !== false,
    },
    documentTypes: s.documentTypes || [],
  };
};
