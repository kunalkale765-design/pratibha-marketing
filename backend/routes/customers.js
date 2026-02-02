const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { handleValidationErrors, parsePagination } = require('../utils/helpers');
const { logAudit } = require('../utils/auditLog');

// Rate limiter for magic link generation - 5 per hour per IP to prevent abuse
const magicLinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, message: 'Too many magic link requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test'
});

// Validation middleware
const validateCustomer = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('phone').optional({ checkFalsy: true }).matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
  body('whatsapp').optional({ checkFalsy: true }).matches(/^[0-9]{10}$/).withMessage('WhatsApp must be 10 digits')
];

// @route   GET /api/customers
// @desc    Get all customers
// @access  Private (Admin, Staff)
router.get('/', protect, authorize('admin', 'staff'), async (req, res, next) => {
  try {
    const { search, isActive, includeTest } = req.query;
    const { limit, page, skip } = parsePagination(req.query, { limit: 100, maxLimit: 500 });
    const filter = {};

    if (search) {
      // Escape regex special characters to prevent ReDoS attacks
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { phone: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    // Default to only active customers, unless explicitly requesting all or inactive
    if (isActive === 'all') {
      // Show all customers (active and inactive)
    } else if (isActive === 'false') {
      filter.isActive = false;
    } else {
      // Default: only active customers
      filter.isActive = true;
    }

    // By default, exclude test customers unless explicitly requested
    if (includeTest === 'true' || includeTest === 'only') {
      if (includeTest === 'only') {
        filter.isTestCustomer = true;
      }
      // 'true' shows all customers (test and non-test)
    } else {
      // Default: exclude test customers
      filter.isTestCustomer = { $ne: true };
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .select('-__v')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Customer.countDocuments(filter)
    ]);

    res.json({
      success: true,
      count: customers.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: customers
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/customers/:id
// @desc    Get single customer
// @access  Private (Admin, Staff)
router.get('/:id',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid customer ID'),
  async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const customer = await Customer.findById(req.params.id).select('-__v');

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/customers
// @desc    Create new customer
// @access  Private (Admin, Staff)
router.post('/', protect, authorize('admin', 'staff'), validateCustomer, async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    // Only allow whitelisted fields to prevent mass assignment
    const customerData = {
      name: req.body.name,
      phone: req.body.phone,
      whatsapp: req.body.whatsapp,
      address: req.body.address,
      pricingType: req.body.pricingType,
      markupPercentage: req.body.markupPercentage,
      isTestCustomer: req.body.isTestCustomer,
      createdBy: req.user._id
    };

    // Handle contractPrices Map with validation
    if (req.body.contractPrices) {
      const entries = Object.entries(req.body.contractPrices);
      for (const [productId, price] of entries) {
        if (typeof price !== 'number' || price <= 0) {
          return res.status(400).json({
            success: false,
            message: `Contract price for product ${productId} must be a positive number`
          });
        }
      }
      customerData.contractPrices = new Map(entries);
    }

    const customer = await Customer.create(customerData);

    res.status(201).json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/customers/:id
// @desc    Update customer
// @access  Private (Admin, Staff)
router.put('/:id',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid customer ID'),
  ...validateCustomer,
  async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    const oldName = customer.name;

    // Update basic fields
    if (req.body.name) customer.name = req.body.name;
    if (req.body.phone !== undefined) customer.phone = req.body.phone;
    if (req.body.whatsapp !== undefined) customer.whatsapp = req.body.whatsapp;
    if (req.body.address !== undefined) customer.address = req.body.address;
    if (req.body.pricingType) customer.pricingType = req.body.pricingType;
    if (req.body.markupPercentage !== undefined) customer.markupPercentage = req.body.markupPercentage;
    if (req.body.isTestCustomer !== undefined) customer.isTestCustomer = req.body.isTestCustomer;

    // Handle contractPrices Map update properly
    if (req.body.contractPrices) {
      const entries = Object.entries(req.body.contractPrices);
      for (const [productId, price] of entries) {
        if (typeof price !== 'number' || price <= 0) {
          return res.status(400).json({
            success: false,
            message: `Contract price for product ${productId} must be a positive number`
          });
        }
      }
      customer.contractPrices = new Map(entries);
      customer.markModified('contractPrices'); // Required for Mongoose to detect Map replacement
    }

    // Add audit field
    customer.updatedBy = req.user._id;

    await customer.save();

    // Sync name change to linked User record
    let nameSyncWarning = null;
    if (req.body.name && req.body.name !== oldName) {
      try {
        await User.updateMany(
          { customer: customer._id },
          { name: req.body.name }
        );
      } catch (syncError) {
        console.error('Failed to sync customer name to user:', syncError.message);
        nameSyncWarning = `Customer updated but login name sync failed: ${syncError.message}. The customer may still see their old name when logged in.`;
      }
    }

    logAudit(req, 'CUSTOMER_UPDATED', 'Customer', customer._id, {
      fields: Object.keys(req.body)
    });

    res.json({
      success: true,
      data: customer,
      warning: nameSyncWarning || undefined
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/customers/:id
// @desc    Delete customer (soft delete)
// @access  Private (Admin, Staff)
router.delete('/:id',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid customer ID'),
  async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
        // Clear magic link on deletion for security
        magicLinkToken: undefined,
        magicLinkCreatedAt: undefined,
        // Record who deleted and when
        deletedBy: req.user._id,
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    logAudit(req, 'CUSTOMER_DELETED', 'Customer', customer._id, {
      name: customer.name
    });

    res.json({
      success: true,
      message: 'Customer deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/customers/:id/magic-link
// @desc    Generate magic link for customer
// @access  Private (Admin, Staff)
router.post('/:id/magic-link',
  magicLinkLimiter,
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid customer ID'),
  async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    if (!customer.isActive) {
      res.status(400);
      throw new Error('Cannot generate magic link for inactive customer');
    }

    // Generate a secure random token (32 bytes = 64 hex chars)
    const token = crypto.randomBytes(32).toString('hex');

    // Hash the token before storing (security: if DB is leaked, tokens are useless)
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    customer.magicLinkToken = hashedToken;  // Store hash, not plain token
    customer.magicLinkCreatedAt = new Date();
    await customer.save();

    // Build the magic link URL with PLAIN token (only time it exists)
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const magicLink = `${baseUrl}/pages/order-form/?token=${token}`;

    // Return only the magic link, not the raw token (security best practice)
    res.json({
      success: true,
      data: {
        link: magicLink,
        createdAt: customer.magicLinkCreatedAt,
        expiresIn: 'Never (until revoked)'
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/customers/:id/magic-link
// @desc    Revoke magic link for customer
// @access  Private (Admin, Staff)
router.delete('/:id/magic-link',
  protect,
  authorize('admin', 'staff'),
  param('id').isMongoId().withMessage('Invalid customer ID'),
  async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }

    customer.magicLinkToken = undefined;
    customer.magicLinkCreatedAt = undefined;
    // Record revocation time so auth middleware can reject sessions issued before this
    customer.magicLinkRevokedAt = new Date();
    await customer.save();

    res.json({
      success: true,
      message: 'Magic link revoked'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
