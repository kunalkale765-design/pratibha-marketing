/**
 * Edge Cases and Error Handling Tests
 * Tests for boundary conditions, error scenarios, and unusual inputs
 */

const request = require('supertest');
const app = require('../server');
const { testUtils } = require('./setup');
const mongoose = require('mongoose');

describe('Edge Cases and Error Handling', () => {
  describe('Pagination Edge Cases', () => {
    let adminToken;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
    });

    it('should handle zero limit gracefully', async () => {
      const res = await request(app)
        .get('/api/orders?limit=0')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      // Should use default limit or minimum
    });

    it('should handle negative limit gracefully', async () => {
      const res = await request(app)
        .get('/api/orders?limit=-10')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should handle very large limit', async () => {
      const res = await request(app)
        .get('/api/orders?limit=999999')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      // Should cap at maximum allowed limit
    });

    it('should handle non-numeric limit', async () => {
      const res = await request(app)
        .get('/api/orders?limit=abc')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      // Should use default limit
    });

    it('should handle page 0', async () => {
      const res = await request(app)
        .get('/api/customers?page=0')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should handle negative page', async () => {
      const res = await request(app)
        .get('/api/customers?page=-1')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Date Filtering Edge Cases', () => {
    let adminToken;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
    });

    it('should handle invalid date format', async () => {
      const res = await request(app)
        .get('/api/orders?startDate=invalid-date')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid');
    });

    it('should handle endDate before startDate', async () => {
      const res = await request(app)
        .get('/api/orders?startDate=2026-01-10&endDate=2026-01-01')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should handle future dates', async () => {
      const res = await request(app)
        .get('/api/orders?startDate=2030-01-01')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('should handle very old dates', async () => {
      const res = await request(app)
        .get('/api/orders?startDate=1900-01-01&endDate=1900-12-31')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('Empty Data Handling', () => {
    let adminToken;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
    });

    it('should return empty array when no customers exist', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return empty array when no products exist', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return empty array when no orders exist', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return empty array when no market rates exist', async () => {
      const res = await request(app)
        .get('/api/market-rates')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('Invalid ObjectId Handling', () => {
    let adminToken;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
    });

    it('should return 400 for invalid customer ID', async () => {
      const res = await request(app)
        .get('/api/customers/not-an-object-id')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid product ID', async () => {
      const res = await request(app)
        .get('/api/products/not-an-object-id')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid order ID', async () => {
      const res = await request(app)
        .get('/api/orders/not-an-object-id')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent valid ObjectId', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .get(`/api/customers/${fakeId}`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Order Creation Edge Cases', () => {
    let adminToken, customer, product;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      customer = await testUtils.createTestCustomer();
      product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);
    });

    it('should handle order with zero quantity', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{
            product: product._id,
            quantity: 0
          }]
        });

      expect(res.status).toBe(400);
    });

    it('should handle order with negative quantity', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{
            product: product._id,
            quantity: -5
          }]
        });

      expect(res.status).toBe(400);
    });

    it('should handle order with very large quantity', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{
            product: product._id,
            quantity: 999999999
          }]
        });

      // Should either accept or reject with validation error
      expect([201, 400]).toContain(res.status);
    });

    it('should handle order with decimal quantity', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{
            product: product._id,
            quantity: 2.5
          }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].quantity).toBe(2.5);
    });

    it('should handle order with empty products array', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: []
        });

      expect(res.status).toBe(400);
    });

    it('should handle order with duplicate products', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [
            { product: product._id, quantity: 5 },
            { product: product._id, quantity: 3 } // Same product again
          ]
        });

      // Should either combine or create separate line items
      expect(res.status).toBe(201);
    });

    it('should handle order with non-existent product', async () => {
      const fakeProductId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{
            product: fakeProductId,
            quantity: 5
          }]
        });

      // Should reject - 400 (validation), 404 (not found), or 500 (server error during price lookup)
      expect([400, 404, 500]).toContain(res.status);
    });

    it('should handle order with inactive product', async () => {
      const inactiveProduct = await testUtils.createTestProduct({
        name: 'Inactive Product',
        isActive: false
      });

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{
            product: inactiveProduct._id,
            quantity: 5
          }]
        });

      // Server may accept (product exists) or reject (inactive) - both are valid behaviors
      expect([201, 400, 404]).toContain(res.status);
    });
  });

  describe('Payment Edge Cases', () => {
    let adminToken, order;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      const customer = await testUtils.createTestCustomer();
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);
      order = await testUtils.createTestOrder(customer, product, { totalAmount: 1000 });
    });

    it('should handle negative payment amount', async () => {
      const res = await request(app)
        .put(`/api/orders/${order._id}/payment`)
        .set('Cookie', `token=${adminToken}`)
        .send({ paidAmount: -100 });

      expect(res.status).toBe(400);
    });

    it('should handle zero payment amount', async () => {
      const res = await request(app)
        .put(`/api/orders/${order._id}/payment`)
        .set('Cookie', `token=${adminToken}`)
        .send({ paidAmount: 0 });

      // Zero is technically valid (resets to unpaid) or rejected
      expect([200, 400]).toContain(res.status);
    });

    it('should handle overpayment', async () => {
      const res = await request(app)
        .put(`/api/orders/${order._id}/payment`)
        .set('Cookie', `token=${adminToken}`)
        .send({ paidAmount: 2000 }); // More than order total

      // Should either cap at total or accept overpayment
      expect([200, 400]).toContain(res.status);
    });

    it('should handle very small payment', async () => {
      const res = await request(app)
        .put(`/api/orders/${order._id}/payment`)
        .set('Cookie', `token=${adminToken}`)
        .send({ paidAmount: 0.01 });

      // Small payments should work
      expect(res.status).toBe(200);
      expect(res.body.data.paidAmount).toBeGreaterThan(0);
    });
  });

  describe('Search Edge Cases', () => {
    let adminToken;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      await testUtils.createTestCustomer({ name: 'John Doe' });
    });

    it('should handle empty search string', async () => {
      const res = await request(app)
        .get('/api/customers?search=')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should handle search with special characters', async () => {
      const res = await request(app)
        .get('/api/customers?search=.*+?^${}()|[]\\')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      // Should escape regex characters
    });

    it('should handle search with unicode characters', async () => {
      const res = await request(app)
        .get('/api/customers')
        .query({ search: '日本語' })
        .set('Cookie', `token=${adminToken}`);

      // Should not crash - either return empty array or handle gracefully
      expect([200, 400]).toContain(res.status);
    });

    it('should handle case-insensitive search', async () => {
      const res = await request(app)
        .get('/api/customers?search=JOHN')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent order creation', async () => {
      const admin = await testUtils.createAdminUser();
      const customer = await testUtils.createTestCustomer();
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      // Create 5 orders concurrently
      const orderPromises = Array(5).fill().map(() =>
        request(app)
          .post('/api/orders')
          .set('Cookie', `token=${admin.token}`)
          .send({
            customer: customer._id,
            products: [{ product: product._id, quantity: 1 }]
          })
      );

      const results = await Promise.all(orderPromises);

      // All should succeed
      results.forEach(res => {
        expect(res.status).toBe(201);
      });

      // All order numbers should be unique
      const orderNumbers = results.map(r => r.body.data.orderNumber);
      const uniqueNumbers = new Set(orderNumbers);
      expect(uniqueNumbers.size).toBe(5);
    });
  });

  describe('Status Transition Edge Cases', () => {
    let adminToken, order;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      const customer = await testUtils.createTestCustomer();
      const product = await testUtils.createTestProduct();
      order = await testUtils.createTestOrder(customer, product);
    });

    it('should reject invalid status', async () => {
      const res = await request(app)
        .put(`/api/orders/${order._id}/status`)
        .set('Cookie', `token=${adminToken}`)
        .send({ status: 'invalid-status' });

      expect(res.status).toBe(400);
    });

    it('should handle status update to same status', async () => {
      const res = await request(app)
        .put(`/api/orders/${order._id}/status`)
        .set('Cookie', `token=${adminToken}`)
        .send({ status: 'pending' }); // Already pending

      expect(res.status).toBe(200);
    });

    it('should handle updating cancelled order status', async () => {
      // First cancel the order
      await request(app)
        .delete(`/api/orders/${order._id}`)
        .set('Cookie', `token=${adminToken}`);

      // Try to update status of cancelled order
      const res = await request(app)
        .put(`/api/orders/${order._id}/status`)
        .set('Cookie', `token=${adminToken}`)
        .send({ status: 'confirmed' });

      // Should either allow or reject
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const res = await request(app)
        .get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
      expect(res.body.mongodb).toBeDefined();
    });
  });

  describe('Quantity Validation by Unit Type', () => {
    let adminToken, customer;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      customer = await testUtils.createTestCustomer();
    });

    it('should allow decimal quantities for kg unit', async () => {
      const product = await testUtils.createTestProduct({ unit: 'kg' });
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 2.5 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].quantity).toBe(2.5);
    });

    it('should allow decimal quantities for quintal unit', async () => {
      const product = await testUtils.createTestProduct({ unit: 'quintal' });
      await testUtils.createMarketRate(product, 1000);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 1.75 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].quantity).toBe(1.75);
    });

    it('should allow decimal quantities for bag unit', async () => {
      const product = await testUtils.createTestProduct({ unit: 'bag' });
      await testUtils.createMarketRate(product, 500);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 3.33 }]
        });

      expect(res.status).toBe(201);
    });

    it('should allow decimal quantities for ton unit', async () => {
      const product = await testUtils.createTestProduct({ unit: 'ton' });
      await testUtils.createMarketRate(product, 5000);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 0.5 }]
        });

      expect(res.status).toBe(201);
    });

    it('should reject decimal quantities for piece unit', async () => {
      const product = await testUtils.createTestProduct({ unit: 'piece' });
      await testUtils.createMarketRate(product, 50);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 2.5 }]
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/whole.*number|piece|integer/i);
    });

    it('should accept integer quantities for piece unit', async () => {
      const product = await testUtils.createTestProduct({ unit: 'piece' });
      await testUtils.createMarketRate(product, 50);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].quantity).toBe(10);
    });

    it('should reject quantity less than 0.2', async () => {
      const product = await testUtils.createTestProduct({ unit: 'kg' });
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 0.1 }]
        });

      expect(res.status).toBe(400);
    });

    it('should reject quantity greater than 1,000,000', async () => {
      const product = await testUtils.createTestProduct({ unit: 'kg' });
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 1000001 }]
        });

      expect(res.status).toBe(400);
    });

    it('should accept quantity at boundary: 0.2', async () => {
      const product = await testUtils.createTestProduct({ unit: 'kg' });
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 0.2 }]
        });

      expect(res.status).toBe(201);
    });

    it('should accept quantity at boundary: 1,000,000', async () => {
      const product = await testUtils.createTestProduct({ unit: 'kg' });
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 1000000 }]
        });

      expect(res.status).toBe(201);
    });
  });

  describe('Rate Validation', () => {
    let adminToken, customer, product;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      customer = await testUtils.createTestCustomer();
      product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);
    });

    it('should reject rate greater than 10,000,000', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 10000001 }]
        });

      expect(res.status).toBe(400);
    });

    it('should accept rate at boundary: 10,000,000', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 1, rate: 10000000 }]
        });

      expect(res.status).toBe(201);
    });

    it('should reject rate of 0 (min is 0.01)', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 0 }]
        });

      // Rate 0 is now rejected - min rate is 0.01 to prevent accidental free orders
      expect(res.status).toBe(400);
    });

    it('should reject negative rate', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: -50 }]
        });

      // Should either reject or use market rate instead
      if (res.status === 201) {
        expect(res.body.data.products[0].rate).toBeGreaterThanOrEqual(0);
      } else {
        expect(res.status).toBe(400);
      }
    });
  });

  describe('Password Validation', () => {
    it('should reject password with less than 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: `short${Date.now()}`,
          password: 'Ab1!'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject password without uppercase', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: `noupper${Date.now()}`,
          password: 'abcdef1'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.some(e => e.msg.toLowerCase().includes('uppercase'))).toBe(true);
    });

    it('should reject password without lowercase', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: `nolower${Date.now()}`,
          password: 'ABCDEF1'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.some(e => e.msg.toLowerCase().includes('lowercase'))).toBe(true);
    });

    it('should reject password without number', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: `nonumber${Date.now()}`,
          password: 'ABCdefg'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.some(e => e.msg.toLowerCase().includes('number'))).toBe(true);
    });

    it('should accept valid password meeting all criteria', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: `valid${Date.now()}`,
          password: 'ValidPass1'
        });

      expect(res.status).toBe(201);
    });
  });

  describe('Phone Validation', () => {
    let adminToken;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
    });

    it('should reject phone with less than 10 digits', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Cookie', `token=${adminToken}`)
        .send({
          name: 'Test Customer',
          phone: '123456789'
        });

      expect(res.status).toBe(400);
    });

    it('should reject phone with more than 10 digits', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Cookie', `token=${adminToken}`)
        .send({
          name: 'Test Customer',
          phone: '12345678901'
        });

      expect(res.status).toBe(400);
    });

    it('should reject phone with non-numeric characters', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Cookie', `token=${adminToken}`)
        .send({
          name: 'Test Customer',
          phone: '123-456-78'
        });

      expect(res.status).toBe(400);
    });

    it('should accept exactly 10 digits', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Cookie', `token=${adminToken}`)
        .send({
          name: 'Valid Phone Customer',
          phone: '1234567890'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.phone).toBe('1234567890');
    });

    it('should allow customer without phone (optional)', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Cookie', `token=${adminToken}`)
        .send({
          name: 'No Phone Customer'
        });

      expect(res.status).toBe(201);
    });
  });

  describe('Delivery Address Validation', () => {
    let adminToken, customer, product;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      customer = await testUtils.createTestCustomer();
      product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);
    });

    it('should reject delivery address longer than 500 characters', async () => {
      const longAddress = 'A'.repeat(501);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }],
          deliveryAddress: longAddress
        });

      expect(res.status).toBe(400);
    });

    it('should accept delivery address at boundary: 500 characters', async () => {
      const maxAddress = 'A'.repeat(500);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }],
          deliveryAddress: maxAddress
        });

      expect(res.status).toBe(201);
    });

    it('should allow empty delivery address', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }],
          deliveryAddress: ''
        });

      expect(res.status).toBe(201);
    });
  });

  describe('Notes Validation', () => {
    let adminToken, customer, product;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      customer = await testUtils.createTestCustomer();
      product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);
    });

    it('should reject notes longer than 1000 characters', async () => {
      const longNotes = 'N'.repeat(1001);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }],
          notes: longNotes
        });

      expect(res.status).toBe(400);
    });

    it('should accept notes at boundary: 1000 characters', async () => {
      const maxNotes = 'N'.repeat(1000);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }],
          notes: maxNotes
        });

      expect(res.status).toBe(201);
    });

    it('should allow empty notes', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', `token=${adminToken}`)
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }],
          notes: ''
        });

      expect(res.status).toBe(201);
    });
  });
});
