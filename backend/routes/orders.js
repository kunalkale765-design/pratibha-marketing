const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
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
// Returns { rate: number, usedFallback: boolean, isContractPrice: boolean, saveAsContractPrice: boolean }
function calculatePriceWithRate(customer, product, prefetchedMarketRate, requestedRate = null) {
  const pricingType = customer.pricingType || 'market';
  const marketRate = prefetchedMarketRate || 0;
  const productId = product._id.toString();

  // For contract customers, contract prices are LOCKED
  if (pricingType === 'contract') {
    const existingContractPrice = customer.contractPrices?.get(productId);

    if (existingContractPrice !== undefined && existingContractPrice !== null) {
      // Contract price exists - ALWAYS use it (ignore any staff-provided rate)
      return {
        rate: existingContractPrice,
        usedFallback: false,
        isContractPrice: true,
        saveAsContractPrice: false
      };
    }

    // No contract price exists for this product
    if (requestedRate !== null && requestedRate !== undefined && requestedRate > 0) {
      // Staff provided a rate - use it and mark for saving as new contract price
      return {
        rate: requestedRate,
        usedFallback: false,
        isContractPrice: true, // Will become contract price
        saveAsContractPrice: true // Flag to save this as new contract price
      };
    }

    // No contract price and no staff rate - fall back to market rate
    return {
      rate: marketRate,
      usedFallback: true,
      isContractPrice: false,
      saveAsContractPrice: false
    };
  }

  // For non-contract customers (market/markup), use staff rate if provided
  if (requestedRate !== null && requestedRate !== undefined && requestedRate > 0) {
    return {
      rate: requestedRate,
      usedFallback: false,
      isContractPrice: false,
      saveAsContractPrice: false
    };
  }

  // Calculate based on pricing type
  if (pricingType === 'markup') {
    const markup = customer.markupPercentage || 0;
    return {
      rate: marketRate * (1 + markup / 100),
      usedFallback: false,
      isContractPrice: false,
      saveAsContractPrice: false
    };
  }

  // Market pricing (default)
  return {
    rate: marketRate,
    usedFallback: false,
    isContractPrice: false,
    saveAsContractPrice: false
  };
}

// Legacy async function for customer-edit endpoint (single product updates)
// Returns { rate: number, isContractPrice: boolean }
async function calculatePrice(customer, product, requestedRate = null) {
  const pricingType = customer.pricingType || 'market';
  const productId = product._id.toString();

  // For contract customers
  if (pricingType === 'contract') {
    const existingContractPrice = customer.contractPrices?.get(productId);
    if (existingContractPrice !== undefined && existingContractPrice !== null) {
      // Contract price exists - always use it (locked)
      return { rate: existingContractPrice, isContractPrice: true };
    }
    // No contract price - fall back to market rate
    const fallbackRate = await getMarketRate(product._id) || 0;
    return { rate: fallbackRate, isContractPrice: false };
  }

  // For non-contract customers, use staff rate if provided
  if (requestedRate !== null && requestedRate !== undefined && requestedRate > 0) {
    return { rate: requestedRate, isContractPrice: false };
  }

  // Calculate based on pricing type
  if (pricingType === 'markup') {
    const marketRate = await getMarketRate(product._id) || 0;
    const markup = customer.markupPercentage || 0;
    return { rate: marketRate * (1 + markup / 100), isContractPrice: false };
  }

  // Market pricing (default)
  const currentRate = await getMarketRate(product._id);
  return { rate: currentRate || 0, isContractPrice: false };
}

// Validation middleware
const validateOrder = [
  body('customer').notEmpty().withMessage('Customer is required'),
  body('products').isArray({ min: 1 }).withMessage('At least one product is required'),
  body('products.*.product').notEmpty().withMessage('Product ID is required'),
  // Quantity: min 0.01, max 1,000,000 (reasonable upper limit to prevent abuse)
  body('products.*.quantity')
    .isFloat({ min: 0.01, max: 1000000 })
    .withMessage('Quantity must be between 0.01 and 1,000,000'),
  // Rate is optional - will be calculated based on customer pricing type if not provided
  // Max rate: 10,000,000 (reasonable upper limit), max 2 decimal precision enforced in business logic
  body('products.*.rate')
    .optional()
    .isFloat({ min: 0, max: 10000000 })
    .withMessage('Rate must be between 0 and 10,000,000'),
  // Delivery address validation
  body('deliveryAddress')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Delivery address must be 500 characters or less'),
  // Notes validation
  body('notes')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Notes must be 1000 characters or less'),
  // Idempotency key for preventing duplicate orders on network failures
  body('idempotencyKey')
    .optional()
    .isString()
    .isLength({ max: 64 })
    .withMessage('Idempotency key must be a string up to 64 characters')
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
router.get('/:id',
  protect,
  param('id').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

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

    // Check for idempotency key to prevent duplicate orders
    const idempotencyKey = req.body.idempotencyKey;
    if (idempotencyKey) {
      const existingOrder = await Order.findOne({ idempotencyKey })
        .populate('customer', 'name phone')
        .populate('products.product', 'name unit');

      if (existingOrder) {
        // Return the existing order (idempotent response)
        return res.status(200).json({
          success: true,
          data: existingOrder,
          idempotent: true,
          message: 'Order already exists (idempotent response)'
        });
      }
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

    // SECURITY: Customers can only create orders for themselves
    if (req.user.role === 'customer') {
      const userCustomerId = typeof req.user.customer === 'object'
        ? req.user.customer._id.toString()
        : req.user.customer?.toString();

      if (userCustomerId !== req.body.customer.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only create orders for yourself'
        });
      }
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
    const newContractPrices = []; // Track new contract prices to save

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

      // Validate quantity precision based on unit type
      // "piece" requires whole numbers, other units allow decimals
      if (product.unit === 'piece' && !Number.isInteger(item.quantity)) {
        res.status(400);
        throw new Error(`Product "${product.name}" is sold by piece and requires a whole number quantity (got ${item.quantity})`);
      }

      // Calculate rate based on customer's pricing type
      // Pass the pre-fetched market rate to avoid race conditions
      const priceResult = calculatePriceWithRate(customer, product, rateMap.get(product._id.toString()), item.rate);
      const amount = item.quantity * priceResult.rate;
      totalAmount += amount;

      if (priceResult.usedFallback) {
        usedPricingFallback = true;
      }

      // Track new contract prices to save
      if (priceResult.saveAsContractPrice) {
        newContractPrices.push({
          productId: product._id.toString(),
          productName: product.name,
          rate: priceResult.rate
        });
      }

      processedProducts.push({
        product: item.product,
        productName: product.name,
        quantity: item.quantity,
        unit: product.unit,
        rate: priceResult.rate,
        amount: amount,
        isContractPrice: priceResult.isContractPrice
      });
    }

    // Save new contract prices to customer if any
    if (newContractPrices.length > 0) {
      try {
        // Re-fetch customer to avoid race condition where pricingType changed
        // between initial fetch and now
        const freshCustomer = await Customer.findById(req.body.customer);
        if (freshCustomer && freshCustomer.pricingType === 'contract') {
          if (!freshCustomer.contractPrices) {
            freshCustomer.contractPrices = new Map();
          }
          for (const cp of newContractPrices) {
            freshCustomer.contractPrices.set(cp.productId, cp.rate);
          }
          await freshCustomer.save();
        } else {
          // Customer's pricing type changed - don't save contract prices
          console.warn(`Skipping contract price save: customer ${req.body.customer} is no longer contract pricing type`);
          // Clear the newContractPrices so response doesn't claim they were saved
          newContractPrices.length = 0;
        }
      } catch (contractError) {
        console.error('Failed to save new contract prices:', contractError.message);
        // Continue - order can still be created, contract prices can be added manually
      }
    }

    // Create order (include idempotencyKey if provided)
    const orderData = {
      customer: req.body.customer,
      products: processedProducts,
      totalAmount: totalAmount,
      deliveryAddress: req.body.deliveryAddress,
      notes: req.body.notes,
      usedPricingFallback: usedPricingFallback
    };

    if (idempotencyKey) {
      orderData.idempotencyKey = idempotencyKey;
    }

    const order = await Order.create(orderData);

    // Populate and return
    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit');

    // Build response with warnings/info
    const response = {
      success: true,
      data: populatedOrder
    };

    if (usedPricingFallback) {
      response.warning = 'Some products used market rate fallback because contract prices were not set';
    }

    // Include info about new contract prices saved
    if (newContractPrices.length > 0) {
      response.newContractPrices = newContractPrices.map(cp => ({
        productName: cp.productName,
        rate: cp.rate
      }));
      response.message = `New contract prices saved for: ${newContractPrices.map(cp => cp.productName).join(', ')}`;
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:id
// @desc    Update order prices only (products and quantities cannot be changed)
// @access  Private (Admin, Staff)
router.put('/:id',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // Update product prices only - quantities and products cannot be changed
    if (req.body.products && Array.isArray(req.body.products)) {
      // Build a map of original order products for validation
      const originalProductMap = new Map();
      for (const p of order.products) {
        const productId = p.product.toString();
        originalProductMap.set(productId, {
          quantity: p.quantity,
          productName: p.productName,
          unit: p.unit,
          rate: p.rate,
          isContractPrice: p.isContractPrice || false
        });
      }

      // Validate that request products match original order exactly
      if (req.body.products.length !== order.products.length) {
        return res.status(400).json({
          success: false,
          message: 'Cannot add or remove products. Only prices can be updated.'
        });
      }

      // Validate each product in request exists in original order with same quantity
      for (const item of req.body.products) {
        const productId = item.product?.toString();
        const original = originalProductMap.get(productId);

        if (!original) {
          return res.status(400).json({
            success: false,
            message: `Product ${productId} is not in this order. Only prices can be updated.`
          });
        }

        if (item.quantity !== original.quantity) {
          return res.status(400).json({
            success: false,
            message: `Quantity for product "${original.productName}" cannot be changed. Only prices can be updated.`
          });
        }

        // For contract customers: prevent modification of contract prices
        const requestedRate = item.priceAtTime || item.rate;
        if (original.isContractPrice && requestedRate !== undefined && requestedRate !== original.rate) {
          return res.status(400).json({
            success: false,
            message: `Contract price for "${original.productName}" cannot be changed. Edit contract prices in customer management.`
          });
        }
      }

      // All validations passed - update prices only
      let totalAmount = 0;
      const updatedProducts = [];

      for (const item of req.body.products) {
        const productId = item.product.toString();
        const original = originalProductMap.get(productId);

        // Use original rate for contract prices, otherwise use provided rate
        let rate;
        if (original.isContractPrice) {
          rate = original.rate; // Contract prices are locked
        } else {
          rate = item.priceAtTime || item.rate || original.rate || 0;
        }

        if (rate < 0) {
          return res.status(400).json({
            success: false,
            message: `Rate for product "${original.productName}" cannot be negative.`
          });
        }

        const amount = original.quantity * rate;
        totalAmount += amount;

        updatedProducts.push({
          product: item.product,
          productName: original.productName,
          quantity: original.quantity,
          unit: original.unit,
          rate: rate,
          amount: amount,
          isContractPrice: original.isContractPrice
        });
      }

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
router.put('/:id/customer-edit',
  protect,
  param('id').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

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
        const priceResult = await calculatePrice(customer, product);
        const amount = item.quantity * priceResult.rate;
        totalAmount += amount;

        return {
          product: item.product,
          productName: product.name,
          quantity: item.quantity,
          unit: product.unit,
          rate: priceResult.rate,
          amount: amount,
          isContractPrice: priceResult.isContractPrice
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

// Valid status transitions (state machine)
// Flow: pending → confirmed → processing → packed → shipped → delivered
// Cancellation: any status except 'delivered' can go to 'cancelled'
const VALID_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [], // Terminal state - no transitions allowed
  cancelled: []  // Terminal state - no transitions allowed
};

// @route   PUT /api/orders/:id/status
// @desc    Update order status (enforces valid state transitions)
// @access  Private (Admin, Staff)
router.put('/:id/status', protect, authorize('admin', 'staff'), [
  param('id').isMongoId().withMessage('Invalid order ID'),
  body('status').isIn(['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled'])
    .withMessage('Invalid status'),
  body('assignedWorker')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Assigned worker name must be 100 characters or less')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // First, fetch the current order to validate state transition
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    const currentStatus = order.status;
    const newStatus = req.body.status;

    // Check if this is a valid transition
    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      // Allow setting same status (no-op)
      if (currentStatus === newStatus) {
        return res.json({
          success: true,
          data: order,
          message: 'Status unchanged'
        });
      }

      return res.status(400).json({
        success: false,
        message: `Invalid status transition: cannot change from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : 'none (terminal state)'}`
      });
    }

    const updateData = { status: newStatus };
    const now = new Date();

    // Update timestamps based on status with validation
    if (newStatus === 'packed') {
      updateData.packedAt = now;
      // Validate and sanitize assignedWorker
      if (req.body.assignedWorker) {
        updateData.assignedWorker = req.body.assignedWorker.trim();
      }
    } else if (newStatus === 'shipped') {
      // Ensure shipped is after packed
      if (order.packedAt && now < order.packedAt) {
        return res.status(400).json({
          success: false,
          message: 'Shipped time cannot be before packed time'
        });
      }
      updateData.shippedAt = now;
    } else if (newStatus === 'delivered') {
      // Ensure delivered is after shipped (and packed)
      if (order.shippedAt && now < order.shippedAt) {
        return res.status(400).json({
          success: false,
          message: 'Delivered time cannot be before shipped time'
        });
      }
      updateData.deliveredAt = now;
    } else if (newStatus === 'cancelled') {
      updateData.cancelledAt = now;
      updateData.cancelledBy = req.user._id;
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('customer', 'name phone');

    res.json({
      success: true,
      data: updatedOrder
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/orders/:id/payment
// @desc    Update order payment
// @access  Private (Admin, Staff)
router.put('/:id/payment', protect, authorize('admin', 'staff'), [
  param('id').isMongoId().withMessage('Invalid order ID'),
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

    // Validate payment amount does not exceed order total
    // Round to 2 decimal places to avoid floating point comparison issues
    const newPaidAmount = Math.round(req.body.paidAmount * 100) / 100;
    const orderTotal = Math.round(order.totalAmount * 100) / 100;

    // Use integer comparison to avoid floating point precision issues
    if (Math.round(newPaidAmount * 100) > Math.round(orderTotal * 100)) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (₹${newPaidAmount.toFixed(2)}) cannot exceed order total (₹${orderTotal.toFixed(2)})`
      });
    }

    order.paidAmount = newPaidAmount;

    // Update payment status using integer comparison for precision
    const paidCents = Math.round(order.paidAmount * 100);
    const totalCents = Math.round(order.totalAmount * 100);

    if (paidCents >= totalCents) {
      order.paymentStatus = 'paid';
    } else if (paidCents > 0) {
      order.paymentStatus = 'partial';
    } else {
      order.paymentStatus = 'unpaid';
    }

    await order.save();

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
router.delete('/:id',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

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

    // Update order status
    order.status = 'cancelled';
    order.cancelledBy = req.user._id;
    order.cancelledAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
