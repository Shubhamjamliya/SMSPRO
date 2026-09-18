import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Bell,
  BookOpen,
  ChevronRight,
  CircleHelp,
  FileText,
  Gift,
  LayoutGrid,
  LogIn,
  LogOut,
  MapPinned,
  Phone,
  Shield,
  Sparkles,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { authAPI } from "@food/api";
import { clearModuleAuth } from "@food/utils/auth";
import { normalizeImageUrl } from "@food/utils/imageUtils";
import { API_BASE_URL } from "@/services/api/config";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
  PrimaryButton,
} from "../components/ui";
import BottomSheet from "../components/ui/BottomSheet";
import useTaxiAuthUser from "../hooks/useTaxiAuthUser";
import {
  getTaxiAddressesPath,
  getTaxiDeleteAccountPath,
  getTaxiEditProfilePath,
  getTaxiHomePath,
  getTaxiNotificationsPath,
  getTaxiPrivacyPath,
  getTaxiProfileContactPath,
  getTaxiProfileFaqsPath,
  getTaxiProfileHelpPath,
  getTaxiReferPath,
  getTaxiRefundPath,
  getTaxiSecurityPath,
  getTaxiSubscriptionPath,
  getTaxiTermsPath,
  getTaxiWalletPath,
} from "../utils/routes";
import {
  redirectToTaxiLogin,
  TAXI_USER_LOGIN_PATH,
} from "../utils/authUser";

const BACKEND_ORIGIN = String(API_BASE_URL || "")
  .replace(/\/api\/v1\/?$/, "")
  .replace(/\/api\/?$/, "");

const MENU = [
  {
    group: "Account",
    items: [
      { id: "profile", title: "My Profile", icon: User, path: getTaxiEditProfilePath, auth: true },
      { id: "addresses", title: "Saved Addresses", icon: MapPinned, path: getTaxiAddressesPath, auth: true },
      { id: "wallet", title: "My Wallet", icon: Wallet, path: getTaxiWalletPath, auth: true },
      { id: "subscription", title: "Subscription", icon: Sparkles, path: getTaxiSubscriptionPath, auth: true },
      { id: "refer", title: "Refer & Earn", icon: Gift, path: getTaxiReferPath, auth: true },
    ],
  },
  {
    group: "Preferences",
    items: [
      { id: "notifications", title: "Notifications", icon: Bell, path: getTaxiNotificationsPath, auth: true },
      { id: "security", title: "Security", icon: Shield, path: getTaxiSecurityPath, auth: true },
    ],
  },
  {
    group: "Support & legal",
    items: [
      { id: "faqs", title: "FAQs", icon: CircleHelp, path: getTaxiProfileFaqsPath },
      { id: "contact", title: "Contact Support", icon: Phone, path: getTaxiProfileContactPath },
      { id: "help", title: "Help Center", icon: BookOpen, path: getTaxiProfileHelpPath },
      { id: "privacy", title: "Privacy Policy", icon: FileText, path: getTaxiPrivacyPath },
      { id: "terms", title: "Terms & Conditions", icon: FileText, path: getTaxiTermsPath },
      { id: "refund", title: "Refund Policy", icon: FileText, path: getTaxiRefundPath },
    ],
  },
];

export default function TaxiProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const {
    isLoggedIn,
    loading,
    name,
    phone,
    email,
    initials,
    photoUrl,
  } = useTaxiAuthUser();

  const resolvedPhoto = photoUrl
    ? normalizeImageUrl(photoUrl, BACKEND_ORIGIN) || photoUrl
    : null;

  const goAuthRequired = (path) => {
    if (!isLoggedIn) {
      toast.message("Login required", {
        description: "Sign in to manage your taxi account and book rides.",
      });
      redirectToTaxiLogin(navigate, path || location);
      return;
    }
    navigate(path);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      try {
        const fcmToken =
          localStorage.getItem("fcm_web_registered_token_user") || null;
        await authAPI.logout(null, fcmToken, "web");
      } catch {
        // Continue local cleanup even if API fails
      }
      clearModuleAuth("user");
      window.dispatchEvent(new Event("userAuthChanged"));
      setLogoutOpen(false);
      toast.success("Logged out");
      navigate(TAXI_USER_LOGIN_PATH, { replace: true });
    } catch {
      clearModuleAuth("user");
      window.dispatchEvent(new Event("userAuthChanged"));
      setLogoutOpen(false);
      navigate(TAXI_USER_LOGIN_PATH, { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <TaxiPageShell showBottomNav>
      <TaxiPageHeader
        title="Profile"
        subtitle="Account & preferences"
        backTo={getTaxiHomePath()}
      />

      <main className="space-y-5 px-4 py-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 animate-pulse rounded-2xl bg-gray-100" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
                <div className="h-3 w-40 animate-pulse rounded bg-gray-100" />
                <div className="h-3 w-48 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
          ) : isLoggedIn ? (
            <>
              <div className="flex items-center gap-3">
                {resolvedPhoto ? (
                  <img
                    src={resolvedPhoto}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FF6A00]/10 text-lg font-black text-[#FF6A00]">
                    {initials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-extrabold text-gray-900">
                    {name || "Rider"}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{phone}</p>
                  <p className="truncate text-[11px] text-gray-400">{email}</p>
                </div>
              </div>
              <PrimaryButton
                className="mt-3.5 h-10"
                variant="outline"
                onClick={() => goAuthRequired(getTaxiEditProfilePath())}
              >
                Edit Profile
              </PrimaryButton>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                  <User className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-extrabold text-gray-900">
                    Login to continue
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Sign in to book rides and manage your account.
                  </p>
                </div>
              </div>
              <PrimaryButton
                className="mt-3.5 h-10"
                onClick={() => redirectToTaxiLogin(navigate, location)}
              >
                <LogIn className="h-4 w-4" />
                Login / Sign up
              </PrimaryButton>
            </>
          )}
        </section>

        {MENU.map((section) => (
          <section key={section.group}>
            <SectionLabel>{section.group}</SectionLabel>
            <div className="space-y-2">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      item.auth
                        ? goAuthRequired(item.path())
                        : navigate(item.path())
                    }
                    className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-bold text-gray-900">
                      {item.title}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        <section className="space-y-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
              <LayoutGrid className="h-[18px] w-[18px]" />
            </span>
            <span className="flex-1 text-sm font-bold text-gray-900">
              Other services
            </span>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </button>

          {isLoggedIn ? (
            <>
              <button
                type="button"
                onClick={() => goAuthRequired(getTaxiDeleteAccountPath())}
                className="flex w-full items-center gap-3 rounded-2xl border border-red-100 bg-white px-3.5 py-3 text-left shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <Trash2 className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-sm font-bold text-red-600">
                  Delete Account
                </span>
                <ChevronRight className="h-4 w-4 text-red-200" />
              </button>

              <button
                type="button"
                onClick={() => setLogoutOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
                  <LogOut className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1 text-sm font-bold text-gray-900">
                  Logout
                </span>
              </button>
            </>
          ) : null}
        </section>
      </main>

      <BottomSheet
        open={logoutOpen}
        onClose={() => !loggingOut && setLogoutOpen(false)}
        title="Logout?"
      >
        <p className="mb-4 text-xs leading-relaxed text-gray-500">
          You will need to sign in again to book rides and manage your wallet.
        </p>
        <div className="space-y-2.5">
          <PrimaryButton
            variant="danger"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            {loggingOut ? "Logging out…" : "Logout"}
          </PrimaryButton>
          <PrimaryButton
            variant="outline"
            disabled={loggingOut}
            onClick={() => setLogoutOpen(false)}
          >
            Cancel
          </PrimaryButton>
        </div>
      </BottomSheet>
    </TaxiPageShell>
  );
}
