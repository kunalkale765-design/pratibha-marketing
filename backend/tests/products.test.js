const request = require('supertest');
const app = require('../server');
const Product = require('../models/Product');
const { testUtils } = require('./setup');

describe('Product Endpoints', () => {
  let adminToken;
  let staffToken;
  let customerToken;

  beforeEach(async () => {
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;

    const staff = await testUtils.createStaffUser();
    staffToken = staff.token;

    const customer = await testUtils.createCustomerUser();
    customerToken = customer.token;
  });

  describe('GET /api/products', () => {
    beforeEach(async () => {
      await testUtils.createTestProduct({ name: 'Product A', category: 'Vegetables' });
      await testUtils.createTestProduct({ name: 'Product B', category: 'Fruits' });
      await testUtils.createTestProduct({ name: 'Product C', isActive: false }); // Inactive
    });

    it('should return all active products for authenticated user', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should return products including inactive for admin', async () => {
      const res = await request(app)
        .get('/api/products?includeInactive=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      // Admin should see all including inactive
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/products');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/products/:id', () => {
    let testProduct;

    beforeEach(async () => {
      testProduct = await testUtils.createTestProduct({ name: 'Specific Product' });
    });

    it('should return a specific product', async () => {
      const res = await request(app)
        .get(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Specific Product');
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/products/${fakeId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/products', () => {
    it('should create a new product as admin', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Product',
          unit: 'kg',
          category: 'Vegetables'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Product');
      expect(res.body.data.unit).toBe('kg');
    });

    it('should create a new product as staff', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Staff Product',
          unit: 'quintal',
          category: 'Grains'
        });

      expect(res.statusCode).toBe(201);
    });

    it('should reject product creation by customer', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Unauthorized Product',
          unit: 'kg'
        });

      expect(res.statusCode).toBe(403);
    });

    it('should reject duplicate product name', async () => {
      await testUtils.createTestProduct({ name: 'Duplicate Product' });

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Product',
          unit: 'kg'
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid unit', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Unit Product',
          unit: 'gallon' // Invalid unit
        });

      expect(res.statusCode).toBe(400);
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          unit: 'kg'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/products/:id', () => {
    let testProduct;

    beforeEach(async () => {
      testProduct = await testUtils.createTestProduct({ name: 'Update Test Product' });
    });

    it('should update product details as admin', async () => {
      const res = await request(app)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Product Name',
          unit: 'kg', // Required by validation
          category: 'New Category'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Updated Product Name');
      expect(res.body.data.category).toBe('New Category');
    });

    it('should update product unit as staff', async () => {
      const res = await request(app)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: testProduct.name, // Required by validation
          unit: 'quintal'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.unit).toBe('quintal');
    });

    it('should reject update by customer', async () => {
      const res = await request(app)
        .put(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Unauthorized Update'
        });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/products/:id', () => {
    let testProduct;

    beforeEach(async () => {
      testProduct = await testUtils.createTestProduct({ name: 'Delete Test Product' });
    });

    it('should soft delete a product as admin', async () => {
      const res = await request(app)
        .delete(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);

      // Verify soft delete
      const deleted = await Product.findById(testProduct._id);
      expect(deleted.isActive).toBe(false);
    });

    it('should soft delete a product as staff', async () => {
      const res = await request(app)
        .delete(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('should reject deletion by customer', async () => {
      const res = await request(app)
        .delete(`/api/products/${testProduct._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Product Units', () => {
    it.each(['quintal', 'bag', 'kg', 'piece', 'ton'])('should accept valid unit: %s', async (unit) => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Product with ${unit}`,
          unit: unit
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.unit).toBe(unit);
    });
  });
});
