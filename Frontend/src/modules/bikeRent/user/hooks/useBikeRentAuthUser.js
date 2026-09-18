import { useMemo } from "react";
import { useProfile } from "@food/context/ProfileContext";
import {
  getProfileDisplayName,
  getProfileDrivingLicense,
  getProfileEmail,
  getProfileImageUrl,
  getProfileInitials,
  getProfilePhone,
  isBikeRentUserLoggedIn,
} from "../utils/authUser";

/**
 * Resolves the logged-in customer for Bike Rent User screens.
 * Uses ProfileContext (real session) when available.
 */
export default function useBikeRentAuthUser() {
  const {
    userProfile,
    loading,
    addresses = [],
    refreshAddresses,
    updateUserProfile,
  } = useProfile();

  const isLoggedIn = isBikeRentUserLoggedIn();

  const display = useMemo(() => {
    if (!isLoggedIn || !userProfile) {
      return {
        name: "",
        phone: "",
        email: "",
        drivingLicenseNumber: "",
        initials: "?",
        photoUrl: null,
      };
    }
    return {
      name: getProfileDisplayName(userProfile) || "Rider",
      phone: getProfilePhone(userProfile) || "—",
      email: getProfileEmail(userProfile) || "—",
      drivingLicenseNumber: getProfileDrivingLicense(userProfile),
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
    updateUserProfile,
    ...display,
  };
}
