/**
 * Pricing System Tests
 * Tests for market, markup, and contract pricing calculations
 */

require('./setup');
const request = require('supertest');
const app = require('../server');
const Customer = require('../models/Customer');

describe('Pricing System', () => {
  let adminToken;
  let product;

  beforeEach(async () => {
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;
    product = await testUtils.createTestProduct({ name: `Pricing Test Product ${Date.now()}` });
  });

  describe('Market Pricing', () => {
    it('should use market rate for market pricing customer', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });
      await testUtils.createMarketRate(product, 150);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(150);
      expect(res.body.data.totalAmount).toBe(1500); // 10 * 150
    });

    it('should return 0 when no market rate exists', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });
      // No market rate created

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(0);
      expect(res.body.data.totalAmount).toBe(0);
    });

    it('should use staff-provided rate when specified for market customer', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 200 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(200); // Staff rate, not market
      expect(res.body.data.totalAmount).toBe(2000);
    });

    it('should reject rate of 0 (min is 0.01 to prevent accidental free orders)', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 0 }]
        });

      // Rate 0 is now rejected - validation requires min 0.01
      expect(res.status).toBe(400);
    });
  });

  describe('Markup Pricing', () => {
    it('should calculate markup correctly: marketRate * (1 + markup/100)', async () => {
      const customer = await testUtils.createMarkupCustomer(20); // 20% markup
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(120); // 100 * 1.2
      expect(res.body.data.totalAmount).toBe(1200);
    });

    it('should handle 0% markup (same as market rate)', async () => {
      const customer = await testUtils.createMarkupCustomer(0);
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(100); // No markup
    });

    it('should handle 100% markup (double the market rate)', async () => {
      const customer = await testUtils.createMarkupCustomer(100);
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(200); // 100 * 2
    });

    it('should handle 200% markup (triple the market rate)', async () => {
      const customer = await testUtils.createMarkupCustomer(200);
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(300); // 100 * 3
    });

    it('should use staff-provided rate when specified for markup customer', async () => {
      const customer = await testUtils.createMarkupCustomer(50);
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 250 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(250); // Staff rate overrides markup
    });

    it('should return 0 when no market rate and no staff rate', async () => {
      const customer = await testUtils.createMarkupCustomer(50);
      // No market rate created

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(0); // 0 * 1.5 = 0
    });
  });

  describe('Contract Pricing - Existing Contract Price', () => {
    it('should use existing contract price and ignore staff rate', async () => {
      const contractPrices = {};
      contractPrices[product._id.toString()] = 175;
      const customer = await testUtils.createContractCustomer(contractPrices);
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 999 }] // Staff tries different rate
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(175); // Contract price, not staff's 999
      expect(res.body.data.products[0].isContractPrice).toBe(true);
    });

    it('should use contract price even when market rate is different', async () => {
      const contractPrices = {};
      contractPrices[product._id.toString()] = 50;
      const customer = await testUtils.createContractCustomer(contractPrices);
      await testUtils.createMarketRate(product, 200);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(50); // Contract price
    });
  });

  describe('Contract Pricing - No Existing Contract Price', () => {
    it('should use staff rate and save as new contract price', async () => {
      const customer = await testUtils.createContractCustomer({}); // No contract prices
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 180 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(180);
      expect(res.body.data.products[0].isContractPrice).toBe(true);

      // Verify contract price was saved
      const updatedCustomer = await Customer.findById(customer._id);
      const savedPrice = updatedCustomer.contractPrices.get(product._id.toString());
      expect(savedPrice).toBe(180);
    });

    it('should fallback to market rate when no contract price and no staff rate', async () => {
      const customer = await testUtils.createContractCustomer({});
      await testUtils.createMarketRate(product, 125);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(125); // Market rate fallback
      expect(res.body.data.usedPricingFallback).toBe(true);
    });

    it('should NOT save contract price when using market rate fallback', async () => {
      const customer = await testUtils.createContractCustomer({});
      await testUtils.createMarketRate(product, 100);

      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      // Verify no contract price was saved
      const updatedCustomer = await Customer.findById(customer._id);
      const savedPrice = updatedCustomer.contractPrices.get(product._id.toString());
      expect(savedPrice).toBeUndefined();
    });
  });

  describe('Contract Price Immutability', () => {
    it('should reject order update that attempts to change contract price', async () => {
      const contractPrices = {};
      contractPrices[product._id.toString()] = 150;
      const customer = await testUtils.createContractCustomer(contractPrices);

      // Create order with contract price
      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.data._id;

      // Try to update the price
      const updateRes = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          products: [{
            product: product._id,
            quantity: 10,
            rate: 200 // Try to change from 150 to 200
          }]
        });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.message).toMatch(/contract.*cannot.*change/i);
    });

    // Note: Mixed order updates with both contract and non-contract products
    // are complex due to product ID matching in the order update validation.
    // The core contract immutability is tested above.
  });

  describe('Multiple Products with Different Pricing', () => {
    it('should handle order with multiple products using consistent market rate snapshot', async () => {
      const product2 = await testUtils.createTestProduct({ name: `Second Product ${Date.now()}` });
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      await testUtils.createMarketRate(product, 100);
      await testUtils.createMarketRate(product2, 200);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [
            { product: product._id, quantity: 10 },
            { product: product2._id, quantity: 5 }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(100);
      expect(res.body.data.products[1].rate).toBe(200);
      expect(res.body.data.totalAmount).toBe(2000); // (10*100) + (5*200)
    });

    it('should persist new contract prices for multiple products in single order', async () => {
      const product2 = await testUtils.createTestProduct({ name: `Second Contract Product ${Date.now()}` });
      const customer = await testUtils.createContractCustomer({});

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [
            { product: product._id, quantity: 10, rate: 150 },
            { product: product2._id, quantity: 5, rate: 250 }
          ]
        });

      expect(res.status).toBe(201);

      // Verify both contract prices were saved
      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.contractPrices.get(product._id.toString())).toBe(150);
      expect(updatedCustomer.contractPrices.get(product2._id.toString())).toBe(250);
    });
  });

  describe('Pricing Edge Cases', () => {
    it('should handle negative staff rate (should be rejected by validation)', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: -50 }]
        });

      // Should either reject or use market rate (not negative)
      if (res.status === 201) {
        expect(res.body.data.products[0].rate).toBeGreaterThanOrEqual(0);
      } else {
        expect(res.status).toBe(400);
      }
    });

    it('should handle very large markup percentage', async () => {
      const customer = await testUtils.createMarkupCustomer(200); // Max allowed
      await testUtils.createMarketRate(product, 100);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 1 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products[0].rate).toBe(300); // 100 * 3
    });

    it('should handle decimal market rates correctly', async () => {
      const customer = await testUtils.createMarkupCustomer(10);
      await testUtils.createMarketRate(product, 99.99);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      // 99.99 * 1.1 = 109.989
      expect(res.body.data.products[0].rate).toBeCloseTo(109.989, 2);
    });
  });
});
