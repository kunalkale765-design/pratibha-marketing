const mongoose = require('mongoose');

/**
 * DailyProcurement Schema
 * Tracks which products have been explicitly procured (bought) each day.
 * Separate from MarketRate - a rate can be updated without marking as procured.
 */
const dailyProcurementSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  // Date of procurement (IST midnight stored as UTC)
  date: {
    type: Date,
    required: true
  },
  // Rate at which it was procured
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  // Quantity that was procured (for reference)
  quantityAtProcurement: {
    type: Number,
    default: 0
  },
  // When it was marked as procured
  procuredAt: {
    type: Date,
    default: Date.now
  },
  // Who marked it as procured
  procuredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index: one procurement record per product per day
dailyProcurementSchema.index({ product: 1, date: 1 }, { unique: true });

// Index for querying by date
dailyProcurementSchema.index({ date: 1 });

/**
 * Static method to mark a product as procured for a given date
 */
dailyProcurementSchema.statics.markProcured = async function(productId, productName, date, rate, quantity, userId) {
  return this.findOneAndUpdate(
    { product: productId, date },
    {
      product: productId,
      productName,
      date,
      rate,
      quantityAtProcurement: quantity,
      procuredAt: new Date(),
      procuredBy: userId
    },
    { upsert: true, new: true }
  );
};

/**
 * Static method to check if a product is procured for a given date
 */
dailyProcurementSchema.statics.isProcured = async function(productId, date) {
  const record = await this.findOne({ product: productId, date });
  return !!record;
};

/**
 * Static method to get all procured products for a date
 */
dailyProcurementSchema.statics.getProcuredForDate = async function(date) {
  return this.find({ date }).populate('procuredBy', 'name');
};

/**
 * Static method to remove procurement status (undo)
 */
dailyProcurementSchema.statics.removeProcurement = async function(productId, date) {
  return this.findOneAndDelete({ product: productId, date });
};

module.exports = mongoose.model('DailyProcurement', dailyProcurementSchema);
