import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { upsertOutletTimingsForRestaurant } from '../src/modules/food/restaurant/services/outletTimings.service.js';
import {
  GLOBAL_CATEGORIES,
  INDORE_RESTAURANTS,
  INDORE_ZONE,
} from './data/indore-restaurants.seed.js';
import { RESTAURANT_IMAGES } from './data/food-images.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizePhoneLast10 = (value) =>
  String(value || '')
    .replace(/\D/g, '')
    .slice(-10);

async function ensureIndoreZone() {
  let zone = await FoodZone.findOne({
    $or: [{ name: INDORE_ZONE.name }, { zoneName: INDORE_ZONE.name }],
  }).lean();

  if (!zone) {
    zone = await FoodZone.create(INDORE_ZONE);
    console.log(`Created zone: ${zone.name} (${zone._id})`);
    return zone;
  }

  console.log(`Using existing zone: ${zone.name} (${zone._id})`);
  return zone;
}

async function ensureCategories() {
  const categoryMap = new Map();

  for (const category of GLOBAL_CATEGORIES) {
    let doc = await FoodCategory.findOne({
      name: category.name,
      restaurantId: { $exists: false },
    });

    if (!doc) {
      doc = await FoodCategory.create({
        ...category,
        approvalStatus: 'approved',
        isApproved: true,
        approvedAt: new Date(),
        isActive: true,
      });
      console.log(`Created category: ${doc.name}`);
    } else if (category.image && doc.image !== category.image) {
      doc.image = category.image;
      await doc.save();
      console.log(`Updated category image: ${doc.name}`);
    }

    categoryMap.set(doc.name, doc);
  }

  return categoryMap;
}

function buildRestaurantDoc(fixture, zoneId) {
  const {
    restaurantName,
    ownerName,
    ownerPhone,
    pureVegRestaurant,
    cuisines,
    area,
    addressLine1,
    landmark,
    pincode,
    latitude,
    longitude,
    openingTime,
    closingTime,
    estimatedDeliveryTime,
    featuredDish,
    featuredPrice,
    offer,
    rating,
    totalRatings,
  } = fixture;

  const formattedAddress = `${addressLine1}, ${area}, Indore, Madhya Pradesh ${pincode}`;
  const media = RESTAURANT_IMAGES[restaurantName] || {};

  return {
    restaurantName,
    ownerName,
    ownerPhone,
    primaryContactNumber: ownerPhone,
    pureVegRestaurant,
    cuisines,
    area,
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode,
    addressLine1,
    landmark,
    zoneId,
    openingTime,
    closingTime,
    openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    estimatedDeliveryTime,
    estimatedDeliveryTimeMinutes: parseInt(String(estimatedDeliveryTime).match(/\d+/)?.[0] || '30', 10),
    featuredDish,
    featuredPrice,
    offer,
    rating,
    totalRatings,
    isAcceptingOrders: true,
    isActive: true,
    status: 'approved',
    approvedAt: new Date(),
    profileImage: media.profile || '',
    coverImages: Array.isArray(media.cover) ? media.cover : [],
    menuImages: Array.isArray(media.menu) ? media.menu : [],
    location: {
      type: 'Point',
      coordinates: [longitude, latitude],
      latitude,
      longitude,
      formattedAddress,
      address: formattedAddress,
      addressLine1,
      area,
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode,
      landmark,
    },
  };
}

async function ensureRestaurant(fixture, zoneId) {
  const normalizedName = normalizeName(fixture.restaurantName);
  const phoneLast10 = normalizePhoneLast10(fixture.ownerPhone);

  let restaurant = await FoodRestaurant.findOne({
    restaurantNameNormalized: normalizedName,
    ownerPhoneLast10: phoneLast10,
  });

  if (restaurant) {
    const media = RESTAURANT_IMAGES[fixture.restaurantName] || {};
    const nextProfile = media.profile || restaurant.profileImage;
    const nextCover = Array.isArray(media.cover) && media.cover.length > 0 ? media.cover : restaurant.coverImages;
    const nextMenu = Array.isArray(media.menu) && media.menu.length > 0 ? media.menu : restaurant.menuImages;

    const imagesChanged =
      nextProfile !== restaurant.profileImage ||
      JSON.stringify(nextCover || []) !== JSON.stringify(restaurant.coverImages || []) ||
      JSON.stringify(nextMenu || []) !== JSON.stringify(restaurant.menuImages || []);

    if (imagesChanged) {
      restaurant.profileImage = nextProfile;
      restaurant.coverImages = nextCover;
      restaurant.menuImages = nextMenu;
      await restaurant.save();
      console.log(`Updated restaurant images: ${fixture.restaurantName}`);
    } else {
      console.log(`Restaurant already exists: ${fixture.restaurantName}`);
    }
    return restaurant;
  }

  restaurant = await FoodRestaurant.create(buildRestaurantDoc(fixture, zoneId));
  console.log(`Created restaurant: ${fixture.restaurantName} (${restaurant._id})`);
  return restaurant;
}

async function ensureMenuItems(restaurant, menuItems, categoryMap, pureVegRestaurant) {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of menuItems) {
    if (pureVegRestaurant && item.foodType === 'Non-Veg') {
      skipped += 1;
      continue;
    }

    const existing = await FoodItem.findOne({
      restaurantId: restaurant._id,
      name: item.name,
    });

    if (existing) {
      if (item.image && existing.image !== item.image) {
        existing.image = item.image;
        existing.images = item.image ? [item.image] : [];
        await existing.save();
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const category = categoryMap.get(item.category);
    if (!category) {
      console.warn(`Category not found for item "${item.name}": ${item.category}`);
      continue;
    }

    await FoodItem.create({
      restaurantId: restaurant._id,
      categoryId: category._id,
      categoryName: category.name,
      name: item.name,
      description: item.description || '',
      price: item.price,
      otherPrice: item.otherPrice || 0,
      image: item.image || '',
      images: item.image ? [item.image] : [],
      foodType: item.foodType === 'Veg' ? 'Veg' : 'Non-Veg',
      isAvailable: true,
      preparationTime: item.preparationTime || '',
      approvalStatus: 'approved',
      approvedAt: new Date(),
    });
    created += 1;
  }

  console.log(`  Menu for ${restaurant.restaurantName}: ${created} created, ${updated} updated, ${skipped} unchanged`);
}

async function seed() {
  if (!mongoUrl) {
    throw new Error('No MongoDB URI found. Set MONGODB_URI or MONGO_URI in Backend/.env');
  }

  const maskedUrl = mongoUrl.replace(/\/\/.*@/, '//***:***@');
  console.log(`Connecting to database: ${maskedUrl}`);
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB.');

  const zone = await ensureIndoreZone();
  const categoryMap = await ensureCategories();

  let restaurantsCreated = 0;
  let restaurantsSkipped = 0;

  for (const fixture of INDORE_RESTAURANTS) {
    const before = await FoodRestaurant.countDocuments({
      restaurantNameNormalized: normalizeName(fixture.restaurantName),
      ownerPhoneLast10: normalizePhoneLast10(fixture.ownerPhone),
    });

    const restaurant = await ensureRestaurant(fixture, zone._id);
    if (before === 0) restaurantsCreated += 1;
    else restaurantsSkipped += 1;

    await upsertOutletTimingsForRestaurant(restaurant._id, fixture.outletTimings);
    await ensureMenuItems(restaurant, fixture.menu, categoryMap, fixture.pureVegRestaurant);
  }

  console.log('\nSeed complete.');
  console.log(`Zone: ${zone.name} (${zone._id})`);
  console.log(`Categories: ${categoryMap.size}`);
  console.log(`Restaurants created: ${restaurantsCreated}, skipped (already existed): ${restaurantsSkipped}`);
  console.log(`Total Indore fixtures: ${INDORE_RESTAURANTS.length}`);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

seed().catch((err) => {
  console.error('Error seeding Indore restaurants:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
