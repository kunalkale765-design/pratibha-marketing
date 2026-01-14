import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Signup page object
 * Path: /signup.html
 */
export class SignupPage extends BasePage {
  // Form elements
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;

  // Password requirements
  readonly passwordRequirements: Locator;
  readonly lengthRequirement: Locator;
  readonly uppercaseRequirement: Locator;
  readonly numberRequirement: Locator;

  // Messages
  readonly noticeMessage: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;

  // Links
  readonly loginLink: Locator;
  readonly backLink: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.locator('#name');
    this.emailInput = page.locator('#email');
    this.phoneInput = page.locator('#phone');
    this.passwordInput = page.locator('#password');
    this.confirmPasswordInput = page.locator('#confirmPassword');
    this.submitButton = page.locator('button[type="submit"]');

    this.passwordRequirements = page.locator('.password-requirements, .requirements');
    this.lengthRequirement = page.locator('.req-length, [data-req="length"]');
    this.uppercaseRequirement = page.locator('.req-uppercase, [data-req="uppercase"]');
    this.numberRequirement = page.locator('.req-number, [data-req="number"]');

    this.noticeMessage = page.locator('#noticeMessage, .notice-message');
    this.successMessage = page.locator('#successMessage, .success-message');
    this.errorMessage = page.locator('.error-message, .form-error');

    this.loginLink = page.locator('a[href*="login"]');
    this.backLink = page.locator('.back-link, a:has-text("Back")');
  }

  /**
   * Navigate to signup page
   */
  async goto() {
    await this.page.goto('/signup.html');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Fill signup form with all fields
   */
  async fillForm(data: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    confirmPassword: string;
  }) {
    await this.nameInput.fill(data.name);
    await this.emailInput.fill(data.email);
    if (data.phone) {
      await this.phoneInput.fill(data.phone);
    }
    await this.passwordInput.fill(data.password);
    await this.confirmPasswordInput.fill(data.confirmPassword);
  }

  /**
   * Submit signup form
   */
  async submit() {
    await this.submitButton.click();
  }

  /**
   * Complete signup flow
   */
  async signup(data: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    confirmPassword: string;
  }) {
    await this.fillForm(data);
    await this.submit();
  }

  /**
   * Signup and wait for redirect
   */
  async signupAndWaitForRedirect(data: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    confirmPassword: string;
  }, expectedUrl: RegExp) {
    await this.fillForm(data);
    await Promise.all([
      this.page.waitForURL(expectedUrl, { timeout: 15000 }),
      this.submit()
    ]);
  }

  /**
   * Assert notice message
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
   * Assert error message
   */
  async expectErrorMessage(text: string | RegExp) {
    const errorLocator = this.errorMessage.or(this.noticeMessage);
    await expect(errorLocator.first()).toBeVisible();
    if (typeof text === 'string') {
      await expect(errorLocator.first()).toContainText(text);
    }
  }

  /**
   * Assert success message
   */
  async expectSuccessMessage(text?: string) {
    await expect(this.successMessage).toBeVisible();
    if (text) {
      await expect(this.successMessage).toContainText(text);
    }
  }

  /**
   * Assert all form elements are visible
   */
  async expectFormVisible() {
    await expect(this.nameInput).toBeVisible();
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.confirmPasswordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /**
   * Assert password requirement is met
   */
  async expectRequirementMet(requirement: 'length' | 'uppercase' | 'number') {
    const locator = {
      length: this.lengthRequirement,
      uppercase: this.uppercaseRequirement,
      number: this.numberRequirement
    }[requirement];

    if (await locator.isVisible()) {
      await expect(locator).toHaveClass(/met|valid|passed/);
    }
  }

  /**
   * Assert password requirement is not met
   */
  async expectRequirementNotMet(requirement: 'length' | 'uppercase' | 'number') {
    const locator = {
      length: this.lengthRequirement,
      uppercase: this.uppercaseRequirement,
      number: this.numberRequirement
    }[requirement];

    if (await locator.isVisible()) {
      await expect(locator).not.toHaveClass(/met|valid|passed/);
    }
  }

  /**
   * Navigate to login page via link
   */
  async goToLogin() {
    await this.loginLink.click();
    await this.page.waitForURL('**/login.html');
  }

  /**
   * Generate unique email for testing
   */
  static generateUniqueEmail(): string {
    return `testuser${Date.now()}@test.com`;
  }

  /**
   * Generate unique username for testing
   */
  static generateUniqueUsername(): string {
    return `user${Date.now()}`;
  }
}
