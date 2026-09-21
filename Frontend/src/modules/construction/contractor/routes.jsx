import React, { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Loader from "@/modules/Food/components/Loader";
import ContractorProtectedRoute from "./components/ContractorProtectedRoute";

const Login = React.lazy(() => import("./pages/Login"));
const Register = React.lazy(() => import("./pages/Register"));
const Status = React.lazy(() => import("./pages/Status"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Leads = React.lazy(() => import("./pages/Leads"));
const PackageRequests = React.lazy(() => import("./pages/PackageRequests"));
const PackageRequestDetail = React.lazy(() => import("./pages/PackageRequestDetail"));
const Jobs = React.lazy(() => import("./pages/Jobs"));
const Visits = React.lazy(() => import("./pages/Visits"));
const Quotations = React.lazy(() => import("./pages/Quotations"));
const QuotationBuilder = React.lazy(() => import("./pages/QuotationBuilder"));
const Projects = React.lazy(() => import("./pages/Projects"));
const ProjectWorkspace = React.lazy(() => import("./pages/ProjectWorkspace"));
const Earnings = React.lazy(() => import("./pages/Earnings"));
const TrustScore = React.lazy(() => import("./pages/TrustScore"));
const Profile = React.lazy(() => import("./pages/Profile"));

/** Contractor surface — own login and own screens, inside the same app (BRD Q19). */
export default function ContractorRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route index element={<Navigate to="/contractor/login" replace />} />
        <Route path="login" element={<Login />} />
        <Route
          path="register"
          element={
            <ContractorProtectedRoute allowOnboarding>
              <Register />
            </ContractorProtectedRoute>
          }
        />
        <Route
          path="status"
          element={
            <ContractorProtectedRoute allowPending>
              <Status />
            </ContractorProtectedRoute>
          }
        />
        <Route
          path="dashboard"
          element={
            <ContractorProtectedRoute requireApproved>
              <Dashboard />
            </ContractorProtectedRoute>
          }
        />
        {/* Working screens — approved contractors only. An unverified contractor
            must never see a customer's enquiry. */}
        <Route
          path="leads"
          element={<ContractorProtectedRoute requireApproved><Leads /></ContractorProtectedRoute>}
        />
        <Route
          path="package-requests"
          element={<ContractorProtectedRoute requireApproved><PackageRequests /></ContractorProtectedRoute>}
        />
        <Route
          path="package-requests/:id"
          element={<ContractorProtectedRoute requireApproved><PackageRequestDetail /></ContractorProtectedRoute>}
        />
        <Route
          path="jobs"
          element={<ContractorProtectedRoute requireApproved><Jobs /></ContractorProtectedRoute>}
        />
        <Route
          path="visits"
          element={<ContractorProtectedRoute requireApproved><Visits /></ContractorProtectedRoute>}
        />
        <Route
          path="quotations"
          element={<ContractorProtectedRoute requireApproved><Quotations /></ContractorProtectedRoute>}
        />
        <Route
          path="quotations/:id"
          element={<ContractorProtectedRoute requireApproved><QuotationBuilder /></ContractorProtectedRoute>}
        />
        <Route
          path="projects"
          element={<ContractorProtectedRoute requireApproved><Projects /></ContractorProtectedRoute>}
        />
        <Route
          path="projects/:id"
          element={<ContractorProtectedRoute requireApproved><ProjectWorkspace /></ContractorProtectedRoute>}
        />
        <Route
          path="earnings"
          element={<ContractorProtectedRoute requireApproved><Earnings /></ContractorProtectedRoute>}
        />
        <Route
          path="profile"
          element={<ContractorProtectedRoute requireApproved><Profile /></ContractorProtectedRoute>}
        />
        <Route
          path="score"
          element={<ContractorProtectedRoute requireApproved><TrustScore /></ContractorProtectedRoute>}
        />
        <Route path="*" element={<Navigate to="/contractor/login" replace />} />
      </Routes>
    </Suspense>
  );
}
