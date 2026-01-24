# Frontend Rules of Law

Enforceable conventions for the Pratibha Marketing frontend. All new code must follow these rules.

---

## 1. File & Naming Conventions

### Directory Structure

```
frontend/src/
├── index.html                          # Dashboard (staff/admin landing)
├── pages/
│   ├── auth/
│   │   ├── login.html
│   │   ├── signup.html
│   │   └── reset-password.html
│   ├── orders/index.html               # Staff order management
│   ├── order-form/index.html           # Customer order form
│   ├── customers/index.html
│   ├── products/index.html
│   ├── market-rates/index.html
│   ├── packing/index.html
│   ├── reconciliation/index.html
│   └── {new-feature}/index.html        # Pattern for new pages
├── js/
│   ├── api.js                          # Fetch wrapper (shared)
│   ├── auth.js                         # Auth state (shared)
│   ├── csrf.js                         # CSRF tokens (shared)
│   ├── ui.js                           # DOM helpers (shared)
│   ├── utils.js                        # Formatters/helpers (shared)
│   ├── init.js                         # Page bootstrap (shared)
│   ├── helpers/                        # Page-specific extracted helpers
│   │   └── {feature}.js
│   └── pages/
│       ├── dashboard.js                # index.html logic
│       ├── login.js
│       ├── signup.js
│       ├── orders.js
│       ├── order-form.js
│       ├── customers.js
│       ├── products.js
│       ├── market-rates.js
│       ├── packing.js
│       ├── reconciliation.js
│       └── {new-feature}.js            # 1:1 with HTML page
├── assets/
│   ├── css/
│   │   ├── variables.css               # Design tokens
│   │   ├── base.css                    # Resets + typography
│   │   ├── components.css              # Shared components
│   │   ├── utilities.css               # Utility classes
│   │   ├── responsive.css              # Breakpoints
│   │   ├── animations/                 # Grouped by concern
│   │   │   ├── skeleton.css
│   │   │   ├── buttons.css
│   │   │   ├── cards.css
│   │   │   ├── inputs.css
│   │   │   ├── badges.css
│   │   │   ├── segments.css
│   │   │   ├── swipe.css
│   │   │   ├── page.css
│   │   │   ├── toasts.css
│   │   │   ├── modals.css
│   │   │   └── nav.css
│   │   └── pages/                      # Page-specific overrides
│   │       ├── index.css
│   │       ├── login.css
│   │       ├── orders.css
│   │       └── ...
│   ├── icons/
│   └── sounds/
├── service-worker.js
└── manifest.json
```

### Naming Rules

| Entity | Convention | Example |
|--------|-----------|---------|
| HTML pages | `kebab-case/index.html` in feature dir | `pages/market-rates/index.html` |
| Page JS | `kebab-case.js` matching page dir name | `js/pages/market-rates.js` |
| Page CSS | `kebab-case.css` matching page dir name | `css/pages/market-rates.css` |
| Shared JS | `camelCase.js` single-word or short | `api.js`, `csrf.js`, `utils.js` |
| Shared CSS | `kebab-case.css` by concern | `components.css`, `responsive.css` |
| CSS variables | `--kebab-case` | `--dusty-olive-dark` |
| JS exports | `camelCase` for functions, `PascalCase` for classes/objects | `formatCurrency()`, `API` |
| DOM IDs | `camelCase` | `loginForm`, `submitBtn` |
| CSS classes | `kebab-case` | `.order-card`, `.btn-primary` |

---

## 2. JS Organization Rules

### Module Architecture

```
┌─────────────────────────────────────────────────┐
│                  Page Script                      │
│  (js/pages/orders.js)                            │
│  - Page state, DOM bindings, event handlers      │
│  - Imports only what it needs from shared        │
├─────────────────────────────────────────────────┤
│              Shared Modules (js/)                 │
│  api.js ← csrf.js                                │
│  auth.js ← csrf.js                               │
│  ui.js (standalone)                              │
│  utils.js (standalone)                           │
│  init.js ← ui.js                                 │
├─────────────────────────────────────────────────┤
│              Browser APIs / DOM                   │
└─────────────────────────────────────────────────┘
```

### Hard Rules

1. **One page script per HTML page.** No multi-script pages. The page script is the orchestrator.

2. **No globals except `window.Auth`.** The `window.Auth` pattern exists for legacy reasons (will be removed). New shared state must use ES module exports, never `window.*`.

3. **Page scripts must not import other page scripts.** If two pages share logic, extract to a shared module or `js/helpers/`.

4. **Shared modules must be stateless or singleton.** `api.js` and `auth.js` are singletons (one instance). `utils.js` and `ui.js` are pure functions. No shared mutable state between pages.

5. **Max 400 lines per page script.** If exceeded, extract a domain-specific helper to `js/helpers/{feature}.js`.

6. **Imports at the top, exports at the bottom.** No mid-file imports.

7. **Async init pattern for every page:**
   ```javascript
   // js/pages/example.js
   import { API } from '/js/api.js';
   import { showToast } from '/js/ui.js';

   // --- State ---
   let items = [];

   // --- DOM refs ---
   const listEl = document.getElementById('itemList');

   // --- Functions ---
   async function loadItems() { /* ... */ }
   function renderItems() { /* ... */ }

   // --- Event listeners ---
   listEl.addEventListener('click', handleClick);

   // --- Init ---
   await loadItems();
   renderItems();
   ```

8. **Error boundaries at page level.** Wrap the init block in try/catch with user-facing error UI.

### Dependency Graph Rule

```
Page scripts → Shared modules → csrf.js (leaf)
     ↓
  js/helpers/      (Never circular)
```

No shared module may import from `js/pages/` or `js/helpers/`.

---

## 3. Shared JS Strategy

### When to Create a New Shared Module

| Signal | Action |
|--------|--------|
| 3+ pages use the same logic | Extract to `js/{name}.js` |
| Page script > 400 lines | Extract helpers to `js/helpers/{page}.js` |
| Complex data transformation | Extract to `js/helpers/{domain}.js` |
| New API domain (e.g., invoices) | Consider a thin wrapper in the page script first |

### Shared Module Inventory Cap

**Max 8 shared modules in `js/`.** Currently at 6 (api, auth, csrf, ui, utils, init). Adding more than 2 new ones signals over-abstraction. Page-specific helpers go in `js/helpers/`.

### Module Responsibilities

| Module | Purpose | Stateful? |
|--------|---------|-----------|
| `api.js` | Fetch wrapper, error handling, CSRF header injection | Singleton |
| `auth.js` | Login/logout, user state, role checks, auth redirects | Singleton |
| `csrf.js` | CSRF token read/refresh from cookies | Singleton (internal promise) |
| `ui.js` | Toast, modal helpers, skeleton show/hide | Pure functions |
| `utils.js` | Date formatting, debounce, currency formatting | Pure functions |
| `init.js` | Service worker registration, logout button, modal escape | Pure functions |

---

## 4. CSS Discipline Rules

### Import Order (must be consistent across all pages)

```html
<link rel="stylesheet" href="/assets/css/variables.css">
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/components.css">
<link rel="stylesheet" href="/assets/css/utilities.css">
<link rel="stylesheet" href="/assets/css/responsive.css">
<!-- Animations: only include what the page uses -->
<link rel="stylesheet" href="/assets/css/animations/cards.css">
<!-- Page-specific: always last -->
<link rel="stylesheet" href="/assets/css/pages/orders.css">
```

### Hard Rules

1. **No inline styles in HTML.** Exception: dynamic values set via JS (e.g., `el.style.transform`).

2. **No `!important`.** If specificity is a problem, the selector structure is wrong.

3. **All colors via CSS variables.** Never use raw hex/rgb in page CSS. Add new colors to `variables.css`.

4. **Component classes are self-contained.** `.order-card` must not depend on being inside `.orders-page`. Use page CSS only for layout/positioning overrides.

5. **Mobile-first media queries.** Base styles are mobile. `@media (min-width: ...)` for larger screens. All in `responsive.css` or page-specific files.

6. **Max 150 lines per page CSS file.** If exceeded, the component needs extraction to `components.css`.

7. **Animation CSS: import only what you use.** Don't import all animation files on every page.

### Animation Usage Map

| Animation File | Pages That Use It |
|----------------|-------------------|
| `skeleton.css` | Dashboard, Orders, Products, Market Rates, Customers, Packing, Reconciliation |
| `cards.css` | Dashboard, Orders, Products, Market Rates, Customers, Packing, Reconciliation |
| `buttons.css` | Dashboard, Orders, Products, Market Rates, Customers, Packing, Reconciliation, Login, Reset Password |
| `inputs.css` | Orders, Products, Market Rates, Customers, Reconciliation, Login, Reset Password |
| `badges.css` | Orders, Customers |
| `segments.css` | Orders |
| `swipe.css` | Orders |
| `page.css` | Dashboard, Orders, Products, Market Rates, Customers, Packing, Reconciliation |
| `toasts.css` | (Not currently used — toast styles are in components.css) |
| `modals.css` | (Not currently used — modal styles are in components.css) |
| `nav.css` | (Not currently used) |

### Font Stack (locked)

```css
--font-heading: 'Crimson Pro', serif;
--font-body: 'DM Sans', sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

No new fonts without explicit approval.

### Spacing Scale

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;
```

All spacing must use these variables. No magic pixel values.

---

## 5. Service Worker Caching Rules

### What NEVER to Cache

| Resource | Reason |
|----------|--------|
| `/api/auth/*` | Auth state must always be fresh |
| `/api/csrf-token` | Security-critical, must be real-time |
| `/api/ledger/payment` | Financial mutations |
| `/api/reconciliation/*/complete` | Business-critical mutations |
| POST/PUT/DELETE requests | Mutations must hit server |
| PDF files (`/storage/*`) | Large, infrequent, fills cache quota |

### Cache Strategies

| Resource | Strategy | Rationale |
|----------|----------|-----------|
| HTML pages | Network-first, cache fallback | Users need latest UI |
| CSS/JS assets | Cache-first (hashed filenames) | Vite adds content hash |
| `/api/products` | Network-first, cache fallback | Rarely changes, useful offline |
| `/api/market-rates` | Network-first, cache fallback | Changes daily, useful offline |
| App icons/manifest | Cache-first | Static assets |
| Google Fonts | Cache-first | Rarely change |

### Cache Size Limits

- Max 50 API responses cached (LRU eviction)
- Static cache evicts on version change

---

## 6. Performance Checklist

### Every New Page Must

- [ ] Use skeleton loading states while data loads
- [ ] Import only needed animation CSS files
- [ ] Use `type="module"` for script tags (no synchronous scripts)
- [ ] Have mobile-first responsive styles
- [ ] Include proper meta viewport tag
- [ ] Use `font-display: swap` for custom fonts
- [ ] Debounce search/filter inputs
- [ ] Pause polling when tab is hidden (`visibilitychange`)

### PWA Requirements

- [ ] All pages listed in service worker's STATIC_ASSETS (if cacheable)
- [ ] Offline fallback works for cached pages
- [ ] No mixed content (HTTPS only in production)
