const invoiceService = require('../services/invoiceService');
const { testUtils } = require('./setup');

describe('Invoice Service', () => {
  describe('splitOrderByFirm', () => {
    it('should split order items by category', () => {
      const mockOrder = {
        products: [
          { productName: 'Tomato', category: 'Vegetables', quantity: 10, unit: 'kg', rate: 100, amount: 1000 },
          { productName: 'Apple', category: 'Fruits', quantity: 5, unit: 'kg', rate: 150, amount: 750 },
          { productName: 'Potato', category: 'Vegetables', quantity: 8, unit: 'kg', rate: 50, amount: 400 }
        ]
      };

      const result = invoiceService.splitOrderByFirm(mockOrder);

      expect(Object.keys(result).length).toBeGreaterThanOrEqual(1);

      // Verify items are properly distributed
      const allItems = Object.values(result).flatMap(f => f.items);
      expect(allItems.length).toBe(3);
    });

    it('should calculate correct subtotals per firm', () => {
      const mockOrder = {
        products: [
          { productName: 'Tomato', category: 'Vegetables', quantity: 10, unit: 'kg', rate: 100, amount: 1000 },
          { productName: 'Potato', category: 'Vegetables', quantity: 5, unit: 'kg', rate: 50, amount: 250 }
        ]
      };

      const result = invoiceService.splitOrderByFirm(mockOrder);

      // Total should be 1250
      const totalSubtotal = Object.values(result).reduce((sum, f) => sum + f.subtotal, 0);
      expect(totalSubtotal).toBe(1250);
    });

    it('should handle products without category', () => {
      const mockOrder = {
        products: [
          { productName: 'Unknown Item', quantity: 10, unit: 'kg', rate: 100, amount: 1000 }
          // No category
        ]
      };

      // Should not throw
      expect(() => {
        invoiceService.splitOrderByFirm(mockOrder);
      }).not.toThrow();
    });

    it('should remove empty firm entries', () => {
      const mockOrder = {
        products: [
          { productName: 'Tomato', category: 'Vegetables', quantity: 10, unit: 'kg', rate: 100, amount: 1000 }
        ]
      };

      const result = invoiceService.splitOrderByFirm(mockOrder);

      // Should not have empty firm entries
      Object.values(result).forEach(firm => {
        expect(firm.items.length).toBeGreaterThan(0);
      });
    });

    it('should include firm details in result', () => {
      const mockOrder = {
        products: [
          { productName: 'Tomato', category: 'Vegetables', quantity: 10, unit: 'kg', rate: 100, amount: 1000 }
        ]
      };

      const result = invoiceService.splitOrderByFirm(mockOrder);

      Object.values(result).forEach(firmData => {
        expect(firmData.firm).toBeDefined();
        expect(firmData.firm.name).toBeDefined();
        expect(firmData.firm.id).toBeDefined();
      });
    });
  });

  describe('getInvoiceData', () => {
    it('should format invoice data correctly', () => {
      const mockOrder = {
        orderNumber: 'ORD001',
        createdAt: new Date(),
        customer: {
          name: 'Test Customer',
          phone: '1234567890',
          address: '123 Test St'
        },
        deliveryAddress: '456 Delivery St',
        products: [
          { product: 'prod1', productName: 'Tomato', quantity: 10, unit: 'kg', rate: 100, amount: 1000 }
        ]
      };

      const result = invoiceService.getInvoiceData(mockOrder, 'pratibha-marketing');

      expect(result.orderNumber).toBe('ORD001');
      expect(result.invoiceNumber).toBe('INV001'); // Derived from order number
      expect(result.customer.name).toBe('Test Customer');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1000);
    });

    it('should use custom invoice number when provided', () => {
      const mockOrder = {
        orderNumber: 'ORD001',
        createdAt: new Date(),
        products: [
          { product: 'prod1', productName: 'Tomato', quantity: 10, unit: 'kg', rate: 100, amount: 1000 }
        ]
      };

      const result = invoiceService.getInvoiceData(mockOrder, 'pratibha-marketing', null, 'CUSTOM123');

      expect(result.invoiceNumber).toBe('CUSTOM123');
    });

    it('should filter products by productIds when provided', () => {
      const mockOrder = {
        orderNumber: 'ORD001',
        createdAt: new Date(),
        products: [
          { product: 'prod1', productName: 'Tomato', quantity: 10, unit: 'kg', rate: 100, amount: 1000 },
          { product: 'prod2', productName: 'Onion', quantity: 5, unit: 'kg', rate: 50, amount: 250 },
          { product: 'prod3', productName: 'Potato', quantity: 8, unit: 'kg', rate: 60, amount: 480 }
        ]
      };

      const result = invoiceService.getInvoiceData(mockOrder, 'pratibha-marketing', ['prod1', 'prod3']);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(1480); // 1000 + 480
    });

    it('should throw error for invalid firm ID', () => {
      const mockOrder = {
        orderNumber: 'ORD001',
        createdAt: new Date(),
        products: []
      };

      expect(() => {
        invoiceService.getInvoiceData(mockOrder, 'invalid-firm-id');
      }).toThrow('Firm not found');
    });

    it('should use delivery address over customer address', () => {
      const mockOrder = {
        orderNumber: 'ORD001',
        createdAt: new Date(),
        customer: {
          name: 'Test Customer',
          address: 'Customer Address'
        },
        deliveryAddress: 'Delivery Address',
        products: []
      };

      const result = invoiceService.getInvoiceData(mockOrder, 'pratibha-marketing');

      expect(result.customer.address).toBe('Delivery Address');
    });

    it('should handle missing customer', () => {
      const mockOrder = {
        orderNumber: 'ORD001',
        createdAt: new Date(),
        products: []
      };

      const result = invoiceService.getInvoiceData(mockOrder, 'pratibha-marketing');

      expect(result.customer.name).toBe('Unknown Customer');
    });

    it('should add serial numbers to items', () => {
      const mockOrder = {
        orderNumber: 'ORD001',
        createdAt: new Date(),
        products: [
          { product: 'prod1', productName: 'Tomato', quantity: 10, unit: 'kg', rate: 100, amount: 1000 },
          { product: 'prod2', productName: 'Onion', quantity: 5, unit: 'kg', rate: 50, amount: 250 }
        ]
      };

      const result = invoiceService.getInvoiceData(mockOrder, 'pratibha-marketing');

      expect(result.items[0].sno).toBe(1);
      expect(result.items[1].sno).toBe(2);
    });
  });

  describe('generateInvoicePDF', () => {
    it('should generate valid PDF buffer', async () => {
      const invoiceData = {
        invoiceNumber: 'INV2501001',
        orderNumber: 'ORD001',
        date: new Date(),
        firm: {
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
          { sno: 1, name: 'Tomato', quantity: 10, unit: 'kg', rate: 100, amount: 1000 },
          { sno: 2, name: 'Onion', quantity: 5, unit: 'kg', rate: 50, amount: 250 }
        ],
        total: 1250
      };

      const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      // Check PDF magic number
      expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should handle empty items array', async () => {
      const invoiceData = {
        invoiceNumber: 'INV2501002',
        orderNumber: 'ORD002',
        date: new Date(),
        firm: {
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

      const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should handle missing optional fields', async () => {
      const invoiceData = {
        invoiceNumber: 'INV2501003',
        orderNumber: 'ORD003',
        date: new Date(),
        firm: {
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
          { sno: 1, name: 'Tomato', quantity: 10, unit: 'kg', rate: 100, amount: 1000 }
        ],
        total: 1000
      };

      const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });

    it('should handle large item lists', async () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        sno: i + 1,
        name: `Product ${i + 1}`,
        quantity: 10,
        unit: 'kg',
        rate: 100,
        amount: 1000
      }));

      const invoiceData = {
        invoiceNumber: 'INV2501004',
        orderNumber: 'ORD004',
        date: new Date(),
        firm: {
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
        items: items,
        total: 50000
      };

      const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2025-01-15');
      const result = invoiceService.formatDate(date);

      expect(result).toBe('15/01/2025');
    });

    it('should throw for null date without fallback', () => {
      expect(() => {
        invoiceService.formatDate(null);
      }).toThrow('formatDate: date is required');
    });

    it('should throw for invalid date without fallback', () => {
      expect(() => {
        invoiceService.formatDate('invalid-date');
      }).toThrow('formatDate: invalid date value');
    });

    it('should use current date when allowFallback is true', () => {
      const result = invoiceService.formatDate(null, { allowFallback: true });

      // Should return today's date formatted
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('should handle Date object', () => {
      const date = new Date(2025, 5, 20); // June 20, 2025
      const result = invoiceService.formatDate(date);

      expect(result).toBe('20/06/2025');
    });

    it('should handle ISO string', () => {
      const result = invoiceService.formatDate('2025-03-10T10:00:00.000Z');

      expect(result).toMatch(/10\/03\/2025/);
    });
  });

  describe('formatCurrency', () => {
    it('should format amount correctly', () => {
      const result = invoiceService.formatCurrency(1234.56);

      expect(result).toBe('Rs. 1,234.56');
    });

    it('should format zero correctly', () => {
      const result = invoiceService.formatCurrency(0);

      expect(result).toBe('Rs. 0.00');
    });

    it('should throw for null amount without fallback', () => {
      expect(() => {
        invoiceService.formatCurrency(null);
      }).toThrow('formatCurrency: amount is required');
    });

    it('should throw for undefined amount without fallback', () => {
      expect(() => {
        invoiceService.formatCurrency(undefined);
      }).toThrow('formatCurrency: amount is required');
    });

    it('should throw for NaN amount without fallback', () => {
      expect(() => {
        invoiceService.formatCurrency(NaN);
      }).toThrow('formatCurrency: invalid amount');
    });

    it('should return zero when allowZeroFallback is true for null', () => {
      const result = invoiceService.formatCurrency(null, { allowZeroFallback: true });

      expect(result).toBe('Rs. 0.00');
    });

    it('should format large amounts with Indian number format', () => {
      const result = invoiceService.formatCurrency(1234567.89);

      expect(result).toBe('Rs. 12,34,567.89');
    });

    it('should format decimal amounts', () => {
      const result = invoiceService.formatCurrency(99.99);

      expect(result).toBe('Rs. 99.99');
    });
  });

  describe('generateInvoiceNumber', () => {
    it('should generate invoice number with correct format', async () => {
      const invoiceNumber = await invoiceService.generateInvoiceNumber();

      expect(invoiceNumber).toMatch(/^INV\d{4}\d{4}$/);
    });

    it('should generate sequential invoice numbers', async () => {
      const invoiceNumber1 = await invoiceService.generateInvoiceNumber();
      const invoiceNumber2 = await invoiceService.generateInvoiceNumber();

      // Extract sequence numbers
      const seq1 = parseInt(invoiceNumber1.slice(-4));
      const seq2 = parseInt(invoiceNumber2.slice(-4));

      expect(seq2).toBe(seq1 + 1);
    });

    it('should include current year and month', async () => {
      const invoiceNumber = await invoiceService.generateInvoiceNumber();
      const now = new Date();
      const expectedYear = now.getFullYear().toString().slice(-2);
      const expectedMonth = (now.getMonth() + 1).toString().padStart(2, '0');

      expect(invoiceNumber).toContain(`INV${expectedYear}${expectedMonth}`);
    });
  });
});
