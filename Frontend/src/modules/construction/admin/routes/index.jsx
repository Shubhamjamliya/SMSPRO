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
