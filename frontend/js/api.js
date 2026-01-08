/**
 * API Module for Pratibha Marketing
 * Centralized fetch wrapper with error handling and offline detection
 */

const API = {
    /**
     * Make an API request
     * @param {string} endpoint - API endpoint (e.g., '/api/products')
     * @param {Object} options - Fetch options
     * @returns {Promise<{success: boolean, data?: any, error?: string, status?: number}>}
     */
    async request(endpoint, options = {}) {
        // Default options
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const fetchOptions = { ...defaultOptions, ...options };

        // Don't set Content-Type for FormData
        if (options.body instanceof FormData) {
            delete fetchOptions.headers['Content-Type'];
        }

        try {
            // Check if online
            if (!navigator.onLine) {
                return {
                    success: false,
                    error: 'No internet connection. Please check your network.',
                    offline: true
                };
            }

            const response = await fetch(endpoint, fetchOptions);
            const data = await response.json().catch(() => null);

            if (response.ok) {
                return { success: true, data, status: response.status };
            }

            // Handle specific error codes
            if (response.status === 401) {
                // Unauthorized - clear auth and redirect
                if (typeof Auth !== 'undefined') {
                    Auth.clearAuth();
                }
                window.location.href = '/login.html';
                return { success: false, error: 'Session expired. Please login again.', status: 401 };
            }

            if (response.status === 403) {
                return { success: false, error: 'Access denied. You do not have permission.', status: 403 };
            }

            if (response.status === 404) {
                return { success: false, error: 'Resource not found.', status: 404 };
            }

            if (response.status === 429) {
                return { success: false, error: 'Too many requests. Please try again later.', status: 429 };
            }

            // Generic error
            const errorMessage = data?.message || data?.error || 'Something went wrong';
            return { success: false, error: errorMessage, status: response.status, data };

        } catch (error) {
            console.error('API request failed:', error);

            if (!navigator.onLine) {
                return {
                    success: false,
                    error: 'No internet connection.',
                    offline: true
                };
            }

            return {
                success: false,
                error: 'Network error. Please check your connection and try again.'
            };
        }
    },

    /**
     * GET request
     * @param {string} endpoint
     * @returns {Promise}
     */
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    /**
     * POST request
     * @param {string} endpoint
     * @param {Object} body
     * @returns {Promise}
     */
    async post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    /**
     * PUT request
     * @param {string} endpoint
     * @param {Object} body
     * @returns {Promise}
     */
    async put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    /**
     * DELETE request
     * @param {string} endpoint
     * @returns {Promise}
     */
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },

    // Convenience methods for common endpoints

    /**
     * Get all products
     */
    async getProducts() {
        return this.get('/api/products');
    },

    /**
     * Get all customers
     */
    async getCustomers() {
        return this.get('/api/customers');
    },

    /**
     * Get orders with optional filters
     * @param {Object} filters - { status, paymentStatus, limit }
     */
    async getOrders(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        return this.get(`/api/orders${params ? '?' + params : ''}`);
    },

    /**
     * Get market rates
     */
    async getMarketRates() {
        return this.get('/api/market-rates');
    },

    /**
     * Get supplier quantity summary
     */
    async getQuantitySummary() {
        return this.get('/api/supplier/quantity-summary');
    },

    /**
     * Create a new order
     * @param {Object} orderData
     */
    async createOrder(orderData) {
        return this.post('/api/orders', orderData);
    },

    /**
     * Update order status
     * @param {string} orderId
     * @param {string} status
     */
    async updateOrderStatus(orderId, status) {
        return this.put(`/api/orders/${orderId}/status`, { status });
    },

    /**
     * Update market rate
     * @param {Object} rateData
     */
    async updateMarketRate(rateData) {
        return this.post('/api/market-rates', rateData);
    }
};

// Offline/Online event handlers
window.addEventListener('online', () => {
    console.log('Connection restored');
    // Optionally show a notification
    if (typeof showSuccess === 'function') {
        showSuccess('Connection restored');
    }
});

window.addEventListener('offline', () => {
    console.log('Connection lost');
    // Optionally show a notification
    if (typeof showError === 'function') {
        showError('No internet connection');
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}
