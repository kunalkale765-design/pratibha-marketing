const request = require('supertest');
const app = require('../server');
const Order = require('../models/Order');
const Batch = require('../models/Batch');
const { testUtils } = require('./setup');

describe('Packing Endpoints', () => {
  let adminToken;
  let staffToken;
  let customerToken;
  let testCustomer;
  let testProduct;
  let testProduct2;
  let testBatch;

  beforeEach(async () => {
    // Create test users
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;

    const customerUser = await testUtils.createCustomerUser({ name: 'Test Customer' });
    customerToken = customerUser.token;
    testCustomer = customerUser.customer;

    // Create test products
    testProduct = await testUtils.createTestProduct({ name: 'Test Product 1', unit: 'kg' });
    testProduct2 = await testUtils.createTestProduct({ name: 'Test Product 2', unit: 'piece' });

    // Create market rates
    await testUtils.createMarketRate(testProduct, 100);
    await testUtils.createMarketRate(testProduct2, 50);

    // Create a test batch
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoffTime = new Date(today);
    cutoffTime.setHours(8, 0, 0, 0);
    testBatch = await Batch.create({
      batchNumber: `B${Date.now()}`,
      batchType: '1st',
      date: today,
      cutoffTime: cutoffTime,
      status: 'confirmed'
    });
  });

  // Helper to create a confirmed order ready for packing
  const createConfirmedOrder = async (options = {}) => {
    const order = await Order.create({
      customer: testCustomer._id,
      batch: testBatch._id,
      products: options.products || [{
        product: testProduct._id,
        productName: testProduct.name,
        quantity: 10,
        unit: testProduct.unit,
        rate: 100,
        amount: 1000,
        packed: false
      }, {
        product: testProduct2._id,
        productName: testProduct2.name,
        quantity: 5,
        unit: testProduct2.unit,
        rate: 50,
        amount: 250,
        packed: false
      }],
      totalAmount: options.totalAmount || 1250,
      status: 'confirmed',
      paymentStatus: 'unpaid',
      packingDone: options.packingDone || false,
      ...options
    });
    return order;
  };

  describe('GET /api/packing/queue', () => {
    beforeEach(async () => {
      // Create orders in different states
      await createConfirmedOrder(); // Confirmed, not packed
      await createConfirmedOrder(); // Another confirmed order
      await createConfirmedOrder({ packingDone: true }); // Already packed

      // Create a pending order (should not appear)
      await Order.create({
        customer: testCustomer._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 5,
          unit: testProduct.unit,
          rate: 100,
          amount: 500
        }],
        totalAmount: 500,
        status: 'pending',
        paymentStatus: 'unpaid'
      });
    });

    it('should return confirmed orders ready for packing for admin', async () => {
      const res = await request(app)
        .get('/api/packing/queue')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2); // Only unpacked confirmed orders
      expect(res.body.data).toHaveLength(2);

      // Verify all returned orders are confirmed and not packed
      res.body.data.forEach(order => {
        expect(order.status).toBe('confirmed');
        expect(order.packingDone).toBe(false);
      });
    });

    it('should return queue for staff', async () => {
      const res = await request(app)
        .get('/api/packing/queue')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
    });

    it('should filter by batch when provided', async () => {
      // Create another batch with an order
      const anotherDate = new Date();
      const anotherCutoff = new Date(anotherDate);
      anotherCutoff.setHours(12, 0, 0, 0);
      const anotherBatch = await Batch.create({
        batchNumber: `B${Date.now() + 1}`,
        batchType: '2nd',
        date: anotherDate,
        cutoffTime: anotherCutoff,
        status: 'confirmed'
      });

      await Order.create({
        customer: testCustomer._id,
        batch: anotherBatch._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 5,
          unit: testProduct.unit,
          rate: 100,
          amount: 500
        }],
        totalAmount: 500,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      const res = await request(app)
        .get(`/api/packing/queue?batch=${testBatch._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.count).toBe(2); // Only orders from testBatch
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/packing/queue?limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should include grouped response by batch', async () => {
      const res = await request(app)
        .get('/api/packing/queue')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.grouped).toBeDefined();
      expect(Array.isArray(res.body.grouped)).toBe(true);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/packing/queue')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/packing/queue');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/packing/stats', () => {
    beforeEach(async () => {
      // Create orders today
      await createConfirmedOrder(); // Pending packing
      await createConfirmedOrder(); // Pending packing
      await createConfirmedOrder({ packingDone: true }); // Packing done
      await createConfirmedOrder({ packingDone: true }); // Packing done (awaiting reconciliation)
    });

    it('should return packing statistics for admin', async () => {
      const res = await request(app)
        .get('/api/packing/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data.pendingPacking).toBe('number');
      expect(typeof res.body.data.packingDone).toBe('number');
      expect(typeof res.body.data.total).toBe('number');
    });

    it('should return stats for staff', async () => {
      const res = await request(app)
        .get('/api/packing/stats')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/packing/stats')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/packing/:orderId', () => {
    let confirmedOrder;

    beforeEach(async () => {
      confirmedOrder = await createConfirmedOrder();
    });

    it('should return packing details for admin', async () => {
      const res = await request(app)
        .get(`/api/packing/${confirmedOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(confirmedOrder._id.toString());
      expect(res.body.data.orderNumber).toBeDefined();
      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);

      // Check item structure
      res.body.data.items.forEach(item => {
        expect(item).toHaveProperty('productName');
        expect(item).toHaveProperty('orderedQuantity');
        expect(item).toHaveProperty('unit');
        expect(item).toHaveProperty('packed');
      });
    });

    it('should return packing details for staff', async () => {
      const res = await request(app)
        .get(`/api/packing/${confirmedOrder._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/packing/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid order ID', async () => {
      const res = await request(app)
        .get('/api/packing/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get(`/api/packing/${confirmedOrder._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/packing/:orderId/item/:productId', () => {
    let confirmedOrder;

    beforeEach(async () => {
      confirmedOrder = await createConfirmedOrder();
    });

    it('should update item quantity for admin', async () => {
      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 8, notes: 'Adjusted during packing' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.oldQuantity).toBe(10);
      expect(res.body.data.product.newQuantity).toBe(8);
      expect(res.body.data.orderTotal).toBeDefined();

      // Verify database update
      const updatedOrder = await Order.findById(confirmedOrder._id);
      const updatedItem = updatedOrder.products.find(
        p => p.product.toString() === testProduct._id.toString()
      );
      expect(updatedItem.quantity).toBe(8);
      expect(updatedItem.amount).toBe(800); // 8 * 100
    });

    it('should update item quantity for staff', async () => {
      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ quantity: 7 });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should update packed status without changing quantity', async () => {
      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ packed: true });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.packed).toBe(true);

      // Verify database
      const updatedOrder = await Order.findById(confirmedOrder._id);
      const updatedItem = updatedOrder.products.find(
        p => p.product.toString() === testProduct._id.toString()
      );
      expect(updatedItem.packed).toBe(true);
      expect(updatedItem.quantity).toBe(10); // Unchanged
    });

    it('should update both quantity and packed status', async () => {
      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 9, packed: true });

      expect(res.statusCode).toBe(200);

      const updatedOrder = await Order.findById(confirmedOrder._id);
      const updatedItem = updatedOrder.products.find(
        p => p.product.toString() === testProduct._id.toString()
      );
      expect(updatedItem.quantity).toBe(9);
      expect(updatedItem.packed).toBe(true);
    });

    it('should recalculate order total after quantity change', async () => {
      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 5 });

      expect(res.statusCode).toBe(200);

      // Original: 10*100 + 5*50 = 1250
      // After: 5*100 + 5*50 = 750
      const updatedOrder = await Order.findById(confirmedOrder._id);
      expect(updatedOrder.totalAmount).toBe(750);
    });

    it('should create audit log entry for quantity change', async () => {
      await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 8, notes: 'Test adjustment' });

      const updatedOrder = await Order.findById(confirmedOrder._id);
      expect(updatedOrder.priceAuditLog).toBeDefined();
      expect(updatedOrder.priceAuditLog.length).toBeGreaterThan(0);

      const lastLog = updatedOrder.priceAuditLog[updatedOrder.priceAuditLog.length - 1];
      expect(lastLog.oldQuantity).toBe(10);
      expect(lastLog.newQuantity).toBe(8);
      expect(lastLog.reason).toContain('Test adjustment');
    });

    it('should reject update for non-confirmed order', async () => {
      const pendingOrder = await Order.create({
        customer: testCustomer._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: testProduct.unit,
          rate: 100,
          amount: 1000
        }],
        totalAmount: 1000,
        status: 'pending',
        paymentStatus: 'unpaid'
      });

      const res = await request(app)
        .put(`/api/packing/${pendingOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 5 });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('confirmed');
    });

    it('should return 404 for product not in order', async () => {
      const unrelatedProduct = await testUtils.createTestProduct({ name: 'Unrelated Product' });

      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${unrelatedProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 5 });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Product not found');
    });

    it('should reject negative quantity', async () => {
      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: -5 });

      expect(res.statusCode).toBe(400);
    });

    it('should allow quantity of 0', async () => {
      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 0 });

      expect(res.statusCode).toBe(200);

      const updatedOrder = await Order.findById(confirmedOrder._id);
      const updatedItem = updatedOrder.products.find(
        p => p.product.toString() === testProduct._id.toString()
      );
      expect(updatedItem.quantity).toBe(0);
      expect(updatedItem.amount).toBe(0);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quantity: 5 });

      expect(res.statusCode).toBe(403);
    });

    it('should validate notes length', async () => {
      const res = await request(app)
        .put(`/api/packing/${confirmedOrder._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 5, notes: 'x'.repeat(501) });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/packing/:orderId/done', () => {
    let confirmedOrder;

    beforeEach(async () => {
      // Create order with all items packed
      confirmedOrder = await createConfirmedOrder({
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: testProduct.unit,
          rate: 100,
          amount: 1000,
          packed: true
        }, {
          product: testProduct2._id,
          productName: testProduct2.name,
          quantity: 5,
          unit: testProduct2.unit,
          rate: 50,
          amount: 250,
          packed: true
        }]
      });
    });

    it('should mark packing as done for admin when all items packed', async () => {
      const res = await request(app)
        .post(`/api/packing/${confirmedOrder._id}/done`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.packingDone).toBe(true);
      expect(res.body.data.packingDoneAt).toBeDefined();
      expect(res.body.data.packedBy).toBeDefined();

      // Verify database
      const updatedOrder = await Order.findById(confirmedOrder._id);
      expect(updatedOrder.packingDone).toBe(true);
      expect(updatedOrder.packingDoneAt).toBeDefined();
      expect(updatedOrder.packingDoneBy).toBeDefined();
    });

    it('should mark packing as done for staff', async () => {
      const res = await request(app)
        .post(`/api/packing/${confirmedOrder._id}/done`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject if items not all packed', async () => {
      // Create order with unpacked items
      const unpackedOrder = await createConfirmedOrder({
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: testProduct.unit,
          rate: 100,
          amount: 1000,
          packed: true
        }, {
          product: testProduct2._id,
          productName: testProduct2.name,
          quantity: 5,
          unit: testProduct2.unit,
          rate: 50,
          amount: 250,
          packed: false  // Not packed!
        }]
      });

      const res = await request(app)
        .post(`/api/packing/${unpackedOrder._id}/done`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('not marked as packed');
      expect(res.body.data.unpackedCount).toBe(1);
      expect(res.body.data.unpackedItems).toBeDefined();
    });

    it('should reject for non-confirmed order', async () => {
      const pendingOrder = await Order.create({
        customer: testCustomer._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: testProduct.unit,
          rate: 100,
          amount: 1000,
          packed: true
        }],
        totalAmount: 1000,
        status: 'pending',
        paymentStatus: 'unpaid'
      });

      const res = await request(app)
        .post(`/api/packing/${pendingOrder._id}/done`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('confirmed');
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post(`/api/packing/${fakeId}/done`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .post(`/api/packing/${confirmedOrder._id}/done`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/packing/:orderId/reprint-bill', () => {
    let confirmedOrder;

    beforeEach(async () => {
      confirmedOrder = await createConfirmedOrder();
    });

    it('should generate delivery bill PDF for admin', async () => {
      const res = await request(app)
        .post(`/api/packing/${confirmedOrder._id}/reprint-bill`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
      expect(res.body).toBeDefined();
    });

    it('should generate bill for staff', async () => {
      const res = await request(app)
        .post(`/api/packing/${confirmedOrder._id}/reprint-bill`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post(`/api/packing/${fakeId}/reprint-bill`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .post(`/api/packing/${confirmedOrder._id}/reprint-bill`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Packing Workflow Integration', () => {
    it('should complete full packing workflow', async () => {
      // 1. Create confirmed order
      const order = await createConfirmedOrder();

      // 2. Get queue and verify order appears
      let res = await request(app)
        .get('/api/packing/queue')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.body.count).toBeGreaterThan(0);

      // 3. Get packing details
      res = await request(app)
        .get(`/api/packing/${order._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);

      // 4. Mark first item as packed
      res = await request(app)
        .put(`/api/packing/${order._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ packed: true });

      expect(res.statusCode).toBe(200);

      // 5. Mark second item as packed
      res = await request(app)
        .put(`/api/packing/${order._id}/item/${testProduct2._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ packed: true });

      expect(res.statusCode).toBe(200);

      // 6. Mark packing as done
      res = await request(app)
        .post(`/api/packing/${order._id}/done`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.packingDone).toBe(true);

      // 7. Verify order no longer in queue
      res = await request(app)
        .get('/api/packing/queue')
        .set('Authorization', `Bearer ${staffToken}`);

      const orderInQueue = res.body.data.find(o => o._id.toString() === order._id.toString());
      expect(orderInQueue).toBeUndefined();
    });

    it('should handle quantity adjustment during packing', async () => {
      const order = await createConfirmedOrder();

      // Adjust quantity (customer returns 2 units)
      const res = await request(app)
        .put(`/api/packing/${order._id}/item/${testProduct._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ quantity: 8, notes: 'Customer returned 2 units' });

      expect(res.statusCode).toBe(200);

      // Verify total recalculated
      const updatedOrder = await Order.findById(order._id);
      // Original: 10*100 + 5*50 = 1250
      // After: 8*100 + 5*50 = 1050
      expect(updatedOrder.totalAmount).toBe(1050);

      // Verify audit log
      expect(updatedOrder.priceAuditLog.length).toBe(1);
    });
  });
});
