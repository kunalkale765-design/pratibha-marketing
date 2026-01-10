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
    unique: true,
    sparse: true, // Allows multiple null/empty values
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
  },
  // Magic link for passwordless authentication
  magicLinkToken: {
    type: String,
    unique: true,
    sparse: true  // Allows multiple null values
  },
  magicLinkCreatedAt: {
    type: Date
  },
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: {
    // Ensure Map is converted to plain object for JSON serialization
    transform: function(doc, ret) {
      // Convert contractPrices Map to plain object for reliable frontend access
      if (ret.contractPrices instanceof Map) {
        ret.contractPrices = Object.fromEntries(ret.contractPrices);
      } else if (ret.contractPrices && typeof ret.contractPrices === 'object') {
        // Already an object (happens in some Mongoose versions)
        // Ensure it's a plain object, not a Map-like structure
        const plainObj = {};
        for (const [key, value] of Object.entries(ret.contractPrices)) {
          plainObj[key] = value;
        }
        ret.contractPrices = plainObj;
      }
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      if (ret.contractPrices instanceof Map) {
        ret.contractPrices = Object.fromEntries(ret.contractPrices);
      }
      return ret;
    }
  }
});

// Index for faster searches
customerSchema.index({ name: 1 });
// Note: phone index is created by unique: true, sparse: true on field definition

module.exports = mongoose.model('Customer', customerSchema);
