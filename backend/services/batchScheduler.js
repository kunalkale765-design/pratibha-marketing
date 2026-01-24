const cron = require('node-cron');
const Batch = require('../models/Batch');
const Order = require('../models/Order');
const { generateBillsForBatch } = require('./deliveryBillService');
const { withLock } = require('../utils/locks');
const { getISTTime, getNextDay, IST_TIMEZONE } = require('../utils/dateTime');

// Import Sentry if available (optional dependency)
let Sentry;
let sentryAvailable = false;
try {
  Sentry = require('@sentry/node');
  sentryAvailable = true;
} catch (e) {
  console.error('[BatchScheduler] WARNING: Sentry not available - batch scheduler errors will not be monitored!');
  console.error('[BatchScheduler] Sentry import error:', e.message);
}

let scheduledTask = null;
let batchCreationTask = null;
let recoveryTask = null;

// Track scheduler health for status checks
const schedulerHealth = {
  lastAutoConfirmError: null,
  lastAutoConfirmSuccess: null,
  lastBatchCreationError: null,
  lastBatchCreationSuccess: null
};
let isAutoConfirmRunning = false; // Concurrency guard
let autoConfirmStartedAt = null; // Timestamp for deadlock detection
const AUTO_CONFIRM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute safety timeout

// Batch cutoff hours (IST)
const BATCH_CONFIG = {
  BATCH_1_CUTOFF_HOUR: 8,   // 8:00 AM IST
  BATCH_2_CUTOFF_HOUR: 12   // 12:00 PM IST (noon)
};

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
    // Calculate cutoff as UTC timestamp: midnight IST + cutoff hours
    // Using arithmetic instead of setHours() which uses server local timezone
    const cutoffTime = new Date(today.getTime() + BATCH_CONFIG.BATCH_1_CUTOFF_HOUR * 60 * 60 * 1000);
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
    const cutoffTime = new Date(today.getTime() + BATCH_CONFIG.BATCH_2_CUTOFF_HOUR * 60 * 60 * 1000);

    return {
      batchDate: today,
      batchType: '2nd',
      cutoffTime,
      autoConfirmTime: null // 2nd batch is manually confirmed
    };
  }

  // After 12:00 PM → 1st Batch (next day)
  const tomorrow = getNextDay(today);
  const cutoffTime = new Date(tomorrow.getTime() + BATCH_CONFIG.BATCH_1_CUTOFF_HOUR * 60 * 60 * 1000);
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
  // Concurrency guard with deadlock recovery
  if (isAutoConfirmRunning) {
    const elapsed = autoConfirmStartedAt ? Date.now() - autoConfirmStartedAt : 0;
    if (elapsed < AUTO_CONFIRM_TIMEOUT_MS) {
      console.warn(`[BatchScheduler] Auto-confirm already in progress (${Math.round(elapsed / 1000)}s), skipping`);
      return { success: false, message: 'Already running' };
    }
    // Lock held too long - likely a deadlock, force release
    console.error(`[BatchScheduler] Auto-confirm lock held for ${Math.round(elapsed / 1000)}s, forcing release (possible deadlock)`);
  }
  isAutoConfirmRunning = true;
  autoConfirmStartedAt = Date.now();

  const startTime = Date.now();
  console.log(`[BatchScheduler] Starting auto-confirm for 1st batch at ${new Date().toISOString()}`);

  try {
    const ist = getISTTime();
    const today = ist.dateOnly;

    // Atomically claim the batch (prevents duplicate confirmation across instances)
    const batch = await Batch.findOneAndUpdate(
      { date: today, batchType: '1st', status: 'open' },
      { $set: { status: 'confirmed', confirmedAt: new Date(), confirmedBy: null } },
      { new: true }
    );

    if (!batch) {
      console.log('[BatchScheduler] No open 1st batch found for today (or already confirmed), skipping');
      return { success: true, ordersConfirmed: 0, message: 'No open batch' };
    }

    // Find all pending orders in this batch
    const pendingOrders = await Order.find({
      batch: batch._id,
      status: 'pending'
    });

    if (pendingOrders.length === 0) {
      console.log('[BatchScheduler] No pending orders in 1st batch, batch confirmed');
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

    // Generate delivery bills with retry logic
    let billResults = { billsGenerated: 0, errors: [], totalOrders: 0 };
    let billGenerationFailed = false;
    let billGenerationError = null;
    const MAX_BILL_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_BILL_RETRIES; attempt++) {
      try {
        console.log(`[BatchScheduler] Generating delivery bills for batch ${batch.batchNumber} (attempt ${attempt}/${MAX_BILL_RETRIES})...`);
        billResults = await generateBillsForBatch(batch);
        console.log(`[BatchScheduler] Generated ${billResults.billsGenerated} bills for ${billResults.totalOrders} orders`);
        if (billResults.errors.length > 0) {
          console.warn(`[BatchScheduler] Bill generation had ${billResults.errors.length} errors:`, billResults.errors);
        }
        billGenerationFailed = false;
        billGenerationError = null;
        break; // Success, exit retry loop
      } catch (billError) {
        console.error(`[BatchScheduler] Bill generation attempt ${attempt} failed:`, billError.message);
        billGenerationFailed = true;
        billGenerationError = billError.message;

        if (attempt < MAX_BILL_RETRIES) {
          // Exponential backoff: 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`[BatchScheduler] Retrying bill generation in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If all retries failed, revert orders to pending and reopen batch
    if (billGenerationFailed) {
      console.error('[BatchScheduler] CRITICAL: All bill generation attempts failed! Reverting orders to pending.');
      try {
        await Order.updateMany(
          { _id: { $in: orderIds } },
          { $set: { status: 'pending' } }
        );
        // Reopen the batch
        batch.status = 'open';
        batch.confirmedAt = undefined;
        await batch.save();
        console.error('[BatchScheduler] Orders reverted to pending, batch reopened.');
      } catch (revertError) {
        console.error('[BatchScheduler] CRITICAL: Failed to revert orders after bill failure!', revertError.message);
      }
      // Report to Sentry if available
      if (sentryAvailable && Sentry && process.env.SENTRY_DSN) {
        Sentry.captureException(new Error(`Bill generation failed after ${MAX_BILL_RETRIES} retries: ${billGenerationError}`), {
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
      success: !billGenerationFailed,
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
  } finally {
    isAutoConfirmRunning = false;
    autoConfirmStartedAt = null;
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
    // Use arithmetic to avoid setHours() which uses server local timezone
    const batch1Cutoff = new Date(tomorrow.getTime() + BATCH_CONFIG.BATCH_1_CUTOFF_HOUR * 60 * 60 * 1000);

    await Batch.findOrCreateBatch(
      tomorrow,
      '1st',
      batch1Cutoff,
      batch1Cutoff // Auto-confirm at cutoff
    );

    // Create 2nd batch for tomorrow
    const batch2Cutoff = new Date(tomorrow.getTime() + BATCH_CONFIG.BATCH_2_CUTOFF_HOUR * 60 * 60 * 1000);

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
 * Check for missed batch confirmations on startup
 * If the server was down during the 8 AM IST window, confirm any missed 1st batches
 */
async function checkMissedBatches() {
  try {
    const ist = getISTTime();

    // Only check if it's past the auto-confirm time (8 AM IST)
    if (ist.hour >= BATCH_CONFIG.BATCH_1_CUTOFF_HOUR) {
      const today = ist.dateOnly;
      const batch = await Batch.findOne({
        date: today,
        batchType: '1st',
        status: 'open'
      });

      if (batch) {
        console.log('[BatchScheduler] RECOVERY: Found unconfirmed 1st batch on startup, confirming now');
        const lockResult = await withLock('batch-auto-confirm', async () => {
          return await autoConfirmFirstBatch();
        }, { ttlMs: 5 * 60 * 1000, timeoutMs: 60000 });

        if (lockResult.skipped) {
          console.log('[BatchScheduler] RECOVERY: Another instance is handling the missed batch');
        } else if (lockResult.error) {
          throw lockResult.error;
        } else {
          schedulerHealth.lastAutoConfirmSuccess = new Date();
        }
      }
    }
  } catch (error) {
    console.error('[BatchScheduler] Error checking missed batches on startup:', error.message);
    schedulerHealth.lastAutoConfirmError = { message: `Startup recovery failed: ${error.message}`, at: new Date() };

    // Retry once after 30 seconds (DB may still be warming up)
    setTimeout(async () => {
      try {
        const ist = getISTTime();
        if (ist.hour >= BATCH_CONFIG.BATCH_1_CUTOFF_HOUR) {
          const today = ist.dateOnly;
          const batch = await Batch.findOne({ date: today, batchType: '1st', status: 'open' });
          if (batch) {
            console.log('[BatchScheduler] RECOVERY RETRY: Confirming missed batch');
            const retryLock = await withLock('batch-auto-confirm', async () => {
              return await autoConfirmFirstBatch();
            }, { ttlMs: 5 * 60 * 1000, timeoutMs: 60000 });

            if (!retryLock.skipped && !retryLock.error) {
              schedulerHealth.lastAutoConfirmSuccess = new Date();
              schedulerHealth.lastAutoConfirmError = null;
            }
          }
        }
      } catch (retryErr) {
        console.error('[BatchScheduler] Startup recovery retry also failed:', retryErr.message);
        schedulerHealth.lastAutoConfirmError = { message: retryErr.message, at: new Date(), retryFailed: true };
      }
    }, 30 * 1000);
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

  // Check for missed batch confirmations on startup (async, non-blocking)
  checkMissedBatches().catch(err => {
    console.error('[BatchScheduler] Startup missed-batch check failed:', err.message);
  });

  // Schedule 1st batch auto-confirmation at 8:00 AM IST daily
  // Uses distributed lock to prevent duplicate execution across PM2 instances
  scheduledTask = cron.schedule('0 8 * * *', async () => {
    const lockResult = await withLock('batch-auto-confirm', async () => {
      return await autoConfirmFirstBatch();
    }, { ttlMs: 5 * 60 * 1000, timeoutMs: 60000 });

    if (lockResult.skipped) {
      console.log(`[BatchScheduler] Auto-confirm skipped: another instance (${lockResult.holder}) holds the lock`);
      return;
    }

    if (lockResult.error) {
      const error = lockResult.error;
      console.error('[BatchScheduler] Scheduled auto-confirm failed, retrying in 2 minutes:', error.message);
      schedulerHealth.lastAutoConfirmError = { message: error.message, at: new Date() };

      // Retry once after 2 minutes (also with lock)
      setTimeout(async () => {
        const retryResult = await withLock('batch-auto-confirm', async () => {
          return await autoConfirmFirstBatch();
        }, { ttlMs: 5 * 60 * 1000, timeoutMs: 60000 });

        if (retryResult.skipped) {
          console.log('[BatchScheduler] Auto-confirm retry skipped: another instance already ran it');
          return;
        }
        if (retryResult.error) {
          console.error('[BatchScheduler] CRITICAL: Auto-confirm retry also failed:', retryResult.error.message);
          schedulerHealth.lastAutoConfirmError = { message: retryResult.error.message, at: new Date(), retryFailed: true };
        } else {
          console.log('[BatchScheduler] Auto-confirm retry succeeded');
          schedulerHealth.lastAutoConfirmSuccess = new Date();
          schedulerHealth.lastAutoConfirmError = null;
        }
      }, 2 * 60 * 1000);
      return;
    }

    // Success
    schedulerHealth.lastAutoConfirmSuccess = new Date();
    schedulerHealth.lastAutoConfirmError = null;

    // Log if bill generation failed even though orders were confirmed
    if (lockResult.result && lockResult.result.billGenerationFailed) {
      console.error('[BatchScheduler] WARNING: Orders confirmed but bill generation failed!');
      schedulerHealth.lastAutoConfirmError = {
        message: `Bills failed: ${lockResult.result.billGenerationError}`,
        at: new Date(),
        ordersConfirmed: lockResult.result.ordersConfirmed
      };
    }
  }, {
    scheduled: true,
    timezone: IST_TIMEZONE
  });

  // Recovery check: every 15 minutes between 8:15-9:00 AM IST
  // Catches missed batch confirmations due to DB outages or server restarts
  recoveryTask = cron.schedule('15,30,45 8 * * *', async () => {
    const ist = getISTTime();
    const today = ist.dateOnly;
    const openBatch = await Batch.findOne({ date: today, batchType: '1st', status: 'open' });
    if (openBatch) {
      console.log('[BatchScheduler] RECOVERY: Found unconfirmed 1st batch at periodic check, confirming now');
      const lockResult = await withLock('batch-auto-confirm', async () => {
        return await autoConfirmFirstBatch();
      }, { ttlMs: 5 * 60 * 1000, timeoutMs: 60000 });

      if (lockResult.skipped) {
        console.log('[BatchScheduler] RECOVERY: Another instance is handling the batch');
      } else if (lockResult.error) {
        console.error('[BatchScheduler] RECOVERY: Failed:', lockResult.error.message);
        schedulerHealth.lastAutoConfirmError = { message: `Recovery failed: ${lockResult.error.message}`, at: new Date() };
      } else {
        console.log('[BatchScheduler] RECOVERY: Batch confirmed successfully');
        schedulerHealth.lastAutoConfirmSuccess = new Date();
        schedulerHealth.lastAutoConfirmError = null;
      }
    }
  }, {
    scheduled: true,
    timezone: IST_TIMEZONE
  });

  // Also create next day batches at 12:01 PM IST (after 2nd batch cutoff)
  batchCreationTask = cron.schedule('1 12 * * *', async () => {
    const lockResult = await withLock('batch-creation-daily', async () => {
      return await createNextDayBatches();
    }, { ttlMs: 2 * 60 * 1000, timeoutMs: 30000 });

    if (lockResult.skipped) {
      console.log(`[BatchScheduler] Batch creation skipped: another instance (${lockResult.holder}) holds the lock`);
      return;
    }

    if (lockResult.error) {
      console.error('[BatchScheduler] Scheduled batch creation failed:', lockResult.error.message);
      schedulerHealth.lastBatchCreationError = { message: lockResult.error.message, at: new Date() };
      return;
    }

    schedulerHealth.lastBatchCreationSuccess = new Date();
    schedulerHealth.lastBatchCreationError = null;
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
  if (recoveryTask) {
    recoveryTask.stop();
    recoveryTask = null;
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

  // Generate delivery bills if requested (with retry)
  let billResults = { billsGenerated: 0, errors: [], totalOrders: 0 };
  let billGenerationFailed = false;
  let billGenerationError = null;
  if (generateBills) {
    const MAX_BILL_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_BILL_RETRIES; attempt++) {
      try {
        console.log(`[BatchScheduler] Generating delivery bills for batch ${batch.batchNumber} (attempt ${attempt}/${MAX_BILL_RETRIES})...`);
        billResults = await generateBillsForBatch(batch);
        console.log(`[BatchScheduler] Generated ${billResults.billsGenerated} bills for ${billResults.totalOrders} orders`);
        billGenerationFailed = false;
        billGenerationError = null;
        break;
      } catch (billError) {
        console.error(`[BatchScheduler] Manual batch bill generation attempt ${attempt} failed:`, billError.message);
        billGenerationFailed = true;
        billGenerationError = billError.message;
        if (attempt < MAX_BILL_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If all retries failed, revert orders to pending and reopen batch
    if (billGenerationFailed) {
      console.error('[BatchScheduler] CRITICAL: Manual bill generation failed after retries! Reverting.');
      try {
        if (pendingOrders.length > 0) {
          const orderIds = pendingOrders.map(o => o._id);
          await Order.updateMany(
            { _id: { $in: orderIds } },
            { $set: { status: 'pending' } }
          );
        }
        batch.status = 'open';
        batch.confirmedAt = undefined;
        await batch.save();
      } catch (revertError) {
        console.error('[BatchScheduler] Failed to revert after manual bill failure:', revertError.message);
      }
      billResults.errors.push({ error: billGenerationError });
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

/**
 * Get scheduler health status for monitoring
 */
function getSchedulerHealth() {
  return { ...schedulerHealth };
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
  getSchedulerHealth,
  BATCH_CONFIG
};
