export const serviceProviderAdminSidebarMenu = [
  {
    type: "section",
    title: "Providers",
    permissionKey: "providers",
    items: [
      {
        type: "link",
        label: "Joining Requests",
        icon: "UserPlus",
        path: "/admin/service-provider/joining-requests",
        permissionKey: "list",
      },
      {
        type: "link",
        label: "All Providers",
        icon: "Users",
        path: "/admin/service-provider/providers",
        permissionKey: "list",
      },
      {
        type: "link",
        label: "Service Requests",
        icon: "ClipboardList",
        path: "/admin/service-provider/service-requests",
        permissionKey: "list",
      },
      {
        type: "link",
        label: "Category Requests",
        icon: "FolderPlus",
        path: "/admin/service-provider/category-requests",
        permissionKey: "list",
      },
    ],
  },
  {
    type: "section",
    title: "Catalog",
    permissionKey: "catalog",
    items: [
      {
        type: "link",
        label: "Categories",
        icon: "FolderTree",
        path: "/admin/service-provider/categories",
        permissionKey: "list",
      },
      {
        type: "link",
        label: "Services",
        icon: "ClipboardCheck",
        path: "/admin/service-provider/services",
        permissionKey: "list",
      },
      {
        type: "link",
        label: "Zones",
        icon: "MapPin",
        path: "/admin/service-provider/zones",
        permissionKey: "list",
      },
    ],
  },
];
