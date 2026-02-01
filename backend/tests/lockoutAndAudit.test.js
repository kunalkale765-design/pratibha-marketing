require('./setup');
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { testUtils } = require('./setup');

describe('Account Lockout & Audit Logging', () => {
  describe('Account Lockout', () => {
    let user;

    beforeEach(async () => {
      user = await User.create({
        name: 'Lockout Test',
        email: 'lockout@test.com',
        password: 'Test123!',
        role: 'staff',
        isActive: true
      });
    });

    it('should allow login with correct password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'lockout@test.com', password: 'Test123!' });
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'lockout@test.com', password: 'Wrong123!' });
      expect(res.statusCode).toBe(401);
    });

    it('should increment failedLoginAttempts on wrong password', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'lockout@test.com', password: 'Wrong123!' });

      const updated = await User.findById(user._id).select('+failedLoginAttempts');
      expect(updated.failedLoginAttempts).toBe(1);
    });

    it('should lock account after 5 failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'lockout@test.com', password: 'Wrong123!' });
      }

      const updated = await User.findById(user._id).select('+failedLoginAttempts +lockoutUntil');
      expect(updated.failedLoginAttempts).toBe(5);
      expect(updated.lockoutUntil).toBeTruthy();
      expect(updated.lockoutUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return 429 when account is locked', async () => {
      // Lock the account
      await User.findByIdAndUpdate(user._id, {
        failedLoginAttempts: 5,
        lockoutUntil: new Date(Date.now() + 30 * 60 * 1000)
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'lockout@test.com', password: 'Test123!' });
      expect(res.statusCode).toBe(429);
      expect(res.body.message).toMatch(/locked/i);
    });

    it('should allow login after lockout expires', async () => {
      // Set lockout in the past
      await User.findByIdAndUpdate(user._id, {
        failedLoginAttempts: 5,
        lockoutUntil: new Date(Date.now() - 1000)
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'lockout@test.com', password: 'Test123!' });
      expect(res.statusCode).toBe(200);
    });

    it('should reset failed attempts on successful login', async () => {
      // Set some failed attempts (not locked)
      await User.findByIdAndUpdate(user._id, { failedLoginAttempts: 3 });

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'lockout@test.com', password: 'Test123!' });

      const updated = await User.findById(user._id).select('+failedLoginAttempts +lockoutUntil');
      expect(updated.failedLoginAttempts).toBe(0);
      expect(updated.lockoutUntil).toBeNull();
    });
  });

  describe('Audit Logging', () => {
    let admin, adminToken;

    beforeEach(async () => {
      const result = await testUtils.createAdminUser();
      admin = result.user;
      adminToken = result.token;
    });

    it('should create audit log on customer update', async () => {
      const customer = await testUtils.createTestCustomer();

      await request(app)
        .put(`/api/customers/${customer._id}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ name: 'Updated Name' });

      const logs = await AuditLog.find({ action: 'CUSTOMER_UPDATED' });
      expect(logs.length).toBe(1);
      expect(logs[0].resourceType).toBe('Customer');
      expect(logs[0].resourceId.toString()).toBe(customer._id.toString());
      expect(logs[0].performedBy.toString()).toBe(admin._id.toString());
    });

    it('should create audit log on customer delete', async () => {
      const customer = await testUtils.createTestCustomer();

      await request(app)
        .delete(`/api/customers/${customer._id}`)
        .set('Cookie', [`token=${adminToken}`]);

      const logs = await AuditLog.find({ action: 'CUSTOMER_DELETED' });
      expect(logs.length).toBe(1);
      expect(logs[0].changes.name).toBe(customer.name);
    });

    it('should create audit log on order cancellation', async () => {
      const customer = await testUtils.createTestCustomer();
      const product = await testUtils.createTestProduct();
      const order = await testUtils.createTestOrder(customer, product);

      await request(app)
        .delete(`/api/orders/${order._id}`)
        .set('Cookie', [`token=${adminToken}`]);

      const logs = await AuditLog.find({ action: 'ORDER_CANCELLED' });
      expect(logs.length).toBe(1);
      expect(logs[0].resourceType).toBe('Order');
    });

    it('should create audit log on payment recording', async () => {
      const customer = await testUtils.createTestCustomer({ balance: 1000 });

      await request(app)
        .post('/api/ledger/payment')
        .set('Cookie', [`token=${adminToken}`])
        .send({ customer: customer._id.toString(), amount: 500 });

      const logs = await AuditLog.find({ action: 'PAYMENT_RECORDED' });
      expect(logs.length).toBe(1);
      expect(logs[0].changes.amount).toBe(500);
    });

    it('should create audit log on adjustment recording', async () => {
      const customer = await testUtils.createTestCustomer({ balance: 1000 });

      await request(app)
        .post('/api/ledger/adjustment')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id.toString(),
          amount: -200,
          description: 'Test adjustment'
        });

      const logs = await AuditLog.find({ action: 'ADJUSTMENT_RECORDED' });
      expect(logs.length).toBe(1);
      expect(logs[0].changes.description).toBe('Test adjustment');
    });

    it('should create LOGIN_FAILED audit on wrong password', async () => {
      await User.create({
        name: 'Audit Login Test',
        email: 'auditlogin@test.com',
        password: 'Test123!',
        role: 'staff',
        isActive: true
      });

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'auditlogin@test.com', password: 'Wrong123!' });

      const logs = await AuditLog.find({ action: 'LOGIN_FAILED' });
      expect(logs.length).toBe(1);
      expect(logs[0].resourceType).toBe('User');
    });

    it('should create ACCOUNT_LOCKED audit after 5 failures', async () => {
      await User.create({
        name: 'Lock Audit Test',
        email: 'lockaudit@test.com',
        password: 'Test123!',
        role: 'staff',
        isActive: true
      });

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'lockaudit@test.com', password: 'Wrong123!' });
      }

      const lockLogs = await AuditLog.find({ action: 'ACCOUNT_LOCKED' });
      expect(lockLogs.length).toBe(1);

      const failLogs = await AuditLog.find({ action: 'LOGIN_FAILED' });
      expect(failLogs.length).toBe(4); // First 4 are LOGIN_FAILED, 5th is ACCOUNT_LOCKED
    });

    it('should store IP address in audit logs', async () => {
      const customer = await testUtils.createTestCustomer();

      await request(app)
        .put(`/api/customers/${customer._id}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ name: 'IP Test' });

      const logs = await AuditLog.find({ action: 'CUSTOMER_UPDATED' });
      expect(logs[0].ipAddress).toBeTruthy();
    });
  });
});
