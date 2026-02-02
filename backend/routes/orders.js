const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Batch = require('../models/Batch');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const MarketRate = require('../models/MarketRate');
const { protect, authorize } = require('../middleware/auth');
const { calculatePriceWithRate } = require('../services/pricingService');
const { logAudit } = require('../utils/auditLog');
const { createOrder } = require('../services/orderService');
const {
  roundTo2Decimals,
  getCustomerId,
  handleValidationErrors,
  buildDateRangeFilter,
  parsePagination,
  userOwnsOrder
} = require('../utils/helpers');

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
  // Min rate: 0.01 to prevent accidental free orders
  // Max rate: 10,000,000 (reasonable upper limit), max 2 decimal precision enforced in business logic
  body('products.*.rate')
    .optional()
    .isFloat({ min: 0.01, max: 10000000 })
    .withMessage('Rate must be between ₹0.01 and ₹1,00,00,000'),
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
    const { status, customer, startDate, endDate } = req.query;
    const { limit } = parsePagination(req.query, { limit: 50, maxLimit: 1000 });
    const filter = {};

    // SECURITY: Customers can only see their own orders
    if (req.user.role === 'customer') {
      const customerId = getCustomerId(req.user);
      if (!customerId) {
        return res.status(403).json({
          success: false,
          message: 'Customer account not properly linked'
        });
      }
      filter.customer = customerId;
    } else if (customer) {
      // Staff/admin can filter by customer if specified
      filter.customer = customer;
    }

    if (status) {
      filter.status = status;
    }

    // Build date range filter using shared helper
    const { filter: dateFilter, error: dateError } = buildDateRangeFilter(startDate, endDate, { endOfDay: false });
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }
    if (dateFilter) {
      filter.createdAt = dateFilter;
    }

    const orders = await Order.find(filter)
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit')
      .populate('batch', 'batchNumber batchType status')
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
      if (handleValidationErrors(req, res)) return;

      const order = await Order.findById(req.params.id)
        .populate('customer')
        .populate('products.product')
        .populate('batch', 'batchNumber batchType status confirmedAt')
        .select('-__v');

      if (!order) {
        res.status(404);
        throw new Error('Order not found');
      }

      // SECURITY: Customers can only view their own orders
      if (req.user.role === 'customer' && !userOwnsOrder(req.user, order)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own orders.'
        });
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
router.get('/customer/:customerId',
  protect,
  param('customerId').isMongoId().withMessage('Invalid customer ID'),
  async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    // SECURITY: Customers can only view their own orders
    if (req.user.role === 'customer') {
      const userCustomerId = getCustomerId(req.user);
      if (userCustomerId !== req.params.customerId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own orders.'
        });
      }
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find({ customer: req.params.customerId })
        .populate('products.product', 'name unit')
        .select('-__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ customer: req.params.customerId })
    ]);

    res.json({
      success: true,
      count: orders.length,
      total,
      page,
      pages: Math.ceil(total / limit),
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
    if (handleValidationErrors(req, res)) return;

    const result = await createOrder({
      customerId: req.body.customer,
      products: req.body.products,
      deliveryAddress: req.body.deliveryAddress,
      notes: req.body.notes,
      idempotencyKey: req.body.idempotencyKey,
      user: req.user
    });

    if (result.idempotent) {
      return res.status(200).json({
        success: true,
        data: result.order,
        idempotent: true,
        message: 'Order already exists (idempotent response)'
      });
    }

    const response = { success: true, data: result.order };

    if (result.warnings.length > 0) {
      response.warning = result.warnings.join('. ');
    }

    if (result.newContractPrices.length > 0) {
      response.newContractPrices = result.newContractPrices.map(cp => ({
        productName: cp.productName,
        rate: cp.rate
      }));
      response.message = `New contract prices saved for: ${result.newContractPrices.map(cp => cp.productName).join(', ')}`;
    }

    res.status(201).json(response);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
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
        return res.status(400).json({ success: false, message: errors.array().map(e => e.msg).join(', ') });
      }

      const order = await Order.findById(req.params.id);

      if (!order) {
        res.status(404);
        throw new Error('Order not found');
      }

      // Prevent modifications to reconciled/delivered orders
      if (order.reconciliation && order.reconciliation.completedAt) {
        return res.status(403).json({
          success: false,
          message: 'Cannot modify a reconciled order. Ledger entries have already been created.'
        });
      }

      // Update products - staff can add, remove, and modify prices/quantities
      if (req.body.products && Array.isArray(req.body.products)) {
        // Get customer for pricing calculation (needed for new products)
        const customer = await Customer.findById(order.customer);
        if (!customer) {
          return res.status(404).json({ success: false, message: 'Customer not found' });
        }

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

        // Batch fetch new products and their market rates to avoid N+1 queries
        const newProductIds = req.body.products
          .filter(item => !originalProductMap.has(item.product?.toString()))
          .map(item => item.product);

        // Batch fetch new products and market rates (empty arrays if no new products)
        const [newProducts, newMarketRates] = newProductIds.length > 0
          ? await Promise.all([
              Product.find({ _id: { $in: newProductIds } }),
              MarketRate.find({ product: { $in: newProductIds } }).sort({ effectiveDate: -1 })
            ])
          : [[], []];

        const newProductMap = new Map(newProducts.map(p => [p._id.toString(), p]));
        const newMarketRateMap = new Map();
        newMarketRates.forEach(mr => {
          const pid = mr.product.toString();
          if (!newMarketRateMap.has(pid)) {
            newMarketRateMap.set(pid, mr.rate); // First is latest due to sort
          }
        });

        // All validations passed - update prices and/or quantities
        let totalAmount = 0;
        const updatedProducts = [];
        const auditChanges = []; // Track changes for audit log

        for (const item of req.body.products) {
          const productId = item.product?.toString();
          const original = originalProductMap.get(productId);

          // Handle NEW product (not in original order)
          if (!original) {
            // Get product from pre-fetched map
            const product = newProductMap.get(productId);
            if (!product) {
              return res.status(400).json({
                success: false,
                message: `Product ${productId} not found`
              });
            }

            // Validate quantity
            const quantity = item.quantity || 1;
            if (quantity < 0) {
              return res.status(400).json({
                success: false,
                message: `Quantity for "${product.name}" cannot be negative.`
              });
            }
            if (quantity > 0 && quantity < 0.01) {
              return res.status(400).json({
                success: false,
                message: `Minimum quantity for "${product.name}" is 0.01 ${product.unit}`
              });
            }
            if (quantity === 0) continue; // Skip if quantity is 0

            // Calculate price using pre-fetched market rate (avoids N+1)
            const requestedRate = item.priceAtTime || item.rate;
            const prefetchedMarketRate = newMarketRateMap.get(productId) || 0;
            const priceResult = calculatePriceWithRate(customer, product, prefetchedMarketRate, requestedRate);
            const rate = priceResult.rate;
            const amount = roundTo2Decimals(quantity * rate);
            totalAmount += amount;

            // Add to audit log
            auditChanges.push({
              changedAt: new Date(),
              changedBy: req.user._id,
              changedByName: req.user.name,
              productId: productId,
              productName: product.name,
              oldRate: 0,
              newRate: rate,
              oldQuantity: 0,
              newQuantity: quantity,
              oldTotal: 0,
              newTotal: amount,
              reason: 'Product added by staff'
            });

            updatedProducts.push({
              product: productId,
              productName: product.name,
              quantity: quantity,
              unit: product.unit,
              rate: rate,
              amount: amount,
              isContractPrice: priceResult.isContractPrice
            });
            continue;
          }

          // Handle EXISTING product
          // Validate quantity if provided
          const quantity = item.quantity !== undefined ? item.quantity : original.quantity;

          if (quantity < 0) {
            return res.status(400).json({
              success: false,
              message: `Quantity for "${original.productName}" cannot be negative.`
            });
          }
          if (quantity > 0 && quantity < 0.01) {
            return res.status(400).json({
              success: false,
              message: `Minimum quantity for "${original.productName}" is 0.01 ${original.unit}`
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

          // Handle product removal (quantity = 0)
          if (quantity === 0) {
            auditChanges.push({
              changedAt: new Date(),
              changedBy: req.user._id,
              changedByName: req.user.name,
              productId: item.product,
              productName: original.productName,
              oldRate: original.rate,
              newRate: original.rate,
              oldQuantity: original.quantity,
              newQuantity: 0,
              oldTotal: original.quantity * original.rate,
              newTotal: 0,
              reason: 'Product removed by staff'
            });
            continue; // Skip this product, don't add to updatedProducts
          }

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

          const amount = roundTo2Decimals(quantity * rate);
          totalAmount += amount;

          // Track changes for audit log (price and/or quantity)
          const priceChanged = rate !== original.rate;
          const quantityChanged = quantity !== original.quantity;

          if (priceChanged || quantityChanged) {
            let reason = '';
            if (priceChanged && quantityChanged) {
              reason = 'Price and quantity updated by staff';
            } else if (priceChanged) {
              reason = 'Price updated by staff';
            } else {
              reason = 'Quantity updated by staff';
            }

            auditChanges.push({
              changedAt: new Date(),
              changedBy: req.user._id,
              changedByName: req.user.name,
              productId: item.product,
              productName: original.productName,
              oldRate: original.rate,
              newRate: rate,
              oldQuantity: original.quantity,
              newQuantity: quantity,
              oldTotal: original.quantity * original.rate,
              newTotal: amount,
              reason: reason
            });
          }

          updatedProducts.push({
            product: item.product,
            productName: original.productName,
            quantity: quantity,
            unit: original.unit,
            rate: rate,
            amount: amount,
            isContractPrice: original.isContractPrice
          });
        }

        order.products = updatedProducts;
        order.totalAmount = totalAmount;
        order.markModified('products'); // Ensure array replacement is detected

        // Add changes to audit log (capped at 100 most recent entries)
        if (auditChanges.length > 0) {
          if (!order.priceAuditLog) {
            order.priceAuditLog = [];
          }
          order.priceAuditLog.push(...auditChanges);
          if (order.priceAuditLog.length > 100) {
            order.priceAuditLog = order.priceAuditLog.slice(-100);
          }
        }
      }

      // Update notes if provided
      if (req.body.notes !== undefined) {
        order.notes = req.body.notes;
      }

      await order.save();

      if (req.body.products && Array.isArray(req.body.products)) {
        logAudit(req, 'ORDER_PRICE_UPDATED', 'Order', order._id, {
          orderNumber: order.orderNumber
        });
      }

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
        return res.status(400).json({ success: false, message: errors.array().map(e => e.msg).join(', ') });
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

      // SECURITY: Contract customers can only include products that are either:
      // 1. Already in the order (staff may have added non-contracted products), OR
      // 2. Have contract prices configured
      if (req.user.role === 'customer' && customer.pricingType === 'contract') {
        const contractProductIds = customer.contractPrices
          ? [...customer.contractPrices.keys()]
          : [];
        const existingProductIds = order.products.map(p =>
          typeof p.product === 'object' ? p.product._id.toString() : p.product.toString()
        );
        const allowedProductIds = new Set([...contractProductIds, ...existingProductIds]);

        const requestedProductIds = req.body.products.map(p =>
          typeof p.product === 'object' ? p.product._id.toString() : p.product.toString()
        );
        const unauthorizedProducts = requestedProductIds.filter(
          pid => !allowedProductIds.has(pid)
        );

        if (unauthorizedProducts.length > 0) {
          return res.status(403).json({
            success: false,
            message: 'Some products are not available for your account.'
          });
        }
      }

      // Update products with recalculated prices
      // Batch fetch all products and market rates to avoid N+1 queries
      const productIds = req.body.products.map(p => p.product);
      const [products, marketRates] = await Promise.all([
        Product.find({ _id: { $in: productIds } }),
        MarketRate.find({ product: { $in: productIds } }).sort({ effectiveDate: -1 })
      ]);

      // Build lookup maps for O(1) access
      const productMap = new Map(products.map(p => [p._id.toString(), p]));
      const marketRateMap = new Map();
      marketRates.forEach(mr => {
        const pid = mr.product.toString();
        if (!marketRateMap.has(pid)) {
          marketRateMap.set(pid, mr.rate); // First one is the latest due to sort
        }
      });

      let totalAmount = 0;
      const updatedProducts = [];

      for (const item of req.body.products) {
        const product = productMap.get(item.product.toString());
        if (!product) {
          throw new Error(`Product ${item.product} not found`);
        }

        if (!item.quantity || item.quantity < 0.01) {
          throw new Error(`Minimum quantity for "${product.name}" is 0.01 ${product.unit}`);
        }
        if (item.quantity > 1000000) {
          throw new Error(`Quantity for "${product.name}" exceeds maximum allowed (1,000,000)`);
        }

        // Recalculate rate using pre-fetched market rate (avoids N+1)
        const prefetchedRate = marketRateMap.get(item.product.toString()) || 0;
        const priceResult = calculatePriceWithRate(customer, product, prefetchedRate);
        const amount = roundTo2Decimals(item.quantity * priceResult.rate);
        totalAmount += amount;

        updatedProducts.push({
          product: item.product,
          productName: product.name,
          quantity: item.quantity,
          unit: product.unit,
          rate: priceResult.rate,
          amount: amount,
          isContractPrice: priceResult.isContractPrice
        });
      }

      order.products = updatedProducts;
      order.totalAmount = totalAmount;
      order.markModified('products'); // Ensure array replacement is detected

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

// Valid status transitions (simplified state machine)
// Flow: pending → confirmed → delivered
// Cancellation: admin only, any status except 'delivered' can go to 'cancelled'
const VALID_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['delivered', 'cancelled'],
  delivered: [], // Terminal state
  cancelled: []  // Terminal state
};

// @route   PUT /api/orders/:id/status
// @desc    Update order status (enforces valid state transitions)
// @access  Private (Admin, Staff - but cancellation is admin only)
router.put('/:id/status', protect, authorize('admin', 'staff'), [
  param('id').isMongoId().withMessage('Invalid order ID'),
  body('status').isIn(['pending', 'confirmed', 'delivered', 'cancelled'])
    .withMessage('Invalid status. Allowed values: pending, confirmed, delivered, cancelled'),
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
        message: errors.array().map(e => e.msg).join(', ')
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

    // SECURITY: Only admin can cancel orders
    if (newStatus === 'cancelled' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can cancel orders'
      });
    }

    const updateData = { status: newStatus };
    const now = new Date();

    // Update timestamps based on status
    if (newStatus === 'delivered') {
      updateData.deliveredAt = now;
    } else if (newStatus === 'cancelled') {
      updateData.cancelledAt = now;
      updateData.cancelledBy = req.user._id;
    }

    // Auto-update zero rates when confirming order for market/markup customers
    if (newStatus === 'confirmed') {
      const hasZeroRates = order.products.some(p => p.rate === 0);
      if (hasZeroRates) {
        // Populate customer to check pricing type
        await order.populate('customer');
        const customer = order.customer;

        if (customer && (customer.pricingType === 'market' || customer.pricingType === 'markup')) {
          // Fetch current market rates for products with zero rates
          const zeroRateProductIds = order.products
            .filter(p => p.rate === 0)
            .map(p => p.product);

          const marketRates = await MarketRate.find({ product: { $in: zeroRateProductIds } })
            .sort({ effectiveDate: -1 });

          // Build rate map (latest rate per product)
          const rateMap = new Map();
          for (const rate of marketRates) {
            const productId = rate.product.toString();
            if (!rateMap.has(productId)) {
              rateMap.set(productId, rate.rate);
            }
          }

          // Update products with zero rates
          let totalAmount = 0;
          let ratesUpdated = false;

          for (const item of order.products) {
            if (item.rate === 0) {
              const marketRate = rateMap.get(item.product.toString()) || 0;
              if (marketRate > 0) {
                let newRate = marketRate;
                if (customer.pricingType === 'markup') {
                  const markup = customer.markupPercentage || 0;
                  newRate = roundTo2Decimals(marketRate * (1 + markup / 100));
                }
                item.rate = newRate;
                item.amount = roundTo2Decimals(item.quantity * newRate);
                ratesUpdated = true;
              }
            }
            totalAmount += item.amount;
          }

          if (ratesUpdated) {
            order.totalAmount = roundTo2Decimals(totalAmount);
            // Include rate updates in the atomic status transition below
            updateData.products = order.products;
            updateData.totalAmount = order.totalAmount;
          }
        }
      }
    }

    // Use conditional update to prevent race condition:
    // Only update if status hasn't changed since we read it
    // This also atomically applies any rate updates calculated above
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: req.params.id, status: currentStatus },
      updateData,
      { new: true, runValidators: true }
    ).populate('customer', 'name phone');

    if (!updatedOrder) {
      return res.status(409).json({
        success: false,
        message: 'Order was modified by another request. Please refresh and try again.'
      });
    }

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
        message: errors.array().map(e => e.msg).join(', ')
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
// @access  Private (Admin only)
router.delete('/:id',
  protect,
  authorize('admin'),
  param('id').isMongoId().withMessage('Invalid order ID'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array().map(e => e.msg).join(', ') });
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

      // Decrement batch order count if order belongs to a batch
      if (order.batch) {
        try {
          await Batch.decrementOrderCount(order.batch);
        } catch (batchErr) {
          console.error(`[Orders] Failed to decrement batch order count for batch ${order.batch}:`, batchErr.message);
        }
      }

      logAudit(req, 'ORDER_CANCELLED', 'Order', order._id, {
        orderNumber: order.orderNumber, customer: order.customer
      });

      res.json({
        success: true,
        message: 'Order cancelled successfully'
      });
    } catch (error) {
      next(error);
    }
  });

module.exports = router;
