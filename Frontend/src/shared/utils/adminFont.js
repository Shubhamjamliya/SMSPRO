/**
 * Switches the whole admin panel to Poppins.
 *
 * Two parts, kept together because one is useless without the other:
 *   - the Poppins stylesheet is added to <head> the first time an admin page opens,
 *     so customers of the app never download a font they will not see, and
 *   - `admin-poppins` is put on <html>, where global.css turns it into the page font.
 *
 * The class goes on <html> rather than on the admin layout on purpose. Dialogs,
 * dropdowns and toasts render into portals under <body>, outside the layout, and
 * would otherwise keep the old font while everything around them changed.
 *
 * Returns the cleanup that gives the customer app its own font back.
 */
const FONT_LINK_ID = 'admin-poppins-font';
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap';
const ROOT_CLASS = 'admin-poppins';

export function enableAdminPoppins() {
  if (typeof document === 'undefined') return undefined;

  if (!document.getElementById(FONT_LINK_ID)) {
    const link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }

  document.documentElement.classList.add(ROOT_CLASS);
  // The stylesheet stays in <head> after leaving admin: it is inert without the
  // class, and keeping it means coming back to admin does not fetch it again.
  return () => document.documentElement.classList.remove(ROOT_CLASS);
}
