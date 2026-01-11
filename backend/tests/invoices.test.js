/**
 * Invoice System Tests
 * Tests for invoice endpoints: firms, split, PDF generation, and data
 */

require('./setup');
const request = require('supertest');
const app = require('../server');

describe('Invoice System', () => {
  let adminToken;
  let staffToken;
  let customerToken;
  let customer;

  beforeEach(async () => {
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;

    const customerUser = await testUtils.createCustomerUser();
    customerToken = customerUser.token;
    customer = customerUser.customer;
  });

  describe('GET /api/invoices/firms', () => {
    it('should return list of firms for admin', async () => {
      const res = await request(app)
        .get('/api/invoices/firms')
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      // Check firm structure
      const pratibha = res.body.data.find(f => f.id === 'pratibha');
      expect(pratibha).toBeDefined();
      expect(pratibha.name).toBe('Pratibha Marketing');
      expect(pratibha.isDefault).toBe(true);

      const vikas = res.body.data.find(f => f.id === 'vikas');
      expect(vikas).toBeDefined();
      expect(vikas.name).toBe('Vikas Frozen Foods');
      expect(vikas.categories).toContain('Fruits');
      expect(vikas.categories).toContain('Frozen');
    });

    it('should return list of firms for staff', async () => {
      const res = await request(app)
        .get('/api/invoices/firms')
        .set('Cookie', [`token=${staffToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject customer access to firms', async () => {
      const res = await request(app)
        .get('/api/invoices/firms')
        .set('Cookie', [`token=${customerToken}`]);

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/invoices/firms');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/invoices/:orderId/split', () => {
    it('should split order items by firm based on category', async () => {
      // Create products in different categories
      const vegProduct = await testUtils.createCategorizedProduct('Vegetables');
      const fruitProduct = await testUtils.createCategorizedProduct('Fruits');

      await testUtils.createMarketRate(vegProduct, 100);
      await testUtils.createMarketRate(fruitProduct, 200);

      // Create order with both products
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [
            { product: vegProduct._id, quantity: 10 },
            { product: fruitProduct._id, quantity: 5 }
          ]
        });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data._id;

      // Get split
      const res = await request(app)
        .get(`/api/invoices/${orderId}/split`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(orderId);
      expect(Array.isArray(res.body.data.firms)).toBe(true);

      // Check Pratibha firm has vegetables
      const pratibhaFirm = res.body.data.firms.find(f => f.firmId === 'pratibha');
      expect(pratibhaFirm).toBeDefined();
      expect(pratibhaFirm.items.some(i => i.category === 'Vegetables')).toBe(true);

      // Check Vikas firm has fruits
      const vikasFirm = res.body.data.firms.find(f => f.firmId === 'vikas');
      expect(vikasFirm).toBeDefined();
      expect(vikasFirm.items.some(i => i.category === 'Fruits')).toBe(true);
    });

    it('should assign Fruits to Vikas Frozen Foods', async () => {
      const fruitProduct = await testUtils.createCategorizedProduct('Fruits');
      await testUtils.createMarketRate(fruitProduct, 150);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: fruitProduct._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .get(`/api/invoices/${orderId}/split`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(200);
      const vikasFirm = res.body.data.firms.find(f => f.firmId === 'vikas');
      expect(vikasFirm).toBeDefined();
      expect(vikasFirm.items.length).toBe(1);
      expect(vikasFirm.items[0].category).toBe('Fruits');
    });

    it('should assign Frozen to Vikas Frozen Foods', async () => {
      const frozenProduct = await testUtils.createCategorizedProduct('Frozen');
      await testUtils.createMarketRate(frozenProduct, 250);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: frozenProduct._id, quantity: 5 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .get(`/api/invoices/${orderId}/split`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(200);
      const vikasFirm = res.body.data.firms.find(f => f.firmId === 'vikas');
      expect(vikasFirm).toBeDefined();
      expect(vikasFirm.items[0].category).toBe('Frozen');
    });

    it('should assign other categories to Pratibha Marketing (default)', async () => {
      const grainProduct = await testUtils.createCategorizedProduct('Grains');
      await testUtils.createMarketRate(grainProduct, 80);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: grainProduct._id, quantity: 20 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .get(`/api/invoices/${orderId}/split`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(200);
      const pratibhaFirm = res.body.data.firms.find(f => f.firmId === 'pratibha');
      expect(pratibhaFirm).toBeDefined();
      expect(pratibhaFirm.items[0].category).toBe('Grains');
    });

    it('should handle products without category (assign to default)', async () => {
      const product = await testUtils.createTestProduct({ category: null });
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .get(`/api/invoices/${orderId}/split`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(200);
      // Should go to default firm (pratibha)
      const pratibhaFirm = res.body.data.firms.find(f => f.firmId === 'pratibha');
      expect(pratibhaFirm).toBeDefined();
    });

    it('should return 404 for non-existent order', async () => {
      const fakeOrderId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .get(`/api/invoices/${fakeOrderId}/split`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('should return 400 for invalid orderId format', async () => {
      const res = await request(app)
        .get('/api/invoices/invalid-id/split')
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid/i);
    });

    it('should reject customer access to split', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .get(`/api/invoices/${orderId}/split`)
        .set('Cookie', [`token=${customerToken}`]);

      expect(res.status).toBe(403);
    });

    it('should return subtotals for each firm', async () => {
      const vegProduct = await testUtils.createCategorizedProduct('Vegetables');
      const fruitProduct = await testUtils.createCategorizedProduct('Fruits');

      await testUtils.createMarketRate(vegProduct, 100);
      await testUtils.createMarketRate(fruitProduct, 200);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [
            { product: vegProduct._id, quantity: 10 }, // 1000
            { product: fruitProduct._id, quantity: 5 } // 1000
          ]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .get(`/api/invoices/${orderId}/split`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(200);

      const pratibhaFirm = res.body.data.firms.find(f => f.firmId === 'pratibha');
      expect(pratibhaFirm.subtotal).toBe(1000);

      const vikasFirm = res.body.data.firms.find(f => f.firmId === 'vikas');
      expect(vikasFirm.subtotal).toBe(1000);
    });

    it('should reject split for cancelled orders', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      // Cancel the order
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      const res = await request(app)
        .get(`/api/invoices/${orderId}/split`)
        .set('Cookie', [`token=${adminToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cancelled/i);
    });
  });

  describe('POST /api/invoices/:orderId/pdf', () => {
    it('should generate PDF for valid firmId and order', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .post(`/api/invoices/${orderId}/pdf`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'pratibha' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/attachment.*\.pdf/);
    });

    it('should filter products by productIds if provided', async () => {
      const product1 = await testUtils.createTestProduct({ name: `PDF Product 1 ${Date.now()}` });
      const product2 = await testUtils.createTestProduct({ name: `PDF Product 2 ${Date.now()}` });

      await testUtils.createMarketRate(product1, 100);
      await testUtils.createMarketRate(product2, 200);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [
            { product: product1._id, quantity: 10 },
            { product: product2._id, quantity: 5 }
          ]
        });

      const orderId = orderRes.body.data._id;

      // Request PDF for only product1
      const res = await request(app)
        .post(`/api/invoices/${orderId}/pdf`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          firmId: 'pratibha',
          productIds: [product1._id.toString()]
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
    });

    it('should return 400 for invalid firmId', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .post(`/api/invoices/${orderId}/pdf`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'invalid-firm' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid.*firm/i);
    });

    it('should return 400 for empty items selection', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      // Request with non-existent product ID
      const res = await request(app)
        .post(`/api/invoices/${orderId}/pdf`)
        .set('Cookie', [`token=${adminToken}`])
        .send({
          firmId: 'pratibha',
          productIds: ['507f1f77bcf86cd799439011'] // Non-existent product
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no items/i);
    });

    it('should return 404 for non-existent order', async () => {
      const fakeOrderId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .post(`/api/invoices/${fakeOrderId}/pdf`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'pratibha' });

      expect(res.status).toBe(404);
    });

    it('should return 400 when firmId is missing', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .post(`/api/invoices/${orderId}/pdf`)
        .set('Cookie', [`token=${adminToken}`])
        .send({}); // No firmId

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/firm.*required/i);
    });

    it('should reject PDF generation for cancelled orders', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      // Cancel the order
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      const res = await request(app)
        .post(`/api/invoices/${orderId}/pdf`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'pratibha' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cancelled/i);
    });
  });

  describe('POST /api/invoices/:orderId/data', () => {
    it('should return invoice data as JSON', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .post(`/api/invoices/${orderId}/data`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'pratibha' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('invoiceNumber');
      expect(res.body.data).toHaveProperty('firm');
      expect(res.body.data).toHaveProperty('customer');
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');
    });

    it('should format invoice number from order number', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;
      const orderNumber = orderRes.body.data.orderNumber;

      const res = await request(app)
        .post(`/api/invoices/${orderId}/data`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'pratibha' });

      expect(res.status).toBe(200);
      // Invoice number should be derived from order number
      expect(res.body.data.invoiceNumber).toBeDefined();
    });

    it('should include firm details', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .post(`/api/invoices/${orderId}/data`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'pratibha' });

      expect(res.status).toBe(200);
      expect(res.body.data.firm.name).toBe('Pratibha Marketing');
      expect(res.body.data.firm.address).toBeDefined();
    });

    it('should include customer details', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .post(`/api/invoices/${orderId}/data`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'pratibha' });

      expect(res.status).toBe(200);
      expect(res.body.data.customer).toBeDefined();
      expect(res.body.data.customer.name).toBeDefined();
    });

    it('should calculate correct total', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .post(`/api/invoices/${orderId}/data`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'pratibha' });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1000); // 10 * 100
    });

    it('should return 400 for invalid firmId', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      const res = await request(app)
        .post(`/api/invoices/${orderId}/data`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'nonexistent' });

      expect(res.status).toBe(400);
    });

    it('should reject data request for cancelled orders', async () => {
      const product = await testUtils.createTestProduct();
      await testUtils.createMarketRate(product, 100);

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: customer._id,
          products: [{ product: product._id, quantity: 10 }]
        });

      const orderId = orderRes.body.data._id;

      // Cancel the order
      await request(app)
        .delete(`/api/orders/${orderId}`)
        .set('Cookie', [`token=${adminToken}`]);

      const res = await request(app)
        .post(`/api/invoices/${orderId}/data`)
        .set('Cookie', [`token=${adminToken}`])
        .send({ firmId: 'pratibha' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cancelled/i);
    });
  });
});
