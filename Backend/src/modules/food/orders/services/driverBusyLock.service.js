/**
 * Backward-compatible re-export.
 * Canonical implementation: core/dispatch/driverBusyLock.service.js
 */
export {
  setDriverBusy,
  clearDriverBusy,
  getRedisBusyDriverIds,
} from '../../../../core/dispatch/driverBusyLock.service.js';
