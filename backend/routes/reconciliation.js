const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { param, body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const LedgerEntry = require('../models/LedgerEntry');
const { protect, authorize } = require('../middleware/auth');

// Helper function to round to 2 decimal places
function roundTo2Decimals(num) {
  return Math.round(num * 100) / 100;
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

    res.json({
      success: true,
      count: pendingItems.length,
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
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

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
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

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

      await order.save();

      // Create ledger entry for the customer using a transaction for consistency
      const customer = order.customer;
      if (!customer || !customer._id) {
        // Log error but don't fail reconciliation - the order is already updated
        console.error(`WARNING: Order ${order.orderNumber} has no associated customer. Ledger entry not created.`);
      } else {
        // Use transaction to ensure ledger entry and customer balance are updated atomically
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            // Get customer's current balance within transaction
            const lastEntry = await LedgerEntry.findOne({ customer: customer._id })
              .sort({ date: -1, createdAt: -1 })
              .session(session);
            const previousBalance = lastEntry?.balance || 0;
            const newBalance = roundTo2Decimals(previousBalance + order.totalAmount);

            // Create invoice ledger entry
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
            }], { session });

            // Update customer's balance atomically
            await Customer.findByIdAndUpdate(
              customer._id,
              { $set: { balance: newBalance } },
              { session }
            );
          });
        } finally {
          await session.endSession();
        }
      }

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
