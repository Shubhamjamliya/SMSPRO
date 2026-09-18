import { Server } from 'socket.io';
import { config } from './env.js';
import { logger } from '../utils/logger.js';
import { verifyAccessToken } from '../core/auth/token.util.js';
import { getFirebaseDB } from './firebase.js';


let io = null;

function logDeliverySocket(message, extra = {}) {
    const suffix = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
    logger.info(`[DeliverySocket] ${message}${suffix}`);
}

function getTokenFromHandshake(socket) {
    const authToken = socket?.handshake?.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();
    const header = socket?.handshake?.headers?.authorization || socket?.handshake?.headers?.Authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.substring(7).trim();
    const queryToken = socket?.handshake?.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();
    return null;
}

function maskToken(token) {
    if (!token || typeof token !== 'string') return null;
    const trimmed = token.trim();
    if (!trimmed) return null;
    return `${trimmed.slice(0, 12)}...${trimmed.slice(-6)}`;
}

const roomNames = {
    admin: (id) => `admin:${String(id)}`,
    restaurant: (id) => `restaurant:${String(id)}`,
    user: (id) => `user:${String(id)}`,
    seller: (id) => `seller:${String(id)}`,
    delivery: (id) => `delivery:${String(id)}`,
    /** Service Provider (ServiceProviderProfile) — a distinct actor type from the
     *  Driver-based `delivery` room above, so it gets its own room family. */
    provider: (id) => `provider:${String(id)}`,
    /** Construction contractor (ContractorProfile) — again its own actor type,
     *  not a Driver and not a ServiceProvider. */
    contractor: (id) => `contractor:${String(id)}`,
    tracking: (orderId) => `tracking:${String(orderId)}`
};

/* ===================== LIVE ROAD-DISTANCE ETA =====================
 * Authoritative "arriving in X mins" for everyone watching an order.
 * Recomputed from REAL road distance (central location service, Mongo-cached
 * per ~100m grid pair) only when the rider moved >250m or 45s passed —
 * between recomputes the last value is re-attached to every broadcast.
 * Before pickup: rider->pickup + pickup->customer (+handover buffer).
 * After pickup:  rider->customer.
 */
const ETA_RECOMPUTE_MIN_METERS = 250;
const ETA_RECOMPUTE_MIN_MS = 45_000;
const ETA_PHASE_REFRESH_MS = 60_000;
const ETA_HANDOVER_BUFFER_MIN = 3;
const _orderEtaState = new Map(); // orderId -> state (module-level: shared across sockets)

async function loadOrderEtaContext(orderId) {
    const { FoodOrder } = await import('../modules/food/orders/models/order.model.js');
    const mongoose = (await import('mongoose')).default;
    const query = mongoose.Types.ObjectId.isValid(String(orderId))
        ? { _id: orderId }
        : { orderId: String(orderId) };
    const order = await FoodOrder.findOne(query)
        .select('deliveryAddress.location pickupPoints deliveryState.currentPhase deliveryState.pickedUpAt restaurantId')
        .populate('restaurantId', 'location')
        .lean();
    if (!order) return null;

    const toLatLng = (loc) => {
        const c = loc?.coordinates;
        if (Array.isArray(c) && c.length === 2 && c.every((n) => Number.isFinite(Number(n)))) {
            return { lat: Number(c[1]), lng: Number(c[0]) };
        }
        const lat = Number(loc?.latitude ?? loc?.lat);
        const lng = Number(loc?.longitude ?? loc?.lng);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    };

    return {
        dest: toLatLng(order.deliveryAddress?.location),
        pickup:
            toLatLng(order.pickupPoints?.[0]?.location) ||
            toLatLng(order.restaurantId?.location),
        pickedUp:
            Boolean(order.deliveryState?.pickedUpAt) ||
            ['en_route_to_delivery', 'at_drop', 'delivered', 'completed']
                .includes(String(order.deliveryState?.currentPhase || ''))
    };
}

async function resolveLiveEta(orderId, riderLat, riderLng) {
    // Lazy eviction so finished orders don't accumulate forever.
    if (_orderEtaState.size > 500) {
        const cutoff = Date.now() - 2 * 60 * 60 * 1000;
        for (const [key, s] of _orderEtaState) {
            if ((s.lastEtaAt || 0) < cutoff) _orderEtaState.delete(key);
        }
    }

    let state = _orderEtaState.get(String(orderId));
    const now = Date.now();

    try {
        if (!state) {
            const ctx = await loadOrderEtaContext(orderId);
            if (!ctx || !ctx.dest) return null;
            state = { ...ctx, phaseCheckedAt: now, lastEtaAt: 0, lastEtaLat: null, lastEtaLng: null, etaMinutes: null, roadKm: null };
            _orderEtaState.set(String(orderId), state);
        } else if (!state.pickedUp && now - state.phaseCheckedAt > ETA_PHASE_REFRESH_MS) {
            // Re-check pickup phase so the ETA switches to the drop leg mid-trip.
            state.phaseCheckedAt = now;
            const ctx = await loadOrderEtaContext(orderId);
            if (ctx) state.pickedUp = ctx.pickedUp;
        }

        const { haversineKm, getRoadDistance } = await import('../core/location/location.service.js');
        const movedMeters = state.lastEtaLat == null
            ? Infinity
            : haversineKm(state.lastEtaLat, state.lastEtaLng, riderLat, riderLng) * 1000;

        if (movedMeters > ETA_RECOMPUTE_MIN_METERS || now - state.lastEtaAt > ETA_RECOMPUTE_MIN_MS) {
            state.lastEtaAt = now;
            state.lastEtaLat = riderLat;
            state.lastEtaLng = riderLng;

            const rider = { lat: riderLat, lng: riderLng };
            if (state.pickedUp || !state.pickup) {
                const leg = await getRoadDistance(rider, state.dest);
                if (leg) {
                    state.roadKm = leg.distanceKm;
                    state.etaMinutes = leg.durationMinutes
                        ?? Math.max(1, Math.round((leg.distanceKm / 25) * 60)); // 25 km/h fallback
                }
            } else {
                // Pre-pickup: to-pickup leg changes as rider moves; pickup->dest is
                // a fixed pair so it's answered from cache after the first call.
                const [toPickup, toDest] = await Promise.all([
                    getRoadDistance(rider, state.pickup),
                    getRoadDistance(state.pickup, state.dest)
                ]);
                if (toPickup && toDest) {
                    state.roadKm = Math.round((toPickup.distanceKm + toDest.distanceKm) * 100) / 100;
                    const mins =
                        (toPickup.durationMinutes ?? Math.round((toPickup.distanceKm / 25) * 60)) +
                        (toDest.durationMinutes ?? Math.round((toDest.distanceKm / 25) * 60));
                    state.etaMinutes = Math.max(1, mins + ETA_HANDOVER_BUFFER_MIN);
                }
            }
        }

        return { etaMinutes: state.etaMinutes, roadDistanceKm: state.roadKm };
    } catch (err) {
        logger.warn(`[DeliverySocket] live ETA computation failed for order ${orderId}: ${err.message}`);
        return state ? { etaMinutes: state.etaMinutes, roadDistanceKm: state.roadKm } : null;
    }
}

/**
 * Initializes Socket.IO with the provided HTTP server.
 * When REDIS_ENABLED=true and REDIS_URL is set, attaches Redis adapter for horizontal scaling.
 * @param {import('http').Server} server
 * @returns {Promise<Server>}
 */
export const initSocket = async (server) => {
    io = new Server(server, {
        cors: {
            origin: config.socketCorsOrigin,
            methods: ['GET', 'POST']
        }
    });

    // Socket auth middleware (Bearer token).
    io.use(async (socket, next) => {
        try {
            const token = getTokenFromHandshake(socket);
            if (!token) {
                logger.warn(`Socket auth failed: token missing for socket ${socket.id}`);
                logger.warn(`[DeliverySocket] Handshake auth missing`, {
                    socketId: socket.id,
                    origin: socket?.handshake?.headers?.origin || null,
                    host: socket?.handshake?.headers?.host || null,
                    userAgent: socket?.handshake?.headers?.['user-agent'] || null,
                    hasAuthToken: Boolean(socket?.handshake?.auth?.token),
                    hasAuthorizationHeader: Boolean(
                        socket?.handshake?.headers?.authorization || socket?.handshake?.headers?.Authorization
                    ),
                    hasQueryToken: Boolean(socket?.handshake?.query?.token),
                });
                return next(new Error('AUTH_MISSING'));
            }
            logger.info(`[DeliverySocket] Handshake token received`, {
                socketId: socket.id,
                origin: socket?.handshake?.headers?.origin || null,
                host: socket?.handshake?.headers?.host || null,
                transport: socket?.handshake?.query?.transport || null,
                tokenPreview: maskToken(token),
            });
            const decoded = verifyAccessToken(token);
            const normalizedRole = String(decoded.role || '').trim().toUpperCase();
            const userId = decoded.userId || decoded.sub;
            socket.user = { userId, role: decoded.role, authType: 'food' };
            socket.auth = {
                sub: userId,
                role: String(decoded.role || '').toLowerCase(),
                authType: 'food',
            };

            logger.info(`Socket auth success: ${socket.user.role}:${socket.user.userId} for socket ${socket.id}`);
            return next();
        } catch (err) {
            logger.error(`Socket auth failed for socket ${socket.id}: ${err.message}`);
            logger.error(`[DeliverySocket] Handshake auth invalid`, {
                socketId: socket.id,
                origin: socket?.handshake?.headers?.origin || null,
                host: socket?.handshake?.headers?.host || null,
                transport: socket?.handshake?.query?.transport || null,
                tokenPreview: maskToken(getTokenFromHandshake(socket)),
                errorMessage: err.message,
                errorName: err.name || null,
            });
            return next(new Error('AUTH_INVALID'));
        }
    });

    if (config.redisEnabled && config.redisUrl) {
        try {
            const { createAdapter } = await import('@socket.io/redis-adapter');
            const { createClient } = await import('redis');
            const pubClient = createClient({
                url: config.redisUrl,
                socket: {
                    // Give up after a few attempts so an unreachable Redis falls back
                    // to the in-memory adapter instead of retrying (and logging) forever.
                    reconnectStrategy: (retries) =>
                        retries >= 3 ? new Error('Redis unreachable') : Math.min(retries * 200, 1000),
                },
            });
            const subClient = pubClient.duplicate();
            pubClient.on('error', (err) => logger.error(`Socket.IO Redis pub client: ${err.message || err.code || err}`));
            subClient.on('error', (err) => logger.error(`Socket.IO Redis sub client: ${err.message || err.code || err}`));
            await Promise.all([pubClient.connect(), subClient.connect()]);
            io.adapter(createAdapter(pubClient, subClient));
            logger.info('Socket.IO Redis adapter attached for horizontal scaling');
        } catch (err) {
            logger.warn(`Socket.IO Redis adapter skipped (using in-memory): ${err.message}`);
        }
    } else if (String(process.env.NODE_ENV).toLowerCase() === 'production') {
        // Real-time order events emitted from one instance will not reach clients connected
        // to another without a shared adapter. Warn loudly rather than fail (single-instance
        // deployments still work correctly on the in-memory adapter).
        logger.warn(
            'Socket.IO is running on the in-memory adapter in PRODUCTION — order events will ' +
            'not fan out across multiple instances. Set REDIS_ENABLED=true and REDIS_URL to enable ' +
            'cross-instance delivery.'
        );
    }

    io.on('connection', (socket) => {
        const userId = socket.user?.userId;
        const role = socket.user?.role;
        logger.info(`Socket client connected: ${socket.id} (${role || 'UNKNOWN'}:${userId || '-'})`);

        // Auto-join role rooms (lets us emit without a custom join).
        if (userId && role) {
            if (role === 'ADMIN') socket.join(roomNames.admin(userId));
            if (role === 'RESTAURANT') socket.join(roomNames.restaurant(userId));
            if (role === 'USER') socket.join(roomNames.user(userId));
            if (role === 'SELLER') socket.join(roomNames.seller(userId));
            if (role === 'DELIVERY_PARTNER') {
                socket.join(roomNames.delivery(userId));
                logDeliverySocket('Auto-joined delivery room on connect', {
                    socketId: socket.id,
                    deliveryPartnerId: String(userId),
                    room: roomNames.delivery(userId),
                });
            }
            if (role === 'SERVICE_PROVIDER') {
                socket.join(roomNames.provider(userId));
            }
            if (role === 'CONTRACTOR') {
                socket.join(roomNames.contractor(userId));
            }
        }

        // Explicit join (used by existing restaurant client hook).
        socket.on('join-restaurant', (restaurantId) => {
            if (socket.user?.role !== 'RESTAURANT') return;
            // Security: only join your own restaurant room.
            if (String(socket.user?.userId) !== String(restaurantId)) return;
            socket.join(roomNames.restaurant(restaurantId));
            socket.emit('restaurant-room-joined', { room: roomNames.restaurant(restaurantId), restaurantId: String(restaurantId) });
        });

        // Explicit join (used by existing delivery client hook).
        socket.on('join-delivery', (deliveryPartnerId) => {
            if (socket.user?.role !== 'DELIVERY_PARTNER') {
                logDeliverySocket('Rejected join-delivery for non-delivery role', {
                    socketId: socket.id,
                    role: socket.user?.role || 'UNKNOWN',
                    requestedDeliveryPartnerId: String(deliveryPartnerId || ''),
                });
                return;
            }
            // Security: only join your own delivery room.
            if (String(socket.user?.userId) !== String(deliveryPartnerId)) {
                logDeliverySocket('Rejected join-delivery due to user mismatch', {
                    socketId: socket.id,
                    authDeliveryPartnerId: String(socket.user?.userId || ''),
                    requestedDeliveryPartnerId: String(deliveryPartnerId || ''),
                });
                return;
            }
            const room = roomNames.delivery(deliveryPartnerId);
            socket.join(room);
            const roomSize = io?.sockets?.adapter?.rooms?.get(room)?.size || 0;
            logDeliverySocket('Delivery room joined', {
                socketId: socket.id,
                deliveryPartnerId: String(deliveryPartnerId),
                room,
                roomSize,
            });
            socket.emit('delivery-room-joined', { room, deliveryPartnerId: String(deliveryPartnerId) });
        });

        // Explicit join (used by the Service Provider provider-side client hook) —
        // mirrors join-delivery above.
        socket.on('join-provider', (providerId) => {
            if (socket.user?.role !== 'SERVICE_PROVIDER') return;
            // Security: only join your own provider room.
            if (String(socket.user?.userId) !== String(providerId)) return;
            const room = roomNames.provider(providerId);
            socket.join(room);
            socket.emit('provider-room-joined', { room, providerId: String(providerId) });
        });

        // Explicit join for the construction contractor client — mirrors
        // join-provider above, including the only-your-own-room check.
        socket.on('join-contractor', (contractorId) => {
            if (socket.user?.role !== 'CONTRACTOR') return;
            // Security: only join your own contractor room.
            if (String(socket.user?.userId) !== String(contractorId)) return;
            const room = roomNames.contractor(contractorId);
            socket.join(room);
            socket.emit('contractor-room-joined', { room, contractorId: String(contractorId) });
        });

        // ─── Live Tracking Events ───────────────────────────────────────

        // Users / restaurants subscribe to an order's real-time tracking room.
        socket.on('join-tracking', (orderId) => {
            if (!orderId) return;
            const role = socket.user?.role;
            if (role !== 'USER' && role !== 'RESTAURANT' && role !== 'DELIVERY_PARTNER' && role !== 'SELLER' && role !== 'ADMIN') return;
            const room = roomNames.tracking(orderId);
            socket.join(room);
            logger.info(`Socket ${socket.id} (${role}:${userId}) joined tracking room ${room}`);
        });

        // Backward-compatible alias used by some quick-commerce screens.
        socket.on('join_order', (orderId) => {
            if (!orderId) return;
            const role = socket.user?.role;
            if (role !== 'USER' && role !== 'RESTAURANT' && role !== 'DELIVERY_PARTNER' && role !== 'SELLER' && role !== 'ADMIN') return;
            const room = roomNames.tracking(orderId);
            socket.join(room);
        });

        socket.on('leave_order', (orderId) => {
            if (!orderId) return;
            socket.leave(roomNames.tracking(orderId));
        });

        socket.on('leave-tracking', (orderId) => {
            if (!orderId) return;
            socket.leave(roomNames.tracking(orderId));
        });

        // Delivery partner emits live GPS location for an active order.
        // Broadcasts to the tracking room so users see the bike move in real time.
        const _lastLocationBroadcast = {};
        const _lastFirebaseTrackingSync = {};
        socket.on('update-location', async (data) => {
            if (socket.user?.role !== 'DELIVERY_PARTNER') return;
            if (!data || !data.orderId) return;

            const lat = Number(data.lat);
            const lng = Number(data.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

            const heading = Number.isFinite(Number(data.heading)) ? Number(data.heading) : 0;
            const speed = Number.isFinite(Number(data.speed)) ? Number(data.speed) : 0;
            const accuracy = Number.isFinite(Number(data.accuracy)) ? Number(data.accuracy) : null;

            // Throttle: max one broadcast per 2s per orderId
            const now = Date.now();
            const lastTS = _lastLocationBroadcast[data.orderId] || 0;
            if (now - lastTS < 2000) return;
            _lastLocationBroadcast[data.orderId] = now;

            // Authoritative road-distance ETA (cached + throttled server-side).
            // Falls back to the driver-device estimate only when unavailable.
            const liveEta = await resolveLiveEta(data.orderId, lat, lng);

            const payload = {
                orderId: String(data.orderId),
                deliveryPartnerId: String(userId),
                lat,
                lng,
                boy_lat: lat, // Add boy_lat/lng for compatibility
                boy_lng: lng,
                riderLocation: [lat, lng], // Add array format for safety
                heading,
                speed,
                accuracy,
                timestamp: now,
                polyline: data.polyline || null,
                eta: liveEta?.etaMinutes ?? data.eta ?? null,
                etaMinutes: liveEta?.etaMinutes ?? null,
                roadDistanceKm: liveEta?.roadDistanceKm ?? null,
                etaSource: liveEta?.etaMinutes != null ? 'road_distance' : 'device_estimate',
                status: data.status || 'on_the_way',
            };

            logDeliverySocket('Location update received', {
                socketId: socket.id,
                deliveryPartnerId: String(userId),
                orderId: String(data.orderId),
                lat,
                lng,
                status: data.status || 'on_the_way',
            });

            // Broadcast to tracking room (all users watching this order)
            const trackingRoom = roomNames.tracking(data.orderId);
            socket.to(trackingRoom).emit('location-update', payload);

            // Also emit to the specific user room if userId is provided
            if (data.userId) {
                socket.to(roomNames.user(data.userId)).emit('location-update', payload);
            }

            if (data.restaurantId) {
                socket.to(roomNames.restaurant(data.restaurantId)).emit('location-update', payload);
            }

            // Taxi: persist driver ping on active ride + fan-out to ride tracking + rider user room
            try {
                const { TaxiRide } = await import('../modules/taxi/models/taxiRide.model.js');
                const mongoose = await import('mongoose');
                const orderKey = String(data.orderId || '');
                const rideFilter = {
                    isDeleted: { $ne: true },
                    'dispatch.deliveryPartnerId': userId,
                    status: { $in: ['assigned', 'arriving', 'arrived', 'in_progress'] },
                };
                if (mongoose.default.isValidObjectId(orderKey)) {
                    rideFilter.$or = [{ _id: orderKey }, { rideNumber: orderKey }];
                } else if (orderKey) {
                    rideFilter.rideNumber = orderKey;
                }
                const taxiRide = await TaxiRide.findOneAndUpdate(
                    rideFilter,
                    {
                        $set: {
                            lastDriverLocation: { lat, lng, at: new Date(now) },
                        },
                    },
                    { new: true },
                ).select('_id rideNumber userId').lean();

                if (taxiRide) {
                    const rideId = String(taxiRide._id);
                    const ridePayload = {
                        ...payload,
                        module: 'taxi',
                        rideId,
                        orderId: rideId,
                        rideNumber: taxiRide.rideNumber || '',
                    };
                    socket.to(roomNames.tracking(rideId)).emit('location-update', ridePayload);
                    if (taxiRide.rideNumber && taxiRide.rideNumber !== orderKey) {
                        socket.to(roomNames.tracking(taxiRide.rideNumber)).emit('location-update', ridePayload);
                    }
                    if (taxiRide.userId) {
                        socket.to(roomNames.user(taxiRide.userId)).emit('location-update', ridePayload);
                        socket.to(roomNames.user(taxiRide.userId)).emit('ride_location_update', ridePayload);
                    }
                }
            } catch (taxiLocErr) {
                // non-fatal — food tracking path already ran
            }

            // ─── Scalable Persistence (BullMQ + Redis "Hot" Buffering) ───
            try {
                const { getTrackingQueue } = await import('../queues/index.js');
                const { getRedisClient } = await import('../config/redis.js');
                const trackingQueue = getTrackingQueue();
                const redis = getRedisClient();

                if (trackingQueue && redis) {
                    const coordString = JSON.stringify({ lat, lng, timestamp: now });
                    
                    // 1. Immediately buffer the newest location in high-speed Redis Hash (HOT storage)
                    await Promise.all([
                        redis.hSet('rider:locations:hot', String(userId), coordString),
                        redis.hSet('order:locations:hot', String(data.orderId), coordString)
                    ]);

                    // 2. Schedule a deferred MongoDB write (COLD storage)
                    // jobId debulks updates: if a job is already waiting, BullMQ ignores the new add()
                    // Delay (30s) ensures we don't spam MongoDB while the rider is moving fast
                    const syncJobId = `sync:loc:${data.orderId}`;
                    trackingQueue.add('sync-hot-locations', 
                        { userId, orderId: data.orderId }, 
                        { jobId: syncJobId, delay: 30000, removeOnComplete: true }
                    ).catch(e => logger.error(`BullMQ sync schedule failed: ${e.message}`));
                }
            } catch (err) {
                logger.error(`Real-time persistence layer error: ${err.message}`);
            }

            // ─── Firebase Realtime Database Sync (Cost Optimization) ───
            try {
                const db = getFirebaseDB();
                const lastFirebaseSyncAt = _lastFirebaseTrackingSync[data.orderId] || 0;
                const shouldSyncFirebase = now - lastFirebaseSyncAt >= 10000;

                if (db && shouldSyncFirebase) {
                    _lastFirebaseTrackingSync[data.orderId] = now;
                    // 1. Update order-specific tracking node
                    const orderRef = db.ref(`active_orders/${data.orderId}`);
                    orderRef.update({
                        lat,
                        lng,
                        boy_lat: lat,
                        boy_lng: lng,
                        heading,
                        speed,
                        accuracy,
                        polyline: data.polyline || null,
                        eta: payload.eta ?? null,
                        etaMinutes: payload.etaMinutes ?? null,
                        roadDistanceKm: payload.roadDistanceKm ?? null,
                        last_updated: now,
                        status: data.status || 'on_the_way'
                    }).catch(e => logger.error(`Firebase orderRef update error: ${e.message}`));

                    // 2. Update global delivery boy status node
                    const boyRef = db.ref(`delivery_boys/${userId}`);
                    boyRef.update({
                        lat,
                        lng,
                        accuracy,
                        last_updated: now,
                        status: 'online'
                    }).catch(e => logger.error(`Firebase boyRef update error: ${e.message}`));
                }
            } catch (err) {
                // Silently skip if Firebase not initialized yet
                logger.debug(`Firebase RTDB sync skipped: ${err.message}`);
            }
        });

        // Leave tracking room on user navigation away.
        socket.on('leave-tracking', (orderId) => {
            if (!orderId) return;
            const room = roomNames.tracking(orderId);
            socket.leave(room);
        });

        socket.on('disconnect', () => {
            logger.info(`Socket client disconnected: ${socket.id}`);
            if (role === 'DELIVERY_PARTNER') {
                logDeliverySocket('Delivery socket disconnected', {
                    socketId: socket.id,
                    deliveryPartnerId: String(userId || ''),
                });
            }
        });

        // Acknowledge a ring event so the watchdog stops escalating it.
        socket.on('ack_event', async (data) => {
            const eventId = typeof data === 'string' ? data : (data?.eventId || data?.event_id);
            if (!eventId) return;
            try {
                const { ackOrderEvent } = await import('../core/notifications/orderEvents.service.js');
                await ackOrderEvent(eventId);
            } catch (err) {
                logger.warn(`ack_event failed: ${err.message}`);
            }
        });

        // 🆕 Resync State on Reconnect
        socket.on('resync', async () => {
          try {
            if (role === 'DELIVERY_PARTNER') {
              logDeliverySocket('Resync requested', {
                socketId: socket.id,
                deliveryPartnerId: String(userId || ''),
              });
            }
            const { resyncState } = await import('../modules/food/orders/services/order.service.js');
            const state = await resyncState(userId, role);
            if (state.activeOrder) {
              const eventName = role === 'USER' ? 'order_state' : 'active_order';
              socket.emit(eventName, state.activeOrder);
              if (role === 'DELIVERY_PARTNER') {
                logDeliverySocket('Resync emitted active order', {
                  socketId: socket.id,
                  deliveryPartnerId: String(userId || ''),
                  orderId: String(
                    state.activeOrder?.orderId ||
                    state.activeOrder?.orderMongoId ||
                    ''
                  ),
                  eventName,
                });
              }
              
              // Re-emit OTP if user is in drop phase
              if (role === 'USER' && state.activeOrder.handoverOtp) {
                socket.emit('delivery_drop_otp', {
                  orderId: state.activeOrder.orderId,
                  otp: state.activeOrder.handoverOtp,
                  message: 'Share this OTP with your delivery partner.'
                });
              }
            }
            socket.emit('resync_complete', { timestamp: Date.now() });
            if (role === 'DELIVERY_PARTNER') {
              logDeliverySocket('Resync complete', {
                socketId: socket.id,
                deliveryPartnerId: String(userId || ''),
                hasActiveOrder: Boolean(state.activeOrder),
              });
            }
          } catch (err) {
            logger.error(`Resync failed for ${role}:${userId} — ${err.message}`);
          }
        });
    });



    logger.info('Socket.IO infrastructure initialized');
    return io;
};

/**
 * Returns the initialized Socket.IO instance.
 * @returns {Server | null}
 */
export const getIO = () => {
    if (!io) {
        logger.warn('Socket.IO not initialized');
    }
    return io;
};

export const rooms = roomNames;
