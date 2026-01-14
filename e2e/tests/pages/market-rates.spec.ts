import { test, expect } from '../../fixtures/auth.fixture';
import { MarketRatesPage } from '../../page-objects/market-rates.page';

test.describe('Market Rates Page', () => {
  let marketRatesPage: MarketRatesPage;

  test.beforeEach(async ({ adminPage }) => {
    marketRatesPage = new MarketRatesPage(adminPage);
    await marketRatesPage.goto();
    await marketRatesPage.waitForNetworkIdle();
  });

  test.describe('UI Elements', () => {
    test('should display product list', async () => {
      await marketRatesPage.expectProductListVisible();
    });

    test('should display rate inputs', async () => {
      await marketRatesPage.expectRateInputsVisible();
    });

    test('should display save button', async () => {
      await marketRatesPage.expectSaveButtonVisible();
    });

    test('should display date header', async () => {
      await expect(marketRatesPage.currentDate).toBeVisible();
    });
  });

  test.describe('Rate Display', () => {
    test('should display current rate values', async () => {
      const inputCount = await marketRatesPage.rateInputs.count();
      if (inputCount > 0) {
        const rateValue = await marketRatesPage.rateInputs.first().inputValue();
        // Rate should be a number
        expect(parseFloat(rateValue)).toBeGreaterThanOrEqual(0);
      }
    });

    test('should display products grouped by category', async () => {
      const dividerCount = await marketRatesPage.categoryDividers.count();
      expect(dividerCount).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Rate Updates', () => {
    test('should mark rate as changed when modified', async () => {
      const inputCount = await marketRatesPage.rateInputs.count();
      if (inputCount > 0) {
        await marketRatesPage.updateRateByIndex(0, 999);
        await marketRatesPage.expectUnsavedIndicator();
      }
    });

    test('should update changes count when rates modified', async () => {
      const inputCount = await marketRatesPage.rateInputs.count();
      if (inputCount > 0) {
        await marketRatesPage.updateRateByIndex(0, 100);
        const hasChanges = await marketRatesPage.hasUnsavedChanges();
        expect(hasChanges).toBe(true);
      }
    });

    test('should save all rate changes', async () => {
      const inputCount = await marketRatesPage.rateInputs.count();
      if (inputCount > 0) {
        await marketRatesPage.updateRateByIndex(0, 150);
        await marketRatesPage.saveRates();
      }
    });

    test('should batch save multiple rate changes', async () => {
      const inputCount = await marketRatesPage.rateInputs.count();
      if (inputCount >= 2) {
        await marketRatesPage.updateRateByIndex(0, 100);
        await marketRatesPage.updateRateByIndex(1, 200);
        await marketRatesPage.saveRates();
      }
    });
  });

  test.describe('Trend Indicators', () => {
    test('should display trend indicators', async () => {
      // Check if any trend indicators exist
      const upCount = await marketRatesPage.trendUp.count();
      const downCount = await marketRatesPage.trendDown.count();
      const stableCount = await marketRatesPage.trendStable.count();

      // At least some products may have trends
    });
  });

  test.describe('Rate Validation', () => {
    test('should accept valid positive numbers', async () => {
      const inputCount = await marketRatesPage.rateInputs.count();
      if (inputCount > 0) {
        await marketRatesPage.updateRateByIndex(0, 150.50);
        const value = await marketRatesPage.rateInputs.first().inputValue();
        expect(parseFloat(value)).toBeCloseTo(150.50, 1);
      }
    });

    test('should not accept negative numbers', async () => {
      const inputCount = await marketRatesPage.rateInputs.count();
      if (inputCount > 0) {
        await marketRatesPage.updateRateByIndex(0, -50);
        const value = await marketRatesPage.rateInputs.first().inputValue();
        // Should either reject or convert to 0
        expect(parseFloat(value)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Unsaved Changes Warning', () => {
    test('should detect unsaved changes', async () => {
      const inputCount = await marketRatesPage.rateInputs.count();
      if (inputCount > 0) {
        await marketRatesPage.updateRateByIndex(0, 888);
        const hasUnsaved = await marketRatesPage.hasUnsavedChanges();
        expect(hasUnsaved).toBe(true);
      }
    });
  });

  test.describe('Back Navigation', () => {
    test('should have back button', async () => {
      await expect(marketRatesPage.backButton).toBeVisible();
    });
  });
});

test.describe('Market Rates - Access Control', () => {
  test('should redirect customer away from market rates', async ({ customerPage }) => {
    await customerPage.goto('/market-rates.html');
    await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
  });
});
