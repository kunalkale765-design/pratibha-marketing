# CHANGES.md

Tracking all UI/UX and feature changes made during the review session.

---

## Login Page (`frontend/login.html`)

| Change | Before | After | Status |
|--------|--------|-------|--------|
| Logo emoji | 🌿 emoji before text | Text only "Pratibha Marketing" | Done |
| Email field | "Email Address" with email input | "Username" with text input | Done |
| Back to Home link | Had "← Back to Home" link | Removed | Done |
| Post-login redirect | Redirect to market-rates.html | Redirect to dashboard (index.html) | Done |

**Notes:**
- Page serves as backup for customers and owner (hotels get direct links via magic link)
- Backend accepts any username (min 3 characters, stored in email field)

---

## Signup Page (`frontend/signup.html`)

| Change | Before | After | Status |
|--------|--------|-------|--------|
| Logo emoji | 🌿 emoji before text | Text only "Pratibha Marketing" | Done |
| Email field | "Email Address" | "Username" | Done |
| Password length | Min 12 characters | Min 6 characters | Done |
| Username validation | Required email format | Any text (min 3 chars) | Done |

---

## Dashboard (`frontend/index.html`)

| Change | Before | After | Status |
|--------|--------|-------|--------|
| Logo emoji | 🌿 emoji before text | Text only "Pratibha Marketing" | Done |
| Stats cards | 4 stats cards at top | Removed entirely | Done |
| Quick actions | Below stats cards | At the top, 2x2 grid on mobile, 4 cols on tablet+ | Done |
| Action descriptions | Long descriptions | Shortened descriptions | Done |
| Purchase list | None | Expandable list below quick actions | Done |
| Primary action | "Rates & Procurement" | "Create Order" | Done |
| Rate input | None | Inline rate input per product with save button | Done |
| Layout order | Stats → Quick Actions | Quick Actions → Purchase List | Done |
| Stat cards | 4 stats cards (orders, customers, products, pending) | 2 cards: Total Sale + Profit | Done |

---

## Market Rates (`frontend/market-rates.html`)

| Change | Before | After | Status |
|--------|--------|-------|--------|
| Layout | Complex with stats, orders, expandable list | Simple product list with rate inputs | Done |
| Logo emoji | 🌿 emoji | Text only "Pratibha Marketing" | Done |
| Stats row | 3 stats cards | Removed | Done |
| Orders window | 5 recent orders | Removed | Done |
| Print/Export | On this page | Moved to dashboard | Done |
| Product display | Expandable rows | Simple rows: Name, unit, rate input | Done |
| Rate input | Small input | Larger mobile-friendly input (100px) | Done |
| Auto clear zero | None | Clears on focus, restores on blur | Done |
| Bottom bar | Hidden until changes | Always visible with change count | Done |
| Mobile friendly | Basic | Large touch targets, no spin buttons | Done |

---

## Order Form (`frontend/customer-order-form.html`)

| Change | Before | After | Status |
|--------|--------|-------|--------|
| Layout | Table with columns | Simple vertical list | Done |
| Logo emoji | 🥬 emoji | Text only "Pratibha Marketing" | Done |
| Product display | Table row with columns | Name + unit, qty controls | Done |
| Category tabs | None | Scrollable category pills | Done |
| Quantity controls | Small +/- buttons | 44px touch targets, no spinners | Done |
| Inputs | Basic styling | 48px min-height customer select, search | Done |
| Auto clear zero | None | Clears on focus | Done |
| Bottom bar | Items + Total + Place Order | Items only + Place Order | Done |
| Safe area | None | Bottom padding for notched phones | Done |
| Customer fix | Couldn't find customer | Uses auth/me customer data directly | Done |

---

## Orders (`frontend/orders.html`)

| Change | Before | After | Status |
|--------|--------|-------|--------|
| Logo emoji | Had emoji before text | Text only "Pratibha Marketing" | Done |
| Layout | Table layout | Card layout for mobile | Done |
| Filters | Dropdown select | Scrollable filter pills | Done |
| Order detail | Full page | Bottom sheet modal | Done |
| Price editing | Not available | Editable selling price per product | Done |
| Purchase price | Not shown | Shows market rate for reference | Done |
| Live total | Not available | Updates as prices change | Done |
| Status dropdown | Had status select + Update button | Removed (only Save Changes button) | Done |
| Save button | Hidden until changes | Full-width, disabled until changes | Done |
| Mobile touch | Basic | Large inputs, pills, search (48px min) | Done |
| Price layout | Stacked rows | Side-by-side boxes (Purchase / Selling) | Done |

---

## Customer Management (`frontend/customer-management.html`)

| Change | Before | After | Status |
|--------|--------|-------|--------|
| Logo | Emoji logo (🌿) with gradient | Text only "Pratibha Marketing" | Done |
| Header | Gradient with decorative border | Simple dark header | Done |
| Layout | Desktop-focused with max-width | Mobile-first full-width | Done |
| Modals | Center positioned | Bottom sheet (slides up) | Done |
| Customer cards | Side-by-side layout | Stacked mobile layout | Done |
| Action buttons | Icon buttons | Full-width text buttons | Done |
| Inputs | Basic styling | Large touch targets (48px min) | Done |
| Modal buttons | Side by side small | Full-width large (52px) | Done |
| Background | Noise texture overlay | Clean cream background | Done |
| Close on overlay | Not available | Tap outside to close | Done |

---

## Products (`frontend/products.html`)

| Change | Before | After | Status |
|--------|--------|-------|--------|
| Logo | Emoji logo (🌿) with gradient | Text only "Pratibha Marketing" | Done |
| Header | Gradient with decorative border | Simple dark header | Done |
| Layout | Desktop-focused with max-width | Mobile-first full-width | Done |
| Modal | Center positioned | Bottom sheet (slides up) | Done |
| Product cards | Grid layout with hover effects | Compact row with edit/delete icons | Done |
| Inputs | Basic styling | Large touch targets (48px min) | Done |
| Background | Noise texture overlay | Clean cream background | Done |
| Base price | Had base price field | Removed | Done |
| Stock fields | Had stock and min stock | Removed | Done |
| Categories | Hardcoded enum in DB | Dynamic, user-manageable | Done |
| Category filter | Dropdown select | Scrollable pills + "Categories" button | Done |
| Category modal | None | Add/view/delete categories | Done |

---

## Supplier Dashboard (`frontend/supplier-dashboard.html`)

| Change | Before | After | Status |
|--------|--------|-------|--------|
| Page | Existed | Deleted | Done |

---

## Backend Changes

| File | Change | Status |
|------|--------|--------|
| Workers feature | Skipped - not needed for now | Decided |
| `backend/models/User.js` | Password min length 12 → 6 | Done |
| `backend/routes/auth.js` | Password validation 12 → 6 | Done |
| `backend/models/Order.js` | Removed `required: true` from orderNumber (allows pre-save hook to generate) | Done |
| `backend/routes/orders.js` | Added `PUT /api/orders/:id` route to update order products/prices | Done |
| `backend/routes/supplier.js` | Fixed ObjectId error - use `new mongoose.Types.ObjectId()` | Done |
| `backend/routes/customers.js` | Made phone field optional (was required) | Done |
| `backend/routes/customers.js` | DELETE route now allows staff (was admin-only) | Done |
| `backend/routes/customers.js` | GET now defaults to active customers only (soft-deleted hidden) | Done |
| `frontend/customer-management.html` | Fixed null check for optional phone in search/display | Done |
| `frontend/customer-management.html` | Removed credit limit feature (input, display, CSS) | Done |
| `backend/models/Product.js` | Removed basePrice, stockQuantity, minStockLevel fields | Done |
| `backend/models/Product.js` | Changed category from enum to free-form string | Done |
| `frontend/index.html` | Fixed purchase list - removed basePrice references (uses market rate or 0) | Done |
| `frontend/index.html` | Fixed exportCSV - added missing procurementMap | Done |
| `frontend/customer-order-form.html` | Fixed getPrice - removed basePrice reference | Done |
| `frontend/customer-management.html` | Fixed contract pricing display - removed basePrice reference | Done |
| `frontend/market-rates.html` | Fixed rate display - removed basePrice fallback | Done |
| `frontend/service-worker.js` | Removed supplier-dashboard.html from cache, bumped to v5 | Done |
| `CLAUDE.md` | Removed supplier-dashboard.html reference, updated auth redirects | Done |
| `backend/routes/orders.js` | Removed all basePrice fallbacks, uses market rate or 0 | Done |
| `backend/routes/marketRates.js` | Removed product.basePrice update on rate save | Done |
| `backend/routes/supplier.js` | Removed low-stock route (used removed fields) | Done |
| `backend/seed.js` | Removed basePrice/stock fields from products, uses defaultRates map | Done |
| `backend/routes/customers.js` | Fixed contractPrices Map update - now properly converts object to Map | Done |
| `backend/routes/auth.js` | Populate customer on login, added magic link auth endpoint | Done |
| `backend/middleware/auth.js` | Support magic link tokens (customer-only sessions) | Done |
| `backend/models/Customer.js` | Added magicLinkToken and magicLinkCreatedAt fields | Done |
| `frontend/customer-order-form.html` | Show prices per product, handle magic link URL tokens | Done |
| `frontend/customer-management.html` | Added "Link" button to share magic order links | Done |
| `backend/models/User.js` | Removed email format validation, now accepts any username (min 3 chars) | Done |
| `backend/routes/auth.js` | Register/login now accept username without email format | Done |

---

## New Features

### Magic Link Authentication
Customers can now receive a direct link to place orders without logging in:
- Staff generates link from Customer Management → "Link" button
- Link is copied to clipboard and can be shared via WhatsApp/SMS
- Clicking link auto-authenticates customer for 24 hours
- Customer sees their prices (market/markup/contract) and can place orders
- No user account required - uses customer record directly

---

## Design System Changes

| Element | Before | After | Status |
|---------|--------|-------|--------|

---

*Last updated: January 9, 2026 (Username accepts any text, magic link feature, contract prices fix)*
