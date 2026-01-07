const mongoose = require('mongoose');

const marketRateSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product is required']
  },
  productName: {
    type: String,
    required: true
  },
  rate: {
    type: Number,
    required: [true, 'Rate is required'],
    min: [0, 'Rate cannot be negative']
  },
  previousRate: {
    type: Number,
    default: 0
  },
  effectiveDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  source: {
    type: String,
    trim: true,
    maxlength: [200, 'Source cannot exceed 200 characters']
  },
  trend: {
    type: String,
    enum: ['up', 'down', 'stable'],
    default: 'stable'
  },
  changePercentage: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  updatedBy: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Calculate trend and change percentage before saving
marketRateSchema.pre('save', function(next) {
  if (this.previousRate && this.previousRate > 0) {
    const change = this.rate - this.previousRate;
    this.changePercentage = ((change / this.previousRate) * 100).toFixed(2);

    if (change > 0) {
      this.trend = 'up';
    } else if (change < 0) {
      this.trend = 'down';
    } else {
      this.trend = 'stable';
    }
  }
  next();
});

// Index for faster searches
marketRateSchema.index({ product: 1, effectiveDate: -1 });
marketRateSchema.index({ productName: 1 });
marketRateSchema.index({ effectiveDate: -1 });

module.exports = mongoose.model('MarketRate', marketRateSchema);
