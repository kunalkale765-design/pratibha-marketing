require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('./models/Customer');
const Order = require('./models/Order');
const User = require('./models/User');

const clearData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...\n');

    // Delete all orders
    const ordersResult = await Order.deleteMany({});
    console.log(`Deleted ${ordersResult.deletedCount} orders`);

    // Delete customer user accounts (users with role 'customer')
    const customerUsersResult = await User.deleteMany({ role: 'customer' });
    console.log(`Deleted ${customerUsersResult.deletedCount} customer user accounts`);

    // Delete all customers
    const customersResult = await Customer.deleteMany({});
    console.log(`Deleted ${customersResult.deletedCount} customers`);

    console.log('\nDone! Orders and customers cleared.');

  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
};

clearData();
