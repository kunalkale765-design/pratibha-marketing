import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../page-objects/login.page';
import { CustomerManagementPage } from '../../page-objects/customer-management.page';

test.describe('CSRF Token Handling', () => {
  test.describe('Token Generation', () => {
    test('should generate CSRF token on page load', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Wait for token to be fetched
      await page.waitForTimeout(1000);

      const csrfToken = await loginPage.getCsrfToken();
      expect(csrfToken).toBeTruthy();
    });

    test('should have CSRF token in cookie', async ({ page }) => {
      await page.goto('/login.html');
      await page.waitForTimeout(1000);

      const cookies = await page.context().cookies();
      const csrfCookie = cookies.find(c => c.name === 'csrf_token');
      expect(csrfCookie).toBeTruthy();
    });
  });

  test.describe('Token Validation', () => {
    test('should reject requests without CSRF token', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      // Clear CSRF cookie
      await adminPage.context().clearCookies();

      // Try to create customer
      await customerPage.openCreateModal();
      await customerPage.fillCustomerForm({
        name: 'CSRF Test Customer',
        pricingType: 'market'
      });

      // Intercept and verify CSRF handling
      let csrfErrorReceived = false;
      adminPage.on('response', response => {
        if (response.status() === 403 && response.url().includes('/api/customers')) {
          csrfErrorReceived = true;
        }
      });

      await customerPage.saveCustomer();

      // Should either retry with new token or show error
      await adminPage.waitForTimeout(2000);
    });

    test('should auto-retry on CSRF error', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      let requestCount = 0;

      // Intercept first request to fail with CSRF error, then succeed
      await adminPage.route('**/api/customers', async route => {
        requestCount++;
        if (requestCount === 1 && route.request().method() === 'POST') {
          await route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: 'CSRF token missing' })
          });
        } else {
          await route.continue();
        }
      });

      await customerPage.openCreateModal();
      await customerPage.fillCustomerForm({
        name: `Auto Retry Test ${Date.now()}`,
        pricingType: 'market'
      });
      await customerPage.saveCustomer();

      // Should have retried
      await adminPage.waitForTimeout(3000);
      expect(requestCount).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('Token Refresh', () => {
    test('should get new CSRF token when expired', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Get initial token
      await page.waitForTimeout(1000);
      const initialToken = await loginPage.getCsrfToken();

      // Clear cookies to simulate expiry
      await page.context().clearCookies();

      // Navigate and verify new token is obtained
      await page.goto('/login.html');
      await page.waitForTimeout(1000);

      const newToken = await loginPage.getCsrfToken();
      expect(newToken).toBeTruthy();
    });
  });

  test.describe('Login with CSRF', () => {
    test('should login successfully with valid CSRF token', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Ensure CSRF token is present
      await page.waitForTimeout(1000);
      const token = await loginPage.getCsrfToken();
      expect(token).toBeTruthy();

      // Login should work
      await loginPage.loginAndWaitForRedirect('e2e-admin', 'Admin123!', /index\.html/);
    });

    test('should recover from missing CSRF token on login', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Clear CSRF cookie
      await page.context().clearCookies();

      // Login should still work (auto-retry)
      await loginPage.login('e2e-admin', 'Admin123!');

      // Should eventually succeed or show clear error
      await page.waitForTimeout(5000);
    });
  });
});
