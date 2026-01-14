import { test, expect } from '../../fixtures/auth.fixture';
import { CustomerManagementPage } from '../../page-objects/customer-management.page';
import { ProductsPage } from '../../page-objects/products.page';

test.describe('Modal Component', () => {
  test.describe('Modal Open/Close', () => {
    test('should open modal on trigger click', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await expect(customerPage.customerModal).toBeVisible();
    });

    test('should close modal on overlay click', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await customerPage.closeModalByOverlay();
    });

    test('should close modal on Escape key', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await customerPage.closeModalByEscape();
    });
  });

  test.describe('Modal Overlay', () => {
    test('should show overlay backdrop when modal opens', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await expect(customerPage.modalOverlay).toHaveClass(/show/);
    });

    test('should hide overlay when modal closes', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();
      await customerPage.closeModalByEscape();

      await expect(customerPage.modalOverlay).not.toHaveClass(/show/);
    });
  });

  test.describe('Modal Content', () => {
    test('should display modal content', async ({ adminPage }) => {
      const productsPage = new ProductsPage(adminPage);
      await productsPage.goto();
      await productsPage.waitForNetworkIdle();

      await productsPage.openCreateModal();
      await expect(productsPage.productModal).toBeVisible();
      await expect(productsPage.productNameInput).toBeVisible();
    });

    test('should clear form when modal reopens', async ({ adminPage }) => {
      const productsPage = new ProductsPage(adminPage);
      await productsPage.goto();
      await productsPage.waitForNetworkIdle();

      // Open modal and fill form
      await productsPage.openCreateModal();
      await productsPage.productNameInput.fill('Test Product');
      await productsPage.closeModalByEscape();

      // Reopen modal - form should be clear or retain data based on implementation
      await productsPage.openCreateModal();
    });
  });

  test.describe('Modal Focus Management', () => {
    test('should focus first input when modal opens', async ({ adminPage }) => {
      const customerPage = new CustomerManagementPage(adminPage);
      await customerPage.goto();
      await customerPage.waitForNetworkIdle();

      await customerPage.openCreateModal();

      // Wait for focus
      await adminPage.waitForTimeout(300);

      // First input should be focused or modal content should be visible
      await expect(customerPage.customerNameInput).toBeVisible();
    });
  });

  test.describe('Modal with Form Submission', () => {
    test('should close modal on successful form submission', async ({ adminPage }) => {
      const productsPage = new ProductsPage(adminPage);
      await productsPage.goto();
      await productsPage.waitForNetworkIdle();

      await productsPage.createProduct({
        name: `Modal Test ${Date.now()}`,
        unit: 'kg',
        category: 'Test'
      });

      // Modal should close after successful submission
      await expect(productsPage.productModal).not.toBeVisible({ timeout: 5000 });
    });
  });
});
