const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
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
const { handleValidationErrors, parsePagination } = require('../utils/helpers');

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
    const { status, date } = req.query;
    const { limit } = parsePagination(req.query, { limit: 20, maxLimit: 100 });

    const query = {};

    if (status) {
      query.status = status;
    }

    if (date) {
      const targetDate = new Date(date);
      if (!isNaN(targetDate.getTime())) {
        // Set to UTC midnight to match how batch dates are stored
        targetDate.setUTCHours(0, 0, 0, 0);
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
      if (handleValidationErrors(req, res)) return;

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
      if (handleValidationErrors(req, res)) return;

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
      if (handleValidationErrors(req, res)) return;

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
      if (handleValidationErrors(req, res)) return;

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

      // Set to UTC midnight to match how batch dates are stored
      targetDate.setUTCHours(0, 0, 0, 0);

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
      if (handleValidationErrors(req, res)) return;

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
      if (handleValidationErrors(req, res)) return;

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

      // Order must be confirmed to generate bill
      if (order.status !== 'confirmed' && order.status !== 'delivered') {
        return res.status(400).json({
          success: false,
          message: 'Order must be confirmed before generating delivery bill'
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
        // First time generating bill for this order - generate and save bill number atomically
        billNumber = await deliveryBillService.generateBillNumber();

        // Use conditional update to prevent race condition (only set if not already generated)
        const updated = await Order.findOneAndUpdate(
          { _id: order._id, deliveryBillGenerated: { $ne: true } },
          {
            $set: {
              deliveryBillGenerated: true,
              deliveryBillGeneratedAt: new Date(),
              deliveryBillNumber: billNumber
            }
          },
          { new: true }
        );

        // If no update (already generated by another request), use existing bill number
        if (!updated) {
          const existingOrder = await Order.findById(order._id).select('deliveryBillNumber');
          billNumber = existingOrder.deliveryBillNumber;
        }
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

      // Generate combined PDF with both ORIGINAL and DUPLICATE copies
      const pdfBuffer = await deliveryBillService.generateBillPDF(billData);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${billNumber}.pdf"`,
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
 * /api/batches/fix-dates:
 *   post:
 *     summary: Fix batch date format inconsistency (one-time migration)
 *     tags: [Batches]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Batch dates fixed
 */
// @route   POST /api/batches/fix-dates
// @desc    Fix batch date format (UTC midnight → IST midnight in UTC)
// @access  Private (Admin only)
router.post('/fix-dates',
  protect,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const batches = await Batch.find({});
      let fixedCount = 0;
      let skippedCount = 0;
      const changes = [];

      for (const batch of batches) {
        const currentDate = new Date(batch.date);
        const hours = currentDate.getUTCHours();
        const minutes = currentDate.getUTCMinutes();

        // Check if date is at UTC midnight (needs fixing) vs IST midnight (18:30 UTC, correct)
        if (hours === 0 && minutes === 0) {
          // This is stored as UTC midnight, needs to be converted to IST midnight
          // IST midnight = UTC - 5:30 = previous day 18:30
          const correctedDate = new Date(currentDate.getTime() - (5.5 * 60 * 60 * 1000));

          changes.push({
            batchNumber: batch.batchNumber,
            oldDate: currentDate.toISOString(),
            newDate: correctedDate.toISOString()
          });

          batch.date = correctedDate;
          await batch.save();
          fixedCount++;
        } else if (hours === 18 && minutes === 30) {
          // Already in correct format (IST midnight = 18:30 UTC)
          skippedCount++;
        }
      }

      res.json({
        success: true,
        message: `Fixed ${fixedCount} batches, skipped ${skippedCount} (already correct)`,
        data: {
          fixed: fixedCount,
          skipped: skippedCount,
          total: batches.length,
          changes
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
