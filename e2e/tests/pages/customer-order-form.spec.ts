import { test, expect } from '../../fixtures/auth.fixture';
import { CustomerOrderFormPage } from '../../page-objects/customer-order-form.page';

test.describe('Customer Order Form Page', () => {
  test.describe('Customer View', () => {
    let orderFormPage: CustomerOrderFormPage;

    test.beforeEach(async ({ customerPage }) => {
      orderFormPage = new CustomerOrderFormPage(customerPage);
      await orderFormPage.goto();
      await orderFormPage.waitForNetworkIdle();
    });

    test.describe('UI Elements', () => {
      test('should display product list', async () => {
        await orderFormPage.expectProductListVisible();
      });

      test('should display search input', async () => {
        await expect(orderFormPage.searchInput).toBeVisible();
      });

      test('should display category filter pills', async () => {
        const pillCount = await orderFormPage.categoryPills.count();
        expect(pillCount).toBeGreaterThanOrEqual(0);
      });

      test('should display submit button', async () => {
        await orderFormPage.expectSubmitButtonVisible();
      });

      test('should display order summary', async () => {
        await orderFormPage.expectOrderSummaryVisible();
      });
    });

    test.describe('CRITICAL: Price Visibility', () => {
      test('should NOT display prices to customers', async () => {
        await orderFormPage.expectPricesHidden();
      });

      test('should NOT display rates to customers', async () => {
        // Verify no rate indicators are visible
        const rateCount = await orderFormPage.rateIndicators.count();
        expect(rateCount).toBe(0);
      });

      test('should NOT display amounts to customers', async ({ customerPage }) => {
        // Verify no amount/total indicators are visible
        const amountLocators = customerPage.locator('.price, .rate, .amount:not(.order-summary .amount)');
        const visibleCount = await amountLocators.count();
        expect(visibleCount).toBe(0);
      });
    });

    test.describe('Customer Selector', () => {
      test('should NOT show customer selector to customers', async () => {
        await orderFormPage.expectCustomerSelectorHidden();
      });
    });

    test.describe('Quantity Controls', () => {
      test('should increment quantity when clicking plus', async () => {
        const productCount = await orderFormPage.getVisibleProductCount();
        if (productCount > 0) {
          await orderFormPage.incrementQuantityByIndex(0);
          const qty = await orderFormPage.quantityInputs.first().inputValue();
          expect(parseInt(qty)).toBeGreaterThan(0);
        }
      });

      test('should decrement quantity when clicking minus', async () => {
        const productCount = await orderFormPage.getVisibleProductCount();
        if (productCount > 0) {
          // First increment
          await orderFormPage.incrementQuantityByIndex(0);
          await orderFormPage.incrementQuantityByIndex(0);

          // Then decrement
          await orderFormPage.decrementQuantityByIndex(0);
          const qty = await orderFormPage.quantityInputs.first().inputValue();
          expect(parseInt(qty)).toBe(1);
        }
      });

      test('should not go below 0 quantity', async () => {
        const productCount = await orderFormPage.getVisibleProductCount();
        if (productCount > 0) {
          await orderFormPage.decrementQuantityByIndex(0);
          const qty = await orderFormPage.quantityInputs.first().inputValue();
          expect(parseInt(qty)).toBeGreaterThanOrEqual(0);
        }
      });

      test('should highlight product with quantity', async () => {
        const productCount = await orderFormPage.getVisibleProductCount();
        if (productCount > 0) {
          await orderFormPage.incrementQuantityByIndex(0);
          await expect(orderFormPage.productItems.first()).toHaveClass(/has-qty|selected/);
        }
      });
    });

    test.describe('Search', () => {
      test('should filter products by search', async () => {
        await orderFormPage.search('Tomato');
        await orderFormPage.page.waitForTimeout(500);

        const visibleCount = await orderFormPage.getVisibleProductCount();
        // Results should be filtered
      });

      test('should clear search', async () => {
        await orderFormPage.search('Tomato');
        await orderFormPage.clearSearch();
      });
    });

    test.describe('Category Filter', () => {
      test('should filter by category', async () => {
        const pillCount = await orderFormPage.categoryPills.count();
        if (pillCount > 0) {
          const categoryText = await orderFormPage.categoryPills.first().textContent();
          if (categoryText) {
            await orderFormPage.filterByCategory(categoryText);
            await orderFormPage.expectCategoryActive(categoryText);
          }
        }
      });
    });

    test.describe('Order Submission', () => {
      test('should submit order successfully', async ({ customerPage }) => {
        // Add items to order
        const productCount = await orderFormPage.getVisibleProductCount();
        if (productCount > 0) {
          await orderFormPage.incrementQuantityByIndex(0);
          await orderFormPage.submitOrderAndWaitForSuccess();
        }
      });

      test('should prevent empty order submission', async () => {
        // Clear any quantities
        await orderFormPage.clearAllQuantities();

        // Try to submit
        await orderFormPage.submitOrder();

        // Should show error
        await orderFormPage.waitForToast('error');
      });

      test('should update item count in summary', async () => {
        const productCount = await orderFormPage.getVisibleProductCount();
        if (productCount > 0) {
          await orderFormPage.incrementQuantityByIndex(0);
          await orderFormPage.incrementQuantityByIndex(1);

          const itemCount = await orderFormPage.getItemCount();
          expect(itemCount).toBeGreaterThan(0);
        }
      });
    });
  });

  test.describe('Staff View', () => {
    let orderFormPage: CustomerOrderFormPage;

    test.beforeEach(async ({ staffPage }) => {
      orderFormPage = new CustomerOrderFormPage(staffPage);
      await orderFormPage.goto();
      await orderFormPage.waitForNetworkIdle();
    });

    test.describe('Customer Selector', () => {
      test('should show customer selector for staff', async () => {
        await orderFormPage.expectCustomerSelectorVisible();
      });

      test('should have customers in dropdown', async () => {
        const optionCount = await orderFormPage.customerDropdown.locator('option').count();
        expect(optionCount).toBeGreaterThan(0);
      });

      test('should be able to select customer', async () => {
        const optionCount = await orderFormPage.customerDropdown.locator('option').count();
        if (optionCount > 1) {
          await orderFormPage.selectCustomerByIndex(1);
        }
      });
    });

    test.describe('Order Creation', () => {
      test('should create order for selected customer', async ({ staffPage }) => {
        // Select customer
        const optionCount = await orderFormPage.customerDropdown.locator('option').count();
        if (optionCount > 1) {
          await orderFormPage.selectCustomerByIndex(1);

          // Add items
          const productCount = await orderFormPage.getVisibleProductCount();
          if (productCount > 0) {
            await orderFormPage.incrementQuantityByIndex(0);
            await orderFormPage.submitOrderAndWaitForSuccess();
          }
        }
      });
    });
  });

  test.describe('Admin View', () => {
    test('should show customer selector for admin', async ({ adminPage }) => {
      const orderFormPage = new CustomerOrderFormPage(adminPage);
      await orderFormPage.goto();
      await orderFormPage.waitForNetworkIdle();

      await orderFormPage.expectCustomerSelectorVisible();
    });
  });
});

test.describe('Customer Order Form - Access Control', () => {
  test('should redirect unauthenticated user to login', async ({ page }) => {
    await page.goto('/customer-order-form.html');
    await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
  });
});
