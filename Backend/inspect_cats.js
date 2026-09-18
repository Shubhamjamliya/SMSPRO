import mongoose from 'mongoose';
import { FoodCategory } from './src/modules/food/admin/models/category.model.js';
import { connectDB } from './src/config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkCategories() {
  await connectDB();
  const cats = await FoodCategory.find({}).lean();
  console.log("Categories:", cats.map(c => ({
    name: c.name,
    isActive: c.isActive,
    approvalStatus: c.approvalStatus,
    isApproved: c.isApproved
  })));
  process.exit(0);
}

checkCategories();
