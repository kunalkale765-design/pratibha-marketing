const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Batch = require('../models/Batch');
const MarketRate = require('../models/MarketRate');
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
    }).populate('products.product', 'name unit');

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
      .sort({ batchType: 1 });

    if (batches.length === 0) {
      return res.json({
        success: true,
        currentTime: new Date().toISOString(),  // Send actual UTC time, frontend converts to IST
        data: []
      });
    }

    // Get batch summaries with aggregated quantities
    const batchSummaries = await Promise.all(
      batches.map(async (batch) => {
        // Get all non-cancelled orders in this batch
        const orders = await Order.find({
          batch: batch._id,
          status: { $nin: ['cancelled'] }
        }).populate('products.product', 'name unit');

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
      })
    );

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

module.exports = router;
