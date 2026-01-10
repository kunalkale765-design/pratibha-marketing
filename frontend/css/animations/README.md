# Animation System - Pratibha Marketing

A collection of performant, mobile-first animations for the app.

## Quick Start

Import all animations:
```html
<link rel="stylesheet" href="/css/animations/index.css">
```

Or import only what you need:
```html
<link rel="stylesheet" href="/css/animations/skeleton.css">
<link rel="stylesheet" href="/css/animations/buttons.css">
```

---

## Perfect Fit for Your App

Based on your app's structure, here are the **recommended animations** to implement:

### Priority 1: High Impact, Easy to Add

| Animation | File | Where to Use | Impact |
|-----------|------|--------------|--------|
| **Skeleton Loading** | `skeleton.css` | Orders list, Customers list, Products | Replaces "Loading..." text, feels faster |
| **Button Loading** | `buttons.css` | Save buttons, Submit forms | Shows progress during API calls |
| **Card Hover** | `cards.css` | Order cards, Customer cards | Subtle feedback on tap/hover |
| **Input Focus** | `inputs.css` | All form inputs | Smooth focus glow |

### Priority 2: Nice to Have

| Animation | File | Where to Use | Impact |
|-----------|------|--------------|--------|
| **Segmented Control** | `segments.css` | Order filters (All/Pending/Delivered) | Smooth tab switching |
| **Page Fade** | `page.css` | All pages on load | Polished page transitions |
| **Badge Pulse** | `badges.css` | Pending order badges | Draws attention to new items |
| **Toast Enhancement** | `toasts.css` | Success/error messages | Already have toasts, this enhances |

### Priority 3: Mobile-Specific (Optional)

| Animation | File | Where to Use | Impact |
|-----------|------|--------------|--------|
| **Swipe Actions** | `swipe.css` | Order/Customer list items | iOS-style swipe to edit/delete |
| **Bottom Sheet Modal** | `modals.css` | Quick actions on mobile | Native app feel |
| **Nav Animation** | `nav.css` | Header, bottom nav | Blur on scroll, tap feedback |

---

## Implementation Guide

### 1. Skeleton Loading (Recommended First)

Replace this:
```html
<div class="orders-list">Loading...</div>
```

With this:
```html
<div class="orders-list">
    <div class="skeleton-row">
        <div class="skeleton skeleton-avatar"></div>
        <div class="skeleton-lines">
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text short"></div>
        </div>
    </div>
    <!-- Repeat 3-5 times -->
</div>
```

### 2. Button Loading State

Add to your save buttons:
```javascript
async function saveOrder() {
    const btn = document.getElementById('saveBtn');
    btn.classList.add('btn-loading');

    try {
        await API.post('/orders', data);
        btn.classList.remove('btn-loading');
        btn.classList.add('btn-success');
    } catch (e) {
        btn.classList.remove('btn-loading');
    }
}
```

### 3. Card Animation

Add class to your cards:
```html
<div class="order-card card-animated card-fade-in">
    ...
</div>
```

### 4. Input Focus

Add class to inputs:
```html
<input class="form-input input-animated" type="text">
```

### 5. Segmented Control (Order Filters)

```html
<div class="segment-control" data-segments="3">
    <div class="segment-indicator pos-1"></div>
    <button class="segment-btn active" onclick="switchFilter(1)">All</button>
    <button class="segment-btn" onclick="switchFilter(2)">Pending</button>
    <button class="segment-btn" onclick="switchFilter(3)">Delivered</button>
</div>
```

```javascript
function switchFilter(pos) {
    document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelector('.segment-indicator').className = `segment-indicator pos-${pos}`;
}
```

---

## File Reference

| File | Size | Purpose |
|------|------|---------|
| `skeleton.css` | ~1KB | Loading placeholders |
| `buttons.css` | ~1KB | Button states & ripple |
| `cards.css` | ~1KB | Card hover & fade-in |
| `inputs.css` | ~1KB | Input focus & error |
| `toasts.css` | ~0.5KB | Toast enhancements |
| `modals.css` | ~1KB | Modal & bottom sheet |
| `segments.css` | ~1.5KB | Tab/filter control |
| `swipe.css` | ~1KB | Swipe actions |
| `page.css` | ~0.5KB | Page transitions |
| `badges.css` | ~0.5KB | Badge animations |
| `nav.css` | ~0.5KB | Navigation animations |
| **index.css** | imports all | Full bundle (~10KB) |

---

## Performance Notes

All animations use GPU-accelerated properties:
- `transform`
- `opacity`
- `filter`

No layout-triggering properties like `width`, `height`, `top`, `left`.

Respects `prefers-reduced-motion` for accessibility.

---

## Preview

Open `/animation-preview.html` in your browser to see all animations in action.
