/**
 * Offline / reconnect banner + slow-network toast wiring.
 */

import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import {
  installNetworkMonitor,
  subscribeNetworkStatus,
  isOnline,
} from "@/services/api/networkMonitor";
import { dismissOfflineToast, notifyNetworkStatus } from "@/services/api/networkToast";
import { ApiErrorCode } from "@/services/api/errors";

export function NetworkStatusBanner() {
  const [online, setOnline] = useState(() => isOnline());
  const wasOfflineRef = useRef(!isOnline());

  useEffect(() => {
    const uninstall = installNetworkMonitor();
    const unsubscribe = subscribeNetworkStatus(({ online: next }) => {
      setOnline(next);
      if (!next) {
        wasOfflineRef.current = true;
        notifyNetworkStatus(ApiErrorCode.OFFLINE, false);
        return;
      }
      dismissOfflineToast();
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        notifyNetworkStatus("ONLINE_RECOVERY", false);
      }
    });
    return () => {
      unsubscribe();
      uninstall();
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-x-0 top-0 z-[200] flex items-center justify-center gap-2 bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white shadow-md"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>You&apos;re offline. Some actions are unavailable until you reconnect.</span>
    </div>
  );
}
