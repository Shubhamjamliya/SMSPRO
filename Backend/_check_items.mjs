import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;
await mongoose.connect(uri);

const restaurants = mongoose.connection.collection('food_restaurants');
const items = mongoose.connection.collection('food_items');

const r = await restaurants.findOne({ $or: [ { slug: /palasia-south-indian-cafe/i }, { restaurantName: /palasia.*south.*indian/i } ] });
console.log('restaurant:', r ? { id: r._id, name: r.restaurantName, slug: r.slug } : 'NOT FOUND');

if (r) {
  const list = await items.find({ restaurantId: r._id }).project({ name:1, isAvailable:1, approvalStatus:1, categoryId:1, categoryName:1, requestedAt:1, approvedAt:1 }).toArray();
  console.log('total items:', list.length);
  console.log(JSON.stringify(list, null, 2));
}
await mongoose.disconnect();
