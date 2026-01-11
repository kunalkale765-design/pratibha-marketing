---
name: Feature Development
description: Use when building new features, adding API endpoints, creating frontend pages, or extending functionality in the Pratibha Marketing App
---

# Feature Development Guide

When developing new features for this project, follow these patterns and conventions.

## Pre-Development Checklist

1. **Understand the scope** - What models, routes, and pages are affected?
2. **Check existing patterns** - Look at similar features in the codebase
3. **Plan the changes** - Backend first, then frontend
4. **Consider security** - Auth, CSRF, input validation

---

## Backend Patterns

### API Response Format

Always return responses in this format:

```javascript
res.status(200).json({
  success: true,
  data: result,        // The actual data
  count: items.length, // For arrays
  message: 'Optional success message'
});

// Errors
res.status(400).json({
  success: false,
  error: 'Error description'
});
```

### Route File Structure

```javascript
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

// Public routes (if any)
router.get('/public-endpoint', controller.publicMethod);

// Protected routes
router.use(protect); // All routes below require auth

// Role-restricted routes
router.post('/', authorize('admin', 'staff'), controller.create);
router.put('/:id', authorize('admin', 'staff'), controller.update);
router.delete('/:id', authorize('admin', 'staff'), controller.delete);

module.exports = router;
```

### Mongoose Model Pattern

```javascript
const mongoose = require('mongoose');

const ModelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true  // Soft delete pattern
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
ModelSchema.index({ name: 1 });

// Hide inactive by default in finds
ModelSchema.pre(/^find/, function(next) {
  if (this.getQuery().isActive === undefined) {
    this.where({ isActive: true });
  }
  next();
});

module.exports = mongoose.model('Model', ModelSchema);
```

### Auth Middleware Usage

| Middleware | Purpose |
|------------|---------|
| `protect` | Requires valid JWT - adds `req.user` |
| `authorize('admin', 'staff')` | Restricts to specific roles |
| `optionalAuth` | Attaches user if logged in, continues if not |

---

## Frontend Patterns

### Page Structure (Self-Contained HTML)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Title - Pratibha Marketing</title>
    <link rel="manifest" href="manifest.json">
    <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <style>
        /* CSS Variables */
        :root {
            --gunmetal: #2e3532;
            --dusty-olive: #7e9181;
            --dusty-olive-dark: #5d6b5f;
            --cream: #f9f7f3;
            --warm-white: #fefdfb;
            --terracotta: #c4a77d;
            --success: #5d7a5f;
            --warning: #b89a5a;
            --error: #9a6565;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'DM Sans', sans-serif;
            background: var(--cream);
            color: var(--gunmetal);
        }

        h1, h2, h3 { font-family: 'Crimson Pro', serif; }

        /* Component styles here */
    </style>
</head>
<body>
    <!-- Page content -->

    <script src="js/api.js"></script>
    <script src="js/auth.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', async () => {
            // Check auth - redirect if needed
            const user = await Auth.requireAuth(['admin', 'staff']); // or ['customer']
            if (!user) return;

            // Page initialization
            init();
        });

        async function init() {
            // Load data, setup event listeners
        }
    </script>
</body>
</html>
```

### CSRF Token Handling (Required for POST/PUT/DELETE)

```javascript
async function submitData(data) {
    const headers = { 'Content-Type': 'application/json' };

    // Always get CSRF token for state-changing requests
    const csrfToken = await Auth.ensureCsrfToken();
    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    const response = await API.fetch('/api/endpoint', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
    });

    return response;
}
```

### Design System Components

**Cards:**
```css
.card {
    background: var(--warm-white);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    transition: transform 0.2s, box-shadow 0.2s;
}
.card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}
```

**Buttons:**
```css
.btn {
    font-family: 'DM Sans', sans-serif;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
}
.btn-primary {
    background: linear-gradient(135deg, var(--dusty-olive), var(--dusty-olive-dark));
    color: white;
}
.btn-primary:hover {
    box-shadow: 0 4px 12px rgba(126, 145, 129, 0.4);
}
```

**Form Inputs:**
```css
.form-input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid #e0ddd8;
    border-radius: 8px;
    background: var(--cream);
    font-family: 'DM Sans', sans-serif;
}
.form-input:focus {
    outline: none;
    border-color: var(--dusty-olive);
    box-shadow: 0 0 0 3px rgba(126, 145, 129, 0.2);
}
```

---

## Business Logic

### Pricing Types

| Type | Calculation |
|------|-------------|
| `market` | Current rate from MarketRate collection |
| `markup` | `marketRate * (1 + markupPercentage / 100)` |
| `contract` | Fixed price from `customer.contractPrices[productId]` |

```javascript
function calculatePrice(customer, product, marketRate) {
    switch (customer.pricingType) {
        case 'market':
            return marketRate;
        case 'markup':
            return marketRate * (1 + customer.markupPercentage / 100);
        case 'contract':
            return customer.contractPrices.get(product._id.toString()) || marketRate;
        default:
            return marketRate;
    }
}
```

### Order Status Flow

```
pending → confirmed → processing → packed → shipped → delivered
                                                    ↘ cancelled
```

### Payment Status Flow

```
unpaid → partial → paid
```

### Role Permissions

| Role | Access |
|------|--------|
| `admin` | Full access |
| `staff` | CRUD on orders, customers, products, market rates |
| `customer` | View/create own orders only, NO price visibility |

**CRITICAL:** Never show prices, rates, or totals to customers in the UI.

---

## Security Checklist

- [ ] Use `protect` middleware for authenticated routes
- [ ] Use `authorize()` for role-restricted routes
- [ ] Include CSRF token in all POST/PUT/DELETE requests
- [ ] Validate and sanitize all user inputs
- [ ] Use parameterized queries (Mongoose handles this)
- [ ] Check resource ownership for customer-accessed data
- [ ] Never expose sensitive fields (passwords, tokens) in responses

---

## Documentation Updates

After completing a feature, update these files:

| File | What to Update |
|------|----------------|
| `FEATURES.md` | New features, UI changes, workflows |
| `CLAUDE.md` | API endpoints, business logic, architecture |
| `CHANGELOG.md` | Version history entry |

---

## Mount New Routes

When adding a new route file, mount it in `backend/server.js`:

```javascript
// Add with other route imports
const newRoutes = require('./routes/newRoutes');

// Mount with other routes
app.use('/api/new-endpoint', newRoutes);
```

---

## Testing After Development

Run through relevant items from the testing checklist:

- [ ] API returns correct response format
- [ ] Auth restrictions work as expected
- [ ] CSRF token required for state-changing operations
- [ ] Frontend displays data correctly
- [ ] Error states handled gracefully
- [ ] Mobile responsive (if frontend)
