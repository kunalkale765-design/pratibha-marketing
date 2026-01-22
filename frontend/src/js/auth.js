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
                // Store only product IDs for filtering, not actual prices
                ...(user.customer.pricingType === 'contract' && user.customer.contractPrices
                    ? { allowedProducts: Object.keys(user.customer.contractPrices) }
                    : {})
            } : null,
            isMagicLink: user.isMagicLink || false
        };
        localStorage.setItem(this.USER_KEY, JSON.stringify(safeUser));
    },

    /**
     * Clear all auth data (logout)
     */
    clearAuth() {
        localStorage.removeItem(this.USER_KEY);
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
            // Check if this is a network error vs other errors
            if (!navigator.onLine || error.name === 'TypeError' || error.message.includes('network') || error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
                // Network issue - don't clear auth, return cached user if available
                console.warn('Network issue during auth verification - using cached user');
                return this.getUser();
            }
            // Other errors - clear auth to be safe
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
            } else {
                // Staff/admin go to dashboard
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
            } else {
                // Staff/admin go to dashboard
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
}

// Export for use in other modules
export default Auth;

