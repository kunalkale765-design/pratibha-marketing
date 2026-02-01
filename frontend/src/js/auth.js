/**
 * Authentication Module for Pratibha Marketing
 * Handles login state, token management, and auth redirects
 */

// Import CSRF functions from shared module (single source of truth)
import { getCsrfToken, refreshCsrfToken, ensureCsrfToken } from './csrf.js';

const Auth = {
    // Storage keys
    USER_KEY: 'user',

    // Re-export CSRF functions for backwards compatibility
    getCsrfToken,
    refreshCsrfToken,
    ensureCsrfToken,

    /**
     * Check if user is logged in
     * @returns {boolean}
     */
    isLoggedIn() {
        return !!this.getUser();
    },

    /**
     * Get stored user data
     * @returns {Object|null}
     */
    getUser() {
        try {
            const user = localStorage.getItem(this.USER_KEY);
            return user ? JSON.parse(user) : null;
        } catch (e) {
            console.error('Error parsing user data:', e);
            return null;
        }
    },

    /**
     * Store user data after login
     * Only stores essential fields to minimize exposure in localStorage
     * SECURITY: Never store prices in localStorage - customers should not see pricing
     * @param {Object} user
     */
    setUser(user) {
        // Only store essential data - exclude sensitive info
        // For contract customers, store only allowed product IDs (not prices)
        // Prices are calculated server-side; customers should never see them
        const safeUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            customer: user.customer ? {
                _id: user.customer._id,
                name: user.customer.name,
                pricingType: user.customer.pricingType,
                // Use allowedProducts from backend (IDs only, no prices)
                ...(user.customer.allowedProducts
                    ? { allowedProducts: user.customer.allowedProducts }
                    : {})
            } : null,
            isMagicLink: user.isMagicLink || false
        };
        localStorage.setItem(this.USER_KEY, JSON.stringify(safeUser));
    },

    /**
     * Clear all auth data (logout) and purge service worker cache
     */
    clearAuth() {
        localStorage.removeItem(this.USER_KEY);
        // Notify service worker to purge cached pages (prevents cross-user data leaks)
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage('logout');
        }
        // Also clear caches directly as a fallback (SW message may not be processed before redirect)
        if ('caches' in window) {
            caches.keys().then(names => names.forEach(name => caches.delete(name)))
                .catch(err => {
                    console.warn('Failed to clear caches during logout — stale data may persist:', err.message || err);
                });
        }
    },

    /**
     * Get user role
     * @returns {string|null}
     */
    getRole() {
        const user = this.getUser();
        return user ? user.role : null;
    },

    /**
     * Check if user has admin or staff role
     * @returns {boolean}
     */
    isStaff() {
        const role = this.getRole();
        return role === 'admin' || role === 'staff';
    },

    /**
     * Check if user is a customer
     * @returns {boolean}
     */
    isCustomer() {
        return this.getRole() === 'customer';
    },

    /**
     * Verify authentication with server
     * @returns {Promise<Object|null>}
     */
    async verify() {
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                this.setUser(data.user);
                return data.user;
            } else {
                // Server responded with auth error - clear local auth
                this.clearAuth();
                return null;
            }
        } catch (error) {
            console.error('Auth verification failed:', error);
            // Only use cached user if truly offline
            if (!navigator.onLine) {
                console.warn('Offline - using cached user');
                return this.getUser();
            }
            // Any other error (network timeout, server down, etc.) - clear auth
            this.clearAuth();
            return null;
        }
    },

    /**
     * Login user
     * @param {string} email
     * @param {string} password
     * @param {boolean} _isRetry - Internal flag for CSRF retry
     * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
     */
    async login(email, password, _isRetry = false) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            // Ensure we have a CSRF token before login
            const csrfToken = await this.ensureCsrfToken();
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            }

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.setUser(data.user);
                return { success: true, user: data.user };
            }

            // Check if CSRF error and retry once
            if (response.status === 403 && data?.message?.toLowerCase().includes('csrf') && !_isRetry) {
                console.log('CSRF token error during login, refreshing and retrying...');
                await this.refreshCsrfToken();
                return this.login(email, password, true);
            }

            return { success: false, error: data.message || 'Login failed' };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error. Please try again.' };
        }
    },

    /**
     * Logout user
     * @returns {Promise<void>}
     */
    async logout() {
        try {
            const headers = {};
            // Ensure we have a CSRF token before logout
            const csrfToken = await this.ensureCsrfToken();
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            }

            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                headers,
                credentials: 'include'
            });
            if (!response.ok) {
                console.warn('Server-side logout returned error:', response.status);
            }
        } catch (error) {
            console.error('Logout error:', error);
            // Warn about potential server session remaining active
            console.warn('Server-side session may still be active due to:', error.message);
        } finally {
            // Always clear local auth and redirect regardless of server response
            this.clearAuth();
            window.location.href = '/pages/auth/login.html';
        }
    },

    /**
     * Require authentication - redirects to login if not authenticated
     * @param {Array<string>} allowedRoles - Optional: roles allowed to access
     * @returns {Promise<Object|null>}
     */
    async requireAuth(allowedRoles = null) {
        const user = await this.verify();

        if (!user) {
            window.location.href = '/pages/auth/login.html';
            return null;
        }

        if (allowedRoles && !allowedRoles.includes(user.role)) {
            // Redirect based on role
            if (user.role === 'customer') {
                window.location.href = '/pages/order-form/';
            } else if (user.role === 'staff') {
                window.location.href = '/pages/staff-dashboard/';
            } else {
                window.location.href = '/';
            }
            return null;
        }

        return user;
    },

    /**
     * Redirect if already logged in
     * @returns {Promise<boolean>} - true if redirected
     */
    async redirectIfLoggedIn() {
        const user = await this.verify();
        if (user) {
            if (user.role === 'customer') {
                window.location.href = '/pages/order-form/';
            } else if (user.role === 'staff') {
                window.location.href = '/pages/staff-dashboard/';
            } else {
                window.location.href = '/';
            }
            return true;
        }
        return false;
    }
};

// Make Auth globally available for browser use
if (typeof window !== 'undefined') {
    window.Auth = Auth;

    // Global fetch interceptor: catch 401 responses from ANY fetch call
    // This is the safety net — even if a page script forgets to handle 401,
    // the user will be redirected to login instead of seeing "data not available"
    const _originalFetch = window.fetch;
    let _redirecting = false;
    window.fetch = async function (...args) {
        // Note: _originalFetch may reject on network errors. We intentionally
        // do NOT catch here — rejections must propagate to callers unchanged.
        // Only successful responses are intercepted for 401 handling below.
        const response = await _originalFetch.apply(this, args);
        if (response.status === 401 && !_redirecting) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
            // Only intercept API calls (not external fetches)
            // Exclude /api/auth/me — it's used to *check* auth status, and 401 is
            // an expected response handled by callers (login checkAuth, Auth.verify)
            const isAuthCheck = url.includes('/api/auth/me');
            if (!isAuthCheck && (url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/'))) {
                _redirecting = true;
                Auth.clearAuth();
                window.location.href = '/pages/auth/login.html';
            }
        }
        return response;
    };
}

// Export for use in other modules
export default Auth;

