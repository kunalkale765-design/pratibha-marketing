import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Market Rates page object
 * Path: /market-rates.html
 */
export class MarketRatesPage extends BasePage {
  // Header
  readonly pageTitle: Locator;
  readonly backButton: Locator;
  readonly currentDate: Locator;

  // Product list
  readonly productList: Locator;
  readonly productItems: Locator;
  readonly categoryDividers: Locator;

  // Rate inputs
  readonly rateInputs: Locator;

  // Trend indicators
  readonly trendUp: Locator;
  readonly trendDown: Locator;
  readonly trendStable: Locator;

  // Bottom bar
  readonly bottomBar: Locator;
  readonly changesCount: Locator;
  readonly saveButton: Locator;

  // Unsaved indicator
  readonly unsavedIndicator: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.pageTitle = page.locator('.page-title, h1');
    this.backButton = page.locator('.back-btn, a:has-text("Back")');
    this.currentDate = page.locator('.date-display, .current-date');

    // Product list
    this.productList = page.locator('.product-list, .rates-list');
    this.productItems = page.locator('.product-item, .rate-item');
    this.categoryDividers = page.locator('.category-divider, .category-header');

    // Rate inputs
    this.rateInputs = page.locator('.rate-input, input[type="number"]');

    // Trend indicators
    this.trendUp = page.locator('.trend-up, .trend-indicator.up');
    this.trendDown = page.locator('.trend-down, .trend-indicator.down');
    this.trendStable = page.locator('.trend-stable, .trend-indicator.stable');

    // Bottom bar
    this.bottomBar = page.locator('.bottom-bar, .save-bar');
    this.changesCount = page.locator('.changes-count, .unsaved-count');
    this.saveButton = page.locator('button:has-text("Save"), .btn-save');

    // Unsaved indicator
    this.unsavedIndicator = page.locator('.unsaved, .has-changes, .changed');
  }

  /**
   * Navigate to market rates page
   */
  async goto() {
    await this.page.goto('/market-rates.html');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get rate input for a product by name
   */
  getRateInputByProduct(productName: string): Locator {
    return this.productItems
      .filter({ hasText: productName })
      .locator('.rate-input, input[type="number"]');
  }

  /**
   * Update rate for a product by name
   */
  async updateRate(productName: string, rate: number) {
    const input = this.getRateInputByProduct(productName);
    await input.fill(String(rate));
    await input.blur();
  }

  /**
   * Update rate by index
   */
  async updateRateByIndex(index: number, rate: number) {
    const input = this.rateInputs.nth(index);
    await input.fill(String(rate));
    await input.blur();
  }

  /**
   * Get current rate for a product
   */
  async getCurrentRate(productName: string): Promise<number> {
    const input = this.getRateInputByProduct(productName);
    const value = await input.inputValue();
    return parseFloat(value) || 0;
  }

  /**
   * Save all rate changes
   */
  async saveRates() {
    await this.saveButton.click();
    await this.expectSuccessToast();
  }

  /**
   * Get count of unsaved changes
   */
  async getChangesCount(): Promise<number> {
    const text = await this.changesCount.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Check if there are unsaved changes
   */
  async hasUnsavedChanges(): Promise<boolean> {
    try {
      await this.unsavedIndicator.first().waitFor({ state: 'visible', timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Assert product list is visible
   */
  async expectProductListVisible() {
    await expect(this.productList).toBeVisible();
  }

  /**
   * Assert rate inputs are visible
   */
  async expectRateInputsVisible() {
    const count = await this.rateInputs.count();
    expect(count).toBeGreaterThan(0);
  }

  /**
   * Assert unsaved changes indicator is visible
   */
  async expectUnsavedIndicator() {
    await expect(this.unsavedIndicator.first()).toBeVisible();
  }

  /**
   * Assert save button is visible
   */
  async expectSaveButtonVisible() {
    await expect(this.saveButton).toBeVisible();
  }

  /**
   * Assert trend indicator for a product
   */
  async expectTrendIndicator(productName: string, trend: 'up' | 'down' | 'stable') {
    const item = this.productItems.filter({ hasText: productName });
    const trendClass = {
      up: '.trend-up, .trend-indicator.up',
      down: '.trend-down, .trend-indicator.down',
      stable: '.trend-stable, .trend-indicator.stable'
    }[trend];

    await expect(item.locator(trendClass)).toBeVisible();
  }

  /**
   * Set up beforeunload dialog handling
   */
  setupBeforeUnloadHandler() {
    this.page.on('dialog', async dialog => {
      if (dialog.type() === 'beforeunload') {
        await dialog.dismiss();
      }
    });
  }

  /**
   * Navigate away and check for unsaved changes dialog
   */
  async navigateAwayWithUnsavedChanges(): Promise<boolean> {
    let dialogShown = false;

    this.page.once('dialog', async dialog => {
      if (dialog.type() === 'beforeunload') {
        dialogShown = true;
        await dialog.dismiss();
      }
    });

    await this.page.goto('/orders.html').catch(() => {});
    return dialogShown;
  }

  /**
   * Get product rate data by index
   */
  async getProductRateData(index: number): Promise<{ name: string; rate: number }> {
    const item = this.productItems.nth(index);
    const name = (await item.locator('.product-name').textContent()) || '';
    const rateValue = await this.rateInputs.nth(index).inputValue();
    return { name, rate: parseFloat(rateValue) || 0 };
  }

  /**
   * Batch update multiple rates
   */
  async batchUpdateRates(updates: { productName: string; rate: number }[]) {
    for (const update of updates) {
      await this.updateRate(update.productName, update.rate);
    }
  }
}
