const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { param, body, query, validationResult } = require('express-validator');
const LedgerEntry = require('../models/LedgerEntry');
const Customer = require('../models/Customer');
const { protect, authorize } = require('../middleware/auth');

// Helper function to round to 2 decimal places
function roundTo2Decimals(num) {
  return Math.round(num * 100) / 100;
}

// @route   GET /api/ledger/balances
// @desc    Get all customers with their current balances
// @access  Private (Admin, Staff)
router.get('/balances', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { sort = 'balance', order = 'desc', minBalance, showZero = 'false' } = req.query;

    // Build query
    const query = { isActive: true };

    // Filter by minimum balance if specified
    if (minBalance !== undefined) {
      const min = parseFloat(minBalance);
      if (!isNaN(min)) {
        query.balance = { $gte: min };
      }
    }

    // Optionally exclude zero balances
    if (showZero === 'false') {
      query.balance = { ...query.balance, $ne: 0 };
    }

    // Build sort
    const sortField = sort === 'name' ? 'name' : 'balance';
    const sortOrder = order === 'asc' ? 1 : -1;

    const customers = await Customer.find(query)
      .select('name phone balance')
      .sort({ [sortField]: sortOrder });

    // Calculate totals
    const totalOwed = customers
      .filter(c => c.balance > 0)
      .reduce((sum, c) => sum + c.balance, 0);

    const totalCredit = customers
      .filter(c => c.balance < 0)
      .reduce((sum, c) => sum + Math.abs(c.balance), 0);

    res.json({
      success: true,
      count: customers.length,
      summary: {
        totalOwed: roundTo2Decimals(totalOwed),
        totalCredit: roundTo2Decimals(totalCredit),
        netOwed: roundTo2Decimals(totalOwed - totalCredit)
      },
      data: customers
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/ledger/customer/:customerId
// @desc    Get ledger history for a specific customer
// @access  Private (Admin, Staff)
router.get('/customer/:customerId',
  protect,
  authorize('admin', 'staff'),
  param('customerId').isMongoId().withMessage('Invalid customer ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { startDate, endDate, type, limit = 100 } = req.query;

      // Verify customer exists
      const customer = await Customer.findById(req.params.customerId)
        .select('name phone balance');

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Build query
      const query = { customer: req.params.customerId };

      // Date range filter
      if (startDate || endDate) {
        query.date = {};
        if (startDate) {
          const start = new Date(startDate);
          if (!isNaN(start.getTime())) {
            start.setHours(0, 0, 0, 0);
            query.date.$gte = start;
          }
        }
        if (endDate) {
          const end = new Date(endDate);
          if (!isNaN(end.getTime())) {
            end.setHours(23, 59, 59, 999);
            query.date.$lte = end;
          }
        }
      }

      // Type filter
      if (type && ['invoice', 'payment', 'adjustment'].includes(type)) {
        query.type = type;
      }

      const entries = await LedgerEntry.find(query)
        .populate('order', 'orderNumber')
        .populate('createdBy', 'name')
        .sort({ date: -1, createdAt: -1 })
        .limit(parseInt(limit));

      res.json({
        success: true,
        customer: customer,
        count: entries.length,
        data: entries
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   POST /api/ledger/payment
// @desc    Record a payment from a customer
// @access  Private (Admin, Staff)
router.post('/payment',
  protect,
  authorize('admin', 'staff'),
  [
    body('customer').isMongoId().withMessage('Valid customer ID required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
    body('date').optional().isISO8601().withMessage('Invalid date format'),
    body('notes').optional().isString().isLength({ max: 1000 }).withMessage('Notes must be 1000 characters or less')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { customer: customerId, amount, date, notes } = req.body;

      // Verify customer exists
      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      const paymentAmount = roundTo2Decimals(amount);

      // Use transaction to ensure ledger entry and customer balance are updated atomically
      const session = await mongoose.startSession();
      let entry;
      let previousBalance;
      let newBalance;

      try {
        await session.withTransaction(async () => {
          // Get customer's current balance within transaction
          const freshCustomer = await Customer.findById(customerId).session(session);
          previousBalance = freshCustomer.balance || 0;

          // Use atomic $inc to update balance - prevents race conditions
          // even with concurrent transactions
          const updatedCustomer = await Customer.findByIdAndUpdate(
            customerId,
            { $inc: { balance: -paymentAmount } },
            { session, new: true }
          );
          newBalance = roundTo2Decimals(updatedCustomer.balance);

          // Fix floating-point precision drift - ensure stored value matches rounded value
          if (newBalance !== updatedCustomer.balance) {
            await Customer.findByIdAndUpdate(
              customerId,
              { $set: { balance: newBalance } },
              { session }
            );
          }

          // Create payment ledger entry with the actual new balance
          const entries = await LedgerEntry.create([{
            customer: customerId,
            type: 'payment',
            date: date ? new Date(date) : new Date(),
            description: `Payment received`,
            amount: -paymentAmount, // Negative because it reduces balance
            balance: newBalance,
            notes: notes,
            createdBy: req.user._id,
            createdByName: req.user.name
          }], { session });
          entry = entries[0];
        });
      } finally {
        await session.endSession();
      }

      res.status(201).json({
        success: true,
        message: 'Payment recorded successfully',
        data: {
          entry: entry,
          previousBalance: previousBalance,
          paymentAmount: paymentAmount,
          newBalance: newBalance
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   POST /api/ledger/adjustment
// @desc    Make a manual adjustment to customer's ledger
// @access  Private (Admin only)
router.post('/adjustment',
  protect,
  authorize('admin'),
  [
    body('customer').isMongoId().withMessage('Valid customer ID required'),
    body('amount').isFloat().withMessage('Amount is required'),
    body('description').notEmpty().isLength({ max: 500 }).withMessage('Description is required (max 500 chars)'),
    body('date').optional().isISO8601().withMessage('Invalid date format'),
    body('notes').optional().isString().isLength({ max: 1000 }).withMessage('Notes must be 1000 characters or less')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { customer: customerId, amount, description, date, notes } = req.body;

      // Verify customer exists
      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      const adjustmentAmount = roundTo2Decimals(amount);

      // Use transaction to ensure ledger entry and customer balance are updated atomically
      const session = await mongoose.startSession();
      let entry;
      let previousBalance;
      let newBalance;

      try {
        await session.withTransaction(async () => {
          // Get customer's current balance within transaction
          const freshCustomer = await Customer.findById(customerId).session(session);
          previousBalance = freshCustomer.balance || 0;

          // Use atomic $inc to update balance - prevents race conditions
          // even with concurrent transactions
          const updatedCustomer = await Customer.findByIdAndUpdate(
            customerId,
            { $inc: { balance: adjustmentAmount } },
            { session, new: true }
          );
          newBalance = roundTo2Decimals(updatedCustomer.balance);

          // Fix floating-point precision drift - ensure stored value matches rounded value
          if (newBalance !== updatedCustomer.balance) {
            await Customer.findByIdAndUpdate(
              customerId,
              { $set: { balance: newBalance } },
              { session }
            );
          }

          // Create adjustment ledger entry with the actual new balance
          const entries = await LedgerEntry.create([{
            customer: customerId,
            type: 'adjustment',
            date: date ? new Date(date) : new Date(),
            description: description,
            amount: adjustmentAmount,
            balance: newBalance,
            notes: notes,
            createdBy: req.user._id,
            createdByName: req.user.name
          }], { session });
          entry = entries[0];
        });
      } finally {
        await session.endSession();
      }

      res.status(201).json({
        success: true,
        message: 'Adjustment recorded successfully',
        data: {
          entry: entry,
          previousBalance: previousBalance,
          adjustmentAmount: adjustmentAmount,
          newBalance: newBalance
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   GET /api/ledger/statement/:customerId
// @desc    Generate monthly statement data for a customer
// @access  Private (Admin, Staff)
router.get('/statement/:customerId',
  protect,
  authorize('admin', 'staff'),
  param('customerId').isMongoId().withMessage('Invalid customer ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { month, year } = req.query;

      // Verify customer exists
      const customer = await Customer.findById(req.params.customerId)
        .select('name phone address balance');

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Default to current month if not specified
      const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();
      const targetYear = year ? parseInt(year) : new Date().getFullYear();

      // Calculate date range for the month
      const startDate = new Date(targetYear, targetMonth, 1);
      const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

      // Get opening balance (last entry before start of month)
      const openingEntry = await LedgerEntry.findOne({
        customer: req.params.customerId,
        date: { $lt: startDate }
      }).sort({ date: -1, createdAt: -1 });

      const openingBalance = openingEntry?.balance || 0;

      // Get all entries for the month
      const entries = await LedgerEntry.find({
        customer: req.params.customerId,
        date: { $gte: startDate, $lte: endDate }
      })
        .populate('order', 'orderNumber')
        .sort({ date: 1, createdAt: 1 });

      // Calculate totals
      const invoiceTotal = entries
        .filter(e => e.type === 'invoice')
        .reduce((sum, e) => sum + e.amount, 0);

      const paymentTotal = entries
        .filter(e => e.type === 'payment')
        .reduce((sum, e) => sum + Math.abs(e.amount), 0);

      const adjustmentTotal = entries
        .filter(e => e.type === 'adjustment')
        .reduce((sum, e) => sum + e.amount, 0);

      const closingBalance = entries.length > 0
        ? entries[entries.length - 1].balance
        : openingBalance;

      res.json({
        success: true,
        data: {
          customer: customer,
          period: {
            month: targetMonth + 1,
            year: targetYear,
            monthName: new Date(targetYear, targetMonth, 1).toLocaleString('default', { month: 'long' }),
            startDate: startDate,
            endDate: endDate
          },
          openingBalance: roundTo2Decimals(openingBalance),
          invoiceTotal: roundTo2Decimals(invoiceTotal),
          paymentTotal: roundTo2Decimals(paymentTotal),
          adjustmentTotal: roundTo2Decimals(adjustmentTotal),
          closingBalance: roundTo2Decimals(closingBalance),
          entries: entries
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   GET /api/ledger
// @desc    List all ledger entries with filters
// @access  Private (Admin, Staff)
router.get('/', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { type, startDate, endDate, limit = 100 } = req.query;

    // Build query
    const query = {};

    // Type filter
    if (type && ['invoice', 'payment', 'adjustment'].includes(type)) {
      query.type = type;
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          query.date.$gte = start;
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          query.date.$lte = end;
        }
      }
    }

    const entries = await LedgerEntry.find(query)
      .populate('customer', 'name phone')
      .populate('order', 'orderNumber')
      .populate('createdBy', 'name')
      .sort({ date: -1, createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: entries.length,
      data: entries
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
