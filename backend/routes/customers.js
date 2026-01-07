const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Customer = require('../models/Customer');

// Validation middleware
const validateCustomer = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
  body('whatsapp').optional().matches(/^[0-9]{10}$/).withMessage('WhatsApp must be 10 digits'),
  body('creditLimit').optional().isFloat({ min: 0 }).withMessage('Credit limit must be positive')
];

// @route   GET /api/customers
// @desc    Get all customers
// @access  Public
router.get('/', async (req, res, next) => {
  try {
    const { search, isActive } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const customers = await Customer.find(filter)
      .select('-__v')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: customers.length,
      data: customers
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/customers/:id
// @desc    Get single customer
// @access  Public
router.get('/:id', async (req, res, next) => {
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
// @access  Public
router.post('/', validateCustomer, async (req, res, next) => {
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
// @access  Public
router.put('/:id', validateCustomer, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

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

// @route   DELETE /api/customers/:id
// @desc    Delete customer (soft delete)
// @access  Public
router.delete('/:id', async (req, res, next) => {
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
// @access  Public
router.post('/:id/payment', [
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

module.exports = router;
