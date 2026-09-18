import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodRestaurant } from '../models/restaurant.model.js';

/**
 * Normalize restaurant phone values for storage and uniqueness checks.
 * Strips country codes / formatting; canonical form is last-10 digits.
 */
export function normalizeRestaurantPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(-15);
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits || '';
  return {
    raw: String(value ?? '').trim(),
    digits: digits || '',
    last10,
    isValid10: /^\d{10}$/.test(last10),
  };
}

/**
 * Match filter for a stored phone field (exact candidates + suffix).
 */
export function buildPhoneMatchFilter(field, phoneValue) {
  const { digits, last10 } = normalizeRestaurantPhone(phoneValue);
  if (!digits && !last10) return null;

  const candidates = [...new Set([phoneValue, digits, last10].filter(Boolean).map(String))];
  const clauses = [{ [field]: { $in: candidates } }];
  if (last10) {
    clauses.push({ [field]: { $regex: new RegExp(`${last10}$`) } });
  }
  return { $or: clauses };
}

function buildEitherPhoneConflictQuery(last10, digits) {
  const candidates = [...new Set([last10, digits].filter(Boolean))];
  return {
    $or: [
      { primaryContactNumber: { $in: candidates } },
      { ownerPhone: { $in: candidates } },
      ...(last10
        ? [
            { primaryContactNumber: { $regex: new RegExp(`${last10}$`) } },
            { ownerPhone: { $regex: new RegExp(`${last10}$`) } },
          ]
        : []),
      // Legacy derived fields (read-only migration window)
      { primaryContactLast10: last10 },
      { ownerPhoneLast10: last10 },
      { ownerPhoneDigits: digits },
    ],
  };
}

/**
 * A phone may not appear as primaryContactNumber OR ownerPhone on any other restaurant.
 * Soft-deleted restaurants still occupy the number (existing business rule).
 */
export async function assertRestaurantPhoneUnique(
  phoneValue,
  { excludeRestaurantId = null, label = 'Phone number' } = {}
) {
  const { last10, digits, isValid10 } = normalizeRestaurantPhone(phoneValue);
  if (!last10) {
    throw new ValidationError(`${label} is required`);
  }
  if (!isValid10) {
    throw new ValidationError(`${label} must be exactly 10 digits`);
  }

  const query = buildEitherPhoneConflictQuery(last10, digits);
  if (excludeRestaurantId) {
    query._id = { $ne: excludeRestaurantId };
  }

  const conflict = await FoodRestaurant.findOne(query)
    .select('_id restaurantName status primaryContactNumber ownerPhone')
    .lean();

  if (conflict) {
    throw new ValidationError(
      `${label} is already registered with another restaurant`,
      'PHONE_EXISTS'
    );
  }

  return { last10, digits };
}

/**
 * Validate both restaurant phones (each globally unique across primary + owner).
 * Same number on both fields of the same restaurant is allowed.
 */
export async function assertRestaurantPhonesUnique(
  { primaryContactNumber, ownerPhone } = {},
  { excludeRestaurantId = null } = {}
) {
  const primary = normalizeRestaurantPhone(primaryContactNumber);
  const owner = normalizeRestaurantPhone(ownerPhone);

  if (primary.last10) {
    await assertRestaurantPhoneUnique(primary.last10, {
      excludeRestaurantId,
      label: 'Primary contact number',
    });
  }

  if (owner.last10 && owner.last10 !== primary.last10) {
    await assertRestaurantPhoneUnique(owner.last10, {
      excludeRestaurantId,
      label: 'Owner phone number',
    });
  } else if (owner.last10 && !primary.last10) {
    await assertRestaurantPhoneUnique(owner.last10, {
      excludeRestaurantId,
      label: 'Owner phone number',
    });
  }

  return {
    primaryContactNumber: primary.last10 || '',
    ownerPhone: owner.last10 || '',
  };
}

/** @deprecated Use assertRestaurantPhoneUnique / assertRestaurantPhonesUnique */
export async function assertPrimaryContactUnique(primaryContactNumber, options = {}) {
  return assertRestaurantPhoneUnique(primaryContactNumber, {
    ...options,
    label: 'Primary contact number',
  });
}

/**
 * Single login lookup: normalize phone, match primaryContactNumber OR ownerPhone.
 */
export async function findRestaurantByLoginPhone(phone, { lean = false } = {}) {
  const { digits, last10 } = normalizeRestaurantPhone(phone);
  if (!last10) return null;

  const query = buildEitherPhoneConflictQuery(last10, digits);
  const q = FoodRestaurant.findOne(query);
  return lean ? q.lean() : q;
}

/** Legacy derived phone keys — must never be persisted going forward. */
export const LEGACY_RESTAURANT_PHONE_FIELDS = [
  'primaryContactLast10',
  'primaryContactDigits',
  'ownerPhoneLast10',
  'ownerPhoneDigits',
];

export const LEGACY_RESTAURANT_PHONE_UNSET = Object.fromEntries(
  LEGACY_RESTAURANT_PHONE_FIELDS.map((key) => [key, 1])
);

/**
 * Shared persist shape for admin + self-onboarding.
 * Accepts `ownerPhone` / `ownerPhoneNumber` aliases.
 * Returns only `primaryContactNumber` + `ownerPhone` (canonical last-10).
 */
export function prepareRestaurantPhoneFields(
  { primaryContactNumber, ownerPhone, ownerPhoneNumber } = {},
  { requireBoth = false } = {}
) {
  const primary = normalizeRestaurantPhone(primaryContactNumber);
  const owner = normalizeRestaurantPhone(ownerPhone ?? ownerPhoneNumber);

  if (requireBoth) {
    if (!primary.isValid10) {
      throw new ValidationError('Primary contact number must be exactly 10 digits');
    }
    if (!owner.isValid10) {
      throw new ValidationError('Owner phone number must be exactly 10 digits');
    }
  } else {
    if (primary.digits && !primary.isValid10) {
      throw new ValidationError('Primary contact number must be exactly 10 digits');
    }
    if (owner.digits && !owner.isValid10) {
      throw new ValidationError('Owner phone number must be exactly 10 digits');
    }
  }

  return {
    primaryContactNumber: primary.isValid10 ? primary.last10 : '',
    ownerPhone: owner.isValid10 ? owner.last10 : '',
  };
}

/** Remove legacy derived phone keys from an in-memory mongoose doc / plain object. */
export function stripLegacyRestaurantPhoneFields(doc) {
  if (!doc) return doc;
  for (const key of LEGACY_RESTAURANT_PHONE_FIELDS) {
    if (doc._doc && Object.prototype.hasOwnProperty.call(doc._doc, key)) {
      delete doc._doc[key];
    }
    if (Object.prototype.hasOwnProperty.call(doc, key)) {
      try {
        delete doc[key];
      } catch {
        // ignore non-configurable props
      }
    }
  }
  return doc;
}

/** Persistently $unset legacy derived phone fields in MongoDB. */
export async function unsetLegacyRestaurantPhoneFields(restaurantId) {
  if (!restaurantId) return;
  await FoodRestaurant.updateOne(
    { _id: restaurantId },
    { $unset: LEGACY_RESTAURANT_PHONE_UNSET }
  );
}
