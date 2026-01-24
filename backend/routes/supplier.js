const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Batch = require('../models/Batch');
const MarketRate = require('../models/MarketRate');
const Product = require('../models/Product');
const DailyProcurement = require('../models/DailyProcurement');
const { protect, authorize } = require('../middleware/auth');
const { getISTTime } = require('../services/batchScheduler');

// @route   GET /api/supplier/quantity-summary
// @desc    Get consolidated quantities needed across all pending orders
// @access  Private (Admin, Staff)
router.get('/quantity-summary', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    // Get all pending/confirmed orders
    const orders = await Order.find({
      status: { $in: ['pending', 'confirmed'] }
    }).populate('products.product', 'name unit').lean();

    // Aggregate quantities by product
    const quantityMap = new Map();

    orders.forEach(order => {
      // Skip orders without customer reference
      if (!order.customer) return;

      order.products.forEach(item => {
        // Skip if product was deleted
        if (!item.product) return;

        // Safely get product ID
        const productId = item.product._id ? item.product._id.toString() : null;
        if (!productId) return;

        const productName = item.productName || item.product?.name || 'Unknown Product';
        const unit = item.unit || item.product?.unit || 'unit';

        // Safely get customer ID
        const customerId = typeof order.customer === 'object'
          ? order.customer._id?.toString()
          : order.customer?.toString();

        if (!customerId) return;

        if (quantityMap.has(productId)) {
          const existing = quantityMap.get(productId);
          existing.totalQuantity += item.quantity || 0;
          existing.orderCount += 1;
          existing.customers.add(customerId);
        } else {
          quantityMap.set(productId, {
            productId,
            productName,
            unit,
            totalQuantity: item.quantity || 0,
            orderCount: 1,
            customers: new Set([customerId])
          });
        }
      });
    });

    // Get market rates for these products
    const productIds = Array.from(quantityMap.keys());
    const latestRates = await MarketRate.aggregate([
      { $match: { product: { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) } } },
      { $sort: { effectiveDate: -1 } },
      {
        $group: {
          _id: '$product',
          latestRate: { $first: '$$ROOT' }
        }
      }
    ]);

    // Combine data with safe null checks
    const summary = Array.from(quantityMap.values()).map(item => {
      const rateInfo = latestRates.find(r => r._id?.toString() === item.productId);
      const latestRate = rateInfo?.latestRate;
      const rate = latestRate?.rate;

      return {
        productName: item.productName,
        totalQuantity: item.totalQuantity,
        unit: item.unit,
        orderCount: item.orderCount,
        customerCount: item.customers.size,
        marketRate: rate ?? null,
        trend: latestRate?.trend ?? null,
        estimatedValue: rate != null ? (item.totalQuantity * rate).toFixed(2) : null
      };
    });

    // Sort by total quantity (highest first)
    summary.sort((a, b) => b.totalQuantity - a.totalQuantity);

    res.json({
      success: true,
      count: summary.length,
      totalOrders: orders.length,
      data: summary
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/supplier/pending-orders
// @desc    Get all pending orders for fulfillment
// @access  Private (Admin, Staff)
router.get('/pending-orders', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const orders = await Order.find({
      status: { $in: ['pending', 'confirmed'] }
    })
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/supplier/daily-requirements
// @desc    Get procurement requirements for today
// @access  Private (Admin, Staff)
router.get('/daily-requirements', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    // Use IST for "today" calculation (consistent with batchScheduler)
    const ist = getISTTime();
    const today = ist.dateOnly;

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get orders created today
    const todayOrders = await Order.find({
      createdAt: { $gte: today, $lt: tomorrow },
      status: { $in: ['pending', 'confirmed'] }
    }).populate('products.product', 'name unit');

    // Aggregate quantities
    const requirements = new Map();

    todayOrders.forEach(order => {
      order.products.forEach(item => {
        // Safely get product name with fallback
        const key = item.productName || item.product?.name || 'Unknown Product';
        const qty = item.quantity || 0;

        if (requirements.has(key)) {
          requirements.set(key, requirements.get(key) + qty);
        } else {
          requirements.set(key, qty);
        }
      });
    });

    const data = Array.from(requirements.entries()).map(([product, quantity]) => ({
      product,
      quantity
    }));

    res.json({
      success: true,
      date: today.toISOString().split('T')[0],
      orderCount: todayOrders.length,
      data
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/supplier/batch-summary
// @desc    Get consolidated quantities grouped by batch for today
// @access  Private (Admin, Staff)
router.get('/batch-summary', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const ist = getISTTime();
    const today = ist.dateOnly;

    // Get today's batches
    const batches = await Batch.find({ date: today })
      .sort({ batchType: 1 })
      .lean();

    if (batches.length === 0) {
      return res.json({
        success: true,
        currentTime: new Date().toISOString(),  // Send actual UTC time, frontend converts to IST
        data: []
      });
    }

    // Fetch all orders for all batches in a single query (avoids N+1)
    const batchIds = batches.map(b => b._id);
    const allOrders = await Order.find({
      batch: { $in: batchIds },
      status: { $nin: ['cancelled'] }
    }).populate('products.product', 'name unit').lean();

    // Group orders by batch
    const ordersByBatch = new Map();
    batchIds.forEach(id => ordersByBatch.set(id.toString(), []));
    allOrders.forEach(order => {
      const batchId = order.batch.toString();
      if (ordersByBatch.has(batchId)) {
        ordersByBatch.get(batchId).push(order);
      }
    });

    // Build batch summaries from grouped orders
    const batchSummaries = batches.map(batch => {
      const orders = ordersByBatch.get(batch._id.toString()) || [];

      // Aggregate quantities by product
      const quantityMap = new Map();

      orders.forEach(order => {
        order.products.forEach(item => {
          const productId = item.product?._id?.toString() || item.product?.toString();
          if (!productId) return;

          const productName = item.productName || item.product?.name || 'Unknown Product';
          const unit = item.unit || item.product?.unit || 'unit';

          if (quantityMap.has(productId)) {
            const existing = quantityMap.get(productId);
            existing.totalQuantity += item.quantity || 0;
            existing.orderCount += 1;
          } else {
            quantityMap.set(productId, {
              productId,
              productName,
              unit,
              totalQuantity: item.quantity || 0,
              orderCount: 1
            });
          }
        });
      });

      // Convert to array and sort by quantity
      const products = Array.from(quantityMap.values())
        .sort((a, b) => b.totalQuantity - a.totalQuantity);

      return {
        batchNumber: batch.batchNumber,
        batchType: batch.batchType,
        status: batch.status,
        confirmedAt: batch.confirmedAt,
        orderCount: orders.length,
        products
      };
    });

    res.json({
      success: true,
      currentTime: new Date().toISOString(),  // Send actual UTC time, frontend converts to IST
      date: today.toISOString().split('T')[0],
      data: batchSummaries
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/supplier/procurement-summary
// @desc    Get procurement data structured for two-section purchase list (toProcure/procured)
// @access  Private (Admin, Staff)
router.get('/procurement-summary', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const ist = getISTTime();
    const today = ist.dateOnly;

    // After 12 PM IST, also include tomorrow's batches (orders placed now go to tomorrow)
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const datesToQuery = ist.hour >= 12 ? [today, tomorrow] : [today];

    // Get batches for relevant dates (today and possibly tomorrow)
    const batches = await Batch.find({ date: { $in: datesToQuery } }).sort({ date: 1, batchType: 1 }).lean();

    // Get all active products (all categories for procurement)
    const products = await Product.find({
      isActive: true
    }).select('_id name unit category');

    // Get latest market rates only for active products (avoids full collection scan)
    const productIds = products.map(p => p._id);
    const allLatestRates = await MarketRate.aggregate([
      { $match: { product: { $in: productIds } } },
      { $sort: { effectiveDate: -1 } },
      {
        $group: {
          _id: '$product',
          latestRate: { $first: '$$ROOT' }
        }
      }
    ]);

    // Build latest rate map
    const latestRateMap = new Map();
    allLatestRates.forEach(r => {
      latestRateMap.set(r._id.toString(), r.latestRate);
    });

    // Get today's EXPLICIT procurement records (separate from market rates)
    const todayProcurements = await DailyProcurement.find({ date: today });
    const procurementMap = new Map();
    todayProcurements.forEach(p => {
      procurementMap.set(p.product.toString(), {
        rate: p.rate,
        procuredAt: p.procuredAt,
        quantityAtProcurement: p.quantityAtProcurement
      });
    });

    // Get order quantities - aggregate ALL pending/confirmed orders from relevant batches
    // Simplified: just aggregate total quantities (no batch1/batch2 separation)
    const productQuantities = new Map();

    if (batches.length > 0) {
      const batchIds = batches.map(b => b._id);
      const allOrders = await Order.find({
        batch: { $in: batchIds },
        status: { $nin: ['cancelled'] }
      }).select('products batch').populate('products.product', 'name unit').lean();

      // Aggregate quantities across ALL batches
      allOrders.forEach(order => {
        order.products.forEach(item => {
          const productId = item.product?._id?.toString() || item.product?.toString();
          if (!productId) return;

          if (productQuantities.has(productId)) {
            productQuantities.get(productId).totalQuantity += item.quantity || 0;
            productQuantities.get(productId).orderCount += 1;
          } else {
            productQuantities.set(productId, {
              totalQuantity: item.quantity || 0,
              orderCount: 1
            });
          }
        });
      });
    }

    // Build procurement lists with simplified cumulative logic
    const toProcure = [];
    const procured = [];

    products.forEach(product => {
      const productId = product._id.toString();
      const qtyData = productQuantities.get(productId);
      const totalQty = qtyData?.totalQuantity || 0;
      const totalOrders = qtyData?.orderCount || 0;

      const latestRate = latestRateMap.get(productId);
      const currentRate = latestRate?.rate || 0;
      const trend = latestRate?.trend || 'stable';

      // Check explicit procurement status (NOT market rate)
      const todayProcurement = procurementMap.get(productId);
      const isProcuredToday = !!todayProcurement;

      const baseItem = {
        productId,
        productName: product.name,
        unit: product.unit,
        category: product.category,
        totalQty,
        totalOrders,
        currentRate,
        trend
      };

      if (isProcuredToday) {
        const procuredQty = todayProcurement.quantityAtProcurement;
        const newQty = totalQty - procuredQty;

        if (newQty > 0) {
          // New orders arrived after procurement → move to TO PROCURE
          toProcure.push({
            ...baseItem,
            procuredQty,      // What was already bought (cumulative)
            newQty,           // New quantity to buy
            wasProcured: true,
            lastRate: todayProcurement.rate  // Show previous rate for reference
          });
        } else {
          // Nothing new → stays in PROCURED
          procured.push({
            ...baseItem,
            procuredQty,
            rate: todayProcurement.rate,
            procuredAt: todayProcurement.procuredAt
          });
        }
      } else {
        // Never procured today - show in toProcure if there's quantity needed
        if (totalQty > 0) {
          toProcure.push({
            ...baseItem,
            procuredQty: 0,
            newQty: totalQty,
            wasProcured: false
          });
        }
      }
    });

    // Sort: by category (priority order), then by quantity descending, then by name
    const categoryPriority = ['Indian Vegetables', 'Exotic Vegetables', 'Fruits', 'Frozen', 'Dairy'];
    const sortFn = (a, b) => {
      // First by category priority
      const aPriority = categoryPriority.indexOf(a.category);
      const bPriority = categoryPriority.indexOf(b.category);
      const aIdx = aPriority === -1 ? 999 : aPriority;
      const bIdx = bPriority === -1 ? 999 : bPriority;
      if (aIdx !== bIdx) return aIdx - bIdx;

      // Then by total quantity descending
      if (b.totalQty !== a.totalQty) {
        return b.totalQty - a.totalQty;
      }
      // Then alphabetically by name
      return a.productName.localeCompare(b.productName);
    };

    toProcure.sort(sortFn);
    procured.sort(sortFn);

    // Get unique categories for filter (maintain priority order)
    const allCategories = [...new Set(products.map(p => p.category))];
    const categories = categoryPriority.filter(c => allCategories.includes(c))
      .concat(allCategories.filter(c => !categoryPriority.includes(c)).sort());

    res.json({
      success: true,
      currentTime: new Date().toISOString(),
      date: today.toISOString().split('T')[0],
      categories,
      toProcure,
      procured,
      summary: {
        toProcureCount: toProcure.length,
        procuredCount: procured.length,
        totalProducts: products.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/supplier/procure
// @desc    Mark a product as procured for today
// @access  Private (Admin, Staff)
router.post('/procure', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { productId, rate, quantity } = req.body;

    if (!productId || rate === undefined || rate === null) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and rate are required'
      });
    }

    // Validate rate is positive
    if (typeof rate !== 'number' || rate <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Rate must be a positive number'
      });
    }

    // Get product info
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const ist = getISTTime();
    const today = ist.dateOnly;

    // Mark as procured
    const procurement = await DailyProcurement.markProcured(
      productId,
      product.name,
      today,
      rate,
      quantity || 0,
      req.user._id
    );

    // Also update the market rate (so pricing is updated)
    await MarketRate.findOneAndUpdate(
      { product: productId },
      {
        product: productId,
        productName: product.name,
        rate: rate,
        effectiveDate: new Date(),
        $inc: { __v: 1 }
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: `${product.name} marked as procured at ₹${rate}`,
      data: procurement
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/supplier/procure/:productId
// @desc    Remove procurement status for a product (undo)
// @access  Private (Admin, Staff)
router.delete('/procure/:productId', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { productId } = req.params;

    const ist = getISTTime();
    const today = ist.dateOnly;

    const result = await DailyProcurement.removeProcurement(productId, today);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Procurement record not found'
      });
    }

    res.json({
      success: true,
      message: 'Procurement status removed',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
