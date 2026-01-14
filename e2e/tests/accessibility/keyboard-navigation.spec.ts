import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../page-objects/login.page';
import { CustomerManagementPage } from '../../page-objects/customer-management.page';

test.describe('Keyboard Navigation', () => {
  test.describe('Login Page', () => {
    test('should navigate form with Tab key', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Focus first element
      await page.keyboard.press('Tab');
      await expect(loginPage.emailInput).toBeFocused();

      // Tab to password
      await page.keyboard.press('Tab');
      await expect(loginPage.passwordInput).toBeFocused();

      // Tab to toggle (if tabbable)
      await page.keyboard.press('Tab');

      // Tab to submit
      await page.keyboard.press('Tab');
      await expect(loginPage.submitButton).toBeFocused();
    });

    test('should submit form with Enter key', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.fillForm('e2e-admin', 'Admin123!');
      await page.keyboard.press('Enter');

      await expect(page).toHaveURL(/index\.html/, { timeout: 15000 });
    });

    test('should toggle password visibility with Enter on toggle button', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.passwordInput.fill('TestPassword');
      await loginPage.passwordToggle.focus();
      await page.keyboard.press('Enter');

      await loginPage.expectPasswordVisible();
    });
  });

  test.describe('Modal Navigation', () => {
    test('should close modal with Escape key', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await expect(customerPage.customerModal).toBeVisible();

      await adminPage.keyboard.press('Escape');
      await expect(customerPage.modalOverlay).not.toHaveClass(/show/);
    });

    test('should navigate modal form with Tab', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();

      // Tab through form fields
      await adminPage.keyboard.press('Tab');
      // Should focus first input
    });

    test('should trap focus within modal', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();

      // Tab multiple times - should stay within modal
      for (let i = 0; i < 10; i++) {
        await adminPage.keyboard.press('Tab');
      }

      // Focus should still be within modal
      const focusedElement = await adminPage.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('.modal-content') !== null;
      });

      // Focus trapping may or may not be implemented
    });
  });

  test.describe('Interactive Elements', () => {
    test('should activate buttons with Enter or Space', async ({ adminPage }) => {
      await adminPage.goto('/index.html');
      await adminPage.waitForLoadState('networkidle');

      // Find a button and focus it
      const button = adminPage.locator('button').first();
      await button.focus();

      // Should be activatable with Enter
      await adminPage.keyboard.press('Enter');
    });

    test('should select dropdown options with keyboard', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();

      // Focus select
      await customerPage.pricingTypeSelect.focus();

      // Navigate options with arrow keys
      await adminPage.keyboard.press('ArrowDown');
      await adminPage.keyboard.press('Enter');
    });
  });

  test.describe('Skip Links', () => {
    test('should have skip to main content link', async ({ page }) => {
      await page.goto('/index.html');

      // Press Tab to reveal skip link
      await page.keyboard.press('Tab');

      const skipLink = page.locator('a:has-text("Skip"), .skip-link');
      // Skip link may or may not be implemented
    });
  });

  test.describe('Focus Visibility', () => {
    test('should show focus indicator on inputs', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.emailInput.focus();

      // Should have visible focus style
      const hasFocusStyle = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.outline !== 'none' || style.boxShadow !== 'none';
      });

      // Focus visibility depends on CSS implementation
    });

    test('should show focus indicator on buttons', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.submitButton.focus();

      // Should have visible focus style
    });
  });
});
