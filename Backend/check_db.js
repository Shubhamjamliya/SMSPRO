import mongoose from 'mongoose';
mongoose.connect('mongodb://127.0.0.1:27017/just_order').then(async () => {
    // check restaurants
    const count = await mongoose.connection.db.collection('food_restaurants').countDocuments();
    console.log("Total food_restaurants:", count);
    
    const active = await mongoose.connection.db.collection('food_restaurants').countDocuments({ isActive: true });
    console.log("Active food_restaurants:", active);
    
    process.exit(0);
}).catch(console.error);
