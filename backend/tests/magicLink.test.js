/**
 * Magic Link Authentication Tests
 * Tests for passwordless authentication via magic links
 */

const request = require('supertest');
const app = require('../server');
const { testUtils } = require('./setup');
const Customer = require('../models/Customer');

describe('Magic Link Authentication', () => {
  describe('POST /api/customers/:id/magic-link', () => {
    let adminToken, staffToken, customerToken, customer;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      const staff = await testUtils.createStaffUser();
      const customerData = await testUtils.createCustomerUser();
      adminToken = admin.token;
      staffToken = staff.token;
      customerToken = customerData.token;
      customer = await testUtils.createTestCustomer();
    });

    it('should allow admin to generate magic link for customer', async () => {
      const res = await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.link).toBeDefined();
      // Magic link points to customer order form with token param
      expect(res.body.data.link).toContain('token=');
      // API returns expiresIn (duration) and createdAt
      expect(res.body.data.expiresIn).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
    });

    it('should allow staff to generate magic link for customer', async () => {
      const res = await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.link).toBeDefined();
    });

    it('should deny customer from generating magic links', async () => {
      const res = await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('should store magic link token in customer document', async () => {
      await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${adminToken}`);

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.magicLinkToken).toBeDefined();
      expect(updatedCustomer.magicLinkCreatedAt).toBeDefined();
    });

    it('should generate unique tokens for different customers', async () => {
      const customer2 = await testUtils.createTestCustomer({ name: 'Customer 2', phone: '8888888888' });

      const res1 = await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${adminToken}`);

      const res2 = await request(app)
        .post(`/api/customers/${customer2._id}/magic-link`)
        .set('Cookie', `token=${adminToken}`);

      const token1 = res1.body.data.link.split('/').pop();
      const token2 = res2.body.data.link.split('/').pop();

      expect(token1).not.toBe(token2);
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .post(`/api/customers/${fakeId}/magic-link`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/auth/magic/:token', () => {
    let customer, magicToken;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      customer = await testUtils.createTestCustomer();

      // Generate magic link and extract token from URL
      const res = await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${admin.token}`);

      // Token is in query param: ...?token=XXXXX
      const link = res.body.data.link;
      magicToken = link.split('token=')[1];
    });

    it('should authenticate with valid magic link token', async () => {
      const res = await request(app)
        .get(`/api/auth/magic/${magicToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.customer._id).toBe(customer._id.toString());
    });

    it('should return user data with customer info', async () => {
      const res = await request(app)
        .get(`/api/auth/magic/${magicToken}`);

      expect(res.status).toBe(200);
      // Should include basic data
      expect(res.body.user.customer.name).toBeDefined();
    });

    it('should reject short/invalid magic link token', async () => {
      // Token must be 64 chars - short token gets 400
      const res = await request(app)
        .get('/api/auth/magic/invalid-token-here');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid');
    });

    it('should reject non-existent valid-length token', async () => {
      // 64-char token that doesn't exist gets 401
      const fakeToken = 'a'.repeat(64);
      const res = await request(app)
        .get(`/api/auth/magic/${fakeToken}`);

      expect(res.status).toBe(401);
    });

    it('should reject expired magic link token', async () => {
      // Manually set token creation to past (expired)
      await Customer.findByIdAndUpdate(customer._id, {
        magicLinkCreatedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago
      });

      const res = await request(app)
        .get(`/api/auth/magic/${magicToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('expired');
    });

    it('should set authentication cookie on successful magic link auth', async () => {
      const res = await request(app)
        .get(`/api/auth/magic/${magicToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();

      const cookies = res.headers['set-cookie'];
      const tokenCookie = cookies.find(c => c.startsWith('token='));
      expect(tokenCookie).toBeDefined();
    });

    it('should allow magic link user to place orders', async () => {
      // Authenticate via magic link
      const authRes = await request(app)
        .get(`/api/auth/magic/${magicToken}`);

      expect(authRes.status).toBe(200);
      const cookies = authRes.headers['set-cookie'];
      const tokenCookie = cookies.find(c => c.startsWith('token='));
      expect(tokenCookie).toBeDefined();

      // Create product and market rate
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      // Place order using magic link session
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', tokenCookie)
        .send({
          customer: customer._id,
          products: [{
            product: product._id,
            quantity: 5
          }]
        });

      expect(orderRes.status).toBe(201);
      // Customer field might be populated (object) or just ID
      const returnedCustomerId = orderRes.body.data.customer._id || orderRes.body.data.customer;
      expect(returnedCustomerId.toString()).toBe(customer._id.toString());
    });
  });

  describe('DELETE /api/customers/:id/magic-link', () => {
    let adminToken, customer, magicToken;

    beforeEach(async () => {
      const admin = await testUtils.createAdminUser();
      adminToken = admin.token;
      customer = await testUtils.createTestCustomer();

      // Generate magic link and extract token
      const res = await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${adminToken}`);

      const link = res.body.data.link;
      magicToken = link.split('token=')[1];
    });

    it('should allow admin to revoke magic link', async () => {
      const res = await request(app)
        .delete(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('revoked');
    });

    it('should invalidate token after revocation', async () => {
      // Revoke the link
      await request(app)
        .delete(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${adminToken}`);

      // Try to use revoked token - should get 401 (not found in db)
      const authRes = await request(app)
        .get(`/api/auth/magic/${magicToken}`);

      expect(authRes.status).toBe(401);
    });

    it('should clear magic link fields from customer', async () => {
      await request(app)
        .delete(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${adminToken}`);

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.magicLinkToken).toBeUndefined();
      expect(updatedCustomer.magicLinkCreatedAt).toBeUndefined();
    });
  });

  describe('Magic Link Security', () => {
    it('should generate cryptographically strong tokens', async () => {
      const admin = await testUtils.createAdminUser();
      const customer = await testUtils.createTestCustomer();

      const res = await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${admin.token}`);

      const link = res.body.data.link;
      const token = link.split('token=')[1];

      // Token should be 64 characters (32 bytes hex encoded)
      expect(token.length).toBe(64);

      // Token should only contain hex characters
      expect(token).toMatch(/^[a-f0-9]+$/i);
    });

    it('should check that magic link token is stored in database', async () => {
      const admin = await testUtils.createAdminUser();
      const customer = await testUtils.createTestCustomer();

      // Generate magic link
      await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${admin.token}`);

      // Verify token is stored in database (direct DB check)
      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.magicLinkToken).toBeDefined();
      expect(updatedCustomer.magicLinkToken.length).toBe(64);
    });

    it('should regenerate token on subsequent requests', async () => {
      const admin = await testUtils.createAdminUser();
      const customer = await testUtils.createTestCustomer();

      // Generate first magic link
      const res1 = await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${admin.token}`);

      const token1 = res1.body.data.link.split('token=')[1];

      // Generate second magic link
      const res2 = await request(app)
        .post(`/api/customers/${customer._id}/magic-link`)
        .set('Cookie', `token=${admin.token}`);

      const token2 = res2.body.data.link.split('token=')[1];

      // Tokens should be different
      expect(token1).not.toBe(token2);

      // Old token should be invalid (not found in db)
      const authRes = await request(app)
        .get(`/api/auth/magic/${token1}`);

      expect(authRes.status).toBe(401);
    });
  });
});
