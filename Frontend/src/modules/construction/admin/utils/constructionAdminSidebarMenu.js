export const constructionAdminSidebarMenu = [
  {
    type: "section",
    title: "Overview",
    permissionKey: "reports",
    items: [
      {
        type: "link",
        label: "Dashboard",
        icon: "LayoutDashboard",
        path: "/admin/construction/dashboard",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Pipeline",
    permissionKey: "enquiries",
    items: [
      {
        type: "link",
        label: "Enquiries",
        icon: "Inbox",
        path: "/admin/construction/enquiries",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Projects",
    permissionKey: "projects",
    items: [
      {
        type: "link",
        label: "Project Register",
        icon: "ClipboardList",
        path: "/admin/construction/projects",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Disputes",
    permissionKey: "disputes",
    items: [
      {
        type: "link",
        label: "Dispute Queue",
        icon: "Scale",
        path: "/admin/construction/disputes",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Money",
    permissionKey: "payments",
    items: [
      {
        type: "link",
        label: "Payment Control",
        icon: "Wallet",
        path: "/admin/construction/payments",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Records",
    permissionKey: "reports",
    items: [
      {
        type: "link",
        label: "Reports",
        icon: "BarChart3",
        path: "/admin/construction/reports",
        permissionKey: "list",
      },
      {
        type: "link",
        label: "Activity Record",
        icon: "History",
        path: "/admin/construction/activity",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Contractors",
    permissionKey: "contractors",
    items: [
      {
        type: "link",
        label: "Approval Queue",
        icon: "UserCheck",
        path: "/admin/construction/contractors",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Catalogue",
    permissionKey: "settings",
    items: [
      {
        type: "link",
        label: "Categories",
        icon: "FolderTree",
        path: "/admin/construction/categories",
        permissionKey: "list",
      },
      {
        type: "link",
        label: "Services",
        icon: "HardHat",
        path: "/admin/construction/services",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Configuration",
    permissionKey: "settings",
    items: [
      {
        type: "link",
        label: "Module Settings",
        icon: "SlidersHorizontal",
        path: "/admin/construction/settings",
        permissionKey: "list",
      },
    ],
  },
];
