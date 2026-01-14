import { test, expect } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../page-objects/dashboard.page';
import { MarketRatesPage } from '../../page-objects/market-rates.page';
import { OrdersPage } from '../../page-objects/orders.page';
import { CustomerManagementPage } from '../../page-objects/customer-management.page';
import { CustomerOrderFormPage } from '../../page-objects/customer-order-form.page';

test.describe('Staff Daily Workflow', () => {
  test.describe('Morning Workflow', () => {
    test('should check dashboard stats and pending orders', async ({ staffPage }) => {
      // Step 1: Check dashboard
      const dashboardPage = new DashboardPage(staffPage);
      await dashboardPage.goto();
      await dashboardPage.waitForNetworkIdle();

      await dashboardPage.expectStatsVisible();

      // Step 2: Check orders
      await dashboardPage.goToOrders();

      const ordersPage = new OrdersPage(staffPage);
      await ordersPage.waitForNetworkIdle();

      // Filter to pending
      await ordersPage.filterByStatus('pending');
    });

    test('should update market rates', async ({ staffPage }) => {
      const dashboardPage = new DashboardPage(staffPage);
      await dashboardPage.goto();
      await dashboardPage.waitForNetworkIdle();

      // Go to market rates
      await dashboardPage.goToMarketRates();

      const marketRatesPage = new MarketRatesPage(staffPage);
      await marketRatesPage.waitForNetworkIdle();

      // Update a rate
      const inputCount = await marketRatesPage.rateInputs.count();
      if (inputCount > 0) {
        await marketRatesPage.updateRateByIndex(0, 100);
        await marketRatesPage.saveRates();
      }
    });
  });

  test.describe('Order Processing Workflow', () => {
    test('should create order for customer', async ({ staffPage }) => {
      const orderFormPage = new CustomerOrderFormPage(staffPage);
      await orderFormPage.goto();
      await orderFormPage.waitForNetworkIdle();

      // Select customer
      await orderFormPage.expectCustomerSelectorVisible();
      const optionCount = await orderFormPage.customerDropdown.locator('option').count();
      if (optionCount > 1) {
        await orderFormPage.selectCustomerByIndex(1);

        // Add products
        await orderFormPage.incrementQuantityByIndex(0);
        await orderFormPage.submitOrderAndWaitForSuccess();
      }
    });

    test('should process pending orders', async ({ staffPage }) => {
      const ordersPage = new OrdersPage(staffPage);
      await ordersPage.goto();
      await ordersPage.waitForNetworkIdle();

      // Filter to pending
      await ordersPage.filterByStatus('pending');

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        // Open first order
        await ordersPage.openOrderDetail(0);

        // Update status if available
        if (await ordersPage.statusUpdateDropdown.isVisible()) {
          const options = await ordersPage.statusUpdateDropdown.locator('option').allTextContents();
          if (options.length > 1) {
            await ordersPage.updateOrderStatus(options[1]);
          }
        }
      }
    });
  });

  test.describe('Customer Management Workflow', () => {
    test('should manage customers and pricing', async ({ staffPage }) => {
      const customerPage = new CustomerManagementPage(staffPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.expectCustomersListVisible();

      // Create new customer
      const uniqueName = `Staff Created Customer ${Date.now()}`;
      await customerPage.createCustomer({
        name: uniqueName,
        phone: `98${Date.now().toString().slice(-8)}`,
        pricingType: 'market'
      });
    });
  });

  test.describe('End of Day Workflow', () => {
    test('should check delivered orders', async ({ staffPage }) => {
      const ordersPage = new OrdersPage(staffPage);
      await ordersPage.goto();
      await ordersPage.waitForNetworkIdle();

      // Filter to delivered
      await ordersPage.filterByStatus('delivered');
      await ordersPage.expectFilterActive('delivered');
    });

    test('should verify dashboard totals', async ({ staffPage }) => {
      const dashboardPage = new DashboardPage(staffPage);
      await dashboardPage.goto();
      await dashboardPage.waitForNetworkIdle();

      await dashboardPage.expectStatsVisible();
    });
  });
});
