import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthPageGuard } from '@core/guards/RouteGuard';
import Loader from "@food/components/Loader";
import DeliveryShell from "./components/layout/DeliveryShell";
import {
  loadBusinessSettings,
  getCachedSettings,
  getAppFavicon,
  updateBrowserFavicon,
} from "@common/utils/businessSettings";

// Auth Pages (Lazy loaded)
const Welcome = lazy(() => import("./pages/auth/Welcome"))
const SignIn = lazy(() => import("./pages/auth/SignIn"))
const OTP = lazy(() => import("./pages/auth/OTP"))
const SignupStep1 = lazy(() => import("./pages/auth/SignupStep1"))
const SignupStepAddress = lazy(() => import("./pages/auth/SignupStepAddress"))
const SignupStep2 = lazy(() => import("./pages/auth/SignupStep2"))
const SignupStepReview = lazy(() => import("./pages/auth/SignupStepReview"))
const PendingVerification = lazy(() => import("./pages/auth/PendingVerification"))

// V2 Pages
import DeliveryHomeV2 from './pages/DeliveryHomeV2';
import { PayoutV2 } from './pages/pocket/PayoutV2';
import { PocketStatementV2 } from './pages/pocket/PocketStatementV2';
import { DeductionStatementV2 } from './pages/pocket/DeductionStatementV2';
import { LimitSettlementV2 } from './pages/pocket/LimitSettlementV2';
import { PocketBalanceV2 } from './pages/pocket/PocketBalanceV2';
import { CashLimitInfoV2 } from './pages/pocket/CashLimitInfoV2';
import { ProfileBankV2 } from './pages/profile/ProfileBankV2';
import { ProfileDocsV2 } from './pages/profile/ProfileDocsV2';
import { SupportTicketsV2 } from './pages/help/SupportTicketsV2';
import { CreateSupportTicketV2 } from './pages/help/CreateSupportTicketV2';
import { ViewSupportTicketV2 } from './pages/help/ViewSupportTicketV2';
import ShowIdCardV2 from './pages/help/ShowIdCardV2';
import { PocketDetailsV2 } from './pages/pocket/PocketDetailsV2';
import { ProfileDetailsV2 } from './pages/profile/ProfileDetailsV2';
import TermsAndConditionsV2 from './pages/TermsAndConditionsV2';
import PrivacyPolicyV2 from './pages/PrivacyPolicyV2';
import RefundPolicyV2 from './pages/RefundPolicyV2';
import ShippingPolicyV2 from './pages/ShippingPolicyV2';
import CancellationPolicyV2 from './pages/CancellationPolicyV2';
import NotificationsV2 from './pages/NotificationsV2';
import SubscriptionV2 from './pages/SubscriptionV2';

const DeliveryV2Router = () => {
  const location = useLocation();

  useEffect(() => {
    const applyDeliveryFavicon = () => {
      const deliveryFavicon = getAppFavicon("delivery");
      if (deliveryFavicon) {
        updateBrowserFavicon(deliveryFavicon);
      }
    };

    if (getCachedSettings()) {
      applyDeliveryFavicon();
    } else {
      loadBusinessSettings().then(() => applyDeliveryFavicon());
    }
  }, []);

  return (
    <DeliveryShell>
        <Suspense fallback={<Loader />}>
          <Routes>
        {/* Auth routes — redirect to home if already logged in */}
        <Route path="welcome" element={<AuthPageGuard module="delivery" home="/food/delivery"><Welcome /></AuthPageGuard>} />
        <Route path="login" element={<AuthPageGuard module="delivery" home="/food/delivery"><SignIn /></AuthPageGuard>} />
        {/* Canonical auth path used by RouteGuard */}
        <Route path="auth/login" element={<AuthPageGuard module="delivery" home="/food/delivery"><SignIn /></AuthPageGuard>} />
        <Route path="otp" element={<AuthPageGuard module="delivery" home="/food/delivery"><OTP /></AuthPageGuard>} />
        <Route path="signup" element={<Navigate to={`/food/delivery/login${location.search}`} replace />} />
        <Route path="signup/details" element={<SignupStep1 />} />
        <Route path="signup/address" element={<SignupStepAddress />} />
        <Route path="signup/documents" element={<SignupStep2 />} />
        <Route path="signup/review" element={<SignupStepReview />} />
        <Route path="verification" element={<PendingVerification />} />
        <Route path="terms" element={<TermsAndConditionsV2 />} />
        <Route path="privacy" element={<PrivacyPolicyV2 />} />

        {/* Protected Core Routes */}
        <Route path="/" element={<ProtectedRoute><DeliveryHomeV2 tab="feed" /></ProtectedRoute>} />
        <Route path="/feed" element={<ProtectedRoute><DeliveryHomeV2 tab="feed" /></ProtectedRoute>} />
        <Route path="/pocket" element={<ProtectedRoute><DeliveryHomeV2 tab="pocket" /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><DeliveryHomeV2 tab="history" /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><DeliveryHomeV2 tab="profile" /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsV2 /></ProtectedRoute>} />
        <Route path="/profile/details" element={<ProtectedRoute><ProfileDetailsV2 /></ProtectedRoute>} />
        <Route path="/profile/bank" element={<ProtectedRoute><ProfileBankV2 /></ProtectedRoute>} />
        <Route path="/profile/documents" element={<ProtectedRoute><ProfileDocsV2 /></ProtectedRoute>} />
        <Route path="/subscription" element={<Navigate to="/food/delivery" replace />} />
        
        {/* Support Systems */}
        <Route path="/help/tickets" element={<ProtectedRoute><SupportTicketsV2 /></ProtectedRoute>} />
        <Route path="/help/tickets/create" element={<ProtectedRoute><CreateSupportTicketV2 /></ProtectedRoute>} />
        <Route path="/help/tickets/:ticketId" element={<ProtectedRoute><ViewSupportTicketV2 /></ProtectedRoute>} />
        <Route path="/help/id-card" element={<ProtectedRoute><ShowIdCardV2 /></ProtectedRoute>} />
        <Route path="/profile/terms" element={<ProtectedRoute><TermsAndConditionsV2 /></ProtectedRoute>} />
        <Route path="/profile/privacy" element={<ProtectedRoute><PrivacyPolicyV2 /></ProtectedRoute>} />
        <Route path="/profile/refund" element={<ProtectedRoute><RefundPolicyV2 /></ProtectedRoute>} />
        <Route path="/profile/shipping" element={<ProtectedRoute><ShippingPolicyV2 /></ProtectedRoute>} />
        <Route path="/profile/cancellation" element={<ProtectedRoute><CancellationPolicyV2 /></ProtectedRoute>} />
        
        {/* Financial Deep-Pages */}
        <Route path="/pocket/payout" element={<ProtectedRoute><PayoutV2 /></ProtectedRoute>} />
        <Route path="/pocket/statement" element={<ProtectedRoute><PocketStatementV2 /></ProtectedRoute>} />
        <Route path="/pocket/deductions" element={<ProtectedRoute><DeductionStatementV2 /></ProtectedRoute>} />
        <Route path="/pocket/limit-settlement" element={<ProtectedRoute><LimitSettlementV2 /></ProtectedRoute>} />
        <Route path="/pocket/balance" element={<ProtectedRoute><PocketBalanceV2 /></ProtectedRoute>} />
        <Route path="/pocket/cash-limit" element={<ProtectedRoute><CashLimitInfoV2 /></ProtectedRoute>} />
        <Route path="/pocket/details" element={<ProtectedRoute><PocketDetailsV2 /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/food/delivery" replace />} />
          </Routes>
        </Suspense>
    </DeliveryShell>
  );
};

export default DeliveryV2Router;
