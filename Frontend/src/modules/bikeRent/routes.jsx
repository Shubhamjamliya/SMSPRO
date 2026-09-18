import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProfileProvider } from "@food/context/ProfileContext";
import ProtectedRoute from "@food/components/ProtectedRoute";
import {
  ContactSupportPage,
  FaqsPage,
  HelpCenterPage,
} from "./user/pages/support/HelpShared";
import { getBikeRentProfilePath, getBikeRentSupportPath } from "./user/utils/routes";
import { BIKE_RENT_USER_LOGIN_PATH } from "./user/utils/authUser";
import VendorProtectedRoute from "./vendor/components/VendorProtectedRoute";

const BikeRentHome = lazy(() => import("./user/pages/Home"));
const BikeRentBrowse = lazy(() => import("./user/pages/Browse"));
const BikeDetails = lazy(() => import("./user/pages/BikeDetails"));
const Checkout = lazy(() => import("./user/pages/Checkout"));
const Payment = lazy(() => import("./user/pages/Payment"));
const BookingConfirmation = lazy(() => import("./user/pages/BookingConfirmation"));
const Bookings = lazy(() => import("./user/pages/Bookings"));
const ActiveRental = lazy(() => import("./user/pages/ActiveRental"));
const ReturnRequest = lazy(() => import("./user/pages/ReturnRequest"));
const Invoice = lazy(() => import("./user/pages/Invoice"));
const Review = lazy(() => import("./user/pages/Review"));
const BikeRentSupport = lazy(() => import("./user/pages/Support"));
const BikeRentProfile = lazy(() => import("./user/pages/Profile"));

const SupportTopicDetail = lazy(
  () => import("./user/pages/support/TopicDetail"),
);
const EmergencySos = lazy(() => import("./user/pages/support/EmergencySos"));
const LiveChat = lazy(() => import("./user/pages/support/LiveChat"));
const CallSupport = lazy(() => import("./user/pages/support/CallSupport"));
const EmailSupport = lazy(() => import("./user/pages/support/EmailSupport"));

const EditProfile = lazy(() => import("./user/pages/profile/EditProfile"));
const SavedAddresses = lazy(
  () => import("./user/pages/profile/SavedAddresses"),
);
const WalletPage = lazy(() => import("./user/pages/profile/Wallet"));
const SubscriptionPage = lazy(
  () => import("./user/pages/profile/Subscription"),
);
const ReferEarnPage = lazy(() => import("./user/pages/profile/ReferEarn"));
const NotificationsPage = lazy(
  () => import("./user/pages/profile/Notifications"),
);
const SecurityPage = lazy(() => import("./user/pages/profile/Security"));
const DeleteAccountPage = lazy(
  () => import("./user/pages/profile/DeleteAccount"),
);
const PrivacyPolicyPage = lazy(() =>
  import("./user/pages/profile/Policies").then((m) => ({
    default: m.PrivacyPolicyPage,
  })),
);
const TermsPage = lazy(() =>
  import("./user/pages/profile/Policies").then((m) => ({
    default: m.TermsPage,
  })),
);
const RefundPolicyPage = lazy(() =>
  import("./user/pages/profile/Policies").then((m) => ({
    default: m.RefundPolicyPage,
  })),
);

const VendorLogin = lazy(() => import("./vendor/pages/VendorLogin"));
const VendorOnboarding = lazy(() => import("./vendor/pages/VendorOnboarding"));
const VendorPending = lazy(() => import("./vendor/pages/VendorPending"));
const VendorDashboard = lazy(() => import("./vendor/pages/VendorDashboard"));
const VendorZones = lazy(() => import("./vendor/pages/VendorZones"));
const VendorAddZone = lazy(() => import("./vendor/pages/VendorAddZone"));
const VendorHubs = lazy(() => import("./vendor/pages/VendorHubs"));
const VendorBikes = lazy(() => import("./vendor/pages/VendorBikes"));
const VendorCategories = lazy(() => import("./vendor/pages/VendorCategories"));
const VendorBookings = lazy(() => import("./vendor/pages/VendorBookings"));
const VendorWallet = lazy(() => import("./vendor/pages/VendorWallet"));
const VendorTransactions = lazy(() => import("./vendor/pages/VendorTransactions"));
const VendorNotifications = lazy(() => import("./vendor/pages/VendorNotifications"));
const VendorReports = lazy(() => import("./vendor/pages/VendorReports"));
const VendorCoupons = lazy(() => import("./vendor/pages/VendorCoupons"));
const VendorSettings = lazy(() => import("./vendor/pages/VendorSettings"));
const VendorFleetTimeline = lazy(() => import("./vendor/pages/VendorFleetTimeline"));
const VendorInspections = lazy(() => import("./vendor/pages/VendorInspections"));
const VendorTaxBilling = lazy(() => import("./vendor/pages/VendorTaxBilling"));
const VendorSettlements = lazy(() => import("./vendor/pages/VendorSettlements"));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F8]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF6A00] border-t-transparent" />
    </div>
  );
}

function AuthGate({ children }) {
  return (
    <ProtectedRoute requiredRole="user" loginPath={BIKE_RENT_USER_LOGIN_PATH}>
      {children}
    </ProtectedRoute>
  );
}

export default function BikeRentRoutes() {
  return (
    <ProfileProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route index element={<BikeRentHome />} />
          <Route path="browse" element={<BikeRentBrowse />} />
          <Route path="bikes/:id" element={<BikeDetails />} />
          <Route path="checkout" element={<AuthGate><Checkout /></AuthGate>} />
          <Route path="pay/:bookingId?" element={<AuthGate><Payment /></AuthGate>} />
          <Route path="bookings" element={<AuthGate><Bookings /></AuthGate>} />
          <Route path="bookings/:id" element={<AuthGate><BookingConfirmation /></AuthGate>} />
          <Route path="active/:id" element={<AuthGate><ActiveRental /></AuthGate>} />
          <Route path="return/:id" element={<AuthGate><ReturnRequest /></AuthGate>} />
          <Route path="invoice/:id" element={<AuthGate><Invoice /></AuthGate>} />
          <Route path="review/:id" element={<AuthGate><Review /></AuthGate>} />
          <Route path="rides" element={<Navigate to="/bike-rent/bookings" replace />} />

          {/* Bike Rental Vendor onboarding */}
          <Route path="vendor/login" element={<VendorLogin />} />
          <Route path="vendor/onboarding" element={<VendorOnboarding />} />
          <Route
            path="vendor/pending"
            element={
              <VendorProtectedRoute allowPending>
                <VendorPending />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/dashboard"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorDashboard />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/zones"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorZones />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/zones/new"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorAddZone />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/zones/:id/edit"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorAddZone />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/hubs"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorHubs />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/bikes"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorBikes />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/categories"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorCategories />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/bookings"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorBookings />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/wallet"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorWallet />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/transactions"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorTransactions />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/notifications"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorNotifications />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/reports"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorReports />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/coupons"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorCoupons />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/settings"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorSettings />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/tax-billing"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorTaxBilling />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/settlements"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorSettlements />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/fleet-timeline"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorFleetTimeline />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="vendor/inspections"
            element={
              <VendorProtectedRoute requireApproved>
                <VendorInspections />
              </VendorProtectedRoute>
            }
          />
          <Route path="vendor" element={<Navigate to="/bike-rent/vendor/login" replace />} />

          <Route path="support" element={<BikeRentSupport />} />
          <Route path="support/chat" element={<LiveChat />} />
          <Route path="support/call" element={<CallSupport />} />
          <Route path="support/email" element={<EmailSupport />} />
          <Route path="support/sos" element={<EmergencySos />} />
          <Route path="support/topics/:slug" element={<SupportTopicDetail />} />
          <Route
            path="support/help-center"
            element={<HelpCenterPage backTo={getBikeRentSupportPath()} />}
          />
          <Route
            path="support/faqs"
            element={<FaqsPage backTo={getBikeRentSupportPath()} />}
          />
          <Route
            path="support/contact"
            element={<ContactSupportPage backTo={getBikeRentSupportPath()} />}
          />

          <Route path="profile" element={<BikeRentProfile />} />
          <Route
            path="profile/edit"
            element={
              <AuthGate>
                <EditProfile />
              </AuthGate>
            }
          />
          <Route
            path="profile/addresses"
            element={
              <AuthGate>
                <SavedAddresses />
              </AuthGate>
            }
          />
          <Route
            path="profile/wallet"
            element={
              <AuthGate>
                <WalletPage />
              </AuthGate>
            }
          />
          <Route
            path="profile/subscription"
            element={
              <AuthGate>
                <SubscriptionPage />
              </AuthGate>
            }
          />
          <Route
            path="profile/refer"
            element={
              <AuthGate>
                <ReferEarnPage />
              </AuthGate>
            }
          />
          <Route
            path="profile/notifications"
            element={
              <AuthGate>
                <NotificationsPage />
              </AuthGate>
            }
          />
          <Route
            path="profile/security"
            element={
              <AuthGate>
                <SecurityPage />
              </AuthGate>
            }
          />
          <Route
            path="profile/faqs"
            element={<FaqsPage backTo={getBikeRentProfilePath()} />}
          />
          <Route
            path="profile/contact"
            element={<ContactSupportPage backTo={getBikeRentProfilePath()} />}
          />
          <Route
            path="profile/help-center"
            element={<HelpCenterPage backTo={getBikeRentProfilePath()} />}
          />
          <Route path="profile/privacy" element={<PrivacyPolicyPage />} />
          <Route path="profile/terms" element={<TermsPage />} />
          <Route path="profile/refund" element={<RefundPolicyPage />} />
          <Route
            path="profile/delete-account"
            element={
              <AuthGate>
                <DeleteAccountPage />
              </AuthGate>
            }
          />

          <Route path="*" element={<Navigate to="/bike-rent" replace />} />
        </Routes>
      </Suspense>
    </ProfileProvider>
  );
}
