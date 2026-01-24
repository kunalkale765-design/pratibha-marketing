const request = require('supertest');
const app = require('../server');
const Customer = require('../models/Customer');
const LedgerEntry = require('../models/LedgerEntry');
const { testUtils } = require('./setup');

describe('Ledger Endpoints', () => {
  let adminToken;
  let staffToken;
  let customerToken;
  let testCustomer;
  let testCustomer2;
  let adminUser;

  beforeEach(async () => {
    // Create test users
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;
    adminUser = admin.user;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;

    const customerUser = await testUtils.createCustomerUser({ name: 'Test Customer' });
    customerToken = customerUser.token;
    testCustomer = customerUser.customer;

    // Create another customer
    testCustomer2 = await testUtils.createTestCustomer({ name: 'Customer 2' });
  });

  // Helper to create ledger entries
  const createLedgerEntry = async (customerId, type, amount, options = {}) => {
    const entry = await LedgerEntry.create({
      customer: customerId,
      type,
      date: options.date || new Date(),
      description: options.description || `Test ${type}`,
      amount,
      balance: options.balance || amount,
      notes: options.notes,
      order: options.orderId,
      orderNumber: options.orderNumber,
      createdBy: adminUser._id,
      createdByName: adminUser.name
    });
    return entry;
  };

  describe('GET /api/ledger/balances', () => {
    beforeEach(async () => {
      // Set up customer balances
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 1500 });
      await Customer.findByIdAndUpdate(testCustomer2._id, { balance: 0 });

      // Create customer with negative balance (credit)
      await testUtils.createTestCustomer({ name: 'Credit Customer', balance: -200 });
    });

    it('should return all customer balances for admin', async () => {
      const res = await request(app)
        .get('/api/ledger/balances')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.totalOwed).toBeDefined();
      expect(res.body.summary.totalCredit).toBeDefined();
      expect(res.body.summary.netOwed).toBeDefined();
    });

    it('should return balances for staff', async () => {
      const res = await request(app)
        .get('/api/ledger/balances')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should exclude zero balances by default', async () => {
      const res = await request(app)
        .get('/api/ledger/balances')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      const zeroBalanceCustomers = res.body.data.filter(c => c.balance === 0);
      expect(zeroBalanceCustomers).toHaveLength(0);
    });

    it('should include zero balances when showZero=true', async () => {
      const res = await request(app)
        .get('/api/ledger/balances?showZero=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('should filter by minimum balance', async () => {
      const res = await request(app)
        .get('/api/ledger/balances?minBalance=1000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      res.body.data.forEach(c => {
        expect(c.balance).toBeGreaterThanOrEqual(1000);
      });
    });

    it('should sort by balance descending by default', async () => {
      const res = await request(app)
        .get('/api/ledger/balances')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      const balances = res.body.data.map(c => c.balance);
      for (let i = 1; i < balances.length; i++) {
        expect(balances[i]).toBeLessThanOrEqual(balances[i - 1]);
      }
    });

    it('should sort by name when specified', async () => {
      const res = await request(app)
        .get('/api/ledger/balances?sort=name&order=asc&showZero=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/ledger/balances')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/ledger/customer/:customerId', () => {
    beforeEach(async () => {
      // Create ledger entries for test customer
      await createLedgerEntry(testCustomer._id, 'invoice', 1000, {
        balance: 1000,
        orderNumber: 'ORD001'
      });
      await createLedgerEntry(testCustomer._id, 'payment', -500, {
        balance: 500,
        description: 'Cash payment'
      });
      await createLedgerEntry(testCustomer._id, 'invoice', 750, {
        balance: 1250,
        orderNumber: 'ORD002'
      });
    });

    it('should return ledger history for admin', async () => {
      const res = await request(app)
        .get(`/api/ledger/customer/${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.customer).toBeDefined();
      expect(res.body.data).toHaveLength(3);
    });

    it('should return history for staff', async () => {
      const res = await request(app)
        .get(`/api/ledger/customer/${testCustomer._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should filter by type', async () => {
      const res = await request(app)
        .get(`/api/ledger/customer/${testCustomer._id}?type=payment`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('payment');
    });

    it('should filter by date range', async () => {
      // Create entry from last month
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      await createLedgerEntry(testCustomer._id, 'invoice', 500, { date: lastMonth, balance: 500 });

      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/ledger/customer/${testCustomer._id}?startDate=${today}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(3); // Only today's entries
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get(`/api/ledger/customer/${testCustomer._id}?limit=2`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/ledger/customer/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid customer ID', async () => {
      const res = await request(app)
        .get('/api/ledger/customer/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get(`/api/ledger/customer/${testCustomer._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/ledger/payment', () => {
    beforeEach(async () => {
      // Set initial balance
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 1000 });
    });

    it('should record payment for admin', async () => {
      const res = await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 500,
          notes: 'Cash payment received'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.previousBalance).toBe(1000);
      expect(res.body.data.paymentAmount).toBe(500);
      expect(res.body.data.newBalance).toBe(500);
    });

    it('should record payment for staff', async () => {
      const res = await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 300
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should create ledger entry with negative amount', async () => {
      await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 500
        });

      const entry = await LedgerEntry.findOne({ customer: testCustomer._id, type: 'payment' });
      expect(entry).toBeDefined();
      expect(entry.amount).toBe(-500); // Negative because it reduces balance
    });

    it('should update customer balance atomically', async () => {
      await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 400
        });

      const customer = await Customer.findById(testCustomer._id);
      expect(customer.balance).toBe(600); // 1000 - 400
    });

    it('should allow payment with custom date', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const res = await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 500,
          date: yesterday.toISOString()
        });

      expect(res.statusCode).toBe(201);

      const entry = await LedgerEntry.findOne({ customer: testCustomer._id, type: 'payment' });
      expect(new Date(entry.date).toDateString()).toBe(yesterday.toDateString());
    });

    it('should reject payment with amount 0', async () => {
      const res = await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 0
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject negative amount', async () => {
      const res = await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: -100
        });

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: fakeId,
          amount: 500
        });

      expect(res.statusCode).toBe(404);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 500
        });

      expect(res.statusCode).toBe(403);
    });

    it('should validate notes length', async () => {
      const res = await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 500,
          notes: 'x'.repeat(1001)
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/ledger/adjustment', () => {
    beforeEach(async () => {
      // Set initial balance
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 1000 });
    });

    it('should create positive adjustment for admin', async () => {
      const res = await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 200,
          description: 'Late fee added'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.previousBalance).toBe(1000);
      expect(res.body.data.adjustmentAmount).toBe(200);
      expect(res.body.data.newBalance).toBe(1200);
    });

    it('should create negative adjustment (credit)', async () => {
      const res = await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: -150,
          description: 'Goodwill discount'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.newBalance).toBe(850); // 1000 - 150
    });

    it('should reject staff access', async () => {
      const res = await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 100,
          description: 'Test adjustment'
        });

      expect(res.statusCode).toBe(403);
    });

    it('should require description', async () => {
      const res = await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 100
        });

      expect(res.statusCode).toBe(400);
    });

    it('should create ledger entry', async () => {
      await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 100,
          description: 'Test adjustment'
        });

      const entry = await LedgerEntry.findOne({ customer: testCustomer._id, type: 'adjustment' });
      expect(entry).toBeDefined();
      expect(entry.amount).toBe(100);
      expect(entry.description).toBe('Test adjustment');
    });

    it('should update customer balance atomically', async () => {
      await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: -300,
          description: 'Credit adjustment'
        });

      const customer = await Customer.findById(testCustomer._id);
      expect(customer.balance).toBe(700); // 1000 - 300
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: fakeId,
          amount: 100,
          description: 'Test'
        });

      expect(res.statusCode).toBe(404);
    });

    it('should validate description length', async () => {
      const res = await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 100,
          description: 'x'.repeat(501)
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 100,
          description: 'Test'
        });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/ledger/statement/:customerId', () => {
    beforeEach(async () => {
      // Create entries from different months
      const thisMonth = new Date();
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      // Last month entries (for opening balance)
      await createLedgerEntry(testCustomer._id, 'invoice', 500, {
        date: lastMonth,
        balance: 500
      });

      // This month entries
      await createLedgerEntry(testCustomer._id, 'invoice', 1000, {
        date: thisMonth,
        balance: 1500,
        orderNumber: 'ORD001'
      });
      await createLedgerEntry(testCustomer._id, 'payment', -500, {
        date: thisMonth,
        balance: 1000
      });
      await createLedgerEntry(testCustomer._id, 'adjustment', -100, {
        date: thisMonth,
        balance: 900,
        description: 'Discount'
      });
    });

    it('should return monthly statement for admin', async () => {
      const now = new Date();
      const res = await request(app)
        .get(`/api/ledger/statement/${testCustomer._id}?month=${now.getMonth() + 1}&year=${now.getFullYear()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer).toBeDefined();
      expect(res.body.data.period).toBeDefined();
      expect(res.body.data.openingBalance).toBeDefined();
      expect(res.body.data.invoiceTotal).toBeDefined();
      expect(res.body.data.paymentTotal).toBeDefined();
      expect(res.body.data.adjustmentTotal).toBeDefined();
      expect(res.body.data.closingBalance).toBeDefined();
      expect(res.body.data.entries).toBeDefined();
    });

    it('should return statement for staff', async () => {
      const res = await request(app)
        .get(`/api/ledger/statement/${testCustomer._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should calculate opening balance from previous month', async () => {
      const now = new Date();
      const res = await request(app)
        .get(`/api/ledger/statement/${testCustomer._id}?month=${now.getMonth() + 1}&year=${now.getFullYear()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.openingBalance).toBe(500); // From last month entry
    });

    it('should calculate totals correctly', async () => {
      const now = new Date();
      const res = await request(app)
        .get(`/api/ledger/statement/${testCustomer._id}?month=${now.getMonth() + 1}&year=${now.getFullYear()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.invoiceTotal).toBe(1000);
      expect(res.body.data.paymentTotal).toBe(500);
      expect(res.body.data.adjustmentTotal).toBe(-100);
    });

    it('should default to current month', async () => {
      const res = await request(app)
        .get(`/api/ledger/statement/${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      const now = new Date();
      expect(res.body.data.period.month).toBe(now.getMonth() + 1);
      expect(res.body.data.period.year).toBe(now.getFullYear());
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/ledger/statement/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get(`/api/ledger/statement/${testCustomer._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/ledger', () => {
    beforeEach(async () => {
      // Create entries for different customers
      await createLedgerEntry(testCustomer._id, 'invoice', 1000, { balance: 1000 });
      await createLedgerEntry(testCustomer._id, 'payment', -500, { balance: 500 });
      await createLedgerEntry(testCustomer2._id, 'invoice', 750, { balance: 750 });
    });

    it('should return all ledger entries for admin', async () => {
      const res = await request(app)
        .get('/api/ledger')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(3);
      expect(res.body.data).toHaveLength(3);
    });

    it('should return entries for staff', async () => {
      const res = await request(app)
        .get('/api/ledger')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should filter by type', async () => {
      const res = await request(app)
        .get('/api/ledger?type=invoice')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(2);
      res.body.data.forEach(entry => {
        expect(entry.type).toBe('invoice');
      });
    });

    it('should filter by date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/ledger?startDate=${today}&endDate=${today}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/ledger?limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should sort by date descending', async () => {
      const res = await request(app)
        .get('/api/ledger')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      const dates = res.body.data.map(e => new Date(e.date));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i].getTime()).toBeLessThanOrEqual(dates[i - 1].getTime());
      }
    });

    it('should reject customer access', async () => {
      const res = await request(app)
        .get('/api/ledger')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Ledger Workflow Integration', () => {
    it('should track complete payment workflow', async () => {
      // 1. Set initial balance
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 0 });

      // 2. Create invoice (simulating reconciliation)
      await createLedgerEntry(testCustomer._id, 'invoice', 1000, {
        balance: 1000,
        orderNumber: 'ORD001'
      });
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 1000 });

      // 3. Record partial payment
      let res = await request(app)
        .post('/api/ledger/payment')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: 600,
          notes: 'Cash payment'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.newBalance).toBe(400);

      // 4. Create another invoice
      await createLedgerEntry(testCustomer._id, 'invoice', 500, {
        balance: 900,
        orderNumber: 'ORD002'
      });
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 900 });

      // 5. Admin applies discount
      res = await request(app)
        .post('/api/ledger/adjustment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer: testCustomer._id.toString(),
          amount: -100,
          description: 'Loyalty discount'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.newBalance).toBe(800);

      // 6. Check customer history
      res = await request(app)
        .get(`/api/ledger/customer/${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.length).toBe(4); // 2 invoices + 1 payment + 1 adjustment

      // 7. Final balance check
      const customer = await Customer.findById(testCustomer._id);
      expect(customer.balance).toBe(800);
    });

    it('should generate accurate monthly statement', async () => {
      // Set up entries
      await Customer.findByIdAndUpdate(testCustomer._id, { balance: 0 });

      const now = new Date();

      // Create entries for this month
      await createLedgerEntry(testCustomer._id, 'invoice', 2000, {
        date: now,
        balance: 2000
      });
      await createLedgerEntry(testCustomer._id, 'payment', -1000, {
        date: now,
        balance: 1000
      });
      await createLedgerEntry(testCustomer._id, 'adjustment', -200, {
        date: now,
        balance: 800,
        description: 'Discount'
      });

      // Get statement
      const res = await request(app)
        .get(`/api/ledger/statement/${testCustomer._id}?month=${now.getMonth() + 1}&year=${now.getFullYear()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.invoiceTotal).toBe(2000);
      expect(res.body.data.paymentTotal).toBe(1000);
      expect(res.body.data.adjustmentTotal).toBe(-200);
      expect(res.body.data.closingBalance).toBe(800);
    });
  });
});
