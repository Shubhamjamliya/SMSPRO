import React, { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Loader from "@/modules/Food/components/Loader";

const Categories = React.lazy(() => import("../pages/Categories"));
const Services = React.lazy(() => import("../pages/Services"));
const Settings = React.lazy(() => import("../pages/Settings"));
const Contractors = React.lazy(() => import("../pages/Contractors"));
const ContractorDetail = React.lazy(() => import("../pages/ContractorDetail"));
const Enquiries = React.lazy(() => import("../pages/Enquiries"));
const Projects = React.lazy(() => import("../pages/Projects"));
const ProjectDetail = React.lazy(() => import("../pages/ProjectDetail"));
const Disputes = React.lazy(() => import("../pages/Disputes"));
const DisputeDetail = React.lazy(() => import("../pages/DisputeDetail"));
const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const PaymentControl = React.lazy(() => import("../pages/PaymentControl"));
const Reports = React.lazy(() => import("../pages/Reports"));
const ActivityLog = React.lazy(() => import("../pages/ActivityLog"));
const Packages = React.lazy(() => import("../pages/Packages"));
const Banners = React.lazy(() => import("../pages/Banners"));
const PackageRequests = React.lazy(() => import("../pages/PackageRequests"));
const PackageQuotations = React.lazy(() => import("../pages/PackageQuotations"));
const BudgetServices = React.lazy(() => import("../pages/BudgetServices"));
const Materials = React.lazy(() => import("../pages/Materials"));
const MaterialRequests = React.lazy(() => import("../pages/MaterialRequests"));

/**
 * Construction admin routes.
 *
 * Phase 2 delivered the catalogue and module settings (BRD A8); Phase 3 adds the
 * contractor approval queue and review screen (A2, A3, Rule 6). The remaining
 * Phase 5 adds the project register and payment control (A5, A6, A7), which is
 * where an operator can hold, cancel, approve on a customer's behalf and
 * reconcile a project against the escrow ledger. Phase 6 adds the dispute queue
 * (Q15), and Phase 7 the dashboard, reports and permanent activity record
 * (A1, A9, A10).
 *
 * The prefix must stay registered even for paths that do not exist yet: the admin
 * router ends in a catch-all that redirects unknown paths to /admin/food, so an
 * unregistered path here silently bounces to Food and looks like a bug.
 */
function ConstructionAdminRoutesInner() {
  return (
    <Routes>
      <Route index element={<Navigate to="/admin/construction/dashboard" replace />} />
      <Route path="categories" element={<Categories />} />
      <Route path="services" element={<Services />} />
      <Route path="banners" element={<Banners />} />
      {/* The old single list, kept so bookmarks and older notifications still land somewhere. */}
      <Route
        path="package-requests"
        element={<Navigate to="/admin/construction/end-to-end/residential/requests" replace />}
      />
      <Route
        path="end-to-end/residential/requests"
        element={<PackageRequests key="residential" segment="residential" />}
      />
      <Route
        path="end-to-end/commercial/requests"
        element={<PackageRequests key="commercial" segment="commercial" />}
      />
      <Route
        path="end-to-end/residential/quotations"
        element={<PackageQuotations key="residential" segment="residential" />}
      />
      <Route
        path="end-to-end/commercial/quotations"
        element={<PackageQuotations key="commercial" segment="commercial" />}
      />
      <Route path="enquiries" element={<Enquiries />} />
      <Route path="projects" element={<Projects />} />
      <Route path="projects/:id" element={<ProjectDetail />} />
      <Route path="disputes" element={<Disputes />} />
      <Route path="disputes/:disputeId" element={<DisputeDetail />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="payments" element={<PaymentControl />} />
      <Route path="reports" element={<Reports />} />
      <Route path="activity" element={<ActivityLog />} />
      <Route path="contractors" element={<Contractors />} />
      <Route path="contractors/:id" element={<ContractorDetail />} />
      <Route
        path="end-to-end/residential"
        element={<Navigate to="/admin/construction/end-to-end/residential/packages" replace />}
      />
      <Route
        path="end-to-end/residential/packages"
        element={<Packages key="residential" segment="residential" />}
      />
      <Route
        path="end-to-end/commercial"
        element={<Navigate to="/admin/construction/end-to-end/commercial/packages" replace />}
      />
      <Route
        path="end-to-end/commercial/packages"
        element={<Packages key="commercial" segment="commercial" />}
      />
      <Route path="budget-friendly" element={<BudgetServices />} />
      <Route path="budget-requests" element={<Enquiries key="budget" budgetOnly />} />
      <Route path="materials" element={<Materials />} />
      <Route path="material-requests" element={<MaterialRequests />} />
      <Route path="settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/admin/construction/dashboard" replace />} />
    </Routes>
  );
}

export default function ConstructionAdminRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <ConstructionAdminRoutesInner />
    </Suspense>
  );
}
