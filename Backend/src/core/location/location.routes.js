import { Router } from 'express';
import {
    reverseGeocodeController,
    geocodeController,
    autocompleteController,
    placeDetailsController,
    roadDistanceController,
    roadDistanceMatrixController
} from './location.controller.js';

const router = Router();

// Public, read-only geo endpoints shared by all modules (food, quick-commerce, porter).
router.get('/reverse-geocode', reverseGeocodeController);
router.get('/geocode', geocodeController);
router.get('/autocomplete', autocompleteController);
router.get('/place-details', placeDetailsController);
router.get('/road-distance', roadDistanceController);
router.post('/road-distance-matrix', roadDistanceMatrixController);

export default router;
