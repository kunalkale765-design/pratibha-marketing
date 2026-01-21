const request = require('supertest');
const app = require('../server');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const { testUtils } = require('./setup');

describe('Reports Endpoints', () => {
  let adminToken;
  let staffToken;
  let customerToken;
  let testCustomer;
  let testCustomer2;

  beforeEach(async () => {
    // Create test users
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;

    const customerUser = await testUtils.createCustomerUser({ name: 'Test Customer' });
    customerToken = customerUser.token;
    testCustomer = customerUser.customer;

    // Create another customer
    testCustomer2 = await testUtils.createTestCustomer({ name: 'Customer 2' });
  });

  // Helper to create invoice
  const createInvoice = async (options = {}) => {
    return Invoice.create({
      invoiceNumber: `INV${Date.now()}`,
      order: options.orderId || '507f1f77bcf86cd799439011',
      orderNumber: options.orderNumber || 'ORD001',
      customer: {
        name: options.customerName || testCustomer.name,
        phone: testCustomer.phone || '1234567890',
        address: 'Test Address'
      },
      firm: {
        id: 'pratibha-marketing',
        name: options.firmName || 'Pratibha Marketing',
        address: 'Test Address'
      },
      items: options.items || [{
        name: 'Test Product',
        quantity: 10,
        unit: 'kg',
        rate: 100,
        amount: 1000
      }],
      total: options.total || 1000,
      generatedAt: options.generatedAt || new Date(),
      generatedBy: options.generatedBy || '507f1f77bcf86cd799439011',
      ...options
    });
  };

  describe('GET /api/reports/ledger', () => {
    beforeEach(async () => {
      // Create invoices for testing
      await createInvoice({
        customerName: testCustomer.name,
        total: 1000,
        generatedAt: new Date()
      });
      await createInvoice({
        customerName: testCustomer.name,
        total: 1500,
        generatedAt: new Date()
      });
      await createInvoice({
        customerName: testCustomer2.name,
        total: 750,
        generatedAt: new Date()
      });
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
      // Filename should include customer name
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
      // Create invoices for testing
      await createInvoice({
        customerName: testCustomer.name,
        firmName: 'Pratibha Marketing',
        total: 1000
      });
      await createInvoice({
        customerName: testCustomer.name,
        firmName: 'Vikas Frozen Foods',
        total: 1500
      });
      await createInvoice({
        customerName: testCustomer2.name,
        firmName: 'Pratibha Marketing',
        total: 750
      });
    });

    it('should return JSON preview for admin', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.invoices).toBeDefined();
      expect(res.body.data.summary).toBeDefined();
      expect(Array.isArray(res.body.data.invoices)).toBe(true);
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
      expect(res.body.data.summary.totalInvoices).toBe(3);
      expect(res.body.data.summary.totalAmount).toBe(3250); // 1000 + 1500 + 750
      expect(res.body.data.summary.showing).toBeDefined();
    });

    it('should filter by customer', async () => {
      const res = await request(app)
        .get(`/api/reports/ledger/preview?customerId=${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalInvoices).toBe(2);
      expect(res.body.data.summary.totalAmount).toBe(2500); // 1000 + 1500
    });

    it('should filter by date range', async () => {
      // Create invoice from last month
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      await createInvoice({ customerName: 'Old Customer', total: 500, generatedAt: lastMonth });

      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/reports/ledger/preview?fromDate=${today}&toDate=${today}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalInvoices).toBe(3); // Only today's invoices
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview?limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.invoices).toHaveLength(2);
      expect(res.body.data.summary.showing).toBe(2);
      expect(res.body.data.summary.totalInvoices).toBe(3); // Total is still 3
    });

    it('should return invoice details in response', async () => {
      const res = await request(app)
        .get('/api/reports/ledger/preview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.invoices.length).toBeGreaterThan(0);

      const invoice = res.body.data.invoices[0];
      expect(invoice).toHaveProperty('date');
      expect(invoice).toHaveProperty('invoiceNumber');
      expect(invoice).toHaveProperty('customer');
      expect(invoice).toHaveProperty('firm');
      expect(invoice).toHaveProperty('amount');
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
      // Create test data
      await createInvoice({ customerName: testCustomer.name, total: 1000 });
      await createInvoice({ customerName: testCustomer.name, total: 2000 });

      // 1. Preview the report
      let res = await request(app)
        .get(`/api/reports/ledger/preview?customerId=${testCustomer._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalInvoices).toBe(2);
      expect(res.body.data.summary.totalAmount).toBe(3000);

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

      // Create invoices at different times
      await createInvoice({ customerName: testCustomer.name, total: 1000, generatedAt: today });
      await createInvoice({ customerName: testCustomer.name, total: 500, generatedAt: lastWeek });

      const todayStr = today.toISOString().split('T')[0];

      // Preview with date filter
      let res = await request(app)
        .get(`/api/reports/ledger/preview?fromDate=${todayStr}&toDate=${todayStr}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalInvoices).toBe(1);
      expect(res.body.data.summary.totalAmount).toBe(1000);

      // Download with same filter
      res = await request(app)
        .get(`/api/reports/ledger?fromDate=${todayStr}&toDate=${todayStr}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
    });
  });
});
