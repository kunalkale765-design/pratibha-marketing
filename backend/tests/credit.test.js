/**
 * Credit System Tests
 * Tests for customer credit adjustments on order create, update, payment, and cancel
 */

require('./setup');
const request = require('supertest');
const app = require('../server');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

describe('Credit System', () => {
  let adminToken;
  let product;

  beforeEach(async () => {
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;
    product = await testUtils.createTestProduct({ name: `Credit Test Product ${Date.now()}` });
    await testUtils.createMarketRate(product, 100);
  });

  describe('Order Creation - Credit Increase', () => {
    it('should increase customer credit by order totalAmount', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });
      const initialCredit = customer.currentCredit || 0;

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }] // 10 * 100 = 1000
        });

      expect(res.status).toBe(201);

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(initialCredit + 1000);
    });

    it('should accumulate credit across multiple orders', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      // First order: 1000
      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      // Second order: 500
      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 5 }]
        });

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(1500);
    });

    it('should handle order with zero total (no credit change)', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });
      const productNoRate = await testUtils.createTestProduct({ name: `No Rate Product ${Date.now()}` });
      // No market rate for this product

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: productNoRate._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0);
    });
  });

  describe('Payment Recording - Credit Decrease', () => {
    it('should decrease credit when payment is recorded', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      // Create order (credit = 1000)
      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = createRes.body.data._id;

      // Record payment of 400
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 400 });

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(600); // 1000 - 400
    });

    it('should handle payment increase (more payment = less credit)', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = createRes.body.data._id;

      // First payment: 300
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 300 });

      let updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(700);

      // Increase payment to 700
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 700 });

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(300); // 1000 - 700
    });

    it('should handle payment decrease (less payment = more credit)', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = createRes.body.data._id;

      // First payment: 800
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 800 });

      let updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(200);

      // Decrease payment to 500
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 500 });

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(500); // 1000 - 500
    });

    it('should set credit to 0 when full payment recorded', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = createRes.body.data._id;

      // Full payment
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 1000 });

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0);
    });

    it('should update payment status correctly', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = createRes.body.data._id;

      // Partial payment
      let paymentRes = await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 500 });

      expect(paymentRes.body.data.paymentStatus).toBe('partial');

      // Full payment
      paymentRes = await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 1000 });

      expect(paymentRes.body.data.paymentStatus).toBe('paid');
    });

    it('should reject payment exceeding order total', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = createRes.body.data._id;

      const paymentRes = await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 1500 }); // Exceeds 1000 total

      expect(paymentRes.status).toBe(400);
    });
  });

  describe('Order Cancellation - Credit Restore', () => {
    it('should restore unpaid portion to credit on cancellation', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      // Create order (credit = 1000)
      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = createRes.body.data._id;

      // Partial payment of 400 (credit = 600)
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 400 });

      // Cancel order - should restore unpaid 600
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0); // 600 - 600 = 0
    });

    it('should not change credit for fully paid cancelled order', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      // Create order for 1000
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data._id;

      // Credit now = 1000
      let updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(1000);

      // Fully pay the order
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 1000 });

      // Credit now = 0 (fully paid)
      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0);

      // Cancel fully paid order - should not change credit (unpaid = 0)
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0); // Still 0, no change
    });

    it('should handle cancellation of unpaid order', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = createRes.body.data._id;

      // Cancel without any payment
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0); // Full amount restored
    });

    it('should floor credit at 0 on cancellation', async () => {
      // Create customer with some existing credit manually
      const customer = await testUtils.createTestCustomer({
        pricingType: 'market',
        currentCredit: 100
      });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      // Credit = 100 + 1000 = 1100

      const orderId = createRes.body.data._id;

      // Cancel order
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(100); // Back to original
    });

    it('should not allow cancelling already cancelled order', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = createRes.body.data._id;

      // First cancellation
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      // Second cancellation attempt
      const secondCancel = await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(secondCancel.status).toBe(400);
      expect(secondCancel.body.message).toMatch(/already.*cancelled/i);
    });
  });

  describe('Price Update - Credit Adjustment', () => {
    it('should increase credit when order price increases (unpaid order)', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 100 }]
        });

      // Credit = 1000

      const orderId = createRes.body.data._id;

      // Update price to 150 per unit
      await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          products: [{ product: product._id, quantity: 10, rate: 150 }]
        });

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(1500); // 1000 + 500
    });

    it('should decrease credit when order price decreases (unpaid order)', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 100 }]
        });

      // Credit = 1000

      const orderId = createRes.body.data._id;

      // Update price to 80 per unit
      await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          products: [{ product: product._id, quantity: 10, rate: 80 }]
        });

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(800); // 1000 - 200
    });

    it('should adjust only unpaid portion when partially paid', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 100 }]
        });

      const orderId = createRes.body.data._id;
      // Credit = 1000

      // Partial payment
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 400 });
      // Credit = 600

      // Increase price to 150 (total becomes 1500)
      // Old unpaid = 1000 - 400 = 600
      // New unpaid = 1500 - 400 = 1100
      // Adjustment = 1100 - 600 = 500
      await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          products: [{ product: product._id, quantity: 10, rate: 150 }]
        });

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(1100); // 600 + 500
    });

    it('should not adjust credit for cancelled orders', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 100 }]
        });

      const orderId = createRes.body.data._id;

      // Cancel order
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      // Credit should be 0 now

      // Try to update cancelled order (should fail)
      const updateRes = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          products: [{ product: product._id, quantity: 10, rate: 200 }]
        });

      // Cancelled orders can't be updated
      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle full lifecycle: create -> partial pay -> cancel', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      // Create order (credit = 1000)
      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      let updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(1000);

      const orderId = createRes.body.data._id;

      // Partial payment (credit = 700)
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 300 });

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(700);

      // Cancel order (restore unpaid 700)
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0);
    });

    it('should handle full lifecycle: create -> update price -> full pay', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      // Create order (credit = 1000)
      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10, rate: 100 }]
        });

      let updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(1000);

      const orderId = createRes.body.data._id;

      // Update price (credit = 1200)
      await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          products: [{ product: product._id, quantity: 10, rate: 120 }]
        });

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(1200);

      // Full payment (credit = 0)
      await request(app)
        .put(`/api/orders/${orderId}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 1200 });

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0);
    });

    it('should handle multiple orders for same customer correctly', async () => {
      const customer = await testUtils.createTestCustomer({ pricingType: 'market' });

      // Order 1: 1000
      const order1Res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      // Order 2: 500
      const order2Res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 5 }]
        });

      let updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(1500);

      // Pay order 1 partially (300)
      await request(app)
        .put(`/api/orders/${order1Res.body.data._id}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 300 });

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(1200); // 1500 - 300

      // Pay order 2 fully
      await request(app)
        .put(`/api/orders/${order2Res.body.data._id}/payment`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ paidAmount: 500 });

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(700); // 1200 - 500

      // Cancel order 1 (restore unpaid 700)
      await request(app)
        .delete(`/api/orders/${order1Res.body.data._id}`)
        .set('Cookie', [`token=${adminToken}`]);

      updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.currentCredit).toBe(0); // 700 - 700
    });
  });
});
