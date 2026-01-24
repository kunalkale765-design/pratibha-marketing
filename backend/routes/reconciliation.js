const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const { param, body } = require('express-validator');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const LedgerEntry = require('../models/LedgerEntry');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');
const { roundTo2Decimals, handleValidationErrors } = require('../utils/helpers');
const invoiceService = require('../services/invoiceService');

const INVOICE_STORAGE_DIR = path.join(__dirname, '..', 'storage', 'invoices');

async function ensureInvoiceStorageDir() {
  try {
    await fs.mkdir(INVOICE_STORAGE_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Auto-generate and save invoice PDFs for a reconciled order.
 * Splits items by firm (based on product categories) and creates one invoice per firm.
 * Non-critical: failures are logged but don't block reconciliation.
 */
async function autoGenerateInvoices(order, userId) {
  try {
    // Get the order with customer populated
    const fullOrder = await Order.findById(order._id)
      .populate('customer', 'name phone whatsapp address');
    if (!fullOrder) return;

    // Check if invoices already exist for this order (prevent duplicates)
    const existingCount = await Invoice.countDocuments({ order: order._id });
    if (existingCount > 0) return;

    // Get product categories
    const productIds = fullOrder.products.map(p => p.product);
    const products = await Product.find({ _id: { $in: productIds } }).select('_id category');
    const categoryMap = {};
    products.forEach(p => {
      categoryMap[p._id.toString()] = p.category;
    });

    // Add category to each order product
    const orderWithCategories = {
      ...fullOrder.toObject(),
      products: fullOrder.products.map(p => ({
        ...p.toObject ? p.toObject() : p,
        category: categoryMap[p.product?.toString()] || 'Other'
      }))
    };

    // Split by firm
    const split = invoiceService.splitOrderByFirm(orderWithCategories);

    await ensureInvoiceStorageDir();

    // Generate invoice for each firm portion
    for (const firmId of Object.keys(split)) {
      const firmData = split[firmId];
      if (firmData.items.length === 0) continue;

      const invoiceNumber = await invoiceService.generateInvoiceNumber();
      const productIdsForFirm = firmData.items.map(item => item.product?.toString());
      const invoiceData = invoiceService.getInvoiceData(fullOrder, firmId, productIdsForFirm, invoiceNumber);

      if (invoiceData.items.length === 0) continue;

      const filename = `${invoiceNumber}.pdf`;

      // Create invoice record
      const invoice = new Invoice({
        invoiceNumber: invoiceData.invoiceNumber,
        orderNumber: invoiceData.orderNumber,
        order: fullOrder._id,
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
        pdfPath: null,
        generatedBy: userId
      });
      await invoice.save();

      try {
        const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);
        const pdfFilePath = path.join(INVOICE_STORAGE_DIR, filename);
        await fs.writeFile(pdfFilePath, pdfBuffer);
        invoice.pdfPath = filename;
        await invoice.save();
      } catch (pdfError) {
        // PDF generation failed but invoice record exists - can be regenerated later
        console.error(`[Reconciliation] PDF generation failed for ${invoiceNumber}:`, pdfError.message);
      }
    }
  } catch (error) {
    // Non-critical: log and continue
    console.error(`[Reconciliation] Auto-invoice generation failed for order ${order.orderNumber}:`, error.message);
  }
}

// @route   GET /api/reconciliation/pending
// @desc    Get orders awaiting reconciliation (confirmed status with packing done)
// @access  Private (Admin, Staff)
router.get('/pending', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { batch, limit = 50 } = req.query;

    // Build query for orders ready for reconciliation
    const query = {
      status: 'confirmed',
      packingDone: true,
      'reconciliation.completedAt': { $exists: false }
    };

    // Filter by batch if provided
    if (batch) {
      query.batch = batch;
    }

    const orders = await Order.find(query)
      .select('orderNumber customer batch products totalAmount status packingDone notes deliveryAddress createdAt')
      .populate('customer', 'name phone address')
      .populate('batch', 'batchNumber batchType status')
      .sort({ createdAt: 1 })
      .limit(parseInt(limit));

    // Transform for reconciliation view
    const pendingItems = orders.map(order => ({
      _id: order._id,
      orderNumber: order.orderNumber,
      customer: {
        _id: order.customer?._id,
        name: order.customer?.name || 'Unknown',
        phone: order.customer?.phone || ''
      },
      batch: order.batch ? {
        _id: order.batch._id,
        batchNumber: order.batch.batchNumber,
        batchType: order.batch.batchType
      } : null,
      itemCount: order.products.length,
      totalAmount: order.totalAmount,
      notes: order.notes,
      deliveryAddress: order.deliveryAddress || order.customer?.address,
      createdAt: order.createdAt
    }));

    // Count today's completed reconciliations (IST day boundary)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const istMidnight = new Date(istNow);
    istMidnight.setHours(0, 0, 0, 0);
    const utcStartOfDay = new Date(istMidnight.getTime() - istOffset);

    const todayCompleted = await Order.countDocuments({
      'reconciliation.completedAt': { $gte: utcStartOfDay }
    });

    res.json({
      success: true,
      count: pendingItems.length,
      todayCompleted,
      data: pendingItems
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/reconciliation/:orderId
// @desc    Get order details for reconciliation
// @access  Private (Admin, Staff)
router.get('/:orderId',
  protect,
  authorize('admin', 'staff'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const order = await Order.findById(req.params.orderId)
        .populate('customer', 'name phone address pricingType')
        .populate('batch', 'batchNumber batchType status')
        .populate('products.product', 'name unit category');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Check if order is ready for reconciliation
      if (order.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: `Order must be confirmed for reconciliation. Current status: ${order.status}`
        });
      }

      // Format products for reconciliation
      const productsForReconciliation = order.products.map(p => ({
        product: p.product?._id || p.product,
        productName: p.productName || p.product?.name,
        unit: p.unit,
        orderedQty: p.quantity,
        packedQty: p.quantity, // Default to ordered qty (can be updated during packing)
        deliveredQty: p.quantity, // Default to ordered qty, user will modify
        rate: p.rate,
        amount: p.amount,
        isContractPrice: p.isContractPrice
      }));

      res.json({
        success: true,
        data: {
          _id: order._id,
          orderNumber: order.orderNumber,
          customer: order.customer,
          batch: order.batch,
          deliveryAddress: order.deliveryAddress || order.customer?.address,
          notes: order.notes,
          status: order.status,
          packingDone: order.packingDone,
          totalAmount: order.totalAmount,
          products: productsForReconciliation,
          createdAt: order.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   POST /api/reconciliation/:orderId/complete
// @desc    Complete reconciliation for an order
// @access  Private (Admin, Staff)
router.post('/:orderId/complete',
  protect,
  authorize('admin', 'staff'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  [
    body('items').isArray({ min: 1 }).withMessage('Items array is required'),
    body('items.*.product').isMongoId().withMessage('Valid product ID required'),
    body('items.*.deliveredQty').isFloat({ min: 0 }).withMessage('Delivered quantity must be 0 or positive'),
    body('items.*.reason').optional().isString().isLength({ max: 200 }).withMessage('Reason must be 200 characters or less'),
    body('notes').optional().isString().isLength({ max: 1000 }).withMessage('Notes must be 1000 characters or less')
  ],
  async (req, res, next) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const order = await Order.findById(req.params.orderId)
        .populate('customer');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Check if order is ready for reconciliation
      if (order.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: `Order must be confirmed for reconciliation. Current status: ${order.status}`
        });
      }

      // Check if already reconciled
      if (order.reconciliation?.completedAt) {
        return res.status(400).json({
          success: false,
          message: 'Order has already been reconciled'
        });
      }

      const { items, notes } = req.body;

      // Build reconciliation changes and update order products
      const changes = [];
      let newTotalAmount = 0;
      const originalTotal = order.totalAmount;

      // Create a map of submitted items for quick lookup
      const submittedItems = new Map();
      items.forEach(item => {
        submittedItems.set(item.product.toString(), {
          deliveredQty: item.deliveredQty,
          reason: item.reason || ''
        });
      });

      // Update each product in the order
      const updatedProducts = [];
      for (const product of order.products) {
        const productId = (product.product?._id || product.product).toString();
        const submitted = submittedItems.get(productId);

        if (!submitted) {
          // Product not in submitted items - keep as is
          updatedProducts.push(product);
          newTotalAmount += product.amount;
          continue;
        }

        const orderedQty = product.quantity;
        const deliveredQty = submitted.deliveredQty;

        // Track changes if quantity differs
        if (orderedQty !== deliveredQty) {
          changes.push({
            product: productId,
            productName: product.productName,
            orderedQty: orderedQty,
            deliveredQty: deliveredQty,
            reason: submitted.reason
          });
        }

        // Update product with delivered quantity
        const newAmount = roundTo2Decimals(deliveredQty * product.rate);
        updatedProducts.push({
          ...product.toObject(),
          quantity: deliveredQty,
          amount: newAmount
        });
        newTotalAmount += newAmount;
      }

      // Update order
      order.products = updatedProducts;
      order.totalAmount = roundTo2Decimals(newTotalAmount);
      order.status = 'delivered';
      order.deliveredAt = new Date();
      order.reconciliation = {
        completedAt: new Date(),
        completedBy: req.user._id,
        completedByName: req.user.name,
        changes: changes,
        originalTotal: originalTotal
      };

      if (notes) {
        order.notes = order.notes ? `${order.notes}\n\nReconciliation: ${notes}` : `Reconciliation: ${notes}`;
      }

      // Create ledger entry for the customer using a transaction for consistency
      // IMPORTANT: Order save MUST be inside the transaction to prevent inconsistent state
      const customer = order.customer;
      if (!customer || !customer._id) {
        // Reject reconciliation without customer - revenue cannot be tracked
        return res.status(400).json({
          success: false,
          message: 'Cannot reconcile order without customer. Please assign a customer first.'
        });
      } else {
        // Helper function to perform reconciliation operations
        const performReconciliation = async (sessionOrNull) => {
          const sessionOpts = sessionOrNull ? { session: sessionOrNull } : {};

          // Atomically claim the order: verify status is still 'confirmed' and not yet reconciled.
          // This prevents TOCTOU race conditions where two concurrent requests both pass the
          // initial checks and attempt to reconcile the same order.
          const claimed = await Order.findOneAndUpdate(
            {
              _id: order._id,
              status: 'confirmed',
              'reconciliation.completedAt': { $exists: false }
            },
            {
              $set: {
                products: order.products,
                totalAmount: order.totalAmount,
                status: order.status,
                deliveredAt: order.deliveredAt,
                reconciliation: order.reconciliation,
                notes: order.notes
              }
            },
            { new: true, ...sessionOpts }
          );

          if (!claimed) {
            const err = new Error('Order was already reconciled by another user');
            err.statusCode = 409;
            throw err;
          }

          // Read current balance within transaction for isolation
          const freshCustomer = sessionOrNull
            ? await Customer.findById(customer._id).session(sessionOrNull)
            : await Customer.findById(customer._id);
          const previousBalance = freshCustomer.balance || 0;

          // Calculate and set new balance atomically (avoids $inc + correction race)
          const invoiceAmount = roundTo2Decimals(order.totalAmount);
          const newBalance = roundTo2Decimals(previousBalance + invoiceAmount);
          await Customer.findByIdAndUpdate(
            customer._id,
            { $set: { balance: newBalance } },
            sessionOpts
          );

          // Create invoice ledger entry with the actual new balance
          if (sessionOrNull) {
            await LedgerEntry.create([{
              customer: customer._id,
              type: 'invoice',
              date: new Date(),
              order: order._id,
              orderNumber: order.orderNumber,
              description: `Invoice for order ${order.orderNumber}`,
              amount: order.totalAmount,
              balance: newBalance,
              notes: changes.length > 0 ? `Reconciled with ${changes.length} adjustment(s)` : null,
              createdBy: req.user._id,
              createdByName: req.user.name
            }], sessionOpts);
          } else {
            await LedgerEntry.create({
              customer: customer._id,
              type: 'invoice',
              date: new Date(),
              order: order._id,
              orderNumber: order.orderNumber,
              description: `Invoice for order ${order.orderNumber}`,
              amount: order.totalAmount,
              balance: newBalance,
              notes: changes.length > 0 ? `Reconciled with ${changes.length} adjustment(s)` : null,
              createdBy: req.user._id,
              createdByName: req.user.name
            });
          }
        };

        // In test mode, skip transactions (in-memory MongoDB doesn't support them)
        if (process.env.NODE_ENV === 'test') {
          await performReconciliation(null);
        } else {
          // Use transaction to ensure order, ledger entry and customer balance are updated atomically
          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              await performReconciliation(session);
            });
          } catch (txError) {
            // Log the specific transaction error for debugging
            console.error(`[Reconciliation] Transaction failed for order ${order.orderNumber}:`, txError.message);
            console.error('[Reconciliation] Transaction error stack:', txError.stack);
            // Throw a user-friendly error
            const error = new Error('Failed to complete reconciliation. The order may have been modified by another user. Please refresh and try again.');
            error.statusCode = 409; // Conflict
            throw error;
          } finally {
            await session.endSession();
          }
        }
      }

      // Auto-generate invoices in background (non-blocking)
      autoGenerateInvoices(order, req.user._id).catch(err => {
        console.error(`[Reconciliation] Background invoice generation error:`, err.message);
      });

      res.json({
        success: true,
        message: 'Reconciliation completed successfully',
        data: {
          orderNumber: order.orderNumber,
          status: order.status,
          originalTotal: originalTotal,
          finalTotal: order.totalAmount,
          adjustments: changes.length,
          changes: changes
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
