import { Page, Locator, expect } from '@playwright/test';

/**
 * Wait helpers for common async operations
 */

/**
 * Wait for a condition to be true
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = 10000, interval = 100, message = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`${message} within ${timeout}ms`);
}

/**
 * Wait for element count to equal expected
 */
export async function waitForElementCount(
  locator: Locator,
  count: number,
  timeout = 10000
): Promise<void> {
  await waitForCondition(
    async () => (await locator.count()) === count,
    { timeout, message: `Expected ${count} elements` }
  );
}

/**
 * Wait for element count to be greater than
 */
export async function waitForElementCountGreaterThan(
  locator: Locator,
  count: number,
  timeout = 10000
): Promise<void> {
  await waitForCondition(
    async () => (await locator.count()) > count,
    { timeout, message: `Expected more than ${count} elements` }
  );
}

/**
 * Wait for network idle with custom timeout
 */
export async function waitForNetworkIdle(page: Page, timeout = 10000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Wait for API response
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  options: { timeout?: number; status?: number } = {}
): Promise<any> {
  const { timeout = 10000, status } = options;

  const response = await page.waitForResponse(
    res => {
      const matchesUrl = typeof urlPattern === 'string'
        ? res.url().includes(urlPattern)
        : urlPattern.test(res.url());

      const matchesStatus = status === undefined || res.status() === status;

      return matchesUrl && matchesStatus;
    },
    { timeout }
  );

  return response.json();
}

/**
 * Wait for toast and get its text
 */
export async function waitForToast(page: Page, type?: string): Promise<string> {
  const toast = page.locator('#toast');

  await expect(toast).toBeVisible({ timeout: 10000 });

  if (type) {
    await expect(toast).toHaveClass(new RegExp(`toast-${type}`));
  }

  return (await toast.textContent()) || '';
}

/**
 * Wait for modal to open
 */
export async function waitForModalOpen(page: Page): Promise<void> {
  const modal = page.locator('.modal-overlay');
  await expect(modal).toHaveClass(/show/, { timeout: 5000 });
}

/**
 * Wait for modal to close
 */
export async function waitForModalClose(page: Page): Promise<void> {
  const modal = page.locator('.modal-overlay');
  await expect(modal).not.toHaveClass(/show/, { timeout: 5000 });
}

/**
 * Wait for loading to complete
 */
export async function waitForLoading(page: Page, timeout = 10000): Promise<void> {
  const loadingIndicators = [
    '.skeleton-loading',
    '.loading',
    '.spinner',
    '[data-loading="true"]'
  ];

  for (const selector of loadingIndicators) {
    try {
      const locator = page.locator(selector);
      if ((await locator.count()) > 0) {
        await locator.first().waitFor({ state: 'hidden', timeout });
      }
    } catch {
      // Continue checking other indicators
    }
  }
}

/**
 * Wait for text to appear on page
 */
export async function waitForText(
  page: Page,
  text: string | RegExp,
  timeout = 10000
): Promise<void> {
  if (typeof text === 'string') {
    await page.getByText(text).waitFor({ state: 'visible', timeout });
  } else {
    await page.locator(`text=${text}`).waitFor({ state: 'visible', timeout });
  }
}

/**
 * Wait for URL to match pattern
 */
export async function waitForUrl(
  page: Page,
  pattern: string | RegExp,
  timeout = 10000
): Promise<void> {
  await page.waitForURL(pattern, { timeout });
}

/**
 * Retry a function until it succeeds or times out
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delay?: number; onRetry?: (error: Error, attempt: number) => void } = {}
): Promise<T> {
  const { retries = 3, delay = 1000, onRetry } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries) {
        if (onRetry) {
          onRetry(lastError, attempt);
        }
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce utility for tests
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise((resolve) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        resolve(fn(...args));
      }, delay);
    });
  };
}
