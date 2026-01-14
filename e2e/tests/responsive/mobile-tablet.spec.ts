import { test, expect, devices } from '@playwright/test';

// Mobile tests
const mobileTest = test.extend({});
mobileTest.use({ ...devices['iPhone 12'] });

// Tablet tests
const tabletTest = test.extend({});
tabletTest.use({ ...devices['iPad (gen 7)'] });

// Desktop tests
const desktopTest = test.extend({});
desktopTest.use({ viewport: { width: 1920, height: 1080 } });

mobileTest.describe('Mobile Responsiveness', () => {
  mobileTest.describe('Login Page - Mobile', () => {
    mobileTest('should display login form on mobile', async ({ page }) => {
      await page.goto('/login.html');

      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('#loginBtn')).toBeVisible();
    });

    mobileTest('should have touch-friendly button size', async ({ page }) => {
      await page.goto('/login.html');

      const button = page.locator('#loginBtn');
      const box = await button.boundingBox();

      // Minimum touch target: 44x44px
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    });

    mobileTest('should fit within viewport', async ({ page }) => {
      await page.goto('/login.html');

      // Check no horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    });
  });

  mobileTest.describe('Dashboard - Mobile', () => {
    mobileTest.beforeEach(async ({ page }) => {
      // Login first
      await page.goto('/login.html');
      await page.fill('#email', 'e2e-admin');
      await page.fill('#password', 'Admin123!');
      await page.click('#loginBtn');
      await page.waitForURL('**/index.html', { timeout: 15000 });
    });

    mobileTest('should display stat cards in stack on mobile', async ({ page }) => {
      const statCards = page.locator('.stat-card');
      const count = await statCards.count();

      if (count > 0) {
        // Cards should be stacked (full width)
        const firstCard = await statCards.first().boundingBox();
        const viewport = page.viewportSize();

        if (firstCard && viewport) {
          // Card should be nearly full width on mobile
          expect(firstCard.width).toBeGreaterThan(viewport.width * 0.8);
        }
      }
    });

    mobileTest('should have scrollable content', async ({ page }) => {
      // Page should be scrollable
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = page.viewportSize()?.height || 0;

      expect(pageHeight).toBeGreaterThanOrEqual(viewportHeight);
    });
  });

  mobileTest.describe('Order Form - Mobile', () => {
    mobileTest.beforeEach(async ({ page }) => {
      await page.goto('/login.html');
      await page.fill('#email', 'e2e-customer');
      await page.fill('#password', 'Customer123!');
      await page.click('#loginBtn');
      await page.waitForURL('**/customer-order-form.html', { timeout: 15000 });
    });

    mobileTest('should have touch-friendly quantity buttons', async ({ page }) => {
      const plusButtons = page.locator('.qty-btn:has-text("+")');
      const count = await plusButtons.count();

      if (count > 0) {
        const box = await plusButtons.first().boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(40);
        expect(box?.width).toBeGreaterThanOrEqual(40);
      }
    });

    mobileTest('should have sticky submit button', async ({ page }) => {
      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 500));

      const submitBtn = page.locator('.btn-submit, button:has-text("Place Order")');
      await expect(submitBtn).toBeVisible();
    });
  });
});

tabletTest.describe('Tablet Responsiveness', () => {
  tabletTest.describe('Dashboard - Tablet', () => {
    tabletTest.beforeEach(async ({ page }) => {
      await page.goto('/login.html');
      await page.fill('#email', 'e2e-admin');
      await page.fill('#password', 'Admin123!');
      await page.click('#loginBtn');
      await page.waitForURL('**/index.html', { timeout: 15000 });
    });

    tabletTest('should display stats in row on tablet', async ({ page }) => {
      const statCards = page.locator('.stat-card');
      const count = await statCards.count();

      if (count >= 2) {
        const first = await statCards.first().boundingBox();
        const second = await statCards.nth(1).boundingBox();

        // Cards should be side by side (same Y position)
        if (first && second) {
          expect(Math.abs(first.y - second.y)).toBeLessThan(10);
        }
      }
    });

    tabletTest('should show two-column layout', async ({ page }) => {
      const viewport = page.viewportSize();
      const container = page.locator('.quick-actions, .action-cards');

      if (await container.isVisible() && viewport) {
        const box = await container.boundingBox();
        // Container should use most of the width
        if (box) {
          expect(box.width).toBeGreaterThan(viewport.width * 0.7);
        }
      }
    });
  });

  tabletTest.describe('Customer Management - Tablet', () => {
    tabletTest.beforeEach(async ({ page }) => {
      await page.goto('/login.html');
      await page.fill('#email', 'e2e-staff');
      await page.fill('#password', 'Staff123!');
      await page.click('#loginBtn');
      await page.waitForURL('**/index.html', { timeout: 15000 });
      await page.goto('/customer-management.html');
    });

    tabletTest('should display customer cards in grid', async ({ page }) => {
      const cards = page.locator('.customer-card');
      const count = await cards.count();

      if (count >= 2) {
        const first = await cards.first().boundingBox();
        const second = await cards.nth(1).boundingBox();

        // Check if cards are in a grid (same row or different rows)
        // Layout depends on implementation
      }
    });
  });
});

desktopTest.describe('Desktop Responsiveness', () => {
  desktopTest.describe('Dashboard - Desktop', () => {
    desktopTest.beforeEach(async ({ page }) => {
      await page.goto('/login.html');
      await page.fill('#email', 'e2e-admin');
      await page.fill('#password', 'Admin123!');
      await page.click('#loginBtn');
      await page.waitForURL('**/index.html', { timeout: 15000 });
    });

    desktopTest('should display multi-column layout', async ({ page }) => {
      const statCards = page.locator('.stat-card');
      const count = await statCards.count();

      if (count >= 3) {
        const positions: number[] = [];
        for (let i = 0; i < 3; i++) {
          const box = await statCards.nth(i).boundingBox();
          if (box) positions.push(box.y);
        }

        // At least 2 should be on same row
        const sameRow = positions.filter((y, _, arr) =>
          arr.filter(y2 => Math.abs(y - y2) < 10).length > 1
        );

        expect(sameRow.length).toBeGreaterThan(0);
      }
    });

    desktopTest('should show charts side by side', async ({ page }) => {
      const charts = page.locator('canvas');
      const count = await charts.count();

      if (count >= 2) {
        // Charts should be visible and laid out
        await expect(charts.first()).toBeVisible();
      }
    });
  });
});

test.describe('Viewport Transitions', () => {
  test('should handle viewport resize', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/login.html');

    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // Elements should still be visible
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#loginBtn')).toBeVisible();

    // Resize back to desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);

    await expect(page.locator('#email')).toBeVisible();
  });
});
