import { Page, Locator, expect } from '@playwright/test';

/**
 * Base page object with common methods and locators
 * All other page objects inherit from this
 */
export class BasePage {
  readonly page: Page;

  // Common locators
  readonly toast: Locator;
  readonly loadingSpinner: Locator;
  readonly modal: Locator;
  readonly modalOverlay: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.toast = page.locator('#toast');
    this.loadingSpinner = page.locator('.skeleton-loading, .loading');
    this.modal = page.locator('.modal-content');
    this.modalOverlay = page.locator('.modal-overlay');
    this.logoutButton = page.locator('[data-logout], .logout-btn, #logoutBtn');
  }

  /**
   * Wait for toast notification to appear
   */
  async waitForToast(type?: 'success' | 'error' | 'warning' | 'info') {
    await expect(this.toast).toBeVisible({ timeout: 10000 });
    if (type) {
      await expect(this.toast).toHaveClass(new RegExp(`toast-${type}`));
    }
    return this.toast.textContent();
  }

  /**
   * Wait for success toast
   */
  async expectSuccessToast(message?: string) {
    await this.waitForToast('success');
    if (message) {
      await expect(this.toast).toContainText(message);
    }
  }

  /**
   * Wait for error toast
   */
  async expectErrorToast(message?: string) {
    await this.waitForToast('error');
    if (message) {
      await expect(this.toast).toContainText(message);
    }
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete(timeout = 10000) {
    try {
      await this.loadingSpinner.first().waitFor({ state: 'hidden', timeout });
    } catch {
      // Loading might have already completed
    }
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetworkIdle() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get stored user from localStorage
   */
  async getStoredUser() {
    return this.page.evaluate(() => {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    });
  }

  /**
   * Clear localStorage
   */
  async clearLocalStorage() {
    await this.page.evaluate(() => localStorage.clear());
  }

  /**
   * Get CSRF token from cookie
   */
  async getCsrfToken(): Promise<string | null> {
    return this.page.evaluate(() => {
      const match = document.cookie.match(/csrf_token=([^;]+)/);
      return match ? match[1] : null;
    });
  }

  /**
   * Wait for modal to be visible
   */
  async waitForModal() {
    await expect(this.modalOverlay).toHaveClass(/show/);
    await expect(this.modal).toBeVisible();
  }

  /**
   * Close modal by clicking overlay
   */
  async closeModalByOverlay() {
    await this.modalOverlay.click({ position: { x: 10, y: 10 } });
    await expect(this.modalOverlay).not.toHaveClass(/show/);
  }

  /**
   * Close modal by pressing Escape
   */
  async closeModalByEscape() {
    await this.page.keyboard.press('Escape');
    await expect(this.modalOverlay).not.toHaveClass(/show/);
  }

  /**
   * Logout
   */
  async logout() {
    await this.logoutButton.click();
    await this.page.waitForURL('**/login.html');
  }

  /**
   * Check if an element is visible
   */
  async isVisible(locator: Locator): Promise<boolean> {
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Scroll element into view
   */
  async scrollIntoView(locator: Locator) {
    await locator.scrollIntoViewIfNeeded();
  }

  /**
   * Take screenshot
   */
  async screenshot(name: string) {
    await this.page.screenshot({ path: `e2e/reports/screenshots/${name}.png` });
  }
}
