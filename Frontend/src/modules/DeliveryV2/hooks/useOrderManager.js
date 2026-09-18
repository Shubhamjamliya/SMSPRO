import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { getPrimaryPickupLocation, normalizeLocationPoint, normalizePickupPoints, isReturnPickupTrip, getDeliveryDocumentId, getReturnDropLocation, enrichReturnDeliveryOrder } from '@/modules/DeliveryV2/utils/orderRouting';
import { normalizeDriverModuleKey } from '@/modules/DeliveryV2/utils/driverModuleAccess';
import { taxiPartnerApi } from '@/modules/taxi/services/api';
import { porterPartnerApi } from '@/modules/porter/user/services/api';
import {
  buildTaxiActiveOrder,
  getTaxiRideId,
  isTaxiActiveOrder,
  mapTaxiRideStatusToTripStatus,
} from '@/modules/DeliveryV2/utils/taxiRideFlow';
import {
  buildPorterActiveOrder,
  getPorterTripId,
  isPorterActiveOrder,
  mapPorterTripStatusToTripStatus,
} from '@/modules/DeliveryV2/utils/porterTripFlow';
import { getFeedEarnings } from '@/modules/DeliveryV2/utils/feedRequestFormatters';

function applyTaxiRide(ride, rideId) {
  const { activeOrder, setActiveOrder } = useDeliveryStore.getState();
  setActiveOrder(buildTaxiActiveOrder(ride, rideId, activeOrder));
}

function applyPorterTrip(trip, tripId) {
  const { activeOrder, setActiveOrder } = useDeliveryStore.getState();
  setActiveOrder(buildPorterActiveOrder(trip, tripId, activeOrder));
}

/**
 * useOrderManager - Professional hook for real-world trip lifecycle actions.
 * Connects directly to the backend API services.
 */
const orderManagerFns = {
  

  acceptOrder: async (order) => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    const moduleKey =
      normalizeDriverModuleKey(order?.module) ||
      (order?.jobType === 'ride' || order?.rideId
        ? 'taxi'
        : order?.jobType === 'parcel' || order?.tripId
          ? 'porter'
          : 'food');

    // Taxi ride accept
    if (moduleKey === 'taxi') {
      const rideId = order?.rideId || order?.orderMongoId || order?.id || order?._id;
      if (!rideId) {
        toast.error('Invalid ride data');
        return;
      }
      try {
        const ride = await taxiPartnerApi.acceptRide(rideId);
        applyTaxiRide(ride, rideId);
        updateTripStatus(mapTaxiRideStatusToTripStatus(ride?.status) || 'PICKING_UP');
        toast.success('Ride accepted');
        return ride;
      } catch (error) {
        const msg = error?.response?.data?.message || error?.message || 'Failed to accept ride';
        toast.error(msg);
        return;
      }
    }

    // Porter parcel accept
    if (moduleKey === 'porter') {
      const tripId = order?.tripId || order?.orderMongoId || order?.id || order?._id;
      if (!tripId) {
        toast.error('Invalid trip data');
        return;
      }
      try {
        const trip = await porterPartnerApi.acceptTrip(tripId);
        applyPorterTrip(trip, tripId);
        updateTripStatus(mapPorterTripStatusToTripStatus(trip?.status) || 'PICKING_UP');
        toast.success('Parcel trip accepted');
        return trip;
      } catch (error) {
        const msg = error?.response?.data?.message || error?.message || 'Failed to accept trip';
        toast.error(msg);
        return;
      }
    }

    const orderId = getDeliveryDocumentId(order);
    if (!orderId) {
      toast.error('Invalid order data');
      return;
    }

    const acceptBody = isReturnPickupTrip(order)
      ? { documentType: 'seller_return' }
      : order?.dispatchLeg?.legId
        ? { legId: order.dispatchLeg.legId }
        : {};

    try {
      const response = await deliveryAPI.acceptOrder(orderId, acceptBody);
      
      if (response?.data?.success) {
        const fullOrder = response.data.data?.order || order;
        
        // Robustly determine locations from multiple possible formats (Populated API vs Socket)
        const getLoc = (ref, keysLat, keysLng) => {
          if (!ref) return null;
          // Handle nested populated objects
          if (ref.location) {
            // Handle GeoJSON format: location: { type: 'Point', coordinates: [lng, lat] }
            if (Array.isArray(ref.location.coordinates) && ref.location.coordinates.length >= 2) {
              return {
                lat: ref.location.coordinates[1], // Latitude is second in GeoJSON [lng, lat]
                lng: ref.location.coordinates[0]  // Longitude is first
              };
            }
            // Handle standard object format: location: { latitude: 12.3, longitude: 45.6 }
            return {
              lat: ref.location.latitude || ref.location.lat,
              lng: ref.location.longitude || ref.location.lng
            };
          }
          // Handle flat objects or direct lat/lng keys
          for (const k of keysLat) { if (ref[k] != null) return { lat: ref[k], lng: ref[keysLng[keysLat.indexOf(k)]] }; }
          return null;
        };

        console.log('[OrderManager] Raw Full Order Data:', fullOrder);

        const resLoc = getLoc(fullOrder.restaurantId, ['latitude', 'lat'], ['longitude', 'lng']) || 
                       getLoc(fullOrder, ['restaurant_lat', 'restaurantLat', 'latitude'], ['restaurant_lng', 'restaurantLng', 'longitude']);
                       
        const cusLoc = getLoc(fullOrder.deliveryAddress, ['latitude', 'lat'], ['longitude', 'lng']) || 
                       getLoc(fullOrder, ['customer_lat', 'customerLat', 'latitude'], ['customer_lng', 'customerLng', 'longitude']);
        const pickupPoints = normalizePickupPoints(fullOrder);
        const primaryPickupLocation =
          getPrimaryPickupLocation(fullOrder) ||
          normalizeLocationPoint(resLoc);
        const dropLocation = isReturnPickupTrip(fullOrder)
          ? getReturnDropLocation(fullOrder)
          : cusLoc;

        console.log('[OrderManager] Locations Mapped Result:', { resLoc, cusLoc, dropLocation });

        setActiveOrder(enrichReturnDeliveryOrder({
          ...fullOrder,
          orderId: isReturnPickupTrip(fullOrder) ? orderId : (fullOrder.orderId || orderId),
          returnId: fullOrder.returnId || (isReturnPickupTrip(fullOrder) ? orderId : undefined),
          documentType: fullOrder.documentType || (isReturnPickupTrip(fullOrder) ? 'seller_return' : undefined),
          tripType: fullOrder.tripType || (isReturnPickupTrip(fullOrder) ? 'return_pickup' : undefined),
          pickupPoints,
          restaurantLocation: primaryPickupLocation || resLoc,
          customerLocation: cusLoc,
          sellerDropLocation: dropLocation,
        }));

        updateTripStatus('PICKING_UP');
        // toast.success('Order Accepted! Opening Map...');
      } else {
        toast.error(response?.data?.message || 'Order already taken or unavailable');
        throw new Error('Accept failed');
      }
    } catch (error) {
      console.error('Accept Order Error:', error);
      const status = Number(error?.response?.status || 0);
      const message = String(error?.response?.data?.message || '').toLowerCase();

      if (
        status === 403 &&
        (
          message.includes('already claimed') ||
          message.includes('someone else') ||
          message.includes('not available for this rider')
        )
      ) {
        toast.error('Order was accepted by someone else');
      } else {
        toast.error(error?.response?.data?.message || 'Network error. Please try again.');
      }
      throw error;
    }
  },

  taxiArrivePickup: async () => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    const rideId = getTaxiRideId(activeOrder);
    if (!rideId) {
      toast.error('Invalid ride');
      throw new Error('Invalid ride');
    }
    try {
      const ride = await taxiPartnerApi.markArrived(rideId);
      applyTaxiRide(ride, rideId);
      updateTripStatus('REACHED_PICKUP');
      toast.success('Arrived at pickup');
      return ride;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to mark arrived');
      throw error;
    }
  },

  taxiStartTrip: async (otp) => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    const rideId = getTaxiRideId(activeOrder);
    if (!rideId) {
      toast.error('Invalid ride');
      throw new Error('Invalid ride');
    }
    try {
      const ride = await taxiPartnerApi.startRide(rideId, String(otp || '').trim());
      applyTaxiRide(ride, rideId);
      updateTripStatus('PICKED_UP');
      toast.success('Trip started');
      return ride;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Invalid OTP. Ask the rider.');
      throw error;
    }
  },

  taxiCompleteTrip: async () => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    const rideId = getTaxiRideId(activeOrder);
    if (!rideId) {
      toast.error('Invalid ride');
      throw new Error('Invalid ride');
    }
    try {
      // If still on trip, reach drop first (opens payment).
      if (String(activeOrder?.status || '').toLowerCase() === 'in_progress' || tripStatus === 'PICKED_UP') {
        const ride = await taxiPartnerApi.reachDrop(rideId, {
          distanceKm: activeOrder?.distanceKm,
          durationMin: activeOrder?.durationMin,
        });
        applyTaxiRide(ride, rideId);
        updateTripStatus('AWAITING_PAYMENT');
        toast.message('Collect payment to finish');
        return ride;
      }

      const ride = await taxiPartnerApi.completeRide(rideId);
      const driverShare = Number(
        ride?.fare?.driverShare ??
          ride?.fareBreakdown?.driverShare ??
          Math.max(
            0,
            Number(ride?.fare?.total ?? 0) - Number(ride?.fare?.platformFee ?? 0),
          ),
      );
      applyTaxiRide({
        ...ride,
        earnings: Math.max(0, driverShare),
        riderEarning: Math.max(0, driverShare),
      }, rideId);
      updateTripStatus('COMPLETED');
      toast.success('Ride completed');
      return ride;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to complete ride');
      throw error;
    }
  },

  taxiReachDrop: async () => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    const rideId = getTaxiRideId(activeOrder);
    if (!rideId) {
      toast.error('Invalid ride');
      throw new Error('Invalid ride');
    }
    try {
      const ride = await taxiPartnerApi.reachDrop(rideId, {
        distanceKm: activeOrder?.distanceKm,
        durationMin: activeOrder?.durationMin,
      });
      applyTaxiRide(ride, rideId);
      updateTripStatus('AWAITING_PAYMENT');
      toast.message('Awaiting payment');
      return ride;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to mark drop reached');
      throw error;
    }
  },

  taxiCreateCollectQr: async () => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    const rideId = getTaxiRideId(activeOrder);
    if (!rideId) throw new Error('Invalid ride');
    const data = await taxiPartnerApi.createCollectQr(rideId);
    if (data?.ride) {
      applyTaxiRide(data.ride, rideId);
      updateTripStatus('AWAITING_PAYMENT');
    }
    return data;
  },

  taxiCollectCash: async () => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    const rideId = getTaxiRideId(activeOrder);
    if (!rideId) throw new Error('Invalid ride');
    const ride = await taxiPartnerApi.collectCash(rideId);
    const driverShare = Number(
      ride?.fare?.driverShare ??
        ride?.fareBreakdown?.driverShare ??
        Math.max(
          0,
          Number(ride?.fare?.total ?? 0) - Number(ride?.fare?.platformFee ?? 0),
        ),
    );
    applyTaxiRide({
      ...ride,
      earnings: Math.max(0, driverShare),
      riderEarning: Math.max(0, driverShare),
    }, rideId);
    updateTripStatus('COMPLETED');
    toast.success('Cash collected · ride completed');
    return ride;
  },

  taxiRefreshPayment: async () => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    const rideId = getTaxiRideId(activeOrder);
    if (!rideId) return null;
    const ride = await taxiPartnerApi.getPaymentStatus(rideId);
    applyTaxiRide(ride, rideId);
    const rideStatus = String(ride?.status || '').toLowerCase();
    if (rideStatus === 'completed') {
      updateTripStatus('COMPLETED');
    } else if (rideStatus === 'awaiting_payment') {
      updateTripStatus('AWAITING_PAYMENT');
    }
    return ride;
  },

  /**
   * Mark "Reached Pickup" (Arrival at restaurant / taxi pickup)
   */
  reachPickup: async () => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    if (isTaxiActiveOrder(activeOrder)) {
      return orderManagerFns.taxiArrivePickup();
    }
    if (isPorterActiveOrder(activeOrder)) {
      const tripId = getPorterTripId(activeOrder);
      if (!tripId) {
        toast.error('Invalid trip');
        throw new Error('Invalid trip');
      }
      try {
        const trip = await porterPartnerApi.markArrived(tripId);
        applyPorterTrip(trip, tripId);
        updateTripStatus('REACHED_PICKUP');
        toast.success('Arrived at pickup');
        return trip;
      } catch (error) {
        toast.error(error?.response?.data?.message || 'Failed to mark arrived');
        throw error;
      }
    }

    const orderId = getDeliveryDocumentId(activeOrder);
    try {
      const response = await deliveryAPI.confirmReachedPickup(orderId, {
        documentType: isReturnPickupTrip(activeOrder) ? 'seller_return' : undefined,
      });
      if (response?.data?.success) {
        updateTripStatus('REACHED_PICKUP');
        // toast.info('Arrived at Restaurant');
      } else {
        throw new Error('Confirm pickup failed');
      }
    } catch (error) {
      toast.error('Failed to update status');
      throw error;
    }
  },

  /**
   * Mark "Picked Up" (Confirm order ID & start delivery)
   */
  pickUpOrder: async (billImageUrl, extra = {}) => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    if (isPorterActiveOrder(activeOrder)) {
      const tripId = getPorterTripId(activeOrder);
      const otp = String(extra?.otp || extra?.customerOtp || '').trim();
      if (!tripId) {
        toast.error('Invalid trip');
        throw new Error('Invalid trip');
      }
      if (!/^\d{6}$/.test(otp)) {
        toast.error('Enter the 6-digit pickup OTP');
        throw new Error('Invalid OTP');
      }
      try {
        const trip = await porterPartnerApi.startTrip(tripId, otp);
        applyPorterTrip(trip, tripId);
        updateTripStatus('LOADING');
        toast.success('OTP verified — loading started');
        return trip;
      } catch (error) {
        toast.error(error?.response?.data?.message || 'Invalid OTP. Ask the customer.');
        throw error;
      }
    }

    const orderId = getDeliveryDocumentId(activeOrder);
    try {
      const payload = isReturnPickupTrip(activeOrder)
        ? {
            documentType: 'seller_return',
            otp: extra?.otp || extra?.customerOtp,
            customerOtp: extra?.otp || extra?.customerOtp,
            pickupImages: extra?.pickupImages || (billImageUrl ? [billImageUrl] : []),
            billImageUrl,
          }
        : { billImageUrl };

      const response = await deliveryAPI.confirmOrderId(
        orderId, 
        activeOrder.displayOrderId || orderId, 
        riderLocation || {},
        payload,
      );
      
      if (response?.data?.success) {
        const updatedOrder = enrichReturnDeliveryOrder(
          response.data.data?.order || response.data?.order || activeOrder,
        );
        if (updatedOrder) setActiveOrder(updatedOrder);
        updateTripStatus('PICKED_UP');
        // toast.success('Order Collected! Heading to Drop-off');
      } else {
        throw new Error('Confirm order ID failed');
      }
    } catch (error) {
      toast.error('Error confirming pickup');
      throw error;
    }
  },

  /**
   * Porter: slide after loading timer — parcel loaded, head to drop.
   */
  confirmParcelLoaded: async () => {
    const { activeOrder, updateTripStatus } = useDeliveryStore.getState();
    if (!isPorterActiveOrder(activeOrder)) {
      throw new Error('Not a porter trip');
    }
    const tripId = getPorterTripId(activeOrder);
    if (!tripId) {
      toast.error('Invalid trip');
      throw new Error('Invalid trip');
    }
    try {
      const trip = await porterPartnerApi.markLoaded(tripId);
      applyPorterTrip(trip, tripId);
      updateTripStatus('PICKED_UP');
      toast.success('Parcel loaded — head to drop');
      return trip;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to confirm loaded');
      throw error;
    }
  },

  /**
   * Mark "Reached Drop" (Arrival at customer)
   */
  reachDrop: async () => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    if (isTaxiActiveOrder(activeOrder)) {
      return orderManagerFns.taxiReachDrop();
    }
    if (isPorterActiveOrder(activeOrder)) {
      const tripId = getPorterTripId(activeOrder);
      if (!tripId) {
        toast.error('Invalid trip');
        throw new Error('Invalid trip');
      }
      try {
        const trip = await porterPartnerApi.markAtDrop(tripId, {
          distanceKm: activeOrder?.distanceKm,
          durationMin: activeOrder?.durationMin,
        });
        applyPorterTrip(trip, tripId);
        updateTripStatus('AWAITING_PAYMENT');
        toast.message('Verify drop OTP & collect payment');
        return trip;
      } catch (error) {
        toast.error(error?.response?.data?.message || 'Failed to mark drop');
        throw error;
      }
    }

    const orderId = getDeliveryDocumentId(activeOrder);
    try {
      const response = await deliveryAPI.confirmReachedDrop(orderId, {
        documentType: isReturnPickupTrip(activeOrder) ? 'seller_return' : undefined,
      });
      if (response?.data?.success) {
        updateTripStatus('REACHED_DROP');
        // toast.info('Arrived at Customer Location');
      } else {
        throw new Error('Confirm drop failed');
      }
    } catch (error) {
      toast.error('Failed to notify arrival');
      throw error;
    }
  },

  /**
   * Finalize Delivery with OTP Check
   */
  completeDelivery: async (otp, options = {}) => {
    const { activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation } = useDeliveryStore.getState();
    const { paymentMode } = options;

    if (isPorterActiveOrder(activeOrder)) {
      const tripId = getPorterTripId(activeOrder);
      if (!tripId) {
        toast.error('Invalid trip');
        throw new Error('Invalid trip');
      }
      const dropOtp = String(otp || options.otp || '').trim();
      try {
        const trip = await porterPartnerApi.completeTrip(tripId, {
          otp: dropOtp,
          dropOtp,
          distanceKm: activeOrder?.distanceKm,
          durationMin: activeOrder?.durationMin,
        });
        applyPorterTrip(trip, tripId);
        if (String(trip?.status || '').toLowerCase() === 'awaiting_payment') {
          updateTripStatus('AWAITING_PAYMENT');
          const due = Number(trip?.payment?.extraDue || 0);
          toast.message(
            due > 0
              ? `₹${due} still pending — collect payment`
              : 'Waiting for payment',
          );
          return trip;
        }
        updateTripStatus('COMPLETED');
        toast.success('Parcel delivered');
        return trip;
      } catch (error) {
        toast.error(error?.response?.data?.message || 'Failed to complete trip');
        throw error;
      }
    }

    const orderId = getDeliveryDocumentId(activeOrder);
    const isReturn = isReturnPickupTrip(activeOrder);

    try {
      if (isReturn) {
        const completeRes = await deliveryAPI.completeDelivery(orderId, {
          otp,
          sellerOtp: otp,
          documentType: 'seller_return',
        });
        if (completeRes?.data?.success) {
          const finalOrder = completeRes.data?.data?.order || activeOrder;
          if (finalOrder) {
            const merged = { ...activeOrder, ...finalOrder };
            const earning = getFeedEarnings(merged);
            setActiveOrder({
              ...merged,
              earnings: earning,
              riderEarning:
                Number(merged.riderEarning) > 0
                  ? Number(merged.riderEarning)
                  : earning,
            });
          }
          updateTripStatus('COMPLETED');
        } else {
          throw new Error('Complete failed');
        }
        return;
      }

      // 1. Verify OTP first
      const verifyRes = await deliveryAPI.verifyDropOtp(orderId, otp);
      
      if (verifyRes?.data?.success) {
        let finalOrder = verifyRes.data?.data?.order || activeOrder;
        
        try {
          // 2. Mark as complete
          const completeRes = await deliveryAPI.completeDelivery(orderId, { 
            otp, 
            rating: 5,
            paymentMode
          });
          if (completeRes.data?.success && completeRes.data?.data?.order) {
            finalOrder = completeRes.data.data.order;
          }
        } catch (completeErr) {
          console.warn('Complete call failed, but OTP was verified.', completeErr);
          // If already completed, we proceed to show the summary with whatever we have
        }
        
        // Enrich earnings so completion screen matches wallet credit fields
        if (finalOrder) {
          const merged = { ...activeOrder, ...finalOrder };
          const earning = getFeedEarnings(merged);
          setActiveOrder({
            ...merged,
            earnings: earning,
            riderEarning:
              Number(merged.riderEarning) > 0
                ? Number(merged.riderEarning)
                : earning,
          });
        }
        
        updateTripStatus('COMPLETED');
        // toast.success('Delivery Success!');
      } else {
        toast.error('Invalid OTP. Please check with customer.');
        throw new Error('Invalid OTP');
      }
    } catch (error) {
      console.error('Completion Error:', error);
      toast.error(error?.response?.data?.message || 'Verification failed');
      throw error;
    }
  },

  resetTrip: () => {
    const { clearActiveOrder } = useDeliveryStore.getState();
    clearActiveOrder();
  },

  porterCollectCash: async (otp) => {
    const { activeOrder, updateTripStatus } = useDeliveryStore.getState();
    const tripId = getPorterTripId(activeOrder);
    if (!tripId) throw new Error('Invalid trip');
    const trip = await porterPartnerApi.collectCash(tripId, {
      otp: String(otp || '').trim(),
    });
    applyPorterTrip(trip, tripId);
    updateTripStatus('COMPLETED');
    toast.success('Cash collected · parcel delivered');
    return trip;
  },

  porterCreateCollectQr: async (otp) => {
    const { activeOrder, updateTripStatus } = useDeliveryStore.getState();
    const tripId = getPorterTripId(activeOrder);
    if (!tripId) throw new Error('Invalid trip');
    const data = await porterPartnerApi.createCollectQr(tripId, {
      otp: String(otp || '').trim(),
    });
    if (data?.trip) {
      applyPorterTrip(data.trip, tripId);
      updateTripStatus('AWAITING_PAYMENT');
    }
    return data;
  },

  porterRefreshPayment: async () => {
    const { activeOrder, updateTripStatus } = useDeliveryStore.getState();
    const tripId = getPorterTripId(activeOrder);
    if (!tripId) return null;
    const trip = await porterPartnerApi.getPaymentStatus(tripId);
    applyPorterTrip(trip, tripId);
    const st = String(trip?.status || '').toLowerCase();
    if (st === 'completed') updateTripStatus('COMPLETED');
    else if (st === 'awaiting_payment') updateTripStatus('AWAITING_PAYMENT');
    return trip;
  },
};

export const useOrderManager = () => orderManagerFns;
