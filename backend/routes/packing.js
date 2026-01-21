const express = require('express');
const router = express.Router();
const { param, body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Batch = require('../models/Batch');
const { protect, authorize } = require('../middleware/auth');
const deliveryBillService = require('../services/deliveryBillService');

// Helper function to round to 2 decimal places
function roundTo2Decimals(num) {
  return Math.round(num * 100) / 100;
}

// @route   GET /api/packing/queue
// @desc    Get orders ready for packing (confirmed status, not yet packed)
// @access  Private (Admin, Staff)
router.get('/queue', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { batch, limit = 50 } = req.query;

    // Build query for confirmed orders not yet marked as packing done
    const query = {
      status: 'confirmed',
      packingDone: { $ne: true }
    };

    // Filter by batch if provided
    if (batch) {
      query.batch = batch;
    }

    const orders = await Order.find(query)
      .select('orderNumber customer batch products totalAmount status packingDone notes deliveryAddress createdAt')
      .populate('customer', 'name phone address')
      .populate('batch', 'batchNumber batchType status')
      .sort({ batch: 1, createdAt: 1 })
      .limit(parseInt(limit));

    // Transform for queue view
    const queueItems = orders.map(order => ({
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
        batchType: order.batch.batchType,
        status: order.batch.status
      } : null,
      itemCount: order.products.length,
      totalAmount: order.totalAmount,
      status: order.status,
      packingDone: order.packingDone || false,
      notes: order.notes,
      deliveryAddress: order.deliveryAddress || order.customer?.address,
      createdAt: order.createdAt
    }));

    // Group by batch for better display
    const grouped = {};
    queueItems.forEach(item => {
      const batchKey = item.batch?.batchNumber || 'No Batch';
      if (!grouped[batchKey]) {
        grouped[batchKey] = {
          batch: item.batch,
          orders: []
        };
      }
      grouped[batchKey].orders.push(item);
    });

    res.json({
      success: true,
      count: queueItems.length,
      data: queueItems,
      grouped: Object.values(grouped)
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/packing/stats
// @desc    Get overall packing statistics for today
// @access  Private (Admin, Staff)
// NOTE: This route MUST be defined before /:orderId to prevent "stats" being matched as an orderId
router.get('/stats', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count orders by packing status
    const [confirmedCount, packingDoneCount, reconciliationPending] = await Promise.all([
      Order.countDocuments({
        status: 'confirmed',
        packingDone: { $ne: true },
        createdAt: { $gte: today }
      }),
      Order.countDocuments({
        status: 'confirmed',
        packingDone: true,
        createdAt: { $gte: today }
      }),
      Order.countDocuments({
        status: 'confirmed',
        packingDone: true,
        'reconciliation.completedAt': { $exists: false },
        createdAt: { $gte: today }
      })
    ]);

    res.json({
      success: true,
      data: {
        pendingPacking: confirmedCount,
        packingDone: packingDoneCount,
        awaitingReconciliation: reconciliationPending,
        total: confirmedCount + packingDoneCount
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/packing/:orderId
// @desc    Get packing details for a specific order
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
        .populate('customer', 'name phone address')
        .populate('batch', 'batchNumber batchType status')
        .populate('products.product', 'name unit category');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Format products for packing view
      const packingItems = order.products.map(p => ({
        product: p.product?._id || p.product,
        productName: p.productName || p.product?.name,
        orderedQuantity: p.quantity,
        unit: p.unit,
        rate: p.rate,
        amount: p.amount
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
          packingDone: order.packingDone || false,
          packingDoneAt: order.packingDoneAt,
          totalAmount: order.totalAmount,
          items: packingItems,
          createdAt: order.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   PUT /api/packing/:orderId/item/:productId
// @desc    Update packed quantity for a specific item (immediately updates order)
// @access  Private (Admin, Staff)
router.put('/:orderId/item/:productId',
  protect,
  authorize('admin', 'staff'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  param('productId').isMongoId().withMessage('Invalid product ID'),
  [
    body('quantity').isFloat({ min: 0 }).withMessage('Quantity must be 0 or positive'),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be 500 characters or less')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { orderId, productId } = req.params;
      const { quantity, notes } = req.body;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Check if order is in a packable state
      if (order.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: `Cannot pack order with status "${order.status}". Order must be confirmed.`
        });
      }

      // Find the product in the order
      const productIndex = order.products.findIndex(
        p => (p.product?._id || p.product).toString() === productId
      );

      if (productIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Product not found in order'
        });
      }

      const product = order.products[productIndex];
      const oldQuantity = product.quantity;
      const newQuantity = quantity;

      // Update the product quantity and recalculate amount
      product.quantity = newQuantity;
      product.amount = roundTo2Decimals(newQuantity * product.rate);

      // Recalculate total
      let newTotal = 0;
      for (const p of order.products) {
        newTotal += p.amount;
      }
      order.totalAmount = roundTo2Decimals(newTotal);

      // Add to audit log if quantity changed
      if (oldQuantity !== newQuantity) {
        if (!order.priceAuditLog) {
          order.priceAuditLog = [];
        }
        order.priceAuditLog.push({
          changedAt: new Date(),
          changedBy: req.user._id,
          changedByName: req.user.name,
          productId: productId,
          productName: product.productName,
          oldRate: product.rate,
          newRate: product.rate,
          oldQuantity: oldQuantity,
          newQuantity: newQuantity,
          oldTotal: roundTo2Decimals(oldQuantity * product.rate),
          newTotal: product.amount,
          reason: notes || 'Quantity updated during packing'
        });
      }

      await order.save();

      res.json({
        success: true,
        message: 'Product quantity updated',
        data: {
          product: {
            productId: productId,
            productName: product.productName,
            oldQuantity: oldQuantity,
            newQuantity: newQuantity,
            rate: product.rate,
            amount: product.amount
          },
          orderTotal: order.totalAmount
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   POST /api/packing/:orderId/done
// @desc    Mark packing as done for an order
// @access  Private (Admin, Staff)
router.post('/:orderId/done',
  protect,
  authorize('admin', 'staff'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const order = await Order.findById(req.params.orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Check if order is in a packable state
      if (order.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: `Cannot mark packing done for order with status "${order.status}". Order must be confirmed.`
        });
      }

      // Mark packing as done
      order.packingDone = true;
      order.packingDoneAt = new Date();
      order.packingDoneBy = req.user._id;
      order.assignedWorker = req.user.name;

      await order.save();

      res.json({
        success: true,
        message: 'Packing marked as done',
        data: {
          orderNumber: order.orderNumber,
          packingDone: order.packingDone,
          packingDoneAt: order.packingDoneAt,
          packedBy: req.user.name
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// @route   POST /api/packing/:orderId/reprint-bill
// @desc    Reprint delivery bill for an order (regenerates with current quantities)
// @access  Private (Admin, Staff)
router.post('/:orderId/reprint-bill',
  protect,
  authorize('admin', 'staff'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { copy = 'original' } = req.body;
      const copyType = copy.toUpperCase() === 'DUPLICATE' ? 'DUPLICATE' : 'ORIGINAL';

      const order = await Order.findById(req.params.orderId)
        .populate('customer', 'name phone address')
        .populate('batch', 'batchNumber');

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Generate bill with current quantities
      const firmSplit = await deliveryBillService.splitOrderByFirm(order);
      const firmIds = Object.keys(firmSplit);

      if (firmIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No items to bill'
        });
      }

      // Generate bill for first firm
      const firmId = firmIds[0];
      const firmData = firmSplit[firmId];
      const billNumber = await deliveryBillService.generateBillNumber();

      const billData = {
        billNumber: billNumber,
        orderNumber: order.orderNumber,
        batchNumber: order.batch?.batchNumber || 'N/A',
        date: new Date(),
        firm: {
          id: firmId,
          name: firmData.firm.name,
          address: firmData.firm.address,
          phone: firmData.firm.phone,
          email: firmData.firm.email
        },
        customer: {
          name: order.customer?.name || 'Unknown Customer',
          phone: order.customer?.phone || '',
          address: order.deliveryAddress || order.customer?.address || ''
        },
        items: firmData.items.map(item => ({
          name: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.amount
        })),
        total: firmData.subtotal
      };

      const pdfBuffer = await deliveryBillService.generateBillPDF(billData, copyType);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${billNumber}_${copyType}.pdf"`,
        'Content-Length': pdfBuffer.length
      });

      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
