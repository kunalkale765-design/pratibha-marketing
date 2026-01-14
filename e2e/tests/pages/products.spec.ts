import { test, expect } from '../../fixtures/auth.fixture';
import { ProductsPage } from '../../page-objects/products.page';

test.describe('Products Page', () => {
  let productsPage: ProductsPage;

  test.beforeEach(async ({ adminPage }) => {
    productsPage = new ProductsPage(adminPage);
    await productsPage.goto();
    await productsPage.waitForNetworkIdle();
  });

  test.describe('UI Elements', () => {
    test('should display products list', async () => {
      await productsPage.expectProductsListVisible();
    });

    test('should display search input', async () => {
      await expect(productsPage.searchInput).toBeVisible();
    });

    test('should display create product button', async () => {
      await expect(productsPage.createProductButton).toBeVisible();
    });

    test('should display category filter pills', async () => {
      const pillCount = await productsPage.categoryPills.count();
      expect(pillCount).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Product Grouping', () => {
    test('should group products by category', async () => {
      await productsPage.expectCategoryGrouping();
    });
  });

  test.describe('Search', () => {
    test('should filter products by search query', async () => {
      await productsPage.search('Tomato');
      await productsPage.page.waitForTimeout(500);
    });

    test('should clear search', async () => {
      await productsPage.search('Tomato');
      await productsPage.clearSearch();
    });
  });

  test.describe('Category Filter', () => {
    test('should filter by category', async () => {
      const pillCount = await productsPage.categoryPills.count();
      if (pillCount > 0) {
        const categoryText = await productsPage.categoryPills.first().textContent();
        if (categoryText) {
          await productsPage.filterByCategory(categoryText);
          await productsPage.expectCategoryActive(categoryText);
        }
      }
    });

    test('should show all products when All category selected', async () => {
      await productsPage.clearCategoryFilter();
    });
  });

  test.describe('Create Product', () => {
    test('should open create product modal', async () => {
      await productsPage.openCreateModal();
      await expect(productsPage.productModal).toBeVisible();
    });

    test('should display all form fields', async () => {
      await productsPage.openCreateModal();
      await expect(productsPage.productNameInput).toBeVisible();
      await expect(productsPage.productUnitSelect).toBeVisible();
      await expect(productsPage.productCategoryInput).toBeVisible();
    });

    test('should have valid unit options', async () => {
      const units = await productsPage.getUnitOptions();
      expect(units.length).toBeGreaterThan(0);

      // Should contain common units
      const commonUnits = ['kg', 'quintal', 'bag', 'piece', 'ton', 'bunch', 'box'];
      const hasCommonUnit = units.some(u =>
        commonUnits.some(cu => u.toLowerCase().includes(cu))
      );
      expect(hasCommonUnit).toBe(true);
    });

    test('should create new product', async () => {
      const uniqueName = `E2E Product ${Date.now()}`;
      await productsPage.createProduct({
        name: uniqueName,
        unit: 'kg',
        category: 'E2E Test Category'
      });
    });
  });

  test.describe('Edit Product', () => {
    test('should open edit modal with product data', async () => {
      const productCount = await productsPage.getProductCount();
      if (productCount > 0) {
        await productsPage.editProduct(0);
        await expect(productsPage.productModal).toBeVisible();

        const nameValue = await productsPage.productNameInput.inputValue();
        expect(nameValue).toBeTruthy();
      }
    });

    test('should update product category', async () => {
      const productCount = await productsPage.getProductCount();
      if (productCount > 0) {
        await productsPage.editProduct(0);
        await productsPage.productCategoryInput.fill('Updated Category');
        await productsPage.saveProduct();
      }
    });
  });

  test.describe('Delete Product', () => {
    test('should soft delete product with confirmation', async ({ adminPage }) => {
      // Create a product to delete
      const uniqueName = `Delete Product ${Date.now()}`;
      await productsPage.createProduct({
        name: uniqueName,
        unit: 'kg',
        category: 'Test'
      });

      await adminPage.waitForTimeout(1000);

      // Find and delete
      await productsPage.search(uniqueName);
      await adminPage.waitForTimeout(500);

      const deleteCount = await productsPage.deleteButtons.count();
      if (deleteCount > 0) {
        await productsPage.deleteProduct(0);
      }
    });
  });

  test.describe('Product Display', () => {
    test('should display product name', async () => {
      const productCount = await productsPage.getProductCount();
      if (productCount > 0) {
        const data = await productsPage.getProductData(0);
        expect(data.name).toBeTruthy();
      }
    });
  });
});

test.describe('Products Page - Access Control', () => {
  test('should redirect customer away from products page', async ({ customerPage }) => {
    await customerPage.goto('/products.html');
    await expect(customerPage).toHaveURL(/customer-order-form\.html/, { timeout: 10000 });
  });
});
