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

## Architecture

### Backend (Node.js/Express)

```
backend/
├── server.js              # Express app entry, middleware stack, route mounting
├── config/database.js     # MongoDB connection via Mongoose
├── middleware/
│   ├── auth.js            # JWT auth: protect(), authorize(), optionalAuth()
│   └── errorHandler.js    # Global error handling
├── models/                # Mongoose schemas
│   ├── User.js            # Users with roles: admin, staff, customer
│   ├── Customer.js        # Business customers with pricing tiers
│   ├── Order.js           # Orders with items, status, payment tracking
│   ├── Product.js         # Product inventory
│   └── MarketRate.js      # Daily market pricing
└── routes/
    ├── auth.js            # /api/auth - login, register, logout, /me
    ├── customers.js       # /api/customers - CRUD + payments
    ├── orders.js          # /api/orders - CRUD + status/payment updates
    ├── products.js        # /api/products - CRUD + stock management
    ├── marketRates.js     # /api/market-rates - pricing updates
    └── supplier.js        # /api/supplier - supplier dashboard data
```

**Security stack**: Helmet, CORS, rate limiting (100 req/15min, 10 for auth), express-mongo-sanitize, HPP.

**Auth flow**: JWT stored in httpOnly cookie, verified via `protect` middleware. Roles restrict access via `authorize('admin', 'staff')`.

### Frontend (Vanilla JS + Tailwind)

```
frontend/
├── js/
│   ├── api.js             # Centralized fetch wrapper with error handling
│   └── auth.js            # Auth state management, token verification
├── index.html             # Admin dashboard with stats
├── login.html / signup.html
├── customer-order-form.html   # Customer-facing order form
├── customer-management.html   # Staff: manage customers
├── orders.html                # Staff: view/manage orders
├── products.html              # Staff: product inventory
├── market-rates.html          # Staff: daily pricing updates
├── supplier-dashboard.html    # Supplier: quantity summaries
├── service-worker.js          # PWA offline support
└── manifest.json              # PWA manifest
```

**Auth redirects**: Staff → market-rates.html (daily workflow), Customers → customer-order-form.html.

### Key Patterns

- API responses follow `{ success: boolean, data?, message?, error? }` format
- Frontend `API` object wraps all fetch calls with credential handling and 401 redirect
- `Auth.requireAuth(['admin', 'staff'])` gates pages by role
- All HTML pages are self-contained with inline Tailwind + JS

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
