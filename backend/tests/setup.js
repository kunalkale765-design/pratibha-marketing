// SECURITY: Set test environment and JWT_SECRET BEFORE any imports
// This ensures the centralized secrets module doesn't fail during tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-automated-tests';

// Load environment variables (won't override what we just set)
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

// JWT Secret for tests - now guaranteed to be set above
const JWT_SECRET = process.env.JWT_SECRET;

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

    // Generate unique phone number using timestamp to avoid conflicts
    const uniquePhone = `12${Date.now().toString().slice(-8)}`;

    const customer = await Customer.create({
      name: 'Test Customer',
      phone: uniquePhone,
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

    // Generate unique phone number using timestamp to avoid conflicts
    const uniquePhone = `98${Date.now().toString().slice(-8)}`;

    return Customer.create({
      name: `Test Customer ${Date.now()}`,
      phone: uniquePhone,
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
  },

  // Create customer with contract pricing
  async createContractCustomer(productPrices = {}) {
    await ensureDbConnected();
    const uniquePhone = `91${Date.now().toString().slice(-8)}`;

    return Customer.create({
      name: `Contract Customer ${Date.now()}`,
      phone: uniquePhone,
      pricingType: 'contract',
      contractPrices: new Map(Object.entries(productPrices)),
      isActive: true
    });
  },

  // Create customer with markup pricing
  async createMarkupCustomer(markupPercentage = 10) {
    await ensureDbConnected();
    const uniquePhone = `92${Date.now().toString().slice(-8)}`;

    return Customer.create({
      name: `Markup Customer ${Date.now()}`,
      phone: uniquePhone,
      pricingType: 'markup',
      markupPercentage: markupPercentage,
      isActive: true
    });
  },

  // Create product with specific category (for invoice tests)
  async createCategorizedProduct(category, overrides = {}) {
    await ensureDbConnected();

    return Product.create({
      name: `${category} Product ${Date.now()}`,
      unit: 'kg',
      category: category,
      isActive: true,
      ...overrides
    });
  },

  // Refresh customer from database
  async refreshCustomer(customerId) {
    await ensureDbConnected();
    return Customer.findById(customerId);
  },

  // Create order via API (for full flow tests)
  async createOrderViaAPI(app, token, customerId, products) {
    const request = require('supertest');
    return request(app)
      .post('/api/orders')
      .set('Cookie', [`token=${token}`])
      .send({
        customer: customerId,
        products: products
      });
  },

  // Generate magic link token for customer
  async generateMagicLinkToken(customerId) {
    await ensureDbConnected();
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');

    // Hash the token before storing (matches production behavior)
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    await Customer.findByIdAndUpdate(customerId, {
      magicLinkToken: hashedToken,
      magicLinkCreatedAt: new Date()
    });

    // Return plain token for use in tests
    return token;
  },

  // Create magic link JWT token for testing (sync - just creates the JWT)
  createMagicLinkJWT(customerId) {
    return jwt.sign(
      { customerId: customerId, type: 'magic' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
  },

  // Set up magic link token on customer for auth middleware revocation check
  async setupMagicLinkForCustomer(customerId) {
    // Use customerId to generate unique token (avoids unique index conflicts)
    const crypto = require('crypto');
    const uniqueToken = crypto.createHash('sha256').update(customerId.toString() + Date.now()).digest('hex');
    await Customer.findByIdAndUpdate(customerId, {
      magicLinkToken: uniqueToken,
      magicLinkCreatedAt: new Date()
    });
  }
};

// Export utilities for use in tests
global.testUtils = testUtils;
global.JWT_SECRET = JWT_SECRET;

module.exports = { testUtils, JWT_SECRET };
