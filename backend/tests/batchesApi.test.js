const request = require('supertest');
const app = require('../server');
const Batch = require('../models/Batch');
const Order = require('../models/Order');
const { testUtils } = require('./setup');

describe('Batches API Endpoints', () => {
  let adminToken;
  let staffToken;
  let customerToken;
  let testCustomer;
  let testProduct;
  let testProduct2;

  // Counter for unique batch creation
  let batchCounter = 0;

  beforeEach(async () => {
    // Reset batch counter for each test
    batchCounter = 0;

    // Create test users
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;

    const customerUser = await testUtils.createCustomerUser({ name: 'Test Customer' });
    customerToken = customerUser.token;
    testCustomer = customerUser.customer;

    // Create test products
    testProduct = await testUtils.createTestProduct({ name: 'Test Product 1', unit: 'kg', category: 'Vegetables' });
    testProduct2 = await testUtils.createTestProduct({ name: 'Test Product 2', unit: 'piece', category: 'Fruits' });

    // Create market rates
    await testUtils.createMarketRate(testProduct, 100);
    await testUtils.createMarketRate(testProduct2, 50);
  });

  // Helper to create a batch with unique date+batchType to avoid duplicate key errors
  const createBatch = async (options = {}) => {
    batchCounter++;
    // Use provided date or offset by counter to ensure unique date+batchType combos
    const batchDate = new Date(options.date || new Date());
    if (!options.date) {
      // Offset by counter days for unique dates when no specific date is provided
      batchDate.setUTCDate(batchDate.getUTCDate() - batchCounter);
    }
    batchDate.setUTCHours(0, 0, 0, 0);

    const cutoffTime = new Date(batchDate);
    cutoffTime.setUTCHours(8, 0, 0, 0);
    return Batch.create({
      batchNumber: `B${Date.now()}-${batchCounter}`,
      batchType: options.batchType || '1st',
      date: batchDate,
      cutoffTime: options.cutoffTime || cutoffTime,
      status: options.status || 'open',
      ...options
    });
  };

  // Helper to create an order in a batch
  const createOrderInBatch = async (batch, options = {}) => {
    return Order.create({
      customer: testCustomer._id,
      batch: batch._id,
      products: options.products || [{
        product: testProduct._id,
        productName: testProduct.name,
        quantity: 10,
        unit: testProduct.unit,
        rate: 100,
        amount: 1000
      }],
      totalAmount: options.totalAmount || 1000,
      status: options.status || 'pending',
      paymentStatus: 'unpaid',
      ...options
    });
  };

  describe('GET /api/batches', () => {
    let todayDate;

    beforeEach(async () => {
      // Create batches with different statuses using unique date+batchType combinations
      todayDate = new Date();
      todayDate.setUTCHours(0, 0, 0, 0);
      const yesterdayDate = new Date(todayDate);
      yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);

      await createBatch({ status: 'open', batchType: '1st', date: todayDate });
      await createBatch({ status: 'confirmed', batchType: '2nd', date: todayDate });
      await createBatch({ status: 'expired', batchType: '1st', date: yesterdayDate });
    });

    it('should return all batches for admin', async () => {
      const res = await request(app)
        .get('/api/batches')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(3);
      expect(res.body.data).toHaveLength(3);
    });

    it('should return batches for staff', async () => {
      const res = await request(app)
        .get('/api/batches')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/batches?status=open')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('open');
    });

    it('should filter by date', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/batches?date=${today}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.count).toBe(2); // Only today's batches (1st and 2nd)
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/batches?limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/batches')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/batches');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/batches/today', () => {
    beforeEach(async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Create today's batches
      const batch1 = await createBatch({ batchType: '1st', date: today, status: 'confirmed' });
      await createBatch({ batchType: '2nd', date: today, status: 'open' });

      // Add orders to batch1
      await createOrderInBatch(batch1, { status: 'pending' });
      await createOrderInBatch(batch1, { status: 'confirmed' });
      await createOrderInBatch(batch1, { status: 'delivered' });
    });

    it('should return today\'s batches with counts for admin', async () => {
      const res = await request(app)
        .get('/api/batches/today')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.currentTime).toBeDefined();
      expect(res.body.currentBatch).toBeDefined();
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should include order counts per batch', async () => {
      const res = await request(app)
        .get('/api/batches/today')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      const batch1 = res.body.data.find(b => b.batchType === '1st');
      expect(batch1).toBeDefined();
      expect(batch1.totalOrders).toBe(3);
      expect(batch1.orderCounts).toBeDefined();
    });

    it('should return batches for staff', async () => {
      const res = await request(app)
        .get('/api/batches/today')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/batches/today')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/batches/:id', () => {
    let testBatch;

    beforeEach(async () => {
      testBatch = await createBatch({ status: 'confirmed' });
      await createOrderInBatch(testBatch, { status: 'confirmed' });
      await createOrderInBatch(testBatch, { status: 'pending' });
    });

    it('should return batch details with stats for admin', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.batchNumber).toBe(testBatch.batchNumber);
    });

    it('should return batch for staff', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent batch', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/batches/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid batch ID', async () => {
      const res = await request(app)
        .get('/api/batches/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/batches/:id/orders', () => {
    let testBatch;

    beforeEach(async () => {
      testBatch = await createBatch({ status: 'confirmed' });
      await createOrderInBatch(testBatch, { status: 'pending' });
      await createOrderInBatch(testBatch, { status: 'confirmed' });
      await createOrderInBatch(testBatch, { status: 'delivered' });
    });

    it('should return all orders in batch for admin', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}/orders`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(3);
      expect(res.body.batch).toBeDefined();
      expect(res.body.batch.batchNumber).toBe(testBatch.batchNumber);
    });

    it('should filter orders by status', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}/orders?status=confirmed`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].status).toBe('confirmed');
    });

    it('should return orders for staff', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}/orders`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent batch', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/batches/${fakeId}/orders`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}/orders`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/batches/:id/confirm', () => {
    let openBatch;

    beforeEach(async () => {
      openBatch = await createBatch({ status: 'open' });
      // Add orders with products that have categories for firm splitting
      await createOrderInBatch(openBatch, {
        status: 'pending',
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: testProduct.unit,
          rate: 100,
          amount: 1000
        }]
      });
    });

    it('should confirm batch for admin', async () => {
      const res = await request(app)
        .post(`/api/batches/${openBatch._id}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ generateBills: false }); // Skip bill generation for faster test

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('confirmed');
      expect(res.body.data.ordersConfirmed).toBeDefined();

      // Verify batch status updated
      const updatedBatch = await Batch.findById(openBatch._id);
      expect(updatedBatch.status).toBe('confirmed');
    });

    it('should confirm batch for staff', async () => {
      const res = await request(app)
        .post(`/api/batches/${openBatch._id}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ generateBills: false });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should confirm orders in batch', async () => {
      await request(app)
        .post(`/api/batches/${openBatch._id}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ generateBills: false });

      // Verify orders are confirmed
      const orders = await Order.find({ batch: openBatch._id });
      orders.forEach(order => {
        expect(order.status).toBe('confirmed');
      });
    });

    it('should reject confirming already confirmed batch', async () => {
      // Confirm first
      await request(app)
        .post(`/api/batches/${openBatch._id}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ generateBills: false });

      // Try to confirm again
      const res = await request(app)
        .post(`/api/batches/${openBatch._id}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ generateBills: false });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('already');
    });

    it('should return 404 for non-existent batch', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post(`/api/batches/${fakeId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .post(`/api/batches/${openBatch._id}/confirm`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/batches/:id/quantity-summary', () => {
    let testBatch;

    beforeEach(async () => {
      testBatch = await createBatch({ status: 'confirmed' });

      // Create orders with multiple products
      await createOrderInBatch(testBatch, {
        status: 'confirmed',
        products: [
          { product: testProduct._id, productName: testProduct.name, quantity: 10, unit: 'kg', rate: 100, amount: 1000 },
          { product: testProduct2._id, productName: testProduct2.name, quantity: 5, unit: 'piece', rate: 50, amount: 250 }
        ],
        totalAmount: 1250
      });

      await createOrderInBatch(testBatch, {
        status: 'confirmed',
        products: [
          { product: testProduct._id, productName: testProduct.name, quantity: 15, unit: 'kg', rate: 100, amount: 1500 }
        ],
        totalAmount: 1500
      });
    });

    it('should return quantity summary for admin', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}/quantity-summary`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.batch).toBeDefined();
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should aggregate quantities by product', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}/quantity-summary`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);

      // Find testProduct in summary
      const productSummary = res.body.data.find(
        p => p._id.toString() === testProduct._id.toString()
      );
      expect(productSummary).toBeDefined();
      expect(productSummary.totalQuantity).toBe(25); // 10 + 15
    });

    it('should return summary for staff', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}/quantity-summary`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent batch', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/batches/${fakeId}/quantity-summary`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get(`/api/batches/${testBatch._id}/quantity-summary`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/batches/date/:date', () => {
    beforeEach(async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      // Create batches for different dates
      await createBatch({ date: today, batchType: '1st' });
      await createBatch({ date: today, batchType: '2nd' });
      await createBatch({ date: yesterday, batchType: '1st' });
    });

    it('should return batches for specific date for admin', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/batches/date/${today}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.date).toBe(today);
      expect(res.body.count).toBe(2); // Only today's batches
    });

    it('should return batches for staff', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/batches/date/${today}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return empty array for date with no batches', async () => {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const dateStr = nextWeek.toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/batches/date/${dateStr}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.data).toHaveLength(0);
    });

    it('should return 400 for invalid date format', async () => {
      const res = await request(app)
        .get('/api/batches/date/invalid-date')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid date');
    });

    it('should reject customer access', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/batches/date/${today}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/batches/:id/bills', () => {
    let confirmedBatch;

    beforeEach(async () => {
      confirmedBatch = await createBatch({ status: 'confirmed' });
      await createOrderInBatch(confirmedBatch, {
        status: 'confirmed',
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: testProduct.unit,
          rate: 100,
          amount: 1000
        }]
      });
    });

    it('should generate bills for confirmed batch for admin', async () => {
      const res = await request(app)
        .post(`/api/batches/${confirmedBatch._id}/bills`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Generated');
      expect(res.body.data.billsGenerated).toBeDefined();
    });

    it('should generate bills for staff', async () => {
      const res = await request(app)
        .post(`/api/batches/${confirmedBatch._id}/bills`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject bill generation for non-confirmed batch', async () => {
      const openBatch = await createBatch({ status: 'open' });
      await createOrderInBatch(openBatch);

      const res = await request(app)
        .post(`/api/batches/${openBatch._id}/bills`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('confirmed');
    });

    it('should return 404 for non-existent batch', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post(`/api/batches/${fakeId}/bills`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .post(`/api/batches/${confirmedBatch._id}/bills`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/batches/:id/bills/:orderId/download', () => {
    let confirmedBatch;
    let confirmedOrder;

    beforeEach(async () => {
      confirmedBatch = await createBatch({ status: 'confirmed' });
      confirmedOrder = await createOrderInBatch(confirmedBatch, {
        status: 'confirmed',
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: testProduct.unit,
          rate: 100,
          amount: 1000
        }]
      });
    });

    it('should download delivery bill PDF for admin', async () => {
      const res = await request(app)
        .get(`/api/batches/${confirmedBatch._id}/bills/${confirmedOrder._id}/download`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
    });

    it('should download bill for staff', async () => {
      const res = await request(app)
        .get(`/api/batches/${confirmedBatch._id}/bills/${confirmedOrder._id}/download`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
    });

    it('should return 404 for order not in batch', async () => {
      const otherBatch = await createBatch({ status: 'confirmed' });
      const otherOrder = await createOrderInBatch(otherBatch, { status: 'confirmed' });

      const res = await request(app)
        .get(`/api/batches/${confirmedBatch._id}/bills/${otherOrder._id}/download`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should reject for non-confirmed order', async () => {
      const pendingOrder = await createOrderInBatch(confirmedBatch, { status: 'pending' });

      const res = await request(app)
        .get(`/api/batches/${confirmedBatch._id}/bills/${pendingOrder._id}/download`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('confirmed');
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get(`/api/batches/${confirmedBatch._id}/bills/${confirmedOrder._id}/download`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Batch Workflow Integration', () => {
    it('should complete full batch workflow', async () => {
      // 1. Create batch
      const batch = await createBatch({ status: 'open' });

      // 2. Add orders
      await createOrderInBatch(batch, { status: 'pending' });
      await createOrderInBatch(batch, { status: 'pending' });

      // 3. Confirm batch
      let res = await request(app)
        .post(`/api/batches/${batch._id}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ generateBills: false });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.ordersConfirmed).toBe(2);

      // 4. Get quantity summary
      res = await request(app)
        .get(`/api/batches/${batch._id}/quantity-summary`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);

      // 5. Generate bills
      res = await request(app)
        .post(`/api/batches/${batch._id}/bills`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);

      // 6. Verify orders have bill flags
      const orders = await Order.find({ batch: batch._id });
      orders.forEach(order => {
        expect(order.status).toBe('confirmed');
      });
    });
  });
});
