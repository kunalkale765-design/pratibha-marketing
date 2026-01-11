const request = require('supertest');
const app = require('../server');
const Order = require('../models/Order');
const { testUtils } = require('./setup');

describe('Order Endpoints', () => {
  let adminToken;
  let staffToken;
  let customerToken;
  let testCustomer;
  let testProduct;
  let otherCustomer;

  beforeEach(async () => {
    // Create test users
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;

    const customerUser = await testUtils.createCustomerUser({ name: 'Test Customer' });
    customerToken = customerUser.token;
    testCustomer = customerUser.customer;

    // Create another customer for isolation tests
    otherCustomer = await testUtils.createTestCustomer({ name: 'Other Customer' });

    // Create test product
    testProduct = await testUtils.createTestProduct({ name: 'Test Product', unit: 'kg' });

    // Create market rate for the product
    await testUtils.createMarketRate(testProduct, 100);
  });

  describe('GET /api/orders', () => {
    beforeEach(async () => {
      // Create orders for test customer
      await testUtils.createTestOrder(testCustomer, testProduct);
      await testUtils.createTestOrder(testCustomer, testProduct);

      // Create order for other customer
      await testUtils.createTestOrder(otherCustomer, testProduct);
    });

    it('should return all orders for admin', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(3); // All orders
    });

    it('should return all orders for staff', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(3);
    });

    it('should return only own orders for customer', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(200);
      // Customer should only see their own orders
      expect(res.body.data.length).toBe(2);
      res.body.data.forEach(order => {
        expect(order.customer._id || order.customer).toEqual(expect.anything());
      });
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/orders');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/orders/:id', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await testUtils.createTestOrder(testCustomer, testProduct);
    });

    it('should return a specific order for admin', async () => {
      const res = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(testOrder._id.toString());
    });

    it('should return own order for customer', async () => {
      const res = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/orders/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/orders', () => {
    it('should create a new order as admin', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{
            product: testProduct._id,
            quantity: 5,
            rate: 100
          }],
          deliveryAddress: '123 Test St'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderNumber).toMatch(/^ORD\d{4}\d{4}$/);
      expect(res.body.data.totalAmount).toBe(500); // 5 * 100
      expect(res.body.data.status).toBe('pending');
    });

    it('should create order as staff', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customer: testCustomer._id,
          products: [{
            product: testProduct._id,
            quantity: 10,
            rate: 100
          }]
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.totalAmount).toBe(1000);
    });

    it('should create order as customer for themselves', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customer: testCustomer._id,
          products: [{
            product: testProduct._id,
            quantity: 2,
            rate: 100
          }]
        });

      expect(res.statusCode).toBe(201);
    });

    it('should reject customer creating order for another customer', async () => {
      // Customer trying to create order for otherCustomer (security test)
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customer: otherCustomer._id,  // Different customer!
          products: [{
            product: testProduct._id,
            quantity: 2,
            rate: 100
          }]
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('only create orders for yourself');
    });

    it('should reject order without customer', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          products: [{
            product: testProduct._id,
            quantity: 5,
            rate: 100
          }]
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject order without products', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: []
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject negative quantity', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{
            product: testProduct._id,
            quantity: -5,
            rate: 100
          }]
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/orders/:id', () => {
    let testOrder;
    let orderQuantity;

    beforeEach(async () => {
      // Create order with known quantity for price-only updates
      orderQuantity = 10;
      testOrder = await testUtils.createTestOrder(testCustomer, testProduct, {
        totalAmount: 1000,
        notes: 'Original notes',
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: orderQuantity,
          unit: testProduct.unit,
          rate: 100,
          amount: 1000
        }]
      });
    });

    it('should allow admin to update order prices', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          products: [{
            product: testProduct._id,
            quantity: orderQuantity,  // Must match original quantity
            rate: 50
          }]
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalAmount).toBe(500); // 10 * 50
    });

    it('should allow staff to update order prices', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          products: [{
            product: testProduct._id,
            quantity: orderQuantity,  // Must match original quantity
            rate: 200
          }]
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.totalAmount).toBe(2000); // 10 * 200
    });

    it('should deny customer from updating order', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          products: [{
            product: testProduct._id,
            quantity: orderQuantity,
            rate: 100
          }]
        });

      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .put(`/api/orders/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          products: [{
            product: testProduct._id,
            quantity: 5,
            rate: 100
          }]
        });

      expect(res.statusCode).toBe(404);
    });

    it('should update order notes', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          notes: 'Updated notes'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.notes).toBe('Updated notes');
    });

    it('should reject product not in original order', async () => {
      const fakeProductId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          products: [{
            product: fakeProductId,
            quantity: orderQuantity,
            rate: 100
          }]
        });

      expect(res.statusCode).toBe(400); // Product not in order error
      expect(res.body.message).toContain('not in this order');
    });

    it('should reject adding new products (only prices can be updated)', async () => {
      const product2 = await testUtils.createTestProduct({ name: 'Product 2', unit: 'kg' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          products: [
            { product: testProduct._id, quantity: orderQuantity, rate: 100 },
            { product: product2._id, quantity: 10, rate: 50 }
          ]
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Cannot add or remove products');
    });

    it('should reject quantity changes (only prices can be updated)', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          products: [{
            product: testProduct._id,
            quantity: 999,  // Different from original
            rate: 100
          }]
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('cannot be changed');
    });

    it('should use priceAtTime if provided', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          products: [{
            product: testProduct._id,
            quantity: orderQuantity,
            priceAtTime: 200
          }]
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.totalAmount).toBe(2000); // 10 * 200
    });
  });

  describe('PUT /api/orders/:id/status', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await testUtils.createTestOrder(testCustomer, testProduct);
    });

    it('should update order status as admin', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('confirmed');
    });

    it('should update to packed and set packedAt timestamp', async () => {
      // Follow proper state transition: pending -> confirmed -> processing -> packed
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'processing' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'packed' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('packed');
      expect(res.body.data.packedAt).toBeDefined();
    });

    it('should update to shipped and set shippedAt timestamp', async () => {
      // Follow proper state transition: pending -> confirmed -> processing -> packed -> shipped
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'processing' });
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'packed' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'shipped' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('shipped');
      expect(res.body.data.shippedAt).toBeDefined();
    });

    it('should update to delivered and set deliveredAt timestamp', async () => {
      // Follow proper state transition: pending -> confirmed -> processing -> packed -> shipped -> delivered
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'confirmed' });
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'processing' });
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'packed' });
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'shipped' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'delivered' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('delivered');
      expect(res.body.data.deliveredAt).toBeDefined();
    });

    it('should reject invalid status', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid_status' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject status update by customer', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'confirmed' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/orders/:id/payment', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await testUtils.createTestOrder(testCustomer, testProduct, {
        totalAmount: 1000,
        paidAmount: 0,
        paymentStatus: 'unpaid'
      });
    });

    it('should update payment status to partial', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paidAmount: 500 });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.paidAmount).toBe(500);
      expect(res.body.data.paymentStatus).toBe('partial');
    });

    it('should update payment status to paid when fully paid', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/payment`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ paidAmount: 1000 });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.paidAmount).toBe(1000);
      expect(res.body.data.paymentStatus).toBe('paid');
    });

    it('should reject negative payment amount', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paidAmount: -100 });

      expect(res.statusCode).toBe(400);
    });

    it('should reject payment update by customer', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/payment`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paidAmount: 500 });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/orders/:id', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await testUtils.createTestOrder(testCustomer, testProduct);
    });

    it('should cancel an order as admin', async () => {
      const res = await request(app)
        .delete(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);

      // Verify order is cancelled
      const cancelled = await Order.findById(testOrder._id);
      expect(cancelled.status).toBe('cancelled');
    });

    it('should cancel an order as staff', async () => {
      const res = await request(app)
        .delete(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('should reject cancellation by customer', async () => {
      const res = await request(app)
        .delete(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/orders/customer/:id', () => {
    beforeEach(async () => {
      await testUtils.createTestOrder(testCustomer, testProduct);
      await testUtils.createTestOrder(testCustomer, testProduct);
      await testUtils.createTestOrder(otherCustomer, testProduct);
    });

    it('should return orders for specific customer as admin', async () => {
      const res = await request(app)
        .get(`/api/orders/customer/${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('should return orders for specific customer as staff', async () => {
      const res = await request(app)
        .get(`/api/orders/customer/${otherCustomer._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('Order Number Generation', () => {
    it('should generate unique sequential order numbers', async () => {
      const order1 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{ product: testProduct._id, quantity: 1, rate: 100 }]
        });

      const order2 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{ product: testProduct._id, quantity: 1, rate: 100 }]
        });

      expect(order1.body.data.orderNumber).not.toBe(order2.body.data.orderNumber);

      // Extract sequence numbers
      const seq1 = parseInt(order1.body.data.orderNumber.slice(-4));
      const seq2 = parseInt(order2.body.data.orderNumber.slice(-4));

      expect(seq2).toBe(seq1 + 1);
    });
  });

  describe('Order Status State Machine - Invalid Transitions', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await testUtils.createTestOrder(testCustomer, testProduct);
    });

    it('should reject pending -> processing (must confirm first)', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/invalid.*transition|cannot.*transition/i);
    });

    it('should reject pending -> packed (must go through confirm, processing)', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'packed' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject pending -> shipped', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject pending -> delivered', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'delivered' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject confirmed -> packed (must process first)', async () => {
      // First confirm the order
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      // Try to skip to packed
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'packed' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject confirmed -> shipped (must pack first)', async () => {
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject processing -> shipped (must pack first)', async () => {
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject packed -> delivered (must ship first)', async () => {
      // Go through: pending -> confirmed -> processing -> packed
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'packed' });

      // Try to skip to delivered
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'delivered' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject transition from delivered (terminal state)', async () => {
      // Go through full flow to delivered
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'packed' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'delivered' });

      // Try to change from delivered
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'pending' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/cannot.*transition|invalid/i);
    });

    it('should reject transition from cancelled (terminal state)', async () => {
      // Cancel the order
      await request(app)
        .delete(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Try to change from cancelled
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'pending' });

      expect(res.statusCode).toBe(400);
    });

    it('should allow same status update (no-op)', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'pending' });

      // Should succeed but order is unchanged
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('pending');
    });

    it('should allow cancellation from pending', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'cancelled' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.data.cancelledAt).toBeDefined();
    });

    it('should allow cancellation from confirmed', async () => {
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'cancelled' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('should allow cancellation from processing', async () => {
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'cancelled' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('should allow cancellation from packed', async () => {
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'packed' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'cancelled' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('should allow cancellation from shipped', async () => {
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'confirmed' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'packed' });

      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'cancelled' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
    });
  });

  describe('Idempotency', () => {
    it('should return existing order for duplicate idempotencyKey', async () => {
      const idempotencyKey = `test-${Date.now()}`;

      // First request
      const res1 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{ product: testProduct._id, quantity: 10, rate: 100 }],
          idempotencyKey
        });

      expect(res1.statusCode).toBe(201);
      const orderId = res1.body.data._id;

      // Second request with same key
      const res2 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{ product: testProduct._id, quantity: 20, rate: 200 }], // Different data
          idempotencyKey
        });

      // Should return existing order, not create new one
      expect(res2.statusCode).toBe(200);
      expect(res2.body.data._id).toBe(orderId);
      expect(res2.body.idempotent).toBe(true);
    });

    it('should create separate orders for different idempotencyKeys', async () => {
      const res1 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{ product: testProduct._id, quantity: 10, rate: 100 }],
          idempotencyKey: `key1-${Date.now()}`
        });

      const res2 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{ product: testProduct._id, quantity: 10, rate: 100 }],
          idempotencyKey: `key2-${Date.now()}`
        });

      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);
      expect(res1.body.data._id).not.toBe(res2.body.data._id);
    });

    it('should create order normally without idempotencyKey', async () => {
      const res1 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{ product: testProduct._id, quantity: 10, rate: 100 }]
        });

      const res2 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id,
          products: [{ product: testProduct._id, quantity: 10, rate: 100 }]
        });

      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);
      expect(res1.body.data._id).not.toBe(res2.body.data._id);
    });
  });
});
