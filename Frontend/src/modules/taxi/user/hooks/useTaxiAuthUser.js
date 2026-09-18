import { useMemo } from "react";
import { useProfile } from "@food/context/ProfileContext";
import {
  getProfileDisplayName,
  getProfileEmail,
  getProfileImageUrl,
  getProfileInitials,
  getProfilePhone,
  isTaxiUserLoggedIn,
} from "../utils/authUser";

/**
 * Resolves the logged-in customer for Taxi User screens.
 * Uses ProfileContext (real session) when available.
 */
export default function useTaxiAuthUser() {
  const {
    userProfile,
    loading,
    addresses = [],
    refreshAddresses,
  } = useProfile();

  const isLoggedIn = isTaxiUserLoggedIn();

  const display = useMemo(() => {
    if (!isLoggedIn || !userProfile) {
      return {
        name: "",
        phone: "",
        email: "",
        initials: "?",
        photoUrl: null,
      };
    }
    return {
      name: getProfileDisplayName(userProfile) || "Rider",
      phone: getProfilePhone(userProfile) || "—",
      email: getProfileEmail(userProfile) || "—",
      initials: getProfileInitials(userProfile),
      photoUrl: getProfileImageUrl(userProfile),
    };
  }, [isLoggedIn, userProfile]);

  return {
    isLoggedIn,
    loading: Boolean(loading) && isLoggedIn,
    userProfile: isLoggedIn ? userProfile : null,
    addresses: isLoggedIn ? addresses : [],
    refreshAddresses,
    ...display,
  };
}
