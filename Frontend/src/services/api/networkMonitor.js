/**
 * Browser connectivity monitor (online / offline).
 * Single listener set — subscribe from UI (banner) and HTTP layer.
 */

const listeners = new Set();

let online =
  typeof navigator === "undefined" ? true : navigator.onLine !== false;

let installed = false;

function emit() {
  const snapshot = { online };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // never break other subscribers
    }
  });
}

function handleOnline() {
  online = true;
  emit();
}

function handleOffline() {
  online = false;
  emit();
}

export function installNetworkMonitor() {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;
  online = navigator.onLine !== false;
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    installed = false;
  };
}

export function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false && online;
}

export function subscribeNetworkStatus(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  try {
    listener({ online: isOnline() });
  } catch {
    // ignore
  }
  return () => listeners.delete(listener);
}
