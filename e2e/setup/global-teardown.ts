import { FullConfig } from '@playwright/test';

/**
 * Global teardown for Playwright E2E tests
 * Cleanup any resources created during tests
 */
async function globalTeardown(config: FullConfig) {
  console.log('Running global teardown...');

  // The webServer option in playwright.config.ts will automatically
  // stop the server if it was started by Playwright

  // Add any additional cleanup here if needed:
  // - Remove test data from database
  // - Clean up uploaded files
  // - Clear caches

  console.log('Global teardown complete');
}

export default globalTeardown;
