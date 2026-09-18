/**
 * Deletes fields the CUSTOMER put on the record for their own eyes only — today just
 * serviceOtp (the customer reads it off their screen and tells the provider verbally;
 * the provider must never see it in a JSON response, only type it in). Call this on
 * every provider/staff-facing booking return path — never on the customer's own.
 * Mutates in place and returns the same object for terse call sites.
 */
export const stripProviderSensitiveFields = (bookingObj) => {
  if (bookingObj && typeof bookingObj === 'object') {
    delete bookingObj.serviceOtp;
  }
  return bookingObj;
};
