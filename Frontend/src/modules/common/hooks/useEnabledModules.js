import { useCallback, useEffect, useState } from "react";
import {
  getCachedSettings,
  loadBusinessSettings,
} from "@/modules/common/utils/businessSettings";
import {
  DEFAULT_ENABLED_MODULES,
  normalizeEnabledModules,
} from "@/modules/common/utils/enabledModules";

export function useEnabledModules({ refreshOnMount = true } = {}) {
  const [modules, setModules] = useState(() =>
    normalizeEnabledModules(getCachedSettings()?.modules),
  );
  const [loading, setLoading] = useState(refreshOnMount);

  const applyModules = useCallback((settings) => {
    if (settings?.modules) {
      setModules(normalizeEnabledModules(settings.modules));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (refreshOnMount) setLoading(true);
      try {
        const settings = await loadBusinessSettings();
        if (!cancelled && settings) {
          applyModules(settings);
        }
      } catch {
        if (!cancelled) {
          setModules(normalizeEnabledModules(getCachedSettings()?.modules));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    refresh();

    const handleSettingsUpdate = (event) => {
      const settings = event?.detail || getCachedSettings();
      if (settings) applyModules(settings);
    };

    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate);
    };
  }, [applyModules, refreshOnMount]);

  return {
    modules,
    loading,
    defaults: DEFAULT_ENABLED_MODULES,
    isEnabled: (moduleKey) => modules[moduleKey] !== false,
  };
}
