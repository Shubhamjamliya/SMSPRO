import { Suspense, lazy, useEffect } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { loadBusinessSettings, setAppType } from "@common/utils/businessSettings"
import ProtectedRoute from "@food/components/ProtectedRoute"
import { AuthPageGuard } from "@core/guards/RouteGuard"
import Loader from "@food/components/Loader"
import ErrorBoundary from "@food/components/ErrorBoundary"
import RestaurantLayout from "./RestaurantLayout"

// Auth pages
const Welcome              = lazy(() => import("@food/pages/restaurant/auth/Welcome"))
const Login                = lazy(() => import("@food/pages/restaurant/auth/Login"))
const OTP                  = lazy(() => import("@food/pages/restaurant/auth/OTP"))
const Signup               = lazy(() => import("@food/pages/restaurant/auth/Signup"))
const ForgotPassword       = lazy(() => import("@food/pages/restaurant/auth/ForgotPassword"))
const VerificationPending  = lazy(() => import("@food/pages/restaurant/auth/VerificationPending"))

// Dashboard + core
const Dashboard            = lazy(() => import("@food/pages/restaurant/Dashboard"))
const OrdersMain           = lazy(() => import("@food/pages/restaurant/OrdersMain"))
const RestaurantOnboarding = lazy(() => import("@food/pages/restaurant/Onboarding"))

// Protected pages
const AllOrdersPage          = lazy(() => import("@food/pages/restaurant/AllOrdersPage"))
const RestaurantNotifications= lazy(() => import("@food/pages/restaurant/Notifications"))
const OrderDetails           = lazy(() => import("@food/pages/restaurant/OrderDetails"))
const TermsAndConditionsPage = lazy(() => import("@food/pages/restaurant/TermsAndConditionsPage"))
const PrivacyPolicyPage      = lazy(() => import("@food/pages/restaurant/PrivacyPolicyPage"))
const RefundPolicyPage       = lazy(() => import("@food/pages/restaurant/RefundPolicyPage"))
const ShippingPolicyPage     = lazy(() => import("@food/pages/restaurant/ShippingPolicyPage"))
const CancellationPolicyPage = lazy(() => import("@food/pages/restaurant/CancellationPolicyPage"))
const MenuCategoriesPage     = lazy(() => import("@food/pages/restaurant/MenuCategoriesPage"))
const CreateCouponsPage      = lazy(() => import("@food/pages/restaurant/CreateCouponsPage"))
const EditCouponPage         = lazy(() => import("@food/pages/restaurant/EditCouponPage"))
const RestaurantStatus       = lazy(() => import("@food/pages/restaurant/RestaurantStatus"))
const ExploreMore            = lazy(() => import("@food/pages/restaurant/ExploreMore"))
const OutletOperations       = lazy(() => import("@food/pages/restaurant/OutletOperations"))
const DeliverySettings       = lazy(() => import("@food/pages/restaurant/DeliverySettings"))
const RushHour               = lazy(() => import("@food/pages/restaurant/RushHour"))
const OutletTimings          = lazy(() => import("@food/pages/restaurant/OutletTimings"))
const DaySlots               = lazy(() => import("@food/pages/restaurant/DaySlots"))
const OutletInfo             = lazy(() => import("@food/pages/restaurant/OutletInfo"))
const RatingsReviews         = lazy(() => import("@food/pages/restaurant/RatingsReviews"))
const EditOwner              = lazy(() => import("@food/pages/restaurant/EditOwner"))
const EditRestaurantAddress  = lazy(() => import("@food/pages/restaurant/EditRestaurantAddress"))
const Inventory              = lazy(() => import("@food/pages/restaurant/Inventory"))
const Feedback               = lazy(() => import("@food/pages/restaurant/Feedback"))
const ShareFeedback          = lazy(() => import("@food/pages/restaurant/ShareFeedback"))
const DishRatings            = lazy(() => import("@food/pages/restaurant/DishRatings"))
const RestaurantSupport      = lazy(() => import("@food/pages/restaurant/RestaurantSupport"))
const FssaiDetails           = lazy(() => import("@food/pages/restaurant/FssaiDetails"))
const FssaiUpdate            = lazy(() => import("@food/pages/restaurant/FssaiUpdate"))
const Hyperpure              = lazy(() => import("@food/pages/restaurant/Hyperpure"))
const ItemDetailsPage        = lazy(() => import("@food/pages/restaurant/ItemDetailsPage"))
const HubFinance             = lazy(() => import("@food/pages/restaurant/HubFinance"))
const WithdrawalHistoryPage  = lazy(() => import("@food/pages/restaurant/WithdrawalHistoryPage"))
const FinanceDetailsPage     = lazy(() => import("@food/pages/restaurant/FinanceDetailsPage"))
const DownloadReport         = lazy(() => import("@food/pages/restaurant/DownloadReport"))
const AccountSettings        = lazy(() => import("@food/pages/restaurant/AccountSettings"))
const RestaurantProfilePage  = lazy(() => import("@food/pages/restaurant/RestaurantProfilePage"))
const RestaurantReferEarn    = lazy(() => import("@food/pages/restaurant/RestaurantReferEarn"))
const ManageOutlets          = lazy(() => import("@food/pages/restaurant/ManageOutlets"))
const UpdateBankDetails      = lazy(() => import("@food/pages/restaurant/UpdateBankDetails"))
const ZoneSetup              = lazy(() => import("@food/pages/restaurant/ZoneSetup"))
const DiningReservations     = lazy(() => import("@food/pages/restaurant/DiningReservations"))

const PROTECTED = { requiredRole: "restaurant", loginPath: "/food/restaurant/login" }

function Guard({ children }) {
  return <ProtectedRoute {...PROTECTED}>{children}</ProtectedRoute>
}

export default function RestaurantRouter() {
  useEffect(() => {
    setAppType("restaurant")
    loadBusinessSettings()
  }, [])

  return (
    <ErrorBoundary>
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* ── Auth routes (no layout) ─────────────────────────── */}
          <Route path="welcome"        element={<AuthPageGuard module="restaurant" home="/food/restaurant"><Welcome /></AuthPageGuard>} />
          <Route path="login"          element={<AuthPageGuard module="restaurant" home="/food/restaurant"><Login /></AuthPageGuard>} />
          <Route path="auth/sign-in"   element={<AuthPageGuard module="restaurant" home="/food/restaurant"><Login /></AuthPageGuard>} />
          <Route path="otp"            element={<AuthPageGuard module="restaurant" home="/food/restaurant"><OTP /></AuthPageGuard>} />
          <Route path="signup"         element={<AuthPageGuard module="restaurant" home="/food/restaurant"><Signup /></AuthPageGuard>} />
          <Route path="forgot-password"element={<AuthPageGuard module="restaurant" home="/food/restaurant"><ForgotPassword /></AuthPageGuard>} />
          <Route path="pending-verification" element={<VerificationPending />} />
          <Route path="onboarding"     element={<RestaurantOnboarding />} />
          <Route path="terms"          element={<TermsAndConditionsPage />} />
          <Route path="privacy"        element={<PrivacyPolicyPage />} />
          <Route path="refund"         element={<RefundPolicyPage />} />
          <Route path="shipping"       element={<ShippingPolicyPage />} />
          <Route path="cancellation"   element={<CancellationPolicyPage />} />

          {/* ── Protected routes — all wrapped in RestaurantLayout ── */}
          <Route element={<Guard><RestaurantLayout /></Guard>}>
            {/* Home dashboard */}
            <Route path=""              element={<Dashboard />} />

            {/* Orders */}
            <Route path="live-orders"   element={<OrdersMain />} />
            <Route path="notifications" element={<RestaurantNotifications />} />
            <Route path="orders/all"    element={<AllOrdersPage />} />
            <Route path="orders/:orderId" element={<OrderDetails />} />

            {/* Outlet — combined page */}
            <Route path="outlet-operations"   element={<OutletOperations />} />
            {/* Legacy redirects so old bookmarks/links still work */}
            <Route path="delivery-settings"   element={<Navigate to="/food/restaurant/outlet-operations?tab=delivery" replace />} />
            <Route path="rush-hour"           element={<Navigate to="/food/restaurant/outlet-operations?tab=rush" replace />} />
            <Route path="outlet-timings"      element={<Navigate to="/food/restaurant/outlet-operations?tab=timings" replace />} />
            <Route path="outlet-timings/:day" element={<DaySlots />} />
            <Route path="outlet-info"         element={<OutletInfo />} />
            <Route path="status"              element={<RestaurantStatus />} />
            <Route path="zone-setup"          element={<ZoneSetup />} />
            <Route path="manage-outlets"      element={<ManageOutlets />} />

            {/* Menu */}
            <Route path="menu-categories"     element={<MenuCategoriesPage />} />
            <Route path="create-coupons"      element={<CreateCouponsPage />} />
            <Route path="coupon/new"          element={<EditCouponPage />} />
            <Route path="coupon/:id/edit"     element={<EditCouponPage />} />
            <Route path="inventory"           element={<Inventory />} />
            <Route path="hub-menu/item/:id"   element={<ItemDetailsPage />} />

            {/* Finance */}
            <Route path="hub-finance"           element={<HubFinance />} />
            <Route path="wallet"                element={<Navigate to="/food/restaurant" replace />} />
            <Route path="withdrawal-history"    element={<WithdrawalHistoryPage />} />
            <Route path="finance-details"       element={<FinanceDetailsPage />} />
            <Route path="download-report"       element={<DownloadReport />} />
            <Route path="update-bank-details"   element={<UpdateBankDetails />} />
            {/* Ratings & feedback */}
            <Route path="ratings-reviews"   element={<RatingsReviews />} />
            <Route path="dish-ratings"      element={<DishRatings />} />
            <Route path="feedback"          element={<Feedback />} />
            <Route path="share-feedback"    element={<ShareFeedback />} />

            {/* Account — combined page */}
            <Route path="account"             element={<AccountSettings />} />
            {/* Legacy redirects */}
            <Route path="profile"             element={<Navigate to="/food/restaurant/account?tab=profile" replace />} />
            <Route path="edit-owner"          element={<Navigate to="/food/restaurant/account?tab=owner" replace />} />
            <Route path="fssai"               element={<Navigate to="/food/restaurant/account?tab=fssai" replace />} />
            <Route path="refer-earn"          element={<Navigate to="/food/restaurant/account?tab=refer" replace />} />
            <Route path="edit-address"        element={<EditRestaurantAddress />} />
            <Route path="fssai/update"        element={<FssaiUpdate />} />
            <Route path="help-centre/support" element={<RestaurantSupport />} />

            {/* Misc */}
            <Route path="reservations"        element={<DiningReservations />} />
            <Route path="hyperpure"           element={<Hyperpure />} />
            <Route path="explore"             element={<ExploreMore />} />
            <Route path="business-plan"       element={<Navigate to="/food/restaurant" replace />} />

            {/* Catch-all inside layout */}
            <Route path="*"                   element={<Navigate to="/food/restaurant" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
