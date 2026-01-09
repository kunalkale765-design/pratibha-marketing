/**
 * Page Initialization
 *
 * Common setup tasks that every page needs:
 * - Service Worker registration
 * - Logout functionality
 * - Modal escape key handling
 */

import { setupModalCloseOnEscape } from './ui.js';

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
  }
}

/* ===================
   LOGOUT
   =================== */

/**
 * Get CSRF token from cookie
 */
function getCsrfToken() {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Logout the user
 * Clears localStorage and calls the logout API
 */
export async function logout() {
  // Clear local storage
  localStorage.removeItem('user');

  // Build headers with CSRF token
  const headers = {
    'Content-Type': 'application/json'
  };
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  // Call logout API
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers,
      credentials: 'include'
    });
  } catch (error) {
    console.error('Logout error:', error);
  }

  // Redirect to login
  window.location.href = '/login.html';
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
 *
 * @example
 * // In your page script:
 * import { initPage } from './js/init.js';
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
  if (csrfPreFetch && typeof Auth !== 'undefined' && Auth.ensureCsrfToken) {
    Auth.ensureCsrfToken().catch(err => console.warn('CSRF pre-fetch failed:', err));
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
   AUTH HELPERS
   =================== */

/**
 * Get the current user from localStorage
 */
export function getUser() {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

/**
 * Check if user is logged in
 */
export function isLoggedIn() {
  return !!getUser();
}

/**
 * Check if user has a specific role
 */
export function hasRole(role) {
  const user = getUser();
  return user && user.role === role;
}

/**
 * Check if user is admin or staff
 */
export function isStaff() {
  const user = getUser();
  return user && (user.role === 'admin' || user.role === 'staff');
}

/**
 * Check if user is customer
 */
export function isCustomer() {
  const user = getUser();
  return user && user.role === 'customer';
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
