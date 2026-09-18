/**
 * Persist multi-step booking drafts so cross-module deep links don't wipe forms.
 */
const PREFIX = 'smspro_booking_draft_';
const LEGACY_PREFIX = 'justorder_booking_draft_';

export function saveBookingDraft(moduleKey, draft) {
  try {
    sessionStorage.setItem(
      `${PREFIX}${moduleKey}`,
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadBookingDraft(moduleKey) {
  try {
    const raw =
      sessionStorage.getItem(`${PREFIX}${moduleKey}`) ||
      sessionStorage.getItem(`${LEGACY_PREFIX}${moduleKey}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearBookingDraft(moduleKey) {
  try {
    sessionStorage.removeItem(`${PREFIX}${moduleKey}`);
  } catch {
    /* ignore */
  }
}
