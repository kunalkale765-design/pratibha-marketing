/**
 * Market Rates Tests
 * Tests for market rate CRUD operations and pricing logic
 */

const request = require('supertest');
const app = require('../server');
const { testUtils } = require('./setup');
const MarketRate = require('../models/MarketRate');

describe('Market Rates Endpoints', () => {
  describe('GET /api/market-rates', () => {
    let adminToken, product1, product2;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      product1 = await testUtils.createTestProduct({ name: 'Tomato' });
      product2 = await testUtils.createTestProduct({ name: 'Potato' });
    });

    it('should return all current market rates', async () => {
      await testUtils.createMarketRate(product1, 50);
      await testUtils.createMarketRate(product2, 30);

      const res = await request(app)
        .get('/api/market-rates')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return latest rate per product when multiple exist', async () => {
      // Create old rate
      await MarketRate.create({
        product: product1._id,
        productName: product1.name,
        rate: 40,
        effectiveDate: new Date(Date.now() - 86400000) // Yesterday
      });

      // Create new rate
      await MarketRate.create({
        product: product1._id,
        productName: product1.name,
        rate: 50,
        effectiveDate: new Date() // Today
      });

      const res = await request(app)
        .get('/api/market-rates')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      // Should only return the latest rate
      const productRates = res.body.data.filter(r => r.product.toString() === product1._id.toString());
      expect(productRates).toHaveLength(1);
      expect(productRates[0].rate).toBe(50);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request(app)
        .get('/api/market-rates');

      expect(res.status).toBe(401);
    });

    it('should allow customer to view market rates', async () => {
      const { token } = await testUtils.createCustomerUser();
      await testUtils.createMarketRate(product1, 50);

      const res = await request(app)
        .get('/api/market-rates')
        .set('Cookie', `token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/market-rates', () => {
    let adminToken, staffToken, customerToken, product;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      const staff = await testUtils.createStaffUser();
      const customer = await testUtils.createCustomerUser();
      adminToken = admin.token;
      staffToken = staff.token;
      customerToken = customer.token;
      product = await testUtils.createTestProduct();
    });

    it('should allow admin to create market rate', async () => {
      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: 100,
          effectiveDate: new Date().toISOString()
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rate).toBe(100);
      expect(res.body.data.productName).toBe(product.name);
    });

    it('should allow staff to create market rate', async () => {
      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${staffToken}`)
        .send({
          product: product._id,
          rate: 75
        });

      expect(res.status).toBe(201);
      expect(res.body.data.rate).toBe(75);
    });

    it('should reject customer creating market rate', async () => {
      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${customerToken}`)
        .send({
          product: product._id,
          rate: 100
        });

      expect(res.status).toBe(403);
    });

    it('should calculate trend when updating rate', async () => {
      // Create initial rate
      await testUtils.createMarketRate(product, 100);

      // Update with higher rate
      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: 120
        });

      expect(res.status).toBe(201);
      expect(res.body.data.trend).toBe('up');
      expect(res.body.data.previousRate).toBe(100);
    });

    it('should set trend to down when rate decreases', async () => {
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: 80
        });

      expect(res.status).toBe(201);
      expect(res.body.data.trend).toBe('down');
    });

    it('should set trend to stable when rate unchanged', async () => {
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: 100
        });

      expect(res.status).toBe(201);
      expect(res.body.data.trend).toBe('stable');
    });

    it('should reject negative rate', async () => {
      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: -10
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing product', async () => {
      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          rate: 100
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid product ID', async () => {
      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: 'invalid-id',
          rate: 100
        });

      expect(res.status).toBe(400);
    });

    it('should reject non-existent product', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: fakeId,
          rate: 100
        });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/market-rates/all', () => {
    let adminToken, product;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      product = await testUtils.createTestProduct();
    });

    it('should return all historical rates', async () => {
      // Create multiple rates for same product
      await MarketRate.create({
        product: product._id,
        productName: product.name,
        rate: 40,
        effectiveDate: new Date(Date.now() - 172800000) // 2 days ago
      });

      await MarketRate.create({
        product: product._id,
        productName: product.name,
        rate: 45,
        effectiveDate: new Date(Date.now() - 86400000) // 1 day ago
      });

      await MarketRate.create({
        product: product._id,
        productName: product.name,
        rate: 50,
        effectiveDate: new Date() // Today
      });

      const res = await request(app)
        .get('/api/market-rates/all')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should respect limit parameter', async () => {
      // Create 5 rates
      for (let i = 0; i < 5; i++) {
        await MarketRate.create({
          product: product._id,
          productName: product.name,
          rate: 40 + i,
          effectiveDate: new Date(Date.now() - i * 86400000)
        });
      }

      const res = await request(app)
        .get('/api/market-rates/all?limit=3')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
    });
  });

  describe('GET /api/market-rates/history/:productId', () => {
    let adminToken, product;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      product = await testUtils.createTestProduct();
    });

    it('should return rate history for specific product', async () => {
      // Create rates for this product
      await MarketRate.create({
        product: product._id,
        productName: product.name,
        rate: 40,
        effectiveDate: new Date(Date.now() - 86400000)
      });

      await MarketRate.create({
        product: product._id,
        productName: product.name,
        rate: 50,
        effectiveDate: new Date()
      });

      // Create rate for different product
      const otherProduct = await testUtils.createTestProduct({ name: 'Other' });
      await testUtils.createMarketRate(otherProduct, 100);

      const res = await request(app)
        .get(`/api/market-rates/history/${product._id}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      res.body.data.forEach(rate => {
        expect(rate.product.toString()).toBe(product._id.toString());
      });
    });

    it('should return empty array for product with no rates', async () => {
      const newProduct = await testUtils.createTestProduct({ name: 'No Rates' });

      const res = await request(app)
        .get(`/api/market-rates/history/${newProduct._id}`)
        .set('Cookie', `token=${adminToken}`);

      // Should either return 200 with empty array or 404
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data).toHaveLength(0);
      }
    });
  });

  describe('GET /api/market-rates with filters', () => {
    let adminToken, product1, product2;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      product1 = await testUtils.createTestProduct({ name: 'Tomato' });
      product2 = await testUtils.createTestProduct({ name: 'Potato' });
    });

    it('should filter by search term', async () => {
      await testUtils.createMarketRate(product1, 50);
      await testUtils.createMarketRate(product2, 30);

      const res = await request(app)
        .get('/api/market-rates?search=Tomato')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].productName).toBe('Tomato');
    });

    it('should filter by date range', async () => {
      const yesterday = new Date(Date.now() - 86400000);
      const today = new Date();

      await MarketRate.create({
        product: product1._id,
        productName: product1.name,
        rate: 40,
        effectiveDate: yesterday
      });

      await MarketRate.create({
        product: product2._id,
        productName: product2.name,
        rate: 50,
        effectiveDate: today
      });

      const res = await request(app)
        .get(`/api/market-rates?startDate=${today.toISOString().split('T')[0]}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should handle regex special characters in search safely', async () => {
      await testUtils.createMarketRate(product1, 50);

      const res = await request(app)
        .get('/api/market-rates?search=.*')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      // Should not throw regex error
    });
  });

  describe('GET /api/market-rates/history-summary', () => {
    let adminToken, staffToken, customerToken, product1, product2;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      const staff = await testUtils.createStaffUser();
      const customer = await testUtils.createCustomerUser();
      adminToken = admin.token;
      staffToken = staff.token;
      customerToken = customer.token;
      product1 = await testUtils.createTestProduct({ name: 'Rice', category: 'Grains' });
      product2 = await testUtils.createTestProduct({ name: 'Wheat', category: 'Grains' });
    });

    it('should return history summary for admin', async () => {
      await testUtils.createMarketRate(product1, 100);
      await testUtils.createMarketRate(product2, 80);

      const res = await request(app)
        .get('/api/market-rates/history-summary')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.days).toBe(7);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.categories).toBeInstanceOf(Array);
    });

    it('should return history summary for staff', async () => {
      const res = await request(app)
        .get('/api/market-rates/history-summary')
        .set('Cookie', `token=${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny access to customer', async () => {
      const res = await request(app)
        .get('/api/market-rates/history-summary')
        .set('Cookie', `token=${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('should accept custom days parameter', async () => {
      const res = await request(app)
        .get('/api/market-rates/history-summary?days=14')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.days).toBe(14);
    });

    it('should reject invalid days parameter', async () => {
      const res = await request(app)
        .get('/api/market-rates/history-summary?days=100')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should filter by category', async () => {
      await testUtils.createMarketRate(product1, 100);

      const res = await request(app)
        .get('/api/market-rates/history-summary?category=Grains')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach(item => {
        expect(item.category).toBe('Grains');
      });
    });

    it('should return all products when category is all', async () => {
      const product3 = await testUtils.createTestProduct({ name: 'Sugar', category: 'Other' });
      await testUtils.createMarketRate(product1, 100);
      await testUtils.createMarketRate(product3, 50);

      const res = await request(app)
        .get('/api/market-rates/history-summary?category=all')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should include rate history for each day', async () => {
      await testUtils.createMarketRate(product1, 100);

      const res = await request(app)
        .get('/api/market-rates/history-summary?days=3')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        expect(res.body.data[0].rates).toBeInstanceOf(Array);
        expect(res.body.data[0].rates.length).toBe(3);
      }
    });
  });

  describe('POST /api/market-rates/reset-all', () => {
    let adminToken, staffToken, product;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      const staff = await testUtils.createStaffUser();
      adminToken = admin.token;
      staffToken = staff.token;
      product = await testUtils.createTestProduct({ name: 'Test Product' });
    });

    it('should allow admin to reset all rates', async () => {
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/market-rates/reset-all')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBeGreaterThanOrEqual(0);
    });

    it('should deny staff from resetting all rates', async () => {
      const res = await request(app)
        .post('/api/market-rates/reset-all')
        .set('Cookie', `token=${staffToken}`);

      expect(res.status).toBe(403);
    });

    it('should return reset count in response', async () => {
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/market-rates/reset-all')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('count');
      expect(res.body.data).toHaveProperty('total');
    });
  });

  describe('GET /api/market-rates/:id', () => {
    let adminToken, product, marketRate;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      product = await testUtils.createTestProduct();
      marketRate = await testUtils.createMarketRate(product, 100);
    });

    it('should return single market rate by id', async () => {
      const res = await request(app)
        .get(`/api/market-rates/${marketRate._id}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rate).toBe(100);
    });

    it('should return 404 for non-existent rate', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/market-rates/${fakeId}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should populate product details', async () => {
      const res = await request(app)
        .get(`/api/market-rates/${marketRate._id}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.product).toBeDefined();
    });
  });

  describe('PUT /api/market-rates/:id', () => {
    let adminToken, staffToken, customerToken, product, marketRate;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      const staff = await testUtils.createStaffUser();
      const customer = await testUtils.createCustomerUser();
      adminToken = admin.token;
      staffToken = staff.token;
      customerToken = customer.token;
      product = await testUtils.createTestProduct();
      marketRate = await testUtils.createMarketRate(product, 100);
    });

    it('should allow admin to update market rate', async () => {
      const res = await request(app)
        .put(`/api/market-rates/${marketRate._id}`)
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: 150
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rate).toBe(150);
    });

    it('should allow staff to update market rate', async () => {
      const res = await request(app)
        .put(`/api/market-rates/${marketRate._id}`)
        .set('Cookie', `token=${staffToken}`)
        .send({
          product: product._id,
          rate: 120
        });

      expect(res.status).toBe(200);
      expect(res.body.data.rate).toBe(120);
    });

    it('should deny customer from updating market rate', async () => {
      const res = await request(app)
        .put(`/api/market-rates/${marketRate._id}`)
        .set('Cookie', `token=${customerToken}`)
        .send({
          product: product._id,
          rate: 200
        });

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent rate', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .put(`/api/market-rates/${fakeId}`)
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: 100
        });

      expect(res.status).toBe(404);
    });

    it('should reject invalid rate value', async () => {
      const res = await request(app)
        .put(`/api/market-rates/${marketRate._id}`)
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: -50
        });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/market-rates/:id', () => {
    let adminToken, staffToken, product, marketRate;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      const staff = await testUtils.createStaffUser();
      adminToken = admin.token;
      staffToken = staff.token;
      product = await testUtils.createTestProduct();
      marketRate = await testUtils.createMarketRate(product, 100);
    });

    it('should allow admin to delete market rate', async () => {
      const res = await request(app)
        .delete(`/api/market-rates/${marketRate._id}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted');

      // Verify deletion
      const deleted = await MarketRate.findById(marketRate._id);
      expect(deleted).toBeNull();
    });

    it('should deny staff from deleting market rate', async () => {
      const res = await request(app)
        .delete(`/api/market-rates/${marketRate._id}`)
        .set('Cookie', `token=${staffToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent rate', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .delete(`/api/market-rates/${fakeId}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Market Rate Change Percentage Calculation', () => {
    let adminToken, product;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      product = await testUtils.createTestProduct();
    });

    it('should calculate correct change percentage for increase', async () => {
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: 125 // 25% increase
        });

      expect(res.status).toBe(201);
      expect(parseFloat(res.body.data.changePercentage)).toBeCloseTo(25, 1);
    });

    it('should calculate correct change percentage for decrease', async () => {
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/market-rates')
        .set('Cookie', `token=${adminToken}`)
        .send({
          product: product._id,
          rate: 75 // 25% decrease
        });

      expect(res.status).toBe(201);
      expect(parseFloat(res.body.data.changePercentage)).toBeCloseTo(-25, 1);
    });
  });
});
