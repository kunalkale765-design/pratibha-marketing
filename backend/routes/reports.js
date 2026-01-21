const express = require('express');
const router = express.Router();
// SECURITY NOTE: xlsx has known vulnerabilities (prototype pollution, ReDoS) when PARSING
// untrusted Excel files. This code only WRITES Excel files from trusted database data,
// which is a lower-risk operation. Do NOT use xlsx to parse user-uploaded files.
const XLSX = require('xlsx');
const { query, validationResult } = require('express-validator');
const LedgerEntry = require('../models/LedgerEntry');
const Customer = require('../models/Customer');
const { protect, authorize } = require('../middleware/auth');

/**
 * @swagger
 * /api/reports/ledger:
 *   get:
 *     summary: Download customer ledger as Excel
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Excel file
 */
// Maximum entries to export (prevent memory exhaustion)
const MAX_EXPORT_LIMIT = 10000;

// @route   GET /api/reports/ledger
// @desc    Download customer ledger as Excel (Date, Type, Description, Order#, Debit, Credit, Balance)
// @access  Private (Staff, Admin)
router.get('/ledger',
  protect,
  authorize('admin', 'staff'),
  query('customerId').optional().isMongoId().withMessage('Invalid customer ID'),
  query('fromDate').optional().isISO8601().withMessage('Invalid from date'),
  query('toDate').optional().isISO8601().withMessage('Invalid to date'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400);
        throw new Error(errors.array()[0].msg);
      }

      const { customerId, fromDate, toDate } = req.query;
      let customerForFilename = null;
      let customerName = null;

      // Build query for LedgerEntry
      const ledgerQuery = {};

      if (customerId) {
        const customer = await Customer.findById(customerId);
        if (!customer) {
          res.status(404);
          throw new Error('Customer not found');
        }
        customerForFilename = customer;
        customerName = customer.name;
        ledgerQuery.customer = customerId;
      }

      if (fromDate || toDate) {
        ledgerQuery.date = {};
        if (fromDate) {
          const start = new Date(fromDate);
          start.setHours(0, 0, 0, 0);
          ledgerQuery.date.$gte = start;
        }
        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          ledgerQuery.date.$lte = end;
        }
      }

      // Check count first to prevent memory exhaustion
      const count = await LedgerEntry.countDocuments(ledgerQuery);
      if (count > MAX_EXPORT_LIMIT) {
        res.status(400);
        throw new Error(`Too many entries to export (${count}). Please narrow your date range. Maximum: ${MAX_EXPORT_LIMIT}`);
      }

      // Get ledger entries with customer info
      const entries = await LedgerEntry.find(ledgerQuery)
        .populate('customer', 'name')
        .sort({ date: 1, createdAt: 1 })
        .limit(MAX_EXPORT_LIMIT)
        .lean();

      // Calculate totals
      let totalDebit = 0;
      let totalCredit = 0;

      // Format data for Excel - proper ledger format with Debit/Credit columns
      const data = entries.map(entry => {
        const debit = entry.amount > 0 ? entry.amount : '';
        const credit = entry.amount < 0 ? Math.abs(entry.amount) : '';

        if (entry.amount > 0) totalDebit += entry.amount;
        if (entry.amount < 0) totalCredit += Math.abs(entry.amount);

        return {
          'Date': new Date(entry.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }),
          'Customer': entry.customer?.name || customerName || 'Unknown',
          'Type': entry.type.charAt(0).toUpperCase() + entry.type.slice(1),
          'Order No': entry.orderNumber || '',
          'Description': entry.description || '',
          'Debit (Rs.)': debit,
          'Credit (Rs.)': credit,
          'Balance (Rs.)': entry.balance
        };
      });

      // Add totals row if there's data
      if (data.length > 0) {
        data.push({
          'Date': '',
          'Customer': '',
          'Type': '',
          'Order No': '',
          'Description': 'TOTAL',
          'Debit (Rs.)': totalDebit,
          'Credit (Rs.)': totalCredit,
          'Balance (Rs.)': entries.length > 0 ? entries[entries.length - 1].balance : 0
        });
      }

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // Set column widths
      ws['!cols'] = [
        { wch: 12 },  // Date
        { wch: 25 },  // Customer
        { wch: 12 },  // Type
        { wch: 15 },  // Order No
        { wch: 30 },  // Description
        { wch: 12 },  // Debit
        { wch: 12 },  // Credit
        { wch: 12 }   // Balance
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Ledger');

      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Generate filename
      const dateStr = new Date().toISOString().split('T')[0];
      let filename = `ledger_${dateStr}`;
      if (customerForFilename) {
        filename = `ledger_${customerForFilename.name.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}`;
      }

      // Send response
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
        'Content-Length': buffer.length
      });

      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/reports/ledger/preview:
 *   get:
 *     summary: Preview ledger data as JSON
 *     tags: [Reports]
 */
// @route   GET /api/reports/ledger/preview
// @desc    Preview ledger data as JSON (for UI preview before download)
// @access  Private (Staff, Admin)
router.get('/ledger/preview',
  protect,
  authorize('admin', 'staff'),
  query('customerId').optional().isMongoId().withMessage('Invalid customer ID'),
  query('fromDate').optional().isISO8601().withMessage('Invalid from date'),
  query('toDate').optional().isISO8601().withMessage('Invalid to date'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400);
        throw new Error(errors.array()[0].msg);
      }

      const { customerId, fromDate, toDate, limit = 20 } = req.query;

      // Build query for LedgerEntry
      const ledgerQuery = {};

      if (customerId) {
        const customer = await Customer.findById(customerId);
        if (!customer) {
          res.status(404);
          throw new Error('Customer not found');
        }
        ledgerQuery.customer = customerId;
      }

      if (fromDate || toDate) {
        ledgerQuery.date = {};
        if (fromDate) {
          const start = new Date(fromDate);
          start.setHours(0, 0, 0, 0);
          ledgerQuery.date.$gte = start;
        }
        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          ledgerQuery.date.$lte = end;
        }
      }

      // Get count and entries
      const total = await LedgerEntry.countDocuments(ledgerQuery);
      const entries = await LedgerEntry.find(ledgerQuery)
        .populate('customer', 'name')
        .sort({ date: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .lean();

      // Calculate totals using aggregation
      const [totalsResult] = await LedgerEntry.aggregate([
        { $match: ledgerQuery },
        {
          $group: {
            _id: null,
            totalDebit: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
            totalCredit: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } }
          }
        }
      ]);
      const totalDebit = totalsResult?.totalDebit || 0;
      const totalCredit = totalsResult?.totalCredit || 0;

      res.json({
        success: true,
        data: {
          entries: entries.map(entry => ({
            date: entry.date,
            type: entry.type,
            orderNumber: entry.orderNumber,
            customer: entry.customer?.name,
            description: entry.description,
            amount: entry.amount,
            balance: entry.balance
          })),
          summary: {
            totalEntries: total,
            totalDebit,
            totalCredit,
            netBalance: totalDebit - totalCredit,
            showing: entries.length
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
