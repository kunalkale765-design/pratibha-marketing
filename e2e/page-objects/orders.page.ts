import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Orders page object
 * Path: /orders.html
 */
export class OrdersPage extends BasePage {
  // Header
  readonly pageTitle: Locator;
  readonly backButton: Locator;

  // Filters
  readonly filterTabs: Locator;
  readonly allTab: Locator;
  readonly pendingTab: Locator;
  readonly confirmedTab: Locator;
  readonly processingTab: Locator;
  readonly packedTab: Locator;
  readonly shippedTab: Locator;
  readonly deliveredTab: Locator;

  // Search
  readonly searchInput: Locator;

  // Orders list
  readonly ordersList: Locator;
  readonly orderCards: Locator;
  readonly swipeItems: Locator;
  readonly emptyState: Locator;

  // Order detail modal
  readonly orderDetailModal: Locator;
  readonly orderNumber: Locator;
  readonly orderCustomerName: Locator;
  readonly orderDate: Locator;
  readonly orderStatus: Locator;
  readonly orderPaymentStatus: Locator;
  readonly orderProducts: Locator;
  readonly orderTotalAmount: Locator;
  readonly orderPaidAmount: Locator;

  // Order actions
  readonly statusUpdateDropdown: Locator;
  readonly paymentUpdateSection: Locator;
  readonly paymentAmountInput: Locator;
  readonly updatePaymentButton: Locator;

  // Swipe actions
  readonly swipeActions: Locator;
  readonly confirmAction: Locator;
  readonly printAction: Locator;

  constructor(page: Page) {
    super(page);

    // Header
    this.pageTitle = page.locator('.page-title, h1');
    this.backButton = page.locator('.back-btn, a:has-text("Back")');

    // Filters
    this.filterTabs = page.locator('.segment-btn, .filter-tab, .status-tab');
    this.allTab = page.locator('.segment-btn:has-text("All"), .filter-tab:has-text("All")');
    this.pendingTab = page.locator('.segment-btn:has-text("Pending"), .filter-tab:has-text("Pending")');
    this.confirmedTab = page.locator('.segment-btn:has-text("Confirmed"), .filter-tab:has-text("Confirmed")');
    this.processingTab = page.locator('.segment-btn:has-text("Processing"), .filter-tab:has-text("Processing")');
    this.packedTab = page.locator('.segment-btn:has-text("Packed"), .filter-tab:has-text("Packed")');
    this.shippedTab = page.locator('.segment-btn:has-text("Shipped"), .filter-tab:has-text("Shipped")');
    this.deliveredTab = page.locator('.segment-btn:has-text("Delivered"), .filter-tab:has-text("Delivered")');

    // Search
    this.searchInput = page.locator('.search-input, input[placeholder*="Search"]');

    // Orders list
    this.ordersList = page.locator('.orders-list, .order-list');
    this.orderCards = page.locator('.order-card, .swipe-content');
    this.swipeItems = page.locator('.swipe-item');
    this.emptyState = page.locator('.empty-state, .no-orders');

    // Order detail modal
    this.orderDetailModal = page.locator('.modal-overlay.show .modal-content');
    this.orderNumber = page.locator('.order-number, .info-value');
    this.orderCustomerName = page.locator('.customer-name, .order-customer');
    this.orderDate = page.locator('.order-date');
    this.orderStatus = page.locator('.order-status, .status-badge');
    this.orderPaymentStatus = page.locator('.payment-status, .payment-badge');
    this.orderProducts = page.locator('.product-item, .order-item');
    this.orderTotalAmount = page.locator('.total-amount, .order-total');
    this.orderPaidAmount = page.locator('.paid-amount');

    // Order actions
    this.statusUpdateDropdown = page.locator('.status-dropdown, select[name="status"]');
    this.paymentUpdateSection = page.locator('.payment-section, .payment-update');
    this.paymentAmountInput = page.locator('.payment-input, input[name="paymentAmount"]');
    this.updatePaymentButton = page.locator('button:has-text("Update Payment"), .btn-payment');

    // Swipe actions
    this.swipeActions = page.locator('.swipe-actions');
    this.confirmAction = page.locator('.swipe-action:has-text("Confirm"), .action-confirm');
    this.printAction = page.locator('.swipe-action:has-text("Print"), .action-print');
  }

  /**
   * Navigate to orders page
   */
  async goto() {
    await this.page.goto('/orders.html');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Filter by status
   */
  async filterByStatus(status: 'all' | 'pending' | 'confirmed' | 'processing' | 'packed' | 'shipped' | 'delivered') {
    const tabMap = {
      all: this.allTab,
      pending: this.pendingTab,
      confirmed: this.confirmedTab,
      processing: this.processingTab,
      packed: this.packedTab,
      shipped: this.shippedTab,
      delivered: this.deliveredTab
    };

    await tabMap[status].click();
    await this.page.waitForResponse('**/api/orders*');
  }

  /**
   * Search orders
   */
  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(300); // Debounce
  }

  /**
   * Clear search
   */
  async clearSearch() {
    await this.searchInput.fill('');
    await this.page.waitForTimeout(300);
  }

  /**
   * Get order count
   */
  async getOrderCount(): Promise<number> {
    return this.orderCards.count();
  }

  /**
   * Click on an order to open detail modal
   */
  async openOrderDetail(index: number = 0) {
    await this.orderCards.nth(index).click();
    await this.waitForModal();
  }

  /**
   * Swipe left on an order to reveal actions
   */
  async swipeLeftOnOrder(index: number = 0) {
    const swipeItem = this.swipeItems.nth(index);
    const box = await swipeItem.boundingBox();

    if (box) {
      await this.page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
      await this.page.mouse.down();
      await this.page.mouse.move(box.x + 50, box.y + box.height / 2, { steps: 10 });
      await this.page.mouse.up();
    }
  }

  /**
   * Update order status from modal
   */
  async updateOrderStatus(status: string) {
    await this.statusUpdateDropdown.selectOption(status);
    await this.expectSuccessToast();
  }

  /**
   * Update payment amount from modal
   */
  async updatePayment(amount: number) {
    await this.paymentAmountInput.fill(String(amount));
    await this.updatePaymentButton.click();
    await this.expectSuccessToast();
  }

  /**
   * Assert order list is visible
   */
  async expectOrdersListVisible() {
    await expect(this.ordersList).toBeVisible();
  }

  /**
   * Assert empty state is shown
   */
  async expectEmptyState() {
    await expect(this.emptyState).toBeVisible();
  }

  /**
   * Assert filter tab is active
   */
  async expectFilterActive(status: string) {
    const tab = this.filterTabs.filter({ hasText: new RegExp(status, 'i') }).first();
    await expect(tab).toHaveClass(/active|selected/);
  }

  /**
   * Assert order modal shows correct data
   */
  async expectOrderModalData(data: {
    orderNumber?: string;
    customerName?: string;
    status?: string;
  }) {
    if (data.orderNumber) {
      await expect(this.orderDetailModal.locator('.order-number, .info-value').first()).toContainText(data.orderNumber);
    }
    if (data.customerName) {
      await expect(this.orderDetailModal).toContainText(data.customerName);
    }
    if (data.status) {
      await expect(this.orderDetailModal).toContainText(new RegExp(data.status, 'i'));
    }
  }

  /**
   * Assert swipe actions are visible
   */
  async expectSwipeActionsVisible() {
    await expect(this.swipeActions.first()).toBeVisible();
  }

  /**
   * Get order card data
   */
  async getOrderCardData(index: number): Promise<{ customer: string; amount: string }> {
    const card = this.orderCards.nth(index);
    const customer = (await card.locator('.order-customer').textContent()) || '';
    const amount = (await card.locator('.order-amount-pill').textContent()) || '';
    return { customer, amount };
  }
}
