# Pratibha Marketing App — Full Audit Report

**Date:** February 1, 2025  
**Purpose:** Production readiness audit for full-time business use  
**Scope:** Backend, frontend, security, deployment, and business logic

---

## Executive Summary

The Pratibha Marketing app is a well-architected order management system with solid security, error handling, and production hardening. The frontend build succeeds, and the codebase is generally production-ready. However, several issues require attention before full-time use: **unit tests fail in the current environment** (sandbox restriction), **customer-facing price exposure** on the orders page, **deployment documentation gaps**, and a few minor improvements.

| Category           | Status | Priority |
|--------------------|--------|----------|
| Security           | Good   | —        |
| Business Logic     | Good   | 1 issue  |
| Backend            | Good   | —        |
| Frontend           | Good   | 1 issue  |
| Testing            | Failed | Fix env  |
| Deployment         | Needs review | Update docs |
| Documentation      | Good   | —        |

---

## 1. Testing

### 1.1 Unit Tests — Not Passing (Environment)

**Status:** All tests fail  
**Cause:** `MongoMemoryServer` cannot bind to `0.0.0.0` in the sandbox (EPERM).  
**Impact:** Cannot verify backend logic via automated tests in this environment.

**Recommendation:**
- Run `npm test` on your machine (outside Cursor sandbox) or in CI with network/port permissions.
- If you use a real MongoDB URI in test mode, ensure it points to a dedicated test database.

### 1.2 Frontend Build

**Status:** Succeeds  
- Vite build completes in ~1.7s.  
- All pages bundle correctly.  
- No build errors.

---

## 2. Security

### 2.1 Authentication & Authorization

| Item | Status |
|------|--------|
| JWT in httpOnly cookie | Implemented |
| Token revocation (jti blacklist) | Implemented |
| Role-based access (admin/staff/customer) | Implemented |
| Magic link auth for customers | Implemented |
| Password hashing (bcrypt) | Implemented |

### 2.2 Security Middleware

- **Helmet:** CSP, HSTS in production
- **CORS:** Configurable origins
- **Rate limiting:** 100 req/15min (API), 10 req/15min (auth), 200 writes/15min
- **CSRF:** Double-submit cookie
- **Mongo sanitization:** NoSQL injection protection
- **HPP:** Parameter pollution protection

### 2.3 Secrets

- `JWT_SECRET` required when `NODE_ENV !== 'test'`
- Production: min 32 characters enforced
- No hardcoded fallbacks in production

### 2.4 Path Traversal

- Invoice and delivery bill paths use `getSafePdfPath` / `getSafeBillPath` to prevent traversal.

### 2.5 Input Validation

- Route IDs validated with `param('id').isMongoId()`
- Body validation via `express-validator` on sensitive routes

---

## 3. Business Logic Issues

### 3.1 CRITICAL: Customer Price Visibility on Orders Page

**Rule (from CLAUDE.md):** *"Never show prices to customers. Customer pages (order form, order history) must not display product prices, rates, or order totals."*

**Finding:** The **orders page** (`/pages/orders/`) is protected by auth but not restricted to staff. Customers can open it directly (e.g. via URL). When they view an order, the modal shows:

- Purchase price
- Selling price per item
- Amount per line
- Total amount
- Paid amount
- Balance

**Location:** `frontend/src/js/pages/orders.js` — `viewOrder()` (lines 1065–1086, 1124–1132)

**Current behavior:**
- `order-form` page (customer landing): correctly hides prices.
- `orders` page: shows full pricing to all users, including customers.

**Recommendation:** Either:
1. Restrict the orders page to staff/admin only (redirect customers away), or  
2. Hide all pricing in the order detail modal when `currentUser.role === 'customer'`.

---

## 4. Backend

### 4.1 Database

- MongoDB with retry and exponential backoff
- Connection events handled (error, disconnect, reconnect)
- Health endpoint: `/api/health` (public), `/api/health/detailed` (admin)

### 4.2 Error Handling

- `errorHandler.js` handles: `ValidationError`, `CastError`, `11000`, network/timeout, JWT errors, `413` body too large, `ENOENT`, `EACCES`, `EPERM`
- Stack traces only in development

### 4.3 Reconciliation & Ledger

- Atomic reconciliation (transaction when not in test)
- Ledger entries created correctly
- Order update blocked when reconciled (403)

### 4.4 Schedulers

- Batch scheduler: auto-confirm at 8 AM IST
- Market rate scheduler: daily reset
- Health tracking and concurrency guards in place

### 4.5 Graceful Shutdown

- SIGTERM/SIGINT close HTTP server and MongoDB
- Configurable timeout via `GRACEFUL_SHUTDOWN_MS`

---

## 5. Frontend

### 5.1 API Handling

- Timeout (30s)
- Retries for network errors
- CSRF retry on 403
- Offline detection
- 401 redirect (excluding `/api/auth/me`)

### 5.2 Auth Flow

- Staff/Admin → dashboard
- Customers → order-form
- Optional chaining on auth responses to avoid crashes on malformed data

### 5.3 Order Form (Customer)

- New order: no prices shown
- My Orders list: no prices
- Order detail modal: no prices
- Correctly hides pricing from customers

---

## 6. Deployment & Operations

### 6.1 Deployment Documentation Gaps

| Issue | Location | Recommendation |
|-------|----------|----------------|
| PORT mismatch | `DEPLOYMENT.md` uses 3000, `ecosystem.config.js` uses 3000 for production | Align with Nginx proxy (`proxy_pass http://localhost:3000`) |
| Seed script danger | `DEPLOYMENT.md` says "node backend/seed.js" without warning | Add warning that seed deletes all data; avoid in production |
| Frontend build | Docs omit `npm run build:frontend` | Add: build frontend before `pm2 restart` |
| Storage directory | `backend/storage/` for PDFs | Ensure writable; exists locally |
| Counter init | New deployments need `node backend/scripts/init-counters.js` | Add to deployment checklist |

### 6.2 Environment Variables

**Required in production:**
- `MONGODB_URI`
- `JWT_SECRET` (≥32 chars)
- `ALLOWED_ORIGINS`
- `NODE_ENV=production`

**Recommended:**
- `SENTRY_DSN` (backend + `VITE_SENTRY_DSN` for frontend)
- `COOKIE_DOMAIN` (if using subdomains)
- `GRACEFUL_SHUTDOWN_MS` (default 15000)

### 6.3 deploy-remote.sh

- Targets Digital Ocean App Platform
- Different from droplet deployment in `DEPLOYMENT.md`
- Check that build includes frontend in App Platform config

---

## 7. Action Items (Prioritized)

### Must Fix Before Full-Time Use

1. **Customer price exposure (orders page)**  
   - Restrict orders page to staff or hide prices for customers in the order detail modal.

### Should Fix

2. **Unit tests**  
   - Run `npm test` locally or in CI and fix any real failures.

3. **Deployment docs**  
   - Update `DEPLOYMENT.md` to include:
     - `npm run build:frontend` step
     - Seed script warning
     - Counter initialization
     - Storage directory setup

### Nice to Have

4. **DEPLOYMENT.md JWT_SECRET example**  
   - Replace placeholder with instruction to generate a secure secret.

5. **Orders page for customers**  
   - If customers are never meant to use `/pages/orders/`, add a redirect to `/pages/order-form/` when `role === 'customer'`.

---

## 8. Pre–Production Checklist

- [ ] Fix customer price visibility on orders page
- [ ] Run `npm test` successfully
- [ ] Set all required env vars in production
- [ ] Run `npm run build:frontend` before deployment
- [ ] Ensure `backend/storage/` (and subdirs) exist and are writable
- [ ] Run `node backend/scripts/init-counters.js` for new DB or after reset
- [ ] Change default admin password after first login
- [ ] Configure Sentry for error monitoring (optional but recommended)
- [ ] Verify SSL/HTTPS in production
- [ ] Confirm MongoDB Atlas IP whitelist includes server IP

---

## 9. Summary

The app is structurally solid with good security, error handling, and production considerations. The main blocker for full-time use is **customer price exposure** on the orders page, which conflicts with documented business rules. Fix that, verify tests locally, and update deployment docs, and the app should be ready for production use.
