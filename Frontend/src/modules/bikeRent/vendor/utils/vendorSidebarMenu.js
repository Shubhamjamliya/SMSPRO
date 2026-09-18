import {
  BarChart3,
  Bike,
  Building2,
  CalendarClock,
  ClipboardCheck,
  History,
  IndianRupee,
  LayoutDashboard,
  ListChecks,
  Map,
  Receipt,
  Settings,
  Tag,
  Tags,
  Wallet,
} from "lucide-react";

/**
 * Sectioned vendor nav — same 15 paths as the old flat NAV_ITEMS, only
 * grouped for scannability (mirrors bikeRentAdminSidebarMenu.js's shape).
 * No permissionKey: vendor routes are already gated by VendorProtectedRoute.
 */
export const vendorSidebarMenu = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", path: "/bike-rent/vendor/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Inventory",
    items: [
      { label: "Zones", path: "/bike-rent/vendor/zones", icon: Map },
      { label: "Hubs", path: "/bike-rent/vendor/hubs", icon: Building2 },
      { label: "Bikes", path: "/bike-rent/vendor/bikes", icon: Bike },
      { label: "Categories", path: "/bike-rent/vendor/categories", icon: Tags },
    ],
  },
  {
    title: "Bookings",
    items: [
      { label: "Bookings", path: "/bike-rent/vendor/bookings", icon: ListChecks },
      { label: "Fleet Timeline", path: "/bike-rent/vendor/fleet-timeline", icon: CalendarClock },
      { label: "Inspections", path: "/bike-rent/vendor/inspections", icon: ClipboardCheck },
      { label: "Coupons", path: "/bike-rent/vendor/coupons", icon: Tag },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Wallet", path: "/bike-rent/vendor/wallet", icon: Wallet },
      { label: "Transactions", path: "/bike-rent/vendor/transactions", icon: History },
      { label: "Settlements", path: "/bike-rent/vendor/settlements", icon: IndianRupee },
      { label: "Tax & Billing", path: "/bike-rent/vendor/tax-billing", icon: Receipt },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Reports", path: "/bike-rent/vendor/reports", icon: BarChart3 },
      { label: "Settings", path: "/bike-rent/vendor/settings", icon: Settings },
    ],
  },
];
