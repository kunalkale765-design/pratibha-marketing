/**
 * API Module for Pratibha Marketing
 * Centralized fetch wrapper with error handling and offline detection
 */

const API = {
    // Track if we're currently refreshing the CSRF token to avoid multiple concurrent refreshes
    _csrfRefreshPromise: null,

    /**
     * Get CSRF token from cookie
     * @returns {string|null}
     */
    getCsrfToken() {
        const match = document.cookie.match(/csrf_token=([^;]+)/);
        return match ? match[1] : null;
    },

    /**
     * Fetch a fresh CSRF token from the server
     * @returns {Promise<string|null>}
     */
    async refreshCsrfToken() {
        // If already refreshing, wait for that promise
        if (this._csrfRefreshPromise) {
            return this._csrfRefreshPromise;
        }

        this._csrfRefreshPromise = (async () => {
            try {
                const response = await fetch('/api/csrf-token', {
                    credentials: 'include'
                });
                if (response.ok) {
                    const data = await response.json();
                    // The cookie is set by the server, but we return the token too
                    return data.csrfToken || this.getCsrfToken();
                }
            } catch (error) {
                console.error('Failed to refresh CSRF token:', error);
            }
            return null;
        })();

        try {
            return await this._csrfRefreshPromise;
        } finally {
            this._csrfRefreshPromise = null;
        }
    },

    /**
     * Ensure CSRF token is available, fetching if necessary
     * @returns {Promise<string|null>}
     */
    async ensureCsrfToken() {
        let token = this.getCsrfToken();
        if (!token) {
            token = await this.refreshCsrfToken();
        }
        return token;
    },

    /**
     * Make an API request with automatic retry for network failures
     * @param {string} endpoint - API endpoint (e.g., '/api/products')
     * @param {Object} options - Fetch options
     * @param {boolean} _isRetry - Internal flag to prevent infinite retry loops
     * @param {number} _retryCount - Internal counter for network retries
     * @returns {Promise<{success: boolean, data?: any, error?: string, status?: number}>}
     */
    async request(endpoint, options = {}, _isRetry = false, _retryCount = 0) {
        const MAX_RETRIES = 2;
        const RETRY_DELAY = 1000; // 1 second
        // Default options
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const fetchOptions = { ...defaultOptions, ...options };

        // Add CSRF token for state-changing requests
        const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
        const isStateChanging = stateChangingMethods.includes(options.method?.toUpperCase());

        if (isStateChanging) {
            // Ensure we have a CSRF token before making state-changing requests
            const csrfToken = await this.ensureCsrfToken();
            if (csrfToken) {
                fetchOptions.headers['X-CSRF-Token'] = csrfToken;
            }
        }

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
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                console.error('API response parse error:', parseError, 'Status:', response.status);
                // If we can't parse the response, return a helpful error
                return {
                    success: false,
                    error: response.ok
                        ? 'Server returned an invalid response. Please try again.'
                        : `Server error (${response.status}). Please try again later.`,
                    status: response.status,
                    parseError: true
                };
            }

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
                // Check if this is a CSRF error and retry once
                const isCsrfError = data?.message?.toLowerCase().includes('csrf');
                if (isCsrfError && !_isRetry && isStateChanging) {
                    console.log('CSRF token error, refreshing and retrying...');
                    await this.refreshCsrfToken();
                    return this.request(endpoint, options, true);
                }
                return { success: false, error: data?.message || 'Access denied. You do not have permission.', status: 403 };
            }

            if (response.status === 404) {
                return { success: false, error: 'Resource not found.', status: 404 };
            }

            if (response.status === 429) {
                return { success: false, error: 'Too many requests. Please try again later.', status: 429 };
            }

            if (response.status === 408) {
                return { success: false, error: 'Request timed out. Please try again.', status: 408 };
            }

            if (response.status === 500) {
                return { success: false, error: data?.message || 'Server error. Please try again later.', status: 500 };
            }

            if (response.status === 502 || response.status === 503 || response.status === 504) {
                return { success: false, error: 'Service temporarily unavailable. Please try again later.', status: response.status };
            }

            if (response.status === 422) {
                // Unprocessable entity - validation errors
                return {
                    success: false,
                    error: data?.message || 'Invalid data provided. Please check your input.',
                    errors: data?.errors,
                    status: 422
                };
            }

            // Generic error
            const errorMessage = data?.message || data?.error || 'Something went wrong';
            return { success: false, error: errorMessage, status: response.status, data };

        } catch (error) {
            console.error('API request failed:', error);

            // Don't retry if offline
            if (!navigator.onLine) {
                return {
                    success: false,
                    error: 'No internet connection.',
                    offline: true
                };
            }

            // Don't retry aborted requests
            if (error.name === 'AbortError') {
                return {
                    success: false,
                    error: 'Request was cancelled.',
                    networkError: true
                };
            }

            // Auto-retry for network errors (up to MAX_RETRIES times)
            if (_retryCount < MAX_RETRIES) {
                console.log(`Network error, retrying (${_retryCount + 1}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (_retryCount + 1)));
                return this.request(endpoint, options, _isRetry, _retryCount + 1);
            }

            // All retries exhausted - return error silently for GET requests
            // For state-changing requests, we need to inform the user
            const isGet = !options.method || options.method.toUpperCase() === 'GET';
            if (isGet) {
                return {
                    success: false,
                    error: '',
                    networkError: true,
                    silent: true
                };
            }

            return {
                success: false,
                error: 'Connection issue. Please try again.',
                networkError: true
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
    // Show a soft notification (not an error)
    if (typeof showToast === 'function') {
        showToast('No internet connection', 'info');
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}
