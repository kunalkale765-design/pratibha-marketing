const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');

// Validation middleware
const validateProduct = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('unit').isIn(['quintal', 'bag', 'kg', 'piece', 'ton']).withMessage('Invalid unit'),
  body('category').optional().trim()
];

// @route   GET /api/products
// @desc    Get all products
// @access  Private (All authenticated users)
router.get('/', protect, async (req, res, next) => {
  try {
    const { search, category, isActive } = req.query;
    const filter = {};

    if (search) {
      // Escape regex special characters to prevent ReDoS attacks
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: escapedSearch, $options: 'i' };
    }

    if (category) {
      filter.category = category;
    }

    // Default to only active products
    if (isActive === 'all') {
      // Show all
    } else if (isActive === 'false') {
      filter.isActive = false;
    } else {
      filter.isActive = true;
    }

    const products = await Product.find(filter)
      .select('-__v')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
// @access  Private (All authenticated users)
router.get('/:id', protect, async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).select('-__v');

    if (!product) {
      res.status(404);
      throw new Error('Product not found');
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/products
// @desc    Create new product
// @access  Private (Admin, Staff)
router.post('/', protect, authorize('admin', 'staff'), validateProduct, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const product = await Product.create(req.body);

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private (Admin, Staff)
router.put('/:id', protect, authorize('admin', 'staff'), validateProduct, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) {
      res.status(404);
      throw new Error('Product not found');
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product (soft delete)
// @access  Private (Admin, Staff)
router.delete('/:id', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!product) {
      res.status(404);
      throw new Error('Product not found');
    }

    res.json({
      success: true,
      message: 'Product deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
