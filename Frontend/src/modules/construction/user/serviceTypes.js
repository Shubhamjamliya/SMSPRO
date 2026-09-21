/**
 * The three sections of the construction home screen, the address each one lives
 * at, and the package-selection page that hangs off End-to-End. Kept in one place
 * because several files must agree on these: the router (app/routes.jsx) registers
 * them, and the screens navigate to them.
 *
 * `id` is what the home screen already used to tell the sections apart, so the
 * rest of that page did not have to change.
 */
export const CONSTRUCTION_HOME_PATH = "/construction";
export const END_TO_END_PATH = "/construction/end-to-end";

export const SERVICE_TYPE_ROUTES = [
  { id: "end-to-end", path: END_TO_END_PATH },
  { id: "budget-friendly", path: "/construction/budget-friendly" },
  { id: "material-services", path: "/construction/materials" },
];

export const pathForServiceType = (id) =>
  SERVICE_TYPE_ROUTES.find((route) => route.id === id)?.path || CONSTRUCTION_HOME_PATH;

/**
 * The Select Package page. `:packageId` is optional in the router: without it the
 * page opens on the most popular residential package.
 */
export const SELECT_PACKAGE_PATH = `${END_TO_END_PATH}/select-package`;

export const selectPackagePath = (packageId) =>
  packageId ? `${SELECT_PACKAGE_PATH}/${packageId}` : SELECT_PACKAGE_PATH;
