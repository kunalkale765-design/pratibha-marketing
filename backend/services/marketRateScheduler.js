const cron = require('node-cron');
const MarketRate = require('../models/MarketRate');
const Product = require('../models/Product');
const JobLog = require('../models/JobLog');

// Import Sentry if available (optional dependency)
let Sentry;
try {
  Sentry = require('@sentry/node');
} catch (e) {
  console.log('[MarketRateScheduler] Sentry not available:', e.message);
  // Monitoring disabled - errors will only be logged to console
}

let scheduledTask = null;

// The job name constant for logging
const JOB_NAME = 'DailyMarketRateReset';

/**
 * Reset market rates for specific category (Indian Vegetables) to 0 for the new day
 * This creates new MarketRate records with rate=0, preserving history
 */
async function resetAllMarketRates() {
  const startTime = Date.now();
  console.log(`[MarketRateScheduler] Starting daily rate reset at ${new Date().toISOString()}`);

  try {
    // Only reset rates for 'Indian Vegetables' category as requested
    // Case-insensitive match for robustness
    const category = 'Indian Vegetables';

    // Find products in this category
    // Note: We use regex for case-insensitive match
    const products = await Product.find({
      isActive: true,
      category: { $regex: new RegExp(`^${category}$`, 'i') }
    });

    if (products.length === 0) {
      console.log(`[MarketRateScheduler] No active products found in category '${category}', skipping reset`);

      // Log successful skip
      await JobLog.create({
        jobName: JOB_NAME,
        status: 'success',
        result: { message: `No active products in category '${category}'`, count: 0 }
      });

      return { success: true, count: 0, message: `No active products in '${category}'` };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let resetCount = 0;
    const errors = [];

    for (const product of products) {
      try {
        // Get the current latest rate for previousRate tracking
        const currentRate = await MarketRate.findOne({ product: product._id })
          .sort({ effectiveDate: -1 });

        // Check if rate already exists for today (idempotency)
        const existingToday = await MarketRate.findOne({
          product: product._id,
          effectiveDate: { $gte: today }
        });

        if (existingToday) {
          // Already reset/set for today, skip
          continue;
        }

        // Create new rate record with rate=0
        await MarketRate.create({
          product: product._id,
          productName: product.name,
          rate: 0,
          previousRate: currentRate ? currentRate.rate : 0,
          effectiveDate: today,
          source: 'Daily Reset',
          notes: 'Automatically reset by system scheduler',
          updatedBy: 'system_scheduler'
        });

        resetCount++;
      } catch (err) {
        errors.push({ product: product.name, error: err.message });
        console.error(`[MarketRateScheduler] Error resetting rate for ${product.name}:`, err.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[MarketRateScheduler] Reset complete: ${resetCount}/${products.length} products in ${duration}ms`);

    if (errors.length > 0) {
      console.error('[MarketRateScheduler] Errors during reset:', errors);
    }

    // Log execution
    await JobLog.create({
      jobName: JOB_NAME,
      status: errors.length > 0 ? 'failed' : 'success',
      result: {
        count: resetCount,
        total: products.length,
        duration,
        errors: errors.length > 0 ? errors : undefined
      },
      error: errors.length > 0 ? 'Partial failure' : undefined
    });

    return {
      success: true,
      count: resetCount,
      total: products.length,
      errors: errors.length > 0 ? errors : undefined,
      duration
    };
  } catch (error) {
    console.error('[MarketRateScheduler] Fatal error during reset:', error);

    // Report to Sentry if available
    if (Sentry && process.env.SENTRY_DSN) {
      Sentry.captureException(error);
    }

    // Log failure
    try {
      await JobLog.create({
        jobName: JOB_NAME,
        status: 'failed',
        error: error.message
      });
    } catch (logError) {
      console.error('[MarketRateScheduler] Failed to write to JobLog:', logError);
    }

    throw error;
  }
}

/**
 * Check if we missed the daily reset (e.g. server was down at midnight)
 * If missed, run it immediately
 */
async function checkMissedJobs() {
  console.log('[MarketRateScheduler] Checking for missed jobs...');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if job ran today
    const jobLog = await JobLog.findOne({
      jobName: JOB_NAME,
      executedAt: { $gte: today }
    });

    if (!jobLog) {
      console.log('[MarketRateScheduler] Daily reset was missed, running now...');
      await resetAllMarketRates();
    } else {
      console.log('[MarketRateScheduler] Daily reset already ran today.');
    }
  } catch (error) {
    console.error('[MarketRateScheduler] Error checking missed jobs:', error);
  }
}

/**
 * Start the market rate scheduler
 * Runs at midnight (00:00) server local time every day
 */
function startScheduler() {
  if (process.env.NODE_ENV === 'test') {
    console.log('[MarketRateScheduler] Skipping scheduler in test mode');
    return;
  }

  // Check for missed jobs on startup
  checkMissedJobs();

  // Schedule for midnight every day: '0 0 * * *'
  // Format: second(optional) minute hour day-of-month month day-of-week
  scheduledTask = cron.schedule('0 0 * * *', async () => {
    try {
      await resetAllMarketRates();
    } catch (error) {
      console.error('[MarketRateScheduler] Scheduled job failed:', error);
    }
  }, {
    scheduled: true,
    timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone
  });

  console.log(`[MarketRateScheduler] Scheduler started - will reset rates at midnight (${process.env.TZ || 'system timezone'})`);
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log('[MarketRateScheduler] Scheduler stopped');
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  resetAllMarketRates // Export for manual trigger via API
};
