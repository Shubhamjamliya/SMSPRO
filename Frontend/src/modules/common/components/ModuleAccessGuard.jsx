import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppShellSkeleton } from "@food/components/ui/loading-skeletons";
import { useEnabledModules } from "@/modules/common/hooks/useEnabledModules";
import {
  getFirstEnabledModulePath,
  isModuleEnabled,
} from "@/modules/common/utils/enabledModules";

export default function ModuleAccessGuard({ moduleKey, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { modules, loading } = useEnabledModules();

  const allowed = isModuleEnabled(modules, moduleKey);

  useEffect(() => {
    if (loading || allowed) return;

    const nextPath = "/modules";

    if (`${location.pathname}${location.search}` !== nextPath) {
      navigate(nextPath, { replace: true });
    }
  }, [allowed, loading, location.pathname, location.search, navigate]);

  if (loading) {
    return <AppShellSkeleton />;
  }

  if (!allowed) {
    return null;
  }

  return children;
}
