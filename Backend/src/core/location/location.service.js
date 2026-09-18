import axios from 'axios';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { GeoCache } from './geoCache.model.js';

/**
 * Centralized location service.
 * Single place for: reverse geocoding, geocoding, place autocomplete/details,
 * road distance (Google Routes API) and haversine.
 * All Google calls are cached in Mongo (geo_cache) to control quota/cost.
 *
 * Canonical address object returned by geocoding functions:
 * {
 *   latitude, longitude,
 *   formattedAddress, addressLine,           // full display strings
 *   street, area, landmark, city, state, pincode, country,
 *   placeId
 * }
 */

const REVERSE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GEOCODE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DISTANCE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const GOOGLE_TIMEOUT_MS = 6000;

const getApiKey = () => config.googleMapsApiKey || '';

/* ===================== HAVERSINE (single source of truth) ===================== */
export function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isPointInPolygon(point, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lng;
        const xj = polygon[j].lat, yj = polygon[j].lng;
        const intersect = ((yi > point.lng) !== (yj > point.lng))
            && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

const isValidLatLng = (lat, lng) =>
    isFiniteNumber(lat) && isFiniteNumber(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Snap coordinates to a ~50m grid so nearby lookups share one cache entry. */
const gridKey = (lat, lng, precision = 4) => `${Number(lat).toFixed(precision)},${Number(lng).toFixed(precision)}`;

/* ===================== CACHE HELPERS ===================== */
const cacheGet = async (key) => {
    try {
        const doc = await GeoCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
        return doc?.payload ?? null;
    } catch (err) {
        logger.warn(`geo_cache read failed: ${err.message}`);
        return null;
    }
};

const cacheSet = async (key, kind, payload, ttlMs) => {
    try {
        await GeoCache.updateOne(
            { key },
            { $set: { kind, payload, expiresAt: new Date(Date.now() + ttlMs) } },
            { upsert: true }
        );
    } catch (err) {
        logger.warn(`geo_cache write failed: ${err.message}`);
    }
};

/* ===================== GOOGLE RESPONSE PARSING ===================== */
/** Map Google address_components into flat canonical fields. */
const parseAddressComponents = (components = []) => {
    const get = (...types) => {
        const c = components.find((x) => types.every((t) => x.types?.includes(t)));
        return c ? c.long_name : '';
    };
    const getAny = (...types) => {
        for (const t of types) {
            const v = get(t);
            if (v) return v;
        }
        return '';
    };

    const streetNumber = get('street_number');
    const route = get('route');
    const premise = getAny('premise', 'subpremise');
    const street = [streetNumber, premise, route].filter(Boolean).join(', ');

    return {
        street,
        area: getAny('sublocality_level_1', 'sublocality', 'neighborhood', 'sublocality_level_2'),
        landmark: getAny('point_of_interest', 'establishment'),
        city: getAny('locality', 'administrative_area_level_2'),
        state: get('administrative_area_level_1'),
        pincode: get('postal_code'),
        country: get('country')
    };
};

const toCanonicalFromGoogleResult = (result, latitude, longitude) => {
    const parts = parseAddressComponents(result.address_components || []);
    const formattedAddress = result.formatted_address || '';
    return {
        latitude,
        longitude,
        formattedAddress,
        addressLine: formattedAddress,
        placeId: result.place_id || '',
        ...parts
    };
};

/* ===================== REVERSE GEOCODE ===================== */
/**
 * lat/lng -> canonical address. Cached on a ~50m grid.
 * Returns null when the key is missing or Google has no result.
 */
export async function reverseGeocode(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!isValidLatLng(lat, lng)) return null;

    const key = `rev:${gridKey(lat, lng)}`;
    const cached = await cacheGet(key);
    if (cached) return cached;

    const apiKey = getApiKey();
    if (!apiKey) {
        logger.warn('reverseGeocode skipped: GOOGLE_MAPS_API_KEY not configured');
        return null;
    }

    try {
        const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: { latlng: `${lat},${lng}`, key: apiKey, language: 'en' },
            timeout: GOOGLE_TIMEOUT_MS
        });
        if (data.status !== 'OK' || !data.results?.length) {
            if (data.status !== 'ZERO_RESULTS') {
                logger.warn(`Google reverse geocode status: ${data.status} ${data.error_message || ''}`);
            }
            return null;
        }
        const canonical = toCanonicalFromGoogleResult(data.results[0], lat, lng);
        await cacheSet(key, 'reverse', canonical, REVERSE_CACHE_TTL_MS);
        return canonical;
    } catch (err) {
        logger.warn(`Google reverse geocode failed: ${err.message}`);
        return null;
    }
}

/* ===================== FORWARD GEOCODE ===================== */
/** Free-text address -> canonical address (with coordinates). Cached by normalized text. */
export async function geocodeAddress(addressText) {
    const text = String(addressText || '').trim();
    if (!text) return null;

    const key = `geo:${text.toLowerCase().replace(/\s+/g, ' ').slice(0, 200)}`;
    const cached = await cacheGet(key);
    if (cached) return cached;

    const apiKey = getApiKey();
    if (!apiKey) {
        logger.warn('geocodeAddress skipped: GOOGLE_MAPS_API_KEY not configured');
        return null;
    }

    try {
        const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: { address: text, key: apiKey, language: 'en', region: 'in' },
            timeout: GOOGLE_TIMEOUT_MS
        });
        if (data.status !== 'OK' || !data.results?.length) {
            if (data.status !== 'ZERO_RESULTS') {
                logger.warn(`Google geocode status: ${data.status} ${data.error_message || ''}`);
            }
            return null;
        }
        const first = data.results[0];
        const { lat, lng } = first.geometry?.location || {};
        if (!isValidLatLng(lat, lng)) return null;
        const canonical = toCanonicalFromGoogleResult(first, lat, lng);
        await cacheSet(key, 'geocode', canonical, GEOCODE_CACHE_TTL_MS);
        return canonical;
    } catch (err) {
        logger.warn(`Google geocode failed: ${err.message}`);
        return null;
    }
}

/* ===================== PLACES AUTOCOMPLETE / DETAILS ===================== */
/**
 * Search-as-you-type suggestions. Not cached (queries are highly variable and
 * session-token pricing makes autocomplete + details one billed session).
 */
export async function autocompletePlaces(input, { sessionToken, latitude, longitude } = {}) {
    const text = String(input || '').trim();
    if (text.length < 2) return [];

    const apiKey = getApiKey();
    if (!apiKey) return [];

    const params = {
        input: text,
        key: apiKey,
        language: 'en',
        components: 'country:in'
    };
    if (sessionToken) params.sessiontoken = String(sessionToken);
    if (isValidLatLng(Number(latitude), Number(longitude))) {
        params.location = `${latitude},${longitude}`;
        params.radius = 50000;
    }

    try {
        const { data } = await axios.get(
            'https://maps.googleapis.com/maps/api/place/autocomplete/json',
            { params, timeout: GOOGLE_TIMEOUT_MS }
        );
        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            logger.warn(`Places autocomplete status: ${data.status} ${data.error_message || ''}`);
            return [];
        }
        return (data.predictions || []).map((p) => ({
            placeId: p.place_id,
            description: p.description,
            mainText: p.structured_formatting?.main_text || p.description,
            secondaryText: p.structured_formatting?.secondary_text || ''
        }));
    } catch (err) {
        logger.warn(`Places autocomplete failed: ${err.message}`);
        return [];
    }
}

/** placeId -> canonical address (closes an autocomplete billing session). Cached. */
export async function getPlaceDetails(placeId, { sessionToken } = {}) {
    const id = String(placeId || '').trim();
    if (!id) return null;

    const key = `place:${id}`;
    const cached = await cacheGet(key);
    if (cached) return cached;

    const apiKey = getApiKey();
    if (!apiKey) return null;

    const params = {
        place_id: id,
        key: apiKey,
        language: 'en',
        fields: 'formatted_address,geometry,address_components,place_id,name'
    };
    if (sessionToken) params.sessiontoken = String(sessionToken);

    try {
        const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
            params,
            timeout: GOOGLE_TIMEOUT_MS
        });
        if (data.status !== 'OK' || !data.result) {
            logger.warn(`Place details status: ${data.status} ${data.error_message || ''}`);
            return null;
        }
        const result = data.result;
        const { lat, lng } = result.geometry?.location || {};
        if (!isValidLatLng(lat, lng)) return null;
        const canonical = toCanonicalFromGoogleResult(result, lat, lng);
        if (!canonical.landmark && result.name) canonical.landmark = result.name;
        await cacheSet(key, 'place', canonical, GEOCODE_CACHE_TTL_MS);
        return canonical;
    } catch (err) {
        logger.warn(`Place details failed: ${err.message}`);
        return null;
    }
}

/* ===================== ROAD DISTANCE MATRIX (Routes API) ===================== */
const MATRIX_MAX_DESTINATIONS = 25;

const distancePairKey = (oLat, oLng, dLat, dLng) =>
    `dist:${gridKey(oLat, oLng, 3)}:${gridKey(dLat, dLng, 3)}`; // ~100m grid

const roadResultFromMeters = (distanceMeters, duration) => {
    const durationSeconds = Number(String(duration || '').replace(/s$/i, ''));
    return {
        distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
        durationMinutes: Number.isFinite(durationSeconds)
            ? Math.max(1, Math.round(durationSeconds / 60))
            : null,
        source: 'google_routes'
    };
};

const callComputeRouteMatrix = async (origin, destinations, travelMode, apiKey) => {
    const { data } = await axios.post(
        'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
        {
            origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
            destinations: destinations.map((d) => ({
                waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } }
            })),
            travelMode,
            routingPreference: 'TRAFFIC_UNAWARE'
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition'
            },
            timeout: GOOGLE_TIMEOUT_MS + 4000
        }
    );
    return Array.isArray(data) ? data : [];
};

/**
 * Road distance from ONE origin to MANY destinations in a single billed
 * Distance Matrix call, with the same per-pair Mongo cache as getRoadDistance
 * (cached pairs cost nothing; only uncached pairs hit Google).
 *
 * @param {{lat:number,lng:number}} origin
 * @param {Array<{lat:number,lng:number}>} destinations (max 25)
 * @returns {Promise<Array<{distanceKm:number,durationMinutes:number|null,source:string}|null>>}
 *          aligned with `destinations`; null for invalid coordinates.
 */
export async function getRoadDistanceMatrix(origin, destinations = []) {
    const oLat = Number(origin?.lat);
    const oLng = Number(origin?.lng);
    const list = (Array.isArray(destinations) ? destinations : []).slice(0, MATRIX_MAX_DESTINATIONS);
    const results = new Array(list.length).fill(null);
    if (!isValidLatLng(oLat, oLng)) return results;

    const haversineFallback = (dLat, dLng) => ({
        distanceKm: Math.round(haversineKm(oLat, oLng, dLat, dLng) * 100) / 100,
        durationMinutes: null,
        source: 'haversine'
    });

    // 1) Resolve from cache; collect misses.
    const misses = []; // { index, lat, lng, key }
    await Promise.all(
        list.map(async (dest, index) => {
            const dLat = Number(dest?.lat);
            const dLng = Number(dest?.lng);
            if (!isValidLatLng(dLat, dLng)) return;
            const key = distancePairKey(oLat, oLng, dLat, dLng);
            const cached = await cacheGet(key);
            if (cached) {
                results[index] = cached;
            } else {
                misses.push({ index, lat: dLat, lng: dLng, key });
            }
        })
    );
    if (misses.length === 0) return results;

    const apiKey = getApiKey();
    if (!apiKey) {
        misses.forEach((m) => {
            results[m.index] = haversineFallback(m.lat, m.lng);
        });
        return results;
    }

    // 2) One matrix call for all misses (TWO_WHEELER, retry once with DRIVE).
    let elements = [];
    try {
        elements = await callComputeRouteMatrix({ lat: oLat, lng: oLng }, misses, 'TWO_WHEELER', apiKey);
    } catch (err) {
        const message = err?.response?.data?.error?.message || err.message;
        if (err?.response?.status === 400 && /TWO_WHEELER|travel.?mode/i.test(String(message))) {
            try {
                elements = await callComputeRouteMatrix({ lat: oLat, lng: oLng }, misses, 'DRIVE', apiKey);
            } catch (retryErr) {
                logger.warn(`Route matrix DRIVE retry failed: ${retryErr.message}`);
            }
        } else {
            logger.warn(`Route matrix failed (falling back to haversine): ${message}`);
        }
    }

    const byDestIndex = new Map();
    for (const el of elements) {
        if (el && isFiniteNumber(el.distanceMeters) && (el.condition === undefined || el.condition === 'ROUTE_EXISTS')) {
            byDestIndex.set(Number(el.destinationIndex ?? 0), el);
        }
    }

    await Promise.all(
        misses.map(async (m, i) => {
            const el = byDestIndex.get(i);
            if (el) {
                const value = roadResultFromMeters(el.distanceMeters, el.duration);
                results[m.index] = value;
                await cacheSet(m.key, 'distance', value, DISTANCE_CACHE_TTL_MS);
            } else {
                results[m.index] = haversineFallback(m.lat, m.lng);
            }
        })
    );

    return results;
}

/* ===================== ROAD DISTANCE (Routes API) ===================== */
/**
 * Road distance + ETA between two points using the Google Routes API.
 * Falls back to plain haversine when the API key/quota is unavailable so
 * pricing keeps working exactly as before the road-distance rollout.
 *
 * @returns {{ distanceKm: number, durationMinutes: number|null, source: 'google_routes'|'haversine' }|null}
 */
export async function getRoadDistance(origin, destination) {
    const oLat = Number(origin?.lat);
    const oLng = Number(origin?.lng);
    const dLat = Number(destination?.lat);
    const dLng = Number(destination?.lng);
    if (!isValidLatLng(oLat, oLng) || !isValidLatLng(dLat, dLng)) return null;

    const airKm = haversineKm(oLat, oLng, dLat, dLng);
    const fallback = {
        distanceKm: Math.round(airKm * 100) / 100,
        durationMinutes: null,
        source: 'haversine'
    };

    // Same point / trivially close — skip the API.
    if (airKm < 0.05) return { ...fallback, source: 'google_routes', durationMinutes: 1 };

    const key = `dist:${gridKey(oLat, oLng, 3)}:${gridKey(dLat, dLng, 3)}`; // ~100m grid
    const cached = await cacheGet(key);
    if (cached) return cached;

    const apiKey = getApiKey();
    if (!apiKey) return fallback;

    try {
        const { data } = await axios.post(
            'https://routes.googleapis.com/directions/v2:computeRoutes',
            {
                origin: { location: { latLng: { latitude: oLat, longitude: oLng } } },
                destination: { location: { latLng: { latitude: dLat, longitude: dLng } } },
                travelMode: 'TWO_WHEELER',
                routingPreference: 'TRAFFIC_UNAWARE'
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
                },
                timeout: GOOGLE_TIMEOUT_MS
            }
        );

        const route = data?.routes?.[0];
        if (!route || !isFiniteNumber(route.distanceMeters)) return fallback;

        const durationSeconds = Number(String(route.duration || '').replace(/s$/i, ''));
        const result = {
            distanceKm: Math.round((route.distanceMeters / 1000) * 100) / 100,
            durationMinutes: Number.isFinite(durationSeconds)
                ? Math.max(1, Math.round(durationSeconds / 60))
                : null,
            source: 'google_routes'
        };
        await cacheSet(key, 'distance', result, DISTANCE_CACHE_TTL_MS);
        return result;
    } catch (err) {
        // TWO_WHEELER is not available in every region/project — retry once with DRIVE.
        const status = err?.response?.status;
        const message = err?.response?.data?.error?.message || err.message;
        if (status === 400 && /TWO_WHEELER|travel.?mode/i.test(String(message))) {
            try {
                const { data } = await axios.post(
                    'https://routes.googleapis.com/directions/v2:computeRoutes',
                    {
                        origin: { location: { latLng: { latitude: oLat, longitude: oLng } } },
                        destination: { location: { latLng: { latitude: dLat, longitude: dLng } } },
                        travelMode: 'DRIVE',
                        routingPreference: 'TRAFFIC_UNAWARE'
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Goog-Api-Key': apiKey,
                            'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
                        },
                        timeout: GOOGLE_TIMEOUT_MS
                    }
                );
                const route = data?.routes?.[0];
                if (route && isFiniteNumber(route.distanceMeters)) {
                    const durationSeconds = Number(String(route.duration || '').replace(/s$/i, ''));
                    const result = {
                        distanceKm: Math.round((route.distanceMeters / 1000) * 100) / 100,
                        durationMinutes: Number.isFinite(durationSeconds)
                            ? Math.max(1, Math.round(durationSeconds / 60))
                            : null,
                        source: 'google_routes'
                    };
                    await cacheSet(key, 'distance', result, DISTANCE_CACHE_TTL_MS);
                    return result;
                }
            } catch (retryErr) {
                logger.warn(`Routes API DRIVE retry failed: ${retryErr.message}`);
            }
        } else {
            logger.warn(`Routes API failed (falling back to haversine): ${message}`);
        }
        return fallback;
    }
}
