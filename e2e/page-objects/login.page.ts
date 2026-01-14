import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Login page object
 * Path: /login.html
 */
export class LoginPage extends BasePage {
  // Form elements
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly passwordToggle: Locator;
  readonly submitButton: Locator;

  // Messages
  readonly noticeMessage: Locator;

  // Links
  readonly signupLink: Locator;

  // Branding
  readonly brandLogo: Locator;
  readonly brandTagline: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.passwordToggle = page.locator('#passwordToggle');
    this.submitButton = page.locator('#loginBtn');
    this.noticeMessage = page.locator('#noticeMessage');
    this.signupLink = page.locator('a[href*="signup"]');
    this.brandLogo = page.locator('.brand-logo, .logo');
    this.brandTagline = page.locator('.brand-tagline, .tagline');
  }

  /**
   * Navigate to login page
   */
  async goto() {
    await this.page.goto('/login.html');
    await this.page.waitForLoadState('networkidle');
    // Wait for ES module to load and attach event handlers
    // The form should have JS attached that prevents default submission
    await this.page.waitForFunction(() => {
      const form = document.getElementById('loginForm');
      // Check if form has event listeners by checking if there are custom properties
      // or by waiting a bit for modules to load
      return form !== null;
    });
    // Small delay to ensure ES modules have executed
    await this.page.waitForTimeout(500);
  }

  /**
   * Fill login form
   */
  async fillForm(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  /**
   * Submit login form
   */
  async submit() {
    await this.submitButton.click();
  }

  /**
   * Complete login flow
   */
  async login(email: string, password: string) {
    await this.fillForm(email, password);
    await this.submit();
  }

  /**
   * Login and wait for redirect
   */
  async loginAndWaitForRedirect(email: string, password: string, expectedUrl: RegExp) {
    await this.fillForm(email, password);

    // Listen for console messages to debug
    this.page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Wait for navigation after clicking submit
    await Promise.all([
      this.page.waitForURL(expectedUrl, { timeout: 15000 }),
      this.submitButton.click()
    ]);
  }

  /**
   * Toggle password visibility
   */
  async togglePasswordVisibility() {
    await this.passwordToggle.click();
  }

  /**
   * Assert password is visible (type="text")
   */
  async expectPasswordVisible() {
    await expect(this.passwordInput).toHaveAttribute('type', 'text');
  }

  /**
   * Assert password is hidden (type="password")
   */
  async expectPasswordHidden() {
    await expect(this.passwordInput).toHaveAttribute('type', 'password');
  }

  /**
   * Assert notice message is visible with text
   */
  async expectNoticeMessage(text: string | RegExp) {
    await expect(this.noticeMessage).toBeVisible();
    if (typeof text === 'string') {
      await expect(this.noticeMessage).toContainText(text);
    } else {
      await expect(this.noticeMessage).toHaveText(text);
    }
  }

  /**
   * Assert button is in loading state
   */
  async expectButtonLoading() {
    await expect(this.submitButton).toBeDisabled();
  }

  /**
   * Assert all form elements are visible
   */
  async expectFormVisible() {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /**
   * Assert branding is visible
   */
  async expectBrandingVisible() {
    await expect(this.brandLogo).toBeVisible();
  }

  /**
   * Navigate to signup page via link
   */
  async goToSignup() {
    await this.signupLink.click();
    await this.page.waitForURL('**/signup.html');
  }

  /**
   * Check if login failed
   */
  async hasLoginError(): Promise<boolean> {
    try {
      await this.noticeMessage.waitFor({ state: 'visible', timeout: 3000 });
      const text = await this.noticeMessage.textContent();
      return text?.toLowerCase().includes('invalid') || text?.toLowerCase().includes('error') || false;
    } catch {
      return false;
    }
  }
}
