import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../page-objects/login.page';
import { TEST_USERS } from '../../setup/test-data';

// Login tests need unauthenticated context
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login Page', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test.describe('UI Elements', () => {
    test('should display all required form elements', async () => {
      await loginPage.expectFormVisible();
      await expect(loginPage.passwordToggle).toBeVisible();
    });

    test('should display branding elements', async () => {
      await loginPage.expectBrandingVisible();
    });

    test('should have link to signup page', async ({ page }) => {
      await expect(loginPage.signupLink).toBeVisible();
      await expect(loginPage.signupLink).toHaveAttribute('href', /signup/);
    });

    test('should have proper input autocomplete attributes', async () => {
      await expect(loginPage.emailInput).toHaveAttribute('autocomplete', /username/i);
      await expect(loginPage.passwordInput).toHaveAttribute('autocomplete', /password/i);
    });
  });

  test.describe('Password Visibility Toggle', () => {
    test('should toggle password visibility when clicking toggle button', async () => {
      // Initially password should be hidden
      await loginPage.passwordInput.fill('TestPassword123');
      await loginPage.expectPasswordHidden();

      // Click toggle to show password
      await loginPage.togglePasswordVisibility();
      await loginPage.expectPasswordVisible();

      // Click toggle again to hide password
      await loginPage.togglePasswordVisibility();
      await loginPage.expectPasswordHidden();
    });
  });

  test.describe('Form Validation', () => {
    test('should show error when submitting empty form', async () => {
      await loginPage.submit();
      await loginPage.expectNoticeMessage(/enter/i);
    });

    test('should show error when only email is provided', async () => {
      await loginPage.emailInput.fill('testuser');
      await loginPage.submit();
      await loginPage.expectNoticeMessage(/password/i);
    });

    test('should show error when only password is provided', async () => {
      await loginPage.passwordInput.fill('TestPassword123');
      await loginPage.submit();
      await loginPage.expectNoticeMessage(/username/i);
    });
  });

  test.describe('Authentication - Valid Credentials', () => {
    test('should login admin user and redirect to dashboard', async ({ page }) => {
      await loginPage.loginAndWaitForRedirect(
        TEST_USERS.admin.email,
        TEST_USERS.admin.password,
        /index\.html/
      );

      // Verify user data is stored
      const user = await loginPage.getStoredUser();
      expect(user).toBeTruthy();
      expect(user.role).toBe('admin');
    });

    test('should login staff user and redirect to dashboard', async ({ page }) => {
      await loginPage.loginAndWaitForRedirect(
        TEST_USERS.staff.email,
        TEST_USERS.staff.password,
        /index\.html/
      );

      const user = await loginPage.getStoredUser();
      expect(user).toBeTruthy();
      expect(user.role).toBe('staff');
    });

    test('should login customer user and redirect to order form', async ({ page }) => {
      await loginPage.loginAndWaitForRedirect(
        TEST_USERS.customer.email,
        TEST_USERS.customer.password,
        /customer-order-form\.html/
      );

      const user = await loginPage.getStoredUser();
      expect(user).toBeTruthy();
      expect(user.role).toBe('customer');
    });
  });

  test.describe('Authentication - Invalid Credentials', () => {
    test('should show error for wrong password', async () => {
      await loginPage.login(TEST_USERS.admin.email, 'wrongpassword');
      await loginPage.expectNoticeMessage(/invalid/i);
    });

    test('should show error for non-existent user', async () => {
      await loginPage.login('nonexistentuser', 'TestPassword123');
      await loginPage.expectNoticeMessage(/invalid/i);
    });

    test('should show error for empty username with password', async () => {
      await loginPage.passwordInput.fill('TestPassword123');
      await loginPage.submit();
      await loginPage.expectNoticeMessage(/username/i);
    });
  });

  test.describe('Loading State', () => {
    test('should show loading state during login', async ({ page }) => {
      await loginPage.fillForm(TEST_USERS.admin.email, TEST_USERS.admin.password);

      // Start login and check loading state
      const loginPromise = loginPage.submit();

      // Button should be disabled during loading
      await loginPage.expectButtonLoading();

      // Wait for login to complete
      await page.waitForURL(/index\.html/, { timeout: 15000 });
    });
  });

  test.describe('CSRF Token', () => {
    test('should have CSRF token cookie after page load', async ({ page }) => {
      // Wait for CSRF token to be fetched
      await page.waitForTimeout(1000);

      const csrfToken = await loginPage.getCsrfToken();
      expect(csrfToken).toBeTruthy();
    });

    test('should handle CSRF token refresh automatically', async ({ page }) => {
      // Clear cookies
      await page.context().clearCookies();

      // Login should still work (auto-retry with fresh token)
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);

      // Should eventually succeed
      await page.waitForURL(/index\.html/, { timeout: 20000 });
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to signup page when clicking signup link', async ({ page }) => {
      await loginPage.goToSignup();
      await expect(page).toHaveURL(/signup\.html/);
    });
  });
});

// These tests use authenticated fixtures, which have their own storage state
test.describe('Login Redirect Logic', () => {
  // Admin page fixture already uses admin storage state
  test('should redirect logged-in admin to dashboard when visiting login page', async ({ adminPage }) => {
    await adminPage.goto('/login.html');
    // Should be redirected to dashboard
    await expect(adminPage).toHaveURL(/index\.html/, { timeout: 10000 });
  });

  // Customer page fixture already uses customer storage state
  test('should redirect logged-in customer to order form when visiting login page', async ({ customerPage }) => {
    await customerPage.goto('/login.html');
    // Should be redirected to order form
    await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
  });
});
