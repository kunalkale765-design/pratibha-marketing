/**
 * Page Initialization
 *
 * Common setup tasks that every page needs:
 * - Service Worker registration
 * - Logout functionality
 * - Modal escape key handling
 * - Global error handling
 */

import { setupModalCloseOnEscape } from './ui.js';
import { getCsrfToken, ensureCsrfToken } from './csrf.js';

/* ===================
   GLOBAL ERROR HANDLERS
   =================== */

// Catch uncaught errors silently (prevent browser error dialogs)
window.onerror = function (message, source, lineno, colno, _error) {
  console.error('Uncaught error:', message, 'at', source, lineno, colno);
  return true; // Prevents the browser's default error handling
};

// Catch unhandled promise rejections silently
window.addEventListener('unhandledrejection', function (event) {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevents the browser's default handling
});

/* ===================
   SERVICE WORKER
   =================== */

/**
 * Register the Service Worker for PWA support
 */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registered:', registration.scope);
        })
        .catch(error => {
          console.log('ServiceWorker registration failed:', error);
        });
    });

    // Listen for SW update notifications
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        // Dynamically import to avoid circular dependency at module load
        import('./ui.js').then(({ showToast }) => {
          showToast('Update available — refresh to apply', 'info');
        }).catch(() => {
          // Fallback if ui.js import fails
          console.log('App update available. Refresh to apply.');
        });
      }
    });
  }
}

/* ===================
   LOGOUT
   =================== */

/**
 * Logout the user
 * Delegates to Auth.logout() if available, otherwise performs direct logout
 */
export async function logout() {
  if (window.Auth && typeof window.Auth.logout === 'function') {
    return window.Auth.logout();
  }

  // Fallback: direct logout if Auth not loaded
  localStorage.removeItem('user');

  const headers = { 'Content-Type': 'application/json' };
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers,
      credentials: 'include'
    });
  } catch (error) {
    console.error('Logout error:', error);
  }

  window.location.href = '/pages/auth/login.html';
}

/**
 * Setup logout button click handler
 * Looks for elements with data-logout attribute or class "logout-btn"
 */
export function setupLogoutButton() {
  const logoutBtns = document.querySelectorAll('[data-logout], .logout-btn, #logoutBtn');
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  });
}

/* ===================
   PAGE INITIALIZATION
   =================== */

/**
 * Initialize common page functionality
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.serviceWorker - Register service worker (default: true)
 * @param {boolean} options.logout - Setup logout button (default: true)
 * @param {boolean} options.modalEscape - Close modals on Escape (default: true)
 * @param {boolean} options.csrfPreFetch - Pre-fetch CSRF token (default: true)
 *
 * @example
 * // In your page script:
 * import { initPage } from '/js/init.js';
 * initPage();
 */
export function initPage(options = {}) {
  const {
    serviceWorker = true,
    logout = true,
    modalEscape = true,
    csrfPreFetch = true
  } = options;

  // Pre-fetch CSRF token to ensure it's ready before form submissions
  if (csrfPreFetch) {
    ensureCsrfToken().catch(err => console.warn('CSRF pre-fetch failed:', err));
  }

  // Register service worker
  if (serviceWorker) {
    registerServiceWorker();
  }

  // Setup logout button
  if (logout) {
    setupLogoutButton();
  }

  // Setup modal escape key
  if (modalEscape) {
    setupModalCloseOnEscape();
  }
}

/* ===================
   URL HELPERS
   =================== */

/**
 * Redirect to a URL
 */
export function redirect(url) {
  window.location.href = url;
}

/**
 * Get current page name
 */
export function getCurrentPage() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';
  return page;
}
