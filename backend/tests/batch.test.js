const mongoose = require('mongoose');
const Batch = require('../models/Batch');
const Order = require('../models/Order');
const {
  getISTTime,
  calculateBatchAssignment,
  assignOrderToBatch,
  autoConfirmFirstBatch,
  manuallyConfirmBatch,
  getBatchWithStats,
  BATCH_CONFIG
} = require('../services/batchScheduler');
const { testUtils } = require('./setup');

describe('Batch System', () => {
  let adminToken, adminUser;
  let staffToken, staffUser;
  let customerToken, customerUser, testCustomer;
  let testProduct;

  beforeAll(async () => {
    // Create users
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;
    adminUser = admin.user;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;
    staffUser = staff.user;

    const customer = await testUtils.createCustomerUser();
    customerToken = customer.token;
    customerUser = customer.user;
    testCustomer = customer.customer;

    // Create test product
    testProduct = await testUtils.createTestProduct();
  });

  afterAll(async () => {
    await Batch.deleteMany({});
  });

  describe('Batch Model', () => {
    afterEach(async () => {
      await Batch.deleteMany({});
    });

    it('should create a batch with correct batch number format', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const batch = await Batch.create({
        batchNumber: `B${today.toISOString().slice(2, 10).replace(/-/g, '')}-1`,
        date: today,
        batchType: '1st',
        cutoffTime: new Date(today.getTime() + 8 * 60 * 60 * 1000),
        autoConfirmTime: new Date(today.getTime() + 8 * 60 * 60 * 1000)
      });

      expect(batch.batchNumber).toMatch(/^B\d{6}-1$/);
      expect(batch.status).toBe('open');
      expect(batch.batchType).toBe('1st');
    });

    it('should have unique batch numbers', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const batchNumber = `B${today.toISOString().slice(2, 10).replace(/-/g, '')}-1`;

      await Batch.create({
        batchNumber,
        date: today,
        batchType: '1st',
        cutoffTime: new Date()
      });

      await expect(Batch.create({
        batchNumber,
        date: today,
        batchType: '1st',
        cutoffTime: new Date()
      })).rejects.toThrow();
    });

    it('findOrCreateBatch should create new batch if not exists', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Signature: findOrCreateBatch(date, batchType, cutoffTime, autoConfirmTime)
      const batch = await Batch.findOrCreateBatch(today, '1st', new Date(), new Date());

      expect(batch.batchNumber).toMatch(/^B\d{6}-1$/);
      expect(batch.orderCount).toBe(0);
    });

    it('findOrCreateBatch should return existing batch', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Signature: findOrCreateBatch(date, batchType, cutoffTime, autoConfirmTime)
      const batch1 = await Batch.findOrCreateBatch(today, '1st', new Date(), new Date());
      const batch2 = await Batch.findOrCreateBatch(today, '1st', new Date(), new Date());

      expect(batch1._id.toString()).toBe(batch2._id.toString());
    });

    it('confirmBatch (instance method) should update status', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const batch = await Batch.create({
        batchNumber: `B${today.toISOString().slice(2, 10).replace(/-/g, '')}-confirm`,
        date: today,
        batchType: '1st',
        cutoffTime: new Date(),
        status: 'open'
      });

      // confirmBatch is an INSTANCE method, not static
      const result = await batch.confirmBatch(adminUser._id);

      expect(result.status).toBe('confirmed');
      expect(result.confirmedAt).toBeDefined();
      expect(result.confirmedBy.toString()).toBe(adminUser._id.toString());
    });
  });

  describe('Batch Scheduler Service', () => {
    afterEach(async () => {
      await Batch.deleteMany({});
      await Order.deleteMany({});
    });

    describe('getISTTime', () => {
      it('should return IST time components', () => {
        const ist = getISTTime();

        expect(ist).toHaveProperty('date');
        expect(ist).toHaveProperty('hour');
        expect(ist).toHaveProperty('dateOnly');
        expect(ist.hour).toBeGreaterThanOrEqual(0);
        expect(ist.hour).toBeLessThan(24);
      });
    });

    describe('calculateBatchAssignment', () => {
      it('should assign to 1st batch before 8 AM IST', () => {
        // Create a date at 6 AM IST (which is 00:30 UTC)
        const date = new Date();
        date.setUTCHours(0, 30, 0, 0); // 6:00 AM IST

        const result = calculateBatchAssignment(date);

        expect(result.batchType).toBe('1st');
        expect(result.autoConfirmTime).not.toBeNull();
      });

      it('should assign to 2nd batch between 8 AM and 12 PM IST', () => {
        // Create a date at 10 AM IST (which is 04:30 UTC)
        const date = new Date();
        date.setUTCHours(4, 30, 0, 0); // 10:00 AM IST

        const result = calculateBatchAssignment(date);

        expect(result.batchType).toBe('2nd');
        expect(result.autoConfirmTime).toBeNull(); // 2nd batch is manually confirmed
      });

      it('should assign to next day 1st batch after 12 PM IST', () => {
        // Create a date at 2 PM IST (which is 08:30 UTC)
        const date = new Date();
        date.setUTCHours(8, 30, 0, 0); // 2:00 PM IST

        const result = calculateBatchAssignment(date);

        expect(result.batchType).toBe('1st');
        // Batch date should be tomorrow
        const today = new Date();
        today.setUTCHours(8, 30, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        expect(result.batchDate.getDate()).toBe(tomorrow.getDate());
      });
    });

    describe('assignOrderToBatch', () => {
      it('should create and return a batch for new orders', async () => {
        const batch = await assignOrderToBatch(new Date());

        expect(batch).toBeDefined();
        expect(batch._id).toBeDefined();
        expect(batch.batchNumber).toMatch(/^B\d{6}-[12]$/);
        expect(batch.status).toBe('open');
      });

      it('should reuse existing open batch for same date/type', async () => {
        const batch1 = await assignOrderToBatch(new Date());
        const batch2 = await assignOrderToBatch(new Date());

        expect(batch1._id.toString()).toBe(batch2._id.toString());
      });
    });

    describe('manuallyConfirmBatch', () => {
      it('should confirm an open batch', async () => {
        const batch = await assignOrderToBatch(new Date());

        // Create an order in this batch
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
          batch: batch._id
        });

        const result = await manuallyConfirmBatch(batch._id, adminUser._id);

        expect(result.batch.status).toBe('confirmed');
        expect(result.ordersConfirmed).toBe(1);
      });

      it('should reject confirming already confirmed batch', async () => {
        const batch = await assignOrderToBatch(new Date());
        await manuallyConfirmBatch(batch._id, adminUser._id);

        await expect(manuallyConfirmBatch(batch._id, adminUser._id))
          .rejects.toThrow('already');
      });

      it('should throw for non-existent batch', async () => {
        const fakeId = new mongoose.Types.ObjectId();

        await expect(manuallyConfirmBatch(fakeId, adminUser._id))
          .rejects.toThrow('not found');
      });
    });

    describe('getBatchWithStats', () => {
      it('should return batch with order statistics', async () => {
        const batch = await assignOrderToBatch(new Date());

        // Create orders with different statuses
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
          batch: batch._id,
          status: 'pending'
        });

        await Order.create({
          customer: testCustomer._id,
          products: [{
            product: testProduct._id,
            productName: testProduct.name,
            quantity: 3,
            unit: testProduct.unit,
            rate: 100,
            amount: 300
          }],
          totalAmount: 300,
          batch: batch._id,
          status: 'confirmed'
        });

        const stats = await getBatchWithStats(batch._id);

        // getBatchWithStats returns batch with orderStats array
        expect(stats.batchNumber).toBeDefined();
        expect(stats.orderStats).toBeDefined();
        expect(Array.isArray(stats.orderStats)).toBe(true);
        expect(stats.orderStats.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Order Integration', () => {
    afterEach(async () => {
      await Batch.deleteMany({});
      await Order.deleteMany({});
    });

    it('order should have batch reference', async () => {
      const batch = await assignOrderToBatch(new Date());

      const order = await Order.create({
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
        batch: batch._id
      });

      expect(order.batch.toString()).toBe(batch._id.toString());
    });

    it('order status should change to confirmed after batch confirmation', async () => {
      const batch = await assignOrderToBatch(new Date());

      const order = await Order.create({
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
        batch: batch._id,
        status: 'pending'
      });

      await manuallyConfirmBatch(batch._id, adminUser._id);

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.status).toBe('confirmed');
    });
  });

  describe('BATCH_CONFIG', () => {
    it('should have correct cutoff hours', () => {
      expect(BATCH_CONFIG.BATCH_1_CUTOFF_HOUR).toBe(8);
      expect(BATCH_CONFIG.BATCH_2_CUTOFF_HOUR).toBe(12);
    });
  });
});
