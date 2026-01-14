import { test, expect } from '../../fixtures/auth.fixture';

test.describe('Role-Based Redirects', () => {
  test.describe('Admin Role', () => {
    test('should allow admin to access dashboard', async ({ adminPage }) => {
      await adminPage.goto('/index.html');
      await expect(adminPage).toHaveURL(/index\.html/);
    });

    test('should allow admin to access orders page', async ({ adminPage }) => {
      await adminPage.goto('/orders.html');
      await expect(adminPage).toHaveURL(/orders\.html/);
    });

    test('should allow admin to access customer management', async ({ adminPage }) => {
      await adminPage.goto('/customer-management.html');
      await expect(adminPage).toHaveURL(/customer-management\.html/);
    });

    test('should allow admin to access products page', async ({ adminPage }) => {
      await adminPage.goto('/products.html');
      await expect(adminPage).toHaveURL(/products\.html/);
    });

    test('should allow admin to access market rates', async ({ adminPage }) => {
      await adminPage.goto('/market-rates.html');
      await expect(adminPage).toHaveURL(/market-rates\.html/);
    });

    test('should allow admin to access customer order form', async ({ adminPage }) => {
      await adminPage.goto('/customer-order-form.html');
      await expect(adminPage).toHaveURL(/customer-order-form\.html/);
    });
  });

  test.describe('Staff Role', () => {
    test('should allow staff to access dashboard', async ({ staffPage }) => {
      await staffPage.goto('/index.html');
      await expect(staffPage).toHaveURL(/index\.html/);
    });

    test('should allow staff to access orders page', async ({ staffPage }) => {
      await staffPage.goto('/orders.html');
      await expect(staffPage).toHaveURL(/orders\.html/);
    });

    test('should allow staff to access customer management', async ({ staffPage }) => {
      await staffPage.goto('/customer-management.html');
      await expect(staffPage).toHaveURL(/customer-management\.html/);
    });

    test('should allow staff to access products page', async ({ staffPage }) => {
      await staffPage.goto('/products.html');
      await expect(staffPage).toHaveURL(/products\.html/);
    });

    test('should allow staff to access market rates', async ({ staffPage }) => {
      await staffPage.goto('/market-rates.html');
      await expect(staffPage).toHaveURL(/market-rates\.html/);
    });

    test('should allow staff to access customer order form', async ({ staffPage }) => {
      await staffPage.goto('/customer-order-form.html');
      await expect(staffPage).toHaveURL(/customer-order-form\.html/);
    });
  });

  test.describe('Customer Role - Restricted Access', () => {
    test('should redirect customer from dashboard to order form', async ({ customerPage }) => {
      await customerPage.goto('/index.html');
      // Customer should be redirected to order form
      await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
    });

    test('should redirect customer from orders page to order form', async ({ customerPage }) => {
      await customerPage.goto('/orders.html');
      // Customer should be redirected
      await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
    });

    test('should redirect customer from customer management to order form', async ({ customerPage }) => {
      await customerPage.goto('/customer-management.html');
      // Customer should be redirected
      await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
    });

    test('should redirect customer from products page to order form', async ({ customerPage }) => {
      await customerPage.goto('/products.html');
      // Customer should be redirected
      await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
    });

    test('should redirect customer from market rates to order form', async ({ customerPage }) => {
      await customerPage.goto('/market-rates.html');
      // Customer should be redirected
      await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
    });

    test('should allow customer to access customer order form', async ({ customerPage }) => {
      await customerPage.goto('/customer-order-form.html');
      await expect(customerPage).toHaveURL(/customer-order-form\.html/);
    });
  });

  test.describe('Unauthenticated Access', () => {
    test('should redirect unauthenticated user from dashboard to login', async ({ page }) => {
      await page.goto('/index.html');
      await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
    });

    test('should redirect unauthenticated user from orders to login', async ({ page }) => {
      await page.goto('/orders.html');
      await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
    });

    test('should redirect unauthenticated user from customer management to login', async ({ page }) => {
      await page.goto('/customer-management.html');
      await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
    });

    test('should redirect unauthenticated user from products to login', async ({ page }) => {
      await page.goto('/products.html');
      await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
    });

    test('should redirect unauthenticated user from market rates to login', async ({ page }) => {
      await page.goto('/market-rates.html');
      await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
    });

    test('should redirect unauthenticated user from order form to login', async ({ page }) => {
      await page.goto('/customer-order-form.html');
      await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
    });

    test('should allow unauthenticated user to access login page', async ({ page }) => {
      await page.goto('/login.html');
      await expect(page).toHaveURL(/login\.html/);
    });

    test('should allow unauthenticated user to access signup page', async ({ page }) => {
      await page.goto('/signup.html');
      await expect(page).toHaveURL(/signup\.html/);
    });
  });
});

test.describe('Role-Based UI Elements', () => {
  test('should show customer selector for staff on order form', async ({ staffPage }) => {
    await staffPage.goto('/customer-order-form.html');
    await staffPage.waitForLoadState('networkidle');

    const customerSelector = staffPage.locator('.customer-bar.show, .customer-select');
    await expect(customerSelector).toBeVisible();
  });

  test('should hide customer selector for customer on order form', async ({ customerPage }) => {
    await customerPage.goto('/customer-order-form.html');
    await customerPage.waitForLoadState('networkidle');

    const customerSelector = customerPage.locator('.customer-bar.show');
    // Should not be visible or should not have 'show' class
    const isVisible = await customerSelector.isVisible().catch(() => false);

    if (isVisible) {
      await expect(customerSelector).not.toHaveClass(/show/);
    }
  });
});
