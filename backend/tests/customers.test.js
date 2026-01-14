const request = require('supertest');
const app = require('../server');
const Customer = require('../models/Customer');
const { testUtils } = require('./setup');

describe('Customer Endpoints', () => {
  let adminToken;
  let staffToken;
  let customerToken;

  beforeEach(async () => {
    // Create test users with different roles
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;

    const customer = await testUtils.createCustomerUser();
    customerToken = customer.token;
  });

  describe('GET /api/customers', () => {
    beforeEach(async () => {
      // Create some test customers
      await testUtils.createTestCustomer({ name: 'Customer A' });
      await testUtils.createTestCustomer({ name: 'Customer B' });
      await testUtils.createTestCustomer({ name: 'Customer C', isActive: false }); // Soft deleted
    });

    it('should return all active customers for admin', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      // Should have 3 customers: A, B, and the one from createCustomerUser
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      // Inactive customer should be hidden
      expect(res.body.data.find(c => c.name === 'Customer C')).toBeUndefined();
    });

    it('should return all active customers for staff', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject customer role access', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/customers');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/customers/:id', () => {
    let testCustomer;

    beforeEach(async () => {
      testCustomer = await testUtils.createTestCustomer({ name: 'Specific Customer' });
    });

    it('should return a specific customer', async () => {
      const res = await request(app)
        .get(`/api/customers/${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Specific Customer');
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/customers/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/customers', () => {
    it('should create a new customer as admin', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Customer',
          phone: '1111111111',
          pricingType: 'market'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Customer');
    });

    it('should create customer with markup pricing', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Markup Customer',
          pricingType: 'markup',
          markupPercentage: 15
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.pricingType).toBe('markup');
      expect(res.body.data.markupPercentage).toBe(15);
    });

    it('should create customer with contract pricing', async () => {
      const product = await testUtils.createTestProduct();

      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Contract Customer',
          pricingType: 'contract',
          contractPrices: {
            [product._id.toString()]: 500
          }
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.pricingType).toBe('contract');
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          phone: '1111111111'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/customers/:id', () => {
    let testCustomer;

    beforeEach(async () => {
      testCustomer = await testUtils.createTestCustomer({ name: 'Update Test Customer' });
    });

    it('should update customer details', async () => {
      const res = await request(app)
        .put(`/api/customers/${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Customer Name',
          address: '123 Test Street'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Updated Customer Name');
      expect(res.body.data.address).toBe('123 Test Street');
    });

    it('should update pricing type', async () => {
      const res = await request(app)
        .put(`/api/customers/${testCustomer._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: testCustomer.name, // Required by validation
          pricingType: 'markup',
          markupPercentage: 20
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.pricingType).toBe('markup');
      expect(res.body.data.markupPercentage).toBe(20);
    });
  });

  describe('DELETE /api/customers/:id', () => {
    let testCustomer;

    beforeEach(async () => {
      testCustomer = await testUtils.createTestCustomer({ name: 'Delete Test Customer' });
    });

    it('should soft delete a customer', async () => {
      const res = await request(app)
        .delete(`/api/customers/${testCustomer._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);

      // Verify soft delete
      const deleted = await Customer.findById(testCustomer._id);
      expect(deleted.isActive).toBe(false);
    });
  });

  describe('Magic Link Endpoints', () => {
    let testCustomer;

    beforeEach(async () => {
      testCustomer = await testUtils.createTestCustomer({ name: 'Magic Link Customer' });
    });

    it('should generate a magic link', async () => {
      const res = await request(app)
        .post(`/api/customers/${testCustomer._id}/magic-link`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.link).toBeDefined(); // API returns 'link' not 'magicLink'
      // Token is no longer returned directly for security - only the full link URL
      expect(res.body.data.link).toContain('token=');
      expect(res.body.data.createdAt).toBeDefined();
      expect(res.body.data.expiresIn).toBe('Never (until revoked)');
    });

    it('should revoke a magic link', async () => {
      // First generate a magic link
      await request(app)
        .post(`/api/customers/${testCustomer._id}/magic-link`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Then revoke it
      const res = await request(app)
        .delete(`/api/customers/${testCustomer._id}/magic-link`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);

      // Verify token was cleared
      const updated = await Customer.findById(testCustomer._id);
      expect(updated.magicLinkToken).toBeUndefined();
    });
  });
});
