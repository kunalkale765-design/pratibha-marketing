import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Products page object
 * Path: /products.html
 */
export class ProductsPage extends BasePage {
  // Search and filter
  readonly searchInput: Locator;
  readonly manageCategoriesButton: Locator;
  readonly categoryPills: Locator;

  // Product list
  readonly productsList: Locator;
  readonly productItems: Locator;
  readonly categoryHeaders: Locator;

  // Create button
  readonly createProductButton: Locator;

  // Product modal
  readonly productModal: Locator;
  readonly productNameInput: Locator;
  readonly productUnitSelect: Locator;
  readonly productCategoryInput: Locator;
  readonly saveProductButton: Locator;

  // Product item actions
  readonly editButtons: Locator;
  readonly deleteButtons: Locator;

  // Category management modal
  readonly categoryModal: Locator;
  readonly categoryList: Locator;
  readonly addCategoryInput: Locator;
  readonly addCategoryButton: Locator;
  readonly deleteCategoryButtons: Locator;

  constructor(page: Page) {
    super(page);

    // Search and filter
    this.searchInput = page.locator('.search-input, input[placeholder*="Search"]');
    this.manageCategoriesButton = page.locator('button:has-text("Manage"), button:has-text("Categories")');
    this.categoryPills = page.locator('.cat-pill, .category-filter');

    // Product list
    this.productsList = page.locator('.products-list, .product-list');
    this.productItems = page.locator('.product-item, .product-card');
    this.categoryHeaders = page.locator('.category-header, .category-divider');

    // Create button
    this.createProductButton = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("Create"), .fab-btn');

    // Product modal
    this.productModal = page.locator('.modal-overlay.show .modal-content');
    this.productNameInput = page.locator('#productName, [name="name"]');
    this.productUnitSelect = page.locator('#productUnit, [name="unit"]');
    this.productCategoryInput = page.locator('#productCategory, [name="category"]');
    this.saveProductButton = page.locator('.modal-overlay.show button:has-text("Save"), .modal-overlay.show button:has-text("Create")');

    // Product item actions
    this.editButtons = page.locator('.btn-edit, .product-item button:has-text("Edit")');
    this.deleteButtons = page.locator('.btn-delete, .product-item button:has-text("Delete")');

    // Category management modal
    this.categoryModal = page.locator('.category-modal, .modal-overlay.show');
    this.categoryList = page.locator('.category-list');
    this.addCategoryInput = page.locator('.add-category-input, input[placeholder*="category"]');
    this.addCategoryButton = page.locator('.add-category-btn, button:has-text("Add Category")');
    this.deleteCategoryButtons = page.locator('.delete-category-btn');
  }

  /**
   * Navigate to products page
   */
  async goto() {
    await this.page.goto('/products.html');
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
   * Get product count
   */
  async getProductCount(): Promise<number> {
    return this.productItems.count();
  }

  /**
   * Open create product modal
   */
  async openCreateModal() {
    await this.createProductButton.click();
    await this.waitForModal();
  }

  /**
   * Fill product form
   */
  async fillProductForm(data: {
    name: string;
    unit: string;
    category: string;
  }) {
    await this.productNameInput.fill(data.name);
    await this.productUnitSelect.selectOption(data.unit);
    await this.productCategoryInput.fill(data.category);
  }

  /**
   * Save product
   */
  async saveProduct() {
    await this.saveProductButton.click();
  }

  /**
   * Create a new product
   */
  async createProduct(data: {
    name: string;
    unit: string;
    category: string;
  }) {
    await this.openCreateModal();
    await this.fillProductForm(data);
    await this.saveProduct();
    await this.expectSuccessToast();
  }

  /**
   * Edit product at index
   */
  async editProduct(index: number) {
    await this.editButtons.nth(index).click();
    await this.waitForModal();
  }

  /**
   * Delete product at index
   */
  async deleteProduct(index: number) {
    this.page.once('dialog', dialog => dialog.accept());
    await this.deleteButtons.nth(index).click();
    await this.expectSuccessToast();
  }

  /**
   * Open category management modal
   */
  async openCategoryManagement() {
    await this.manageCategoriesButton.click();
    await this.waitForModal();
  }

  /**
   * Add a new category
   */
  async addCategory(name: string) {
    await this.addCategoryInput.fill(name);
    await this.addCategoryButton.click();
  }

  /**
   * Assert products list is visible
   */
  async expectProductsListVisible() {
    await expect(this.productsList).toBeVisible();
  }

  /**
   * Assert products are grouped by category
   */
  async expectCategoryGrouping() {
    const headerCount = await this.categoryHeaders.count();
    expect(headerCount).toBeGreaterThan(0);
  }

  /**
   * Assert category filter is active
   */
  async expectCategoryActive(category: string) {
    const pill = this.categoryPills.filter({ hasText: category });
    await expect(pill).toHaveClass(/active|selected/);
  }

  /**
   * Get unit options from select
   */
  async getUnitOptions(): Promise<string[]> {
    await this.openCreateModal();
    const options = await this.productUnitSelect.locator('option').allTextContents();
    await this.closeModalByEscape();
    return options;
  }

  /**
   * Get product data at index
   */
  async getProductData(index: number): Promise<{ name: string; unit: string; category: string }> {
    const item = this.productItems.nth(index);
    const name = (await item.locator('.product-name').textContent()) || '';
    const unit = (await item.locator('.product-unit').textContent()) || '';
    const category = (await item.locator('.product-category').textContent()) || '';
    return { name, unit, category };
  }
}
