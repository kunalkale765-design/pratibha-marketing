# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start server with nodemon (hot reload)
npm start            # Start production server

# Database
node backend/seed.js # Seed database with sample data

# Deployment
./deploy.sh          # Deploy to Digital Ocean (requires SSH access)
```

Server runs on `http://localhost:5000` by default.

## Environment Variables

```bash
MONGODB_URI          # MongoDB connection string
JWT_SECRET           # Secret for JWT tokens (REQUIRED in production)
NODE_ENV             # development | production
PORT                 # Server port (default: 5000)
ALLOWED_ORIGINS      # Comma-separated allowed CORS origins
```

## Architecture

### Backend (Node.js/Express)

```
backend/
├── server.js              # Express app entry, middleware stack, route mounting
├── config/database.js     # MongoDB connection via Mongoose
├── middleware/
│   ├── auth.js            # JWT auth: protect(), authorize(), optionalAuth()
│   └── errorHandler.js    # Global error handling
├── models/
│   ├── User.js            # Users with roles: admin, staff, customer
│   ├── Customer.js        # Business customers with pricing tiers
│   ├── Order.js           # Orders with items, status, payment tracking
│   ├── Product.js         # Product inventory
│   └── MarketRate.js      # Daily market pricing
├── routes/
│   ├── auth.js            # /api/auth - login, register, logout, /me
│   ├── customers.js       # /api/customers - CRUD + payments
│   ├── orders.js          # /api/orders - CRUD + status/payment updates
│   ├── products.js        # /api/products - CRUD + stock management
│   ├── marketRates.js     # /api/market-rates - pricing updates
│   └── supplier.js        # /api/supplier - supplier dashboard data
└── seed.js                # Database seeding script
```

**Security Stack**: Helmet, CORS, rate limiting (100 req/15min, 10 for auth), express-mongo-sanitize, HPP.

**Auth Flow**: JWT stored in httpOnly cookie (30 days), verified via `protect` middleware. Roles restrict access via `authorize('admin', 'staff')`.

### Frontend (Vanilla JS + Inline CSS)

```
frontend/
├── js/
│   ├── api.js             # Centralized fetch wrapper with error handling
│   └── auth.js            # Auth state management, token verification
├── index.html             # Admin dashboard with stats
├── login.html             # User login
├── signup.html            # Customer registration
├── customer-order-form.html   # Customer-facing order form
├── customer-management.html   # Staff: manage customers
├── orders.html                # Staff: view/manage orders
├── products.html              # Staff: product inventory
├── market-rates.html          # Staff: daily pricing updates
├── service-worker.js          # PWA offline support
└── manifest.json              # PWA manifest
```

**Auth Redirects**: Staff/Admin → index.html (dashboard), Customers → customer-order-form.html

## Database Models

### User
| Field | Type | Notes |
|-------|------|-------|
| name | String | Required |
| email | String | Username (min 3 chars, unique, lowercase) |
| password | String | 6+ chars, hashed with bcrypt |
| phone | String | 10 digits (optional) |
| role | Enum | `admin`, `staff`, `customer` |
| customer | ObjectId | Ref to Customer (for customer users) |
| isActive | Boolean | Soft delete flag |

### Customer
| Field | Type | Notes |
|-------|------|-------|
| name | String | Required |
| phone | String | 10 digits (optional) |
| whatsapp | String | 10 digits (optional) |
| address | String | Delivery address |
| pricingType | Enum | `market`, `markup`, `contract` |
| markupPercentage | Number | 0-200% (for markup pricing) |
| contractPrices | Map | ProductId → Price (for contract pricing) |
| magicLinkToken | String | Unique token for passwordless auth (sparse) |
| magicLinkCreatedAt | Date | When magic link was generated |

### Product
| Field | Type | Notes |
|-------|------|-------|
| name | String | Unique |
| unit | Enum | `quintal`, `bag`, `kg`, `piece`, `ton`, `bunch` |
| category | String | Free-form category (user-manageable) |
| isActive | Boolean | Soft delete flag |

### Order
| Field | Type | Notes |
|-------|------|-------|
| orderNumber | String | Auto-generated: ORD{YY}{MM}{0001} |
| customer | ObjectId | Ref to Customer |
| products | Array | [{product, productName, quantity, unit, rate, amount}] |
| totalAmount | Number | Sum of all items |
| status | Enum | `pending`, `confirmed`, `processing`, `packed`, `shipped`, `delivered`, `cancelled` |
| paymentStatus | Enum | `unpaid`, `partial`, `paid` |
| paidAmount | Number | Amount received |
| deliveryAddress | String | |
| notes | String | Order notes |
| packedAt/shippedAt/deliveredAt | Date | Status timestamps |

### MarketRate
| Field | Type | Notes |
|-------|------|-------|
| product | ObjectId | Ref to Product |
| productName | String | Denormalized |
| rate | Number | Current rate |
| previousRate | Number | For trend calculation |
| effectiveDate | Date | When rate became active |
| trend | Enum | `up`, `down`, `stable` |
| changePercentage | Number | Auto-calculated |

## API Endpoints

### Auth `/api/auth`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | /register | Public | Create customer account |
| POST | /login | Public | Login, returns JWT cookie |
| POST | /logout | Public | Clear JWT cookie |
| GET | /me | Private | Get current user (supports magic link tokens) |
| GET | /magic/:token | Public | Authenticate via magic link |

### Customers `/api/customers`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | / | Admin/Staff | List active customers (soft-deleted hidden) |
| GET | /:id | Admin/Staff | Get one customer |
| POST | / | Admin/Staff | Create customer |
| PUT | /:id | Admin/Staff | Update customer |
| DELETE | /:id | Admin/Staff | Soft delete customer |
| POST | /:id/payment | Admin/Staff | Record payment |
| POST | /:id/magic-link | Admin/Staff | Generate magic link for customer |
| DELETE | /:id/magic-link | Admin/Staff | Revoke customer's magic link |

### Orders `/api/orders`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | / | Private | List orders (filtered by role) |
| GET | /:id | Private | Get one order |
| GET | /customer/:id | Private | Orders by customer |
| POST | / | Private | Create order (supports idempotencyKey) |
| PUT | /:id | Admin/Staff | Update order prices only |
| PUT | /:id/customer-edit | Private | Customer edit pending order (products/quantities) |
| PUT | /:id/status | Admin/Staff | Update status (enforces state machine) |
| PUT | /:id/payment | Admin/Staff | Update payment |
| DELETE | /:id | Admin/Staff | Cancel order |

### Products `/api/products`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | / | Private | List all products |
| GET | /:id | Private | Get one product |
| POST | / | Admin/Staff | Create product |
| PUT | /:id | Admin/Staff | Update product |
| DELETE | /:id | Admin/Staff | Deactivate product |

### Market Rates `/api/market-rates`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | / | Private | Get current rates |
| POST | / | Admin/Staff | Update rate |

### Supplier `/api/supplier`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | /quantity-summary | Admin/Staff | Aggregate order quantities |

### Invoices `/api/invoices`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | /firms | Admin/Staff | Get list of available firms |
| GET | /:orderId/split | Admin/Staff | Get order items split by firm |
| POST | /:orderId/pdf | Admin/Staff | Generate and save PDF |
| POST | /:orderId/data | Admin/Staff | Get invoice data as JSON |
| GET | / | Admin/Staff | List all invoices |
| GET | /:invoiceNumber/download | Admin/Staff | Download saved PDF |
| GET | /order/:orderId | Admin/Staff | Get invoices for order |
| GET | /my-order/:orderId | Customer | Get own order's invoices |
| GET | /my/:invoiceNumber/download | Customer | Download own invoice |

### Reports `/api/reports`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | /ledger | Admin/Staff | Download ledger Excel (query: customerId, fromDate, toDate) |
| GET | /ledger/preview | Admin/Staff | Preview ledger data as JSON |

### Health `/api/health`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | / | Public | Server health check |

## Business Logic

### Pricing Types

| Type | How Price is Calculated |
|------|------------------------|
| `market` | Current market rate (from MarketRate collection) |
| `markup` | Market rate + markupPercentage% |
| `contract` | Fixed price from customer.contractPrices map |

### Order Flow
```
pending → confirmed → processing → packed → shipped → delivered
                                                    ↘ cancelled
```

### Payment Flow
```
unpaid → partial → paid
```

### Role Permissions
| Role | Permissions |
|------|-------------|
| `admin` | Full access to everything |
| `staff` | CRUD on orders, customers, products, market rates |
| `customer` | View/create own orders only |

### Customer-Facing UI Rules
- **Never show prices to customers** - Customer pages (order form, order history) must not display product prices, rates, or order totals. Only staff/admin can see pricing information.

### Multi-Firm Invoicing
Two firms are configured for invoice generation based on product categories:

| Firm | Categories | Notes |
|------|------------|-------|
| Pratibha Marketing | All except Fruits/Frozen | Default firm |
| Vikas Frozen Foods | Fruits, Frozen | For specific product categories |

**Invoice Generation Flow:**
1. Staff clicks Print on order card (swipe action)
2. System auto-splits items by category → firm mapping
3. Staff selects firm and items
4. Staff generates invoice - saved to DB + filesystem
5. PDF downloads with firm header and selected items

**Invoice Persistence:**
- Invoice model stores metadata (MongoDB)
- PDFs stored in `backend/storage/invoices/`
- Transaction-safe: DB record first → PDF → update path

**Invoice Number Format:** `INV{YYMM}{0001}` (unique sequential)

**Customer Access:** Customers can download invoices after staff generates them

**Configuration:** `backend/config/companies.js` - Firm details and category mappings

## Key Patterns

- API responses: `{ success: boolean, data?, message?, error?, count? }`
- Frontend `API` object wraps all fetch calls with credential handling
- `Auth.requireAuth(['admin', 'staff'])` gates pages by role
- All HTML pages are self-contained with inline CSS + JS
- Soft deletes via `isActive: false`
- Rate limiting: 100 req/15min general, 10 req/15min for login/register

## Documentation Updates

**Update docs as part of feature work, not as an afterthought.**

| File | When to Update |
|------|----------------|
| `FEATURES.md` | New features, UI changes, workflow changes |
| `CLAUDE.md` | API changes, new endpoints, business logic, architecture |
| `CHANGELOG.md` | All notable changes (version history) |

## Design System

### Colors (CSS Variables)
```css
--gunmetal: #2e3532        /* Dark headers, text */
--dusty-olive: #7e9181     /* Brand primary, buttons */
--dusty-olive-dark: #5d6b5f
--cream: #f9f7f3           /* Page background */
--warm-white: #fefdfb      /* Cards */
--terracotta: #c4a77d      /* Accent */
--success: #5d7a5f
--warning: #b89a5a
--error: #9a6565
```

### Typography
- **Headings**: Crimson Pro (serif)
- **Body**: DM Sans (sans-serif)
- **Code/Numbers**: JetBrains Mono (monospace)

### Component Patterns
- Cards: 12-16px border-radius, subtle shadow, hover lift
- Buttons: Gradient backgrounds, shadow on hover
- Inputs: Cream background, olive focus ring
- Tables: Cream header row, hover highlight

## Automated Testing

### Running Tests

```bash
npm test              # Run all 450 tests
npm run test:coverage # With coverage report
npm test -- pricing   # Run specific test file
```

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `auth.test.js` | 14 | Login, register, logout, /me |
| `authMiddleware.test.js` | 18 | JWT verification, role authorization |
| `customers.test.js` | 15 | CRUD, pricing types, magic links |
| `orders.test.js` | 49 | CRUD, status machine, payments, idempotency |
| `products.test.js` | 22 | CRUD, soft delete, unit validation |
| `marketRates.test.js` | 20 | CRUD, trends, history |
| `pricing.test.js` | 21 | Market/markup/contract calculations, immutability |
| `invoices.test.js` | 12 | Firms, split by category, PDF generation |
| `customerIsolation.test.js` | 15 | Cross-customer access prevention |
| `security.test.js` | 27 | RBAC, privilege escalation, token security |
| `integration.test.js` | 10 | End-to-end order lifecycle |
| `edgeCases.test.js` | 49 | Pagination, validation, concurrent ops |
| `magicLink.test.js` | 18 | Token generation, auth, revocation |
| `csrf.test.js` | 18 | CSRF token validation |
| `scheduler.test.js` | 13 | Market rate scheduler |
| `supplier.test.js` | 8 | Quantity summary aggregation |

### Test Helpers (`backend/tests/setup.js`)

```javascript
testUtils.createAdminUser()              // Create admin with token
testUtils.createStaffUser()              // Create staff with token
testUtils.createCustomerUser()           // Create customer user with linked customer
testUtils.createTestCustomer(overrides)  // Create customer record
testUtils.createContractCustomer(prices) // Customer with contract prices
testUtils.createMarkupCustomer(percent)  // Customer with markup pricing
testUtils.createTestProduct(overrides)   // Create product
testUtils.createCategorizedProduct(cat)  // Product with category
testUtils.createMarketRate(product, rate)// Set market rate
testUtils.createMagicLinkJWT(customerId) // Create magic link JWT
```

### Manual Testing Checklist

#### Auth
- [ ] Login with valid credentials → redirects based on role
- [ ] Login with invalid credentials → shows error
- [ ] Register new customer → creates User + Customer records
- [ ] Logout → clears cookie, redirects to login

#### Orders
- [ ] Create order as customer → uses customer's pricing type
- [ ] Create order as staff → can select customer
- [ ] Update order status → updates timestamps
- [ ] Update payment → recalculates paymentStatus

#### Pricing
- [ ] Market pricing → uses current market rate
- [ ] Markup pricing → applies percentage to market rate
- [ ] Contract pricing → uses fixed price from customer record

## Troubleshooting

### CSRF Token Errors ("CSRF token missing")

**Symptoms**: 403 error with "CSRF token missing" when submitting forms (POST/PUT/DELETE requests).

**Root Causes & Fixes**:

1. **Missing CSRF token in fetch request**
   - Every state-changing request (POST, PUT, DELETE, PATCH) must include `X-CSRF-Token` header
   - Pattern to use in frontend:
   ```javascript
   const headers = { 'Content-Type': 'application/json' };
   const csrfToken = await Auth.ensureCsrfToken();
   if (csrfToken) {
       headers['X-CSRF-Token'] = csrfToken;
   }
   ```
   - Add retry logic for CSRF errors (see `deleteCustomer` in customer-management.html for example)

2. **Double token generation bug** (backend/middleware/csrf.js)
   - If `/api/csrf-token` returns two `Set-Cookie` headers with different values, the `getOrCreateToken` function is being called twice
   - Fix: Store token on `req._csrfToken` to prevent duplicate generation in same request cycle
   - Test: `curl -I http://localhost:3000/api/csrf-token | grep Set-Cookie` should show only ONE csrf_token cookie

3. **Service worker caching old HTML/JS**
   - The service worker caches HTML files with cache-first strategy
   - Hard refresh (Cmd+Shift+R) does NOT bypass service worker cache
   - Fix: Increment `CACHE_NAME` version in `frontend/service-worker.js` (e.g., 'pratibha-v5' → 'pratibha-v6')
   - Alternative: User can manually unregister service worker in DevTools > Application > Service Workers

**CSRF Implementation Overview**:
- Uses Double-Submit Cookie Pattern
- Cookie: `csrf_token` (non-httpOnly, readable by JS)
- Header: `X-CSRF-Token`
- Server validates cookie === header for POST/PUT/DELETE/PATCH requests
- Key files: `backend/middleware/csrf.js`, `frontend/js/api.js`, `frontend/js/auth.js`

## Preferences

<default_to_action>
By default, implement changes rather than only suggesting them. If the user's intent is unclear, infer the most useful likely action and proceed, using tools to discover any missing details instead of guessing.
</default_to_action>

<frontend_aesthetics>
Avoid generic "AI slop" aesthetics. Create distinctive, creative frontends:
- Typography: Avoid Inter, Roboto, Arial, system fonts. Use distinctive fonts.
- Color: Commit to cohesive themes. Dominant colors with sharp accents over timid palettes. Avoid purple gradients on white.
- Motion: CSS animations for page load reveals (staggered animation-delay).
- Backgrounds: Layer gradients, patterns—avoid flat solid colors.
- Vary between light/dark themes and aesthetics across generations. Avoid converging on common choices like Space Grotesk.
</frontend_aesthetics>
