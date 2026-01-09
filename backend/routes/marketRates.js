const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const MarketRate = require('../models/MarketRate');
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');

// Validation middleware
const validateMarketRate = [
  body('product').notEmpty().withMessage('Product is required'),
  body('rate').isFloat({ min: 0 }).withMessage('Rate must be positive'),
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
      filter.productName = { $regex: search, $options: 'i' };
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

// @route   GET /api/market-rates/history/:productId
// @desc    Get rate history for a product
// @access  Private (All authenticated users)
router.get('/history/:productId', protect, async (req, res, next) => {
  try {
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

// @route   GET /api/market-rates/:id
// @desc    Get single market rate
// @access  Private (All authenticated users)
router.get('/:id', protect, async (req, res, next) => {
  try {
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
        errors: errors.array()
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

    res.status(201).json({
      success: true,
      data: marketRate
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/market-rates/:id
// @desc    Update market rate
// @access  Private (Admin, Staff)
router.put('/:id', protect, authorize('admin', 'staff'), validateMarketRate, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const marketRate = await MarketRate.findByIdAndUpdate(
      req.params.id,
      req.body,
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
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
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
