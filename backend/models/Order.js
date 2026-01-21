const mongoose = require('mongoose');
const Counter = require('./Counter');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer is required']
  },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: String,
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0.01, 'Quantity must be greater than 0']
    },
    unit: {
      type: String,
      required: true
    },
    rate: {
      type: Number,
      required: [true, 'Rate is required'],
      min: [0, 'Rate cannot be negative']
    },
    amount: {
      type: Number,
      required: true
    },
    // Indicates if rate is from contract pricing (locked, cannot be edited)
    isContractPrice: {
      type: Boolean,
      default: false
    }
  }],
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'delivered', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid'
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: [0, 'Paid amount cannot be negative']
  },
  deliveryAddress: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  assignedWorker: {
    type: String,
    trim: true
  },
  deliveredAt: Date,
  // Cancellation audit
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Track if contract pricing fallback was used
  usedPricingFallback: {
    type: Boolean,
    default: false
  },
  // Idempotency key for preventing duplicate orders on network failures
  // Index defined below with sparse + unique options
  idempotencyKey: {
    type: String
  },
  // Batch reference - which batch this order belongs to
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    index: true
  },
  // Whether the order is locked from customer edits (batch confirmed)
  batchLocked: {
    type: Boolean,
    default: false,
    index: true
  },
  // Audit log for price changes (who changed what and when)
  priceAuditLog: [{
    changedAt: {
      type: Date,
      default: Date.now
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedByName: String,
    productId: mongoose.Schema.Types.ObjectId,
    productName: String,
    oldRate: Number,
    newRate: Number,
    oldQuantity: Number,
    newQuantity: Number,
    oldTotal: Number,
    newTotal: Number,
    reason: String
  }],

  // Simplified packing - tracks packed quantities per item
  packingDone: {
    type: Boolean,
    default: false
  },
  packingDoneAt: Date,
  packingDoneBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Reconciliation details - tracks final delivered quantities
  reconciliation: {
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    completedByName: String,
    changes: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      productName: String,
      orderedQty: Number,
      deliveredQty: Number,
      reason: String
    }],
    originalTotal: Number  // Total before reconciliation adjustments
  },

  // Delivery bill tracking
  deliveryBillGenerated: {
    type: Boolean,
    default: false
  },
  deliveryBillGeneratedAt: Date,
  deliveryBillNumber: String  // Store the bill number for consistency across downloads
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual field: displayStatus - simplified to match new order flow
orderSchema.virtual('displayStatus').get(function() {
  // Direct mapping from status
  if (this.status === 'confirmed' && this.packingDone) {
    return 'ready_for_reconciliation';
  }
  return this.status;
});

// Generate order number before saving using atomic counter to avoid race conditions
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    try {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const prefix = `ORD${year}${month}`;

      // Use atomic counter for guaranteed unique sequence numbers
      const counterName = `order_${prefix}`;
      const seq = await Counter.getNextSequence(counterName);

      this.orderNumber = `${prefix}${seq.toString().padStart(4, '0')}`;
    } catch (error) {
      return next(new Error(`Failed to generate order number: ${error.message}`));
    }
  }
  next();
});

// Index for faster searches (orderNumber already indexed via unique: true)
orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

// Idempotency key index - sparse because most orders won't have one
// Used for duplicate order prevention on network failures
orderSchema.index({ idempotencyKey: 1 }, { sparse: true, unique: true });

// Compound index for common query: customer's orders sorted by date
orderSchema.index({ customer: 1, createdAt: -1 });

// Compound index for batch queries: orders in a batch by status
orderSchema.index({ batch: 1, status: 1 });

// Index for finding editable orders
orderSchema.index({ batchLocked: 1, status: 1 });

// Index for packing and reconciliation queries
orderSchema.index({ packingDone: 1, status: 1 });

module.exports = mongoose.model('Order', orderSchema);
