const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer is required'],
    index: true
  },
  type: {
    type: String,
    enum: ['invoice', 'payment', 'adjustment'],
    required: [true, 'Entry type is required']
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  orderNumber: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  // Positive amount = customer owes you (invoice)
  // Negative amount = you owe customer or payment received (payment reduces balance)
  amount: {
    type: Number,
    required: [true, 'Amount is required']
  },
  // Customer's running balance after this entry
  balance: {
    type: Number,
    required: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByName: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Compound index for customer ledger queries (sorted by date)
ledgerEntrySchema.index({ customer: 1, date: -1 });

// Index for finding entries by order
ledgerEntrySchema.index({ order: 1 });

// Index for type-based filtering
ledgerEntrySchema.index({ type: 1, date: -1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
