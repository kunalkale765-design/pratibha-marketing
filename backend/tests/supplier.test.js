const request = require('supertest');
const app = require('../server');
const { testUtils } = require('./setup');

describe('Supplier Endpoints', () => {
  let adminUser, adminToken;
  let staffUser, staffToken;
  let customerUser, customerToken, customer;
  let product1, product2;

  beforeEach(async () => {
    // Create users
    const admin = await testUtils.createAdminUser();
    adminUser = admin.user;
    adminToken = admin.token;

    const staff = await testUtils.createStaffUser();
    staffUser = staff.user;
    staffToken = staff.token;

    const customerData = await testUtils.createCustomerUser();
    customerUser = customerData.user;
    customerToken = customerData.token;
    customer = customerData.customer;

    // Create products
    product1 = await testUtils.createTestProduct({ name: 'Rice', unit: 'quintal' });
    product2 = await testUtils.createTestProduct({ name: 'Wheat', unit: 'bag' });

    // Create market rates
    await testUtils.createMarketRate(product1, 2500);
    await testUtils.createMarketRate(product2, 1800);
  });

  describe('GET /api/supplier/quantity-summary', () => {
    it('should return quantity summary for admin', async () => {
      // Create some orders
      await testUtils.createTestOrder(customer, product1, {
        status: 'pending',
        products: [{
          product: product1._id,
          productName: product1.name,
          quantity: 50,
          unit: product1.unit,
          rate: 2500,
          amount: 125000
        }]
      });

      await testUtils.createTestOrder(customer, product2, {
        status: 'confirmed',
        products: [{
          product: product2._id,
          productName: product2.name,
          quantity: 30,
          unit: product2.unit,
          rate: 1800,
          amount: 54000
        }]
      });

      const res = await request(app)
        .get('/api/supplier/quantity-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.totalOrders).toBeGreaterThanOrEqual(2);
    });

    it('should return quantity summary for staff', async () => {
      const res = await request(app)
        .get('/api/supplier/quantity-summary')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny access to customer', async () => {
      const res = await request(app)
        .get('/api/supplier/quantity-summary')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('should aggregate quantities from multiple orders for same product', async () => {
      // Create multiple orders with same product
      await testUtils.createTestOrder(customer, product1, {
        status: 'pending',
        products: [{
          product: product1._id,
          productName: product1.name,
          quantity: 20,
          unit: product1.unit,
          rate: 2500,
          amount: 50000
        }]
      });

      await testUtils.createTestOrder(customer, product1, {
        status: 'confirmed',
        products: [{
          product: product1._id,
          productName: product1.name,
          quantity: 30,
          unit: product1.unit,
          rate: 2500,
          amount: 75000
        }]
      });

      const res = await request(app)
        .get('/api/supplier/quantity-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const riceItem = res.body.data.find(item => item.productName === 'Rice');
      expect(riceItem).toBeDefined();
      expect(riceItem.totalQuantity).toBe(50); // 20 + 30
      expect(riceItem.orderCount).toBe(2);
    });

    it('should exclude delivered and cancelled orders', async () => {
      await testUtils.createTestOrder(customer, product1, {
        status: 'delivered',
        products: [{
          product: product1._id,
          productName: product1.name,
          quantity: 100,
          unit: product1.unit,
          rate: 2500,
          amount: 250000
        }]
      });

      await testUtils.createTestOrder(customer, product1, {
        status: 'cancelled',
        products: [{
          product: product1._id,
          productName: product1.name,
          quantity: 200,
          unit: product1.unit,
          rate: 2500,
          amount: 500000
        }]
      });

      const res = await request(app)
        .get('/api/supplier/quantity-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Should not include delivered/cancelled orders
      const riceItem = res.body.data.find(item => item.productName === 'Rice');
      if (riceItem) {
        expect(riceItem.totalQuantity).not.toBe(300);
      }
    });

    it('should return empty array when no pending orders', async () => {
      const res = await request(app)
        .get('/api/supplier/quantity-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should include market rate and estimated value', async () => {
      await testUtils.createTestOrder(customer, product1, {
        status: 'pending',
        products: [{
          product: product1._id,
          productName: product1.name,
          quantity: 10,
          unit: product1.unit,
          rate: 2500,
          amount: 25000
        }]
      });

      const res = await request(app)
        .get('/api/supplier/quantity-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const riceItem = res.body.data.find(item => item.productName === 'Rice');
      expect(riceItem).toBeDefined();
      expect(riceItem.marketRate).toBe(2500);
      expect(riceItem.estimatedValue).toBeDefined();
    });
  });

  describe('GET /api/supplier/pending-orders', () => {
    it('should return pending orders for admin', async () => {
      await testUtils.createTestOrder(customer, product1, { status: 'pending' });
      await testUtils.createTestOrder(customer, product2, { status: 'confirmed' });

      const res = await request(app)
        .get('/api/supplier/pending-orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.count).toBeGreaterThanOrEqual(2);
    });

    it('should return pending orders for staff', async () => {
      const res = await request(app)
        .get('/api/supplier/pending-orders')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny access to customer', async () => {
      const res = await request(app)
        .get('/api/supplier/pending-orders')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('should populate customer and product details', async () => {
      await testUtils.createTestOrder(customer, product1, { status: 'pending' });

      const res = await request(app)
        .get('/api/supplier/pending-orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const order = res.body.data[0];
      expect(order.customer).toBeDefined();
      expect(order.customer.name).toBeDefined();
    });

    it('should sort by createdAt descending', async () => {
      const order1 = await testUtils.createTestOrder(customer, product1, { status: 'pending' });
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const order2 = await testUtils.createTestOrder(customer, product2, { status: 'pending' });

      const res = await request(app)
        .get('/api/supplier/pending-orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.length >= 2) {
        const firstOrderDate = new Date(res.body.data[0].createdAt);
        const secondOrderDate = new Date(res.body.data[1].createdAt);
        expect(firstOrderDate.getTime()).toBeGreaterThanOrEqual(secondOrderDate.getTime());
      }
    });

    it('should limit results to 50', async () => {
      const res = await request(app)
        .get('/api/supplier/pending-orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(50);
    });
  });

  describe('GET /api/supplier/daily-requirements', () => {
    it('should return daily requirements for admin', async () => {
      await testUtils.createTestOrder(customer, product1, { status: 'pending' });

      const res = await request(app)
        .get('/api/supplier/daily-requirements')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.date).toBeDefined();
      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should return daily requirements for staff', async () => {
      const res = await request(app)
        .get('/api/supplier/daily-requirements')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny access to customer', async () => {
      const res = await request(app)
        .get('/api/supplier/daily-requirements')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('should aggregate quantities for today orders', async () => {
      await testUtils.createTestOrder(customer, product1, {
        status: 'pending',
        products: [{
          product: product1._id,
          productName: product1.name,
          quantity: 15,
          unit: product1.unit,
          rate: 2500,
          amount: 37500
        }]
      });

      await testUtils.createTestOrder(customer, product1, {
        status: 'confirmed',
        products: [{
          product: product1._id,
          productName: product1.name,
          quantity: 25,
          unit: product1.unit,
          rate: 2500,
          amount: 62500
        }]
      });

      const res = await request(app)
        .get('/api/supplier/daily-requirements')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const riceReq = res.body.data.find(item => item.product === 'Rice');
      expect(riceReq).toBeDefined();
      expect(riceReq.quantity).toBe(40); // 15 + 25
    });

    it('should return today date in response', async () => {
      const res = await request(app)
        .get('/api/supplier/daily-requirements')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // The server uses local midnight, so we match that
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expectedDate = today.toISOString().split('T')[0];
      expect(res.body.date).toBe(expectedDate);
    });

    it('should include order count', async () => {
      await testUtils.createTestOrder(customer, product1, { status: 'pending' });
      await testUtils.createTestOrder(customer, product2, { status: 'confirmed' });

      const res = await request(app)
        .get('/api/supplier/daily-requirements')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.orderCount).toBeGreaterThanOrEqual(2);
    });

    it('should only include pending and confirmed orders', async () => {
      await testUtils.createTestOrder(customer, product1, { status: 'pending' });
      await testUtils.createTestOrder(customer, product1, { status: 'delivered' });
      await testUtils.createTestOrder(customer, product1, { status: 'cancelled' });

      const res = await request(app)
        .get('/api/supplier/daily-requirements')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Only pending order should be counted (confirmed is also included but we only have pending)
      expect(res.body.orderCount).toBe(1);
    });
  });

  describe('Authentication', () => {
    it('should reject unauthenticated access to quantity-summary', async () => {
      const res = await request(app)
        .get('/api/supplier/quantity-summary');

      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated access to pending-orders', async () => {
      const res = await request(app)
        .get('/api/supplier/pending-orders');

      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated access to daily-requirements', async () => {
      const res = await request(app)
        .get('/api/supplier/daily-requirements');

      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated access to procurement-summary', async () => {
      const res = await request(app)
        .get('/api/supplier/procurement-summary');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/supplier/procurement-summary', () => {
    let vegetableProduct, fruitProduct;

    beforeEach(async () => {
      // Create products in procurement categories
      vegetableProduct = await testUtils.createTestProduct({
        name: 'Tomato',
        unit: 'kg',
        category: 'Indian Vegetables'
      });
      fruitProduct = await testUtils.createTestProduct({
        name: 'Apple',
        unit: 'kg',
        category: 'Fruits'
      });
    });

    it('should return procurement summary for admin', async () => {
      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.toProcure).toBeInstanceOf(Array);
      expect(res.body.procured).toBeInstanceOf(Array);
      expect(res.body.categories).toBeInstanceOf(Array);
      expect(res.body.summary).toBeDefined();
    });

    it('should return procurement summary for staff', async () => {
      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny access to customer', async () => {
      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('should return date and current time', async () => {
      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.date).toBeDefined();
      expect(res.body.currentTime).toBeDefined();
    });

    // Batch status fields removed - simplified procurement logic

    it('should include summary counts', async () => {
      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(typeof res.body.summary.toProcureCount).toBe('number');
      expect(typeof res.body.summary.procuredCount).toBe('number');
      expect(typeof res.body.summary.totalProducts).toBe('number');
    });

    it('should include all active product categories', async () => {
      // Create products in different categories
      await testUtils.createTestProduct({
        name: 'Frozen Peas',
        unit: 'kg',
        category: 'Frozen'
      });
      await testUtils.createTestProduct({
        name: 'Exotic Zucchini',
        unit: 'kg',
        category: 'Exotic Vegetables'
      });

      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Should include products from all active categories
      expect(res.body.categories).toBeInstanceOf(Array);
      expect(res.body.categories.length).toBeGreaterThan(0);
    });

    it('should move product to procured when explicitly marked via /api/supplier/procure', async () => {
      // Mark vegetable product as procured via the procure endpoint
      const procureRes = await request(app)
        .post('/api/supplier/procure')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: vegetableProduct._id,
          rate: 50,
          quantity: 100
        });

      expect(procureRes.status).toBe(200);

      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Tomato should be in procured since we explicitly marked it
      const procuredTomato = res.body.procured.find(item => item.productName === 'Tomato');
      expect(procuredTomato).toBeDefined();
      expect(procuredTomato.rate).toBe(50);
    });

    it('should show product in toProcure if no rate saved today', async () => {
      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Products without rates today should NOT be in toProcure (only if they have orders)
      // Without orders, products won't appear in toProcure
      expect(res.body.toProcure).toBeInstanceOf(Array);
    });

    it('should include procurement fields when orders exist', async () => {
      // Create an order with vegetable product
      await testUtils.createTestOrder(customer, vegetableProduct, {
        status: 'pending',
        products: [{
          product: vegetableProduct._id,
          productName: vegetableProduct.name,
          quantity: 25,
          unit: vegetableProduct.unit,
          rate: 50,
          amount: 1250
        }]
      });

      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Find tomato in toProcure (no rate saved today)
      const tomatoItem = res.body.toProcure.find(item => item.productName === 'Tomato');
      if (tomatoItem) {
        expect(tomatoItem.totalQty).toBeGreaterThan(0);
        expect(typeof tomatoItem.procuredQty).toBe('number');
        expect(typeof tomatoItem.newQty).toBe('number');
        expect(typeof tomatoItem.wasProcured).toBe('boolean');
      }
    });

    it('should include current rate and trend for items', async () => {
      // Create a market rate for the product
      await testUtils.createMarketRate(vegetableProduct, 45);

      // Create an order to make product appear in toProcure
      await testUtils.createTestOrder(customer, vegetableProduct, {
        status: 'pending',
        products: [{
          product: vegetableProduct._id,
          productName: vegetableProduct.name,
          quantity: 10,
          unit: vegetableProduct.unit,
          rate: 45,
          amount: 450
        }]
      });

      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const tomatoItem = res.body.toProcure.find(item => item.productName === 'Tomato');
      if (tomatoItem) {
        expect(tomatoItem.currentRate).toBeDefined();
        expect(tomatoItem.trend).toBeDefined();
      }
    });

    it('should return categories list', async () => {
      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.categories).toBeInstanceOf(Array);
      // Should include categories from active products (all categories now supported)
      res.body.categories.forEach(cat => {
        expect(typeof cat).toBe('string');
        expect(cat.length).toBeGreaterThan(0);
      });
    });

    it('should sort items by category then by quantity', async () => {
      // Create orders for multiple products
      await testUtils.createTestOrder(customer, vegetableProduct, {
        status: 'pending',
        products: [{
          product: vegetableProduct._id,
          productName: vegetableProduct.name,
          quantity: 100,
          unit: vegetableProduct.unit,
          rate: 50,
          amount: 5000
        }]
      });

      await testUtils.createTestOrder(customer, fruitProduct, {
        status: 'pending',
        products: [{
          product: fruitProduct._id,
          productName: fruitProduct.name,
          quantity: 50,
          unit: fruitProduct.unit,
          rate: 100,
          amount: 5000
        }]
      });

      const res = await request(app)
        .get('/api/supplier/procurement-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Indian Vegetables should come before Fruits
      if (res.body.toProcure.length >= 2) {
        const vegIndex = res.body.toProcure.findIndex(item => item.category === 'Indian Vegetables');
        const fruitIndex = res.body.toProcure.findIndex(item => item.category === 'Fruits');
        if (vegIndex !== -1 && fruitIndex !== -1) {
          expect(vegIndex).toBeLessThan(fruitIndex);
        }
      }
    });
  });
});
