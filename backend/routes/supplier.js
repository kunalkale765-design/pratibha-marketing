const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const MarketRate = require('../models/MarketRate');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/supplier/quantity-summary
// @desc    Get consolidated quantities needed across all pending orders
// @access  Private (Admin, Staff)
router.get('/quantity-summary', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    // Get all pending/confirmed orders
    const orders = await Order.find({
      status: { $in: ['pending', 'confirmed', 'processing'] }
    }).populate('products.product', 'name unit');

    // Aggregate quantities by product
    const quantityMap = new Map();

    orders.forEach(order => {
      order.products.forEach(item => {
        // Skip if product was deleted
        if (!item.product) return;
        const productId = item.product._id.toString();
        const productName = item.productName || item.product.name;
        const unit = item.unit || item.product.unit;

        if (quantityMap.has(productId)) {
          const existing = quantityMap.get(productId);
          existing.totalQuantity += item.quantity;
          existing.orderCount += 1;
          existing.customers.add(order.customer.toString());
        } else {
          quantityMap.set(productId, {
            productId,
            productName,
            unit,
            totalQuantity: item.quantity,
            orderCount: 1,
            customers: new Set([order.customer.toString()])
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

    // Combine data
    const summary = Array.from(quantityMap.values()).map(item => {
      const rateInfo = latestRates.find(r => r._id.toString() === item.productId);
      return {
        productName: item.productName,
        totalQuantity: item.totalQuantity,
        unit: item.unit,
        orderCount: item.orderCount,
        customerCount: item.customers.size,
        marketRate: rateInfo ? rateInfo.latestRate.rate : null,
        trend: rateInfo ? rateInfo.latestRate.trend : null,
        estimatedValue: rateInfo ? (item.totalQuantity * rateInfo.latestRate.rate).toFixed(2) : null
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
      status: { $in: ['pending', 'confirmed', 'processing'] }
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
        const key = item.productName || item.product.name;
        if (requirements.has(key)) {
          requirements.set(key, requirements.get(key) + item.quantity);
        } else {
          requirements.set(key, item.quantity);
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

module.exports = router;
