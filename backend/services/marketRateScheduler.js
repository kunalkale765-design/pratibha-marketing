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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let resetCount = 0;
    const errors = [];

    for (const product of products) {
      try {
        // Get the current latest rate for previousRate tracking
        const currentRate = await MarketRate.findOne({ product: product._id })
          .sort({ effectiveDate: -1 });

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
  resetAllMarketRates, // Export for manual trigger via API
  CATEGORIES_TO_RESET  // Export for reference/testing
};
