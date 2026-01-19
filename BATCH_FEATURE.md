# Order Batch System Feature

## Overview

The batch system groups orders into time-based batches for streamlined procurement. Orders placed during specific time windows are grouped together, allowing staff to view aggregated quantities for purchasing decisions.

## Batch Timing (IST - Indian Standard Time)

| Time Window | Batch Assignment | Confirmation |
|-------------|------------------|--------------|
| Before 8:00 AM | 1st Batch (same day) | Auto-confirmed at 8:00 AM |
| 8:00 AM - 12:00 PM | 2nd Batch (same day) | Manually confirmed by staff |
| After 12:00 PM | 1st Batch (next day) | Auto-confirmed next day at 8:00 AM |

## Key Features

1. **Automatic Batch Assignment**: Orders are automatically assigned to the appropriate batch based on creation time
2. **Auto-confirmation**: 1st batch auto-confirms at 8:00 AM IST via node-cron scheduler
3. **Manual Confirmation**: Staff can manually confirm 2nd batch from dashboard
4. **Order Locking**: Once a batch is confirmed, orders become locked and customers cannot edit them
5. **Batch-wise Quantity Summary**: Staff can view aggregated quantities per batch for procurement

## Files Created

### Backend

| File | Purpose |
|------|---------|
| `backend/models/Batch.js` | Batch model with batch number generation, findOrCreate, confirm methods |
| `backend/services/batchScheduler.js` | Scheduler service for auto-confirmation and batch assignment logic |
| `backend/routes/batches.js` | REST API endpoints for batch management |
| `backend/tests/batch.test.js` | Unit tests for batch system (18 tests) |

### Frontend

| File | Changes |
|------|---------|
| `frontend/index.html` | Added "Today's Batches" section with confirm button for 2nd batch |
| `frontend/customer-order-form.html` | Shows batch badge and lock notice on orders |
| `frontend/orders.html` | Shows batch badge on order cards and in order modal |
| `frontend/css/pages/index.css` | Batch section styles |
| `frontend/css/pages/customer-order-form.css` | Batch badge and lock notice styles |
| `frontend/css/pages/orders.css` | Batch badge styles for order cards |

## Files Modified

### Backend

| File | Changes |
|------|---------|
| `backend/models/Order.js` | Added `batch` (ObjectId ref) and `batchLocked` (Boolean) fields |
| `backend/routes/orders.js` | Auto-assigns batch on order creation; blocks customer edits when locked |
| `backend/routes/supplier.js` | Added `/api/supplier/batch-summary` endpoint |
| `backend/server.js` | Registered batch routes and scheduler startup/shutdown |

## API Endpoints

### Batch Management (`/api/batches`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List batches with optional status/date filters |
| GET | `/today` | Get today's batches with order counts |
| GET | `/:id` | Get batch details with statistics |
| POST | `/:id/confirm` | Manually confirm a batch (2nd batch) |
| GET | `/:id/orders` | Get all orders in a batch |
| GET | `/:id/quantity-summary` | Get aggregated product quantities for batch |
| GET | `/date/:date` | Get batches for a specific date |

### Supplier (`/api/supplier`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/batch-summary` | Get today's batches with product quantity breakdown |

## Batch Number Format

`B{YYMMDD}-{1|2}`

Examples:
- `B260115-1` → January 15, 2026, 1st Batch
- `B260115-2` → January 15, 2026, 2nd Batch

## Batch Lifecycle

```
open → confirmed → (orders locked)
        ↓
      expired (if not confirmed)
```

## Order Fields Added

```javascript
// In Order model
batch: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Batch',
  index: true
},
batchLocked: {
  type: Boolean,
  default: false,
  index: true
}
```

## Scheduler Configuration

The batch scheduler uses node-cron with the following schedule:

```javascript
// Auto-confirm 1st batch at 8:00 AM IST (2:30 AM UTC)
cron.schedule('30 2 * * *', autoConfirmFirstBatch, { timezone: 'Asia/Kolkata' });

// Create next day's batch at 12:01 PM IST (6:31 AM UTC)
cron.schedule('31 6 * * *', createNextDayBatch, { timezone: 'Asia/Kolkata' });
```

## UI Components

### Dashboard (Staff/Admin)
- **Today's Batches Section**: Shows 1st and 2nd batch cards with:
  - Order count
  - Status (Open/Confirmed)
  - Confirm button for 2nd batch (if open)
  - Confirmation timestamp and user (if confirmed)

### Customer Order Form
- **Order Cards**: Display batch badge (1st/2nd) with lock icon when confirmed
- **Order Modal**: Shows batch info and lock notice when order cannot be edited

### Staff Orders Page
- **Order Cards**: Display batch badge
- **Order Modal**: Shows batch info in details section

## Testing

Run batch tests:
```bash
npm test -- batch.test.js
```

Test coverage includes:
- Batch model creation and uniqueness
- findOrCreateBatch static method
- confirmBatch instance method
- IST time calculations
- Batch assignment logic (before 8 AM, 8-12 PM, after 12 PM)
- assignOrderToBatch function
- manuallyConfirmBatch function
- getBatchWithStats function
- Order-batch integration
- Batch locking on confirmation

## Future Enhancements

1. **Batch Editing**: Allow staff to move orders between batches
2. **Batch History**: View past batches and their orders
3. **Notifications**: Push notifications when batch is confirmed
4. **Analytics**: Batch-wise sales and procurement analytics
5. **Export**: Export batch summary as PDF/Excel for suppliers
