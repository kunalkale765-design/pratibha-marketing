# Sentinel Security Journal

## 2026-01-21 - Hardcoded JWT Secret Fallback Pattern

**Vulnerability:** Multiple files used the pattern `process.env.JWT_SECRET || 'dev-secret-change-in-production'` which silently falls back to a known default when the environment variable is missing.

**Learning:** Even with a production-only check in one file (`auth.js` lines 9-13), other files (`auth middleware`) using the same fallback pattern remained vulnerable. The "fail-fast" approach should be centralized and applied to ALL environments, not just production.

**Prevention:**
1. Create a centralized `config/secrets.js` that validates required secrets at startup
2. Never use fallback values for security-critical secrets - fail fast instead
3. Ensure test setup explicitly sets required secrets before any imports
