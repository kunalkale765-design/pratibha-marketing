# Changelog

All notable changes to the Pratibha Marketing App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Fixed

#### 2026-01-09 - Code Review Fixes

**Files Created:**
| File | Purpose |
|------|---------|
| `backend/scripts/init-counters.js` | Migration script to initialize counters from existing orders |

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `frontend/index.html` | Added SRI hash to Chart.js CDN script | Prevent CDN compromise attacks |
| `frontend/index.html` | Fixed silent failure in saveAllRates() | Users now informed of failed rate updates |
| `backend/models/Order.js` | Added error handling to order number generation | Proper error propagation if counter fails |
| `backend/models/Counter.js` | Added error handling to getNextSequence() | Meaningful error messages for debugging |

**Details:**

1. **Counter Migration Script** (`backend/scripts/init-counters.js`)
   - Run BEFORE deploying to prevent duplicate order numbers
   - Initializes Counter collection based on max sequence from existing orders
   - Safe to run multiple times (uses `$max` operator)
   - Usage: `node backend/scripts/init-counters.js`

2. **Chart.js SRI Hash**
   - Added `integrity="sha384-..."` and `crossorigin="anonymous"` to CDN script
   - Protects against CDN compromise injecting malicious code

3. **saveAllRates() Error Handling**
   - Now tracks which rate updates succeed vs fail
   - Only clears successful rates from pending changes
   - Shows alert with list of failed products
   - Keeps save button visible if retries are needed

4. **Order/Counter Error Handling**
   - Counter.getNextSequence() now logs errors and throws with context
   - Order pre-save hook catches counter errors and passes to next()
   - Prevents orders from being created without valid order numbers

**Deployment:**
```bash
# Before deploying new code, run migration:
node backend/scripts/init-counters.js

# Then deploy as normal
```

---

#### 2026-01-09 - Magic Link Endpoint Sensitive Data Fix

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/routes/auth.js` | Sanitized customer data in magic link authentication responses | Missed in original 1.2 fix |

**Details:**
- Magic link endpoint (`GET /api/auth/magic/:token`) was returning full customer object including `currentCredit`, `paymentHistory`, `contractPrices`, `markupPercentage`
- Now only returns essential data: `_id`, `name`, `pricingType`
- Applies to both virtual session (customer-only) and linked user session responses

**Security Impact:** Completes the sensitive data exposure fix from ASSESSMENT.md issue 1.2.

---

### Added

#### 2026-01-09 - Swagger API Documentation

**Files Created:**
| File | Purpose |
|------|---------|
| `backend/config/swagger.js` | OpenAPI 3.0 specification with all endpoint documentation |

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/server.js` | Added Swagger UI routes | Serve interactive API docs |
| `package.json` | Added swagger-jsdoc, swagger-ui-express | Swagger dependencies |

**Features:**
- Interactive API documentation at `/api/docs`
- OpenAPI 3.0 JSON spec at `/api/docs.json`
- All 6 route groups documented:
  - Auth (5 endpoints): register, login, logout, me, magic link auth
  - Customers (7 endpoints): CRUD, payments, magic links
  - Orders (7 endpoints): CRUD, status updates, payment updates
  - Products (5 endpoints): CRUD with soft delete
  - Market Rates (2 endpoints): get/update rates
  - Supplier (1 endpoint): quantity summary
- Schema definitions for all models
- Request/response examples
- Authentication documentation (cookie & bearer token)

**Access:** `http://localhost:5000/api/docs`

---

#### 2024-01-09 - Dashboard Analytics Charts

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `frontend/index.html` | Added Chart.js and 3 analytics charts | Visual insights for business data |

**Features Added:**
- **Order Status Chart** (Doughnut): Shows distribution of orders by status (pending, processing, delivered, etc.)
- **Revenue Trend Chart** (Line): 7-day revenue history with daily breakdown
- **Top Products Chart** (Horizontal Bar): Top 5 products by quantity ordered

**Technical Details:**
- Uses Chart.js 4.4.1 (CDN)
- Responsive design (1 column mobile, 2 tablet, 3 desktop)
- Colors match existing design system
- Summary stats below charts (Pending count, Processing count, Delivered count, Week total, Avg/day)

---

### Fixed

#### 2026-01-09 - XSS Vulnerability Fixes (ASSESSMENT.md Issue 1.1)

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `frontend/orders.html` | Wrapped all dynamic values in `escapeHtml()` | Prevent XSS attacks from user-controlled data |
| `frontend/customer-management.html` | Wrapped all dynamic values in `escapeHtml()` | Prevent XSS attacks from user-controlled data |
| `frontend/products.html` | Wrapped `p._id` in onclick handlers with `escapeHtml()` | Prevent XSS attacks |
| `frontend/market-rates.html` | Wrapped `catName`, `p._id`, `currentRate` with `escapeHtml()` | Prevent XSS attacks |

**Details:**
- `orders.html`: Escaped `o._id`, `o.status`, `o.paymentStatus` in order card rendering; `order.status` in modal
- `customer-management.html`: Escaped `c._id` in onclick handlers, `markupPercentage` in badge, `p._id`/`p.unit`/`price` in contract prices
- `products.html`: Escaped `p._id` in edit/delete button onclick handlers
- `market-rates.html`: Escaped `catName` in category header, `p._id` in input attributes, `currentRate` in value attributes

**Security Impact:** Prevents XSS if API returns malicious content.

---

#### 2026-01-09 - Sensitive Data Exposure Fix (ASSESSMENT.md Issue 1.2)

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/routes/auth.js` | Sanitized user/customer data in login, /me, and magic link responses | Exclude payment/credit info from API responses |
| `frontend/js/auth.js` | Added defense-in-depth sanitization in setUser() | Only store essential data in localStorage |

**Details:**
- Backend now only returns: `id`, `name`, `email`, `role`, and minimal customer data (`_id`, `name`, `pricingType`)
- Excluded: `currentCredit`, `paymentHistory`, `contractPrices`, `markupPercentage`, `magicLinkToken`
- Frontend now also sanitizes data before storing (defense-in-depth)

**Security Impact:** XSS attacks can no longer expose sensitive payment/credit information from localStorage.

---

#### 2026-01-09 - Rate Limiting for Write Operations (ASSESSMENT.md Issue 1.4)

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/server.js` | Added writeOperationsLimiter (50 req/15min) for POST/PUT/DELETE | Prevent brute force/enumeration attacks |

**Details:**
- New rate limiter: 50 write operations per 15 minutes per IP
- Applied to `/api/customers` and `/api/orders` routes
- Skips GET requests (read operations) and test mode
- Complements existing general limiter (100/15min) and auth limiter (10/15min)

**Security Impact:** Prevents brute force attacks on customer creation/update and order operations.

---

#### 2026-01-09 - Pagination Limit Validation (ASSESSMENT.md Issue 2.1)

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/routes/orders.js` | Added limit validation (1-1000, default 50) | Prevent memory exhaustion/DoS |
| `backend/routes/marketRates.js` | Added limit validation to /all and /history endpoints | Prevent memory exhaustion/DoS |

**Details:**
- Orders: limit capped at 1-1000, default 50
- Market rates /all: limit capped at 1-1000, default 100
- Market rates /history: limit capped at 1-500, default 30
- Uses `Math.min(Math.max(parseInt(rawLimit) || default, 1), max)` pattern

**Security Impact:** Prevents DoS attacks via unlimited query results.

---

#### 2026-01-09 - Date Validation Fixes (ASSESSMENT.md Issues 2.2 & 2.4)

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/routes/orders.js` | Added date parsing validation and range validation | Prevent silent query failures |

**Details:**
- Validates date format using `isNaN(parsedDate.getTime())` check
- Returns 400 error with clear message for invalid dates
- Validates that `endDate >= startDate` when both are provided
- Prevents silent query failures from invalid Date objects

**Impact:** API now returns clear error messages for invalid date inputs instead of failing silently.

---

#### 2026-01-09 - Order Number Race Condition Fix (ASSESSMENT.md Issue 2.3)

**Files Created:**
| File | Purpose |
|------|---------|
| `backend/models/Counter.js` | Atomic counter model for sequence generation |

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/models/Order.js` | Use atomic Counter for order number generation | Prevent duplicate order numbers under concurrency |

**Details:**
- Created Counter model with `findByIdAndUpdate` and `$inc` for atomic increments
- Counter uses format `order_ORD{YY}{MM}` to separate monthly sequences
- Uses MongoDB's atomic `$inc` operator to guarantee unique sequences even under high concurrency
- Previous implementation could generate duplicates when multiple orders were created simultaneously

**Impact:** Order numbers are now guaranteed unique even under concurrent order creation.

---

#### 2026-01-09 - Customer List Pagination (ASSESSMENT.md Issue 3.1)

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/routes/customers.js` | Added pagination with limit, page, skip, and total count | Prevent memory spike with large customer lists |

**Details:**
- Added `limit` parameter (1-500, default 100)
- Added `page` parameter (default 1)
- Response now includes `total`, `page`, `pages` for pagination metadata
- Uses parallel queries for customers and count for efficiency

**Impact:** Customer list endpoint now scales properly with large datasets.

---

#### 2026-01-09 - Code Cleanup (ASSESSMENT.md Issues 4.1, 4.2, 4.3)

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/models/Customer.js` | Removed legacy `personalizedPricing` field | Unused field cleanup |
| `backend/routes/supplier.js` | Removed unused `Product` import | Dead code removal |
| `backend/routes/auth.js` | Made magic link expiry configurable via `MAGIC_LINK_EXPIRY_HOURS` env var | Configuration flexibility |

**Details:**
- Removed `personalizedPricing` Map field that was kept for backward compatibility but never used
- Removed unused `Product` import from supplier.js (MarketRate is still used)
- Magic link expiry now configurable via `process.env.MAGIC_LINK_EXPIRY_HOURS` (default: 48 hours)

---

#### 2026-01-09 - Test Environment Variable Override Bug

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/server.js` | Preserve NODE_ENV before dotenv.config() | Tests were failing because dotenv was overriding NODE_ENV=test |

**Issue:** When running tests with `NODE_ENV=test`, the `dotenv.config()` call in server.js was overriding the environment variable from the .env file, causing tests to connect to the production database instead of the in-memory test database.

**Fix:** Preserve NODE_ENV before loading dotenv and restore it afterward.

---

#### 2024-01-09 - Sentry Error Monitoring

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `backend/server.js` | Added Sentry initialization, error handler, exception handlers | Production error tracking |
| `package.json` | Added @sentry/node dependency | Sentry SDK |

**Files Created:**
- `SENTRY_SETUP.md` - Setup guide for configuring Sentry DSN

**Features:**
- Automatic error capture for all Express errors
- Unhandled Promise rejection tracking
- Uncaught exception tracking
- Environment-based configuration (dev/prod)
- Health endpoint shows Sentry status
- Debug endpoint for testing (development only)

**Setup Required:**
1. Create free Sentry account at sentry.io
2. Add `SENTRY_DSN=your-dsn` to `.env`

---

#### 2024-01-09 - Codebase Assessment

**File Created:**
- `ASSESSMENT.md` - Comprehensive codebase review covering security, performance, maintainability, and extensibility issues

**Key Findings:**
- 6 security issues (2 critical, 4 high)
- 5 performance issues
- 4 code quality issues
- Architecture extensibility rated 5/10

**Reason:** Document technical debt and prioritize improvements before adding new features.

#### 2024-01-09 - Automated Testing Infrastructure

**Files Created:**
| File | Purpose |
|------|---------|
| `jest.config.js` | Jest configuration for test environment |
| `backend/tests/setup.js` | Test database connection, cleanup, and test utilities |
| `backend/tests/auth.test.js` | Authentication endpoint tests (login, register, logout, /me) |
| `backend/tests/customers.test.js` | Customer CRUD and payment tests |
| `backend/tests/orders.test.js` | Order workflow and status tests |
| `backend/tests/products.test.js` | Product CRUD tests |

**Files Modified:**
| File | Change | Reason |
|------|--------|--------|
| `package.json` | Added Jest, Supertest, cross-env, mongodb-memory-server as devDependencies; added test scripts | Required for running automated tests |
| `backend/server.js` | Export app instance for testing | Supertest needs access to Express app without starting server |

**Test Database:**
- Using MongoDB Memory Server for isolated, fast tests
- No external MongoDB required - tests run entirely in-memory
- Each test gets a clean database state

**Reason for Change:**
- Automated tests are critical for production reliability
- Tests cover authentication flow, CRUD operations, role-based access
- Enables CI/CD integration and regression testing
- Jest + Supertest is industry standard for Node.js API testing

**Test Coverage: 83 tests, 100% passing**
- Auth (14 tests): Register, login, logout, token verification, role-based redirects
- Customers (18 tests): CRUD, pricing types, payment recording, magic links
- Orders (29 tests): Create, status updates, payment updates, customer isolation
- Products (22 tests): CRUD, soft delete, unit validation

**Run tests:** `npm test`

---

## [1.0.0] - Previous Release

### Features
- JWT authentication with role-based access (admin, staff, customer)
- Magic link passwordless authentication for customers
- Customer management with 3 pricing models (market, markup, contract)
- Order lifecycle management with auto-numbering
- Product inventory management
- Market rate tracking with trend analysis
- Supplier dashboard with quantity summaries
- Mobile responsive PWA frontend
- Security stack: Helmet, rate limiting, input sanitization
