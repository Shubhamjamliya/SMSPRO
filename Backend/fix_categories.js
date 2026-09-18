import mongoose from 'mongoose';
import { FoodCategory } from './src/modules/food/admin/models/category.model.js';
import { connectDB } from './src/config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function fixStuckCategories() {
  await connectDB();
  const res = await FoodCategory.updateMany(
    { isActive: true, approvalStatus: 'pending' },
    { $set: { approvalStatus: 'approved', isApproved: true } }
  );
  console.log(`Fixed ${res.modifiedCount} stuck categories.`);
  process.exit(0);
}

fixStuckCategories();
