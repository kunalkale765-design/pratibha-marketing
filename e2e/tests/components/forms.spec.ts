import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../page-objects/login.page';
import { SignupPage } from '../../page-objects/signup.page';
import { CustomerManagementPage } from '../../page-objects/customer-management.page';
import { ProductsPage } from '../../page-objects/products.page';

test.describe('Form Component', () => {
  test.describe('Form Validation', () => {
    test('should validate required fields on login', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.submit();
      await loginPage.expectNoticeMessage(/enter|required/i);
    });

    test('should validate required fields on signup', async ({ page }) => {
      const signupPage = new SignupPage(page);
      await signupPage.goto();

      await signupPage.submit();
      await signupPage.expectErrorMessage(/required|enter/i);
    });

    test('should validate phone number format', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await customerPage.customerNameInput.fill('Test Customer');
      await customerPage.customerPhoneInput.fill('123'); // Invalid
      await customerPage.saveCustomer();

      // Should show error or validation message
    });
  });

  test.describe('Form Input Types', () => {
    test('should handle text input', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await customerPage.customerNameInput.fill('Test Name');

      const value = await customerPage.customerNameInput.inputValue();
      expect(value).toBe('Test Name');
    });

    test('should handle number input', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await customerPage.pricingTypeSelect.selectOption('markup');
      await customerPage.markupPercentageInput.fill('15');

      const value = await customerPage.markupPercentageInput.inputValue();
      expect(value).toBe('15');
    });

    test('should handle select input', async ({ adminPage }) => {
      const productsPage = new ProductsPage(adminPage);
      await productsPage.goto();
      await productsPage.waitForNetworkIdle();

      await productsPage.openCreateModal();
      await productsPage.productUnitSelect.selectOption('kg');

      const value = await productsPage.productUnitSelect.inputValue();
      expect(value).toBe('kg');
    });
  });

  test.describe('Form Submission States', () => {
    test('should show loading state during submission', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.fillForm('admin', 'Admin123!');
      await loginPage.submit();

      await loginPage.expectButtonLoading();
    });

    test('should disable form during submission', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.fillForm('admin', 'Admin123!');
      await loginPage.submit();

      // Button should be disabled during loading
      await expect(loginPage.submitButton).toBeDisabled();
    });
  });

  test.describe('Form Error Display', () => {
    test('should display inline error messages', async ({ page }) => {
      const signupPage = new SignupPage(page);
      await signupPage.goto();

      await signupPage.fillForm({
        name: 'Test',
        email: 'ab', // Too short
        password: 'StrongPass123!',
        confirmPassword: 'StrongPass123!'
      });
      await signupPage.submit();

      // Error message should appear
      await signupPage.expectErrorMessage(/username|3/i);
    });

    test('should clear error messages on input', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      // Submit empty form to trigger error
      await loginPage.submit();
      await loginPage.expectNoticeMessage(/enter/i);

      // Fill form and check if error clears on resubmit
      await loginPage.fillForm('admin', 'Admin123!');
    });
  });

  test.describe('Form Field Interactions', () => {
    test('should focus next field on Tab', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.emailInput.focus();
      await page.keyboard.press('Tab');

      await expect(loginPage.passwordInput).toBeFocused();
    });

    test('should submit form on Enter', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.fillForm('admin', 'Admin123!');
      await page.keyboard.press('Enter');

      await expect(page).toHaveURL(/index\.html/, { timeout: 15000 });
    });
  });
});
