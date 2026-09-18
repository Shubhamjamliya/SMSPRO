import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodAdmin } from '../src/core/admin/admin.model.js';
import { AdminRole } from '../src/core/admin/role.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;

async function seed() {
    if (!mongoUrl) {
        throw new Error('No MongoDB URI found in environment. Please check Backend/.env');
    }
    
    const maskedUrl = mongoUrl.replace(/\/\/.*@/, "//***:***@");
    console.log(`Connecting to database: ${maskedUrl}`);
    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB.');

    // 1. Ensure a Super Admin Role exists
    let superAdminRole = await AdminRole.findOne({ roleName: 'Super Admin' });
    if (!superAdminRole) {
        console.log('Super Admin role not found. Creating default Super Admin role...');
        superAdminRole = await AdminRole.create({
            roleName: 'Super Admin',
            description: 'Full administrative access role',
            status: 'active',
            isDefault: true,
            permissions: {}
        });
        console.log(`Created Super Admin role with ID: ${superAdminRole._id}`);
    } else {
        console.log(`Super Admin role already exists with ID: ${superAdminRole._id}`);
    }

    // 2. Check if any admin exists
    const adminCount = await FoodAdmin.countDocuments();
    if (adminCount > 0) {
        console.log(`Admins already exist in the database (Count: ${adminCount}). Skipping seeding.`);
        const existingAdmins = await FoodAdmin.find({}).select('email role isActive').lean();
        console.log('Existing Admins:', existingAdmins);
    } else {
        // Read credentials from env or fallback to defaults
        const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@quickdrop.com';
        const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
        const adminName = process.env.SEED_ADMIN_NAME || 'Super Admin';
        const adminPhone = process.env.SEED_ADMIN_PHONE || '9999999999';

        console.log(`No admins found. Creating default super admin...`);
        console.log(`Email: ${adminEmail}`);
        console.log(`Name: ${adminName}`);
        console.log(`Role: ADMIN`);

        const newAdmin = await FoodAdmin.create({
            email: adminEmail.toLowerCase().trim(),
            password: adminPassword,
            name: adminName,
            phone: adminPhone,
            role: 'ADMIN',
            isActive: true,
            servicesAccess: ['food', 'quickCommerce'],
            adminRoleId: superAdminRole._id
        });

        console.log('Super admin created successfully!');
        console.log(`ID: ${newAdmin._id}`);
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
}

seed().catch(err => {
    console.error('Error seeding admin:', err);
    mongoose.disconnect();
    process.exit(1);
});
