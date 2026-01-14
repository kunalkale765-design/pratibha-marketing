import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Customer Management page object
 * Path: /customer-management.html
 */
export class CustomerManagementPage extends BasePage {
  // Search
  readonly searchInput: Locator;

  // Customer list
  readonly customersList: Locator;
  readonly customerCards: Locator;

  // Create button
  readonly createCustomerButton: Locator;

  // Customer modal
  readonly customerModal: Locator;
  readonly customerNameInput: Locator;
  readonly customerPhoneInput: Locator;
  readonly customerWhatsappInput: Locator;
  readonly customerAddressInput: Locator;
  readonly pricingTypeSelect: Locator;
  readonly markupPercentageInput: Locator;
  readonly contractPricesSection: Locator;
  readonly saveCustomerButton: Locator;

  // Customer card actions
  readonly editButtons: Locator;
  readonly deleteButtons: Locator;
  readonly magicLinkButtons: Locator;

  constructor(page: Page) {
    super(page);

    // Search
    this.searchInput = page.locator('.search-input, input[placeholder*="Search"]');

    // Customer list
    this.customersList = page.locator('.customers-list, .customer-list');
    this.customerCards = page.locator('.customer-card');

    // Create button
    this.createCustomerButton = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("Create"), .fab-btn');

    // Customer modal
    this.customerModal = page.locator('.modal-overlay.show .modal-content');
    this.customerNameInput = page.locator('#customerName, [name="name"]');
    this.customerPhoneInput = page.locator('#customerPhone, [name="phone"]');
    this.customerWhatsappInput = page.locator('#customerWhatsapp, [name="whatsapp"]');
    this.customerAddressInput = page.locator('#customerAddress, [name="address"]');
    this.pricingTypeSelect = page.locator('#pricingType, [name="pricingType"]');
    this.markupPercentageInput = page.locator('#markupPercentage, [name="markupPercentage"]');
    this.contractPricesSection = page.locator('.contract-list, .contract-prices');
    this.saveCustomerButton = page.locator('.modal-overlay.show button:has-text("Save"), .modal-overlay.show button:has-text("Create")');

    // Customer card actions
    this.editButtons = page.locator('.btn-action:has-text("Edit"), .btn-edit');
    this.deleteButtons = page.locator('.btn-action:has-text("Delete"), .btn-delete, .btn-action.danger');
    this.magicLinkButtons = page.locator('.btn-action:has-text("Magic"), .btn-link');
  }

  /**
   * Navigate to customer management page
   */
  async goto() {
    await this.page.goto('/customer-management.html');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search customers
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
   * Get customer count
   */
  async getCustomerCount(): Promise<number> {
    return this.customerCards.count();
  }

  /**
   * Open create customer modal
   */
  async openCreateModal() {
    await this.createCustomerButton.click();
    await this.waitForModal();
  }

  /**
   * Fill customer form
   */
  async fillCustomerForm(data: {
    name: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    pricingType?: 'market' | 'markup' | 'contract';
    markupPercentage?: number;
  }) {
    await this.customerNameInput.fill(data.name);

    if (data.phone) {
      await this.customerPhoneInput.fill(data.phone);
    }

    if (data.whatsapp) {
      await this.customerWhatsappInput.fill(data.whatsapp);
    }

    if (data.address) {
      await this.customerAddressInput.fill(data.address);
    }

    if (data.pricingType) {
      await this.pricingTypeSelect.selectOption(data.pricingType);

      if (data.pricingType === 'markup' && data.markupPercentage !== undefined) {
        await this.markupPercentageInput.fill(String(data.markupPercentage));
      }
    }
  }

  /**
   * Save customer
   */
  async saveCustomer() {
    await this.saveCustomerButton.click();
  }

  /**
   * Create a new customer
   */
  async createCustomer(data: {
    name: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
    pricingType?: 'market' | 'markup' | 'contract';
    markupPercentage?: number;
  }) {
    await this.openCreateModal();
    await this.fillCustomerForm(data);
    await this.saveCustomer();
    await this.expectSuccessToast();
  }

  /**
   * Edit customer at index
   */
  async editCustomer(index: number) {
    await this.editButtons.nth(index).click();
    await this.waitForModal();
  }

  /**
   * Delete customer at index
   */
  async deleteCustomer(index: number) {
    this.page.once('dialog', dialog => dialog.accept());
    await this.deleteButtons.nth(index).click();
    await this.expectSuccessToast();
  }

  /**
   * Generate magic link for customer at index
   */
  async generateMagicLink(index: number) {
    await this.magicLinkButtons.nth(index).click();
    await this.expectSuccessToast();
  }

  /**
   * Assert customer list is visible
   */
  async expectCustomersListVisible() {
    await expect(this.customersList).toBeVisible();
  }

  /**
   * Assert pricing type shows correct fields
   */
  async expectPricingTypeFields(type: 'market' | 'markup' | 'contract') {
    await this.pricingTypeSelect.selectOption(type);

    if (type === 'markup') {
      await expect(this.markupPercentageInput).toBeVisible();
    } else {
      await expect(this.markupPercentageInput).not.toBeVisible();
    }

    if (type === 'contract') {
      await expect(this.contractPricesSection).toBeVisible();
    }
  }

  /**
   * Get customer card data
   */
  async getCustomerCardData(index: number): Promise<{ name: string; phone: string }> {
    const card = this.customerCards.nth(index);
    const name = (await card.locator('.customer-name').textContent()) || '';
    const phone = (await card.locator('.customer-phone, .customer-details').textContent()) || '';
    return { name, phone };
  }

  /**
   * Assert customer card contains text
   */
  async expectCustomerCardContains(index: number, text: string) {
    await expect(this.customerCards.nth(index)).toContainText(text);
  }
}
