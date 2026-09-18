import express from 'express';
import { searchController, listAdminCategoriesController } from '../controllers/search.controller.js';
import { cacheResponse } from '../../../../middleware/cache.js';

const router = express.Router();

/**
 * Unified Search Endpoint
 * GET /api/v1/food/search/unified
 * Short TTL: absorbs bursts of identical queries (e.g. many users searching the
 * same term in the same zone) while keeping staleness bounded, since results
 * are not explicitly invalidated when menus/restaurants change.
 */
router.get('/unified', cacheResponse(60, 'search_unified'), searchController);

/**
 * Admin Categories Only Endpoint (to avoid restaurant-created ones as requested)
 * GET /api/v1/food/search/categories/admin
 */
router.get('/categories/admin', cacheResponse(300, 'search_categories_admin'), listAdminCategoriesController);

export default router;
