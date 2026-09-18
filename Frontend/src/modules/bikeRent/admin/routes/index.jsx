import React, { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Loader from "@/modules/Food/components/Loader";

const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const Zones = React.lazy(() => import("../pages/Zones"));
const AddZone = React.lazy(() => import("../pages/AddZone"));
const ViewZone = React.lazy(() => import("../pages/ViewZone"));
const AllZonesMap = React.lazy(() => import("../pages/AllZonesMap"));
const Categories = React.lazy(() => import("../pages/Categories"));
const Bikes = React.lazy(() => import("../pages/Bikes"));
const Pricing = React.lazy(() => import("../pages/Pricing"));
const Bookings = React.lazy(() => import("../pages/Bookings"));
const FleetTimeline = React.lazy(() => import("../pages/FleetTimeline"));
const Inspections = React.lazy(() => import("../pages/Inspections"));
const Customers = React.lazy(() => import("../pages/Customers"));
const Reports = React.lazy(() => import("../pages/Reports"));
const WalletTransactions = React.lazy(() => import("../pages/WalletTransactions"));
const Coupons = React.lazy(() => import("../pages/Coupons"));
const Settings = React.lazy(() => import("../pages/Settings"));
const TaxBilling = React.lazy(() => import("../pages/TaxBilling"));
const Settlements = React.lazy(() => import("../pages/Settlements"));
const Finance = React.lazy(() => import("../pages/Finance"));
const VendorList = React.lazy(() => import("../pages/VendorList"));
const VendorJoiningRequests = React.lazy(() => import("../pages/VendorJoiningRequests"));
const CategoryApprovals = React.lazy(() => import("../pages/CategoryApprovals"));
const BikeApprovals = React.lazy(() => import("../pages/BikeApprovals"));
const CouponApprovals = React.lazy(() => import("../pages/CouponApprovals"));
const VendorWithdrawals = React.lazy(() => import("../pages/VendorWithdrawals"));

function BikeRentAdminRoutesInner() {
  return (
    <Routes>
      <Route index element={<Navigate to="/admin/bike-rent/dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="vendors" element={<VendorList />} />
      <Route path="joining-requests" element={<VendorJoiningRequests />} />
      <Route path="category-approvals" element={<CategoryApprovals />} />
      <Route path="bike-approvals" element={<BikeApprovals />} />
      <Route path="coupon-approvals" element={<CouponApprovals />} />
      <Route path="vendor-withdrawals" element={<VendorWithdrawals />} />
      <Route path="zones" element={<Zones />} />
      <Route path="zones/add" element={<AddZone />} />
      <Route path="zones/edit/:id" element={<AddZone />} />
      <Route path="zones/view/:id" element={<ViewZone />} />
      <Route path="zones/map" element={<AllZonesMap />} />
      <Route path="categories" element={<Categories />} />
      <Route path="bikes" element={<Bikes />} />
      <Route path="pricing" element={<Pricing />} />
      <Route path="bookings" element={<Bookings />} />
      <Route path="fleet-timeline" element={<FleetTimeline />} />
      <Route path="inspections" element={<Inspections />} />
      <Route path="customers" element={<Customers />} />
      <Route path="reports" element={<Reports />} />
      <Route path="wallet" element={<WalletTransactions />} />
      <Route path="coupons" element={<Coupons />} />
      <Route path="settlements" element={<Settlements />} />
      <Route path="finance" element={<Finance />} />
      <Route path="tax-billing" element={<TaxBilling />} />
      <Route path="settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/admin/bike-rent/dashboard" replace />} />
    </Routes>
  );
}

export default function BikeRentAdminRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <BikeRentAdminRoutesInner />
    </Suspense>
  );
}
