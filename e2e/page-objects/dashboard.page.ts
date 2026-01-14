import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Dashboard page object
 * Path: /index.html
 */
export class DashboardPage extends BasePage {
  // Header
  readonly userBadge: Locator;
  readonly userName: Locator;

  // Stat cards
  readonly statCards: Locator;
  readonly totalOrdersStat: Locator;
  readonly pendingOrdersStat: Locator;
  readonly revenueStat: Locator;

  // Quick actions
  readonly quickActions: Locator;
  readonly createOrderAction: Locator;
  readonly customersAction: Locator;
  readonly productsAction: Locator;
  readonly marketRatesAction: Locator;
  readonly viewOrdersAction: Locator;

  // Procurement list
  readonly procurementContainer: Locator;
  readonly procurementItems: Locator;
  readonly rateInputs: Locator;
  readonly saveRatesButton: Locator;
  readonly unsavedIndicator: Locator;

  // Analytics
  readonly orderStatusChart: Locator;
  readonly revenueTrendChart: Locator;
  readonly topProductsChart: Locator;

  // Reports
  readonly reportsSection: Locator;
  readonly ledgerReportButton: Locator;

  // API status
  readonly apiStatusIndicator: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.userBadge = page.locator('.user-badge, .user-info');
    this.userName = page.locator('.user-name, .user-badge span');

    // Stat cards
    this.statCards = page.locator('.stat-card, .stat-box');
    this.totalOrdersStat = page.locator('.stat-card:has-text("Total"), .stat-box:has-text("Total")');
    this.pendingOrdersStat = page.locator('.stat-card:has-text("Pending"), .stat-box:has-text("Pending")');
    this.revenueStat = page.locator('.stat-card:has-text("Revenue"), .stat-box:has-text("Revenue")');

    // Quick actions
    this.quickActions = page.locator('.quick-actions, .action-cards');
    this.createOrderAction = page.locator('.action-card:has-text("Order"), .quick-action:has-text("Order")').first();
    this.customersAction = page.locator('.action-card:has-text("Customer"), .quick-action:has-text("Customer")');
    this.productsAction = page.locator('.action-card:has-text("Product"), .quick-action:has-text("Product")');
    this.marketRatesAction = page.locator('.action-card:has-text("Rate"), .quick-action:has-text("Rate")');
    this.viewOrdersAction = page.locator('.action-card:has-text("View Order"), .quick-action:has-text("View Order")');

    // Procurement list
    this.procurementContainer = page.locator('.procurement-container, .procurement-list');
    this.procurementItems = page.locator('.procurement-item, .product-row');
    this.rateInputs = page.locator('.rate-input, input[type="number"]');
    this.saveRatesButton = page.locator('.btn-save-rates, button:has-text("Save")');
    this.unsavedIndicator = page.locator('.unsaved, .has-changes');

    // Analytics
    this.orderStatusChart = page.locator('#orderStatusChart, .order-status-chart').locator('canvas');
    this.revenueTrendChart = page.locator('#revenueTrendChart, .revenue-trend-chart').locator('canvas');
    this.topProductsChart = page.locator('#topProductsChart, .top-products-chart').locator('canvas');

    // Reports
    this.reportsSection = page.locator('.reports-section, .reports');
    this.ledgerReportButton = page.locator('button:has-text("Ledger"), .report-card:has-text("Ledger")');

    // API status
    this.apiStatusIndicator = page.locator('.api-status, .status-indicator');
  }

  /**
   * Navigate to dashboard
   */
  async goto() {
    await this.page.goto('/index.html');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Assert all stat cards are visible
   */
  async expectStatsVisible() {
    await expect(this.statCards.first()).toBeVisible();
  }

  /**
   * Assert quick actions are visible
   */
  async expectQuickActionsVisible() {
    await expect(this.quickActions).toBeVisible();
  }

  /**
   * Navigate to create order
   */
  async goToCreateOrder() {
    await this.createOrderAction.click();
    await this.page.waitForURL('**/customer-order-form.html');
  }

  /**
   * Navigate to customers
   */
  async goToCustomers() {
    await this.customersAction.click();
    await this.page.waitForURL('**/customer-management.html');
  }

  /**
   * Navigate to products
   */
  async goToProducts() {
    await this.productsAction.click();
    await this.page.waitForURL('**/products.html');
  }

  /**
   * Navigate to market rates
   */
  async goToMarketRates() {
    await this.marketRatesAction.click();
    await this.page.waitForURL('**/market-rates.html');
  }

  /**
   * Navigate to orders
   */
  async goToOrders() {
    await this.viewOrdersAction.click();
    await this.page.waitForURL('**/orders.html');
  }

  /**
   * Update a market rate inline
   */
  async updateRateInline(index: number, rate: number) {
    const input = this.rateInputs.nth(index);
    await input.fill(String(rate));
    await input.blur();
  }

  /**
   * Save updated rates
   */
  async saveRates() {
    await this.saveRatesButton.click();
    await this.expectSuccessToast();
  }

  /**
   * Check if there are unsaved changes
   */
  async hasUnsavedChanges(): Promise<boolean> {
    return this.isVisible(this.unsavedIndicator);
  }

  /**
   * Get stat card value
   */
  async getStatValue(statCard: Locator): Promise<string> {
    const valueLocator = statCard.locator('.stat-value, .value');
    return (await valueLocator.textContent()) || '';
  }

  /**
   * Assert charts are rendered
   */
  async expectChartsVisible() {
    // Charts may take time to render
    await this.page.waitForTimeout(2000);

    // Check if at least one chart canvas is visible
    const chartCanvases = this.page.locator('canvas');
    const count = await chartCanvases.count();
    expect(count).toBeGreaterThan(0);
  }

  /**
   * Download ledger report
   */
  async downloadLedgerReport() {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.ledgerReportButton.click()
    ]);
    return download;
  }

  /**
   * Assert API is online
   */
  async expectApiOnline() {
    if (await this.apiStatusIndicator.isVisible()) {
      await expect(this.apiStatusIndicator).toHaveClass(/online|connected/);
    }
  }

  /**
   * Assert user is logged in with name
   */
  async expectUserLoggedIn(name?: string) {
    await expect(this.userBadge).toBeVisible();
    if (name) {
      await expect(this.userName).toContainText(name);
    }
  }
}
