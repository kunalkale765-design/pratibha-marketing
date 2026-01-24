const express = require('express');
const router = express.Router();
// SECURITY NOTE: xlsx has known vulnerabilities (prototype pollution, ReDoS) when PARSING
// untrusted Excel files. This code only WRITES Excel files from trusted database data,
// which is a lower-risk operation. Do NOT use xlsx to parse user-uploaded files.
const XLSX = require('xlsx');
const { query } = require('express-validator');
const LedgerEntry = require('../models/LedgerEntry');
const Customer = require('../models/Customer');
const { protect, authorize } = require('../middleware/auth');
const { handleValidationErrors, buildDateRangeFilter } = require('../utils/helpers');

// Maximum entries to export (prevent memory exhaustion)
const MAX_EXPORT_LIMIT = 10000;

// @route   GET /api/reports/ledger
// @desc    Download customer ledger as Excel (from LedgerEntry - invoices, payments, adjustments)
// @access  Private (Staff, Admin)
router.get('/ledger',
  protect,
  authorize('admin', 'staff'),
  query('customerId').optional().isMongoId().withMessage('Invalid customer ID'),
  query('fromDate').optional().isISO8601().withMessage('Invalid from date'),
  query('toDate').optional().isISO8601().withMessage('Invalid to date'),
  async (req, res, next) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const { customerId, fromDate, toDate } = req.query;
      let customerForFilename = null;

      // Build query for LedgerEntry
      const ledgerQuery = {};

      if (customerId) {
        const customer = await Customer.findById(customerId);
        if (!customer) {
          res.status(404);
          throw new Error('Customer not found');
        }
        customerForFilename = customer;
        ledgerQuery.customer = customer._id;
      }

      // Build date range filter
      const { filter: dateFilter, error: dateError } = buildDateRangeFilter(fromDate, toDate);
      if (dateError) {
        return res.status(400).json({ success: false, message: dateError });
      }
      if (dateFilter) {
        ledgerQuery.date = dateFilter;
      }

      // Check count first to prevent memory exhaustion
      const count = await LedgerEntry.countDocuments(ledgerQuery);
      if (count > MAX_EXPORT_LIMIT) {
        res.status(400);
        throw new Error(`Too many entries to export (${count}). Please narrow your date range. Maximum: ${MAX_EXPORT_LIMIT}`);
      }

      // Get ledger entries with customer populated
      const entries = await LedgerEntry.find(ledgerQuery)
        .populate('customer', 'name')
        .sort({ date: -1 })
        .limit(MAX_EXPORT_LIMIT)
        .lean();

      // Calculate totals
      let totalDebit = 0;
      let totalCredit = 0;
      entries.forEach(entry => {
        if (entry.amount > 0) totalDebit += entry.amount;
        else totalCredit += Math.abs(entry.amount);
      });

      // Format data for Excel
      const data = entries.map(entry => ({
        'Date': new Date(entry.date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        'Type': entry.type.charAt(0).toUpperCase() + entry.type.slice(1),
        'Order No': entry.orderNumber || '',
        'Customer': entry.customer?.name || 'Unknown',
        'Description': entry.description || '',
        'Debit (Rs.)': entry.amount > 0 ? entry.amount : '',
        'Credit (Rs.)': entry.amount < 0 ? Math.abs(entry.amount) : '',
        'Balance (Rs.)': entry.balance
      }));

      // Add totals row
      if (data.length > 0) {
        data.push({
          'Date': '',
          'Type': '',
          'Order No': '',
          'Customer': '',
          'Description': 'TOTAL',
          'Debit (Rs.)': totalDebit,
          'Credit (Rs.)': totalCredit,
          'Balance (Rs.)': ''
        });
      }

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // Set column widths
      ws['!cols'] = [
        { wch: 12 },  // Date
        { wch: 12 },  // Type
        { wch: 14 },  // Order No
        { wch: 22 },  // Customer
        { wch: 30 },  // Description
        { wch: 14 },  // Debit
        { wch: 14 },  // Credit
        { wch: 14 }   // Balance
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

// @route   GET /api/reports/ledger/preview
// @desc    Preview ledger data as JSON (from LedgerEntry)
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
      if (handleValidationErrors(req, res)) return;

      const { customerId, fromDate, toDate, limit = 20 } = req.query;

      // Build query
      const ledgerQuery = {};

      if (customerId) {
        const customer = await Customer.findById(customerId);
        if (!customer) {
          res.status(404);
          throw new Error('Customer not found');
        }
        ledgerQuery.customer = customer._id;
      }

      // Build date range filter
      const { filter: dateFilter, error: dateError } = buildDateRangeFilter(fromDate, toDate);
      if (dateError) {
        return res.status(400).json({ success: false, message: dateError });
      }
      if (dateFilter) {
        ledgerQuery.date = dateFilter;
      }

      const total = await LedgerEntry.countDocuments(ledgerQuery);
      const entries = await LedgerEntry.find(ledgerQuery)
        .populate('customer', 'name')
        .sort({ date: -1 })
        .limit(parseInt(limit))
        .lean();

      // Calculate totals across all matching entries
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
            totalDebit: totalsResult?.totalDebit || 0,
            totalCredit: totalsResult?.totalCredit || 0,
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
