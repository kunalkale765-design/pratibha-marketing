# PRATIBHA MARKETING APP - FINAL DESIGN DOCUMENT

> **Version:** 1.0
> **Date:** January 26, 2026
> **Author:** Kunal

---

## Executive Summary

Pratibha Marketing App is a complete supply chain management solution for a wholesale produce distribution business based in Nagpur, India. The system handles the entire order-to-delivery lifecycle for fresh vegetables and fruits sold to hotels, restaurants, and commercial establishments.

**Key Stats:**
- 11 Database Models | 40+ API Endpoints | 9 Frontend Pages
- 450+ Automated Tests | Multi-firm Invoicing | IST Timezone-aware

---

## 1. Business Purpose

### Problem Solved
Managing wholesale produce distribution requires coordinating:
- Customer orders with personalized pricing
- Daily procurement based on aggregated demand
- Batch-based logistics for efficient delivery
- Accurate invoicing with quantity reconciliation
- Customer payment and balance tracking

### Target Users
| Role | Users | Primary Activities |
|------|-------|-------------------|
| **Admin** | Business owners | Full control, financial oversight, user management |
| **Staff** | Warehouse/logistics team | Order processing, packing, delivery coordination |
| **Customer** | Hotels, restaurants | Placing orders, viewing order history, downloading invoices |

### Geographic Focus
- India (IST timezone for all business logic)
- Multi-firm operation (Pratibha Marketing + Vikas Frozen Foods)

---

## 2. System Architecture

### Tech Stack
```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  Vanilla JS (ES6) + Vite + HTML + CSS                       │
│  PWA with Service Worker (Offline Support)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                               │
│  Node.js + Express.js                                        │
│  JWT Auth (httpOnly cookies) | CSRF Protection              │
│  Rate Limiting | Helmet | CORS                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       DATABASE                               │
│  MongoDB (Atlas) + Mongoose ODM                             │
│  11 Models | Atomic Counters | Soft Deletes                 │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure
```
pratibha-marketing-app/
├── backend/
│   ├── server.js              # Express entry point
│   ├── config/
│   │   ├── database.js        # MongoDB connection
│   │   └── companies.js       # Multi-firm configuration
│   ├── middleware/
│   │   ├── auth.js            # JWT + role authorization
│   │   ├── csrf.js            # CSRF protection
│   │   └── errorHandler.js    # Global error handling
│   ├── models/                # 11 Mongoose models
│   ├── routes/                # 12 route files
│   ├── services/
│   │   ├── batchScheduler.js  # Auto-confirm at 8 AM
│   │   ├── deliveryBillService.js
│   │   └── invoiceService.js
│   ├── storage/               # PDFs (bills, invoices)
│   └── tests/                 # 450+ tests
├── frontend/
│   ├── src/
│   │   ├── index.html         # Dashboard
│   │   ├── pages/             # 9 feature pages
│   │   ├── js/
│   │   │   ├── api.js         # HTTP client
│   │   │   ├── auth.js        # Auth state
│   │   │   ├── ui.js          # DOM helpers
│   │   │   └── pages/         # Page-specific scripts
│   │   ├── assets/
│   │   │   ├── css/           # Design system
│   │   │   └── icons/
│   │   └── service-worker.js  # PWA caching
│   └── FRONTEND_RULES.md
├── CLAUDE.md                  # Technical reference
├── FEATURES.md                # UI/UX specifications
└── DESIGN_DOCUMENT.md         # This file
```

---

## 3. Core Features

### 3.1 Customer Management
Manage business customers with personalized pricing models.

**Pricing Types:**
| Type | Calculation | Use Case |
|------|-------------|----------|
| **Market** | Current daily market rate | New/standard customers |
| **Markup** | Market rate + X% | Premium service customers |
| **Contract** | Fixed negotiated prices | Long-term partners |

**Customer Features:**
- CRUD operations with soft delete
- Outstanding balance tracking (ledger integration)
- Magic link tokens for passwordless authentication
- Test customer flag (excluded from production reports)
- Phone and WhatsApp contact fields

### 3.2 Order Management
Complete order lifecycle from placement to delivery.

**Order Flow:**
```
┌─────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│ PENDING │ ──▶ │ CONFIRMED │ ──▶ │  PACKED   │ ──▶ │ DELIVERED │
└─────────┘     └───────────┘     └───────────┘     └───────────┘
     │               │                                     │
     │               └──────────────────────┐              │
     │                                      ▼              │
     │                              ┌───────────┐          │
     └──────────────────────────▶  │ CANCELLED │          │
                (admin only)       └───────────┘          │
                                                          ▼
                                                   ┌───────────┐
                                                   │ INVOICED  │
                                                   └───────────┘
```

**Order Features:**
- Auto-generated order numbers (ORD{YYMM}{0001})
- Idempotency key for duplicate prevention
- Customer can edit pending orders
- Staff can update prices (except contract)
- Payment tracking (unpaid → partial → paid)
- Delivery address override
- Order notes

### 3.3 Product Catalog
Manage products with categories and units.

**Product Attributes:**
- Name (unique)
- Unit: kg, piece, bunch, box, bag, quintal, ton
- Category: Indian Vegetables, Fruits, Frozen, etc.
- Active/inactive status

### 3.4 Market Rates
Daily pricing with trend tracking.

**Rate Features:**
- Current and previous rate tracking
- Automatic trend calculation (up/down/stable)
- Change percentage calculation
- IST effective date tracking
- Source and notes fields

### 3.5 Batch System
Time-based order grouping for efficient procurement.

**Batch Schedule (IST):**
| Orders Placed | Batch | Auto-Confirm |
|---------------|-------|--------------|
| Before 8 AM | 1st Batch | 8:00 AM same day |
| 8 AM - 12 PM | 2nd Batch | Manual |
| After 12 PM | 1st Batch (next day) | 8:00 AM next day |

**Batch Features:**
- Automatic batch creation and assignment
- Scheduled auto-confirmation (8 AM IST)
- Manual confirmation for 2nd batch
- Quantity summary by product
- Delivery bill generation on confirm

### 3.6 Packing Workflow
Track order fulfillment from warehouse.

**Packing Process:**
1. View queue of confirmed orders
2. Pack items one by one (track individual status)
3. Adjust quantities if needed (damage, shortage)
4. Mark order as packing complete
5. Reprint delivery bill with updated quantities

### 3.7 Reconciliation
Verify delivered quantities and finalize orders.

**Reconciliation Process:**
1. Review ordered vs. delivered quantities
2. Enter actual delivered amounts
3. System creates ledger entry (invoice)
4. Customer balance updated
5. Order status → delivered
6. Invoices auto-generated

### 3.8 Multi-Firm Invoicing
Automatic item split based on product category.

**Firm Configuration:**
| Firm | Product Categories |
|------|-------------------|
| Pratibha Marketing | All except Fruits/Frozen |
| Vikas Frozen Foods | Fruits, Frozen |

**Invoice Features:**
- Auto-split items by category → firm
- Unique sequential numbers (INV{YYMM}{0001})
- PDF generation with firm branding
- Customer can download own invoices
- Staff can regenerate/reprint

### 3.9 Delivery Bills
Pre-delivery documentation generated on batch confirm.

**Delivery Bill Features:**
- Generated when batch confirms (before packing)
- Original + Duplicate copies per firm
- Uses ordered quantities (not reconciled)
- Bill number format: BILL{YYMM}{0001}
- Prices updated for market/markup customers

### 3.10 Ledger & Payments
Financial tracking and balance management.

**Ledger Entry Types:**
| Type | Amount | Trigger |
|------|--------|---------|
| Invoice | Positive (owes) | Order reconciliation |
| Payment | Negative (paid) | Payment recording |
| Adjustment | Either | Admin correction |

**Balance Tracking:**
- Running balance per customer
- Positive = customer owes money
- Negative = credit/overpayment
- Updated on every ledger entry

### 3.11 Dashboard & Procurement
Staff overview and procurement management.

**Dashboard Features:**
- Sales and order statistics
- Quick action cards
- Two-section Purchase List:
  - **To Procure:** Products needing purchase (no rate today)
  - **Procured:** Products with rate saved today
- Real-time polling (30-second refresh)
- Sound alerts for new orders
- Category filtering (Vegetables, Fruits)
- Search, print, export to CSV

---

## 4. User Flows

### 4.1 Customer Places Order
```
1. Customer receives magic link via WhatsApp
2. Clicks link → auto-authenticated (24h session)
3. Sees product list organized by category
4. Adds quantities using +/- buttons
5. NO PRICES SHOWN (business policy)
6. Reviews cart and submits order
7. System applies customer's pricing type
8. Order created with status: pending
```

### 4.2 Staff Processes Orders (Daily Workflow)
```
Morning:
1. Orders received overnight → 1st batch
2. 8 AM: Batch auto-confirms
3. Delivery bills generated (prices locked)
4. Staff views procurement summary

Midday:
5. 2nd batch orders collected (8 AM - 12 PM)
6. Staff manually confirms 2nd batch
7. Additional delivery bills generated

Afternoon:
8. Staff opens packing queue
9. Packs each order, marks items complete
10. Adjusts quantities if needed

Evening:
11. Drivers deliver orders
12. Staff reconciles delivered quantities
13. Ledger entries created automatically
14. Invoices generated and stored
```

### 4.3 Payment Recording
```
1. Customer makes payment (cash/bank)
2. Staff opens customer management
3. Records payment amount
4. Ledger entry created (payment type)
5. Customer balance reduced
6. Receipt can be generated
```

---

## 5. Database Models

### Entity Relationship Diagram
```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│     User     │──────▶│   Customer   │◀──────│ LedgerEntry  │
│  (auth)      │       │  (pricing)   │       │  (balance)   │
└──────────────┘       └──────────────┘       └──────────────┘
                              │                      ▲
                              │                      │
                              ▼                      │
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Product    │◀─────▶│    Order     │──────▶│   Invoice    │
│  (catalog)   │       │  (lifecycle) │       │   (billing)  │
└──────────────┘       └──────────────┘       └──────────────┘
       │                      │
       │                      │
       ▼                      ▼
┌──────────────┐       ┌──────────────┐
│  MarketRate  │       │    Batch     │
│  (pricing)   │       │  (grouping)  │
└──────────────┘       └──────────────┘
```

### Model Summary
| Model | Purpose | Key Fields |
|-------|---------|------------|
| **User** | Authentication | email, password, role, customer ref |
| **Customer** | Business accounts | name, pricingType, contractPrices, balance |
| **Product** | Catalog items | name, unit, category, isActive |
| **Order** | Transactions | orderNumber, products[], status, paymentStatus |
| **MarketRate** | Daily pricing | product, rate, trend, effectiveDate |
| **Batch** | Order grouping | batchNumber, date, status, cutoffTime |
| **LedgerEntry** | Financials | type, amount, balance, customer |
| **Invoice** | Billing docs | invoiceNumber, firm, items[], pdfPath |
| **Counter** | Sequential IDs | name, seq |
| **RevokedToken** | JWT blacklist | jti, expiresAt |

---

## 6. API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | /register | Public | Create customer account |
| POST | /login | Public | Login, returns JWT cookie |
| POST | /logout | Public | Clear JWT cookie |
| GET | /me | Private | Get current user |
| GET | /magic/:token | Public | Magic link auth |

### Customers (`/api/customers`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | / | Staff+ | List customers |
| GET | /:id | Staff+ | Get customer |
| POST | / | Staff+ | Create customer |
| PUT | /:id | Staff+ | Update customer |
| DELETE | /:id | Staff+ | Soft delete |
| POST | /:id/payment | Staff+ | Record payment |
| POST | /:id/magic-link | Staff+ | Generate magic link |

### Orders (`/api/orders`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | / | Private | List orders (role-filtered) |
| GET | /:id | Private | Get order |
| POST | / | Private | Create order |
| PUT | /:id | Staff+ | Update prices |
| PUT | /:id/customer-edit | Customer | Edit pending order |
| PUT | /:id/status | Staff+ | Update status |
| DELETE | /:id | Admin | Cancel order |

### Procurement (`/api/supplier`)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | /procurement-summary | Staff+ | Two-section purchase list |
| GET | /quantity-summary | Staff+ | Aggregate quantities |
| GET | /batch-summary | Staff+ | Batch-wise breakdown |

### Operations
| Route | Key Endpoints |
|-------|---------------|
| `/api/batches` | GET /today, POST /:id/confirm, GET /:id/bills |
| `/api/packing` | GET /queue, PUT /:orderId/item/:productId, POST /:orderId/done |
| `/api/reconciliation` | GET /pending, POST /:orderId/complete |
| `/api/invoices` | POST /:orderId/pdf, GET /:invoiceNumber/download |
| `/api/ledger` | GET /balances, POST /payment, GET /statement/:customerId |

---

## 7. Design System

### Color Palette
```css
/* Primary */
--gunmetal: #2e3532;        /* Headers, dark text */
--dusty-olive: #7e9181;     /* Brand, buttons */
--dusty-olive-dark: #5d6b5f; /* Hover states */

/* Neutral */
--cream: #f9f7f3;           /* Page background */
--warm-white: #fefdfb;      /* Card backgrounds */

/* Accent */
--terracotta: #c4a77d;      /* Highlights, badges */

/* Status */
--success: #5d7a5f;         /* Confirmed, positive */
--warning: #b89a5a;         /* Pending, attention */
--error: #9a6565;           /* Cancelled, negative */
```

### Typography
| Use | Font | Size |
|-----|------|------|
| Headings | Crimson Pro (serif) | 20-28px |
| Body | DM Sans (sans-serif) | 14-16px |
| Numbers | JetBrains Mono (mono) | 14-22px |

### Component Patterns
- **Cards:** 12-16px radius, subtle shadow, hover lift
- **Buttons:** Gradient backgrounds, shadow on hover
- **Inputs:** Cream background, olive focus ring
- **Tables:** Cream header, hover highlight
- **Modals:** Bottom sheet on mobile, centered on desktop

### Animations
- Skeleton shimmer for loading states
- Card fade-in with stagger
- Button spinner during submission
- Swipe-to-action on mobile cards
- Toast slide-in notifications

---

## 8. Unique Features

### 1. IST Timezone-Aware Batch System
All batch logic uses India Standard Time (UTC+5:30). Batch cutoffs, auto-confirmation, and procurement classification all respect IST boundaries.

### 2. Magic Link Authentication
Passwordless access for customers via secure 64-character tokens. Links expire after 24 hours and can be regenerated by staff.

### 3. Multi-Firm Invoice Splitting
Automatic categorization of products to respective firms. Invoices generated with firm-specific branding.

### 4. Dual Bills & Invoices
- **Delivery Bills:** Ordered quantities (pre-delivery)
- **Invoices:** Reconciled quantities (post-delivery)

### 5. Contract Price Immutability
Contract prices locked at order creation. Staff cannot edit, ensuring negotiated rates are honored.

### 6. Idempotent Order Creation
Prevents duplicate orders on network retries using unique idempotency keys.

### 7. Two-Section Procurement Dashboard
Real-time view of what to procure vs. already procured, with sound alerts for new orders.

### 8. Token Version System
All user JWTs invalidated on password change, preventing session hijacking.

---

## 9. Security Implementation

| Feature | Implementation |
|---------|----------------|
| Authentication | JWT in httpOnly cookies (30d expiry) |
| Authorization | Role-based middleware (admin/staff/customer) |
| CSRF Protection | Double-submit cookie pattern |
| Rate Limiting | 100 req/15min general, 10 auth |
| Input Validation | express-validator on all routes |
| Data Sanitization | express-mongo-sanitize |
| Security Headers | Helmet.js |
| Token Revocation | JTI blacklist on logout |
| Password Storage | bcrypt with salt rounds |

---

## 10. Testing

### Test Coverage
- **450+ automated tests**
- **16 test files**
- **>90% backend coverage**

### Test Categories
| Category | Tests | Files |
|----------|-------|-------|
| Authentication | 50 | auth.test.js, authMiddleware.test.js, magicLink.test.js |
| Orders | 49 | orders.test.js |
| Pricing | 21 | pricing.test.js |
| Security | 27 | security.test.js, customerIsolation.test.js, csrf.test.js |
| Edge Cases | 49 | edgeCases.test.js |
| Integration | 10 | integration.test.js |

### Running Tests
```bash
npm test              # Run all tests
npm run test:coverage # With coverage report
npm test -- pricing   # Run specific file
```

---

## 11. Deployment

### Production Stack
```
┌────────────────────────────────────────────┐
│              Digital Ocean                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Nginx   │─▶│   PM2    │─▶│  Node.js │ │
│  │ (SSL/    │  │ (process │  │  (app)   │ │
│  │  proxy)  │  │  manager)│  │          │ │
│  └──────────┘  └──────────┘  └──────────┘ │
└────────────────────────────────────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │  MongoDB Atlas   │
            │  (Cloud DB)      │
            └──────────────────┘
```

### Environment Variables
```bash
MONGODB_URI          # MongoDB connection string
JWT_SECRET           # JWT signing secret (required)
NODE_ENV             # development | production
PORT                 # Default: 5000
ALLOWED_ORIGINS      # CORS whitelist
SENTRY_DSN           # Error monitoring (optional)
```

### Deploy Command
```bash
./deploy.sh          # Deploy to Digital Ocean
```

---

## 12. Business Rules Summary

### Pricing Rules
1. Market customers get current daily rate
2. Markup customers get rate + X%
3. Contract customers get fixed negotiated rates
4. Contract prices cannot be edited after order creation
5. Prices update for market/markup on batch confirmation

### Order Rules
1. Only admin can cancel orders
2. Customers can edit quantities only in pending status
3. Status flow: pending → confirmed → delivered
4. Idempotency prevents duplicate orders
5. Payment status auto-calculated from paid amount

### Batch Rules
1. 1st batch auto-confirms at 8 AM IST
2. 2nd batch requires manual confirmation
3. Orders after 12 PM go to next day's 1st batch
4. Delivery bills generated on batch confirm

### Financial Rules
1. Ledger entries create running balance
2. Positive balance = customer owes money
3. Only admin can make adjustments
4. Reconciliation creates invoice ledger entry

---

## 13. Future Enhancements

### Planned Features
- [ ] Email/SMS notifications (SendGrid + MSG91)
- [ ] Advanced report exports (CSV/PDF)
- [ ] Inventory stock tracking with alerts
- [ ] Customer self-service payment recording
- [ ] Mobile app (React Native)

### Technical Debt
- [ ] Migrate from window.Auth global
- [ ] Add real-time WebSocket updates
- [ ] Implement background job queue (Bull)
- [ ] Add request tracing (correlation IDs)

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 26, 2026 | Initial design document |

---

*This document represents the final design of the Pratibha Marketing App as of January 2026.*
