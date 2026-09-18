export const commonAdminSidebarMenu = [
  {
    type: "section",
    label: "Settings",
    permissionKey: "settings",
    items: [
      {
        type: "link",
        label: "Logo",
        permissionKey: "app_settings",
        path: "/admin/global-settings/logo",
        icon: "Image",
      },
      {
        type: "link",
        label: "App Settings",
        permissionKey: "app_settings",
        path: "/admin/global-settings/app",
        icon: "Settings",
      },
      {
        type: "link",
        label: "Admin Settings",
        permissionKey: "admin_settings",
        path: "/admin/global-settings/admin",
        icon: "UserCog",
      },
      {
        type: "expandable",
        label: "Customization",
        permissionKey: "customization",
        icon: "Palette",
        subItems: [
          {
            type: "link",
            label: "Modules",
            permissionKey: "modules",
            path: "/admin/global-settings/modules",
            icon: "LayoutGrid",
          },
          {
            type: "link",
            label: "Vehicle Configuration",
            permissionKey: "vehicle_configuration",
            path: "/admin/global-settings/vehicle-configuration",
            icon: "Truck",
          },
          {
            type: "link",
            label: "Module Vehicle Mapping",
            permissionKey: "module_vehicle_mapping",
            path: "/admin/global-settings/module-vehicle-mapping",
            icon: "Car",
          },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "Developer Settings",
    permissionKey: "developer_settings",
    items: [
      {
        type: "link",
        label: "Toggles",
        permissionKey: "modules",
        path: "/admin/global-settings/toggles",
        icon: "Zap",
      },
    ],
  },
  {
    type: "section",
    label: "Finance",
    permissionKey: "finance",
    items: [
      {
        type: "link",
        label: "DP Withdrawal Requests",
        permissionKey: "dp_withdrawal_requests",
        path: "/admin/global-settings/delivery-withdrawals",
        icon: "Banknote",
      },
      {
        type: "link",
        label: "Driver Min Wallet",
        permissionKey: "driver_min_wallet",
        path: "/admin/global-settings/driver-min-wallet",
        icon: "Wallet",
      },
    ],
  },
];
