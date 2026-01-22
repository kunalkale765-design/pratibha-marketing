const cron = require('node-cron');
const Batch = require('../models/Batch');
const Order = require('../models/Order');
const { generateBillsForBatch } = require('./deliveryBillService');

// Import Sentry if available (optional dependency)
let Sentry;
let sentryAvailable = false;
try {
  Sentry = require('@sentry/node');
  sentryAvailable = true;
} catch (e) {
  // Log at ERROR level so this is visible in deployment logs
  console.error('[BatchScheduler] WARNING: Sentry not available - batch scheduler errors will not be monitored!');
  console.error('[BatchScheduler] Sentry import error:', e.message);
  // Sentry remains undefined, sentryAvailable stays false
}

let scheduledTask = null;
let batchCreationTask = null;

// IST timezone configuration
const IST_TIMEZONE = 'Asia/Kolkata';

// Batch cutoff hours (IST)
const BATCH_CONFIG = {
  BATCH_1_CUTOFF_HOUR: 8,   // 8:00 AM IST
  BATCH_2_CUTOFF_HOUR: 12   // 12:00 PM IST (noon)
};

/**
 * Convert a date to IST timezone
 * @param {Date} date - Date to convert
 * @returns {Object} Object with IST hour, minutes, and full date
 */
function getISTTime(date = new Date()) {
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
  const istTime = new Date(utcTime + istOffset);

  // Calculate midnight IST as a UTC timestamp
  // This ensures consistent date comparisons regardless of server timezone
  const midnightIST = new Date(Date.UTC(
    istTime.getFullYear(),
    istTime.getMonth(),
    istTime.getDate(),
    0, 0, 0, 0
  ) - istOffset);

  return {
    hour: istTime.getHours(),
    minutes: istTime.getMinutes(),
    date: istTime,
    // Get just the date portion at midnight IST (as UTC timestamp)
    dateOnly: midnightIST
  };
}

/**
 * Get the next day's date at midnight (IST)
 * @param {Date} istDateOnly - Current date at midnight IST
 * @returns {Date} Next day at midnight IST
 */
function getNextDay(istDateOnly) {
  const nextDay = new Date(istDateOnly);
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay;
}

/**
 * Calculate which batch an order should be assigned to
 * @param {Date} orderCreatedAt - When the order was created
 * @returns {Object} { batchDate, batchType, cutoffTime, autoConfirmTime }
 */
function calculateBatchAssignment(orderCreatedAt = new Date()) {
  const ist = getISTTime(orderCreatedAt);
  const hour = ist.hour;
  const today = ist.dateOnly;

  // Before 8:00 AM → 1st Batch (same day)
  if (hour < BATCH_CONFIG.BATCH_1_CUTOFF_HOUR) {
    const cutoffTime = new Date(today);
    cutoffTime.setHours(BATCH_CONFIG.BATCH_1_CUTOFF_HOUR, 0, 0, 0);

    const autoConfirmTime = new Date(cutoffTime); // 1st batch auto-confirms at cutoff

    return {
      batchDate: today,
      batchType: '1st',
      cutoffTime,
      autoConfirmTime
    };
  }

  // 8:00 AM - 12:00 PM → 2nd Batch (same day)
  if (hour < BATCH_CONFIG.BATCH_2_CUTOFF_HOUR) {
    const cutoffTime = new Date(today);
    cutoffTime.setHours(BATCH_CONFIG.BATCH_2_CUTOFF_HOUR, 0, 0, 0);

    return {
      batchDate: today,
      batchType: '2nd',
      cutoffTime,
      autoConfirmTime: null // 2nd batch is manually confirmed
    };
  }

  // After 12:00 PM → 1st Batch (next day)
  const tomorrow = getNextDay(today);
  const cutoffTime = new Date(tomorrow);
  cutoffTime.setHours(BATCH_CONFIG.BATCH_1_CUTOFF_HOUR, 0, 0, 0);

  const autoConfirmTime = new Date(cutoffTime);

  return {
    batchDate: tomorrow,
    batchType: '1st',
    cutoffTime,
    autoConfirmTime
  };
}

/**
 * Assign an order to the appropriate batch
 * Creates the batch if it doesn't exist
 * @param {Date} orderCreatedAt - When the order was created
 * @returns {Object} The batch document
 */
async function assignOrderToBatch(orderCreatedAt = new Date()) {
  const assignment = calculateBatchAssignment(orderCreatedAt);

  const batch = await Batch.findOrCreateBatch(
    assignment.batchDate,
    assignment.batchType,
    assignment.cutoffTime,
    assignment.autoConfirmTime
  );

  // Increment order count
  await Batch.incrementOrderCount(batch._id);

  return batch;
}

/**
 * Auto-confirm 1st batch orders at 8:00 AM IST
 * This runs daily and confirms all pending 1st batch orders for today
 */
async function autoConfirmFirstBatch() {
  const startTime = Date.now();
  console.log(`[BatchScheduler] Starting auto-confirm for 1st batch at ${new Date().toISOString()}`);

  try {
    const ist = getISTTime();
    const today = ist.dateOnly;

    // Find today's 1st batch that is still open
    const batch = await Batch.findOne({
      date: today,
      batchType: '1st',
      status: 'open'
    });

    if (!batch) {
      console.log('[BatchScheduler] No open 1st batch found for today, skipping');
      return { success: true, ordersConfirmed: 0, message: 'No open batch' };
    }

    // Find all pending orders in this batch
    const pendingOrders = await Order.find({
      batch: batch._id,
      status: 'pending'
    });

    if (pendingOrders.length === 0) {
      console.log('[BatchScheduler] No pending orders in 1st batch, confirming batch');
      await batch.confirmBatch(null); // null = auto-confirmed
      return { success: true, ordersConfirmed: 0, message: 'Batch confirmed (no pending orders)' };
    }

    // Bulk update orders to confirmed
    const orderIds = pendingOrders.map(o => o._id);
    const updateResult = await Order.updateMany(
      { _id: { $in: orderIds } },
      {
        $set: {
          status: 'confirmed'
        }
      }
    );

    // Confirm the batch
    await batch.confirmBatch(null); // null = auto-confirmed

    // Generate delivery bills for all confirmed orders in the batch
    let billResults = { billsGenerated: 0, errors: [], totalOrders: 0 };
    let billGenerationFailed = false;
    let billGenerationError = null;
    try {
      console.log(`[BatchScheduler] Generating delivery bills for batch ${batch.batchNumber}...`);
      billResults = await generateBillsForBatch(batch);
      console.log(`[BatchScheduler] Generated ${billResults.billsGenerated} bills for ${billResults.totalOrders} orders`);
      if (billResults.errors.length > 0) {
        console.warn(`[BatchScheduler] Bill generation had ${billResults.errors.length} errors:`, billResults.errors);
      }
    } catch (billError) {
      // Log with clear ERROR prefix for visibility
      console.error('[BatchScheduler] CRITICAL: Delivery bill generation failed completely!', billError.message);
      console.error('[BatchScheduler] Stack trace:', billError.stack);
      // Mark failure for return value
      billGenerationFailed = true;
      billGenerationError = billError.message;
      // Report to Sentry if available
      if (sentryAvailable && Sentry && process.env.SENTRY_DSN) {
        Sentry.captureException(billError, {
          tags: { service: 'batchScheduler', operation: 'billGeneration' },
          extra: { batchNumber: batch.batchNumber, batchId: batch._id.toString() }
        });
      }
    }

    const duration = Date.now() - startTime;
    const statusMsg = billGenerationFailed
      ? `Auto-confirm complete BUT BILLS FAILED: ${updateResult.modifiedCount} orders confirmed, 0 bills generated (ERROR: ${billGenerationError})`
      : `Auto-confirm complete: ${updateResult.modifiedCount} orders confirmed, ${billResults.billsGenerated} bills generated`;
    console.log(`[BatchScheduler] ${statusMsg} in ${duration}ms`);

    return {
      success: true,
      ordersConfirmed: updateResult.modifiedCount,
      batchNumber: batch.batchNumber,
      billsGenerated: billResults.billsGenerated,
      billErrors: billResults.errors.length,
      billGenerationFailed: billGenerationFailed,
      billGenerationError: billGenerationError,
      duration
    };
  } catch (error) {
    console.error('[BatchScheduler] Fatal error during auto-confirm:', error);

    // Report to Sentry if available
    if (sentryAvailable && Sentry && process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { service: 'batchScheduler', operation: 'autoConfirmFirstBatch' }
      });
    }

    throw error;
  }
}

/**
 * Create batches for the next day (runs at 12:01 PM IST)
 * This ensures batches exist for orders placed after noon
 */
async function createNextDayBatches() {
  console.log(`[BatchScheduler] Creating next day batches at ${new Date().toISOString()}`);

  try {
    const ist = getISTTime();
    const tomorrow = getNextDay(ist.dateOnly);

    // Create 1st batch for tomorrow
    const batch1Cutoff = new Date(tomorrow);
    batch1Cutoff.setHours(BATCH_CONFIG.BATCH_1_CUTOFF_HOUR, 0, 0, 0);

    await Batch.findOrCreateBatch(
      tomorrow,
      '1st',
      batch1Cutoff,
      batch1Cutoff // Auto-confirm at cutoff
    );

    // Create 2nd batch for tomorrow
    const batch2Cutoff = new Date(tomorrow);
    batch2Cutoff.setHours(BATCH_CONFIG.BATCH_2_CUTOFF_HOUR, 0, 0, 0);

    await Batch.findOrCreateBatch(
      tomorrow,
      '2nd',
      batch2Cutoff,
      null // Manual confirm
    );

    console.log(`[BatchScheduler] Created batches for ${tomorrow.toISOString().split('T')[0]}`);

    return { success: true, date: tomorrow };
  } catch (error) {
    console.error('[BatchScheduler] Error creating next day batches:', error);

    if (sentryAvailable && Sentry && process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { service: 'batchScheduler', operation: 'createNextDayBatches' }
      });
    }

    throw error;
  }
}

/**
 * Start the batch scheduler
 * Runs two cron jobs:
 * 1. 8:00 AM IST daily - auto-confirm 1st batch
 * 2. 12:01 PM IST daily - create next day batches (optional, batches are also created on-demand)
 */
function startScheduler() {
  if (process.env.NODE_ENV === 'test') {
    console.log('[BatchScheduler] Skipping scheduler in test mode');
    return;
  }

  // Schedule 1st batch auto-confirmation at 8:00 AM IST daily
  // Format: minute hour day-of-month month day-of-week
  scheduledTask = cron.schedule('0 8 * * *', async () => {
    try {
      await autoConfirmFirstBatch();
    } catch (error) {
      console.error('[BatchScheduler] Scheduled auto-confirm failed:', error);
    }
  }, {
    scheduled: true,
    timezone: IST_TIMEZONE
  });

  // Also create next day batches at 12:01 PM IST (after 2nd batch cutoff)
  batchCreationTask = cron.schedule('1 12 * * *', async () => {
    try {
      await createNextDayBatches();
    } catch (error) {
      console.error('[BatchScheduler] Scheduled batch creation failed:', error);
    }
  }, {
    scheduled: true,
    timezone: IST_TIMEZONE
  });

  console.log(`[BatchScheduler] Scheduler started - auto-confirm at 8:00 AM IST, create batches at 12:01 PM IST`);
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  if (batchCreationTask) {
    batchCreationTask.stop();
    batchCreationTask = null;
  }
  console.log('[BatchScheduler] All schedulers stopped');
}

/**
 * Manually confirm a batch (for 2nd batch or emergency override)
 * @param {string} batchId - The batch ID to confirm
 * @param {string} userId - The user confirming the batch
 * @param {Object} options - Additional options
 * @param {boolean} options.generateBills - Whether to generate delivery bills (default: true)
 * @returns {Object} Result with batch and order count
 */
async function manuallyConfirmBatch(batchId, userId, options = {}) {
  const { generateBills = true } = options;
  const batch = await Batch.findById(batchId);

  if (!batch) {
    throw new Error('Batch not found');
  }

  if (batch.status !== 'open') {
    throw new Error(`Batch is already ${batch.status}`);
  }

  // Find all pending orders in this batch
  const pendingOrders = await Order.find({
    batch: batch._id,
    status: 'pending'
  });

  // Bulk update orders to confirmed
  let ordersConfirmed = 0;
  if (pendingOrders.length > 0) {
    const orderIds = pendingOrders.map(o => o._id);
    const updateResult = await Order.updateMany(
      { _id: { $in: orderIds } },
      {
        $set: {
          status: 'confirmed'
        }
      }
    );
    ordersConfirmed = updateResult.modifiedCount;
  }

  // Confirm the batch
  await batch.confirmBatch(userId);

  // Generate delivery bills if requested
  let billResults = { billsGenerated: 0, errors: [], totalOrders: 0 };
  let billGenerationFailed = false;
  let billGenerationError = null;
  if (generateBills) {
    try {
      console.log(`[BatchScheduler] Generating delivery bills for batch ${batch.batchNumber}...`);
      billResults = await generateBillsForBatch(batch);
      console.log(`[BatchScheduler] Generated ${billResults.billsGenerated} bills for ${billResults.totalOrders} orders`);
    } catch (billError) {
      console.error('[BatchScheduler] CRITICAL: Manual batch bill generation failed!', billError.message);
      billGenerationFailed = true;
      billGenerationError = billError.message;
      billResults.errors.push({ error: billError.message });
    }
  }

  return {
    success: true,
    batch,
    ordersConfirmed,
    billsGenerated: billResults.billsGenerated,
    billErrors: billResults.errors.length,
    billGenerationFailed: billGenerationFailed,
    billGenerationError: billGenerationError
  };
}

/**
 * Get batch information for display
 * @param {string} batchId - Batch ID
 * @returns {Object} Batch with order statistics
 */
async function getBatchWithStats(batchId) {
  const batch = await Batch.findById(batchId);

  if (!batch) {
    return null;
  }

  // Get order statistics for this batch
  const orderStats = await Order.aggregate([
    { $match: { batch: batch._id } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);

  return {
    ...batch.toObject(),
    orderStats
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  assignOrderToBatch,
  calculateBatchAssignment,
  autoConfirmFirstBatch,
  createNextDayBatches,
  manuallyConfirmBatch,
  getBatchWithStats,
  getISTTime,
  BATCH_CONFIG
};
