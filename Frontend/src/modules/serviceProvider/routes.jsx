import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import ServiceProviderProtectedRoute from "./provider/components/ServiceProviderProtectedRoute";
import { ServiceProviderRealtimeProvider } from "./provider/context/ServiceProviderRealtimeContext";

const Login = lazy(() => import("./provider/pages/Login"));
const Onboarding = lazy(() => import("./provider/pages/Onboarding"));
const Pending = lazy(() => import("./provider/pages/Pending"));
const Dashboard = lazy(() => import("./provider/pages/Dashboard"));
const MyServices = lazy(() => import("./provider/pages/MyServices"));
const MyZones = lazy(() => import("./provider/pages/MyZones"));
const Availability = lazy(() => import("./provider/pages/Availability"));
const IncomingRequests = lazy(() => import("./provider/pages/IncomingRequests"));
const Jobs = lazy(() => import("./provider/pages/Jobs"));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F8]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FF6A00]/20 border-t-[#FF6A00]" />
    </div>
  );
}

// One shared realtime socket connection + pending-request queue for every
// approved-provider page — mounted here (an actual ROUTE ANCESTOR of Dashboard/
// Jobs/IncomingRequests/etc.) rather than inside ServiceProviderLayout, which those
// pages render as their own child and therefore can't read context from. Scoped to
// only this route group (not login/onboarding/pending) since those pages have no
// provider session to open a socket for yet.
function ApprovedProviderRealtime() {
  return (
    <ServiceProviderRealtimeProvider>
      <Outlet />
    </ServiceProviderRealtimeProvider>
  );
}

export default function ServiceProviderRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route index element={<Navigate to="login" replace />} />
        <Route path="login" element={<Login />} />
        <Route
          path="onboarding"
          element={
            <ServiceProviderProtectedRoute allowOnboarding allowRejected>
              <Onboarding />
            </ServiceProviderProtectedRoute>
          }
        />
        <Route
          path="pending"
          element={
            <ServiceProviderProtectedRoute allowPending>
              <Pending />
            </ServiceProviderProtectedRoute>
          }
        />
        <Route element={<ApprovedProviderRealtime />}>
          <Route
            path="dashboard"
            element={
              <ServiceProviderProtectedRoute requireApproved>
                <Dashboard />
              </ServiceProviderProtectedRoute>
            }
          />
          <Route
            path="services"
            element={
              <ServiceProviderProtectedRoute requireApproved>
                <MyServices />
              </ServiceProviderProtectedRoute>
            }
          />
          <Route
            path="zones"
            element={
              <ServiceProviderProtectedRoute requireApproved>
                <MyZones />
              </ServiceProviderProtectedRoute>
            }
          />
          <Route
            path="availability"
            element={
              <ServiceProviderProtectedRoute requireApproved>
                <Availability />
              </ServiceProviderProtectedRoute>
            }
          />
          <Route
            path="requests"
            element={
              <ServiceProviderProtectedRoute requireApproved>
                <IncomingRequests />
              </ServiceProviderProtectedRoute>
            }
          />
          <Route
            path="jobs"
            element={
              <ServiceProviderProtectedRoute requireApproved>
                <Jobs />
              </ServiceProviderProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="login" replace />} />
      </Routes>
    </Suspense>
  );
}
