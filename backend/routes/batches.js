const express = require('express');
const router = express.Router();
const path = require('path');
const { param, validationResult } = require('express-validator');
const Batch = require('../models/Batch');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/auth');
const {
  manuallyConfirmBatch,
  getBatchWithStats,
  getISTTime,
  BATCH_CONFIG
} = require('../services/batchScheduler');
const deliveryBillService = require('../services/deliveryBillService');

/**
 * @swagger
 * /api/batches:
 *   get:
 *     summary: Get all batches with optional filters
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, confirmed, expired]
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of batches
 */
// @route   GET /api/batches
// @desc    List all batches with optional filters
// @access  Private (Admin, Staff)
router.get('/', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { status, date, limit: rawLimit = 20 } = req.query;
    const limit = Math.min(Math.max(parseInt(rawLimit) || 20, 1), 100);

    const query = {};

    if (status) {
      query.status = status;
    }

    if (date) {
      const targetDate = new Date(date);
      if (!isNaN(targetDate.getTime())) {
        // Set to midnight for comparison
        targetDate.setHours(0, 0, 0, 0);
        query.date = targetDate;
      }
    }

    const batches = await Batch.find(query)
      .sort({ date: -1, batchType: 1 })
      .limit(limit)
      .populate('confirmedBy', 'name');

    res.json({
      success: true,
      count: batches.length,
      data: batches
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/batches/today:
 *   get:
 *     summary: Get today's batches
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's batches with current status
 */
// @route   GET /api/batches/today
// @desc    Get today's batches with status info
// @access  Private (Admin, Staff)
router.get('/today', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const ist = getISTTime();
    const today = ist.dateOnly;

    const batches = await Batch.find({ date: today })
      .sort({ batchType: 1 })
      .populate('confirmedBy', 'name');

    // Get order counts for all batches in a single aggregation (avoids N+1)
    const batchIds = batches.map(b => b._id);
    const orderCounts = await Order.aggregate([
      { $match: { batch: { $in: batchIds } } },
      {
        $group: {
          _id: { batch: '$batch', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Build counts map: batchId -> { status: count }
    const countsMap = new Map();
    orderCounts.forEach(item => {
      const batchId = item._id.batch.toString();
      if (!countsMap.has(batchId)) {
        countsMap.set(batchId, {});
      }
      countsMap.get(batchId)[item._id.status] = item.count;
    });

    // Merge counts into batches
    const batchesWithCounts = batches.map(batch => {
      const statusCounts = countsMap.get(batch._id.toString()) || {};
      return {
        ...batch.toObject(),
        orderCounts: statusCounts,
        totalOrders: Object.values(statusCounts).reduce((a, b) => a + b, 0)
      };
    });

    // Add info about which batch is currently accepting orders
    const currentHour = ist.hour;
    let currentBatchInfo = '';

    if (currentHour < BATCH_CONFIG.BATCH_1_CUTOFF_HOUR) {
      currentBatchInfo = '1st batch (closes at 8:00 AM)';
    } else if (currentHour < BATCH_CONFIG.BATCH_2_CUTOFF_HOUR) {
      currentBatchInfo = '2nd batch (closes at 12:00 PM)';
    } else {
      currentBatchInfo = "Tomorrow's 1st batch";
    }

    res.json({
      success: true,
      currentTime: new Date().toISOString(),  // Send actual UTC time, frontend converts to IST
      currentBatch: currentBatchInfo,
      data: batchesWithCounts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/batches/{id}:
 *   get:
 *     summary: Get batch details with statistics
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Batch details
 */
// @route   GET /api/batches/:id
// @desc    Get single batch with detailed statistics
// @access  Private (Admin, Staff)
router.get('/:id',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid batch ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const batchWithStats = await getBatchWithStats(req.params.id);

      if (!batchWithStats) {
        return res.status(404).json({
          success: false,
          message: 'Batch not found'
        });
      }

      res.json({
        success: true,
        data: batchWithStats
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/batches/{id}/orders:
 *   get:
 *     summary: Get orders in a batch
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Orders in the batch
 */
// @route   GET /api/batches/:id/orders
// @desc    Get all orders in a batch
// @access  Private (Admin, Staff)
router.get('/:id/orders',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid batch ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const batch = await Batch.findById(req.params.id);
      if (!batch) {
        return res.status(404).json({
          success: false,
          message: 'Batch not found'
        });
      }

      const query = { batch: batch._id };

      // Optional status filter
      if (req.query.status) {
        query.status = req.query.status;
      }

      const orders = await Order.find(query)
        .populate('customer', 'name phone')
        .populate('products.product', 'name unit')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        count: orders.length,
        batch: {
          batchNumber: batch.batchNumber,
          status: batch.status,
          date: batch.date
        },
        data: orders
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/batches/{id}/confirm:
 *   post:
 *     summary: Manually confirm a batch
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Batch confirmed
 */
// @route   POST /api/batches/:id/confirm
// @desc    Manually confirm a batch (for 2nd batch or emergency) and generate delivery bills
// @access  Private (Admin, Staff)
router.post('/:id/confirm',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid batch ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { generateBills = true } = req.body;

      // manuallyConfirmBatch now handles bill generation internally
      const result = await manuallyConfirmBatch(req.params.id, req.user._id, { generateBills });

      res.json({
        success: true,
        message: `Batch confirmed. ${result.ordersConfirmed} orders locked. ${result.billsGenerated || 0} bills generated.`,
        data: {
          batch: result.batch,
          ordersConfirmed: result.ordersConfirmed,
          billsGenerated: result.billsGenerated,
          billErrors: result.billErrors
        }
      });
    } catch (error) {
      if (error.message === 'Batch not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      if (error.message.includes('already')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/batches/{id}/quantity-summary:
 *   get:
 *     summary: Get quantity summary for a batch
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Quantity summary for the batch
 */
// @route   GET /api/batches/:id/quantity-summary
// @desc    Get aggregated quantities for products in a batch
// @access  Private (Admin, Staff)
router.get('/:id/quantity-summary',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid batch ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const batch = await Batch.findById(req.params.id);
      if (!batch) {
        return res.status(404).json({
          success: false,
          message: 'Batch not found'
        });
      }

      // Aggregate quantities by product for orders in this batch
      const summary = await Order.aggregate([
        {
          $match: {
            batch: batch._id,
            status: { $nin: ['cancelled'] }
          }
        },
        { $unwind: '$products' },
        {
          $group: {
            _id: '$products.product',
            productName: { $first: '$products.productName' },
            unit: { $first: '$products.unit' },
            totalQuantity: { $sum: '$products.quantity' },
            totalAmount: { $sum: '$products.amount' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalQuantity: -1 } }
      ]);

      res.json({
        success: true,
        batch: {
          batchNumber: batch.batchNumber,
          status: batch.status,
          date: batch.date
        },
        count: summary.length,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/batches/date/{date}:
 *   get:
 *     summary: Get batches for a specific date
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Batches for the date
 */
// @route   GET /api/batches/date/:date
// @desc    Get batches for a specific date (YYYY-MM-DD format)
// @access  Private (Admin, Staff)
router.get('/date/:date',
  protect,
  authorize('admin', 'staff'),
  async (req, res, next) => {
    try {
      const targetDate = new Date(req.params.date);

      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Use YYYY-MM-DD'
        });
      }

      // Set to midnight
      targetDate.setHours(0, 0, 0, 0);

      const batches = await Batch.find({ date: targetDate })
        .sort({ batchType: 1 })
        .populate('confirmedBy', 'name');

      res.json({
        success: true,
        date: targetDate.toISOString().split('T')[0],
        count: batches.length,
        data: batches
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/batches/{id}/bills:
 *   post:
 *     summary: Generate delivery bills for a batch
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bills generated
 */
// @route   POST /api/batches/:id/bills
// @desc    Generate delivery bills for all orders in a batch
// @access  Private (Admin, Staff)
router.post('/:id/bills',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid batch ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const batch = await Batch.findById(req.params.id);
      if (!batch) {
        return res.status(404).json({
          success: false,
          message: 'Batch not found'
        });
      }

      // Batch must be confirmed to generate bills
      if (batch.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: 'Batch must be confirmed before generating bills'
        });
      }

      const result = await deliveryBillService.generateBillsForBatch(batch);

      res.json({
        success: true,
        message: `Generated ${result.billsGenerated} bills for ${result.totalOrders} orders`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/batches/{id}/bills/{orderId}/download:
 *   get:
 *     summary: Download delivery bill for an order
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: copy
 *         schema:
 *           type: string
 *           enum: [original, duplicate]
 *     responses:
 *       200:
 *         description: PDF file
 */
// @route   GET /api/batches/:id/bills/:orderId/download
// @desc    Download delivery bill for a specific order in a batch
// @access  Private (Admin, Staff)
router.get('/:id/bills/:orderId/download',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid batch ID'),
  param('orderId').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { copy = 'original' } = req.query;
      const copyType = copy.toUpperCase() === 'DUPLICATE' ? 'DUPLICATE' : 'ORIGINAL';

      // Find the order
      const order = await Order.findOne({
        _id: req.params.orderId,
        batch: req.params.id
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found in this batch'
        });
      }

      if (!order.deliveryBillGenerated) {
        return res.status(404).json({
          success: false,
          message: 'Delivery bill has not been generated for this order'
        });
      }

      const batch = await Batch.findById(req.params.id);
      const customer = await require('../models/Customer').findById(order.customer);

      // Generate bill data
      const firmSplit = await deliveryBillService.splitOrderByFirm(order);
      const firmIds = Object.keys(firmSplit);

      if (firmIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No items to bill'
        });
      }

      // Reuse existing bill number or generate one if not exists
      // This ensures consistent bill numbers across multiple downloads
      const firmId = firmIds[0];
      const firmData = firmSplit[firmId];
      let billNumber = order.deliveryBillNumber;

      if (!billNumber) {
        // First time generating bill for this order - generate and save bill number
        billNumber = await deliveryBillService.generateBillNumber();
        await Order.findByIdAndUpdate(order._id, {
          $set: { deliveryBillNumber: billNumber }
        });
      }

      const billData = {
        billNumber: billNumber,
        orderNumber: order.orderNumber,
        batchNumber: batch?.batchNumber || 'N/A',
        date: new Date(),
        firm: {
          id: firmId,
          name: firmData.firm.name,
          address: firmData.firm.address,
          phone: firmData.firm.phone,
          email: firmData.firm.email
        },
        customer: {
          name: customer?.name || 'Unknown Customer',
          phone: customer?.phone || '',
          address: order.deliveryAddress || customer?.address || ''
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
