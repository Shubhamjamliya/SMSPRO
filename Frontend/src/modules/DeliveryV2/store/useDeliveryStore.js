import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  getApprovedModulesFromEnrollments,
  normalizeDriverModuleKey,
  orderSwitcherEnrollments,
} from '@/modules/DeliveryV2/utils/driverModuleAccess'
import {
  isTaxiActiveOrder,
  mapTaxiRideStatusToTripStatus,
} from '@/modules/DeliveryV2/utils/taxiRideFlow'
import {
  isPorterActiveOrder,
  mapPorterTripStatusToTripStatus,
} from '@/modules/DeliveryV2/utils/porterTripFlow'

function activeOrderKey(order) {
  if (!order) return null
  return (
    order.rideId ||
    order.tripId ||
    order._id ||
    order.id ||
    order.orderId ||
    order.orderMongoId ||
    null
  )
}

function initialTripStatusForOrder(order) {
  if (isTaxiActiveOrder(order)) {
    return mapTaxiRideStatusToTripStatus(order.status) || 'PICKING_UP'
  }
  if (isPorterActiveOrder(order)) {
    return mapPorterTripStatusToTripStatus(order.status) || 'PICKING_UP'
  }
  return 'PICKING_UP'
}

/**
 * useDeliveryStore - Professional Zustand store for Delivery V2
 * Handles Trip Lifecycle, Rider Status, Module Context, and Admin Settings.
 */
export const useDeliveryStore = create(
  persist(
    (set, get) => ({
      // --- Rider Status ---
      isOnline: false,
      riderLocation: null, // { lat, lng }
      activeVehicleId: null, // string | null
      driverVehicles: [], // array of vehicle objects

      // --- Active work module (Food / Taxi / Porter / …) ---
      activeModule: null, // string | null — last selected approved module
      moduleEnrollments: [], // applied enrollments for switcher + profile

      // --- Trip State ---
      activeOrder: null, // ActiveOrder | null
      tripStatus: 'IDLE', // 'IDLE' | 'PICKING_UP' | 'REACHED_PICKUP' | 'PICKED_UP' | 'DELIVERING' | 'REACHED_DROP' | 'COMPLETED'
      
      // --- Admin / Business Settings ---
      settings: {
        pickupRangeLimit: 500, // meters, fallback default
        deliveryRangeLimit: 500, // meters, fallback default
      },

      // --- Actions ---
      /** Prefer explicit activeVehicleId; otherwise first approved / first listed vehicle. */
      resolveActiveVehicleId: (state = get()) => {
        if (state.activeVehicleId) return state.activeVehicleId;
        const list = state.driverVehicles || [];
        if (!list.length) return null;
        const approved = list.find(
          (v) =>
            String(v.verificationStatus || "").toLowerCase() === "approved" ||
            !v.verificationStatus
        );
        const pick = approved || list[0];
        return pick?.vehicleId || pick?.id || null;
      },

      resolveActiveModule: (state = get()) => {
        const approved = getApprovedModulesFromEnrollments(state.moduleEnrollments);
        if (!approved.length) {
          // Fall back to vehicle-supported services before enrollments hydrate
          const vehicle = (() => {
            const id = state.activeVehicleId;
            const list = state.driverVehicles || [];
            if (!id || !list.length) return null;
            return list.find((v) => v.vehicleId === id || v.id === id) || null;
          })();
          const fromVehicle =
            vehicle?.supportedServices ||
            vehicle?.master?.supportedServices ||
            [];
          const normalized = (Array.isArray(fromVehicle) ? fromVehicle : []).map(
            (k) => normalizeDriverModuleKey(k),
          );
          if (
            state.activeModule &&
            normalized.includes(normalizeDriverModuleKey(state.activeModule))
          ) {
            return normalizeDriverModuleKey(state.activeModule);
          }
          return normalized[0] || null;
        }
        const current = state.activeModule
          ? normalizeDriverModuleKey(state.activeModule)
          : null;
        if (current && approved.includes(current)) return current;
        return approved[0] || null;
      },

      toggleOnline: () => set((state) => {
        if (!state.isOnline) {
          const vehicleId = get().resolveActiveVehicleId(state);
          if (!vehicleId) {
            console.warn("Cannot go online without an active vehicle");
            return state;
          }
          const activeModule = get().resolveActiveModule(state);
          return { isOnline: true, activeVehicleId: vehicleId, activeModule };
        }
        return { isOnline: false };
      }),
      
      setOnline: (online) => set((state) => {
        if (online) {
          const vehicleId = get().resolveActiveVehicleId(state);
          if (!vehicleId) {
            console.warn("Cannot go online without an active vehicle");
            return state;
          }
          const activeModule = get().resolveActiveModule(state);
          return { isOnline: true, activeVehicleId: vehicleId, activeModule };
        }
        return { isOnline: false };
      }),

      setDriverVehicles: (vehicles) => {
        const list = Array.isArray(vehicles) ? vehicles : [];
        const state = get();
        const nextActive =
          state.activeVehicleId &&
          list.some((v) => (v.vehicleId || v.id) === state.activeVehicleId)
            ? state.activeVehicleId
            : get().resolveActiveVehicleId({ ...state, driverVehicles: list, activeVehicleId: null });
        set({ driverVehicles: list, activeVehicleId: nextActive || state.activeVehicleId });
      },

      setActiveVehicle: (id) => {
        const state = get();
        if (state.isOnline) {
          console.error("Cannot change active vehicle while online");
          return false;
        }
        set({ activeVehicleId: id });
        return true;
      },

      /**
       * Seed / refresh enrollments from profile. Auto-repairs activeModule
       * when the previous selection is no longer approved.
       */
      setModuleEnrollments: (enrollments) => {
        const list = orderSwitcherEnrollments(
          Array.isArray(enrollments) ? enrollments : [],
        );
        const state = get();
        const nextActive = get().resolveActiveModule({
          ...state,
          moduleEnrollments: list,
        });
        set({
          moduleEnrollments: list,
          activeModule: nextActive,
        });
      },

      /**
       * Switch the active work module (Food / Taxi / …).
       * @returns {{ ok: boolean, reason?: string, module?: string }}
       */
      setActiveModule: (moduleKey, { force = false } = {}) => {
        const state = get();
        const key = normalizeDriverModuleKey(moduleKey);
        if (!key) return { ok: false, reason: "invalid" };

        if (state.isOnline && !force) {
          return { ok: false, reason: "online" };
        }
        if (state.activeOrder && !force) {
          return { ok: false, reason: "active_trip" };
        }

        const approved = getApprovedModulesFromEnrollments(state.moduleEnrollments);
        const enrollment = (state.moduleEnrollments || []).find(
          (item) => normalizeDriverModuleKey(item.module) === key,
        );
        if (enrollment && enrollment.status !== "approved") {
          return { ok: false, reason: enrollment.status || "pending" };
        }
        if (approved.length && !approved.includes(key)) {
          return { ok: false, reason: "not_approved" };
        }

        set({ activeModule: key });
        return { ok: true, module: key };
      },
      
      setRiderLocation: (location) => set({ riderLocation: location }),
      
      setSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),

      setActiveOrder: (order) => set((state) => {
        if (!order) {
          return { activeOrder: null, tripStatus: 'IDLE' }
        }

        const prevKey = activeOrderKey(state.activeOrder)
        const nextKey = activeOrderKey(order)
        const sameActive =
          prevKey && nextKey && String(prevKey) === String(nextKey)

        let tripStatus = state.tripStatus
        if (!sameActive) {
          tripStatus = initialTripStatusForOrder(order)
        } else if (isTaxiActiveOrder(order) && order.status) {
          tripStatus = mapTaxiRideStatusToTripStatus(order.status)
        } else if (isPorterActiveOrder(order) && order.status) {
          tripStatus = mapPorterTripStatusToTripStatus(order.status)
        }

        return { activeOrder: order, tripStatus }
      }),

      updateTripStatus: (status) => set({ tripStatus: status }),

      clearActiveOrder: () => set({ 
        activeOrder: null, 
        tripStatus: 'IDLE' 
      }),

      // --- Selectors / Computed Helper ---
      canAdvanceToPickup: () => {
        const { activeOrder, tripStatus } = get();
        return activeOrder && tripStatus === 'PICKING_UP';
      },

      canAdvanceToDeliver: () => {
        const { activeOrder, tripStatus } = get();
        return activeOrder && tripStatus === 'PICKED_UP';
      },

      // Derived Getters
      getActiveVehicle: () => {
        const { activeVehicleId, driverVehicles } = get();
        if (!activeVehicleId || !driverVehicles || driverVehicles.length === 0) return null;
        return driverVehicles.find(v => v.vehicleId === activeVehicleId || v.id === activeVehicleId) || null;
      },

      /** All approved modules the driver can work in. */
      getAuthorizedModules: () => {
        const fromEnrollments = getApprovedModulesFromEnrollments(
          get().moduleEnrollments,
        );
        if (fromEnrollments.length) return fromEnrollments;
        const activeVehicle = get().getActiveVehicle();
        if (!activeVehicle) return [];
        const services =
          activeVehicle.supportedServices ||
          (activeVehicle.master && activeVehicle.master.supportedServices) ||
          [];
        return (Array.isArray(services) ? services : []).map((k) =>
          normalizeDriverModuleKey(k),
        );
      },

      /**
       * Modules that should receive offers right now.
       * Scoped to the selected active module for production multi-service drivers.
       */
      getAvailableModules: () => {
        const active = get().resolveActiveModule();
        if (active) return [active];
        return get().getAuthorizedModules();
      },

      getCurrentModule: () => {
        const { activeOrder } = get();
        if (activeOrder?.module) {
          return normalizeDriverModuleKey(activeOrder.module);
        }
        return get().resolveActiveModule() || "food";
      },
    }),
    {
      name: 'delivery-v2-online-pref',
      partialize: (state) => ({ 
        isOnline: state.isOnline,
        activeVehicleId: state.activeVehicleId,
        activeModule: state.activeModule,
      }),
    }
  )
);
