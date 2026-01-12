const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { body, param, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const { protect, authorize } = require('../middleware/auth');
const companies = require('../config/companies');
const invoiceService = require('../services/invoiceService');

// Storage directory for PDF files
const INVOICE_STORAGE_DIR = path.join(__dirname, '..', 'storage', 'invoices');

// Ensure storage directory exists
async function ensureStorageDir() {
  try {
    await fs.mkdir(INVOICE_STORAGE_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// Safely resolve PDF path - prevents path traversal attacks
function getSafePdfPath(pdfFilename) {
  if (!pdfFilename) {
    throw new Error('PDF filename is required');
  }
  // Remove any path components - only use the basename
  const sanitizedFilename = path.basename(pdfFilename);
  const fullPath = path.join(INVOICE_STORAGE_DIR, sanitizedFilename);

  // Verify the resolved path is still within the storage directory
  const resolvedPath = path.resolve(fullPath);
  const resolvedStorageDir = path.resolve(INVOICE_STORAGE_DIR);
  if (!resolvedPath.startsWith(resolvedStorageDir + path.sep)) {
    throw new Error('Invalid PDF path');
  }

  return resolvedPath;
}

/**
 * @swagger
 * /api/invoices/firms:
 *   get:
 *     summary: Get list of available firms
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of firms
 */
// @route   GET /api/invoices/firms
// @desc    Get list of available firms for invoice generation
// @access  Private (Staff, Admin)
router.get('/firms', protect, authorize('admin', 'staff'), (req, res) => {
  const firms = companies.firms.map(f => ({
    id: f.id,
    name: f.name,
    categories: f.categories || [],
    isDefault: f.isDefault || false
  }));

  res.json({
    success: true,
    data: firms
  });
});

/**
 * @swagger
 * /api/invoices/{orderId}/split:
 *   get:
 *     summary: Get order items split by firm
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order items grouped by firm
 */
// @route   GET /api/invoices/:orderId/split
// @desc    Get order items auto-split by firm based on product categories
// @access  Private (Staff, Admin)
router.get('/:orderId/split',
  protect,
  authorize('admin', 'staff'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400);
        throw new Error(errors.array()[0].msg);
      }

      // Get order with customer populated
      const order = await Order.findById(req.params.orderId)
        .populate('customer', 'name phone whatsapp address');

      if (!order) {
        res.status(404);
        throw new Error('Order not found');
      }

      // Block invoice generation for cancelled orders
      if (order.status === 'cancelled') {
        res.status(400);
        throw new Error('Cannot generate invoice for cancelled orders');
      }

      // Get product categories for the order items
      const productIds = order.products.map(p => p.product);
      const products = await Product.find({ _id: { $in: productIds } }).select('_id category');
      const categoryMap = {};
      products.forEach(p => {
        categoryMap[p._id.toString()] = p.category;
      });

      // Add category to each order product
      const orderWithCategories = {
        ...order.toObject(),
        products: order.products.map(p => ({
          ...p.toObject ? p.toObject() : p,
          category: categoryMap[p.product?.toString()] || 'Other'
        }))
      };

      // Split by firm
      const split = invoiceService.splitOrderByFirm(orderWithCategories);

      // Format response
      const result = Object.keys(split).map(firmId => ({
        firmId: firmId,
        firmName: split[firmId].firm.name,
        items: split[firmId].items.map(item => ({
          productId: item.product?.toString(),
          productName: item.productName,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.amount
        })),
        subtotal: split[firmId].subtotal
      }));

      res.json({
        success: true,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          customer: {
            name: order.customer?.name,
            phone: order.customer?.phone
          },
          firms: result,
          totalAmount: order.totalAmount
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/invoices/{orderId}/pdf:
 *   post:
 *     summary: Generate invoice PDF
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firmId
 *             properties:
 *               firmId:
 *                 type: string
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
// @route   POST /api/invoices/:orderId/pdf
// @desc    Generate and download invoice PDF for specified firm and products
// @access  Private (Staff, Admin)
router.post('/:orderId/pdf',
  protect,
  authorize('admin', 'staff'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  body('firmId').notEmpty().withMessage('Firm ID is required'),
  body('productIds').optional().isArray().withMessage('Product IDs must be an array'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400);
        throw new Error(errors.array()[0].msg);
      }

      const { firmId, productIds } = req.body;

      // Validate firm exists
      const firm = companies.getFirmById(firmId);
      if (!firm) {
        res.status(400);
        throw new Error(`Invalid firm ID: ${firmId}`);
      }

      // Get order with customer populated
      const order = await Order.findById(req.params.orderId)
        .populate('customer', 'name phone whatsapp address');

      if (!order) {
        res.status(404);
        throw new Error('Order not found');
      }

      // Block invoice generation for cancelled orders
      if (order.status === 'cancelled') {
        res.status(400);
        throw new Error('Cannot generate invoice for cancelled orders');
      }

      // Generate unique invoice number
      const invoiceNumber = await invoiceService.generateInvoiceNumber();

      // Get invoice data with unique invoice number
      const invoiceData = invoiceService.getInvoiceData(order, firmId, productIds, invoiceNumber);

      // Check if there are items to invoice
      if (invoiceData.items.length === 0) {
        res.status(400);
        throw new Error('No items selected for invoice');
      }

      // Transaction-like handling: Create DB record first, then PDF, with rollback on failure
      const filename = `${invoiceData.invoiceNumber}.pdf`;

      // Step 1: Create invoice record in database FIRST (without pdfPath)
      const invoice = new Invoice({
        invoiceNumber: invoiceData.invoiceNumber,
        orderNumber: invoiceData.orderNumber,
        order: order._id,
        firm: {
          id: firmId,
          name: invoiceData.firm.name,
          address: invoiceData.firm.address,
          phone: invoiceData.firm.phone,
          email: invoiceData.firm.email
        },
        customer: {
          name: invoiceData.customer.name,
          phone: invoiceData.customer.phone,
          address: invoiceData.customer.address
        },
        items: invoiceData.items.map(item => ({
          productName: item.name,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.amount
        })),
        subtotal: invoiceData.total,
        total: invoiceData.total,
        pdfPath: null, // Will be set after PDF is saved
        generatedBy: req.user._id
      });
      await invoice.save();

      let pdfBuffer;
      try {
        // Step 2: Generate PDF
        pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

        // Step 3: Save PDF to filesystem
        await ensureStorageDir();
        const pdfFilePath = path.join(INVOICE_STORAGE_DIR, filename);
        await fs.writeFile(pdfFilePath, pdfBuffer);

        // Step 4: Update invoice record with pdfPath
        invoice.pdfPath = filename;
        await invoice.save();
      } catch (pdfError) {
        // Rollback: Delete the invoice record if PDF generation/saving fails
        console.error(`PDF generation failed for invoice ${invoiceData.invoiceNumber}, rolling back:`, pdfError.message);
        await Invoice.deleteOne({ _id: invoice._id });
        throw pdfError;
      }

      // Set response headers for PDF download
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length
      });

      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/invoices/{orderId}/data:
 *   post:
 *     summary: Get invoice data as JSON
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firmId
 *             properties:
 *               firmId:
 *                 type: string
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Invoice data
 */
// @route   POST /api/invoices/:orderId/data
// @desc    Get invoice data as JSON (for print preview)
// @access  Private (Staff, Admin)
router.post('/:orderId/data',
  protect,
  authorize('admin', 'staff'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  body('firmId').notEmpty().withMessage('Firm ID is required'),
  body('productIds').optional().isArray().withMessage('Product IDs must be an array'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400);
        throw new Error(errors.array()[0].msg);
      }

      const { firmId, productIds } = req.body;

      // Validate firm exists
      const firm = companies.getFirmById(firmId);
      if (!firm) {
        res.status(400);
        throw new Error(`Invalid firm ID: ${firmId}`);
      }

      // Get order with customer populated
      const order = await Order.findById(req.params.orderId)
        .populate('customer', 'name phone whatsapp address');

      if (!order) {
        res.status(404);
        throw new Error('Order not found');
      }

      // Block invoice generation for cancelled orders
      if (order.status === 'cancelled') {
        res.status(400);
        throw new Error('Cannot generate invoice for cancelled orders');
      }

      // Get invoice data
      const invoiceData = invoiceService.getInvoiceData(order, firmId, productIds);

      res.json({
        success: true,
        data: invoiceData
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/invoices:
 *   get:
 *     summary: List all invoices
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: firmId
 *         schema:
 *           type: string
 *       - in: query
 *         name: orderNumber
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of invoices
 */
// @route   GET /api/invoices
// @desc    List all invoices with optional filters
// @access  Private (Staff, Admin)
router.get('/',
  protect,
  authorize('admin', 'staff'),
  async (req, res, next) => {
    try {
      const { firmId, orderNumber, page: rawPage = 1, limit: rawLimit = 20 } = req.query;

      // Validate and cap pagination parameters
      const limit = Math.min(Math.max(parseInt(rawLimit) || 20, 1), 100);
      const page = Math.max(parseInt(rawPage) || 1, 1);

      // Build query
      const query = {};
      if (firmId) query['firm.id'] = firmId;
      if (orderNumber) {
        // Escape regex special characters to prevent ReDoS attacks
        const escapedOrderNumber = orderNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.orderNumber = new RegExp(escapedOrderNumber, 'i');
      }

      // Get total count
      const total = await Invoice.countDocuments(query);

      // Get invoices with pagination
      const invoices = await Invoice.find(query)
        .sort({ generatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-pdfPath')
        .populate('generatedBy', 'name');

      res.json({
        success: true,
        data: invoices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/invoices/{invoiceNumber}/download:
 *   get:
 *     summary: Download invoice PDF
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
// @route   GET /api/invoices/:invoiceNumber/download
// @desc    Download existing invoice PDF
// @access  Private (Staff, Admin)
router.get('/:invoiceNumber/download',
  protect,
  authorize('admin', 'staff'),
  async (req, res, next) => {
    try {
      const { invoiceNumber } = req.params;

      // Find invoice record
      const invoice = await Invoice.findOne({ invoiceNumber });
      if (!invoice) {
        res.status(404);
        throw new Error('Invoice not found');
      }

      // Check if PDF was generated
      if (!invoice.pdfPath) {
        res.status(404);
        throw new Error('Invoice PDF not yet generated');
      }

      // Read PDF file with path traversal protection
      try {
        const safePdfPath = getSafePdfPath(invoice.pdfPath);
        const pdfBuffer = await fs.readFile(safePdfPath);
        const safeFilename = path.basename(invoice.pdfPath);

        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeFilename}"`,
          'Content-Length': pdfBuffer.length
        });

        res.send(pdfBuffer);
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.status(404);
          throw new Error('Invoice PDF file not found on server');
        }
        throw err;
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/invoices/order/{orderId}:
 *   get:
 *     summary: Get invoices for an order
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of invoices for the order
 */
// @route   GET /api/invoices/order/:orderId
// @desc    Get all invoices generated for a specific order
// @access  Private (Staff, Admin)
router.get('/order/:orderId',
  protect,
  authorize('admin', 'staff'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400);
        throw new Error(errors.array()[0].msg);
      }

      const invoices = await Invoice.find({ order: req.params.orderId })
        .sort({ generatedAt: -1 })
        .populate('generatedBy', 'name');

      res.json({
        success: true,
        data: invoices,
        count: invoices.length
      });
    } catch (error) {
      next(error);
    }
  }
);

// ====================
// CUSTOMER-ACCESSIBLE ENDPOINTS
// ====================

/**
 * @swagger
 * /api/invoices/my-order/{orderId}:
 *   get:
 *     summary: Get invoices for customer's own order
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of invoices for the order
 */
// @route   GET /api/invoices/my-order/:orderId
// @desc    Get invoices for customer's own order (verifies ownership)
// @access  Private (Customer, Staff, Admin)
router.get('/my-order/:orderId',
  protect,
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400);
        throw new Error(errors.array()[0].msg);
      }

      // Get the order to verify ownership
      const order = await Order.findById(req.params.orderId);
      if (!order) {
        res.status(404);
        throw new Error('Order not found');
      }

      // Check if user is customer - verify they own this order
      if (req.user.role === 'customer') {
        if (!req.user.customer || !order.customer || order.customer.toString() !== req.user.customer.toString()) {
          res.status(403);
          throw new Error('You can only view invoices for your own orders');
        }
      }

      // Get invoices for this order
      const invoices = await Invoice.find({ order: req.params.orderId })
        .sort({ generatedAt: -1 })
        .select('invoiceNumber firm.name total generatedAt');

      res.json({
        success: true,
        data: invoices,
        count: invoices.length
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/invoices/my/{invoiceNumber}/download:
 *   get:
 *     summary: Download invoice PDF (customer access)
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF file
 */
// @route   GET /api/invoices/my/:invoiceNumber/download
// @desc    Download invoice PDF (verifies customer ownership)
// @access  Private (Customer, Staff, Admin)
router.get('/my/:invoiceNumber/download',
  protect,
  async (req, res, next) => {
    try {
      const { invoiceNumber } = req.params;

      // Find invoice record
      const invoice = await Invoice.findOne({ invoiceNumber }).populate('order');
      if (!invoice) {
        res.status(404);
        throw new Error('Invoice not found');
      }

      // Check if user is customer - verify they own this order
      if (req.user.role === 'customer') {
        const userCustomerId = req.user.customer?.toString?.() || req.user.customer;
        const orderCustomerId = invoice.order?.customer?.toString?.() || invoice.order?.customer;

        if (!userCustomerId || !orderCustomerId || userCustomerId !== orderCustomerId) {
          res.status(403);
          throw new Error('You can only download invoices for your own orders');
        }
      }

      // Check if PDF was generated
      if (!invoice.pdfPath) {
        res.status(404);
        throw new Error('Invoice PDF not yet generated');
      }

      // Read PDF file with path traversal protection
      try {
        const safePdfPath = getSafePdfPath(invoice.pdfPath);
        const pdfBuffer = await fs.readFile(safePdfPath);
        const safeFilename = path.basename(invoice.pdfPath);

        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeFilename}"`,
          'Content-Length': pdfBuffer.length
        });

        res.send(pdfBuffer);
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.status(404);
          throw new Error('Invoice PDF file not found on server');
        }
        throw err;
      }
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
