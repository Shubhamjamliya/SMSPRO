import express from 'express';
import {
  getFoodCartController,
  addFoodCartItemController,
  updateFoodCartItemController,
  removeFoodCartItemController,
  clearFoodCartController,
  setFoodCartCouponController,
} from '../controllers/foodCart.controller.js';
import { sensitiveActionRateLimiter } from '../../../../middleware/rateLimit.js';

const router = express.Router();

router.get('/', getFoodCartController);
router.post('/items', sensitiveActionRateLimiter, addFoodCartItemController);
router.patch('/items/:id', sensitiveActionRateLimiter, updateFoodCartItemController);
router.delete('/items/:id', sensitiveActionRateLimiter, removeFoodCartItemController);
router.delete('/clear', sensitiveActionRateLimiter, clearFoodCartController);
router.put('/coupon', sensitiveActionRateLimiter, setFoodCartCouponController);

export default router;
