const express = require('express');
const router = express.Router();
// SECURITY NOTE: xlsx has known vulnerabilities (prototype pollution, ReDoS) when PARSING
// untrusted Excel files. This code only WRITES Excel files from trusted database data,
// which is a lower-risk operation. Do NOT use xlsx to parse user-uploaded files.
const XLSX = require('xlsx');
const { query, validationResult } = require('express-validator');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const { protect, authorize } = require('../middleware/auth');
const { handleValidationErrors, buildDateRangeFilter } = require('../utils/helpers');

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
// Maximum invoices to export (prevent memory exhaustion)
const MAX_EXPORT_LIMIT = 10000;

// @route   GET /api/reports/ledger
// @desc    Download customer ledger as Excel (Date, Invoice No, Customer, Firm, Amount)
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

      // Build query
      const invoiceQuery = {};

      if (customerId) {
        // Get customer name to filter invoices
        const customer = await Customer.findById(customerId);
        if (!customer) {
          res.status(404);
          throw new Error('Customer not found');
        }
        customerForFilename = customer;
        invoiceQuery['customer.name'] = customer.name;
      }

      // Build date range filter using shared helper
      const { filter: dateFilter, error: dateError } = buildDateRangeFilter(fromDate, toDate);
      if (dateError) {
        return res.status(400).json({ success: false, message: dateError });
      }
      if (dateFilter) {
        invoiceQuery.generatedAt = dateFilter;
      }

      // Check count first to prevent memory exhaustion
      const count = await Invoice.countDocuments(invoiceQuery);
      if (count > MAX_EXPORT_LIMIT) {
        res.status(400);
        throw new Error(`Too many invoices to export (${count}). Please narrow your date range. Maximum: ${MAX_EXPORT_LIMIT}`);
      }

      // Use aggregation for total calculation (more efficient)
      const [totalsResult] = await Invoice.aggregate([
        { $match: invoiceQuery },
        { $group: { _id: null, totalAmount: { $sum: '$total' } } }
      ]);
      const totalAmount = totalsResult?.totalAmount || 0;

      // Get invoices with limit
      const invoices = await Invoice.find(invoiceQuery)
        .sort({ generatedAt: -1 })
        .limit(MAX_EXPORT_LIMIT)
        .lean();

      // Format data for Excel
      const data = invoices.map(inv => ({
        'Date': new Date(inv.generatedAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        'Invoice No': inv.invoiceNumber,
        'Customer': inv.customer?.name || 'Unknown',
        'Firm': inv.firm?.name || 'Unknown',
        'Amount (Rs.)': inv.total || 0
      }));

      // Add totals row if there's data
      if (data.length > 0) {
        data.push({
          'Date': '',
          'Invoice No': '',
          'Customer': '',
          'Firm': 'TOTAL',
          'Amount (Rs.)': totalAmount
        });
      }

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // Set column widths
      ws['!cols'] = [
        { wch: 12 },  // Date
        { wch: 15 },  // Invoice No
        { wch: 25 },  // Customer
        { wch: 20 },  // Firm
        { wch: 15 }   // Amount
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Ledger');

      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Generate filename (reuse customer from earlier query)
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
      if (handleValidationErrors(req, res)) return;

      const { customerId, fromDate, toDate, limit = 20 } = req.query;

      // Build query
      const previewQuery = {};

      if (customerId) {
        const customer = await Customer.findById(customerId);
        if (!customer) {
          res.status(404);
          throw new Error('Customer not found');
        }
        previewQuery['customer.name'] = customer.name;
      }

      // Build date range filter using shared helper
      const { filter: dateFilter, error: dateError } = buildDateRangeFilter(fromDate, toDate);
      if (dateError) {
        return res.status(400).json({ success: false, message: dateError });
      }
      if (dateFilter) {
        previewQuery.generatedAt = dateFilter;
      }

      // Get count and invoices
      const total = await Invoice.countDocuments(previewQuery);
      const invoices = await Invoice.find(previewQuery)
        .sort({ generatedAt: -1 })
        .limit(parseInt(limit))
        .lean();

      // Calculate total amount using aggregation (more efficient)
      const [totalsResult] = await Invoice.aggregate([
        { $match: previewQuery },
        { $group: { _id: null, totalAmount: { $sum: '$total' } } }
      ]);
      const totalAmount = totalsResult?.totalAmount || 0;

      res.json({
        success: true,
        data: {
          invoices: invoices.map(inv => ({
            date: inv.generatedAt,
            invoiceNumber: inv.invoiceNumber,
            customer: inv.customer?.name,
            firm: inv.firm?.name,
            amount: inv.total
          })),
          summary: {
            totalInvoices: total,
            totalAmount,
            showing: invoices.length
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
