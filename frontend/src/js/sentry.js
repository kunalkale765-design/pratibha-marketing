/**
 * Sentry Browser Integration
 * Initializes error monitoring for the frontend.
 * DSN is injected by Vite at build time via __SENTRY_DSN__.
 *
 * When served without a bundler (e.g., Express static), the @sentry/browser
 * import will fail. We catch this gracefully and export no-op stubs.
 */

let Sentry = null;
let initialized = false;

try {
    // Dynamic import so the module doesn't crash when served without a bundler
    const mod = await import('@sentry/browser');
    Sentry = mod;

    const DSN = import.meta.env?.VITE_SENTRY_DSN || '';

    if (DSN) {
        Sentry.init({
            dsn: DSN,
            environment: import.meta.env?.MODE || 'production',
            sampleRate: 1.0,
            maxBreadcrumbs: 50,
            beforeSend(event) {
                // Scrub PII from user context
                if (event.user) {
                    delete event.user.ip_address;
                }
                // Strip query params that might contain tokens
                if (event.request?.url) {
                    try {
                        const url = new URL(event.request.url);
                        url.searchParams.delete('token');
                        url.searchParams.delete('magic');
                        event.request.url = url.toString();
                    } catch (_) { /* ignore invalid URLs */ }
                }
                return event;
            }
        });
        initialized = true;
    }
} catch (loadError) {
    // @sentry/browser not available (not bundled) — run without Sentry
    // Log so build/deployment issues are visible in browser console
    if (typeof console !== 'undefined') {
        console.warn('[Sentry] Failed to load @sentry/browser — error monitoring disabled:', loadError.message || loadError);
    }
}

/**
 * Set user context for Sentry events.
 * Call after successful auth check.
 */
export function setSentryUser(user) {
    if (!initialized) return;
    Sentry.setUser(user ? { id: user._id || user.id, role: user.role } : null);
}

/**
 * Capture an exception with optional extra context.
 */
export function captureException(error, context) {
    if (!initialized) {
        console.error('[Sentry disabled]', error);
        return;
    }
    Sentry.captureException(error, context ? { extra: context } : undefined);
}

/**
 * Add a breadcrumb for debugging context.
 */
export function addBreadcrumb(message, category, data) {
    if (!initialized) return;
    Sentry.addBreadcrumb({ message, category, data, level: 'info' });
}

export { initialized as sentryEnabled };
