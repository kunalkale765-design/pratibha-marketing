const request = require('supertest');
const app = require('../server');
const LedgerEntry = require('../models/LedgerEntry');
const { testUtils } = require('./setup');

describe('Reports Endpoints', () => {
  let adminToken, adminUser;
  let staffToken;
  let customerToken;
  let testCustomer;
  let testCustomer2;

  beforeEach(async () => {
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;
    adminUser = admin.user;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;

    const customerUser = await testUtils.createCustomerUser({ name: 'Test Customer' });
    customerToken = customerUser.token;
    testCustomer = customerUser.customer;

    testCustomer2 = await testUtils.createTestCustomer({ name: 'Customer 2' });
  });

  // Helper to create ledger entry
  const createLedgerEntry = async (options = {}) => {
    return LedgerEntry.create({
      customer: options.customerId || testCustomer._id,
      type: options.type || 'invoice',
      date: options.date || new Date(),
      order: options.orderId || '507f1f77bcf86cd799439011',
      orderNumber: options.orderNumber || 'ORD001',
      description: options.description || 'Invoice for order ORD001',
      amount: options.amount || 1000,
      balance: options.balance || 1000,
      createdBy: options.createdBy || adminUser._id,
      createdByName: 'Admin'
    });
  };

  describe('GET /api/reports/ledger', () => {
    beforeEach(async () => {
      await createLedgerEntry({ customerId: testCustomer._id, amount: 1000, balance: 1000 });
      await createLedgerEntry({ customerId: testCustomer._id, amount: 1500, balance: 2500 });
      await createLedgerEntry({ customerId: testCustomer2._id, amount: 750, balance: 750 });
    });

    it('should return Excel file for admin', async () => {
      const res = await request(app)
        .get('/api/reports/ledger')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
      expect(res.headers['content-disposition']).toMatch(/ledger_.*\.xlsx/);
    });

    it('should return Excel file for staff', async () => {
      const res = await request(app)
        .get('/api/reports/ledger')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('should filter by customer', async () => {
      const res = await request(app)
        .get(`/api/reports/ledger?customerId=${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toMatch(/ledger_.*\.xlsx/);
    });

    it('should filter by date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/reports/ledger?fromDate=${today}&toDate=${today}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('should return 400 for invalid customer ID', async () => {
      const res = await request(app)
        .get('/api/reports/ledger?customerId=invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/reports/ledger?customerId=${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid date format', async () => {
      const res = await request(app)
        .get('/api/reports/ledger?fromDate=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/reports/ledger')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/reports/ledger');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/reports/ledger/preview', () => {
    beforeEach(async () => {
      await createLedgerEntry({
        customerId: testCustomer._id,
        amount: 1000,
        balance: 1000,
        orderNumber: 'ORD001',
        description: 'Invoice for order ORD001'
      });
      await createLedgerEntry({
        customerId: testCustomer._id,
        amount: -500,
        balance: 500,
        type: 'payment',
        orderNumber: '',
        description: 'Payment received'
      });
      await createLedgerEntry({
        customerId: testCustomer2._id,
        amount: 750,
        balance: 750,
        orderNumber: 'ORD002',
        description: 'Invoice for order ORD002'
      });
    });

    it('should return JSON preview for admin', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.entries).toBeDefined();
      expect(res.body.data.summary).toBeDefined();
      expect(Array.isArray(res.body.data.entries)).toBe(true);
    });

    it('should return preview for staff', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should include summary with totals', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalEntries).toBe(3);
      expect(res.body.data.summary.totalDebit).toBe(1750); // 1000 + 750
      expect(res.body.data.summary.totalCredit).toBe(500); // abs(-500)
      expect(res.body.data.summary.showing).toBeDefined();
    });

    it('should filter by customer', async () => {
      const res = await request(app)
        .get(`/api/reports/ledger/preview?customerId=${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalEntries).toBe(2);
      expect(res.body.data.summary.totalDebit).toBe(1000);
      expect(res.body.data.summary.totalCredit).toBe(500);
    });

    it('should filter by date range', async () => {
      // Create entry from last month
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      await createLedgerEntry({ customerId: testCustomer._id, amount: 500, balance: 1000, date: lastMonth });

      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/reports/ledger/preview?fromDate=${today}&toDate=${today}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalEntries).toBe(3); // Only today's entries
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview?limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.entries).toHaveLength(2);
      expect(res.body.data.summary.showing).toBe(2);
      expect(res.body.data.summary.totalEntries).toBe(3);
    });

    it('should return entry details in response', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.entries.length).toBeGreaterThan(0);

      const entry = res.body.data.entries[0];
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('customer');
      expect(entry).toHaveProperty('description');
      expect(entry).toHaveProperty('amount');
      expect(entry).toHaveProperty('balance');
    });

    it('should return 400 for invalid customer ID', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview?customerId=invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/reports/ledger/preview?customerId=${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid limit', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview?limit=0')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for limit exceeding max', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview?limit=101')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Report Workflow Integration', () => {
    it('should preview and then download report', async () => {
      await createLedgerEntry({ customerId: testCustomer._id, amount: 1000, balance: 1000 });
      await createLedgerEntry({ customerId: testCustomer._id, amount: 2000, balance: 3000 });

      // 1. Preview the report
      let res = await request(app)
        .get(`/api/reports/ledger/preview?customerId=${testCustomer._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalEntries).toBe(2);
      expect(res.body.data.summary.totalDebit).toBe(3000);

      // 2. Download the Excel file
      res = await request(app)
        .get(`/api/reports/ledger?customerId=${testCustomer._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('should generate report with date filtering', async () => {
      const today = new Date();
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);

      await createLedgerEntry({ customerId: testCustomer._id, amount: 1000, balance: 1000, date: today });
      await createLedgerEntry({ customerId: testCustomer._id, amount: 500, balance: 500, date: lastWeek });

      const todayStr = today.toISOString().split('T')[0];

      // Preview with date filter
      let res = await request(app)
        .get(`/api/reports/ledger/preview?fromDate=${todayStr}&toDate=${todayStr}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalEntries).toBe(1);
      expect(res.body.data.summary.totalDebit).toBe(1000);

      // Download with same filter
      res = await request(app)
        .get(`/api/reports/ledger?fromDate=${todayStr}&toDate=${todayStr}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
    });
  });
});
