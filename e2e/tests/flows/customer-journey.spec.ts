import { test, expect } from '../../fixtures/auth.fixture';
import { SignupPage } from '../../page-objects/signup.page';
import { CustomerOrderFormPage } from '../../page-objects/customer-order-form.page';

test.describe('Customer Journey Flow', () => {
  test.describe('New Customer Signup and Order', () => {
    test('should complete signup and create first order', async ({ page }) => {
      // Step 1: Sign up
      const signupPage = new SignupPage(page);
      await signupPage.goto();

      const uniqueEmail = SignupPage.generateUniqueUsername();
      await signupPage.signupAndWaitForRedirect(
        {
          name: 'Journey Test Customer',
          email: uniqueEmail,
          password: 'JourneyTest123!',
          confirmPassword: 'JourneyTest123!'
        },
        /customer-order-form\.html/
      );

      // Step 2: Create order
      const orderFormPage = new CustomerOrderFormPage(page);
      await orderFormPage.waitForNetworkIdle();

      // Add products
      const productCount = await orderFormPage.getVisibleProductCount();
      if (productCount > 0) {
        await orderFormPage.incrementQuantityByIndex(0);
        await orderFormPage.incrementQuantityByIndex(1);
        await orderFormPage.submitOrderAndWaitForSuccess();
      }
    });
  });

  test.describe('Returning Customer', () => {
    test('should login and place order', async ({ customerPage }) => {
      const orderFormPage = new CustomerOrderFormPage(customerPage);
      await orderFormPage.goto();
      await orderFormPage.waitForNetworkIdle();

      // Verify customer is on order form
      await orderFormPage.expectProductListVisible();

      // Create order
      const productCount = await orderFormPage.getVisibleProductCount();
      if (productCount > 0) {
        await orderFormPage.incrementQuantityByIndex(0);
        await orderFormPage.submitOrderAndWaitForSuccess();
      }
    });
  });

  test.describe('Customer Navigation', () => {
    test('should only access customer-allowed pages', async ({ customerPage }) => {
      // Customer should be on order form
      await customerPage.goto('/customer-order-form.html');
      await expect(customerPage).toHaveURL(/customer-order-form\.html/);

      // Trying to access admin pages should redirect
      await customerPage.goto('/index.html');
      await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
    });
  });

  test.describe('Customer Price Visibility', () => {
    test('customer should never see prices during entire journey', async ({ customerPage }) => {
      const orderFormPage = new CustomerOrderFormPage(customerPage);
      await orderFormPage.goto();
      await orderFormPage.waitForNetworkIdle();

      // Verify prices are hidden
      await orderFormPage.expectPricesHidden();

      // Add items and verify prices still hidden
      const productCount = await orderFormPage.getVisibleProductCount();
      if (productCount > 0) {
        await orderFormPage.incrementQuantityByIndex(0);
        await orderFormPage.expectPricesHidden();
      }
    });
  });
});
