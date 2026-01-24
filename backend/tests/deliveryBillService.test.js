const deliveryBillService = require('../services/deliveryBillService');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Batch = require('../models/Batch');
const MarketRate = require('../models/MarketRate');
const Counter = require('../models/Counter');
const { testUtils } = require('./setup');

describe('Delivery Bill Service', () => {
  let testCustomer;
  let testProduct;
  let testProduct2;
  let testBatch;

  beforeEach(async () => {
    // Create test customer
    testCustomer = await testUtils.createTestCustomer({ name: 'Test Customer' });

    // Create test products with different categories
    testProduct = await testUtils.createCategorizedProduct('Vegetables', { name: 'Tomato' });
    testProduct2 = await testUtils.createCategorizedProduct('Fruits', { name: 'Apple' });

    // Create market rates
    await testUtils.createMarketRate(testProduct, 100);
    await testUtils.createMarketRate(testProduct2, 150);

    // Create test batch
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoffTime = new Date(today);
    cutoffTime.setHours(8, 0, 0, 0);
    testBatch = await Batch.create({
      batchNumber: `B${Date.now()}`,
      batchType: '1st',
      date: today,
      cutoffTime: cutoffTime,
      status: 'confirmed'
    });
  });

  describe('generateBillNumber', () => {
    it('should generate bill number with correct format', async () => {
      const billNumber = await deliveryBillService.generateBillNumber();

      expect(billNumber).toMatch(/^BILL\d{4}\d{4}$/);
    });

    it('should generate sequential bill numbers', async () => {
      const billNumber1 = await deliveryBillService.generateBillNumber();
      const billNumber2 = await deliveryBillService.generateBillNumber();

      // Extract sequence numbers
      const seq1 = parseInt(billNumber1.slice(-4));
      const seq2 = parseInt(billNumber2.slice(-4));

      expect(seq2).toBe(seq1 + 1);
    });

    it('should include current year and month', async () => {
      const billNumber = await deliveryBillService.generateBillNumber();
      const now = new Date();
      const expectedYear = now.getFullYear().toString().slice(-2);
      const expectedMonth = (now.getMonth() + 1).toString().padStart(2, '0');

      expect(billNumber).toContain(`BILL${expectedYear}${expectedMonth}`);
    });
  });

  describe('updateOrderPrices', () => {
    it('should update prices for market pricing customer', async () => {
      const marketCustomer = await testUtils.createTestCustomer({
        name: 'Market Customer',
        pricingType: 'market'
      });

      const order = await Order.create({
        customer: marketCustomer._id,
        batch: testBatch._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: 'kg',
          rate: 80, // Old rate
          amount: 800
        }],
        totalAmount: 800,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      const updatedOrder = await deliveryBillService.updateOrderPrices(order);

      // Should use current market rate (100)
      expect(updatedOrder.products[0].rate).toBe(100);
      expect(updatedOrder.products[0].amount).toBe(1000); // 10 * 100
      expect(updatedOrder.totalAmount).toBe(1000);
    });

    it('should apply markup for markup pricing customer', async () => {
      const markupCustomer = await testUtils.createMarkupCustomer(10); // 10% markup

      const order = await Order.create({
        customer: markupCustomer._id,
        batch: testBatch._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: 'kg',
          rate: 80,
          amount: 800
        }],
        totalAmount: 800,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      const updatedOrder = await deliveryBillService.updateOrderPrices(order);

      // Market rate 100 + 10% markup = 110
      expect(updatedOrder.products[0].rate).toBe(110);
      expect(updatedOrder.products[0].amount).toBe(1100); // 10 * 110
      expect(updatedOrder.totalAmount).toBe(1100);
    });

    it('should not update prices for contract pricing customer', async () => {
      const contractCustomer = await testUtils.createContractCustomer({
        [testProduct._id.toString()]: 90
      });

      const order = await Order.create({
        customer: contractCustomer._id,
        batch: testBatch._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: 'kg',
          rate: 90, // Contract rate
          amount: 900
        }],
        totalAmount: 900,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      const updatedOrder = await deliveryBillService.updateOrderPrices(order);

      // Should keep contract rate
      expect(updatedOrder.products[0].rate).toBe(90);
      expect(updatedOrder.totalAmount).toBe(900);
    });

    it('should throw when customer not found (prevents bills with wrong prices)', async () => {
      // Create order with a customer that will be "deleted" (non-existent ObjectId)
      const mongoose = require('mongoose');
      const deletedCustomerId = new mongoose.Types.ObjectId();
      const order = await Order.create({
        customer: deletedCustomerId,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: 'kg',
          rate: 100,
          amount: 1000
        }],
        totalAmount: 1000,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      // Should throw to prevent generating bills with potentially incorrect prices
      await expect(deliveryBillService.updateOrderPrices(order))
        .rejects.toThrow('customer not found');
    });
  });

  describe('splitOrderByFirm', () => {
    it('should split order items by firm based on category', async () => {
      const order = await Order.create({
        customer: testCustomer._id,
        batch: testBatch._id,
        products: [
          {
            product: testProduct._id,
            productName: testProduct.name,
            quantity: 10,
            unit: 'kg',
            rate: 100,
            amount: 1000
          },
          {
            product: testProduct2._id,
            productName: testProduct2.name,
            quantity: 5,
            unit: 'kg',
            rate: 150,
            amount: 750
          }
        ],
        totalAmount: 1750,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      const split = await deliveryBillService.splitOrderByFirm(order);

      expect(Object.keys(split).length).toBeGreaterThanOrEqual(1);

      // Check that items are properly assigned
      const allItems = Object.values(split).flatMap(f => f.items);
      expect(allItems.length).toBe(2);
    });

    it('should calculate subtotals per firm', async () => {
      const order = await Order.create({
        customer: testCustomer._id,
        batch: testBatch._id,
        products: [
          {
            product: testProduct._id,
            productName: testProduct.name,
            quantity: 10,
            unit: 'kg',
            rate: 100,
            amount: 1000
          }
        ],
        totalAmount: 1000,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      const split = await deliveryBillService.splitOrderByFirm(order);

      // Verify subtotals add up
      const totalSubtotal = Object.values(split).reduce((sum, f) => sum + f.subtotal, 0);
      expect(totalSubtotal).toBe(1000);
    });

    it('should include firm details in split', async () => {
      const order = await Order.create({
        customer: testCustomer._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: 'kg',
          rate: 100,
          amount: 1000
        }],
        totalAmount: 1000,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      const split = await deliveryBillService.splitOrderByFirm(order);

      // Check firm details are included
      const firmData = Object.values(split)[0];
      expect(firmData.firm).toBeDefined();
      expect(firmData.firm.name).toBeDefined();
      expect(firmData.firm.address).toBeDefined();
    });
  });

  describe('generateBillPDF', () => {
    it('should generate valid PDF buffer', async () => {
      const billData = {
        billNumber: 'BILL2501001',
        orderNumber: 'ORD001',
        batchNumber: 'B001',
        date: new Date(),
        firm: {
          id: 'pratibha-marketing',
          name: 'Pratibha Marketing',
          address: '123 Test Street',
          phone: '1234567890',
          email: 'test@test.com'
        },
        customer: {
          name: 'Test Customer',
          phone: '9876543210',
          address: '456 Customer St'
        },
        items: [
          { name: 'Tomato', quantity: 10, unit: 'kg', rate: 100, amount: 1000 },
          { name: 'Onion', quantity: 5, unit: 'kg', rate: 50, amount: 250 }
        ],
        total: 1250
      };

      const pdfBuffer = await deliveryBillService.generateBillPDF(billData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      // Check PDF magic number
      expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should handle empty items array', async () => {
      const billData = {
        billNumber: 'BILL2501002',
        orderNumber: 'ORD002',
        batchNumber: 'B002',
        date: new Date(),
        firm: {
          id: 'pratibha-marketing',
          name: 'Pratibha Marketing',
          address: '123 Test Street',
          phone: '1234567890',
          email: 'test@test.com'
        },
        customer: {
          name: 'Test Customer',
          phone: '9876543210',
          address: '456 Customer St'
        },
        items: [],
        total: 0
      };

      const pdfBuffer = await deliveryBillService.generateBillPDF(billData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should handle missing optional fields', async () => {
      const billData = {
        billNumber: 'BILL2501003',
        orderNumber: 'ORD003',
        batchNumber: 'B003',
        date: new Date(),
        firm: {
          id: 'pratibha-marketing',
          name: 'Pratibha Marketing',
          address: '123 Test Street',
          phone: '1234567890'
          // email missing
        },
        customer: {
          name: 'Test Customer'
          // phone and address missing
        },
        items: [
          { name: 'Tomato', quantity: 10, unit: 'kg', rate: 100, amount: 1000 }
        ],
        total: 1000
      };

      const pdfBuffer = await deliveryBillService.generateBillPDF(billData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });
  });

  describe('generateBillsForBatch', () => {
    it('should generate bills for all confirmed orders in batch', async () => {
      // Create confirmed orders
      await Order.create({
        customer: testCustomer._id,
        batch: testBatch._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: 'kg',
          rate: 100,
          amount: 1000
        }],
        totalAmount: 1000,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      await Order.create({
        customer: testCustomer._id,
        batch: testBatch._id,
        products: [{
          product: testProduct2._id,
          productName: testProduct2.name,
          quantity: 5,
          unit: 'kg',
          rate: 150,
          amount: 750
        }],
        totalAmount: 750,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      const result = await deliveryBillService.generateBillsForBatch(testBatch);

      expect(result.totalOrders).toBe(2);
      expect(result.billsGenerated).toBeGreaterThan(0);
      expect(result.bills).toHaveLength(result.billsGenerated);
    });

    it('should mark orders as having delivery bill generated', async () => {
      const order = await Order.create({
        customer: testCustomer._id,
        batch: testBatch._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: 'kg',
          rate: 100,
          amount: 1000
        }],
        totalAmount: 1000,
        status: 'confirmed',
        paymentStatus: 'unpaid'
      });

      await deliveryBillService.generateBillsForBatch(testBatch);

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.deliveryBillGenerated).toBe(true);
      expect(updatedOrder.deliveryBillGeneratedAt).toBeDefined();
      expect(updatedOrder.deliveryBillNumber).toBeDefined();
    });

    it('should skip non-confirmed orders', async () => {
      // Create pending order (should be skipped)
      await Order.create({
        customer: testCustomer._id,
        batch: testBatch._id,
        products: [{
          product: testProduct._id,
          productName: testProduct.name,
          quantity: 10,
          unit: 'kg',
          rate: 100,
          amount: 1000
        }],
        totalAmount: 1000,
        status: 'pending', // Not confirmed
        paymentStatus: 'unpaid'
      });

      const result = await deliveryBillService.generateBillsForBatch(testBatch);

      expect(result.totalOrders).toBe(0);
      expect(result.billsGenerated).toBe(0);
    });

    it('should return errors for failed bill generation', async () => {
      // The function should capture errors rather than throwing
      const result = await deliveryBillService.generateBillsForBatch(testBatch);

      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('getSafeBillPath', () => {
    it('should reject path traversal attacks', () => {
      expect(() => {
        deliveryBillService.getSafeBillPath('../../../etc/passwd');
      }).toThrow('Invalid bill filename format');
    });

    it('should reject absolute path injection', () => {
      expect(() => {
        deliveryBillService.getSafeBillPath('/etc/passwd');
      }).toThrow('Invalid bill filename format');
    });

    it('should accept valid bill filenames', () => {
      const safePath = deliveryBillService.getSafeBillPath('BILL2501001.pdf');

      expect(safePath).toContain('BILL2501001.pdf');
      expect(safePath).not.toContain('..');
    });

    it('should throw for empty filename', () => {
      expect(() => {
        deliveryBillService.getSafeBillPath('');
      }).toThrow('Bill filename is required');
    });

    it('should throw for null filename', () => {
      expect(() => {
        deliveryBillService.getSafeBillPath(null);
      }).toThrow('Bill filename is required');
    });
  });
});
