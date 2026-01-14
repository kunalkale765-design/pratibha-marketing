import { test, expect } from '../../fixtures/auth.fixture';

test.describe('Toast Notifications', () => {
  test.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/index.html');
    await adminPage.waitForLoadState('networkidle');
  });

  test.describe('Toast Display', () => {
    test('should show success toast', async ({ adminPage }) => {
      // Trigger a success action (e.g., save rates)
      await adminPage.evaluate(() => {
        // @ts-ignore
        if (typeof showToast === 'function') {
          showToast('Test success message', 'success');
        }
      });

      const toast = adminPage.locator('#toast');
      await expect(toast).toBeVisible({ timeout: 5000 });
    });

    test('should show error toast', async ({ adminPage }) => {
      await adminPage.evaluate(() => {
        // @ts-ignore
        if (typeof showToast === 'function') {
          showToast('Test error message', 'error');
        }
      });

      const toast = adminPage.locator('#toast');
      await expect(toast).toBeVisible({ timeout: 5000 });
    });

    test('should show warning toast', async ({ adminPage }) => {
      await adminPage.evaluate(() => {
        // @ts-ignore
        if (typeof showToast === 'function') {
          showToast('Test warning message', 'warning');
        }
      });

      const toast = adminPage.locator('#toast');
      await expect(toast).toBeVisible({ timeout: 5000 });
    });

    test('should show info toast', async ({ adminPage }) => {
      await adminPage.evaluate(() => {
        // @ts-ignore
        if (typeof showToast === 'function') {
          showToast('Test info message', 'info');
        }
      });

      const toast = adminPage.locator('#toast');
      await expect(toast).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Toast Auto-Hide', () => {
    test('should auto-hide after duration', async ({ adminPage }) => {
      await adminPage.evaluate(() => {
        // @ts-ignore
        if (typeof showToast === 'function') {
          showToast('Quick message', 'success', 1000);
        }
      });

      const toast = adminPage.locator('#toast');
      await expect(toast).toBeVisible();
      await adminPage.waitForTimeout(1500);
      await expect(toast).not.toHaveClass(/show/);
    });
  });

  test.describe('Toast Content', () => {
    test('should display message text', async ({ adminPage }) => {
      await adminPage.evaluate(() => {
        // @ts-ignore
        if (typeof showToast === 'function') {
          showToast('Custom test message', 'success');
        }
      });

      const toast = adminPage.locator('#toast');
      await expect(toast).toContainText('Custom test message');
    });
  });
});
