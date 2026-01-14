import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Customer Order Form page object
 * Path: /customer-order-form.html
 */
export class CustomerOrderFormPage extends BasePage {
  // Customer selector (for staff)
  readonly customerSelector: Locator;
  readonly customerDropdown: Locator;

  // Search
  readonly searchInput: Locator;

  // Category filter
  readonly categoryPills: Locator;

  // Product list
  readonly productList: Locator;
  readonly productItems: Locator;

  // Quantity controls
  readonly plusButtons: Locator;
  readonly minusButtons: Locator;
  readonly quantityInputs: Locator;

  // Order summary
  readonly orderSummary: Locator;
  readonly itemCount: Locator;
  readonly totalQuantity: Locator;
  readonly submitButton: Locator;

  // Price indicators (should NOT be visible to customers)
  readonly priceIndicators: Locator;
  readonly rateIndicators: Locator;
  readonly amountIndicators: Locator;

  constructor(page: Page) {
    super(page);

    // Customer selector (for staff)
    this.customerSelector = page.locator('.customer-bar, .customer-select-section');
    this.customerDropdown = page.locator('#customerSelect, .customer-select, select[name="customer"]');

    // Search
    this.searchInput = page.locator('.search-input, input[placeholder*="Search"]');

    // Category filter
    this.categoryPills = page.locator('.cat-pill, .category-pill');

    // Product list
    this.productList = page.locator('.product-list, .products');
    this.productItems = page.locator('.product-item');

    // Quantity controls
    this.plusButtons = page.locator('.qty-btn:has-text("+"), .btn-plus');
    this.minusButtons = page.locator('.qty-btn:has-text("-"), .btn-minus');
    this.quantityInputs = page.locator('.qty-input, input[type="number"].quantity');

    // Order summary
    this.orderSummary = page.locator('.order-summary, .summary-bar');
    this.itemCount = page.locator('.item-count');
    this.totalQuantity = page.locator('.total-qty');
    this.submitButton = page.locator('button:has-text("Place Order"), button:has-text("Submit"), .btn-submit');

    // Price indicators (should NOT be visible to customers)
    this.priceIndicators = page.locator('.price, .product-price');
    this.rateIndicators = page.locator('.rate, .product-rate');
    this.amountIndicators = page.locator('.amount, .total-amount');
  }

  /**
   * Navigate to customer order form page
   */
  async goto() {
    await this.page.goto('/customer-order-form.html');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search products
   */
  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(300);
  }

  /**
   * Clear search
   */
  async clearSearch() {
    await this.searchInput.fill('');
    await this.page.waitForTimeout(300);
  }

  /**
   * Filter by category
   */
  async filterByCategory(category: string) {
    const pill = this.categoryPills.filter({ hasText: category });
    await pill.click();
  }

  /**
   * Clear category filter
   */
  async clearCategoryFilter() {
    const allPill = this.categoryPills.filter({ hasText: /All/i });
    await allPill.click();
  }

  /**
   * Get product item by name
   */
  getProductByName(productName: string): Locator {
    return this.productItems.filter({ hasText: productName });
  }

  /**
   * Increment quantity for a product by name
   */
  async incrementQuantity(productName: string) {
    const product = this.getProductByName(productName);
    const plusBtn = product.locator('.qty-btn:has-text("+"), .btn-plus');
    await plusBtn.click();
  }

  /**
   * Decrement quantity for a product by name
   */
  async decrementQuantity(productName: string) {
    const product = this.getProductByName(productName);
    const minusBtn = product.locator('.qty-btn:has-text("-"), .btn-minus');
    await minusBtn.click();
  }

  /**
   * Set quantity for a product by name
   */
  async setQuantity(productName: string, quantity: number) {
    const product = this.getProductByName(productName);
    const input = product.locator('.qty-input, input[type="number"]');
    await input.fill(String(quantity));
  }

  /**
   * Get quantity for a product by name
   */
  async getQuantity(productName: string): Promise<number> {
    const product = this.getProductByName(productName);
    const input = product.locator('.qty-input, input[type="number"]');
    const value = await input.inputValue();
    return parseInt(value) || 0;
  }

  /**
   * Increment quantity by index
   */
  async incrementQuantityByIndex(index: number) {
    await this.plusButtons.nth(index).click();
  }

  /**
   * Decrement quantity by index
   */
  async decrementQuantityByIndex(index: number) {
    await this.minusButtons.nth(index).click();
  }

  /**
   * Select customer (staff only)
   */
  async selectCustomer(customerId: string) {
    await this.customerDropdown.selectOption(customerId);
  }

  /**
   * Select customer by index (staff only)
   */
  async selectCustomerByIndex(index: number) {
    await this.customerDropdown.selectOption({ index });
  }

  /**
   * Submit order
   */
  async submitOrder() {
    await this.submitButton.click();
  }

  /**
   * Submit order and wait for success
   */
  async submitOrderAndWaitForSuccess() {
    await this.submitButton.click();
    await this.expectSuccessToast();
  }

  /**
   * Get item count from summary
   */
  async getItemCount(): Promise<number> {
    const text = await this.itemCount.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Assert product list is visible
   */
  async expectProductListVisible() {
    await expect(this.productList).toBeVisible();
  }

  /**
   * Assert customer selector is visible (staff only)
   */
  async expectCustomerSelectorVisible() {
    await expect(this.customerSelector).toBeVisible();
    await expect(this.customerSelector).toHaveClass(/show/);
  }

  /**
   * Assert customer selector is NOT visible (customer role)
   */
  async expectCustomerSelectorHidden() {
    const isVisible = await this.isVisible(this.customerSelector);
    if (isVisible) {
      await expect(this.customerSelector).not.toHaveClass(/show/);
    }
  }

  /**
   * CRITICAL: Assert prices are NOT visible to customers
   */
  async expectPricesHidden() {
    // Prices should never be visible to customers
    await expect(this.priceIndicators).toHaveCount(0);
    await expect(this.rateIndicators).toHaveCount(0);
    // Amount indicators might exist but should be hidden or empty
  }

  /**
   * Assert product has quantity class when quantity > 0
   */
  async expectProductHasQuantity(productName: string) {
    const product = this.getProductByName(productName);
    await expect(product).toHaveClass(/has-qty|selected/);
  }

  /**
   * Assert product does not have quantity class
   */
  async expectProductNoQuantity(productName: string) {
    const product = this.getProductByName(productName);
    await expect(product).not.toHaveClass(/has-qty|selected/);
  }

  /**
   * Assert category filter is active
   */
  async expectCategoryActive(category: string) {
    const pill = this.categoryPills.filter({ hasText: category });
    await expect(pill).toHaveClass(/active|selected/);
  }

  /**
   * Assert submit button is visible
   */
  async expectSubmitButtonVisible() {
    await expect(this.submitButton).toBeVisible();
  }

  /**
   * Assert order summary is visible
   */
  async expectOrderSummaryVisible() {
    await expect(this.orderSummary).toBeVisible();
  }

  /**
   * Get visible products count
   */
  async getVisibleProductCount(): Promise<number> {
    return this.productItems.count();
  }

  /**
   * Add multiple products to order
   */
  async addProductsToOrder(products: { name: string; quantity: number }[]) {
    for (const product of products) {
      await this.setQuantity(product.name, product.quantity);
    }
  }

  /**
   * Clear all quantities
   */
  async clearAllQuantities() {
    const count = await this.quantityInputs.count();
    for (let i = 0; i < count; i++) {
      await this.quantityInputs.nth(i).fill('0');
    }
  }
}
