const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { JWT_SECRET } = require('../config/secrets');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().notEmpty().withMessage('Username is required')
    .isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  body('phone').optional().matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // Note: role is intentionally NOT accepted from user input to prevent privilege escalation
    const { name, email, password, phone } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username already registered'
      });
    }

    // Check if phone already exists (if provided)
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number already registered'
        });
      }
    }

    // Create user - always as customer for public registration
    // Admin/staff accounts must be created by an existing admin
    // Use a try-catch to ensure no orphaned records
    let user;
    let customer;

    try {
      // Create customer record first (can be orphaned but less problematic)
      customer = await Customer.create({
        name,
        phone: phone || '',
        whatsapp: phone || ''
      });

      // Create user with customer reference
      user = await User.create({
        name,
        email,
        password,
        phone,
        role: 'customer',
        customer: customer._id
      });
    } catch (createError) {
      // Cleanup: if user creation failed but customer was created, delete the customer
      if (customer && !user) {
        try {
          await Customer.findByIdAndDelete(customer._id);
        } catch (cleanupError) {
          console.error('Failed to cleanup orphaned customer:', cleanupError.message);
        }
      }
      throw createError;
    }

    // Generate token
    const token = generateToken(user._id);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customer: user.customer || null
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user and include password, populate customer for pricing data
    const user = await User.findOne({ email }).select('+password').populate('customer');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Only return essential customer data (exclude sensitive info)
    // For contract customers, include contractPrices so frontend can filter products
    // For markup customers, include markupPercentage so frontend can calculate prices
    const safeCustomer = user.customer ? {
      _id: user.customer._id,
      name: user.customer.name,
      pricingType: user.customer.pricingType,
      ...(user.customer.pricingType === 'contract' && user.customer.contractPrices
        ? { contractPrices: Object.fromEntries(user.customer.contractPrices) }
        : {}),
      ...(user.customer.pricingType === 'markup'
        ? { markupPercentage: user.customer.markupPercentage || 0 }
        : {})
    } : null;

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customer: safeCustomer
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0)
  });

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private (will add middleware later)
router.get('/me', async (req, res, next) => {
  try {
    // Get token from cookie or header
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Handle magic link tokens
    if (decoded.type === 'magic' && decoded.customerId) {
      const customer = await Customer.findById(decoded.customerId);
      if (!customer || !customer.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Invalid session'
        });
      }
      // Only return essential customer data (exclude sensitive info)
      // For contract customers, include contractPrices so frontend can filter products
      // For markup customers, include markupPercentage so frontend can calculate prices
      return res.json({
        success: true,
        user: {
          id: null,
          name: customer.name,
          email: null,
          role: 'customer',
          customer: {
            _id: customer._id,
            name: customer.name,
            pricingType: customer.pricingType,
            ...(customer.pricingType === 'contract' && customer.contractPrices
              ? { contractPrices: Object.fromEntries(customer.contractPrices) }
              : {}),
            ...(customer.pricingType === 'markup'
              ? { markupPercentage: customer.markupPercentage || 0 }
              : {})
          },
          isMagicLink: true
        }
      });
    }

    // Regular user token
    const user = await User.findById(decoded.id).select('-password').populate('customer');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Only return essential user/customer data (exclude sensitive info)
    // For contract customers, include contractPrices so frontend can filter products
    // For markup customers, include markupPercentage so frontend can calculate prices
    const safeCustomer = user.customer ? {
      _id: user.customer._id,
      name: user.customer.name,
      pricingType: user.customer.pricingType,
      ...(user.customer.pricingType === 'contract' && user.customer.contractPrices
        ? { contractPrices: Object.fromEntries(user.customer.contractPrices) }
        : {}),
      ...(user.customer.pricingType === 'markup'
        ? { markupPercentage: user.customer.markupPercentage || 0 }
        : {})
    } : null;

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customer: safeCustomer
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/auth/magic/:token
// @desc    Authenticate via magic link
// @access  Public
router.get('/magic/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token || token.length !== 64) {
      return res.status(400).json({
        success: false,
        message: 'Invalid magic link'
      });
    }

    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find customer with this hashed token
    const customer = await Customer.findOne({
      magicLinkToken: hashedToken,
      isActive: true
    });

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Invalid magic link'
      });
    }

    // Magic links never expire - they remain valid until explicitly revoked

    // Find if there's a user account linked to this customer
    const user = await User.findOne({ customer: customer._id, isActive: true });

    // If no user exists, create a virtual session (customer-only access)
    if (!user) {
      // Create a temporary JWT for this customer
      const sessionToken = jwt.sign(
        { customerId: customer._id, type: 'magic' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.cookie('token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      // Only return essential customer data (exclude sensitive info)
      // For contract customers, include contractPrices so frontend can filter products
      // For markup customers, include markupPercentage so frontend can calculate prices
      return res.json({
        success: true,
        user: {
          id: null,
          name: customer.name,
          email: null,
          role: 'customer',
          customer: {
            _id: customer._id,
            name: customer.name,
            pricingType: customer.pricingType,
            ...(customer.pricingType === 'contract' && customer.contractPrices
              ? { contractPrices: Object.fromEntries(customer.contractPrices) }
              : {}),
            ...(customer.pricingType === 'markup'
              ? { markupPercentage: customer.markupPercentage || 0 }
              : {})
          }
        },
        message: 'Magic link authenticated'
      });
    }

    // User exists - create full session
    const jwtToken = generateToken(user._id);

    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Only return essential customer data (exclude sensitive info)
    // For contract customers, include contractPrices so frontend can filter products
    // For markup customers, include markupPercentage so frontend can calculate prices
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        customer: {
          _id: customer._id,
          name: customer.name,
          pricingType: customer.pricingType,
          ...(customer.pricingType === 'contract' && customer.contractPrices
            ? { contractPrices: Object.fromEntries(customer.contractPrices) }
            : {}),
          ...(customer.pricingType === 'markup'
            ? { markupPercentage: customer.markupPercentage || 0 }
            : {})
        }
      },
      message: 'Magic link authenticated'
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset (generates token)
// @access  Public
router.post('/forgot-password', [
  body('email').trim().notEmpty().withMessage('Username is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // Find user by email (username)
    const user = await User.findOne({ email, isActive: true });

    if (!user) {
      // Don't reveal if user exists - return success either way
      return res.json({
        success: true,
        message: 'If an account exists with that username, a reset link has been generated'
      });
    }

    // Generate reset token (64 hex chars = 32 bytes)
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash token before storing (same pattern as magic links)
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiry (1 hour)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    // In production, you would send this via email
    // For now, return the token (staff/admin can share it manually)
    // Remove the resetToken from response in production with email integration
    res.json({
      success: true,
      message: 'Password reset token generated',
      // NOTE: In production with email, remove resetToken and resetUrl from response
      resetToken,
      resetUrl: `/pages/auth/reset-password.html?token=${resetToken}`,
      expiresIn: '1 hour'
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password using token
// @access  Public
router.post('/reset-password/:token', [
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { token } = req.params;
    const { password } = req.body;

    // Validate token format
    if (!token || token.length !== 64) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset token'
      });
    }

    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
      isActive: true
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Generate new JWT token (auto-login after reset)
    const jwtToken = generateToken(user._id);

    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({
      success: true,
      message: 'Password reset successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
