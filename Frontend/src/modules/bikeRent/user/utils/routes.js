export const BIKE_RENT_ACCENT = "#FF6A00";

export const getBikeRentHomePath = () => "/bike-rent";
export const getBikeRentBrowsePath = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.categoryId) qs.set("categoryId", String(params.categoryId));
  if (params.search) qs.set("search", String(params.search));
  const query = qs.toString();
  return query ? `/bike-rent/browse?${query}` : "/bike-rent/browse";
};
export const getBikeRentBikePath = (id) => `/bike-rent/bikes/${id}`;
export const getBikeRentCheckoutPath = () => "/bike-rent/checkout";
export const getBikeRentPayPath = (bookingId) => {
  const id = bookingId == null ? "" : String(bookingId).trim();
  if (!id || id === "undefined" || id === "null") return "/bike-rent/pay";
  return `/bike-rent/pay/${encodeURIComponent(id)}`;
};
export const getBikeRentBookingPath = (id) => `/bike-rent/bookings/${id}`;
export const getBikeRentBookingsPath = () => "/bike-rent/bookings";
export const getBikeRentActivePath = (id) => `/bike-rent/active/${id}`;
export const getBikeRentReturnPath = (id) => `/bike-rent/return/${id}`;
export const getBikeRentInvoicePath = (id) => `/bike-rent/invoice/${id}`;
export const getBikeRentReviewPath = (id) => `/bike-rent/review/${id}`;

/** @deprecated use getBikeRentBookingsPath */
export const getBikeRentRidesPath = () => getBikeRentBookingsPath();

export const getBikeRentSupportPath = () => "/bike-rent/support";
export const getBikeRentProfilePath = () => "/bike-rent/profile";

export const getBikeRentLiveChatPath = () => "/bike-rent/support/chat";
export const getBikeRentCallSupportPath = () => "/bike-rent/support/call";
export const getBikeRentSosPath = () => "/bike-rent/support/sos";
export const getBikeRentEmailSupportPath = () => "/bike-rent/support/email";
export const getBikeRentTopicPath = (slug) => `/bike-rent/support/topics/${slug}`;
export const getBikeRentHelpCenterPath = () => "/bike-rent/support/help-center";
export const getBikeRentFaqsPath = () => "/bike-rent/support/faqs";
export const getBikeRentContactSupportPath = () => "/bike-rent/support/contact";

export const getBikeRentEditProfilePath = () => "/bike-rent/profile/edit";
export const getBikeRentAddressesPath = () => "/bike-rent/profile/addresses";
export const getBikeRentWalletPath = () => "/bike-rent/profile/wallet";
export const getBikeRentSubscriptionPath = () => "/bike-rent/profile/subscription";
export const getBikeRentReferPath = () => "/bike-rent/profile/refer";
export const getBikeRentNotificationsPath = () => "/bike-rent/profile/notifications";
export const getBikeRentSecurityPath = () => "/bike-rent/profile/security";
export const getBikeRentProfileFaqsPath = () => "/bike-rent/profile/faqs";
export const getBikeRentProfileContactPath = () => "/bike-rent/profile/contact";
export const getBikeRentProfileHelpPath = () => "/bike-rent/profile/help-center";
export const getBikeRentPrivacyPath = () => "/bike-rent/profile/privacy";
export const getBikeRentTermsPath = () => "/bike-rent/profile/terms";
export const getBikeRentRefundPath = () => "/bike-rent/profile/refund";
export const getBikeRentDeleteAccountPath = () => "/bike-rent/profile/delete-account";
