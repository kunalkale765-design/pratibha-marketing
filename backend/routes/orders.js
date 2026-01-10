const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const MarketRate = require('../models/MarketRate');
const { protect, authorize } = require('../middleware/auth');

// Helper function to get current market rate for a product
async function getMarketRate(productId) {
  try {
    const rate = await MarketRate.findOne({ product: productId })
      .sort({ effectiveDate: -1 })
      .limit(1);
    return rate ? rate.rate : null;
  } catch (error) {
    console.error('Failed to get market rate for product:', productId, error.message);
    return null;
  }
}

// Helper function to calculate price based on customer's pricing type
// Uses pre-fetched market rate to avoid race conditions
// Returns { rate: number, usedFallback: boolean }
function calculatePriceWithRate(customer, product, prefetchedMarketRate, requestedRate = null) {
  // If rate is explicitly provided (staff creating order), use it
  if (requestedRate !== null && requestedRate !== undefined && requestedRate > 0) {
    return { rate: requestedRate, usedFallback: false };
  }

  const pricingType = customer.pricingType || 'market';
  const marketRate = prefetchedMarketRate || 0;

  switch (pricingType) {
    case 'contract':
      // Use fixed contract price if available
      const contractPrice = customer.contractPrices?.get(product._id.toString());
      if (contractPrice) {
        return { rate: contractPrice, usedFallback: false };
      }
      // Fall back to market rate if no contract price set - track this
      return { rate: marketRate, usedFallback: true };

    case 'markup':
      // Apply markup to market rate
      const markup = customer.markupPercentage || 0;
      return { rate: marketRate * (1 + markup / 100), usedFallback: false };

    case 'market':
    default:
      // Use current market rate
      return { rate: marketRate, usedFallback: false };
  }
}

// Legacy async function for customer-edit endpoint (single product updates)
async function calculatePrice(customer, product, requestedRate = null) {
  // If rate is explicitly provided (staff creating order), use it
  if (requestedRate !== null && requestedRate !== undefined && requestedRate > 0) {
    return requestedRate;
  }

  const pricingType = customer.pricingType || 'market';

  switch (pricingType) {
    case 'contract':
      // Use fixed contract price if available
      const contractPrice = customer.contractPrices?.get(product._id.toString());
      if (contractPrice) {
        return contractPrice;
      }
      // Fall back to market rate if no contract price set
      return await getMarketRate(product._id) || 0;

    case 'markup':
      // Get market rate and apply markup
      const marketRate = await getMarketRate(product._id) || 0;
      const markup = customer.markupPercentage || 0;
      return marketRate * (1 + markup / 100);

    case 'market':
    default:
      // Use current market rate
      const currentRate = await getMarketRate(product._id);
      return currentRate || 0;
  }
}

// Validation middleware
const validateOrder = [
  body('customer').notEmpty().withMessage('Customer is required'),
  body('products').isArray({ min: 1 }).withMessage('At least one product is required'),
  body('products.*.product').notEmpty().withMessage('Product ID is required'),
  body('products.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
  // Rate is optional - will be calculated based on customer pricing type if not provided
  body('products.*.rate').optional().isFloat({ min: 0 }).withMessage('Rate must be positive')
];

// @route   GET /api/orders
// @desc    Get all orders (filtered for customers to see only their own)
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const { status, customer, startDate, endDate, limit: rawLimit } = req.query;
    // Validate and cap limit to prevent DoS (min 1, max 1000, default 50)
    const limit = Math.min(Math.max(parseInt(rawLimit) || 50, 1), 1000);
    const filter = {};

    // SECURITY: Customers can only see their own orders
    if (req.user.role === 'customer') {
      if (!req.user.customer) {
        return res.status(403).json({
          success: false,
          message: 'Customer account not properly linked'
        });
      }
      const customerId = typeof req.user.customer === 'object'
        ? req.user.customer._id
        : req.user.customer;
      filter.customer = customerId;
    } else {
      // Staff/admin can filter by customer if specified
      if (customer) {
        filter.customer = customer;
      }
    }

    if (status) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const parsedStart = new Date(startDate);
        if (isNaN(parsedStart.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid startDate format' });
        }
        filter.createdAt.$gte = parsedStart;
      }
      if (endDate) {
        const parsedEnd = new Date(endDate);
        if (isNaN(parsedEnd.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid endDate format' });
        }
        filter.createdAt.$lte = parsedEnd;
      }
      // Validate date range: endDate should be >= startDate
      if (startDate && endDate && filter.createdAt.$gte > filter.createdAt.$lte) {
        return res.status(400).json({ success: false, message: 'endDate must be greater than or equal to startDate' });
      }
    }

    const orders = await Order.find(filter)
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit')
      .select('-__v')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer')
      .populate('products.product')
      .select('-__v');

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // SECURITY: Customers can only view their own orders
    if (req.user.role === 'customer') {
      const userCustomerId = typeof req.user.customer === 'object'
        ? req.user.customer._id.toString()
        : req.user.customer?.toString();
      const orderCustomerId = typeof order.customer === 'object'
        ? order.customer._id.toString()
        : order.customer.toString();

      if (userCustomerId !== orderCustomerId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own orders.'
        });
      }
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/orders/customer/:customerId
// @desc    Get orders by customer
// @access  Private
router.get('/customer/:customerId', protect, async (req, res, next) => {
  try {
    // SECURITY: Customers can only view their own orders
    if (req.user.role === 'customer') {
      const userCustomerId = typeof req.user.customer === 'object'
        ? req.user.customer._id.toString()
        : req.user.customer?.toString();

      if (userCustomerId !== req.params.customerId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own orders.'
        });
      }
    }

    const orders = await Order.find({ customer: req.params.customerId })
      .populate('products.product', 'name unit')
      .select('-__v')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/orders
// @desc    Create new order
// @access  Private (All authenticated users - customers can create orders)
router.post('/', protect, validateOrder, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // Verify customer exists and is active
    const customer = await Customer.findById(req.body.customer);
    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }
    if (!customer.isActive) {
      res.status(400);
      throw new Error('Cannot create order for inactive customer');
    }

    // Pre-fetch all products and market rates to avoid race conditions
    // This ensures consistent pricing across all products in one order
    const productIds = req.body.products.map(item => item.product);
    const [products, marketRates] = await Promise.all([
      Product.find({ _id: { $in: productIds } }),
      MarketRate.find({ product: { $in: productIds } }).sort({ effectiveDate: -1 })
    ]);

    // Create lookup maps for O(1) access
    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    const rateMap = new Map();
    // Get latest rate for each product (rates are sorted by effectiveDate desc)
    for (const rate of marketRates) {
      const productId = rate.product.toString();
      if (!rateMap.has(productId)) {
        rateMap.set(productId, rate.rate);
      }
    }

    // Calculate amounts and populate product names
    // Price is calculated based on customer's pricing type if not provided
    let totalAmount = 0;
    let usedPricingFallback = false;
    const processedProducts = [];

    for (const item of req.body.products) {
      const product = productMap.get(item.product);
      if (!product) {
        res.status(404);
        throw new Error(`Product ${item.product} not found`);
      }
      if (!product.isActive) {
        res.status(400);
        throw new Error(`Product "${product.name}" is no longer available`);
      }

      // Calculate rate based on customer's pricing type
      // Pass the pre-fetched market rate to avoid race conditions
      const priceResult = calculatePriceWithRate(customer, product, rateMap.get(product._id.toString()), item.rate);
      const amount = item.quantity * priceResult.rate;
      totalAmount += amount;

      if (priceResult.usedFallback) {
        usedPricingFallback = true;
      }

      processedProducts.push({
        product: item.product,
        productName: product.name,
        quantity: item.quantity,
        unit: product.unit,
        rate: priceResult.rate,
        amount: amount
      });
    }

    // Create order
    const order = await Order.create({
      customer: req.body.customer,
      products: processedProducts,
      totalAmount: totalAmount,
      deliveryAddress: req.body.deliveryAddress,
      notes: req.body.notes,
      usedPricingFallback: usedPricingFallback
    });

    // Update customer credit for unpaid orders
    try {
      customer.currentCredit += totalAmount;
      await customer.save();
    } catch (creditError) {
      // Log but don't fail the order - credit can be reconciled later
      console.error('Failed to update customer credit after order creation:', creditError.message);
    }

    // Populate and return
    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit');

    // Build response with warning if contract pricing fallback was used
    const response = {
      success: true,
      data: populatedOrder
    };

    if (usedPricingFallback) {
      response.warning = 'Some products used market rate fallback because contract prices were not set';
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:id
// @desc    Update order products/prices
// @access  Private (Admin, Staff)
router.put('/:id', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // Update products with new prices
    if (req.body.products && Array.isArray(req.body.products)) {
      let totalAmount = 0;
      const updatedProducts = await Promise.all(
        req.body.products.map(async (item) => {
          const product = await Product.findById(item.product);
          if (!product) {
            throw new Error(`Product ${item.product} not found`);
          }

          const rate = item.priceAtTime || item.rate || 0;
          const amount = item.quantity * rate;
          totalAmount += amount;

          return {
            product: item.product,
            productName: product.name,
            quantity: item.quantity,
            unit: product.unit,
            rate: rate,
            amount: amount
          };
        })
      );

      order.products = updatedProducts;
      order.totalAmount = totalAmount;
    }

    // Update notes if provided
    if (req.body.notes !== undefined) {
      order.notes = req.body.notes;
    }

    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit');

    res.json({
      success: true,
      data: populatedOrder
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:id/customer-edit
// @desc    Update order products/quantities (customer can edit their own pending orders)
// @access  Private (Customers can edit own pending orders, Admin/Staff can edit any pending order)
router.put('/:id/customer-edit', protect, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer');

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // SECURITY: Customers can only edit their own orders
    if (req.user.role === 'customer') {
      const userCustomerId = typeof req.user.customer === 'object'
        ? req.user.customer._id.toString()
        : req.user.customer?.toString();
      const orderCustomerId = typeof order.customer === 'object'
        ? order.customer._id.toString()
        : order.customer.toString();

      if (userCustomerId !== orderCustomerId) {
        return res.status(403).json({
          success: false,
          message: 'You can only edit your own orders'
        });
      }
    }

    // SECURITY: Only pending orders can be edited
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending orders can be edited'
      });
    }

    // Validate products array
    if (!req.body.products || !Array.isArray(req.body.products) || req.body.products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product is required'
      });
    }

    // Get customer for pricing calculation
    const customer = await Customer.findById(order.customer._id || order.customer);
    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    // Update products with recalculated prices
    let totalAmount = 0;
    const updatedProducts = await Promise.all(
      req.body.products.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) {
          throw new Error(`Product ${item.product} not found`);
        }

        if (!item.quantity || item.quantity <= 0) {
          throw new Error('Quantity must be greater than 0');
        }

        // Recalculate rate based on customer's pricing type (never trust client prices)
        const rate = await calculatePrice(customer, product);
        const amount = item.quantity * rate;
        totalAmount += amount;

        return {
          product: item.product,
          productName: product.name,
          quantity: item.quantity,
          unit: product.unit,
          rate: rate,
          amount: amount
        };
      })
    );

    order.products = updatedProducts;
    order.totalAmount = totalAmount;

    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit');

    res.json({
      success: true,
      data: populatedOrder
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status
// @access  Private (Admin, Staff)
router.put('/:id/status', protect, authorize('admin', 'staff'), [
  body('status').isIn(['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid status')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const updateData = { status: req.body.status };

    // Update timestamps based on status
    if (req.body.status === 'packed') {
      updateData.packedAt = new Date();
      updateData.assignedWorker = req.body.assignedWorker;
    } else if (req.body.status === 'shipped') {
      updateData.shippedAt = new Date();
    } else if (req.body.status === 'delivered') {
      updateData.deliveredAt = new Date();
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('customer', 'name phone');

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:id/payment
// @desc    Update order payment
// @access  Private (Admin, Staff)
router.put('/:id/payment', protect, authorize('admin', 'staff'), [
  body('paidAmount').isFloat({ min: 0 }).withMessage('Paid amount must be positive')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // Calculate credit adjustment (difference between old and new paid amount)
    const oldPaidAmount = order.paidAmount || 0;
    const newPaidAmount = req.body.paidAmount;
    const creditAdjustment = newPaidAmount - oldPaidAmount;

    order.paidAmount = newPaidAmount;

    // Update payment status
    if (order.paidAmount >= order.totalAmount) {
      order.paymentStatus = 'paid';
    } else if (order.paidAmount > 0) {
      order.paymentStatus = 'partial';
    } else {
      order.paymentStatus = 'unpaid';
    }

    await order.save();

    // Update customer credit (reduce by payment amount)
    if (creditAdjustment !== 0 && order.status !== 'cancelled') {
      try {
        const customer = await Customer.findById(order.customer);
        if (customer) {
          // Positive adjustment = more paid = reduce credit
          // Negative adjustment = less paid = increase credit
          customer.currentCredit = Math.max(0, customer.currentCredit - creditAdjustment);
          await customer.save();
        }
      } catch (creditError) {
        console.error('Failed to update customer credit after payment:', creditError.message);
        // Continue - payment was recorded, credit can be reconciled manually
      }
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/orders/:id
// @desc    Cancel order
// @access  Private (Admin, Staff)
router.delete('/:id', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // Don't allow cancelling already cancelled orders
    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Order is already cancelled'
      });
    }

    // Calculate unpaid amount to restore to customer credit
    const unpaidAmount = order.totalAmount - (order.paidAmount || 0);

    // Update order status
    order.status = 'cancelled';
    order.cancelledBy = req.user._id;
    order.cancelledAt = new Date();
    await order.save();

    // Restore customer credit for unpaid portion
    if (unpaidAmount > 0) {
      try {
        const customer = await Customer.findById(order.customer);
        if (customer) {
          customer.currentCredit = Math.max(0, customer.currentCredit - unpaidAmount);
          await customer.save();
        }
      } catch (creditError) {
        console.error('Failed to restore customer credit on order cancellation:', creditError.message);
        // Continue - order is cancelled, credit can be reconciled manually
      }
    }

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
