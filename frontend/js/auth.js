/**
 * Authentication Module for Pratibha Marketing
 * Handles login state, token management, and auth redirects
 */

const Auth = {
    // Storage keys
    USER_KEY: 'user',

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
     * @param {Object} user
     */
    setUser(user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
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
                this.clearAuth();
                return null;
            }
        } catch (error) {
            console.error('Auth verification failed:', error);
            return null;
        }
    },

    /**
     * Login user
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
     */
    async login(email, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.setUser(data.user);
                return { success: true, user: data.user };
            } else {
                return { success: false, error: data.message || 'Login failed' };
            }
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
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearAuth();
            window.location.href = '/login.html';
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
            window.location.href = '/login.html';
            return null;
        }

        if (allowedRoles && !allowedRoles.includes(user.role)) {
            // Redirect based on role
            if (user.role === 'customer') {
                window.location.href = '/customer-order-form.html';
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
                window.location.href = '/customer-order-form.html';
            } else {
                window.location.href = '/';
            }
            return true;
        }
        return false;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Auth;
}
