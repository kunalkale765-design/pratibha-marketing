require('./setup');
const request = require('supertest');
const app = require('../server');
const { testUtils } = require('./setup');

describe('Reconciliation Guards & Validation', () => {
  let admin, adminToken, _staff, staffToken, customer, _customerUser, customerToken;
  let product;

  beforeEach(async () => {
    const adminResult = await testUtils.createAdminUser();
    admin = adminResult.user;
    adminToken = adminResult.token;

    const staffResult = await testUtils.createStaffUser();
    _staff = staffResult.user;
    staffToken = staffResult.token;

    const customerResult = await testUtils.createCustomerUser();
    _customerUser = customerResult.user;
    customerToken = customerResult.token;
    customer = customerResult.customer;

    product = await testUtils.createTestProduct();
  });

  describe('Reconciled order protection', () => {
    it('should reject price updates on reconciled orders', async () => {
      const order = await testUtils.createTestOrder(customer, product, {
        status: 'delivered',
        reconciliation: {
          completedAt: new Date(),
          completedBy: admin._id,
          changes: [],
          originalTotal: 1000
        }
      });

      const res = await request(app)
        .put(`/api/orders/${order._id}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          products: [{ product: product._id.toString(), rate: 200, quantity: 10 }]
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toMatch(/reconciled/i);
    });

    it('should allow price updates on non-reconciled orders', async () => {
      const order = await testUtils.createTestOrder(customer, product, {
        status: 'confirmed'
      });

      const res = await request(app)
        .put(`/api/orders/${order._id}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          products: [{ product: product._id.toString(), rate: 200, quantity: 10 }]
        });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Reconciliation product validation', () => {
    it('should reject reconciliation with product not in order', async () => {
      const extraProduct = await testUtils.createTestProduct({ name: 'Extra Product' });
      const order = await testUtils.createTestOrder(customer, product, {
        status: 'confirmed',
        packingDone: true
      });

      const res = await request(app)
        .post(`/api/reconciliation/${order._id}/complete`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          items: [
            { product: product._id.toString(), deliveredQty: 10 },
            { product: extraProduct._id.toString(), deliveredQty: 5 }
          ]
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/not part of this order/i);
    });
  });

  describe('Permission enforcement', () => {
    it('should deny customer access to reconciliation pending', async () => {
      const res = await request(app)
        .get('/api/reconciliation/pending')
        .set('Cookie', [`token=${customerToken}`]);
      expect(res.statusCode).toBe(403);
    });

    it('should deny customer access to packing queue', async () => {
      const res = await request(app)
        .get('/api/packing/queue')
        .set('Cookie', [`token=${customerToken}`]);
      expect(res.statusCode).toBe(403);
    });

    it('should deny customer access to ledger', async () => {
      const res = await request(app)
        .get('/api/ledger/')
        .set('Cookie', [`token=${customerToken}`]);
      expect(res.statusCode).toBe(403);
    });

    it('should deny staff from cancelling orders', async () => {
      const order = await testUtils.createTestOrder(customer, product);

      const res = await request(app)
        .delete(`/api/orders/${order._id}`)
        .set('Cookie', [`token=${staffToken}`]);
      expect(res.statusCode).toBe(403);
    });

    it('should allow admin to cancel orders', async () => {
      const order = await testUtils.createTestOrder(customer, product);

      const res = await request(app)
        .delete(`/api/orders/${order._id}`)
        .set('Cookie', [`token=${adminToken}`]);
      expect(res.statusCode).toBe(200);
    });

    it('should deny customer access to ledger balances', async () => {
      const res = await request(app)
        .get('/api/ledger/balances')
        .set('Cookie', [`token=${customerToken}`]);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Pagination for reconciliation', () => {
    it('should return pagination metadata for pending reconciliation', async () => {
      const res = await request(app)
        .get('/api/reconciliation/pending')
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('pages');
    });

    it('should respect page parameter', async () => {
      const res = await request(app)
        .get('/api/reconciliation/pending?page=2&limit=5')
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body.page).toBe(2);
    });
  });

  describe('Ledger pagination', () => {
    it('should return pagination metadata for ledger list', async () => {
      const res = await request(app)
        .get('/api/ledger/')
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('pages');
    });

    it('should return pagination metadata for customer ledger', async () => {
      const res = await request(app)
        .get(`/api/ledger/customer/${customer._id}`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('pages');
    });
  });

  describe('Contract price validation', () => {
    it('should reject negative contract prices', async () => {
      const testCustomer = await testUtils.createTestCustomer({ pricingType: 'contract' });

      const res = await request(app)
        .put(`/api/customers/${testCustomer._id}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          name: testCustomer.name,
          contractPrices: { [product._id.toString()]: -50 }
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/positive/i);
    });

    it('should reject zero contract prices', async () => {
      const testCustomer = await testUtils.createTestCustomer({ pricingType: 'contract' });

      const res = await request(app)
        .put(`/api/customers/${testCustomer._id}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          name: testCustomer.name,
          contractPrices: { [product._id.toString()]: 0 }
        });

      expect(res.statusCode).toBe(400);
    });

    it('should accept valid contract prices', async () => {
      const testCustomer = await testUtils.createTestCustomer({ pricingType: 'contract' });

      const res = await request(app)
        .put(`/api/customers/${testCustomer._id}`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          name: testCustomer.name,
          contractPrices: { [product._id.toString()]: 150 }
        });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Customer-edit quantity validation', () => {
    it('should reject quantities exceeding maximum', async () => {
      await testUtils.createMarketRate(product, 100);
      const order = await testUtils.createTestOrder(customer, product);

      const res = await request(app)
        .put(`/api/orders/${order._id}/customer-edit`)
        .set('Cookie', [`token=${customerToken}`])
        .send({
          products: [{ product: product._id.toString(), quantity: 1000001 }]
        });

      expect(res.statusCode).toBe(500); // thrown error handled by error handler
      expect(res.body.message).toMatch(/maximum/i);
    });
  });
});
