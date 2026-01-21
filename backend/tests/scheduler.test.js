const { testUtils } = require('./setup');
const Product = require('../models/Product');
const MarketRate = require('../models/MarketRate');

// Import the scheduler functions directly for unit testing
const { resetAllMarketRates, startScheduler, stopScheduler, CATEGORIES_TO_RESET } = require('../services/marketRateScheduler');

// Helper to create products in reset category
const RESET_CATEGORY = CATEGORIES_TO_RESET[0]; // 'Indian Vegetables'

describe('Market Rate Scheduler', () => {
  describe('resetAllMarketRates', () => {
    it('should reset all active product rates to 0', async () => {
      // Create products in reset category
      const product1 = await testUtils.createTestProduct({ name: 'Rice', isActive: true, category: RESET_CATEGORY });
      const product2 = await testUtils.createTestProduct({ name: 'Wheat', isActive: true, category: RESET_CATEGORY });

      // Create initial market rates
      await testUtils.createMarketRate(product1, 2500);
      await testUtils.createMarketRate(product2, 1800);

      // Run reset
      const result = await resetAllMarketRates();

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.total).toBe(2);

      // Verify new rates are 0
      const newRates = await MarketRate.find({ rate: 0 }).sort({ effectiveDate: -1 });
      expect(newRates.length).toBe(2);
    });

    it('should preserve previous rate in new record', async () => {
      const product = await testUtils.createTestProduct({ name: 'Sugar', isActive: true, category: RESET_CATEGORY });
      await testUtils.createMarketRate(product, 3500);

      await resetAllMarketRates();

      // Get all rates sorted by creation time (most recent first)
      const rates = await MarketRate.find({ product: product._id })
        .sort({ createdAt: -1 });

      // Should have 2 rates: the reset one (rate=0) and original (rate=3500)
      expect(rates.length).toBe(2);
      const resetRate = rates.find(r => r.rate === 0);
      expect(resetRate).toBeDefined();
      expect(resetRate.previousRate).toBe(3500);
    });

    it('should return success with count 0 when no active products in reset categories', async () => {
      // Create inactive product only in reset category
      await testUtils.createTestProduct({ name: 'Inactive Product', isActive: false, category: RESET_CATEGORY });

      const result = await resetAllMarketRates();

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.message).toBe('No active products in reset categories');
    });

    it('should skip inactive products', async () => {
      await testUtils.createTestProduct({ name: 'Active', isActive: true, category: RESET_CATEGORY });
      await testUtils.createTestProduct({ name: 'Inactive', isActive: false, category: RESET_CATEGORY });

      const result = await resetAllMarketRates();

      expect(result.count).toBe(1);
      expect(result.total).toBe(1);
    });

    it('should set effectiveDate to today midnight', async () => {
      const product = await testUtils.createTestProduct({ name: 'Test', isActive: true, category: RESET_CATEGORY });

      await resetAllMarketRates();

      const latestRate = await MarketRate.findOne({ product: product._id })
        .sort({ effectiveDate: -1 });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      expect(latestRate.effectiveDate.getTime()).toBe(today.getTime());
    });

    it('should set source to Daily Reset', async () => {
      const product = await testUtils.createTestProduct({ name: 'Test', isActive: true, category: RESET_CATEGORY });

      await resetAllMarketRates();

      const latestRate = await MarketRate.findOne({ product: product._id })
        .sort({ effectiveDate: -1 });

      expect(latestRate.source).toBe('Daily Reset');
    });

    it('should set updatedBy to system_scheduler', async () => {
      const product = await testUtils.createTestProduct({ name: 'Test', isActive: true, category: RESET_CATEGORY });

      await resetAllMarketRates();

      const latestRate = await MarketRate.findOne({ product: product._id })
        .sort({ effectiveDate: -1 });

      expect(latestRate.updatedBy).toBe('system_scheduler');
    });

    it('should return duration in result', async () => {
      const product = await testUtils.createTestProduct({ name: 'Test', isActive: true, category: RESET_CATEGORY });

      const result = await resetAllMarketRates();

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle products without existing market rates', async () => {
      // Create product in reset category without any market rate
      const product = await testUtils.createTestProduct({ name: 'NewProduct', isActive: true, category: RESET_CATEGORY });

      const result = await resetAllMarketRates();

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      const latestRate = await MarketRate.findOne({ product: product._id });
      expect(latestRate.rate).toBe(0);
      expect(latestRate.previousRate).toBe(0); // Default when no previous rate
    });

    it('should reset multiple products in sequence', async () => {
      // Create 5 products in reset category
      const products = [];
      for (let i = 0; i < 5; i++) {
        const product = await testUtils.createTestProduct({
          name: `Product${i}`,
          isActive: true,
          category: RESET_CATEGORY
        });
        await testUtils.createMarketRate(product, 1000 + i * 100);
        products.push(product);
      }

      const result = await resetAllMarketRates();

      expect(result.success).toBe(true);
      expect(result.count).toBe(5);
      expect(result.total).toBe(5);

      // Verify all have new reset rates (rate=0)
      for (const product of products) {
        const rates = await MarketRate.find({ product: product._id });
        const hasResetRate = rates.some(r => r.rate === 0);
        expect(hasResetRate).toBe(true);
      }
    });

    it('should include notes in reset record', async () => {
      const product = await testUtils.createTestProduct({ name: 'Test', isActive: true, category: RESET_CATEGORY });

      await resetAllMarketRates();

      const latestRate = await MarketRate.findOne({ product: product._id })
        .sort({ effectiveDate: -1 });

      expect(latestRate.notes).toBe('Automatically reset by system scheduler');
    });

    it('should NOT reset products in other categories', async () => {
      // Create products in non-reset categories
      const fruit = await testUtils.createTestProduct({ name: 'Mango', category: 'Fruits', isActive: true });
      const exotic = await testUtils.createTestProduct({ name: 'Zucchini', category: 'Exotic Vegetables', isActive: true });
      const dairy = await testUtils.createTestProduct({ name: 'Paneer', category: 'Dairy', isActive: true });

      // Set initial rates
      await testUtils.createMarketRate(fruit, 8000);
      await testUtils.createMarketRate(exotic, 12000);
      await testUtils.createMarketRate(dairy, 5000);

      const result = await resetAllMarketRates();

      // No products in reset categories
      expect(result.count).toBe(0);

      // Verify rates are unchanged
      const fruitRate = await MarketRate.findOne({ product: fruit._id });
      const exoticRate = await MarketRate.findOne({ product: exotic._id });
      const dairyRate = await MarketRate.findOne({ product: dairy._id });

      expect(fruitRate.rate).toBe(8000);
      expect(exoticRate.rate).toBe(12000);
      expect(dairyRate.rate).toBe(5000);
    });

    it('should reset Indian Vegetables but leave other categories unchanged', async () => {
      // Create mixed products
      const indianVeg = await testUtils.createTestProduct({ name: 'Potato', category: RESET_CATEGORY, isActive: true });
      const fruit = await testUtils.createTestProduct({ name: 'Apple', category: 'Fruits', isActive: true });

      await testUtils.createMarketRate(indianVeg, 3000);
      await testUtils.createMarketRate(fruit, 10000);

      const result = await resetAllMarketRates();

      expect(result.count).toBe(1); // Only Indian Vegetable

      // Indian Vegetable should be reset to 0
      const indianVegRates = await MarketRate.find({ product: indianVeg._id }).sort({ createdAt: -1 });
      expect(indianVegRates[0].rate).toBe(0);
      expect(indianVegRates[0].previousRate).toBe(3000);

      // Fruit should remain unchanged
      const fruitRates = await MarketRate.find({ product: fruit._id });
      expect(fruitRates.length).toBe(1);
      expect(fruitRates[0].rate).toBe(10000);
    });
  });

  describe('startScheduler', () => {
    it('should skip scheduler in test mode', () => {
      // This test verifies the scheduler doesn't actually start in test mode
      // The function checks NODE_ENV === 'test' and returns early
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      // Should not throw and should return undefined
      const result = startScheduler();
      expect(result).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('stopScheduler', () => {
    it('should not throw when no scheduler is running', () => {
      // stopScheduler should handle the case where no task exists
      expect(() => stopScheduler()).not.toThrow();
    });
  });
});
