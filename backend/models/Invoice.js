const mongoose = require('mongoose');

/**
 * Invoice Model
 * Stores generated invoice records for audit trail and re-download
 */
const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  orderNumber: {
    type: String,
    required: true,
    index: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  firm: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    address: String,
    phone: String,
    email: String
  },
  customer: {
    name: { type: String, required: true },
    phone: String,
    address: String
  },
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: String,
    rate: { type: Number, required: true },
    amount: { type: Number, required: true }
  }],
  subtotal: {
    type: Number,
    required: true
  },
  tax: {
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  total: {
    type: Number,
    required: true
  },
  pdfPath: {
    type: String,
    default: null  // Set after PDF is generated (for transaction safety)
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
invoiceSchema.index({ order: 1 });
invoiceSchema.index({ generatedBy: 1 });
invoiceSchema.index({ generatedAt: -1 });
invoiceSchema.index({ 'firm.id': 1 });
invoiceSchema.index({ 'customer.name': 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
