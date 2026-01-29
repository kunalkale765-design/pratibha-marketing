const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { protect, authorize } = require('../middleware/auth');
const { handleValidationErrors, parsePagination } = require('../utils/helpers');

// All routes admin-only
router.use(protect, authorize('admin'));

// Validation
const validateUser = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().notEmpty().withMessage('Username is required')
    .isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('phone').optional({ checkFalsy: true }).matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
  body('role').isIn(['admin', 'staff', 'customer']).withMessage('Role must be admin, staff, or customer')
];

const validatePassword = [
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
];

// @route   GET /api/users
// @desc    List all users
// @access  Admin
router.get('/', async (req, res, next) => {
  try {
    const { search, role, isActive, includeTest } = req.query;
    const { limit, page, skip } = parsePagination(req.query, { limit: 100, maxLimit: 500 });
    const filter = {};

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } }
      ];
    }

    if (role && ['admin', 'staff', 'customer'].includes(role)) {
      filter.role = role;
    }

    if (isActive === 'false') {
      filter.isActive = false;
    } else if (isActive !== 'all') {
      filter.isActive = true;
    }

    // Exclude test customer users by default
    let excludeTestCustomerIds = [];
    if (includeTest !== 'true') {
      const testCustomers = await Customer.find({ isTestCustomer: true }).select('_id');
      excludeTestCustomerIds = testCustomers.map(c => c._id);
      if (excludeTestCustomerIds.length > 0) {
        filter.customer = { $nin: excludeTestCustomerIds };
      }
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetPasswordToken -resetPasswordExpires -__v')
        .populate('customer', 'isTestCustomer')
        .sort({ role: 1, name: 1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter)
    ]);

    res.json({ success: true, count: users.length, total, page, data: users });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/users/:id
// @desc    Get single user
// @access  Admin
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid user ID')
], async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires -__v');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/users
// @desc    Create user
// @access  Admin
router.post('/', [...validateUser, ...validatePassword], async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const { name, email, password, phone, role } = req.body;

    // Check duplicates
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({ success: false, message: 'Phone number already registered' });
      }
    }

    const userData = { name, email, password, phone, role };

    // If creating a customer user, also create a Customer record
    if (role === 'customer') {
      const customer = await Customer.create({ name, phone: phone || '', whatsapp: phone || '' });
      userData.customer = customer._id;
    }

    const user = await User.create(userData);

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/:id
// @desc    Update user (not password)
// @access  Admin
router.put('/:id', [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('phone').optional({ checkFalsy: true }).matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
  body('role').optional().isIn(['admin', 'staff', 'customer']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
], async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent admin from deactivating themselves
    if (req.body.isActive === false && user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
    }

    // Check email uniqueness if changing
    if (req.body.email && req.body.email !== user.email) {
      const dup = await User.findOne({ email: req.body.email });
      if (dup) {
        return res.status(400).json({ success: false, message: 'Username already exists' });
      }
    }

    // Check phone uniqueness if changing
    if (req.body.phone && req.body.phone !== user.phone) {
      const dup = await User.findOne({ phone: req.body.phone });
      if (dup) {
        return res.status(400).json({ success: false, message: 'Phone number already registered' });
      }
    }

    const allowed = ['name', 'email', 'phone', 'role', 'isActive'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) user[field] = req.body[field];
    });

    await user.save({ validateModifiedOnly: true });

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/users/:id/password
// @desc    Reset user password
// @access  Admin
router.put('/:id/password', [
  param('id').isMongoId().withMessage('Invalid user ID'),
  ...validatePassword
], async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = req.body.password;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/users/:id
// @desc    Deactivate user (soft delete)
// @access  Admin
router.delete('/:id', [
  param('id').isMongoId().withMessage('Invalid user ID')
], async (req, res, next) => {
  try {
    if (handleValidationErrors(req, res)) return;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
    }

    user.isActive = false;
    await user.save({ validateModifiedOnly: true });

    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
