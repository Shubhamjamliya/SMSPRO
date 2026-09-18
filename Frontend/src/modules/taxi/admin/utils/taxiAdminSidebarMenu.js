export const taxiAdminSidebarMenu = [
  {
    type: "section",
    title: "Main Menu",
    permissionKey: "main",
    items: [
      {
        type: "link",
        label: "Dashboard",
        icon: "LayoutDashboard",
        path: "/admin/taxi/dashboard",
        permissionKey: "dashboard",
      },
    ],
  },
  {
    type: "section",
    title: "Ride Management",
    permissionKey: "rides",
    items: [
      {
        type: "link",
        label: "Ride Requests",
        icon: "Bell",
        path: "/admin/taxi/rides/requests",
        permissionKey: "requests",
      },
      {
        type: "link",
        label: "Active Rides",
        icon: "Zap",
        path: "/admin/taxi/rides/active",
        permissionKey: "active",
      },
      {
        type: "link",
        label: "Completed Rides",
        icon: "CheckCircle2",
        path: "/admin/taxi/rides/completed",
        permissionKey: "completed",
      },
      {
        type: "link",
        label: "Cancelled Rides",
        icon: "AlertTriangle",
        path: "/admin/taxi/rides/cancelled",
        permissionKey: "cancelled",
      },
    ],
  },
  {
    type: "section",
    title: "Driver Management",
    permissionKey: "drivers",
    items: [
      {
        type: "link",
        label: "Drivers",
        icon: "Users",
        path: "/admin/taxi/drivers",
        permissionKey: "list",
      },
      {
        type: "link",
        label: "Onboarding Requests",
        icon: "ClipboardCheck",
        path: "/admin/taxi/drivers/requests",
        permissionKey: "onboarding",
      },
    ],
  },
  {
    type: "section",
    title: "Customer Management",
    permissionKey: "customers",
    items: [
      {
        type: "link",
        label: "Customers",
        icon: "User",
        path: "/admin/taxi/customers",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Fleet Management",
    permissionKey: "fleet",
    items: [
      {
        type: "link",
        label: "Vehicles",
        icon: "Truck",
        path: "/admin/taxi/vehicles",
        permissionKey: "vehicles",
      },
      {
        type: "link",
        label: "Vehicle Types",
        icon: "FolderTree",
        path: "/admin/taxi/vehicle-types",
        permissionKey: "vehicle_types",
      },
    ],
  },
  {
    type: "section",
    title: "Finance & Promotions",
    permissionKey: "finance",
    items: [
      {
        type: "link",
        label: "Pricing / Fares",
        icon: "IndianRupee",
        path: "/admin/taxi/pricing",
        permissionKey: "pricing",
      },
      {
        type: "link",
        label: "Time-slot Surge",
        icon: "Zap",
        path: "/admin/taxi/surge",
        permissionKey: "pricing",
      },
      {
        type: "link",
        label: "Promo / Coupons",
        icon: "Gift",
        path: "/admin/taxi/coupons",
        permissionKey: "coupons",
      },
    ],
  },
  {
    type: "section",
    title: "Operations",
    permissionKey: "operations",
    items: [
      {
        type: "link",
        label: "Service Zones",
        icon: "MapPin",
        path: "/admin/taxi/zones",
        permissionKey: "zones",
      },
      {
        type: "link",
        label: "Reports",
        icon: "FileText",
        path: "/admin/taxi/reports",
        permissionKey: "reports",
      },
      {
        type: "link",
        label: "Settings",
        icon: "Settings",
        path: "/admin/taxi/settings",
        permissionKey: "settings",
      },
    ],
  },
];
