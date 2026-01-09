const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { testUtils, JWT_SECRET } = require('./setup');
const Customer = require('../models/Customer');
const User = require('../models/User');

describe('Auth Middleware Extended Tests', () => {
  describe('Magic Link Authentication', () => {
    it('should reject magic link token for inactive customer', async () => {
      // Create an inactive customer
      const customer = await Customer.create({
        name: 'Inactive Customer',
        phone: '1234567890',
        pricingType: 'market',
        isActive: false
      });

      // Create a magic link token
      const token = jwt.sign(
        { type: 'magic', customerId: customer._id },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid session');
    });

    it('should reject magic link token for non-existent customer', async () => {
      const fakeCustomerId = '507f1f77bcf86cd799439011';
      const token = jwt.sign(
        { type: 'magic', customerId: fakeCustomerId },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid session');
    });

    it('should authenticate valid magic link token for active customer', async () => {
      const customer = await Customer.create({
        name: 'Active Customer',
        phone: '1234567890',
        pricingType: 'market',
        isActive: true
      });

      const token = jwt.sign(
        { type: 'magic', customerId: customer._id },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Token Error Handling', () => {
    it('should return 401 for invalid token format', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', 'Bearer invalid-token-format');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid token');
    });

    it('should return 401 for expired token', async () => {
      const { user } = await testUtils.createTestUser();

      // Create an already expired token
      const expiredToken = jwt.sign(
        { id: user._id },
        JWT_SECRET,
        { expiresIn: '-1s' } // Already expired
      );

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('expired');
    });

    it('should return 401 for token signed with wrong secret', async () => {
      const { user } = await testUtils.createTestUser();

      const wrongSecretToken = jwt.sign(
        { id: user._id },
        'wrong-secret-key',
        { expiresIn: '1d' }
      );

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${wrongSecretToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid token');
    });
  });

  describe('User State Checks', () => {
    it('should reject token for non-existent user', async () => {
      const fakeUserId = '507f1f77bcf86cd799439011';
      const token = jwt.sign(
        { id: fakeUserId },
        JWT_SECRET,
        { expiresIn: '1d' }
      );

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('User not found');
    });

    it('should reject token for deactivated user', async () => {
      const { user, token } = await testUtils.createTestUser({
        isActive: false
      });

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('deactivated');
    });
  });

  describe('Token Sources', () => {
    it('should accept token from cookie', async () => {
      const { token } = await testUtils.createAdminUser();

      const res = await request(app)
        .get('/api/products')
        .set('Cookie', `token=${token}`);

      expect(res.status).toBe(200);
    });

    it('should prefer cookie over Authorization header', async () => {
      const admin = await testUtils.createAdminUser();
      const customer = await testUtils.createCustomerUser();

      // Set admin token in cookie, customer token in header
      const res = await request(app)
        .get('/api/products')
        .set('Cookie', `token=${admin.token}`)
        .set('Authorization', `Bearer ${customer.token}`);

      // Should use cookie (admin) token
      expect(res.status).toBe(200);
    });
  });

  describe('Authorization Middleware', () => {
    it('should reject access when user role not in allowed roles', async () => {
      const { token } = await testUtils.createCustomerUser();

      // Customers cannot access supplier routes
      const res = await request(app)
        .get('/api/supplier/quantity-summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should allow access when user role is in allowed roles', async () => {
      const { token } = await testUtils.createStaffUser();

      const res = await request(app)
        .get('/api/supplier/quantity-summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('should return 401 if authorize called without user', async () => {
      // This is an edge case - shouldn't normally happen but tests the check
      const res = await request(app)
        .get('/api/supplier/quantity-summary');
      // No token provided

      expect(res.status).toBe(401);
    });
  });

  describe('Optional Auth Middleware', () => {
    it('should continue without user for public endpoints', async () => {
      const res = await request(app)
        .get('/api/health');

      expect(res.status).toBe(200);
    });

    it('should attach user when valid token provided to optional auth route', async () => {
      const { token, user } = await testUtils.createAdminUser();

      // Health endpoint uses optional auth (or no auth)
      const res = await request(app)
        .get('/api/health')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('should continue without error for expired token on optional auth', async () => {
      const { user } = await testUtils.createTestUser();

      const expiredToken = jwt.sign(
        { id: user._id },
        JWT_SECRET,
        { expiresIn: '-1s' }
      );

      // Health is a public endpoint, should work even with bad token
      const res = await request(app)
        .get('/api/health')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Bearer Token Parsing', () => {
    it('should reject Authorization header without Bearer prefix', async () => {
      const { token } = await testUtils.createAdminUser();

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', token); // No "Bearer " prefix

      expect(res.status).toBe(401);
    });

    it('should handle malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', 'Bearer'); // No token after Bearer

      expect(res.status).toBe(401);
    });
  });
});
