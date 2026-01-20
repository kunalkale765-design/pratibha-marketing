const cron = require('node-cron');
const Batch = require('../models/Batch');
const Order = require('../models/Order');
const JobLog = require('../models/JobLog');

// Import Sentry if available (optional dependency)
let Sentry;
try {
  Sentry = require('@sentry/node');
} catch (e) {
  console.log('[BatchScheduler] Sentry not available:', e.message);
  // Monitoring disabled - errors will only be logged to console
}

let scheduledTask = null;

// IST timezone configuration
const IST_TIMEZONE = 'Asia/Kolkata';

// Batch cutoff hours (IST)
const BATCH_CONFIG = {
  BATCH_1_CUTOFF_HOUR: 8,   // 8:00 AM IST
  BATCH_2_CUTOFF_HOUR: 12   // 12:00 PM IST (noon)
};

// Job names for logging
const JOB_AUTO_CONFIRM = 'AutoConfirmFirstBatch';
const JOB_CREATE_BATCHES = 'CreateNextDayBatches';

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

  return {
    hour: istTime.getHours(),
    minutes: istTime.getMinutes(),
    date: istTime,
    // Get just the date portion at midnight IST
    dateOnly: new Date(istTime.getFullYear(), istTime.getMonth(), istTime.getDate())
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

      // Log skipped execution
      await JobLog.create({
        jobName: JOB_AUTO_CONFIRM,
        status: 'success',
        result: { message: 'No open batch', date: today }
      });

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

      // Log successful execution (empty)
      await JobLog.create({
        jobName: JOB_AUTO_CONFIRM,
        status: 'success',
        result: {
          message: 'Batch confirmed (no pending orders)',
          batchNumber: batch.batchNumber
        }
      });

      return { success: true, ordersConfirmed: 0, message: 'Batch confirmed (no pending orders)' };
    }

    // Bulk update orders to confirmed and lock them
    const orderIds = pendingOrders.map(o => o._id);
    const updateResult = await Order.updateMany(
      { _id: { $in: orderIds } },
      {
        $set: {
          status: 'confirmed',
          batchLocked: true
        }
      }
    );

    // Confirm the batch
    await batch.confirmBatch(null); // null = auto-confirmed

    const duration = Date.now() - startTime;
    console.log(`[BatchScheduler] Auto-confirm complete: ${updateResult.modifiedCount} orders confirmed in ${duration}ms`);

    // Log successful execution
    await JobLog.create({
      jobName: JOB_AUTO_CONFIRM,
      status: 'success',
      result: {
        ordersConfirmed: updateResult.modifiedCount,
        batchNumber: batch.batchNumber,
        duration
      }
    });

    return {
      success: true,
      ordersConfirmed: updateResult.modifiedCount,
      batchNumber: batch.batchNumber,
      duration
    };
  } catch (error) {
    console.error('[BatchScheduler] Fatal error during auto-confirm:', error);

    // Report to Sentry if available
    if (Sentry && process.env.SENTRY_DSN) {
      Sentry.captureException(error);
    }

    // Log failed execution
    try {
      await JobLog.create({
        jobName: JOB_AUTO_CONFIRM,
        status: 'failed',
        error: error.message
      });
    } catch (logError) {
      console.error('[BatchScheduler] Failed to write to JobLog:', logError);
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

    // Log successful execution
    await JobLog.create({
      jobName: JOB_CREATE_BATCHES,
      status: 'success',
      result: { date: tomorrow }
    });

    return { success: true, date: tomorrow };
  } catch (error) {
    console.error('[BatchScheduler] Error creating next day batches:', error);

    if (Sentry && process.env.SENTRY_DSN) {
      Sentry.captureException(error);
    }

    // Log failed execution
    try {
      await JobLog.create({
        jobName: JOB_CREATE_BATCHES,
        status: 'failed',
        error: error.message
      });
    } catch (logError) {
      console.error('[BatchScheduler] Failed to write to JobLog:', logError);
    }

    throw error;
  }
}

/**
 * Check for missed jobs on startup (catch-up logic)
 */
async function checkMissedJobs() {
  console.log('[BatchScheduler] Checking for missed jobs...');

  try {
    const ist = getISTTime();
    const today = ist.dateOnly;
    const hour = ist.hour;

    // Check Auto Confirm (should run at 8:00 AM)
    // Only check if it's currently past 8:00 AM
    if (hour >= BATCH_CONFIG.BATCH_1_CUTOFF_HOUR) {
      // Find execution for today
      const confirmLog = await JobLog.findOne({
        jobName: JOB_AUTO_CONFIRM,
        executedAt: { $gte: today }
      });

      if (!confirmLog) {
        console.log('[BatchScheduler] Auto-confirm job missed, running catch-up...');
        await autoConfirmFirstBatch();
      } else {
        console.log('[BatchScheduler] Auto-confirm already ran today.');
      }
    }

    // Check Batch Creation (should run at 12:00 PM)
    // Only check if it's currently past 12:00 PM
    if (hour >= BATCH_CONFIG.BATCH_2_CUTOFF_HOUR) {
      const createLog = await JobLog.findOne({
        jobName: JOB_CREATE_BATCHES,
        executedAt: { $gte: today }
      });

      if (!createLog) {
        console.log('[BatchScheduler] Batch creation job missed, running catch-up...');
        await createNextDayBatches();
      } else {
        console.log('[BatchScheduler] Batch creation already ran today.');
      }
    }

  } catch (error) {
    console.error('[BatchScheduler] Error checking missed jobs:', error);
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

  // Run catch-up logic
  checkMissedJobs();

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
  cron.schedule('1 12 * * *', async () => {
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
    console.log('[BatchScheduler] Scheduler stopped');
  }
}

/**
 * Manually confirm a batch (for 2nd batch or emergency override)
 * @param {string} batchId - The batch ID to confirm
 * @param {string} userId - The user confirming the batch
 * @returns {Object} Result with batch and order count
 */
async function manuallyConfirmBatch(batchId, userId) {
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

  // Bulk update orders to confirmed and lock them
  let ordersConfirmed = 0;
  if (pendingOrders.length > 0) {
    const orderIds = pendingOrders.map(o => o._id);
    const updateResult = await Order.updateMany(
      { _id: { $in: orderIds } },
      {
        $set: {
          status: 'confirmed',
          batchLocked: true
        }
      }
    );
    ordersConfirmed = updateResult.modifiedCount;
  }

  // Confirm the batch
  await batch.confirmBatch(userId);

  return {
    success: true,
    batch,
    ordersConfirmed
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
