/**
 * Browser draft for half-finished seller onboarding.
 * Stored per phone so a different OTP/login never reuses another shop's images/fields.
 */
export const SELLER_ONBOARDING_DRAFT_KEY = "sellerOnboardingDraft";
export const SELLER_ONBOARDING_DRAFT_PREFIX = "sellerOnboardingDraft:v2:";

export const normalizeSellerDraftPhone = (value = "") =>
  String(value || "").replace(/\D/g, "").slice(-10);

const draftKeyForPhone = (phone = "") => {
  const digits = normalizeSellerDraftPhone(phone);
  return digits ? `${SELLER_ONBOARDING_DRAFT_PREFIX}${digits}` : null;
};

/** Only restore a draft that belongs to the same seller phone. */
export const draftMatchesSellerPhone = (draft, phone) => {
  const draftPhone = normalizeSellerDraftPhone(
    draft?.phone || draft?.form?.phone || "",
  );
  const sellerPhone = normalizeSellerDraftPhone(phone);
  return Boolean(draftPhone && sellerPhone && draftPhone === sellerPhone);
};

export const readSellerOnboardingDraft = (phone = "") => {
  try {
    const scopedKey = draftKeyForPhone(phone);
    if (scopedKey) {
      const scopedRaw = localStorage.getItem(scopedKey);
      if (scopedRaw) {
        const parsed = JSON.parse(scopedRaw);
        if (parsed && typeof parsed === "object") {
          return draftMatchesSellerPhone(parsed, phone) ? parsed : null;
        }
      }
    }

    // Legacy single-key draft — only if phone matches.
    const raw = localStorage.getItem(SELLER_ONBOARDING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const wanted = normalizeSellerDraftPhone(phone);
    if (!wanted) return null;
    return draftMatchesSellerPhone(parsed, wanted) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeSellerOnboardingDraft = (draft) => {
  try {
    const phone = normalizeSellerDraftPhone(
      draft?.phone || draft?.form?.phone || "",
    );
    if (!phone) return;

    const payload = {
      ...draft,
      phone,
      form: {
        ...(draft?.form || {}),
        phone: draft?.form?.phone || phone,
      },
      updatedAt: Date.now(),
    };

    const scopedKey = draftKeyForPhone(phone);
    if (scopedKey) {
      localStorage.setItem(scopedKey, JSON.stringify(payload));
    }
    localStorage.setItem(SELLER_ONBOARDING_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be full or blocked; the form still works from memory.
  }
};

/** Clear one phone's draft, or all seller onboarding drafts when phone is empty. */
export const clearSellerOnboardingDraft = (phone = "") => {
  try {
    const digits = normalizeSellerDraftPhone(phone);
    if (digits) {
      localStorage.removeItem(`${SELLER_ONBOARDING_DRAFT_PREFIX}${digits}`);
    } else {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(SELLER_ONBOARDING_DRAFT_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
    localStorage.removeItem(SELLER_ONBOARDING_DRAFT_KEY);
    sessionStorage.removeItem("sellerReonboard");
  } catch {
    // Nothing to recover from here.
  }
};
