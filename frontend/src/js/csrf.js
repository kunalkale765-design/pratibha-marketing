/**
 * CSRF Token Management Module
 * Single source of truth for CSRF token handling
 *
 * This module is imported by both auth.js and api.js to avoid code duplication.
 */

// Track if we're currently refreshing to avoid concurrent requests
let csrfRefreshPromise = null;

/**
 * Get CSRF token from cookie
 * @returns {string|null}
 */
export function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : null;
}

/**
 * Fetch a fresh CSRF token from the server
 * Deduplicates concurrent refresh requests
 * @returns {Promise<string|null>}
 */
export async function refreshCsrfToken() {
    // If already refreshing, wait for that promise
    if (csrfRefreshPromise) {
        return csrfRefreshPromise;
    }

    csrfRefreshPromise = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch('/api/csrf-token', {
                credentials: 'include',
                signal: controller.signal
            });
            if (response.ok) {
                const data = await response.json();
                // The cookie is set by the server, but we return the token too
                return data.csrfToken || getCsrfToken();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Failed to refresh CSRF token:', error);
            }
        } finally {
            clearTimeout(timeout);
        }
        return null;
    })();

    try {
        return await csrfRefreshPromise;
    } finally {
        csrfRefreshPromise = null;
    }
}

/**
 * Ensure CSRF token is available, fetching if necessary
 * @returns {Promise<string|null>}
 */
export async function ensureCsrfToken() {
    let token = getCsrfToken();
    if (!token) {
        token = await refreshCsrfToken();
    }
    return token;
}
