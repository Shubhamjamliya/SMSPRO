/**
 * Seeds restaurant-owned categories (the kind created from the restaurant dashboard).
 *
 * - Ensures each target restaurant exists in the DB first (created from the Indore
 *   fixtures with status 'approved' when missing).
 * - Creates 24 categories across 8 restaurants of different types. Category `type`
 *   follows the restaurant's primary cuisine and `foodTypeScope` respects the
 *   pure-veg rule (pure veg restaurants only get Veg categories).
 * - Images are Wikimedia Commons URLs already verified in data/food-images.js,
 *   picked to match each category name.
 * - Idempotent: existing restaurants/categories are reused, never duplicated.
 *
 * Usage:
 *   node scripts/seed-restaurant-categories.js            # categories seeded as approved
 *   node scripts/seed-restaurant-categories.js --pending  # seeded as pending (real restaurant flow)
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { INDORE_RESTAURANTS } from './data/indore-restaurants.seed.js';
import { CATEGORY_IMAGES, DISH_IMAGES } from './data/food-images.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const seedAsPending = process.argv.includes('--pending');

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Category plan per restaurant. `type` mirrors the restaurant's primary cuisine,
 * `foodTypeScope` respects pureVegRestaurant, and every image matches the category name.
 */
const RESTAURANT_CATEGORY_PLAN = [
  {
    restaurantName: "Vipi's Caffe", // Cafe / Continental / Italian
    categories: [
      { name: 'Coffee & Beverages', type: 'Cafe', foodTypeScope: 'Both', image: DISH_IMAGES.Cappuccino },
      { name: 'Pasta & Garlic Bread', type: 'Cafe', foodTypeScope: 'Both', image: DISH_IMAGES['Penne Alfredo'] },
      { name: 'Desserts & Brownies', type: 'Cafe', foodTypeScope: 'Both', image: DISH_IMAGES['Chocolate Brownie'] },
    ],
  },
  {
    restaurantName: 'Rajwada Thali House', // Pure veg thali
    categories: [
      { name: 'Special Thalis', type: 'Thali', foodTypeScope: 'Veg', image: DISH_IMAGES['Rajwada Special Thali'] },
      { name: 'Paneer Specials', type: 'Thali', foodTypeScope: 'Veg', image: DISH_IMAGES['Paneer Butter Masala'] },
      { name: 'Tandoori Breads', type: 'Thali', foodTypeScope: 'Veg', image: CATEGORY_IMAGES['Breads & Rice'] },
    ],
  },
  {
    restaurantName: 'Vijay Nagar Pizza Hub', // Pizza / Fast Food
    categories: [
      { name: 'Veg Pizzas', type: 'Pizza', foodTypeScope: 'Veg', image: DISH_IMAGES['Margherita Pizza'] },
      { name: 'Non-Veg Pizzas', type: 'Pizza', foodTypeScope: 'Non-Veg', image: DISH_IMAGES['Farmhouse Pizza'] },
      { name: 'Garlic Breadsticks & Sides', type: 'Pizza', foodTypeScope: 'Veg', image: DISH_IMAGES['Garlic Bread'] },
    ],
  },
  {
    restaurantName: 'Bhawarkua Biryani Point', // Biryani / Mughlai
    categories: [
      { name: 'Chicken Biryani', type: 'Biryani', foodTypeScope: 'Non-Veg', image: DISH_IMAGES['Chicken Dum Biryani'] },
      { name: 'Mutton Biryani', type: 'Biryani', foodTypeScope: 'Non-Veg', image: DISH_IMAGES['Mutton Biryani'] },
      { name: 'Veg Biryani', type: 'Biryani', foodTypeScope: 'Veg', image: DISH_IMAGES['Veg Handi Biryani'] },
    ],
  },
  {
    restaurantName: 'MG Road Multicuisine', // Chinese / North Indian
    categories: [
      { name: 'Hakka Noodles', type: 'Chinese', foodTypeScope: 'Both', image: DISH_IMAGES['Veg Hakka Noodles'] },
      { name: 'Fried Rice', type: 'Chinese', foodTypeScope: 'Both', image: DISH_IMAGES['Veg Fried Rice'] },
      { name: 'Manchurian', type: 'Chinese', foodTypeScope: 'Both', image: DISH_IMAGES['Gobi Manchurian Dry'] },
    ],
  },
  {
    restaurantName: 'Palasia South Indian Cafe', // Pure veg South Indian
    categories: [
      { name: 'Dosa Corner', type: 'South Indian', foodTypeScope: 'Veg', image: DISH_IMAGES['Masala Dosa'] },
      { name: 'Idli & Vada', type: 'South Indian', foodTypeScope: 'Veg', image: DISH_IMAGES['Idli Sambar (2 pcs)'] },
      { name: 'Filter Coffee & Beverages', type: 'South Indian', foodTypeScope: 'Veg', image: DISH_IMAGES['Filter Coffee'] },
    ],
  },
  {
    restaurantName: 'Chappan Dukan Chaat Corner', // Pure veg chaat / street food
    categories: [
      { name: 'Chaat Specials', type: 'Street Food', foodTypeScope: 'Veg', image: CATEGORY_IMAGES['Snacks & Chaat'] },
      { name: 'Samosa & Snacks', type: 'Street Food', foodTypeScope: 'Veg', image: DISH_IMAGES['Samosa Chaat'] },
      { name: 'Jalebi & Sweets', type: 'Street Food', foodTypeScope: 'Veg', image: DISH_IMAGES.Jalebi },
    ],
  },
  {
    restaurantName: 'Rau Highway Dhaba', // Punjabi / North Indian dhaba
    categories: [
      { name: 'Dal & Veg Curries', type: 'North Indian', foodTypeScope: 'Veg', image: DISH_IMAGES['Dal Makhani Combo'] },
      { name: 'Tandoori Non-Veg', type: 'North Indian', foodTypeScope: 'Non-Veg', image: DISH_IMAGES['Butter Chicken'] },
      { name: 'Rotis & Naan', type: 'North Indian', foodTypeScope: 'Veg', image: DISH_IMAGES['Tandoori Roti'] },
    ],
  },
];

/** Finds the restaurant by name; creates it from the Indore fixture when missing. */
async function ensureRestaurant(restaurantName) {
  const normalized = normalizeName(restaurantName);
  let restaurant = await FoodRestaurant.findOne({
    restaurantNameNormalized: normalized,
    isDeleted: { $ne: true },
  });
  if (restaurant) {
    console.log(`Using existing restaurant: ${restaurant.restaurantName} (${restaurant.restaurantId || restaurant._id})`);
    return restaurant;
  }

  const fixture = INDORE_RESTAURANTS.find((r) => normalizeName(r.restaurantName) === normalized);
  if (!fixture) {
    console.warn(`Skipping "${restaurantName}": not in DB and no fixture available to create it.`);
    return null;
  }

  restaurant = await FoodRestaurant.create({
    restaurantName: fixture.restaurantName,
    ownerName: fixture.ownerName,
    ownerPhone: fixture.ownerPhone,
    primaryContactNumber: fixture.ownerPhone,
    pureVegRestaurant: fixture.pureVegRestaurant,
    cuisines: fixture.cuisines,
    area: fixture.area,
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: fixture.pincode,
    addressLine1: fixture.addressLine1,
    landmark: fixture.landmark,
    location: { latitude: fixture.latitude, longitude: fixture.longitude },
    openingTime: fixture.openingTime,
    closingTime: fixture.closingTime,
    openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    estimatedDeliveryTime: fixture.estimatedDeliveryTime,
    featuredDish: fixture.featuredDish,
    featuredPrice: fixture.featuredPrice,
    offer: fixture.offer,
    rating: fixture.rating,
    totalRatings: fixture.totalRatings,
    status: 'approved',
    approvedAt: new Date(),
    isVisibleToUsers: true,
    isAcceptingOrders: true,
  });
  console.log(`Created restaurant: ${restaurant.restaurantName} (${restaurant.restaurantId})`);
  return restaurant;
}

/** Mirrors createRestaurantCategory() in restaurantCategory.service.js. */
async function ensureCategory(restaurant, categoryFixture, sortOrder) {
  // Guard against the pure-veg rule enforced by the restaurant service.
  if (restaurant.pureVegRestaurant && categoryFixture.foodTypeScope !== 'Veg') {
    console.warn(`Skipping "${categoryFixture.name}" for ${restaurant.restaurantName}: pure veg restaurants can only have Veg categories.`);
    return { status: 'skipped' };
  }

  const existing = await FoodCategory.findOne({
    restaurantId: restaurant._id,
    name: { $regex: `^${categoryFixture.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  })
    .select('_id name')
    .lean();
  if (existing) {
    console.log(`  Category exists: ${existing.name}`);
    return { status: 'existing' };
  }

  const now = new Date();
  const doc = await FoodCategory.create({
    name: categoryFixture.name,
    image: categoryFixture.image || '',
    type: categoryFixture.type || '',
    foodTypeScope: categoryFixture.foodTypeScope,
    isActive: true,
    sortOrder,
    restaurantId: restaurant._id,
    createdByRestaurantId: restaurant._id,
    approvalStatus: seedAsPending ? 'pending' : 'approved',
    isApproved: !seedAsPending,
    rejectionReason: '',
    requestedAt: now,
    approvedAt: seedAsPending ? undefined : now,
    zoneId: restaurant.zoneId || undefined,
  });
  console.log(`  Created category: ${doc.name} [${doc.foodTypeScope}] (${doc.approvalStatus})`);
  return { status: 'created' };
}

async function run() {
  if (!mongoUrl) {
    console.error('MONGODB_URI (or MONGO_URI) is not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  console.log(`Connected to MongoDB. Seeding categories as ${seedAsPending ? 'PENDING' : 'APPROVED'}...\n`);

  const totals = { created: 0, existing: 0, skipped: 0 };

  for (const plan of RESTAURANT_CATEGORY_PLAN) {
    const restaurant = await ensureRestaurant(plan.restaurantName);
    if (!restaurant) {
      totals.skipped += plan.categories.length;
      continue;
    }

    for (let i = 0; i < plan.categories.length; i += 1) {
      const { status } = await ensureCategory(restaurant, plan.categories[i], i + 1);
      totals[status] += 1;
    }
    console.log('');
  }

  console.log(`Done. Categories created: ${totals.created}, already existed: ${totals.existing}, skipped: ${totals.skipped}.`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Seed failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
