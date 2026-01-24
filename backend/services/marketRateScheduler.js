const cron = require('node-cron');
const MarketRate = require('../models/MarketRate');
const Product = require('../models/Product');

// Import Sentry if available (optional dependency)
let Sentry;
try {
  Sentry = require('@sentry/node');
} catch (e) {
  console.log('[MarketRateScheduler] Sentry not available:', e.message);
  // Monitoring disabled - errors will only be logged to console
}

let scheduledTask = null;

// Track scheduler health for status checks
const schedulerHealth = {
  lastResetError: null,
  lastResetSuccess: null
};

// Categories to reset daily - only these will have rates set to 0 at midnight
const CATEGORIES_TO_RESET = ['Indian Vegetables'];

/**
 * Reset market rates to 0 for selected categories only
 * This creates new MarketRate records with rate=0, preserving history
 * Only affects products in CATEGORIES_TO_RESET - all other products keep their rates
 */
async function resetAllMarketRates() {
  const startTime = Date.now();
  console.log(`[MarketRateScheduler] Starting daily rate reset at ${new Date().toISOString()}`);
  console.log(`[MarketRateScheduler] Resetting categories: ${CATEGORIES_TO_RESET.join(', ')}`);

  try {
    // Get only active products in categories that need daily reset
    const products = await Product.find({
      isActive: true,
      category: { $in: CATEGORIES_TO_RESET }
    });

    if (products.length === 0) {
      console.log(`[MarketRateScheduler] No active products found in categories: ${CATEGORIES_TO_RESET.join(', ')}`);
      return { success: true, count: 0, message: 'No active products in reset categories' };
    }

    // Use IST for "today" calculation (consistent with batchScheduler)
    const { getISTTime } = require('./batchScheduler');
    const today = getISTTime().dateOnly;

    let resetCount = 0;
    const errors = [];

    // Batch-fetch current rates for all products in one query
    const currentRates = await MarketRate.aggregate([
      { $match: { product: { $in: products.map(p => p._id) } } },
      { $sort: { effectiveDate: -1 } },
      { $group: { _id: '$product', latestRate: { $first: '$rate' } } }
    ]);
    const rateMap = new Map(currentRates.map(r => [r._id.toString(), r.latestRate]));

    // Process in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const chunk = products.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        chunk.map(product => {
          const previousRate = rateMap.get(product._id.toString()) || 0;
          return MarketRate.create({
            product: product._id,
            productName: product.name,
            rate: 0,
            previousRate,
            effectiveDate: today,
            source: 'Daily Reset',
            notes: 'Automatically reset by system scheduler',
            updatedBy: 'system_scheduler'
          });
        })
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          resetCount++;
        } else {
          const product = chunk[idx];
          errors.push({ product: product.name, error: result.reason.message });
          console.error(`[MarketRateScheduler] Error resetting rate for ${product.name}:`, result.reason.message);
        }
      });
    }

    const duration = Date.now() - startTime;
    console.log(`[MarketRateScheduler] Reset complete: ${resetCount}/${products.length} products (${CATEGORIES_TO_RESET.join(', ')}) in ${duration}ms`);

    if (errors.length > 0) {
      console.error('[MarketRateScheduler] Errors during reset:', errors);
    }

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

    throw error;
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

  // Schedule for midnight every day: '0 0 * * *'
  // Format: second(optional) minute hour day-of-month month day-of-week
  // Use IST timezone consistently with batchScheduler to avoid day-boundary mismatches
  const IST_TIMEZONE = 'Asia/Kolkata';

  scheduledTask = cron.schedule('0 0 * * *', async () => {
    try {
      await resetAllMarketRates();
      schedulerHealth.lastResetSuccess = new Date();
      schedulerHealth.lastResetError = null;
    } catch (error) {
      console.error('[MarketRateScheduler] Scheduled job failed, retrying in 2 minutes:', error.message);
      schedulerHealth.lastResetError = { message: error.message, at: new Date() };

      // Retry once after 2 minutes
      setTimeout(async () => {
        try {
          await resetAllMarketRates();
          console.log('[MarketRateScheduler] Rate reset retry succeeded');
          schedulerHealth.lastResetSuccess = new Date();
          schedulerHealth.lastResetError = null;
        } catch (retryError) {
          console.error('[MarketRateScheduler] Rate reset retry also failed:', retryError.message);
          schedulerHealth.lastResetError = { message: retryError.message, at: new Date(), retryFailed: true };
        }
      }, 2 * 60 * 1000);
    }
  }, {
    scheduled: true,
    timezone: IST_TIMEZONE
  });

  console.log(`[MarketRateScheduler] Scheduler started - will reset rates at midnight IST`);
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

/**
 * Get scheduler health status for monitoring
 */
function getSchedulerHealth() {
  return { ...schedulerHealth };
}

module.exports = {
  startScheduler,
  stopScheduler,
  resetAllMarketRates, // Export for manual trigger via API
  getSchedulerHealth,
  CATEGORIES_TO_RESET  // Export for reference/testing
};
