import { test, expect } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../page-objects/login.page';
import { SignupPage } from '../../page-objects/signup.page';
import { CustomerManagementPage } from '../../page-objects/customer-management.page';
import { ProductsPage } from '../../page-objects/products.page';

test.describe('Validation Error Handling', () => {
  test.describe('Login Validation', () => {
    test('should show error for empty credentials', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.submit();
      await loginPage.expectNoticeMessage(/enter|required/i);
    });

    test('should show error for invalid credentials', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.login('wronguser', 'wrongpassword');
      await loginPage.expectNoticeMessage(/invalid/i);
    });
  });

  test.describe('Signup Validation', () => {
    test('should validate password minimum length', async ({ page }) => {
      const signupPage = new SignupPage(page);
      await signupPage.goto();

      await signupPage.fillForm({
        name: 'Test User',
        email: SignupPage.generateUniqueUsername(),
        password: '12345', // Too short
        confirmPassword: '12345'
      });
      await signupPage.submit();

      await signupPage.expectErrorMessage(/password|6|character/i);
    });

    test('should validate username minimum length', async ({ page }) => {
      const signupPage = new SignupPage(page);
      await signupPage.goto();

      await signupPage.fillForm({
        name: 'Test User',
        email: 'ab', // Too short
        password: 'StrongPass123!',
        confirmPassword: 'StrongPass123!'
      });
      await signupPage.submit();

      await signupPage.expectErrorMessage(/username|3|character/i);
    });

    test('should validate password match', async ({ page }) => {
      const signupPage = new SignupPage(page);
      await signupPage.goto();

      await signupPage.fillForm({
        name: 'Test User',
        email: SignupPage.generateUniqueUsername(),
        password: 'StrongPass123!',
        confirmPassword: 'DifferentPass123!'
      });
      await signupPage.submit();

      await signupPage.expectErrorMessage(/match|confirm/i);
    });
  });

  test.describe('Customer Form Validation', () => {
    test('should require customer name', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await customerPage.saveCustomer();

      // Should show validation error
    });

    test('should validate phone format', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await customerPage.customerNameInput.fill('Test Customer');
      await customerPage.customerPhoneInput.fill('12345'); // Invalid
      await customerPage.saveCustomer();

      // Should show validation error or reject
    });
  });

  test.describe('Product Form Validation', () => {
    test('should require product name', async ({ adminPage }) => {
      const productsPage = new ProductsPage(adminPage);
      await productsPage.goto();
      await productsPage.waitForNetworkIdle();

      await productsPage.openCreateModal();
      await productsPage.saveProduct();

      // Should show validation error
    });

    test('should validate unique product name', async ({ adminPage }) => {
      const productsPage = new ProductsPage(adminPage);
      await productsPage.goto();
      await productsPage.waitForNetworkIdle();

      // Create a product
      const uniqueName = `Duplicate Test ${Date.now()}`;
      await productsPage.createProduct({
        name: uniqueName,
        unit: 'kg',
        category: 'Test'
      });

      // Try to create another with same name
      await productsPage.openCreateModal();
      await productsPage.fillProductForm({
        name: uniqueName,
        unit: 'kg',
        category: 'Test'
      });
      await productsPage.saveProduct();

      // Should show duplicate error
    });
  });

  test.describe('API Validation Errors', () => {
    test('should display API validation errors', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      // Intercept API to return validation error
      await adminPage.route('**/api/customers', route => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              message: 'Validation failed',
              errors: [{ field: 'phone', message: 'Invalid phone number' }]
            })
          });
        } else {
          route.continue();
        }
      });

      await customerPage.openCreateModal();
      await customerPage.fillCustomerForm({
        name: 'Test Customer',
        phone: '123'
      });
      await customerPage.saveCustomer();

      // Should show validation error
    });
  });
});
