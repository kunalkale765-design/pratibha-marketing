# Production Readiness Audit

This document lists failure modes and production-hardening measures for the Pratibha Marketing App. It covers backend, API, frontend, and operational concerns.

---

## 1. Backend – Already Solid

### Environment & startup
- **validateEnv()** in `server.js` enforces `MONGODB_URI` always; in production also `JWT_SECRET` and `ALLOWED_ORIGINS`. Missing vars cause clear error and `process.exit(1)`.
- **config/secrets.js** validates `JWT_SECRET` (required when not test; min 32 chars in production). No fallback to a default secret.
- **config/companies.js** validates firms at load: at least one firm, exactly one default, no duplicate IDs, required fields.

### Database
- **config/database.js**: Retry with exponential backoff (5 attempts, 2s base). Connection events (error, disconnected, reconnected) logged. Exit(1) after all retries.
- **Health**: `/api/health` returns 503 when DB not connected; `/api/health/detailed` (admin) includes MongoDB state and scheduler health.

### Error handling
- **middleware/errorHandler.js** handles: Mongoose ValidationError, CastError, 11000; MongoNetworkError/MongoTimeoutError → 503; JWT JsonWebTokenError/TokenExpiredError; body SyntaxError; ENOENT/EACCES/EPERM; stack only in development.
- **413 Payload Too Large** (body too large): Now handled explicitly with a clear message (see Fixes below).
- **Sentry.init**: Wrapped in try/catch so invalid DSN or init failure does not crash the server (see Fixes below).

### Security
- Helmet (CSP, HSTS in prod), CORS (allowed origins), rate limiting (API + auth + write ops), CSRF (double-submit cookie), mongo-sanitize, HPP.
- Invoice and delivery-bill paths use **getSafePdfPath** / **getSafeBillPath**: basename + resolve + prefix check to prevent path traversal.
- All route IDs use **express-validator** (`param('id').isMongoId()`) or equivalent; batches `/date/:date` validates date with `isNaN(targetDate.getTime())`.

### Schedulers & locks
- **batchScheduler.js** and **marketRateScheduler.js**: Optional Sentry, health tracking (lastError/lastSuccess), concurrency guards, timeouts. Errors reported to Sentry when configured.
- **utils/locks.js**: Distributed lock with TTL and timeout; release in `finally` with `.catch()` so release failure is logged but does not mask main error.

### Graceful shutdown
- SIGTERM/SIGINT close HTTP server, then MongoDB. Timeout from `GRACEFUL_SHUTDOWN_MS` (default 15s) then force exit. PM2 `wait_ready` supported.

### Unhandled rejections / uncaught exceptions
- Handlers log and send to Sentry; in production they call `process.exit(1)` so the process is restarted by PM2.

---

## 2. API Layer – Already Solid

- **Counter.getNextSequence**: Throws with clear message on failure; used for order numbers, invoice numbers, bill numbers.
- **Reconciliation**: Auto-generate invoices awaited; failures set `invoice.pdfGenerationError` / `pdfFailedAt` and return `invoiceWarning` in response.
- **Orders PUT**: Rejected when order is already reconciled (403) to avoid corrupting ledger.
- **optionalAuth**: On unexpected errors (e.g. DB) returns 503 instead of continuing as unauthenticated.
- **Invoice PDF**: DB record created first, then PDF written, then `pdfPath` updated; failures leave invoice without path and can be retried.

---

## 3. Frontend – Fixes Applied

### Auth and API response shape
- **login.js**: `checkAuth` and login success use `data?.user?.role` and `data?.user` so malformed or partial responses do not throw. Retry path uses `retryData?.user`.
- **signup.js**: Same pattern for checkAuth and register success/retry; `data?.user`, `data?.errors`, `data?.message` guarded.

### Dashboard procurement data
- **dashboard.js** and **staff-dashboard.js**: `storeQuantities(data)` and `detectNewOrders(newData)` now use `(data?.toProcure || [])` and `(data?.procured || [])` so missing or malformed API data does not cause spread/forEach to throw. Items without `productId` are skipped in `storeQuantities`.

### Reconciliation
- **reconciliation.js**: Success toast uses `result?.data?.orderNumber` and falls back to a generic message if `data` or `orderNumber` is missing.

### Already in place
- **api.js**: Timeout (30s), retries for network errors, CSRF retry on 403, offline check, 401 redirect (excluding `/api/auth/me`), parse error handling.
- **fetchWithAuth**: Timeout and 401 redirect.
- **init.js**: Global onerror and unhandledrejection send to Sentry; SW update handling; logout and CSRF pre-fetch.
- **customers.js** magic link: Uses `res.ok && data.data` before `data.data.link`.

---

## 4. Operational & Deployment

### Recommended checks before production
1. **Environment**: Set `MONGODB_URI`, `JWT_SECRET` (≥32 chars), `ALLOWED_ORIGINS`, and optionally `SENTRY_DSN`, `COOKIE_DOMAIN`, `GRACEFUL_SHUTDOWN_MS`.
2. **Storage**: Ensure `backend/storage/` (and subdirs for invoices and delivery-bills) exist and are writable; creation is attempted with `recursive: true` but EACCES will surface as 500 until fixed.
3. **Counters**: Run `node backend/scripts/init-counters.js` if you rely on sequence-based IDs and the Counter collection is new or was reset.
4. **Seed**: Do **not** run `node backend/seed.js` in production without explicit intent; it can delete data. Use only with `--force` when appropriate and documented.

### What can still fail (and how it’s handled)
- **MongoDB down mid-request**: Request fails; error handler returns 503 or 500; frontend shows “Service temporarily unavailable” or retries.
- **Disk full** (PDF write): Write fails; invoice/bill record may exist without file; reconciliation returns `invoiceWarning`; staff can regenerate from UI.
- **Sentry DSN invalid**: Init is inside try/catch; server keeps running; errors only in logs.
- **Large request body** (>10mb): Express returns 413; error handler now returns a consistent JSON message.
- **Rate limit (429)**: Frontend shows “Too many requests…” and does not redirect to login.
- **CSRF mismatch**: Frontend retries once with refreshed token; if still 403, user sees error message.

---

## 5. Fixes Applied in This Audit

| Area | Change |
|------|--------|
| Backend | Wrap `Sentry.init` in try/catch so invalid DSN or init failure does not crash the server. |
| Backend | In `errorHandler`, handle 413 / `entity.too.large` with a clear JSON message. |
| Frontend | **login.js**: Use `data?.user?.role` and `data?.user` in checkAuth and login/retry success paths. |
| Frontend | **signup.js**: Use `data?.user`, `data?.errors`, `data?.message` with optional chaining in checkAuth and register/retry. |
| Frontend | **dashboard.js** & **staff-dashboard.js**: Defensive arrays in `storeQuantities` and `detectNewOrders` (`toProcure`/`procured` default to `[]`); skip items without `productId` in `storeQuantities`. |
| Frontend | **reconciliation.js**: Use `result?.data?.orderNumber` for success toast with fallback message. |

---

## 6. Summary

The app was already in good shape for production: env validation, DB retries, global error handling, path safety for files, validation on route params, graceful shutdown, and frontend timeouts/retries. This audit added:

1. **Resilience**: Sentry init and 413 handling no longer risk crashes or generic 500s.
2. **Frontend robustness**: Auth and dashboard code no longer assume a perfect API response shape; optional chaining and defaults prevent runtime errors on malformed or partial data.

Keeping dependencies updated, monitoring Sentry (if enabled), and running the test suite before releases will help keep the app production-ready.
