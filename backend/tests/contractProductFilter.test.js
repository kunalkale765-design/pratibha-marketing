/**
 * Contract Product Filtering Tests
 *
 * Tests that contract customers can only order products with contract prices configured.
 * Staff/admin can order any product for any customer.
 */

require('./setup');
const request = require('supertest');
const app = require('../server');

describe('Contract Product Filtering', () => {
  let adminToken;
  let product1, product2, product3;
  let contractCustomer, contractCustomerToken;

  beforeEach(async () => {
    // Create admin user
    const admin = await testUtils.createAdminUser();
    adminToken = admin.token;

    // Create 3 products
    product1 = await testUtils.createTestProduct({ name: 'Contract Product 1', category: 'Category A' });
    product2 = await testUtils.createTestProduct({ name: 'Contract Product 2', category: 'Category A' });
    product3 = await testUtils.createTestProduct({ name: 'Non-Contract Product', category: 'Category B' });

    // Create market rates for all products
    await testUtils.createMarketRate(product1, 100);
    await testUtils.createMarketRate(product2, 200);
    await testUtils.createMarketRate(product3, 300);

    // Create contract customer with prices for only product1 and product2
    const contractPrices = {};
    contractPrices[product1._id.toString()] = 150;
    contractPrices[product2._id.toString()] = 250;

    const customerData = await testUtils.createCustomerUser({
      name: 'Contract Filter Test Customer',
      pricingType: 'contract',
      contractPrices: new Map(Object.entries(contractPrices))
    });

    contractCustomerToken = customerData.token;
    contractCustomer = customerData.customer;
  });

  describe('Order Creation Restrictions', () => {
    it('should allow contract customer to order products with contract prices', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${contractCustomerToken}`])
        .send({
          customer: contractCustomer._id,
          products: [
            { product: product1._id, quantity: 5 },
            { product: product2._id, quantity: 3 }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.products).toHaveLength(2);
    });

    it('should reject contract customer ordering product without contract price', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${contractCustomerToken}`])
        .send({
          customer: contractCustomer._id,
          products: [
            { product: product3._id, quantity: 5 } // No contract price for this product
          ]
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not available|contact/i);
    });

    it('should reject mixed order with some products without contract prices', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${contractCustomerToken}`])
        .send({
          customer: contractCustomer._id,
          products: [
            { product: product1._id, quantity: 5 }, // Has contract price
            { product: product3._id, quantity: 2 }  // No contract price
          ]
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow staff to order any product for contract customer', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: contractCustomer._id,
          products: [
            { product: product3._id, quantity: 5, rate: 350 } // Staff can order non-contracted products
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should allow staff to order mixed products for contract customer', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: contractCustomer._id,
          products: [
            { product: product1._id, quantity: 5 },  // Contracted
            { product: product3._id, quantity: 2, rate: 350 }  // Non-contracted
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products).toHaveLength(2);
    });
  });

  describe('Empty Contract Prices', () => {
    it('should reject order from contract customer with no contract prices configured', async () => {
      // Create contract customer with NO contract prices
      const emptyContractUser = await testUtils.createCustomerUser({
        name: 'Empty Contract Customer',
        pricingType: 'contract',
        contractPrices: new Map()
      });

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${emptyContractUser.token}`])
        .send({
          customer: emptyContractUser.customer._id,
          products: [{ product: product1._id, quantity: 5 }]
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Customer Edit Restrictions', () => {
    it('should allow customer to edit quantities of contracted products', async () => {
      // Create order via admin first
      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: contractCustomer._id,
          products: [{ product: product1._id, quantity: 10, rate: 150 }]
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.data._id;

      // Customer edits to change quantity
      const editRes = await request(app)
        .put(`/api/orders/${orderId}/customer-edit`)
        .set('Cookie', [`token=${contractCustomerToken}`])
        .send({
          products: [{ product: product1._id, quantity: 5 }]
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.data.products[0].quantity).toBe(5);
    });

    it('should allow customer to edit non-contracted products added by staff', async () => {
      // Staff creates order with non-contracted product
      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: contractCustomer._id,
          products: [
            { product: product1._id, quantity: 10, rate: 150 },  // Contracted
            { product: product3._id, quantity: 5, rate: 350 }   // Non-contracted (staff added)
          ]
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.data._id;

      // Customer can edit both products (including non-contracted one already in order)
      const editRes = await request(app)
        .put(`/api/orders/${orderId}/customer-edit`)
        .set('Cookie', [`token=${contractCustomerToken}`])
        .send({
          products: [
            { product: product1._id, quantity: 8 },
            { product: product3._id, quantity: 3 }  // Can edit because it's already in order
          ]
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.data.products).toHaveLength(2);
    });

    it('should reject customer adding new non-contracted product during edit', async () => {
      // Create order with only contracted product
      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${adminToken}`])
        .send({
          customer: contractCustomer._id,
          products: [{ product: product1._id, quantity: 10, rate: 150 }]
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.data._id;

      // Customer tries to add non-contracted product that wasn't in original order
      const editRes = await request(app)
        .put(`/api/orders/${orderId}/customer-edit`)
        .set('Cookie', [`token=${contractCustomerToken}`])
        .send({
          products: [
            { product: product1._id, quantity: 5 },
            { product: product3._id, quantity: 2 } // Not contracted AND not in original order
          ]
        });

      expect(editRes.status).toBe(403);
      expect(editRes.body.success).toBe(false);
    });
  });

  describe('Market and Markup Customers (No Restrictions)', () => {
    it('should allow market customer to order any product', async () => {
      const marketCustomer = await testUtils.createCustomerUser({
        name: 'Market Customer',
        pricingType: 'market'
      });

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${marketCustomer.token}`])
        .send({
          customer: marketCustomer.customer._id,
          products: [
            { product: product1._id, quantity: 5 },
            { product: product2._id, quantity: 3 },
            { product: product3._id, quantity: 2 }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products).toHaveLength(3);
    });

    it('should allow markup customer to order any product', async () => {
      const markupCustomer = await testUtils.createCustomerUser({
        name: 'Markup Customer',
        pricingType: 'markup',
        markupPercentage: 20
      });

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', [`token=${markupCustomer.token}`])
        .send({
          customer: markupCustomer.customer._id,
          products: [
            { product: product1._id, quantity: 5 },
            { product: product2._id, quantity: 3 },
            { product: product3._id, quantity: 2 }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.products).toHaveLength(3);
    });
  });
});
