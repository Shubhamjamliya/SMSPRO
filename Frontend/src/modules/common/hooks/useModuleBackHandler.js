import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Hook to catch back navigation on any module home page and redirect the user
 * back to the main Module Selection Screen (/modules).
 */
export function useModuleBackHandler(isHomePage = true) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isHomePage) return;

    // Push state so pressing back triggers popstate instead of exiting the app
    window.history.pushState({ moduleHome: true }, "", window.location.href);

    const handlePopState = () => {
      // Navigate back to module selection screen
      navigate("/modules", { replace: true });
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isHomePage, location.pathname, navigate]);
}

export default useModuleBackHandler;
