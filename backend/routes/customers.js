const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const { protect, authorize } = require('../middleware/auth');

// Validation middleware
const validateCustomer = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').optional({ checkFalsy: true }).matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
  body('whatsapp').optional({ checkFalsy: true }).matches(/^[0-9]{10}$/).withMessage('WhatsApp must be 10 digits'),
  body('creditLimit').optional().isFloat({ min: 0 }).withMessage('Credit limit must be positive')
];

// @route   GET /api/customers
// @desc    Get all customers
// @access  Private (Admin, Staff)
router.get('/', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { search, isActive, limit: rawLimit, page: rawPage } = req.query;
    const filter = {};

    // Validate and cap limit to prevent DoS (min 1, max 500, default 100)
    const limit = Math.min(Math.max(parseInt(rawLimit) || 100, 1), 500);
    const page = Math.max(parseInt(rawPage) || 1, 1);
    const skip = (page - 1) * limit;

    if (search) {
      // Escape regex special characters to prevent ReDoS attacks
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    // Default to only active customers, unless explicitly requesting all or inactive
    if (isActive === 'all') {
      // Show all customers (active and inactive)
    } else if (isActive === 'false') {
      filter.isActive = false;
    } else {
      // Default: only active customers
      filter.isActive = true;
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .select('-__v')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Customer.countDocuments(filter)
    ]);

    res.json({
      success: true,
      count: customers.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: customers
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/customers/:id
// @desc    Get single customer
// @access  Private (Admin, Staff)
router.get('/:id', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id).select('-__v');

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/customers
// @desc    Create new customer
// @access  Private (Admin, Staff)
router.post('/', protect, authorize('admin', 'staff'), validateCustomer, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const customer = await Customer.create(req.body);

    res.status(201).json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/customers/:id
// @desc    Update customer
// @access  Private (Admin, Staff)
router.put('/:id', protect, authorize('admin', 'staff'), validateCustomer, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    // Update basic fields
    if (req.body.name) customer.name = req.body.name;
    if (req.body.phone !== undefined) customer.phone = req.body.phone;
    if (req.body.whatsapp !== undefined) customer.whatsapp = req.body.whatsapp;
    if (req.body.address !== undefined) customer.address = req.body.address;
    if (req.body.pricingType) customer.pricingType = req.body.pricingType;
    if (req.body.markupPercentage !== undefined) customer.markupPercentage = req.body.markupPercentage;

    // Handle contractPrices Map update properly
    if (req.body.contractPrices) {
      customer.contractPrices = new Map(Object.entries(req.body.contractPrices));
    }

    await customer.save();

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/customers/:id
// @desc    Delete customer (soft delete)
// @access  Private (Admin, Staff)
router.delete('/:id', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    res.json({
      success: true,
      message: 'Customer deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/customers/:id/payment
// @desc    Add payment to customer
// @access  Private (Admin, Staff)
router.post('/:id/payment', protect, authorize('admin', 'staff'), [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('paymentMethod').isIn(['cash', 'online', 'cheque', 'credit']).withMessage('Invalid payment method')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    customer.paymentHistory.push({
      amount: req.body.amount,
      paymentMethod: req.body.paymentMethod,
      notes: req.body.notes
    });

    // Update current credit if payment method is credit
    if (req.body.paymentMethod !== 'credit') {
      customer.currentCredit = Math.max(0, customer.currentCredit - req.body.amount);
    }

    await customer.save();

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/customers/:id/magic-link
// @desc    Generate magic link for customer
// @access  Private (Admin, Staff)
router.post('/:id/magic-link', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    if (!customer.isActive) {
      res.status(400);
      throw new Error('Cannot generate magic link for inactive customer');
    }

    // Generate a secure random token (32 bytes = 64 hex chars)
    const token = crypto.randomBytes(32).toString('hex');

    customer.magicLinkToken = token;
    customer.magicLinkCreatedAt = new Date();
    await customer.save();

    // Build the magic link URL
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const magicLink = `${baseUrl}/customer-order-form.html?token=${token}`;

    // Return only the magic link, not the raw token (security best practice)
    res.json({
      success: true,
      data: {
        link: magicLink,
        createdAt: customer.magicLinkCreatedAt,
        expiresIn: '48 hours'
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/customers/:id/magic-link
// @desc    Revoke magic link for customer
// @access  Private (Admin, Staff)
router.delete('/:id/magic-link', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    customer.magicLinkToken = undefined;
    customer.magicLinkCreatedAt = undefined;
    await customer.save();

    res.json({
      success: true,
      message: 'Magic link revoked'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
