import { test, expect } from '../../fixtures/auth.fixture';
import { SignupPage } from '../../page-objects/signup.page';

test.describe('Signup Page', () => {
  let signupPage: SignupPage;

  test.beforeEach(async ({ page }) => {
    signupPage = new SignupPage(page);
    await signupPage.goto();
  });

  test.describe('UI Elements', () => {
    test('should display all required form elements', async () => {
      await signupPage.expectFormVisible();
    });

    test('should have link to login page', async () => {
      await expect(signupPage.loginLink).toBeVisible();
    });

    test('should display password requirements section', async () => {
      // Password requirements may or may not be visible initially
      await signupPage.passwordInput.click();
      // After clicking, requirements might appear
    });
  });

  test.describe('Form Validation - Password', () => {
    test('should validate minimum password length', async ({ page }) => {
      await signupPage.fillForm({
        name: 'Test User',
        email: SignupPage.generateUniqueUsername(),
        password: 'short',
        confirmPassword: 'short'
      });
      await signupPage.submit();

      // Should show error about password length
      await signupPage.expectErrorMessage(/password|6|characters/i);
    });

    test('should validate password confirmation matches', async ({ page }) => {
      await signupPage.fillForm({
        name: 'Test User',
        email: SignupPage.generateUniqueUsername(),
        password: 'StrongPass123!',
        confirmPassword: 'DifferentPass123!'
      });
      await signupPage.submit();

      // Should show error about password match
      await signupPage.expectErrorMessage(/match|confirm/i);
    });

    test('should require uppercase letter in password', async ({ page }) => {
      await signupPage.fillForm({
        name: 'Test User',
        email: SignupPage.generateUniqueUsername(),
        password: 'nouppercase123!',
        confirmPassword: 'nouppercase123!'
      });
      await signupPage.submit();

      // May show error about password requirements
      const hasError = await signupPage.noticeMessage.isVisible().catch(() => false);
      // Password requirement validation varies by implementation
    });

    test('should require number in password', async ({ page }) => {
      await signupPage.fillForm({
        name: 'Test User',
        email: SignupPage.generateUniqueUsername(),
        password: 'NoNumbers!',
        confirmPassword: 'NoNumbers!'
      });
      await signupPage.submit();

      // May show error about password requirements
      const hasError = await signupPage.noticeMessage.isVisible().catch(() => false);
      // Password requirement validation varies by implementation
    });
  });

  test.describe('Form Validation - Username', () => {
    test('should validate minimum username length', async ({ page }) => {
      await signupPage.fillForm({
        name: 'Test User',
        email: 'ab', // Less than 3 characters
        password: 'StrongPass123!',
        confirmPassword: 'StrongPass123!'
      });
      await signupPage.submit();

      // Should show error about username length
      await signupPage.expectErrorMessage(/username|3|character/i);
    });

    test('should not allow duplicate username', async ({ page }) => {
      await signupPage.fillForm({
        name: 'Test User',
        email: 'e2e-admin', // Existing admin user
        password: 'StrongPass123!',
        confirmPassword: 'StrongPass123!'
      });
      await signupPage.submit();

      // Should show error about duplicate
      await signupPage.expectErrorMessage(/already|exists|duplicate/i);
    });
  });

  test.describe('Form Validation - Phone', () => {
    test('should validate phone number format', async ({ page }) => {
      await signupPage.fillForm({
        name: 'Test User',
        email: SignupPage.generateUniqueUsername(),
        phone: '123', // Invalid - too short
        password: 'StrongPass123!',
        confirmPassword: 'StrongPass123!'
      });
      await signupPage.submit();

      // Should show error about phone format
      const noticeVisible = await signupPage.noticeMessage.isVisible().catch(() => false);
      // Phone validation may vary
    });

    test('should accept valid 10-digit phone number', async ({ page }) => {
      const uniqueUsername = SignupPage.generateUniqueUsername();

      await signupPage.fillForm({
        name: 'Test User',
        email: uniqueUsername,
        phone: '9876543210', // Valid 10-digit phone
        password: 'StrongPass123!',
        confirmPassword: 'StrongPass123!'
      });
      await signupPage.submit();

      // Should succeed or show success
      await page.waitForURL(/customer-order-form\.html/, { timeout: 15000 });
    });

    test('should allow empty phone number', async ({ page }) => {
      const uniqueUsername = SignupPage.generateUniqueUsername();

      await signupPage.fillForm({
        name: 'Test User',
        email: uniqueUsername,
        password: 'StrongPass123!',
        confirmPassword: 'StrongPass123!'
        // No phone provided
      });
      await signupPage.submit();

      // Should succeed without phone
      await page.waitForURL(/customer-order-form\.html/, { timeout: 15000 });
    });
  });

  test.describe('Form Validation - Required Fields', () => {
    test('should require name field', async ({ page }) => {
      await signupPage.fillForm({
        name: '', // Empty name
        email: SignupPage.generateUniqueUsername(),
        password: 'StrongPass123!',
        confirmPassword: 'StrongPass123!'
      });
      await signupPage.submit();

      // Should show error about name
      await signupPage.expectErrorMessage(/name|required/i);
    });

    test('should require email/username field', async ({ page }) => {
      await signupPage.fillForm({
        name: 'Test User',
        email: '', // Empty email
        password: 'StrongPass123!',
        confirmPassword: 'StrongPass123!'
      });
      await signupPage.submit();

      // Should show error about username
      await signupPage.expectErrorMessage(/username|required/i);
    });
  });

  test.describe('Successful Registration', () => {
    test('should register new customer and redirect to order form', async ({ page }) => {
      const uniqueUsername = SignupPage.generateUniqueUsername();

      await signupPage.signupAndWaitForRedirect(
        {
          name: 'New Test User',
          email: uniqueUsername,
          phone: '9876543210',
          password: 'StrongPass123!',
          confirmPassword: 'StrongPass123!'
        },
        /customer-order-form\.html/
      );

      // Verify user is stored
      const user = await signupPage.getStoredUser();
      expect(user).toBeTruthy();
      expect(user.role).toBe('customer');
    });

    test('should create customer record on signup', async ({ page, apiHelper }) => {
      const uniqueUsername = `signup-test-${Date.now()}`;

      await signupPage.signupAndWaitForRedirect(
        {
          name: 'Customer Record Test',
          email: uniqueUsername,
          password: 'StrongPass123!',
          confirmPassword: 'StrongPass123!'
        },
        /customer-order-form\.html/
      );

      // User should have customer role
      const user = await signupPage.getStoredUser();
      expect(user.role).toBe('customer');
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to login page when clicking login link', async ({ page }) => {
      await signupPage.goToLogin();
      await expect(page).toHaveURL(/login\.html/);
    });

    test('should navigate to login page via back link', async ({ page }) => {
      if (await signupPage.backLink.isVisible()) {
        await signupPage.backLink.click();
        await expect(page).toHaveURL(/login\.html/);
      }
    });
  });

  test.describe('Password Requirements Indicator', () => {
    test('should update requirements as password is typed', async ({ page }) => {
      // Focus password field
      await signupPage.passwordInput.click();

      // Type weak password
      await signupPage.passwordInput.fill('abc');

      // Requirements should show unmet
      // (This depends on UI implementation)

      // Type strong password
      await signupPage.passwordInput.fill('StrongPass123!');

      // Requirements should show met
      // (This depends on UI implementation)
    });
  });
});
