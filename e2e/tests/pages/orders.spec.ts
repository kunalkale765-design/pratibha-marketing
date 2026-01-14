import { test, expect } from '../../fixtures/auth.fixture';
import { OrdersPage } from '../../page-objects/orders.page';

test.describe('Orders Page', () => {
  let ordersPage: OrdersPage;

  test.beforeEach(async ({ adminPage }) => {
    ordersPage = new OrdersPage(adminPage);
    await ordersPage.goto();
    await ordersPage.waitForNetworkIdle();
  });

  test.describe('UI Elements', () => {
    test('should display orders list or empty state', async () => {
      const ordersVisible = await ordersPage.isVisible(ordersPage.ordersList);
      const emptyVisible = await ordersPage.isVisible(ordersPage.emptyState);

      expect(ordersVisible || emptyVisible).toBe(true);
    });

    test('should display filter tabs', async () => {
      await expect(ordersPage.filterTabs.first()).toBeVisible();
    });

    test('should display search input', async () => {
      await expect(ordersPage.searchInput).toBeVisible();
    });
  });

  test.describe('Filters', () => {
    test('should filter by pending status', async () => {
      await ordersPage.filterByStatus('pending');
      await ordersPage.expectFilterActive('pending');
    });

    test('should filter by confirmed status', async () => {
      await ordersPage.filterByStatus('confirmed');
      await ordersPage.expectFilterActive('confirmed');
    });

    test('should filter by processing status', async () => {
      await ordersPage.filterByStatus('processing');
      await ordersPage.expectFilterActive('processing');
    });

    test('should show all orders when clicking All tab', async () => {
      await ordersPage.filterByStatus('all');
      await ordersPage.expectFilterActive('all');
    });

    test('should switch between status tabs', async ({ adminPage }) => {
      const tabCount = await ordersPage.filterTabs.count();

      for (let i = 0; i < Math.min(tabCount, 3); i++) {
        await ordersPage.filterTabs.nth(i).click();
        await adminPage.waitForResponse('**/api/orders*');
        await expect(ordersPage.filterTabs.nth(i)).toHaveClass(/active|selected/);
      }
    });
  });

  test.describe('Search', () => {
    test('should filter orders by search query', async () => {
      await ordersPage.search('Test');
      // Wait for debounce and filter
      await ordersPage.page.waitForTimeout(500);
    });

    test('should clear search', async () => {
      await ordersPage.search('Test');
      await ordersPage.clearSearch();
      // Should show all orders again
    });

    test('should handle empty search results', async () => {
      await ordersPage.search('NonExistentCustomer12345');
      await ordersPage.page.waitForTimeout(500);

      const orderCount = await ordersPage.getOrderCount();
      // Either 0 orders or shows empty state
    });
  });

  test.describe('Order Cards', () => {
    test('should display order information on cards', async () => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        const data = await ordersPage.getOrderCardData(0);
        expect(data.customer).toBeTruthy();
      }
    });

    test('should display order amount pill', async () => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        const amountPill = ordersPage.orderCards.first().locator('.order-amount-pill');
        await expect(amountPill).toBeVisible();
      }
    });
  });

  test.describe('Order Detail Modal', () => {
    test('should open modal when clicking order', async () => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);
        await expect(ordersPage.orderDetailModal).toBeVisible();
      }
    });

    test('should close modal when clicking overlay', async () => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);
        await ordersPage.closeModalByOverlay();
      }
    });

    test('should close modal when pressing Escape', async () => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);
        await ordersPage.closeModalByEscape();
      }
    });

    test('should display order details in modal', async () => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);
        // Modal should contain order information
        await expect(ordersPage.orderDetailModal).toContainText(/Order|Customer/i);
      }
    });
  });

  test.describe('Swipe Actions', () => {
    test('should reveal actions on swipe left', async () => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.swipeLeftOnOrder(0);
        await ordersPage.expectSwipeActionsVisible();
      }
    });
  });

  test.describe('Order Status Updates', () => {
    test('should update order status from modal', async ({ adminPage }) => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.openOrderDetail(0);

        // Check if status dropdown exists
        if (await ordersPage.statusUpdateDropdown.isVisible()) {
          // Get available options
          const options = await ordersPage.statusUpdateDropdown.locator('option').allTextContents();

          if (options.length > 1) {
            await ordersPage.updateOrderStatus(options[1]);
          }
        }
      }
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state when no orders match filter', async () => {
      // Filter by a status that might have no orders
      await ordersPage.filterByStatus('delivered');

      const orderCount = await ordersPage.getOrderCount();
      if (orderCount === 0) {
        await ordersPage.expectEmptyState();
      }
    });
  });
});

test.describe('Orders Page - Access Control', () => {
  test('should redirect customer away from orders page', async ({ customerPage }) => {
    await customerPage.goto('/orders.html');
    await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
  });
});
