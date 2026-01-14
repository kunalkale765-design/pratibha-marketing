import { test as base, Page } from '@playwright/test';
import { LoginPage } from '../page-objects/login.page';
import { DashboardPage } from '../page-objects/dashboard.page';
import { OrdersPage } from '../page-objects/orders.page';
import { CustomerManagementPage } from '../page-objects/customer-management.page';
import { ProductsPage } from '../page-objects/products.page';
import { MarketRatesPage } from '../page-objects/market-rates.page';
import { CustomerOrderFormPage } from '../page-objects/customer-order-form.page';
import { SignupPage } from '../page-objects/signup.page';
import { ApiHelper } from '../helpers/api-helper';
import { AUTH_STORAGE_PATHS, TEST_USERS } from '../setup/test-data';

/**
 * Extended test fixtures with page objects and authenticated contexts
 */

// Define custom fixtures
type TestFixtures = {
  // Page objects
  loginPage: LoginPage;
  signupPage: SignupPage;
  dashboardPage: DashboardPage;
  ordersPage: OrdersPage;
  customerManagementPage: CustomerManagementPage;
  productsPage: ProductsPage;
  marketRatesPage: MarketRatesPage;
  customerOrderFormPage: CustomerOrderFormPage;

  // API helper
  apiHelper: ApiHelper;

  // Authenticated pages
  adminPage: Page;
  staffPage: Page;
  customerPage: Page;
};

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<TestFixtures>({
  // Page object fixtures
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  signupPage: async ({ page }, use) => {
    const signupPage = new SignupPage(page);
    await use(signupPage);
  },

  dashboardPage: async ({ page }, use) => {
    const dashboardPage = new DashboardPage(page);
    await use(dashboardPage);
  },

  ordersPage: async ({ page }, use) => {
    const ordersPage = new OrdersPage(page);
    await use(ordersPage);
  },

  customerManagementPage: async ({ page }, use) => {
    const customerManagementPage = new CustomerManagementPage(page);
    await use(customerManagementPage);
  },

  productsPage: async ({ page }, use) => {
    const productsPage = new ProductsPage(page);
    await use(productsPage);
  },

  marketRatesPage: async ({ page }, use) => {
    const marketRatesPage = new MarketRatesPage(page);
    await use(marketRatesPage);
  },

  customerOrderFormPage: async ({ page }, use) => {
    const customerOrderFormPage = new CustomerOrderFormPage(page);
    await use(customerOrderFormPage);
  },

  // API helper
  apiHelper: async ({ request, baseURL }, use) => {
    const apiHelper = new ApiHelper(request, baseURL || 'http://localhost:5000');
    await use(apiHelper);
  },

  // Pre-authenticated admin page
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: AUTH_STORAGE_PATHS.admin
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  // Pre-authenticated staff page
  staffPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: AUTH_STORAGE_PATHS.staff
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  // Pre-authenticated customer page
  customerPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: AUTH_STORAGE_PATHS.customer
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/**
 * Re-export expect from @playwright/test
 */
export { expect } from '@playwright/test';

/**
 * Test annotations for different roles
 */
export const adminTest = test.extend<{}>({
  storageState: AUTH_STORAGE_PATHS.admin
});

export const staffTest = test.extend<{}>({
  storageState: AUTH_STORAGE_PATHS.staff
});

export const customerTest = test.extend<{}>({
  storageState: AUTH_STORAGE_PATHS.customer
});

/**
 * Unauthenticated test (no storage state)
 */
export const unauthenticatedTest = test.extend<{}>({
  storageState: { cookies: [], origins: [] }
});
