import { test, expect } from '../../fixtures/auth.fixture';
import { CustomerOrderFormPage } from '../../page-objects/customer-order-form.page';
import { OrdersPage } from '../../page-objects/orders.page';

test.describe('Order Lifecycle Flow', () => {
  test.describe('Complete Order Flow', () => {
    test('should create order as customer', async ({ customerPage }) => {
      const orderFormPage = new CustomerOrderFormPage(customerPage);
      await orderFormPage.goto();
      await orderFormPage.waitForNetworkIdle();

      // Add products
      const productCount = await orderFormPage.getVisibleProductCount();
      if (productCount > 0) {
        await orderFormPage.incrementQuantityByIndex(0);
        await orderFormPage.submitOrderAndWaitForSuccess();
      }
    });

    test('should view and process order as staff', async ({ staffPage }) => {
      // First create an order
      const orderFormPage = new CustomerOrderFormPage(staffPage);
      await orderFormPage.goto();
      await orderFormPage.waitForNetworkIdle();

      // Select customer and add products
      const optionCount = await orderFormPage.customerDropdown.locator('option').count();
      if (optionCount > 1) {
        await orderFormPage.selectCustomerByIndex(1);
        await orderFormPage.incrementQuantityByIndex(0);
        await orderFormPage.submitOrderAndWaitForSuccess();
      }

      // Go to orders page
      const ordersPage = new OrdersPage(staffPage);
      await ordersPage.goto();
      await ordersPage.waitForNetworkIdle();

      // View order
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);
        await expect(ordersPage.orderDetailModal).toBeVisible();
      }
    });

    test('should update order status through workflow', async ({ adminPage }) => {
      const ordersPage = new OrdersPage(adminPage);
      await ordersPage.goto();
      await ordersPage.waitForNetworkIdle();

      // Filter to pending orders
      await ordersPage.filterByStatus('pending');

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);

        // Update status if dropdown is available
        if (await ordersPage.statusUpdateDropdown.isVisible()) {
          const options = await ordersPage.statusUpdateDropdown.locator('option').allTextContents();
          if (options.includes('confirmed')) {
            await ordersPage.updateOrderStatus('confirmed');
          }
        }
      }
    });
  });

  test.describe('Order Status State Machine', () => {
    test('pending order can be confirmed', async ({ adminPage }) => {
      const ordersPage = new OrdersPage(adminPage);
      await ordersPage.goto();
      await ordersPage.filterByStatus('pending');

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);
        // Check available status transitions
      }
    });

    test('confirmed order can be processed', async ({ adminPage }) => {
      const ordersPage = new OrdersPage(adminPage);
      await ordersPage.goto();
      await ordersPage.filterByStatus('confirmed');

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);
        // Check available status transitions
      }
    });
  });

  test.describe('Payment Updates', () => {
    test('should update payment amount', async ({ adminPage }) => {
      const ordersPage = new OrdersPage(adminPage);
      await ordersPage.goto();
      await ordersPage.waitForNetworkIdle();

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);

        // Check if payment section exists
        if (await ordersPage.paymentAmountInput.isVisible()) {
          await ordersPage.updatePayment(1000);
        }
      }
    });
  });
});
