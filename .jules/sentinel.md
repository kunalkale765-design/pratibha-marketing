# Sentinel Security Journal

## 2026-01-21 - Hardcoded JWT Secret Fallback Pattern

**Vulnerability:** Multiple files used the pattern `process.env.JWT_SECRET || 'dev-secret-change-in-production'` which silently falls back to a known default when the environment variable is missing.

**Learning:** Even with a production-only check in one file (`auth.js` lines 9-13), other files (`auth middleware`) using the same fallback pattern remained vulnerable. The "fail-fast" approach should be centralized and applied to ALL environments, not just production.

**Prevention:**
1. Create a centralized `config/secrets.js` that validates required secrets at startup
2. Never use fallback values for security-critical secrets - fail fast instead
3. Ensure test setup explicitly sets required secrets before any imports

## 2026-01-21 - XSS via Inline Event Handlers in Template Literals

**Vulnerability:** Frontend code used inline `onclick` handlers with template literals that could be exploited if order IDs or customer names contained malicious content.

**Learning:** Even MongoDB ObjectIds (24 hex chars) injected into inline event handlers create potential attack vectors. Template literals with user data should NEVER be used in onclick/oninput/onchange attributes.

**Prevention:**
1. Always use event delegation instead of inline event handlers
2. Create an `escapeHtml()` function and use it for ALL user-provided content in template literals
3. Use `data-*` attributes + `addEventListener()` pattern for click handlers

## 2026-01-21 - Missing Rate Limiting on Sensitive Auth Endpoints

**Vulnerability:** Password reset (`/forgot-password`, `/reset-password/:token`) and magic link (`/magic/:token`) endpoints had no rate limiting, allowing brute force attacks.

**Learning:** Even with 64-character tokens, lack of rate limiting allows enumeration attacks and can reveal timing information. All public auth endpoints need protection.

**Prevention:**
1. Apply rate limiting to ALL public auth endpoints (not just login/register)
2. Use stricter limits for token-based endpoints (5/hour for password reset, 10/15min for magic links)
3. Skip rate limiting in test mode to avoid flaky tests
