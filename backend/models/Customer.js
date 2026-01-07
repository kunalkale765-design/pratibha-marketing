const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  whatsapp: {
    type: String,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit WhatsApp number']
  },
  address: {
    type: String,
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
  },
  personalizedPricing: {
    type: Map,
    of: Number,
    default: new Map()
  },
  creditLimit: {
    type: Number,
    default: 0,
    min: [0, 'Credit limit cannot be negative']
  },
  currentCredit: {
    type: Number,
    default: 0,
    min: [0, 'Current credit cannot be negative']
  },
  paymentHistory: [{
    amount: Number,
    date: {
      type: Date,
      default: Date.now
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'online', 'cheque', 'credit']
    },
    notes: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster searches
customerSchema.index({ name: 1 });
customerSchema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model('Customer', customerSchema);
