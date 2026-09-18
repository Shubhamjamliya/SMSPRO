const mongoose = require('mongoose');

async function check() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/just_order');
    const db = mongoose.connection.db;
    const res = await db.collection('food_restaurants').findOne({slug: 'palasia-south-indian-cafe'});
    if (!res) {
      console.log('Restaurant not found');
      process.exit(0);
    }
    const items = await db.collection('food_items').find({restaurantId: res._id}).toArray();
    console.log('Total items:', items.length);
    console.log('Pending items:', items.filter(i => i.approvalStatus === 'pending').length);
    console.log('Approved items:', items.filter(i => i.approvalStatus === 'approved').length);
    console.log('Unavailable items:', items.filter(i => i.isAvailable === false).length);
    console.log('Available items:', items.filter(i => i.isAvailable !== false).length);
    
    // Check categories
    const categories = await db.collection('food_categories').find({ restaurantId: res._id }).toArray();
    console.log('Total categories:', categories.length);
    console.log('Inactive categories:', categories.filter(c => c.isActive === false).length);
    console.log('Pending categories:', categories.filter(c => c.approvalStatus === 'pending').length);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
