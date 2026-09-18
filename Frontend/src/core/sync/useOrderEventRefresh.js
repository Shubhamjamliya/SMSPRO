import { useEffect, useRef } from 'react';
import { onOrderEvent } from './orderSync';

/**
 * Event-driven replacement for order-status polling.
 *
 * Calls `callback` (debounced) whenever a fresh order event arrives on the unified
 * `order:event` stream (socket / native FCM / /sync replay) and when the tab becomes
 * visible again. Pages keep their own mount fetch and their socket reconnect → syncNow;
 * this removes the `setInterval` timer polls.
 */
export function useOrderEventRefresh(callback, { debounceMs = 800, onVisible = true } = {}) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    let timer = null;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          cbRef.current?.();
        } catch {
          /* refresh failures are non-fatal */
        }
      }, debounceMs);
    };

    const off = onOrderEvent(() => fire());
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') fire();
    };
    if (onVisible && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
    }

    return () => {
      clearTimeout(timer);
      off();
      if (onVisible && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [debounceMs, onVisible]);
}
