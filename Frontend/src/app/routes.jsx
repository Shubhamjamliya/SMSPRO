import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import {
  AppShellSkeleton,
  AuthPortalSkeleton,
  ContentPageSkeleton,
} from '@food/components/ui/loading-skeletons'

import ProtectedRoute from '@core/guards/ProtectedRoute'
import RoleGuard from '@core/guards/RoleGuard'
import { AuthPageGuard } from '@core/guards/RouteGuard'
import { UserRole } from '@core/constants/roles'
import SellerAuthPage from '../modules/seller/pages/Auth'
import ModuleAccessGuard from '@/modules/common/components/ModuleAccessGuard'
import ModuleSelectionScreen from '@/modules/common/pages/ModuleSelectionScreen'
import { useEnabledModules } from '@/modules/common/hooks/useEnabledModules'
import { getFirstEnabledModulePath } from '@/modules/common/utils/enabledModules'
import { registerWebPushForCurrentModule } from '@food/utils/firebaseMessaging'
import { SERVICE_TYPE_ROUTES, SELECT_PACKAGE_PATH } from '../modules/construction/user/serviceTypes'
import { hasServiceProviderSession } from '@/modules/serviceProvider/provider/utils/authServiceProvider'

const NATIVE_LAST_ROUTE_KEY = 'native_last_route'

// Lazy load the Food service module (Quick-spicy app)
const FoodApp = lazy(() => import('../modules/Food/routes'))
const AuthApp = lazy(() => import('../modules/auth/routes'))
const QuickCommerceApp = lazy(() => import('../modules/quickCommerce/routes'))
const PorterApp = lazy(() => import('../modules/porter/routes'))
const TaxiApp = lazy(() => import('../modules/taxi/routes'))
const BikeRentApp = lazy(() => import('../modules/bikeRent/routes'))
const ServiceProviderApp = lazy(() => import('../modules/serviceProvider/routes'))
const ServiceProviderUserHome = lazy(() => import('../modules/serviceProvider/user/pages/Home'))
const ServiceProviderCategoryServicesPage = lazy(() => import('../modules/serviceProvider/user/pages/CategoryServices'))
const ServiceProviderBookServicePage = lazy(() => import('../modules/serviceProvider/user/pages/BookService'))
const ServiceProviderRequestStatusPage = lazy(() => import('../modules/serviceProvider/user/pages/RequestStatus'))
const ServiceProviderMyBookingsPage = lazy(() => import('../modules/serviceProvider/user/pages/MyBookings'))
const ConstructionHome = lazy(() => import('../modules/construction/user/pages/Home'))
const ConstructionRequirementBuilder = lazy(() => import('../modules/construction/user/pages/RequirementBuilder'))
const ConstructionMyQuotes = lazy(() => import('../modules/construction/user/pages/MyQuotes'))
const ConstructionContractors = lazy(() => import('../modules/construction/user/pages/Contractors'))
const ConstructionContractorProfile = lazy(() => import('../modules/construction/user/pages/ContractorProfile'))
const ConstructionServiceDetail = lazy(() => import('../modules/construction/user/pages/ServiceDetail'))
const ConstructionEnquiryForm = lazy(() => import('../modules/construction/user/pages/EnquiryForm'))
const ConstructionMyEnquiries = lazy(() => import('../modules/construction/user/pages/MyEnquiries'))
const ConstructionEnquiryDetail = lazy(() => import('../modules/construction/user/pages/EnquiryDetail'))
const ConstructionMySiteVisits = lazy(() => import('../modules/construction/user/pages/MySiteVisits'))
const ConstructionSiteVisitDetail = lazy(() => import('../modules/construction/user/pages/SiteVisitDetail'))
const ConstructionSiteQuotationDetail = lazy(() => import('../modules/construction/user/pages/SiteQuotationDetail'))
const ConstructionQuotationView = lazy(() => import('../modules/construction/user/pages/QuotationView'))
const ConstructionCompareQuotes = lazy(() => import('../modules/construction/user/pages/CompareQuotes'))
const ConstructionMyProjects = lazy(() => import('../modules/construction/user/pages/MyProjects'))
const ConstructionProjectDetail = lazy(() => import('../modules/construction/user/pages/ProjectDetail'))
const ConstructionProfile = lazy(() => import('../modules/construction/user/pages/Profile'))
const ContractorApp = lazy(() => import('../modules/construction/contractor/routes'))
const SellerApp = lazy(() => import('../modules/seller/routes'))


const FoodUserLayout = lazy(() => import('../modules/Food/components/user/UserLayout'))
const FoodHomePage = lazy(() => import('../modules/Food/pages/user/Home'))
const GlobalCartPage = lazy(() => import('../modules/Food/pages/user/cart/Cart'))
const GlobalCheckoutPage = lazy(() => import('../modules/Food/pages/user/cart/Checkout'))
const GlobalSelectAddressPage = lazy(() => import('../modules/Food/pages/user/cart/SelectAddress'))
const GlobalAddressSelectorPage = lazy(() => import('../modules/Food/pages/user/cart/AddressSelectorPage'))
const SharedProfilePage = lazy(() => import('../modules/Food/pages/user/profile/Profile'))
const SharedProfileEditPage = lazy(() => import('../modules/Food/pages/user/profile/EditProfile'))
const SharedProfileSupportPage = lazy(() => import('../modules/Food/pages/user/profile/Support'))
const SharedProfileCouponsPage = lazy(() => import('../modules/Food/pages/user/profile/Coupons'))
const SharedProfileAboutPage = lazy(() => import('../modules/Food/pages/user/profile/About'))
const SharedProfileTermsPage = lazy(() => import('../modules/Food/pages/user/profile/Terms'))
const SharedProfilePrivacyPage = lazy(() => import('../modules/Food/pages/user/profile/Privacy'))
const SharedProfileRefundPage = lazy(() => import('../modules/Food/pages/user/profile/Refund'))
const SharedProfileShippingPage = lazy(() => import('../modules/Food/pages/user/profile/Shipping'))
const SharedProfileCancellationPage = lazy(() => import('../modules/Food/pages/user/profile/Cancellation'))
const SharedFavoritesPage = lazy(() => import('../modules/Food/pages/user/profile/Favorites'))

const RouteAwarePageLoader = () => {
  const location = useLocation()
  const pathname = location.pathname || ''

  if (pathname.startsWith('/user/auth')) {
    return <AuthPortalSkeleton />
  }



  if (pathname.startsWith('/admin')) {
    return <ContentPageSkeleton hero={false} />
  }

  return <AppShellSkeleton />
}

const FoodAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <FoodApp />
    </Suspense>
  )
}

const SharedFoodHomeRoute = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <FoodUserLayout>
        <FoodHomePage />
      </FoodUserLayout>
    </Suspense>
  )
}

const DefaultUserLanding = () => {
  const location = useLocation()
  const { loading } = useEnabledModules()

  if (hasServiceProviderSession()) {
    return <Navigate to={`/service-provider/dashboard${location.search || ''}`} replace />
  }

  if (loading) {
    return <AppShellSkeleton />
  }

  return <ModuleSelectionScreen />
}

const RedirectToFood = () => {
  const location = useLocation();
  // We safely replace the exact current pathname with a /food prefixed pathname
  // This effectively catches programmatic navigation to absolute paths like '/restaurant/login'
  // and turns them into '/food/restaurant/login'
  return <Navigate to={`/food${location.pathname}${location.search}`} replace />;
};

const RedirectLegacyQuickCommerce = () => {
  const location = useLocation();
  const suffix = location.pathname
    .replace(/^\/quick-commerce(?:\/user)?/, '');
  const normalizedSuffix = suffix && suffix !== '/' ? suffix : '';
  return (
    <Navigate
      to={`/quick${normalizedSuffix}${location.search}`}
      replace
    />
  );
};

const SellerAuthEntry = () => {
  return <SellerAuthPage />
}

const SellerAppWrapper = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <ProtectedRoute>
        <RoleGuard allowedRoles={[UserRole.SELLER]}>
          <SellerApp />
        </RoleGuard>
      </ProtectedRoute>
    </Suspense>
  )
}

const AdminRouter = lazy(() => import('../modules/Food/components/admin/AdminRouter'))

const AppRoutes = () => {
  const location = useLocation()

  useEffect(() => {
    // Eagerly prefetch the quick commerce routes and user app routes chunk after initial mount
    const prefetchTimeout = setTimeout(() => {
      import('../modules/quickCommerce/routes').catch(() => {});
      import('../modules/Food/routes').catch(() => {});
    }, 2000);

    return () => clearTimeout(prefetchTimeout);
  }, []);

  useEffect(() => {
    registerWebPushForCurrentModule(location.pathname).catch(() => {});
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const protocol = String(window.location?.protocol || '').toLowerCase()
    const userAgent = String(window.navigator?.userAgent || '').toLowerCase()
    const isNativeLikeShell =
      Boolean(window.flutter_inappwebview) ||
      Boolean(window.ReactNativeWebView) ||
      protocol === 'file:' ||
      userAgent.includes(' wv') ||
      userAgent.includes('; wv')

    if (!isNativeLikeShell) return

    const route = `${location.pathname || ''}${location.search || ''}`
    if (
      route.startsWith('/food/') ||
      route.startsWith('/admin') ||
      route === '/quick' ||
      route.startsWith('/quick/') ||
      route === '/porter' ||
      route.startsWith('/porter/') ||
      route === '/taxi' ||
      route.startsWith('/taxi/') ||
      route === '/bike-rent' ||
      route.startsWith('/bike-rent/')
    ) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route)
    }
  }, [location.pathname, location.search])

  return (
    <Routes>
        {/* Root lands on Module Selection Screen */}
        <Route path="/" element={<DefaultUserLanding />} />
        <Route path="/modules" element={<ModuleSelectionScreen />} />
        <Route path="/select-module" element={<ModuleSelectionScreen />} />

        {/* Auth Module */}
        <Route
          path="/user/auth/*"
          element={
            <AuthPageGuard module="user" home="/food/user">
              <AuthApp />
            </AuthPageGuard>
          }
        />
        <Route path="/portal" element={<DefaultUserLanding />} />
        <Route path="/login" element={<Navigate to={`/user/auth/login${location.search}`} replace />} />

        {/* Food Module */}
        <Route path="/food/*" element={<FoodAppWrapper />} />

        {/* Contractor surface — its own login and screens, same app (BRD Q19).
            Outside ModuleAccessGuard on purpose: a contractor whose registration
            is mid-review must still be able to sign in and see their status even
            if the module is briefly switched off. The API still enforces the flag. */}
        <Route path="/contractor/*" element={<ContractorApp />} />

        {/* Public Customer Storefront Layout (Some routes inside are protected) */}
        <Route
          element={
            <Outlet />
          }
        >
          {/* Shared home entry so /food/user <-> /quick doesn't remount through different app trees */}
          <Route
            path="/food/user"
            element={
              <ModuleAccessGuard moduleKey="food">
                <SharedFoodHomeRoute />
              </ModuleAccessGuard>
            }
          />

          <Route
            path="/quick"
            element={
              <ModuleAccessGuard moduleKey="quickCommerce">
                <SharedFoodHomeRoute />
              </ModuleAccessGuard>
            }
          />

          {/* Porter landing keeps the shared food layout (embedded Porter home via tab) */}
          <Route
            path="/porter"
            element={
              <ModuleAccessGuard moduleKey="porter">
                <SharedFoodHomeRoute />
              </ModuleAccessGuard>
            }
          />

          {/* Taxi landing keeps the shared food layout (embedded Taxi home via tab) */}
          <Route
            path="/taxi"
            element={
              <ModuleAccessGuard moduleKey="taxi">
                <SharedFoodHomeRoute />
              </ModuleAccessGuard>
            }
          />

          {/* Bike Rent landing keeps the shared food layout (embedded Bike Rent home via tab) */}
          <Route
            path="/bike-rent"
            element={
              <ModuleAccessGuard moduleKey="bikeRent">
                <SharedFoodHomeRoute />
              </ModuleAccessGuard>
            }
          />

          {/* Global shared cart */}
          <Route
            element={
              <Suspense fallback={<PageLoader />}>
                <FoodUserLayout />
              </Suspense>
            }
          >
            <Route path="/cart" element={<GlobalCartPage />} />
            <Route path="/cart/checkout" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><GlobalCheckoutPage /></ProtectedRoute>} />
            <Route path="/cart/select-address" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><GlobalSelectAddressPage /></ProtectedRoute>} />
            <Route path="/cart/address-selector" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><GlobalAddressSelectorPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><SharedProfilePage /></ProtectedRoute>} />
            <Route path="/profile/edit" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><SharedProfileEditPage /></ProtectedRoute>} />
            <Route path="/profile/support" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><SharedProfileSupportPage /></ProtectedRoute>} />
            <Route path="/profile/coupons" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><SharedProfileCouponsPage /></ProtectedRoute>} />
            <Route path="/profile/favorites" element={<ProtectedRoute requiredRole="user" loginPath="/user/auth/login"><SharedFavoritesPage /></ProtectedRoute>} />
            <Route path="/profile/about" element={<SharedProfileAboutPage />} />
            <Route path="/profile/terms" element={<SharedProfileTermsPage />} />
            <Route path="/profile/privacy" element={<SharedProfilePrivacyPage />} />
            <Route path="/profile/refund" element={<SharedProfileRefundPage />} />
            <Route path="/profile/shipping" element={<SharedProfileShippingPage />} />
            <Route path="/profile/cancellation" element={<SharedProfileCancellationPage />} />
            <Route
              path="/services"
              element={
                <ModuleAccessGuard moduleKey="serviceProvider">
                  <ServiceProviderUserHome />
                </ModuleAccessGuard>
              }
            />
            {/* Construction (BRD C1, C2). Unlike /services, even the browse screen
                sits behind ProtectedRoute: BRD Rule 5 makes construction a protected
                service, so there is no anonymous browsing of it at all. */}
            <Route
              path="/construction"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionHome />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            {/* The three sections of the construction home screen each have their own
                address, so a section can be linked to, refreshed, and left with the back
                button. They render the same screen as /construction, told which one to open. */}
            {SERVICE_TYPE_ROUTES.map(({ id, path }) => (
              <Route
                key={id}
                path={path}
                element={
                  <ModuleAccessGuard moduleKey="construction">
                    <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                      <ConstructionHome serviceType={id} />
                    </ProtectedRoute>
                  </ModuleAccessGuard>
                }
              />
            ))}
            <Route
              path={`${SELECT_PACKAGE_PATH}/:packageId?`}
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionRequirementBuilder />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/services/:idOrSlug"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionServiceDetail />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/services/:serviceId/enquire"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionEnquiryForm />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/enquiries"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionMyEnquiries />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/site-visits"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionMySiteVisits />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/quotations/visit/:id"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionSiteQuotationDetail />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/site-visits/:id"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionSiteVisitDetail />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/enquiries/:id"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionEnquiryDetail />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/enquiries/:id/compare"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionCompareQuotes />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/quotations"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionMyQuotes />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/quotations/:id"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionQuotationView />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            {/* Projects and staged payment (BRD C14-C17, C21-C23). Real money
                moves on these screens, so they carry the same guards as the
                rest of the module - never looser. */}
            {/* Choosing a contractor (BRD C6, C7, C8). The literal path is
                registered before the parameter one, or /contractors would be
                swallowed by /contractors/:contractorId. */}
            <Route
              path="/construction/contractors"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionContractors />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/contractors/:contractorId"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionContractorProfile />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/projects"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionMyProjects />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/projects/:id"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionProjectDetail />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/construction/profile"
              element={
                <ModuleAccessGuard moduleKey="construction">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ConstructionProfile />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/services/category/:categoryId"
              element={
                <ModuleAccessGuard moduleKey="serviceProvider">
                  <ServiceProviderCategoryServicesPage />
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/services/:serviceId/book"
              element={
                <ModuleAccessGuard moduleKey="serviceProvider">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ServiceProviderBookServicePage />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/services/requests/:id"
              element={
                <ModuleAccessGuard moduleKey="serviceProvider">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ServiceProviderRequestStatusPage />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
            <Route
              path="/services/bookings"
              element={
                <ModuleAccessGuard moduleKey="serviceProvider">
                  <ProtectedRoute requiredRole="user" loginPath="/user/auth/login">
                    <ServiceProviderMyBookingsPage />
                  </ProtectedRoute>
                </ModuleAccessGuard>
              }
            />
          </Route>

          {/* Quick storefront */}
          <Route
            path="/quick/*"
            element={
              <ModuleAccessGuard moduleKey="quickCommerce">
                <Suspense fallback={<PageLoader />}>
                  <QuickCommerceApp />
                </Suspense>
              </ModuleAccessGuard>
            }
          />
          <Route path="/quick-commerce/*" element={<RedirectLegacyQuickCommerce />} />
          <Route path="/qc/*" element={<Navigate to="/quick" replace />} />

          {/* Porter storefront (parcel delivery booking flow) */}
          <Route
            path="/porter/*"
            element={
              <ModuleAccessGuard moduleKey="porter">
                <Suspense fallback={<PageLoader />}>
                  <PorterApp />
                </Suspense>
              </ModuleAccessGuard>
            }
          />

          {/* Taxi storefront */}
          <Route
            path="/taxi/*"
            element={
              <ModuleAccessGuard moduleKey="taxi">
                <Suspense fallback={<PageLoader />}>
                  <TaxiApp />
                </Suspense>
              </ModuleAccessGuard>
            }
          />

          {/* Bike Rent storefront — share Food layout for location + consistent chrome */}
          <Route
            path="/bike-rent/*"
            element={
              <ModuleAccessGuard moduleKey="bikeRent">
                <Suspense fallback={<PageLoader />}>
                  <FoodUserLayout>
                    <BikeRentApp />
                  </FoodUserLayout>
                </Suspense>
              </ModuleAccessGuard>
            }
          />

          {/* Service Provider — provider-facing dashboard (own sidebar shell, nested for consistent chrome like Bike Rent Vendor) */}
          <Route
            path="/service-provider/*"
            element={
              <ModuleAccessGuard moduleKey="serviceProvider">
                <Suspense fallback={<PageLoader />}>
                  <FoodUserLayout>
                    <ServiceProviderApp />
                  </FoodUserLayout>
                </Suspense>
              </ModuleAccessGuard>
            }
          />

          {/* Dynamic intercept redirects for bare paths (accessed programmatically) */}
          <Route path="/user/*" element={<RedirectToFood />} />
          <Route path="/restaurant/*" element={<RedirectToFood />} />
          <Route path="/delivery/*" element={<RedirectToFood />} />
          <Route path="/usermain/*" element={<RedirectToFood />} />
          <Route path="/profile/*" element={<Navigate to="/profile" replace />} />
          <Route path="/orders/*" element={<RedirectToFood />} />
        </Route>

        {/* Seller Module */}
        <Route path="/seller" element={<SellerAppWrapper />} />
        {/* Seller auth — redirect to /seller if already logged in */}
        <Route
          path="/seller/auth"
          element={
            <AuthPageGuard module="seller" home="/seller">
              <SellerAuthEntry />
            </AuthPageGuard>
          }
        />
        <Route path="/seller/*" element={<SellerAppWrapper />} />

        {/* Global Admin Portal - wrap lazy router in Suspense to avoid blank/crash on direct admin URLs */}
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminRouter />
            </Suspense>
          }
        />

        {/* RoleGuard redirects here on a role mismatch — without this route it 404s into the catch-all below */}
        <Route
          path="/unauthorized"
          element={<div className="flex h-screen items-center justify-center font-outfit">Unauthorized Access</div>}
        />

        {/* Fallback 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  )
}

const PageLoader = () => <RouteAwarePageLoader />

export default AppRoutes
