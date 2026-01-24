/**
 * Customer Isolation Tests
 * Tests to ensure customers can only access their own data
 */

require('./setup');
const request = require('supertest');
const app = require('../server');

describe('Customer Isolation', () => {
  let adminToken;
  let customerAToken;
  let customerA;
  let customerB;
  let product;

  beforeEach(async () => {
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;

    // Create two separate customers
    const customerUserA = await testUtils.createCustomerUser({ name: 'Customer A' });
    customerAToken = customerUserA.token;
    customerA = customerUserA.customer;

    const customerUserB = await testUtils.createCustomerUser({ name: 'Customer B' });
    customerB = customerUserB.customer;

    product = await testUtils.createTestProduct();
    await testUtils.createMarketRate(product, 100);
  });

  describe('Order Access Isolation', () => {
    it('customer A cannot view customer B order', async () => {
      // Create order for customer B
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderBId = orderRes.body.data._id;

      // Customer A tries to view customer B's order
      const res = await request(app)
        .get(`/api/orders/${orderBId}`)
        .set('Cookie', [`token=${customerAToken}`]);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/access denied|your own/i);
    });

    it('customer A cannot list customer B orders via filter', async () => {
      // Create orders for both customers
      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 5 }]
        });

      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      // Customer A lists their orders
      const res = await request(app)
        .get('/api/orders')
        .set('Cookie', [`token=${customerAToken}`]);

      expect(res.status).toBe(200);
      // Should only see their own orders
      expect(res.body.data.every(o =>
        o.customer._id === customerA._id.toString() ||
        o.customer === customerA._id.toString()
      )).toBe(true);

      // Should not see customer B's orders
      expect(res.body.data.some(o =>
        o.customer._id === customerB._id.toString() ||
        o.customer === customerB._id.toString()
      )).toBe(false);
    });

    it('customer A cannot edit customer B pending order via customer-edit', async () => {
      // Create pending order for customer B
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderBId = orderRes.body.data._id;

      // Customer A tries to edit customer B's order
      const res = await request(app)
        .put(`/api/orders/${orderBId}/customer-edit`)
        .set('Cookie', [`token=${customerAToken}`])
        .send({
          products: [{ product: product._id, quantity: 5 }]
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/your own/i);
    });

    it('customer can view their own order', async () => {
      // Create order for customer A
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderAId = orderRes.body.data._id;

      // Customer A views their own order
      const res = await request(app)
        .get(`/api/orders/${orderAId}`)
        .set('Cookie', [`token=${customerAToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(orderAId);
    });

    it('customer can edit their own pending order', async () => {
      // Create order for customer A
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderAId = orderRes.body.data._id;

      // Customer A edits their own order
      const res = await request(app)
        .put(`/api/orders/${orderAId}/customer-edit`)
        .set('Cookie', [`token=${customerAToken}`])
        .send({
          products: [{ product: product._id, quantity: 5 }]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.products[0].quantity).toBe(5);
    });
  });

  describe('Order Creation Isolation', () => {
    it('customer cannot create order for different customer', async () => {
      // Customer A tries to create order for customer B
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${customerAToken}`])
        .send({
          customer: customerB._id, // Different customer
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/only.*yourself/i);
    });

    it('customer can create order for themselves', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${customerAToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.customer._id || res.body.data.customer).toBe(customerA._id.toString());
    });

    it('API returns 403 with clear message for cross-customer order', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${customerAToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeDefined();
    });
  });

  describe('Magic Link User Isolation', () => {
    beforeEach(async () => {
      // Set up magic link tokens on customers (required for revocation check in auth middleware)
      await testUtils.setupMagicLinkForCustomer(customerA._id);
      await testUtils.setupMagicLinkForCustomer(customerB._id);
    });

    it('magic link user can only access their own orders', async () => {
      // Generate magic link for customer A
      const magicLinkToken = testUtils.createMagicLinkJWT(customerA._id);

      // Create orders for both customers
      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 5 }]
        });

      const orderBRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderBId = orderBRes.body.data._id;

      // Magic link user (customer A) tries to access customer B's order
      const res = await request(app)
        .get(`/api/orders/${orderBId}`)
        .set('Cookie', [`token=${magicLinkToken}`]);

      expect(res.status).toBe(403);
    });

    it('magic link user can list only their orders', async () => {
      const magicLinkToken = testUtils.createMagicLinkJWT(customerA._id);

      // Create orders for both customers
      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 5 }]
        });

      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      // Magic link user lists orders
      const res = await request(app)
        .get('/api/orders')
        .set('Cookie', [`token=${magicLinkToken}`]);

      expect(res.status).toBe(200);
      // Should only see customer A's orders
      res.body.data.forEach(order => {
        const custId = order.customer._id || order.customer;
        expect(custId).toBe(customerA._id.toString());
      });
    });

    it('magic link user can create order for themselves', async () => {
      const magicLinkToken = testUtils.createMagicLinkJWT(customerA._id);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${magicLinkToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
    });

    it('magic link user cannot create order for other customer', async () => {
      const magicLinkToken = testUtils.createMagicLinkJWT(customerA._id);

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${magicLinkToken}`])
        .send({
          customer: customerB._id, // Different customer
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Staff/Admin Cross-Customer Access', () => {
    it('admin can view any customer order', async () => {
      // Create order for customer B
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderBId = orderRes.body.data._id;

      // Admin views customer B's order
      const res = await request(app)
        .get(`/api/orders/${orderBId}`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(orderBId);
    });

    it('admin can list all customer orders', async () => {
      // Create orders for both customers
      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 5 }]
        });

      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      // Admin lists all orders
      const res = await request(app)
        .get('/api/orders')
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      // Should see orders from both customers
      const customerIds = res.body.data.map(o => o.customer._id || o.customer);
      expect(customerIds).toContain(customerA._id.toString());
      expect(customerIds).toContain(customerB._id.toString());
    });

    it('admin can create order for any customer', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      expect(res.status).toBe(201);
    });

    it('staff can view any customer order', async () => {
      const staff = await testUtils.createStaffUser();

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${staff.token}`]);

      expect(res.status).toBe(200);
    });
  });

  describe('Customer Account Link Validation', () => {
    it('should reject customer user with no linked customer account', async () => {
      // Create a customer user without proper customer link
      const { token } = await testUtils.createTestUser({
        name: 'Orphan Customer',
        role: 'customer',
        customer: null // No customer link
      });

      const res = await request(app)
        .get('/api/orders')
        .set('Cookie', [`token=${token}`]);

      // Should get 403 because customer account not properly linked
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/not properly linked/i);
    });
  });

  describe('Orders by Customer Endpoint', () => {
    it('customer can access their orders via /customer/:id endpoint', async () => {
      // Create order for customer A
      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerA._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      // Customer A accesses their orders
      const res = await request(app)
        .get(`/api/orders/customer/${customerA._id}`)
        .set('Cookie', [`token=${customerAToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('customer cannot access other customer orders via /customer/:id endpoint', async () => {
      // Create order for customer B
      await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customerB._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      // Customer A tries to access customer B's orders
      const res = await request(app)
        .get(`/api/orders/customer/${customerB._id}`)
        .set('Cookie', [`token=${customerAToken}`]);

      expect(res.status).toBe(403);
    });
  });
});
