import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProfileProvider } from "@food/context/ProfileContext";
import ProtectedRoute from "@food/components/ProtectedRoute";
import {
  ContactSupportPage,
  FaqsPage,
  HelpCenterPage,
} from "./user/pages/support/HelpShared";
import { getTaxiProfilePath, getTaxiSupportPath } from "./user/utils/routes";
import { TAXI_USER_LOGIN_PATH } from "./user/utils/authUser";

const TaxiHome = lazy(() => import("./user/pages/Home"));
const TaxiRides = lazy(() => import("./user/pages/Rides"));
const TaxiSupport = lazy(() => import("./user/pages/Support"));
const TaxiProfile = lazy(() => import("./user/pages/Profile"));

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

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F8]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF6A00] border-t-transparent" />
    </div>
  );
}

function AuthGate({ children }) {
  return (
    <ProtectedRoute requiredRole="user" loginPath={TAXI_USER_LOGIN_PATH}>
      {children}
    </ProtectedRoute>
  );
}

export default function TaxiRoutes() {
  return (
    <ProfileProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route index element={<TaxiHome />} />
          <Route path="rides" element={<TaxiRides />} />

          <Route path="support" element={<TaxiSupport />} />
          <Route path="support/chat" element={<LiveChat />} />
          <Route path="support/call" element={<CallSupport />} />
          <Route path="support/email" element={<EmailSupport />} />
          <Route path="support/sos" element={<EmergencySos />} />
          <Route path="support/topics/:slug" element={<SupportTopicDetail />} />
          <Route
            path="support/help-center"
            element={<HelpCenterPage backTo={getTaxiSupportPath()} />}
          />
          <Route
            path="support/faqs"
            element={<FaqsPage backTo={getTaxiSupportPath()} />}
          />
          <Route
            path="support/contact"
            element={<ContactSupportPage backTo={getTaxiSupportPath()} />}
          />

          <Route path="profile" element={<TaxiProfile />} />
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
            element={<FaqsPage backTo={getTaxiProfilePath()} />}
          />
          <Route
            path="profile/contact"
            element={<ContactSupportPage backTo={getTaxiProfilePath()} />}
          />
          <Route
            path="profile/help-center"
            element={<HelpCenterPage backTo={getTaxiProfilePath()} />}
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

          <Route path="*" element={<Navigate to="/taxi" replace />} />
        </Routes>
      </Suspense>
    </ProfileProvider>
  );
}
