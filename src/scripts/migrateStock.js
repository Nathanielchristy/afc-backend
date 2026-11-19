const mongoose = require('mongoose');

async function migrateStock() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ecommerce_dev';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  console.log('Connected to DB:', db.databaseName);

  // 1. Set default stock of 50 for any products where stock is missing, null, or undefined
  const missingRes = await db.collection('products').updateMany(
    { $or: [{ stock: { $exists: false } }, { stock: null }] },
    { $set: { stock: 50 } }
  );
  console.log('Products missing stock updated to 50:', missingRes.modifiedCount);

  // 2. Clamp any negative stock to 0
  const negRes = await db.collection('products').updateMany(
    { stock: { $lt: 0 } },
    { $set: { stock: 0 } }
  );
  console.log('Products with negative stock clamped to 0:', negRes.modifiedCount);

  // 3. Count products by stock state
  const total = await db.collection('products').countDocuments();
  const outOfStock = await db.collection('products').countDocuments({ stock: 0 });
  const lowStock = await db.collection('products').countDocuments({ stock: { $gt: 0, $lte: 5 } });
  const healthyStock = await db.collection('products').countDocuments({ stock: { $gt: 5 } });

  console.log('--- Migration Summary ---');
  console.log('Total Products:', total);
  console.log('Healthy Stock (>5):', healthyStock);
  console.log('Low Stock (1-5):', lowStock);
  console.log('Out of Stock (0):', outOfStock);

  await mongoose.disconnect();
  console.log('Done!');
}

migrateStock().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
