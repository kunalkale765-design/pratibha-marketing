const mongoose = require('mongoose');

/**
 * Batch Model
 *
 * Represents a time-based order batch for procurement purposes.
 * Orders are assigned to batches based on creation time (IST):
 * - Before 8:00 AM → 1st Batch (same day) - auto-confirmed at 8 AM
 * - 8:00 AM - 12:00 PM → 2nd Batch (same day) - manually confirmed by staff
 * - After 12:00 PM → 1st Batch (next day)
 */

const batchSchema = new mongoose.Schema({
  // Unique batch identifier: B{YYMMDD}-{1|2} (e.g., B260115-1)
  batchNumber: {
    type: String,
    unique: true,
    required: true,
    index: true
  },

  // Date this batch serves (YYYY-MM-DD at midnight IST)
  date: {
    type: Date,
    required: true,
    index: true
  },

  // Which batch of the day
  batchType: {
    type: String,
    enum: ['1st', '2nd'],
    required: true
  },

  // When this batch closes for new orders (IST)
  cutoffTime: {
    type: Date,
    required: true
  },

  // When batch auto-confirms (null for 2nd batch which is manual)
  autoConfirmTime: {
    type: Date,
    default: null
  },

  // Batch lifecycle status
  status: {
    type: String,
    enum: ['open', 'confirmed', 'expired'],
    default: 'open',
    index: true
  },

  // When batch was confirmed
  confirmedAt: {
    type: Date,
    default: null
  },

  // Who confirmed (null for auto-confirm)
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Cached order count for quick display
  orderCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index for finding batch by date+type
batchSchema.index({ date: 1, batchType: 1 }, { unique: true });

// Index for scheduler queries - find batches to auto-confirm
batchSchema.index({ status: 1, autoConfirmTime: 1 });

// Index for listing recent batches
batchSchema.index({ status: 1, date: -1 });

/**
 * Static method to generate batch number
 * Format: B{YYMMDD}-{1|2}
 */
batchSchema.statics.generateBatchNumber = function(date, batchType) {
  // Use IST-aware calculation: the date is midnight IST stored as UTC,
  // so add IST offset to get the correct IST date components via UTC methods
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const d = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  const year = d.getUTCFullYear().toString().slice(-2);
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  const num = batchType === '1st' ? '1' : '2';
  return `B${year}${month}${day}-${num}`;
};

/**
 * Static method to find or create a batch
 * Uses upsert to handle race conditions
 */
batchSchema.statics.findOrCreateBatch = async function(date, batchType, cutoffTime, autoConfirmTime = null) {
  const batchNumber = this.generateBatchNumber(date, batchType);

  try {
    const batch = await this.findOneAndUpdate(
      { date, batchType },
      {
        $setOnInsert: {
          batchNumber,
          date,
          batchType,
          cutoffTime,
          autoConfirmTime,
          status: 'open',
          orderCount: 0
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    return batch;
  } catch (err) {
    // Handle race condition: if duplicate key error, just find the existing batch
    if (err.code === 11000) {
      const existing = await this.findOne({ date, batchType });
      if (existing) return existing;
    }
    throw err;
  }
};

/**
 * Static method to get today's batches (IST)
 */
batchSchema.statics.getTodayBatches = async function() {
  const { getISTTime } = require('../utils/dateTime');
  const todayIST = getISTTime().dateOnly;
  return this.find({ date: todayIST }).sort({ batchType: 1 });
};

/**
 * Static method to increment order count atomically
 */
batchSchema.statics.incrementOrderCount = async function(batchId) {
  return this.findByIdAndUpdate(
    batchId,
    { $inc: { orderCount: 1 } },
    { new: true }
  );
};

/**
 * Static method to decrement order count atomically
 */
batchSchema.statics.decrementOrderCount = async function(batchId) {
  return this.findByIdAndUpdate(
    batchId,
    { $inc: { orderCount: -1 } },
    { new: true }
  );
};

/**
 * Instance method to confirm the batch
 */
batchSchema.methods.confirmBatch = async function(userId = null) {
  if (this.status !== 'open') {
    throw new Error('Batch is not open for confirmation');
  }

  this.status = 'confirmed';
  this.confirmedAt = new Date();
  this.confirmedBy = userId;
  await this.save();

  return this;
};

/**
 * Virtual to check if batch is editable
 */
batchSchema.virtual('isEditable').get(function() {
  return this.status === 'open';
});

// Enable virtuals in JSON output
batchSchema.set('toJSON', { virtuals: true });
batchSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Batch', batchSchema);
