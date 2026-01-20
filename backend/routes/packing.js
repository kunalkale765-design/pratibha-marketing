const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Batch = require('../models/Batch');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/packing/queue
// @desc    Get orders ready for packing (confirmed/processing status)
// @access  Private (Admin, Staff)
router.get('/queue', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { batch, status, limit = 50 } = req.query;

    // Build query for orders ready for packing
    const query = {
      status: { $in: status ? [status] : ['confirmed', 'processing'] }
    };

    // Filter by batch if provided
    if (batch) {
      query.batch = batch;
    }

    const orders = await Order.find(query)
      .select('orderNumber customer batch products totalAmount status packingDetails notes deliveryAddress createdAt')
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
      packingStatus: order.packingDetails?.status || 'not_started',
      packedItems: order.packingDetails?.items?.filter(i => i.status === 'packed').length || 0,
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

// @route   GET /api/packing/:orderId
// @desc    Get packing details for a specific order
// @access  Private (Admin, Staff)
router.get('/:orderId', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
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

    // Initialize packing items if not already done
    let packingItems = order.packingDetails?.items || [];

    if (packingItems.length === 0) {
      // Create packing items from order products
      packingItems = order.products.map(p => ({
        product: p.product?._id || p.product,
        productName: p.productName || p.product?.name,
        orderedQuantity: p.quantity,
        packedQuantity: null,
        unit: p.unit,
        status: 'pending',
        notes: '',
        verifiedAt: null,
        verifiedBy: null
      }));
    }

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
        totalAmount: order.totalAmount,
        products: order.products,
        packingDetails: {
          status: order.packingDetails?.status || 'not_started',
          startedAt: order.packingDetails?.startedAt,
          completedAt: order.packingDetails?.completedAt,
          packedBy: order.packingDetails?.packedBy,
          packerName: order.packingDetails?.packerName,
          items: packingItems,
          issues: order.packingDetails?.issues || [],
          adjustedTotal: order.packingDetails?.adjustedTotal,
          holdReason: order.packingDetails?.holdReason
        },
        createdAt: order.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/packing/:orderId/start
// @desc    Start packing session for an order
// @access  Private (Admin, Staff)
router.post('/:orderId/start', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('products.product', 'name unit');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is in a packable state
    if (!['confirmed', 'processing'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot pack order with status "${order.status}". Order must be confirmed or processing.`
      });
    }

    // Check if already being packed
    if (order.packingDetails?.status === 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Order is already being packed',
        packedBy: order.packingDetails.packerName
      });
    }

    // Initialize packing details
    const packingItems = order.products.map(p => ({
      product: p.product?._id || p.product,
      productName: p.productName || p.product?.name,
      orderedQuantity: p.quantity,
      packedQuantity: null,
      unit: p.unit,
      status: 'pending',
      notes: '',
      verifiedAt: null,
      verifiedBy: null
    }));

    order.packingDetails = {
      status: 'in_progress',
      startedAt: new Date(),
      packedBy: req.user._id,
      packerName: req.user.name,
      items: packingItems,
      issues: [],
      adjustedTotal: null,
      acknowledgement: { acknowledged: false }
    };

    // Update order status to processing if it was confirmed
    if (order.status === 'confirmed') {
      order.status = 'processing';
    }

    await order.save();

    res.json({
      success: true,
      message: 'Packing session started',
      data: {
        packingStatus: order.packingDetails.status,
        startedAt: order.packingDetails.startedAt,
        packerName: order.packingDetails.packerName,
        items: order.packingDetails.items
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/packing/:orderId/item/:productId
// @desc    Update packing status for a specific item
// @access  Private (Admin, Staff)
router.put('/:orderId/item/:productId', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { orderId, productId } = req.params;
    const { status, packedQuantity, notes } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if packing session is active
    if (order.packingDetails?.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'No active packing session. Start packing first.'
      });
    }

    // Find item in packing details
    const itemIndex = order.packingDetails.items.findIndex(
      item => item.product.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in order'
      });
    }

    const item = order.packingDetails.items[itemIndex];

    // Update item
    item.status = status;
    item.packedQuantity = packedQuantity;
    item.notes = notes || '';
    item.verifiedAt = new Date();
    item.verifiedBy = req.user._id;

    // Log issue if not fully packed
    if (status !== 'packed' && status !== 'pending') {
      const shortQty = item.orderedQuantity - (packedQuantity || 0);

      // Remove existing issue for this product if any
      order.packingDetails.issues = order.packingDetails.issues.filter(
        i => i.product.toString() !== productId
      );

      // Add new issue
      order.packingDetails.issues.push({
        product: productId,
        productName: item.productName,
        issueType: status,
        description: notes || `${status}: ${shortQty} ${item.unit} affected`,
        quantityAffected: shortQty,
        reportedAt: new Date(),
        reportedBy: req.user._id
      });
    } else if (status === 'packed') {
      // Remove any existing issue for this product if now packed
      order.packingDetails.issues = order.packingDetails.issues.filter(
        i => i.product.toString() !== productId
      );
    }

    await order.save();

    // Calculate progress
    const items = order.packingDetails.items;
    const packed = items.filter(i => i.status !== 'pending').length;
    const total = items.length;

    res.json({
      success: true,
      data: {
        item: order.packingDetails.items[itemIndex],
        progress: { packed, total, percentage: Math.round((packed / total) * 100) },
        issues: order.packingDetails.issues
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/packing/:orderId/complete
// @desc    Complete packing session
// @access  Private (Admin, Staff)
router.post('/:orderId/complete', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { acknowledgeIssues } = req.body;

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if packing session is active
    if (order.packingDetails?.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'No active packing session'
      });
    }

    // Check all items are verified
    const unverified = order.packingDetails.items.filter(
      item => item.status === 'pending'
    );

    if (unverified.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${unverified.length} item(s) not yet verified`,
        unverifiedItems: unverified.map(i => i.productName)
      });
    }

    // Check issues acknowledged if any exist
    if (order.packingDetails.issues.length > 0 && !acknowledgeIssues) {
      return res.status(400).json({
        success: false,
        message: 'Must acknowledge issues before completing',
        issues: order.packingDetails.issues
      });
    }

    // Calculate adjusted total if there are issues
    let adjustedTotal = order.totalAmount;
    if (order.packingDetails.issues.length > 0) {
      order.packingDetails.items.forEach(item => {
        if (item.status !== 'packed' && item.packedQuantity !== null) {
          // Find the original product to get rate
          const originalProduct = order.products.find(
            p => p.product.toString() === item.product.toString()
          );
          if (originalProduct) {
            const difference = item.orderedQuantity - item.packedQuantity;
            adjustedTotal -= difference * originalProduct.rate;
          }
        }
      });
    }

    // Update packing details
    order.packingDetails.status = 'completed';
    order.packingDetails.completedAt = new Date();
    order.packingDetails.adjustedTotal = adjustedTotal !== order.totalAmount ? adjustedTotal : null;

    if (acknowledgeIssues) {
      order.packingDetails.acknowledgement = {
        acknowledged: true,
        acknowledgedAt: new Date(),
        acknowledgedBy: req.user._id
      };
    }

    // Update order status to packed
    order.status = 'packed';
    order.packedAt = new Date();
    order.assignedWorker = order.packingDetails.packerName;

    await order.save();

    res.json({
      success: true,
      message: 'Packing completed successfully',
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        packingDetails: order.packingDetails,
        originalTotal: order.totalAmount,
        adjustedTotal: order.packingDetails.adjustedTotal
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/packing/:orderId/hold
// @desc    Put order on hold for review
// @access  Private (Admin, Staff)
router.post('/:orderId/hold', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Hold reason is required'
      });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update packing status to on_hold
    if (!order.packingDetails) {
      order.packingDetails = {};
    }
    order.packingDetails.status = 'on_hold';
    order.packingDetails.holdReason = reason;

    await order.save();

    res.json({
      success: true,
      message: 'Order put on hold',
      data: {
        orderNumber: order.orderNumber,
        packingStatus: order.packingDetails.status,
        holdReason: order.packingDetails.holdReason
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/packing/:orderId/resume
// @desc    Resume packing for an order on hold
// @access  Private (Admin, Staff)
router.post('/:orderId/resume', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.packingDetails?.status !== 'on_hold') {
      return res.status(400).json({
        success: false,
        message: 'Order is not on hold'
      });
    }

    order.packingDetails.status = 'in_progress';
    order.packingDetails.holdReason = null;

    await order.save();

    res.json({
      success: true,
      message: 'Packing resumed',
      data: {
        orderNumber: order.orderNumber,
        packingStatus: order.packingDetails.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/packing/batch/:batchId/summary
// @desc    Get packing summary for a batch
// @access  Private (Admin, Staff)
router.get('/batch/:batchId/summary', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const batch = await Batch.findById(req.params.batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    // Get all orders in this batch
    const orders = await Order.find({
      batch: batch._id,
      status: { $nin: ['cancelled'] }
    }).populate('products.product', 'name unit category');

    // Calculate order stats
    const orderStats = {
      total: orders.length,
      notStarted: orders.filter(o => !o.packingDetails?.status || o.packingDetails.status === 'not_started').length,
      inProgress: orders.filter(o => o.packingDetails?.status === 'in_progress').length,
      onHold: orders.filter(o => o.packingDetails?.status === 'on_hold').length,
      completed: orders.filter(o => o.packingDetails?.status === 'completed').length
    };

    // Aggregate products across all orders
    const productMap = new Map();

    orders.forEach(order => {
      const isPacked = order.packingDetails?.status === 'completed';

      order.products.forEach(item => {
        const productId = item.product?._id?.toString() || item.product?.toString();
        if (!productId) return;

        const productName = item.productName || item.product?.name || 'Unknown';
        const unit = item.unit || item.product?.unit || 'unit';
        const category = item.product?.category || 'Uncategorized';

        if (productMap.has(productId)) {
          const existing = productMap.get(productId);
          existing.totalOrdered += item.quantity || 0;
          existing.orderCount += 1;
          if (isPacked) {
            // Find packed quantity from packing details
            const packedItem = order.packingDetails?.items?.find(
              i => i.product.toString() === productId
            );
            existing.totalPacked += packedItem?.packedQuantity || item.quantity || 0;
          }
        } else {
          let packedQty = 0;
          if (isPacked) {
            const packedItem = order.packingDetails?.items?.find(
              i => i.product.toString() === productId
            );
            packedQty = packedItem?.packedQuantity || item.quantity || 0;
          }

          productMap.set(productId, {
            productId,
            productName,
            unit,
            category,
            totalOrdered: item.quantity || 0,
            totalPacked: packedQty,
            orderCount: 1
          });
        }
      });
    });

    // Convert to array and calculate remaining
    const products = Array.from(productMap.values()).map(p => ({
      ...p,
      remaining: p.totalOrdered - p.totalPacked,
      percentPacked: p.totalOrdered > 0 ? Math.round((p.totalPacked / p.totalOrdered) * 100) : 0
    }));

    // Sort by remaining (highest first)
    products.sort((a, b) => b.remaining - a.remaining);

    res.json({
      success: true,
      data: {
        batch: {
          _id: batch._id,
          batchNumber: batch.batchNumber,
          batchType: batch.batchType,
          status: batch.status,
          date: batch.date
        },
        orderStats,
        products
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/packing/stats
// @desc    Get overall packing statistics
// @access  Private (Admin, Staff)
router.get('/stats', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count orders by packing status
    const stats = await Order.aggregate([
      {
        $match: {
          status: { $in: ['confirmed', 'processing', 'packed'] },
          createdAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: '$packingDetails.status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statMap = {};
    stats.forEach(s => {
      statMap[s._id || 'not_started'] = s.count;
    });

    res.json({
      success: true,
      data: {
        notStarted: statMap['not_started'] || 0,
        inProgress: statMap['in_progress'] || 0,
        onHold: statMap['on_hold'] || 0,
        completed: statMap['completed'] || 0,
        total: Object.values(statMap).reduce((a, b) => a + b, 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
