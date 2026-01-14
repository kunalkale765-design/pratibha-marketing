import { test, expect } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../page-objects/dashboard.page';
import { CustomerOrderFormPage } from '../../page-objects/customer-order-form.page';

test.describe('Logout Functionality', () => {
  test.describe('Admin/Staff Logout', () => {
    test('should logout admin and redirect to login', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();

      // Click logout
      await dashboardPage.logout();

      // Should redirect to login
      await expect(adminPage).toHaveURL(/login\.html/);
    });

    test('should clear user data from localStorage on logout', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();

      // Verify user is logged in
      let user = await dashboardPage.getStoredUser();
      expect(user).toBeTruthy();

      // Logout
      await dashboardPage.logout();

      // User data should be cleared
      user = await dashboardPage.getStoredUser();
      expect(user).toBeFalsy();
    });

    test('should clear auth cookie on logout', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();

      // Logout
      await dashboardPage.logout();

      // Check cookies are cleared
      const cookies = await adminPage.context().cookies();
      const tokenCookie = cookies.find(c => c.name === 'token');

      // Token should be cleared or expired
      expect(tokenCookie?.value).toBeFalsy();
    });

    test('should not allow access to dashboard after logout', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();

      // Logout
      await dashboardPage.logout();

      // Try to access dashboard
      await adminPage.goto('/index.html');

      // Should redirect back to login
      await expect(adminPage).toHaveURL(/login\.html/, { timeout: 10000 });
    });
  });

  test.describe('Customer Logout', () => {
    test('should logout customer and redirect to login', async ({ customerPage }) => {
      const orderFormPage = new CustomerOrderFormPage(customerPage);
      await orderFormPage.goto();

      // Click logout
      await orderFormPage.logout();

      // Should redirect to login
      await expect(customerPage).toHaveURL(/login\.html/);
    });

    test('should not allow access to order form after logout', async ({ customerPage }) => {
      const orderFormPage = new CustomerOrderFormPage(customerPage);
      await orderFormPage.goto();

      // Logout
      await orderFormPage.logout();

      // Try to access order form
      await customerPage.goto('/customer-order-form.html');

      // Should redirect to login
      await expect(customerPage).toHaveURL(/login\.html/, { timeout: 10000 });
    });
  });

  test.describe('Logout from Different Pages', () => {
    test('should be able to logout from orders page', async ({ adminPage }) => {
      await adminPage.goto('/orders.html');
      await adminPage.waitForLoadState('networkidle');

      const logoutButton = adminPage.locator('[data-logout], .logout-btn, #logoutBtn');
      await logoutButton.click();

      await expect(adminPage).toHaveURL(/login\.html/);
    });

    test('should be able to logout from customer management page', async ({ adminPage }) => {
      await adminPage.goto('/customer-management.html');
      await adminPage.waitForLoadState('networkidle');

      const logoutButton = adminPage.locator('[data-logout], .logout-btn, #logoutBtn');
      await logoutButton.click();

      await expect(adminPage).toHaveURL(/login\.html/);
    });

    test('should be able to logout from products page', async ({ adminPage }) => {
      await adminPage.goto('/products.html');
      await adminPage.waitForLoadState('networkidle');

      const logoutButton = adminPage.locator('[data-logout], .logout-btn, #logoutBtn');
      await logoutButton.click();

      await expect(adminPage).toHaveURL(/login\.html/);
    });

    test('should be able to logout from market rates page', async ({ adminPage }) => {
      await adminPage.goto('/market-rates.html');
      await adminPage.waitForLoadState('networkidle');

      const logoutButton = adminPage.locator('[data-logout], .logout-btn, #logoutBtn');
      await logoutButton.click();

      await expect(adminPage).toHaveURL(/login\.html/);
    });
  });
});

test.describe('Session Expiry', () => {
  test('should redirect to login when session is invalid', async ({ page }) => {
    // Set invalid token
    await page.context().addCookies([
      {
        name: 'token',
        value: 'invalid-token',
        domain: 'localhost',
        path: '/'
      }
    ]);

    // Try to access protected page
    await page.goto('/index.html');

    // Should redirect to login
    await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
  });
});
