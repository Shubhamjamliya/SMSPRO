import React, { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Loader from "@/modules/Food/components/Loader";

const ProviderJoiningRequests = React.lazy(() => import("../pages/ProviderJoiningRequests"));
const Providers = React.lazy(() => import("../pages/Providers"));
const AddProvider = React.lazy(() => import("../pages/AddProvider"));
const Categories = React.lazy(() => import("../pages/Categories"));
const Services = React.lazy(() => import("../pages/Services"));
const Zones = React.lazy(() => import("../pages/Zones"));
const AddZone = React.lazy(() => import("../pages/AddZone"));
const AllZonesMap = React.lazy(() => import("../pages/AllZonesMap"));
const ServiceRequests = React.lazy(() => import("../pages/ServiceRequests"));
const CategoryRequests = React.lazy(() => import("../pages/CategoryRequests"));

function ServiceProviderAdminRoutesInner() {
  return (
    <Routes>
      <Route index element={<Navigate to="/admin/service-provider/joining-requests" replace />} />
      <Route path="joining-requests" element={<ProviderJoiningRequests />} />
      <Route path="providers" element={<Providers />} />
      <Route path="providers/add" element={<AddProvider />} />
      <Route path="providers/:id/edit" element={<AddProvider />} />
      <Route path="categories" element={<Categories />} />
      <Route path="services" element={<Services />} />
      <Route path="zones" element={<Zones />} />
      <Route path="zones/add" element={<AddZone />} />
      <Route path="zones/edit/:id" element={<AddZone />} />
      <Route path="zones/map" element={<AllZonesMap />} />
      <Route path="service-requests" element={<ServiceRequests />} />
      <Route path="category-requests" element={<CategoryRequests />} />
      <Route path="*" element={<Navigate to="/admin/service-provider/joining-requests" replace />} />
    </Routes>
  );
}

export default function ServiceProviderAdminRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <ServiceProviderAdminRoutesInner />
    </Suspense>
  );
}
