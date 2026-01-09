// Load environment variables first (same as server.js)
require('dotenv').config();

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

// Models
const User = require('../models/User');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Order = require('../models/Order');
const MarketRate = require('../models/MarketRate');

// JWT Secret for tests - use same secret as server (from .env or fallback)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// In-memory MongoDB server instance
let mongoServer;

// Promise to track database connection status
let dbConnected = null;

// Ensure database is connected before any operations
const ensureDbConnected = async () => {
  if (dbConnected) {
    await dbConnected;
  }
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database not connected');
  }
};

// Connect to in-memory database before all tests
beforeAll(async () => {
  // Create connection promise
  dbConnected = (async () => {
    // Disconnect from any existing connection (production database from server.js import)
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // Create and start in-memory MongoDB server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Connect to in-memory database
    await mongoose.connect(mongoUri);
    console.log('Connected to in-memory test database');
  })();

  await dbConnected;
});

// Clean up database after each test
afterEach(async () => {
  await ensureDbConnected();
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Disconnect and stop server after all tests
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
  console.log('Disconnected from test database');
});

// Test utility functions
const testUtils = {
  // Create a test user and return user + token
  async createTestUser(overrides = {}) {
    await ensureDbConnected();

    const userData = {
      name: 'Test User',
      email: `testuser${Date.now()}@test.com`,
      password: 'Test123!',
      role: 'customer',
      isActive: true,
      ...overrides
    };

    const user = await User.create(userData);
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' });

    return { user, token };
  },

  // Create admin user
  async createAdminUser() {
    return this.createTestUser({
      name: 'Admin User',
      email: `admin${Date.now()}@test.com`,
      role: 'admin'
    });
  },

  // Create staff user
  async createStaffUser() {
    return this.createTestUser({
      name: 'Staff User',
      email: `staff${Date.now()}@test.com`,
      role: 'staff'
    });
  },

  // Create customer user with linked Customer record
  async createCustomerUser(customerOverrides = {}) {
    await ensureDbConnected();

    const customer = await Customer.create({
      name: 'Test Customer',
      phone: '1234567890',
      pricingType: 'market',
      ...customerOverrides
    });

    const { user, token } = await this.createTestUser({
      name: customer.name,
      role: 'customer',
      customer: customer._id
    });

    return { user, token, customer };
  },

  // Create a test product
  async createTestProduct(overrides = {}) {
    await ensureDbConnected();

    return Product.create({
      name: `Test Product ${Date.now()}`,
      unit: 'kg',
      category: 'Test',
      isActive: true,
      ...overrides
    });
  },

  // Create a test customer (without user)
  async createTestCustomer(overrides = {}) {
    await ensureDbConnected();

    return Customer.create({
      name: `Test Customer ${Date.now()}`,
      phone: '9876543210',
      pricingType: 'market',
      isActive: true,
      ...overrides
    });
  },

  // Create a test order
  async createTestOrder(customer, product, overrides = {}) {
    await ensureDbConnected();

    return Order.create({
      customer: customer._id,
      products: [{
        product: product._id,
        productName: product.name,
        quantity: 10,
        unit: product.unit,
        rate: 100,
        amount: 1000
      }],
      totalAmount: 1000,
      status: 'pending',
      paymentStatus: 'unpaid',
      ...overrides
    });
  },

  // Create market rate for a product
  async createMarketRate(product, rate = 100) {
    await ensureDbConnected();

    return MarketRate.create({
      product: product._id,
      productName: product.name,
      rate: rate,
      effectiveDate: new Date()
    });
  }
};

// Export utilities for use in tests
global.testUtils = testUtils;
global.JWT_SECRET = JWT_SECRET;

module.exports = { testUtils, JWT_SECRET };
