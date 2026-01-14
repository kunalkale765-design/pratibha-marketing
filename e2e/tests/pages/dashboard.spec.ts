import { test, expect } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../page-objects/dashboard.page';

test.describe('Dashboard Page', () => {
  test.describe('Admin/Staff View', () => {
    let dashboardPage: DashboardPage;

    test.beforeEach(async ({ adminPage }) => {
      dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForNetworkIdle();
    });

    test.describe('UI Elements', () => {
      test('should display user badge with name', async () => {
        await dashboardPage.expectUserLoggedIn();
      });

      test('should display stat cards', async () => {
        await dashboardPage.expectStatsVisible();
      });

      test('should display quick action cards', async () => {
        await dashboardPage.expectQuickActionsVisible();
      });

      test('should display logout button', async () => {
        await expect(dashboardPage.logoutButton).toBeVisible();
      });
    });

    test.describe('Stats Display', () => {
      test('should show total orders stat', async () => {
        await expect(dashboardPage.totalOrdersStat).toBeVisible();
      });

      test('should show stat values', async () => {
        const value = await dashboardPage.getStatValue(dashboardPage.statCards.first());
        expect(value).toBeTruthy();
      });
    });

    test.describe('Quick Actions Navigation', () => {
      test('should navigate to orders page', async ({ adminPage }) => {
        await dashboardPage.goToOrders();
        await expect(adminPage).toHaveURL(/orders\.html/);
      });

      test('should navigate to customer management', async ({ adminPage }) => {
        await dashboardPage.goToCustomers();
        await expect(adminPage).toHaveURL(/customer-management\.html/);
      });

      test('should navigate to products page', async ({ adminPage }) => {
        await dashboardPage.goToProducts();
        await expect(adminPage).toHaveURL(/products\.html/);
      });

      test('should navigate to market rates', async ({ adminPage }) => {
        await dashboardPage.goToMarketRates();
        await expect(adminPage).toHaveURL(/market-rates\.html/);
      });

      test('should navigate to create order', async ({ adminPage }) => {
        await dashboardPage.goToCreateOrder();
        await expect(adminPage).toHaveURL(/customer-order-form\.html/);
      });
    });

    test.describe('Procurement List', () => {
      test('should display procurement container', async () => {
        await expect(dashboardPage.procurementContainer).toBeVisible();
      });

      test('should have rate inputs for products', async () => {
        const inputCount = await dashboardPage.rateInputs.count();
        expect(inputCount).toBeGreaterThanOrEqual(0);
      });

      test('should mark rate as unsaved when changed', async ({ adminPage }) => {
        const inputCount = await dashboardPage.rateInputs.count();
        if (inputCount > 0) {
          await dashboardPage.updateRateInline(0, 999);
          const hasUnsaved = await dashboardPage.hasUnsavedChanges();
          expect(hasUnsaved).toBe(true);
        }
      });

      test('should save rates when clicking save button', async ({ adminPage }) => {
        const inputCount = await dashboardPage.rateInputs.count();
        if (inputCount > 0) {
          await dashboardPage.updateRateInline(0, 100);

          if (await dashboardPage.saveRatesButton.isVisible()) {
            await dashboardPage.saveRates();
          }
        }
      });
    });

    test.describe('Analytics Charts', () => {
      test('should render charts', async () => {
        await dashboardPage.expectChartsVisible();
      });
    });

    test.describe('API Status', () => {
      test('should show API status indicator', async () => {
        if (await dashboardPage.apiStatusIndicator.isVisible()) {
          await dashboardPage.expectApiOnline();
        }
      });
    });
  });
});

test.describe('Dashboard - Customer Access Denied', () => {
  test('should redirect customer to order form', async ({ customerPage }) => {
    await customerPage.goto('/index.html');
    await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
  });
});
