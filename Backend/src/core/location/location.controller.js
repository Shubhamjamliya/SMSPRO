import { sendResponse, sendError } from '../../utils/response.js';
import {
    reverseGeocode,
    geocodeAddress,
    autocompletePlaces,
    getPlaceDetails,
    getRoadDistance,
    getRoadDistanceMatrix
} from './location.service.js';

/** GET /location/reverse-geocode?lat=..&lng=.. */
export const reverseGeocodeController = async (req, res, next) => {
    try {
        const lat = Number(req.query.lat ?? req.query.latitude);
        const lng = Number(req.query.lng ?? req.query.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return sendError(res, 400, 'lat and lng query parameters are required');
        }
        const address = await reverseGeocode(lat, lng);
        if (!address) return sendError(res, 404, 'No address found for these coordinates');
        return sendResponse(res, 200, 'Address resolved', { address });
    } catch (err) {
        next(err);
    }
};

/** GET /location/geocode?address=.. */
export const geocodeController = async (req, res, next) => {
    try {
        const text = String(req.query.address || '').trim();
        if (!text) return sendError(res, 400, 'address query parameter is required');
        const address = await geocodeAddress(text);
        if (!address) return sendError(res, 404, 'No location found for the provided address');
        return sendResponse(res, 200, 'Address geocoded', { address });
    } catch (err) {
        next(err);
    }
};

/** GET /location/autocomplete?input=..&sessiontoken=..&lat=..&lng=.. */
export const autocompleteController = async (req, res, next) => {
    try {
        const input = String(req.query.input || '').trim();
        if (!input) return sendError(res, 400, 'input query parameter is required');
        const suggestions = await autocompletePlaces(input, {
            sessionToken: req.query.sessiontoken || req.query.sessionToken,
            latitude: req.query.lat,
            longitude: req.query.lng
        });
        return sendResponse(res, 200, 'Suggestions retrieved', { suggestions });
    } catch (err) {
        next(err);
    }
};

/** GET /location/place-details?placeId=..&sessiontoken=.. */
export const placeDetailsController = async (req, res, next) => {
    try {
        const placeId = String(req.query.placeId || req.query.place_id || '').trim();
        if (!placeId) return sendError(res, 400, 'placeId query parameter is required');
        const address = await getPlaceDetails(placeId, {
            sessionToken: req.query.sessiontoken || req.query.sessionToken
        });
        if (!address) return sendError(res, 404, 'Place not found');
        return sendResponse(res, 200, 'Place details retrieved', { address });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /location/road-distance-matrix
 * body: { origin: {lat,lng}, destinations: [{lat,lng}, ...] } (max 25)
 * -> { distances: [{distanceKm,durationMinutes,source}|null, ...] } aligned with input.
 */
export const roadDistanceMatrixController = async (req, res, next) => {
    try {
        const origin = req.body?.origin;
        const destinations = req.body?.destinations;
        if (!origin || !Number.isFinite(Number(origin.lat)) || !Number.isFinite(Number(origin.lng))) {
            return sendError(res, 400, 'origin {lat, lng} is required');
        }
        if (!Array.isArray(destinations) || destinations.length === 0) {
            return sendError(res, 400, 'destinations array is required');
        }
        if (destinations.length > 25) {
            return sendError(res, 400, 'Maximum 25 destinations per request');
        }
        const distances = await getRoadDistanceMatrix(
            { lat: Number(origin.lat), lng: Number(origin.lng) },
            destinations.map((d) => ({ lat: Number(d?.lat), lng: Number(d?.lng) }))
        );
        return sendResponse(res, 200, 'Distances calculated', { distances });
    } catch (err) {
        next(err);
    }
};

/** GET /location/road-distance?fromLat=..&fromLng=..&toLat=..&toLng=.. */
export const roadDistanceController = async (req, res, next) => {
    try {
        const fromLat = Number(req.query.fromLat);
        const fromLng = Number(req.query.fromLng);
        const toLat = Number(req.query.toLat);
        const toLng = Number(req.query.toLng);
        if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
            return sendError(res, 400, 'fromLat, fromLng, toLat and toLng are required numbers');
        }
        const distance = await getRoadDistance(
            { lat: fromLat, lng: fromLng },
            { lat: toLat, lng: toLng }
        );
        if (!distance) return sendError(res, 400, 'Invalid coordinates');
        return sendResponse(res, 200, 'Distance calculated', distance);
    } catch (err) {
        next(err);
    }
};
