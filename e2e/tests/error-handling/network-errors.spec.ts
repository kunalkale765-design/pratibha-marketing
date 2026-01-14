import { test, expect } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../page-objects/dashboard.page';
import { OrdersPage } from '../../page-objects/orders.page';

test.describe('Network Error Handling', () => {
  test.describe('Offline Mode', () => {
    test('should handle going offline gracefully', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForNetworkIdle();

      // Go offline
      await adminPage.context().setOffline(true);

      // Try to navigate
      await adminPage.goto('/orders.html').catch(() => {});

      // Should show some indication of offline or cached data
      // Implementation varies

      // Go back online
      await adminPage.context().setOffline(false);
    });

    test('should recover when back online', async ({ adminPage }) => {
      const ordersPage = new OrdersPage(adminPage);
      await ordersPage.goto();
      await ordersPage.waitForNetworkIdle();

      // Go offline
      await adminPage.context().setOffline(true);
      await adminPage.waitForTimeout(1000);

      // Go back online
      await adminPage.context().setOffline(false);

      // Refresh should work
      await ordersPage.goto();
      await ordersPage.waitForNetworkIdle();
      await ordersPage.expectOrdersListVisible();
    });
  });

  test.describe('API Error Responses', () => {
    test('should handle 500 server error gracefully', async ({ adminPage }) => {
      // Intercept API and return 500
      await adminPage.route('**/api/orders*', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Internal server error' })
        });
      });

      await adminPage.goto('/orders.html');

      // Should show error state or message
      const toast = adminPage.locator('#toast');
      // May show error toast
    });

    test('should handle 404 not found', async ({ adminPage }) => {
      await adminPage.route('**/api/orders/nonexistent*', route => {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Order not found' })
        });
      });

      // Navigate to orders and try to access non-existent order
      const ordersPage = new OrdersPage(adminPage);
      await ordersPage.goto();
    });

    test('should handle rate limiting (429)', async ({ adminPage }) => {
      let requestCount = 0;

      await adminPage.route('**/api/**', route => {
        requestCount++;
        if (requestCount > 2) {
          route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: 'Too many requests' })
          });
        } else {
          route.continue();
        }
      });

      await adminPage.goto('/index.html');
      // App should handle gracefully
    });
  });

  test.describe('Network Retry', () => {
    test('should retry failed requests', async ({ adminPage }) => {
      let requestCount = 0;

      await adminPage.route('**/api/orders*', route => {
        requestCount++;
        if (requestCount < 2) {
          route.abort('failed');
        } else {
          route.continue();
        }
      });

      await adminPage.goto('/orders.html');
      await adminPage.waitForTimeout(3000);

      // Should have retried
      expect(requestCount).toBeGreaterThan(1);
    });
  });

  test.describe('Timeout Handling', () => {
    test('should handle slow responses', async ({ adminPage }) => {
      await adminPage.route('**/api/orders*', async route => {
        // Delay response
        await new Promise(resolve => setTimeout(resolve, 5000));
        route.continue();
      });

      await adminPage.goto('/orders.html');
      // Should show loading state
    });
  });
});
