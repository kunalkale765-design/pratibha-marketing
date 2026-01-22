const request = require('supertest');
const app = require('../server');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const LedgerEntry = require('../models/LedgerEntry');
const Batch = require('../models/Batch');
const { testUtils } = require('./setup');

describe('Reconciliation Endpoints', () => {
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
    testBatch = await Batch.create({
      batchNumber: `B${Date.now()}`,
      batchType: '1st',
      date: today,
      status: 'confirmed'
    });
  });

  // Helper to create an order ready for reconciliation
  const createPackedOrder = async (options = {}) => {
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
        packed: true
      }, {
        product: testProduct2._id,
        productName: testProduct2.name,
        quantity: 5,
        unit: testProduct2.unit,
        rate: 50,
        amount: 250,
        packed: true
      }],
      totalAmount: options.totalAmount || 1250,
      status: 'confirmed',
      paymentStatus: 'unpaid',
      packingDone: true,
      packingDoneAt: new Date(),
      ...options
    });
    return order;
  };

  describe('GET /api/reconciliation/pending', () => {
    beforeEach(async () => {
      // Create orders in different states
      await createPackedOrder(); // Ready for reconciliation
      await createPackedOrder(); // Another ready order

      // Create order already reconciled
      await createPackedOrder({
        status: 'delivered',
        reconciliation: {
          completedAt: new Date(),
          completedBy: 'someUserId',
          changes: [],
          originalTotal: 1250
        }
      });

      // Create order not yet packed
      await Order.create({
        customer: testCustomer._id,
        batch: testBatch._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: testProduct.unit,
          rate: 100,
          amount: 1000
        }],
        totalAmount: 1000,
        status: 'confirmed',
        packingDone: false,
        paymentStatus: 'unpaid'
      });
    });

    it('should return orders awaiting reconciliation for admin', async () => {
      const res = await request(app)
        .get('/api/reconciliation/pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2); // Only packed, not reconciled orders
    });

    it('should return pending orders for staff', async () => {
      const res = await request(app)
        .get('/api/reconciliation/pending')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
    });

    it('should filter by batch', async () => {
      // Create another batch with an order
      const anotherBatch = await Batch.create({
        batchNumber: `B${Date.now() + 1}`,
        batchType: '2nd',
        date: new Date(),
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
          amount: 500,
          packed: true
        }],
        totalAmount: 500,
        status: 'confirmed',
        packingDone: true,
        packingDoneAt: new Date(),
        paymentStatus: 'unpaid'
      });

      const res = await request(app)
        .get(`/api/reconciliation/pending?batch=${testBatch._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.count).toBe(2); // Only orders from testBatch
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/reconciliation/pending?limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/reconciliation/pending')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/reconciliation/pending');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/reconciliation/:orderId', () => {
    let packedOrder;

    beforeEach(async () => {
      packedOrder = await createPackedOrder();
    });

    it('should return reconciliation details for admin', async () => {
      const res = await request(app)
        .get(`/api/reconciliation/${packedOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(packedOrder._id.toString());
      expect(res.body.data.products).toBeDefined();
      expect(Array.isArray(res.body.data.products)).toBe(true);

      // Check product structure
      res.body.data.products.forEach(p => {
        expect(p).toHaveProperty('productName');
        expect(p).toHaveProperty('orderedQty');
        expect(p).toHaveProperty('deliveredQty');
        expect(p).toHaveProperty('rate');
        expect(p).toHaveProperty('amount');
      });
    });

    it('should return details for staff', async () => {
      const res = await request(app)
        .get(`/api/reconciliation/${packedOrder._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
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
          amount: 1000
        }],
        totalAmount: 1000,
        status: 'pending',
        paymentStatus: 'unpaid'
      });

      const res = await request(app)
        .get(`/api/reconciliation/${pendingOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('confirmed');
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/reconciliation/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid order ID', async () => {
      const res = await request(app)
        .get('/api/reconciliation/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get(`/api/reconciliation/${packedOrder._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/reconciliation/:orderId/complete', () => {
    let packedOrder;

    beforeEach(async () => {
      // Reset customer balance
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 0 });
      packedOrder = await createPackedOrder();
    });

    it('should complete reconciliation with same quantities for admin', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 10 },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ]
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('delivered');
      expect(res.body.data.originalTotal).toBe(1250);
      expect(res.body.data.finalTotal).toBe(1250);
      expect(res.body.data.adjustments).toBe(0);

      // Verify order status
      const updatedOrder = await Order.findById(packedOrder._id);
      expect(updatedOrder.status).toBe('delivered');
      expect(updatedOrder.deliveredAt).toBeDefined();
      expect(updatedOrder.reconciliation.completedAt).toBeDefined();
    });

    it('should complete reconciliation for staff', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 10 },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ]
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should handle quantity adjustments', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 8, reason: 'Customer returned 2 units' },
            { product: testProduct2._id.toString(), deliveredQty: 3, reason: 'Damaged items' }
          ]
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.originalTotal).toBe(1250);
      // New total: 8*100 + 3*50 = 950
      expect(res.body.data.finalTotal).toBe(950);
      expect(res.body.data.adjustments).toBe(2);
      expect(res.body.data.changes).toHaveLength(2);

      // Verify order products updated
      const updatedOrder = await Order.findById(packedOrder._id);
      const product1 = updatedOrder.products.find(p => p.product.toString() === testProduct._id.toString());
      const product2 = updatedOrder.products.find(p => p.product.toString() === testProduct2._id.toString());
      expect(product1.quantity).toBe(8);
      expect(product2.quantity).toBe(3);
    });

    it('should create ledger entry', async () => {
      await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 10 },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ]
        });

      // Check ledger entry created
      const ledgerEntry = await LedgerEntry.findOne({
        customer: testCustomer._id,
        order: packedOrder._id
      });

      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry.type).toBe('invoice');
      expect(ledgerEntry.amount).toBe(1250);
      expect(ledgerEntry.orderNumber).toBe(packedOrder.orderNumber);
    });

    it('should update customer balance', async () => {
      // Set initial balance
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 500 });

      await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 10 },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ]
        });

      // Check customer balance updated
      const updatedCustomer = await Customer.findById(testCustomer._id);
      expect(updatedCustomer.balance).toBe(1750); // 500 + 1250
    });

    it('should track changes in reconciliation object', async () => {
      await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 8, reason: 'Short delivery' },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ]
        });

      const updatedOrder = await Order.findById(packedOrder._id);
      expect(updatedOrder.reconciliation.changes).toHaveLength(1);
      expect(updatedOrder.reconciliation.changes[0].orderedQty).toBe(10);
      expect(updatedOrder.reconciliation.changes[0].deliveredQty).toBe(8);
      expect(updatedOrder.reconciliation.changes[0].reason).toBe('Short delivery');
    });

    it('should reject already reconciled order', async () => {
      // Complete first reconciliation
      await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 10 },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ]
        });

      // Try again
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 10 },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ]
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('already been reconciled');
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
          amount: 1000
        }],
        totalAmount: 1000,
        status: 'pending',
        paymentStatus: 'unpaid'
      });

      const res = await request(app)
        .post(`/api/reconciliation/${pendingOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product: testProduct._id.toString(), deliveredQty: 10 }]
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('confirmed');
    });

    it('should reject empty items array', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: []
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject negative delivered quantity', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: -5 }
          ]
        });

      expect(res.statusCode).toBe(400);
    });

    it('should allow delivered quantity of 0', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 0 },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ]
        });

      expect(res.statusCode).toBe(200);

      const updatedOrder = await Order.findById(packedOrder._id);
      const product1 = updatedOrder.products.find(p => p.product.toString() === testProduct._id.toString());
      expect(product1.quantity).toBe(0);
      expect(product1.amount).toBe(0);
    });

    it('should add notes to order', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 10 },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ],
          notes: 'Delivery completed on time'
        });

      expect(res.statusCode).toBe(200);

      const updatedOrder = await Order.findById(packedOrder._id);
      expect(updatedOrder.notes).toContain('Delivery completed on time');
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post(`/api/reconciliation/${fakeId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product: testProduct._id.toString(), deliveredQty: 10 }]
        });

      expect(res.statusCode).toBe(404);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ product: testProduct._id.toString(), deliveredQty: 10 }]
        });

      expect(res.statusCode).toBe(403);
    });

    it('should validate reason length', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 8, reason: 'x'.repeat(201) }
          ]
        });

      expect(res.statusCode).toBe(400);
    });

    it('should validate notes length', async () => {
      const res = await request(app)
        .post(`/api/reconciliation/${packedOrder._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product: testProduct._id.toString(), deliveredQty: 10 }],
          notes: 'x'.repeat(1001)
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Reconciliation Workflow Integration', () => {
    it('should complete full reconciliation workflow', async () => {
      // Reset customer balance
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 100 });

      // 1. Create packed order
      const order = await createPackedOrder();

      // 2. Get pending orders
      let res = await request(app)
        .get('/api/reconciliation/pending')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.body.count).toBeGreaterThan(0);

      // 3. Get order details for reconciliation
      res = await request(app)
        .get(`/api/reconciliation/${order._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.products).toHaveLength(2);

      // 4. Complete reconciliation with adjustments
      res = await request(app)
        .post(`/api/reconciliation/${order._id}/complete`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          items: [
            { product: testProduct._id.toString(), deliveredQty: 9, reason: 'Quality issue' },
            { product: testProduct2._id.toString(), deliveredQty: 5 }
          ],
          notes: 'Partial delivery due to quality issues'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('delivered');
      // New total: 9*100 + 5*50 = 1150
      expect(res.body.data.finalTotal).toBe(1150);

      // 5. Verify order no longer in pending
      res = await request(app)
        .get('/api/reconciliation/pending')
        .set('Authorization', `Bearer ${staffToken}`);

      const orderInPending = res.body.data.find(o => o._id.toString() === order._id.toString());
      expect(orderInPending).toBeUndefined();

      // 6. Verify ledger entry
      const ledgerEntry = await LedgerEntry.findOne({ order: order._id });
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry.amount).toBe(1150);

      // 7. Verify customer balance updated (100 + 1150 = 1250)
      const customer = await Customer.findById(testCustomer._id);
      expect(customer.balance).toBe(1250);
    });

    it('should handle order without customer gracefully', async () => {
      // Create order without customer for edge case
      const orderWithoutCustomer = await Order.create({
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
        status: 'confirmed',
        packingDone: true,
        packingDoneAt: new Date(),
        paymentStatus: 'unpaid'
      });

      // Should still complete but without ledger entry
      const res = await request(app)
        .post(`/api/reconciliation/${orderWithoutCustomer._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ product: testProduct._id.toString(), deliveredQty: 10 }]
        });

      expect(res.statusCode).toBe(200);

      // Order should be marked as delivered
      const updatedOrder = await Order.findById(orderWithoutCustomer._id);
      expect(updatedOrder.status).toBe('delivered');
    });
  });
});
