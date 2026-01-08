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
  const rate = await MarketRate.findOne({ product: productId })
    .sort({ effectiveDate: -1 })
    .limit(1);
  return rate ? rate.rate : null;
}

// Helper function to calculate price based on customer's pricing type
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
      // Fall back to product base price if no contract price set
      return product.basePrice;

    case 'markup':
      // Get market rate and apply markup
      const marketRate = await getMarketRate(product._id);
      const baseRate = marketRate || product.basePrice;
      const markup = customer.markupPercentage || 0;
      return baseRate * (1 + markup / 100);

    case 'market':
    default:
      // Use current market rate or product base price
      const currentRate = await getMarketRate(product._id);
      return currentRate || product.basePrice;
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
// @desc    Get all orders
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const { status, customer, startDate, endDate, limit = 50 } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (customer) {
      filter.customer = customer;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const orders = await Order.find(filter)
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit')
      .select('-__v')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

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

    // Verify customer exists
    const customer = await Customer.findById(req.body.customer);
    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    // Calculate amounts and populate product names
    // Price is calculated based on customer's pricing type if not provided
    let totalAmount = 0;
    const processedProducts = await Promise.all(
      req.body.products.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) {
          throw new Error(`Product ${item.product} not found`);
        }

        // Calculate rate based on customer's pricing type
        const rate = await calculatePrice(customer, product, item.rate);
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

    // Create order
    const order = await Order.create({
      customer: req.body.customer,
      products: processedProducts,
      totalAmount: totalAmount,
      deliveryAddress: req.body.deliveryAddress,
      notes: req.body.notes
    });

    // Update customer credit if payment is on credit
    if (req.body.paymentStatus === 'unpaid') {
      customer.currentCredit += totalAmount;
      await customer.save();
    }

    // Populate and return
    const populatedOrder = await Order.findById(order._id)
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit');

    res.status(201).json({
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

    order.paidAmount = req.body.paidAmount;

    // Update payment status
    if (order.paidAmount >= order.totalAmount) {
      order.paymentStatus = 'paid';
    } else if (order.paidAmount > 0) {
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
router.delete('/:id', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
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
