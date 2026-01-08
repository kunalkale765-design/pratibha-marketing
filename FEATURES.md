# FEATURES.md

Complete feature documentation with UI/UX design details for testing and modifications.

---

## 1. Authentication

### Login Page (`login.html`)

**Layout:**
- Split design: Brand side (left 60%) + Form side (right 40%)
- Diagonal gradient overlay sweeping from right
- Responsive: stacks vertically on mobile

**Design Elements:**
| Element | Style |
|---------|-------|
| Background | Cream (#f9f7f3) with noise texture overlay |
| Brand panel | Dusty olive diagonal gradient |
| Form card | White with 20px radius, deep shadow |
| Logo | Text only "Pratibha Marketing" (no emoji) |
| Inputs | Cream background, olive focus ring |
| Button | Gradient olive, lifts on hover |

**Features:**
- Username/password login form (any text, min 3 characters)
- Password visibility toggle
- "Remember me" via 30-day httpOnly cookie
- Role-based redirect after login:
  - Admin/Staff → `/index.html` (dashboard)
  - Customer → `/customer-order-form.html`
- Error messages in styled alert box
- Link to signup page
- No "Back to Home" link

**Animations:**
- Brand side: slideInLeft 0.6s
- Form card: slideInRight 0.6s

---

### Signup Page (`signup.html`)

**Layout:** Same split design as login

**Design Elements:**
- Logo: Text only "Pratibha Marketing" (no emoji)

**Form Fields:**
| Field | Validation |
|-------|------------|
| Name | Required |
| Username | Min 3 characters (any text, no email format required) |
| Password | 6+ chars, uppercase, lowercase, number |
| Phone | 10 digits (optional) |

**Features:**
- Auto-creates Customer record on signup
- All public signups are `customer` role
- Admin/Staff accounts created manually
- Link to login page

---

## 2. Dashboard (`index.html`)

**Access:** Admin, Staff only

**Layout:**
```
┌─────────────────────────────────────────┐
│  HEADER (dark + logo text only)         │
├─────────────────────────────────────────┤
│  STATS ROW (flat, horizontal)           │
│  [Total Sale: ₹X]    [Profit: ₹X]       │
├─────────────────────────────────────────┤
│  QUICK ACTIONS (2x2 on mobile, 5 cols)  │
│  [Order] [Rates] [Customers]            │
│  [Products] [Orders]                    │
├─────────────────────────────────────────┤
│  PURCHASE LIST (expandable)             │
│  [Print] [Export CSV]                   │
│  Product quantities from pending orders │
└─────────────────────────────────────────┘
```

**Stats Cards (Flat Design):**
| Card | Data Source |
|------|-------------|
| Total Sale | Sum of order totals |
| Profit | Calculated from margins |

**Quick Actions (Compact):**
| Card | Link | Style |
|------|------|-------|
| Create Order | `/customer-order-form.html` | Primary |
| Market Rates | `/market-rates.html` | Default |
| Customers | `/customer-management.html` | Default |
| Products | `/products.html` | Default |
| View Orders | `/orders.html` | Default |

**Purchase List:**
- Expandable section showing aggregated quantities from pending orders
- Each item shows: name, qty needed, unit, inline rate input
- Clicking row expands to show: current rate, order count, estimated cost, trend
- Print button for procurement list
- Export CSV button for spreadsheet
- Inline rate editing with Save button
- Uses market rates (falls back to 0 if no rate set)

**Design Elements:**
- Header: Gunmetal with text-only logo
- Stats: Horizontal flat cards (dark background)
- Quick actions: Compact with short descriptions (hidden on mobile)
- Mobile: 2x2 grid for actions

---

## 3. Market Rates (`market-rates.html`)

**Access:** Admin, Staff

**Purpose:** Update daily vegetable prices

**Layout (Mobile-First):**
```
┌─────────────────────────────────────────┐
│  HEADER (text logo + Dashboard btn)     │
├─────────────────────────────────────────┤
│  DATE BAR (Today's date)                │
├─────────────────────────────────────────┤
│  PRODUCT LIST (simple cards)            │
│  ┌─────────────────────────────────┐    │
│  │  Spinach (Palak)      [₹45   ]  │    │
│  │  per kg                         │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Potato (Aloo)        [₹30   ]  │    │
│  │  per kg                         │    │
│  └─────────────────────────────────┘    │
│  ...                                    │
├─────────────────────────────────────────┤
│  BOTTOM BAR (fixed)                     │
│  [X changed]          [Save Rates]      │
└─────────────────────────────────────────┘
```

**Product Item:**
| Element | Style |
|---------|-------|
| Product name | Bold, 1rem |
| Unit | Muted text below name |
| Rate input | 100px width, monospace, right-aligned |

**Features:**
- Simple list layout (no table)
- Large touch-friendly inputs (no spin buttons)
- Auto-clear zero on focus
- Restore value on blur if empty
- Changed inputs show olive background
- Fixed bottom bar always visible
- Change count updates live
- Save button disabled when no changes

**Mobile Optimizations:**
- Products grouped by category
- Category headers (uppercase, muted)
- Padding at bottom for safe area
- Large touch targets (48px min)

---

## 4. Order Form (`customer-order-form.html`)

**Access:** All authenticated users

**Layout (Mobile-First):**
```
┌─────────────────────────────────────────┐
│  HEADER (text logo + Home btn)          │
├─────────────────────────────────────────┤
│  CATEGORY TABS (scrollable)             │
│  [All] [Leafy] [Root] [Fruiting] ...    │
├─────────────────────────────────────────┤
│  PRODUCT LIST (vertical cards)          │
│  ┌─────────────────────────────────┐    │
│  │  Spinach (Palak)                │    │
│  │  पालक • per kg                  │    │
│  │  [-]  [  2  ]  [+]              │    │
│  └─────────────────────────────────┘    │
│  ...                                    │
├─────────────────────────────────────────┤
│  BOTTOM BAR (fixed)                     │
│  [3 Items]            [Place Order]     │
└─────────────────────────────────────────┘
```

**Product Card:**
| Element | Style |
|---------|-------|
| Name | Bold, 1rem |
| Hindi name | Muted, with bullet |
| Unit | Muted text after Hindi |
| Quantity controls | Large +/- buttons (44px) |
| Quantity input | Center, clear on focus |

**Features:**

*Category Tabs:*
- Horizontal scrollable pills
- Active tab highlighted (dark bg)
- Filters products by category

*Quantity Input:*
- Large +/- buttons for thumb tapping
- Auto-clear on focus (no zero to delete)
- Restore to 0 on blur if empty
- No spin buttons

*Order Summary (Fixed Bottom):*
- Item count only (no total shown)
- Place Order button
- Safe area padding at bottom

*Customer Detection:*
- Uses `/api/auth/me` to get customer data
- Works directly after signup

**Pricing Logic:**
| Customer Type | Price Source |
|---------------|--------------|
| Market | Current MarketRate |
| Markup | MarketRate × (1 + markup%) |
| Contract | Fixed from contractPrices |

**Mobile Optimizations:**
- Full-width cards
- Large touch targets (44px buttons)
- No table layout
- Category headers between groups

---

## 5. Orders Management (`orders.html`)

**Access:** Admin, Staff

**Layout (Mobile-First):**
```
┌─────────────────────────────────────────┐
│  HEADER (text logo + New/Home btns)     │
├─────────────────────────────────────────┤
│  FILTER PILLS (scrollable)              │
│  [All] [Pending] [Confirmed] [Delivered]│
├─────────────────────────────────────────┤
│  SEARCH BAR                             │
│  [🔍 Search order or customer...]       │
├─────────────────────────────────────────┤
│  ORDER CARDS                            │
│  ┌─────────────────────────────────┐    │
│  │ #ORD26010001           ₹699     │    │
│  │ Kunal Kale                      │    │
│  │ 08/01/2026   [PENDING] [UNPAID] │    │
│  └─────────────────────────────────┘    │
│  ...                                    │
└─────────────────────────────────────────┘

ORDER DETAIL (Bottom Sheet Modal):
┌─────────────────────────────────────────┐
│  #ORD26010001                    [×]    │
├─────────────────────────────────────────┤
│  Customer: Kunal Kale                   │
│  Phone: -                               │
│  Date: 08/01/2026                       │
│  Status: [PENDING]                      │
├─────────────────────────────────────────┤
│  PRODUCTS                               │
│  ┌─────────────────────────────────┐    │
│  │  Beans (Sem Phali)              │    │
│  │  5 kg                           │    │
│  │  ┌──────────┐  ┌──────────┐     │    │
│  │  │ PURCHASE │  │ SELLING  │     │    │
│  │  │ ₹60      │  │ [₹65  ]  │     │    │
│  │  └──────────┘  └──────────┘     │    │
│  │  Amount               ₹325      │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  Total: ₹699  |  Paid: ₹0               │
│  Balance: ₹699                          │
├─────────────────────────────────────────┤
│  [        Save Changes        ]         │
└─────────────────────────────────────────┘
```

**Order Card:**
| Element | Style |
|---------|-------|
| Order number | Monospace, bold |
| Amount | Monospace, right-aligned |
| Customer name | Below order number |
| Date + badges | Bottom row |

**Status Badge Colors:**
| Status | Color |
|--------|-------|
| Pending | Yellow/amber |
| Confirmed | Blue |
| Processing | Purple |
| Delivered | Green |
| Cancelled | Red |
| Unpaid | Red |
| Partial | Yellow |
| Paid | Green |

**Order Detail Modal Features:**

*Price Editing (Staff Only):*
- Side-by-side price boxes
- Purchase price (market rate) for reference
- Selling price editable input
- Amount updates live as price changes
- Total recalculates automatically

*Input Behavior:*
- Auto-clear on focus
- Restore original on blur if empty
- Changed inputs show olive highlight
- No spin buttons

*Save Button:*
- Full-width at bottom
- Disabled until changes made
- Shows "Saving..." during save

**Mobile Optimizations:**
- Bottom sheet modal (slides up)
- Large filter pills (40px min)
- Large search input (48px min)
- Safe area padding
- Active card feedback on tap

---

## 6. Customer Management (`customer-management.html`)

**Access:** Admin, Staff

**Layout (Mobile-First):**
```
┌─────────────────────────────────────────┐
│  HEADER (text logo + Home btn)          │
├─────────────────────────────────────────┤
│  [🔍 Search...]        [+ Add Customer] │
├─────────────────────────────────────────┤
│  CUSTOMER CARDS                         │
│  ┌─────────────────────────────────┐    │
│  │ Hotel Sunrise        [MARKUP]   │    │
│  │ 📱 9876543210                   │    │
│  │ [Edit]    [Orders]    [Delete]  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Customer Card:**
| Element | Display |
|---------|---------|
| Name | Bold heading |
| Pricing Badge | MARKET / MARKUP (X%) / CONTRACT |
| Phone | With icon (optional) |
| Actions | Edit, View Orders, Delete |

**Create/Edit Form (Bottom Sheet Modal):**
| Field | Type | Notes |
|-------|------|-------|
| Name | Text | Required |
| Phone | Tel | 10 digits (optional) |
| WhatsApp | Tel | 10 digits (optional) |
| Address | Textarea | Delivery address |
| Pricing Type | Select | Market/Markup/Contract |
| Markup % | Number | If markup selected |

**Note:** Removed fields:
- ~~Credit Limit~~ - Removed from system

**Contract Pricing:**
- Shows product list with price inputs
- Only visible when pricingType = contract
- Map of productId → fixed price

**Mobile Optimizations:**
- Bottom sheet modals (slide up)
- Large touch targets (48px inputs)
- Full-width action buttons
- Tap outside to close modals
- Safe area padding

---

## 7. Products (`products.html`)

**Access:** Admin, Staff

**Layout (Mobile-First):**
```
┌─────────────────────────────────────────┐
│  HEADER (text logo + Home btn)          │
├─────────────────────────────────────────┤
│  CATEGORY PILLS (scrollable)            │
│  [All] [Vegetables] [Fruits] [+Manage]  │
├─────────────────────────────────────────┤
│  [🔍 Search...]        [+ Add Product]  │
├─────────────────────────────────────────┤
│  PRODUCT LIST (compact rows)            │
│  ┌─────────────────────────────────┐    │
│  │ Potato                    [✎][✕]│    │
│  │ kg                              │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ Tomato                    [✎][✕]│    │
│  │ kg                              │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Product Row:**
| Element | Display |
|---------|---------|
| Name | Bold, primary text |
| Unit | Muted text below name |
| Actions | Edit (✎) and Delete (✕) unicode icons |

**Product Form (Bottom Sheet Modal):**
| Field | Type | Notes |
|-------|------|-------|
| Name | Text | Required, unique |
| Unit | Select | quintal/bag/kg/piece/ton |
| Category | Select | Dynamic list from existing products (optional) |

**Note:** Removed fields (not in current model):
- ~~Base Price~~ - Prices managed via Market Rates
- ~~Stock Quantity~~ - Not needed
- ~~Min Stock Level~~ - Not needed
- ~~Hindi Name~~ - Removed
- ~~Description~~ - Removed

**Dynamic Category Management:**
- Categories are extracted from existing products
- "Categories" button opens management modal
- Add new categories (creates default product)
- Delete unused categories
- No hardcoded enum - free-form strings

**Mobile Optimizations:**
- Bottom sheet modals (slide up)
- Large touch targets (48px inputs)
- Scrollable category pills
- Safe area padding

---

## Design System Reference

### Color Palette

```
┌──────────────────────────────────────────────┐
│  PRIMARY                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐           │
│  │ #2e3532│ │ #7e9181│ │ #5d6b5f│           │
│  │Gunmetal│ │D.Olive │ │Dk Olive│           │
│  └────────┘ └────────┘ └────────┘           │
├──────────────────────────────────────────────┤
│  NEUTRAL                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐           │
│  │ #f9f7f3│ │ #fefdfb│ │ #c7cedb│           │
│  │ Cream  │ │W. White│ │P. Slate│           │
│  └────────┘ └────────┘ └────────┘           │
├──────────────────────────────────────────────┤
│  ACCENT & STATUS                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
│  │ #c4a77d│ │ #5d7a5f│ │ #b89a5a│ │ #9a6565││
│  │Terracot│ │Success │ │Warning │ │ Error  ││
│  └────────┘ └────────┘ └────────┘ └────────┘│
└──────────────────────────────────────────────┘
```

### Typography

| Use | Font | Weight | Size |
|-----|------|--------|------|
| Page titles | Crimson Pro | 600 | 28px |
| Section headers | Crimson Pro | 600 | 20-24px |
| Body text | DM Sans | 400 | 14-16px |
| Labels | DM Sans | 500-600 | 12-13px |
| Numbers/Prices | JetBrains Mono | 500-600 | 14-22px |

### Component Specs

**Cards:**
```css
background: var(--warm-white);
border-radius: 12-16px;
border: 1px solid var(--pale-slate-light);
box-shadow: 0 1px 3px rgba(46, 53, 50, 0.04);
/* Hover */
transform: translateY(-2px);
box-shadow: 0 4px 12px rgba(46, 53, 50, 0.08);
```

**Buttons (Primary):**
```css
background: linear-gradient(135deg, var(--dusty-olive), var(--dusty-olive-dark));
color: white;
border-radius: 10px;
padding: 14px 36px;
box-shadow: 0 4px 12px rgba(126, 145, 129, 0.3);
/* Hover */
transform: translateY(-2px);
box-shadow: 0 6px 20px rgba(126, 145, 129, 0.4);
```

**Inputs:**
```css
background: var(--cream);
border: 1.5px solid var(--pale-slate);
border-radius: 10px;
padding: 12px 16px;
/* Focus */
border-color: var(--dusty-olive);
box-shadow: 0 0 0 4px rgba(126, 145, 129, 0.12);
```

**Tables:**
```css
/* Header */
background: var(--cream);
font-size: 11px;
text-transform: uppercase;
letter-spacing: 0.5px;
/* Rows */
border-bottom: 1px solid var(--cream-dark);
/* Hover */
background: var(--cream);
```

### Animation Specs

**Page Load:**
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
/* Stagger: 0.05s per item */
```

**Slide In (Login):**
```css
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-30px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(30px); }
  to { opacity: 1; transform: translateX(0); }
}
/* Duration: 0.6s */
```

**Transitions:**
```css
transition: all 0.2s ease; /* Default */
transition: all 0.25s ease; /* Buttons */
transition: all 0.3s ease; /* Cards */
```

---

## Mobile Responsiveness

### Breakpoints
| Size | Width | Changes |
|------|-------|---------|
| Desktop | > 1024px | Full layout |
| Tablet | 768-1024px | 2-column grids |
| Mobile | < 768px | Single column, stacked layout |

### Mobile Adaptations
- Stats grid: 2 → 1 column
- Action cards: 3 → 1 column
- Order form summary: Horizontal → vertical stack
- Tables: Hide non-essential columns
- Header: Stack logo and actions vertically

---

## 8. Magic Link Authentication

**Purpose:** Allow customers to place orders without creating an account

**Flow:**
1. Staff opens Customer Management
2. Clicks "Link" button on customer card
3. Link is copied to clipboard (or shared via Web Share API on mobile)
4. Customer receives link via WhatsApp/SMS
5. Customer clicks link → auto-authenticated for 24 hours
6. Customer can place orders with their pricing (market/markup/contract)

**Technical Details:**
| Aspect | Implementation |
|--------|----------------|
| Token | 64-char hex (crypto.randomBytes(32)) |
| Storage | Customer.magicLinkToken (unique, sparse index) |
| Validity | No expiry on token, JWT session expires in 24h |
| Revocation | Staff can regenerate link (invalidates old one) |

**Security:**
- Tokens are cryptographically random (256 bits)
- Sparse unique index prevents token collision
- Session token (JWT) has 24-hour expiry
- Magic link users have `customer` role only (limited access)
- Cannot access admin/staff routes

**Customer Management UI:**
- "Link" button on each customer card
- Generates link on first click
- Subsequent clicks copy existing link
- Uses Web Share API on mobile, clipboard on desktop

**Order Form:**
- Checks URL for `?token=...` parameter on load
- Authenticates via `/api/auth/magic/:token`
- Cleans URL after authentication (removes token)
- Shows customer's pricing (market/markup/contract)

---

## PWA Features

**Manifest:**
- App name: "Pratibha Marketing"
- Short name: "Pratibha"
- Theme color: #7e9181
- Background: #f9f7f3

**Service Worker:**
- Caches static assets
- Offline fallback page
- Network-first for API calls

**Icons:**
- SVG icon at `/icons/icon.svg`
- Apple touch icon support
