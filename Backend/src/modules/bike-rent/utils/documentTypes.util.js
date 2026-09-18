/**
 * Fixed catalog of ID document types a vendor can require riders to carry at bike pickup.
 * This is intentionally NOT admin-configurable — vendors choose per-bike from this list,
 * and each entry maps directly to the FoodUser profile fields the rider's proof gets saved to.
 */
export const BIKE_DOCUMENT_TYPES = [
    { key: 'driving_license', label: 'Driving License', fields: ['drivingLicenseFront', 'drivingLicenseBack'] },
    { key: 'aadhaar_card', label: 'Aadhaar Card', fields: ['aadhaarFront', 'aadhaarBack'] },
    { key: 'pan_card', label: 'PAN Card', fields: ['panCardImage'] },
    { key: 'passport', label: 'Passport', fields: ['passportImage'] },
    { key: 'voter_id', label: 'Voter ID', fields: ['voterIdImage'] },
];

export const BIKE_DOCUMENT_TYPE_KEYS = new Set(BIKE_DOCUMENT_TYPES.map((d) => d.key));

export const getBikeDocumentType = (key) => BIKE_DOCUMENT_TYPES.find((d) => d.key === key) || null;
