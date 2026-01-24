const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const MarketRate = require('../models/MarketRate');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/auth');
const { resetAllMarketRates } = require('../services/marketRateScheduler');
const { calculateEffectiveRate } = require('../services/pricingService');
const { roundTo2Decimals } = require('../utils/helpers');

// Update pending orders with zero rates when market rate is set
// Throws on failure so callers can surface the error appropriately
async function updatePendingOrdersWithZeroRates(productId, newRate) {
  const ordersToUpdate = await Order.find({
    status: { $in: ['pending', 'confirmed'] },
    'products.product': productId,
    'products.rate': 0
  }).populate('customer');

  let updatedCount = 0;

  for (const order of ordersToUpdate) {
    const customer = order.customer;
    if (!customer || (customer.pricingType !== 'market' && customer.pricingType !== 'markup')) {
      continue;
    }

    const calculatedRate = calculateEffectiveRate(customer, newRate);

    let orderModified = false;
    let newTotal = 0;

    for (const item of order.products) {
      if (item.product.toString() === productId.toString() && item.rate === 0) {
        item.rate = calculatedRate;
        item.amount = roundTo2Decimals(item.quantity * calculatedRate);
        orderModified = true;
      }
      newTotal += item.amount;
    }

    if (orderModified) {
      order.totalAmount = roundTo2Decimals(newTotal);
      await order.save();
      updatedCount++;
    }
  }

  return updatedCount;
}

// Validation middleware
const validateMarketRate = [
  body('product').notEmpty().withMessage('Product is required'),
  body('rate').isFloat({ min: 0, max: 100000 }).withMessage('Rate must be between ₹0 and ₹1,00,000'),
  body('effectiveDate').optional().isISO8601().withMessage('Invalid date format')
];

// @route   GET /api/market-rates
// @desc    Get current market rates
// @access  Private (All authenticated users)
router.get('/', protect, async (req, res, next) => {
  try {
    const { search, startDate, endDate } = req.query;
    const filter = {};

    if (search) {
      // Escape regex special characters to prevent ReDoS attacks
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.productName = { $regex: escapedSearch, $options: 'i' };
    }

    if (startDate || endDate) {
      filter.effectiveDate = {};
      if (startDate) filter.effectiveDate.$gte = new Date(startDate);
      if (endDate) filter.effectiveDate.$lte = new Date(endDate);
    }

    // Get latest rate for each product
    const rates = await MarketRate.aggregate([
      { $match: filter },
      { $sort: { effectiveDate: -1 } },
      {
        $group: {
          _id: '$product',
          latestRate: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$latestRate' } },
      { $sort: { productName: 1 } }
    ]);

    res.json({
      success: true,
      count: rates.length,
      data: rates
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/market-rates/all
// @desc    Get all market rate records
// @access  Private (All authenticated users)
router.get('/all', protect, async (req, res, next) => {
  try {
    const { limit: rawLimit } = req.query;
    // Validate and cap limit to prevent DoS (min 1, max 1000, default 100)
    const limit = Math.min(Math.max(parseInt(rawLimit) || 100, 1), 1000);

    const rates = await MarketRate.find()
      .populate('product', 'name unit')
      .select('-__v')
      .sort({ effectiveDate: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: rates.length,
      data: rates
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/market-rates/history-summary
// @desc    Get 7-day rate history summary for all products with optional category filter
// @access  Private (Admin, Staff)
router.get('/history-summary', protect, authorize('admin', 'staff'), [
  query('days').optional().isInt({ min: 1, max: 30 }).withMessage('Days must be between 1 and 30'),
  query('category').optional().isString().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const days = parseInt(req.query.days) || 7;
    const category = req.query.category;

    // Calculate date range
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get products with optional category filter
    const productFilter = { isActive: true };
    if (category && category !== 'all') {
      productFilter.category = category;
    }
    const products = await Product.find(productFilter).select('_id name category unit');

    // Get all categories for filter dropdown
    const allCategories = await Product.distinct('category', { isActive: true });

    // Build date array for the period
    const dates = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      dates.push(date);
    }

    // Get market rates for the period (limit to prevent memory spikes)
    const productIds = products.map(p => p._id);
    const maxRates = productIds.length * days * 2; // Allow for multiple rates per day per product
    const rates = await MarketRate.find({
      product: { $in: productIds },
      effectiveDate: { $gte: startDate, $lte: endDate }
    }).sort({ effectiveDate: -1 }).limit(maxRates);

    // Build a map of product rates by date
    const rateMap = {};
    for (const rate of rates) {
      const productId = rate.product.toString();
      const dateKey = rate.effectiveDate.toISOString().split('T')[0];

      if (!rateMap[productId]) {
        rateMap[productId] = {};
      }
      // Only keep the latest rate for each day
      if (!rateMap[productId][dateKey]) {
        rateMap[productId][dateKey] = {
          rate: rate.rate,
          trend: rate.trend,
          changePercentage: rate.changePercentage
        };
      }
    }

    // Build response data
    const historyData = products.map(product => {
      const productRates = rateMap[product._id.toString()] || {};
      const dailyRates = dates.map(date => {
        const dateKey = date.toISOString().split('T')[0];
        const rateInfo = productRates[dateKey];
        return {
          date: dateKey,
          rate: rateInfo ? rateInfo.rate : null,
          trend: rateInfo ? rateInfo.trend : null,
          changePercentage: rateInfo ? rateInfo.changePercentage : null
        };
      });

      return {
        _id: product._id,
        name: product.name,
        category: product.category,
        unit: product.unit,
        rates: dailyRates
      };
    });

    res.json({
      success: true,
      count: historyData.length,
      days,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      categories: allCategories,
      data: historyData
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/market-rates/history/:productId
// @desc    Get rate history for a product
// @access  Private (All authenticated users)
router.get('/history/:productId',
  protect,
  param('productId').isMongoId().withMessage('Invalid product ID'),
  async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array().map(e => e.msg).join(', ') });
    }

    const { limit: rawLimit } = req.query;
    // Validate and cap limit to prevent DoS (min 1, max 500, default 30)
    const limit = Math.min(Math.max(parseInt(rawLimit) || 30, 1), 500);

    const history = await MarketRate.find({ product: req.params.productId })
      .select('-__v')
      .sort({ effectiveDate: -1 })
      .limit(limit);

    if (history.length === 0) {
      res.status(404);
      throw new Error('No rate history found for this product');
    }

    res.json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/market-rates/reset-all
// @desc    Manually trigger reset of all market rates to 0 (for testing/recovery)
// @access  Private (Admin only)
// NOTE: This must be defined BEFORE /:id route to prevent "reset-all" being treated as an ID
router.post('/reset-all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const result = await resetAllMarketRates();

    res.json({
      success: true,
      message: `Reset ${result.count} of ${result.total} products to 0`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/market-rates/:id
// @desc    Get single market rate
// @access  Private (All authenticated users)
router.get('/:id',
  protect,
  param('id').isMongoId().withMessage('Invalid market rate ID'),
  async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array().map(e => e.msg).join(', ') });
    }

    const rate = await MarketRate.findById(req.params.id)
      .populate('product', 'name unit')
      .select('-__v');

    if (!rate) {
      res.status(404);
      throw new Error('Market rate not found');
    }

    res.json({
      success: true,
      data: rate
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/market-rates
// @desc    Create/Update market rate
// @access  Private (Admin, Staff)
router.post('/', protect, authorize('admin', 'staff'), validateMarketRate, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    // Verify product exists
    const product = await Product.findById(req.body.product);
    if (!product) {
      res.status(404);
      throw new Error('Product not found');
    }

    // Get previous rate for this product
    const previousRate = await MarketRate.findOne({ product: req.body.product })
      .sort({ effectiveDate: -1 });

    // Sanity check: warn if rate change exceeds 50%
    let rateChangeWarning = null;
    if (previousRate && previousRate.rate > 0) {
      const changePercent = Math.abs((req.body.rate - previousRate.rate) / previousRate.rate * 100);
      if (changePercent > 50) {
        rateChangeWarning = `Large rate change detected: ${changePercent.toFixed(1)}% (₹${previousRate.rate} → ₹${req.body.rate})`;
        console.warn(`[MarketRate] ${product.name}: ${rateChangeWarning}`);
      }
    }

    // Create new market rate entry
    const rateData = {
      product: req.body.product,
      productName: product.name,
      rate: req.body.rate,
      previousRate: previousRate ? previousRate.rate : 0,
      effectiveDate: req.body.effectiveDate || new Date(),
      source: req.body.source,
      notes: req.body.notes,
      updatedBy: req.body.updatedBy
    };

    const marketRate = await MarketRate.create(rateData);

    // Auto-update pending orders with zero rates for market/markup customers
    let ordersUpdated = 0;
    let orderUpdateError = null;
    if (req.body.rate > 0) {
      try {
        ordersUpdated = await updatePendingOrdersWithZeroRates(req.body.product, req.body.rate);
      } catch (error) {
        console.error('Failed to update pending orders with zero rates:', error);
        orderUpdateError = `Rate saved but failed to update pending orders: ${error.message}. Please check pending orders manually.`;
      }
    }

    const warnings = [rateChangeWarning, orderUpdateError].filter(Boolean);

    res.status(201).json({
      success: true,
      data: marketRate,
      ordersUpdated: ordersUpdated > 0 ? ordersUpdated : undefined,
      warning: warnings.length > 0 ? warnings.join('; ') : undefined,
      message: ordersUpdated > 0
        ? `Market rate updated. ${ordersUpdated} pending order(s) with zero rates were auto-updated.`
        : undefined
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/market-rates/:id
// @desc    Update market rate
// @access  Private (Admin, Staff)
router.put('/:id',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid market rate ID'),
  ...validateMarketRate,
  async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    // Whitelist allowed fields to prevent mass assignment
    const updateFields = {};
    if (req.body.rate !== undefined) updateFields.rate = req.body.rate;
    if (req.body.previousRate !== undefined) updateFields.previousRate = req.body.previousRate;
    if (req.body.effectiveDate !== undefined) updateFields.effectiveDate = req.body.effectiveDate;
    if (req.body.trend !== undefined) updateFields.trend = req.body.trend;
    if (req.body.changePercentage !== undefined) updateFields.changePercentage = req.body.changePercentage;
    if (req.body.source !== undefined) updateFields.source = req.body.source;
    if (req.body.notes !== undefined) updateFields.notes = req.body.notes;

    const marketRate = await MarketRate.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!marketRate) {
      res.status(404);
      throw new Error('Market rate not found');
    }

    res.json({
      success: true,
      data: marketRate
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/market-rates/:id
// @desc    Delete market rate
// @access  Private (Admin only)
router.delete('/:id',
  protect,
  authorize('admin'),
  param('id').isMongoId().withMessage('Invalid market rate ID'),
  async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array().map(e => e.msg).join(', ') });
    }

    const marketRate = await MarketRate.findByIdAndDelete(req.params.id);

    if (!marketRate) {
      res.status(404);
      throw new Error('Market rate not found');
    }

    res.json({
      success: true,
      message: 'Market rate deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
