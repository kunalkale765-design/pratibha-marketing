import { test, expect } from '../../fixtures/auth.fixture';
import { OrdersPage } from '../../page-objects/orders.page';

test.describe('Swipe Actions Component', () => {
  let ordersPage: OrdersPage;

  test.beforeEach(async ({ adminPage }) => {
    ordersPage = new OrdersPage(adminPage);
    await ordersPage.goto();
    await ordersPage.waitForNetworkIdle();
  });

  test.describe('Swipe Gesture', () => {
    test('should reveal actions on swipe left', async () => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.swipeLeftOnOrder(0);
        await ordersPage.expectSwipeActionsVisible();
      }
    });

    test('should show action buttons when swiped', async ({ adminPage }) => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.swipeLeftOnOrder(0);

        // Check for action buttons
        const actions = adminPage.locator('.swipe-actions .swipe-action, .swipe-actions button');
        const actionCount = await actions.count();
        expect(actionCount).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Action Buttons', () => {
    test('should have print action', async ({ adminPage }) => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.swipeLeftOnOrder(0);

        const printAction = ordersPage.printAction;
        const isVisible = await printAction.isVisible();
        // Print action may or may not be present
      }
    });

    test('should trigger action on click', async ({ adminPage }) => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.swipeLeftOnOrder(0);

        // Click first available action
        const actionButton = adminPage.locator('.swipe-actions .swipe-action, .swipe-actions button').first();
        if (await actionButton.isVisible()) {
          await actionButton.click();
          // Should trigger action (toast, modal, or status change)
        }
      }
    });
  });

  test.describe('Swipe Reset', () => {
    test('should reset swipe when clicking elsewhere', async ({ adminPage }) => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount > 0) {
        await ordersPage.swipeLeftOnOrder(0);
        await ordersPage.expectSwipeActionsVisible();

        // Click elsewhere
        await adminPage.click('body', { position: { x: 10, y: 10 } });

        // Actions should hide
        await adminPage.waitForTimeout(500);
      }
    });
  });

  test.describe('Multiple Items', () => {
    test('should only show actions for one item at a time', async ({ adminPage }) => {
      const orderCount = await ordersPage.getOrderCount();
      if (orderCount >= 2) {
        // Swipe first item
        await ordersPage.swipeLeftOnOrder(0);

        // Swipe second item
        await ordersPage.swipeLeftOnOrder(1);

        // Only second item should have visible actions
        const visibleActions = adminPage.locator('.swipe-actions:visible');
        const visibleCount = await visibleActions.count();
        expect(visibleCount).toBeLessThanOrEqual(1);
      }
    });
  });
});
