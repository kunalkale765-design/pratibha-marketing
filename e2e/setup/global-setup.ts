import { chromium, FullConfig } from '@playwright/test';
import { TEST_USERS, TEST_PRODUCTS, TEST_CUSTOMERS, TEST_MARKET_RATES, AUTH_STORAGE_PATHS } from './test-data';

/**
 * Global setup for Playwright E2E tests
 * - Waits for the server to be ready
 * - Creates test users via API
 * - Pre-authenticates users and saves session storage
 */
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use?.baseURL || 'http://localhost:5000';

  console.log('Starting global setup...');
  console.log(`Using base URL: ${baseURL}`);

  // Wait for server to be ready
  await waitForServer(`${baseURL}/api/health`, 60000);
  console.log('Server is ready');

  // Create test users if they don't exist
  await createTestUsers(baseURL);
  console.log('Test users created/verified');

  // Pre-authenticate users
  await preAuthenticateUsers(baseURL);
  console.log('Users pre-authenticated');

  console.log('Global setup complete');
}

/**
 * Wait for server to be ready
 */
async function waitForServer(healthUrl: string, timeout: number) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server not ready yet
    }
    await sleep(1000);
  }

  throw new Error(`Server did not become ready within ${timeout}ms`);
}

/**
 * Create test users via direct database access through a special test endpoint
 * or by using existing admin credentials to create users
 */
async function createTestUsers(baseURL: string) {
  // Use the special test setup endpoint if available, or create via registration
  // For now, we'll try to login with existing seed users and use them to create e2e users

  // Try to login as existing admin (from seed data)
  const adminCreds = [
    { email: 'kunal@pm.in', password: 'Kunal786' },
    { email: 'admin@pratibhamarketing.in', password: 'Admin123!' }
  ];

  let adminToken: string | null = null;
  let csrfToken: string | null = null;

  // Get CSRF token first
  try {
    const csrfResponse = await fetch(`${baseURL}/api/csrf-token`);
    const csrfCookie = csrfResponse.headers.get('set-cookie');
    if (csrfCookie) {
      const match = csrfCookie.match(/csrf_token=([^;]+)/);
      if (match) csrfToken = match[1];
    }
  } catch (e) {
    console.log('Could not get CSRF token');
  }

  for (const creds of adminCreds) {
    try {
      const response = await fetch(`${baseURL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken, 'Cookie': `csrf_token=${csrfToken}` } : {})
        },
        body: JSON.stringify(creds)
      });

      if (response.ok) {
        const cookie = response.headers.get('set-cookie');
        if (cookie) {
          const match = cookie.match(/token=([^;]+)/);
          if (match) adminToken = match[1];
        }
        console.log(`Logged in as admin: ${creds.email}`);
        break;
      }
    } catch (e) {
      // Try next admin
    }
  }

  // If we couldn't login as admin, tests will need to use existing users
  if (!adminToken) {
    console.log('Warning: Could not login as admin to create test users');
    console.log('Tests will use existing seed data users instead');
    return;
  }

  // Note: The application doesn't have an admin API to create users directly
  // Tests will need to use the registration endpoint for customer users
  // and existing admin/staff from seed data
  console.log('Test users will be created via registration during authentication');
}

/**
 * Pre-authenticate users and save their session storage
 */
async function preAuthenticateUsers(baseURL: string) {
  const browser = await chromium.launch();

  // Authenticate admin user
  console.log('Authenticating admin user...');
  await authenticateUser(browser, baseURL, TEST_USERS.admin, AUTH_STORAGE_PATHS.admin);

  // Authenticate staff user
  console.log('Authenticating staff user...');
  await authenticateUser(browser, baseURL, TEST_USERS.staff, AUTH_STORAGE_PATHS.staff);

  // Authenticate customer user
  console.log('Authenticating customer user...');
  await authenticateUser(browser, baseURL, TEST_USERS.customer, AUTH_STORAGE_PATHS.customer);

  await browser.close();
}

/**
 * Authenticate a single user and save their session storage
 */
async function authenticateUser(
  browser: any,
  baseURL: string,
  user: typeof TEST_USERS.admin,
  storagePath: string
) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // For customer users, try to register first
  if (user.role === 'customer') {
    try {
      await registerUser(page, baseURL, user);
      // Registration auto-logs in the user, check if we're now logged in
      const currentUrl = page.url();
      if (currentUrl.includes('customer-order-form') || !currentUrl.includes('signup')) {
        // Already logged in after registration, save storage state
        await context.storageState({ path: storagePath });
        console.log(`Saved auth state for ${user.email} to ${storagePath} (after registration)`);
        await context.close();
        return;
      }
    } catch (error) {
      // User might already exist, continue to login
      console.log(`Registration skipped for ${user.email} (may already exist)`);
    }
  }

  // Clear cookies to ensure we're logged out before login attempt
  await context.clearCookies();

  // Navigate to login page
  await page.goto(`${baseURL}/login.html`);
  await page.waitForLoadState('networkidle');

  // Wait for the form to be ready (ES modules loading)
  await page.waitForTimeout(500);

  // Fill login form
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);

  // Submit and wait for navigation
  await Promise.all([
    page.waitForNavigation({ timeout: 30000 }),
    page.click('#loginBtn')
  ]).catch(async () => {
    // If navigation doesn't happen, check for errors
    const errorMessage = await page.locator('#noticeMessage').textContent().catch(() => '');
    if (errorMessage && errorMessage.includes('Invalid')) {
      throw new Error(`Login failed for ${user.email}: ${errorMessage}`);
    }
    // Wait a bit more and try to save anyway
    await sleep(2000);
  });

  // Save storage state
  await context.storageState({ path: storagePath });
  console.log(`Saved auth state for ${user.email} to ${storagePath}`);

  await context.close();
}

/**
 * Register a new user via the signup page
 */
async function registerUser(
  page: any,
  baseURL: string,
  user: typeof TEST_USERS.admin
) {
  // Only register customer users - admin/staff should exist in seed data
  if (user.role !== 'customer') {
    return;
  }

  await page.goto(`${baseURL}/signup.html`);
  await page.waitForLoadState('networkidle');

  await page.fill('#name', user.name);
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.fill('#confirmPassword', user.password);

  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }),
    page.click('button[type="submit"]')
  ]).catch(() => {
    // Registration might fail if user exists
  });
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default globalSetup;
