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
    trim: true,
    validate: {
      validator: function(v) {
        // Allow empty or valid 10-digit phone
        return !v || /^[0-9]{10}$/.test(v);
      },
      message: 'Please enter a valid 10-digit phone number'
    }
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
  // Pricing type determines how order prices are calculated
  pricingType: {
    type: String,
    enum: ['contract', 'markup', 'market'],
    default: 'market'
  },
  // For 'markup' pricing type - percentage added to purchase price
  markupPercentage: {
    type: Number,
    default: 0,
    min: [0, 'Markup cannot be negative'],
    max: [200, 'Markup cannot exceed 200%']
  },
  // For 'contract' pricing type - fixed prices per product (productId -> price)
  contractPrices: {
    type: Map,
    of: Number,
    default: new Map()
  },
  // Legacy field - kept for backward compatibility
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
customerSchema.index({ phone: 1 }, { unique: true, sparse: true }); // sparse allows multiple null/empty values

module.exports = mongoose.model('Customer', customerSchema);
