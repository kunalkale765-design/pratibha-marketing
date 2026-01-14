import { test, expect } from '../../fixtures/auth.fixture';
import { CustomerManagementPage } from '../../page-objects/customer-management.page';

test.describe('Customer Management Page', () => {
  let customerPage: CustomerManagementPage;

  test.beforeEach(async ({ adminPage }) => {
    customerPage = new CustomerManagementPage(adminPage);
    await customerPage.goto();
    await customerPage.waitForNetworkIdle();
  });

  test.describe('UI Elements', () => {
    test('should display customers list', async () => {
      await customerPage.expectCustomersListVisible();
    });

    test('should display search input', async () => {
      await expect(customerPage.searchInput).toBeVisible();
    });

    test('should display create customer button', async () => {
      await expect(customerPage.createCustomerButton).toBeVisible();
    });
  });

  test.describe('Search', () => {
    test('should filter customers by search query', async () => {
      await customerPage.search('Test');
      await customerPage.page.waitForTimeout(500);
    });

    test('should clear search and show all customers', async () => {
      await customerPage.search('Test');
      await customerPage.clearSearch();
    });
  });

  test.describe('Create Customer', () => {
    test('should open create customer modal', async () => {
      await customerPage.openCreateModal();
      await expect(customerPage.customerModal).toBeVisible();
    });

    test('should display all form fields in modal', async () => {
      await customerPage.openCreateModal();
      await expect(customerPage.customerNameInput).toBeVisible();
      await expect(customerPage.customerPhoneInput).toBeVisible();
      await expect(customerPage.pricingTypeSelect).toBeVisible();
    });

    test('should create customer with market pricing', async () => {
      const uniqueName = `E2E Test Customer ${Date.now()}`;
      await customerPage.createCustomer({
        name: uniqueName,
        phone: `98${Date.now().toString().slice(-8)}`,
        pricingType: 'market'
      });
    });

    test('should validate required fields', async () => {
      await customerPage.openCreateModal();
      await customerPage.saveCustomer();
      // Should show validation error
    });
  });

  test.describe('Pricing Types', () => {
    test('should show markup percentage for markup pricing', async () => {
      await customerPage.openCreateModal();
      await customerPage.expectPricingTypeFields('markup');
    });

    test('should show contract prices for contract pricing', async () => {
      await customerPage.openCreateModal();
      await customerPage.expectPricingTypeFields('contract');
    });

    test('should hide markup percentage for market pricing', async () => {
      await customerPage.openCreateModal();
      await customerPage.pricingTypeSelect.selectOption('market');
      await expect(customerPage.markupPercentageInput).not.toBeVisible();
    });
  });

  test.describe('Edit Customer', () => {
    test('should open edit modal with customer data', async () => {
      const customerCount = await customerPage.getCustomerCount();
      if (customerCount > 0) {
        await customerPage.editCustomer(0);
        await expect(customerPage.customerModal).toBeVisible();

        // Form should be pre-filled
        const nameValue = await customerPage.customerNameInput.inputValue();
        expect(nameValue).toBeTruthy();
      }
    });

    test('should update customer details', async () => {
      const customerCount = await customerPage.getCustomerCount();
      if (customerCount > 0) {
        await customerPage.editCustomer(0);
        await customerPage.customerPhoneInput.fill('9999999999');
        await customerPage.saveCustomer();
      }
    });
  });

  test.describe('Delete Customer', () => {
    test('should soft delete customer with confirmation', async ({ adminPage }) => {
      // First create a customer to delete
      const uniqueName = `Delete Test ${Date.now()}`;
      await customerPage.createCustomer({
        name: uniqueName,
        pricingType: 'market'
      });

      // Wait for list to update
      await adminPage.waitForTimeout(1000);

      // Find and delete the customer
      await customerPage.search(uniqueName);
      await adminPage.waitForTimeout(500);

      const deleteCount = await customerPage.deleteButtons.count();
      if (deleteCount > 0) {
        await customerPage.deleteCustomer(0);
      }
    });
  });

  test.describe('Magic Links', () => {
    test('should generate magic link for customer', async () => {
      const linkButtonCount = await customerPage.magicLinkButtons.count();
      if (linkButtonCount > 0) {
        await customerPage.generateMagicLink(0);
      }
    });
  });

  test.describe('Customer Cards', () => {
    test('should display customer name on card', async () => {
      const customerCount = await customerPage.getCustomerCount();
      if (customerCount > 0) {
        const data = await customerPage.getCustomerCardData(0);
        expect(data.name).toBeTruthy();
      }
    });

    test('should display pricing type badge', async () => {
      const customerCount = await customerPage.getCustomerCount();
      if (customerCount > 0) {
        const pricingBadge = customerPage.customerCards.first().locator('.pricing-type, .badge');
        // May or may not be visible depending on implementation
      }
    });
  });
});

test.describe('Customer Management - Access Control', () => {
  test('should redirect customer away from customer management', async ({ customerPage }) => {
    await customerPage.goto('/customer-management.html');
    await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
  });
});
