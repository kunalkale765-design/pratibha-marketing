const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Customer = require('../models/Customer');

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 * Supports both regular user tokens and magic link tokens
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in cookie first (preferred)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    // Fallback to Authorization header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized. Please log in.'
      });
    }

    // Verify token - use same secret as auth routes
    const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    const decoded = jwt.verify(token, secret);

    // Handle magic link tokens (customer-only access)
    if (decoded.type === 'magic' && decoded.customerId) {
      const customer = await Customer.findById(decoded.customerId);
      if (!customer || !customer.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Invalid session. Please use a new magic link.'
        });
      }

      // Magic links never expire - valid until explicitly revoked

      // Create a virtual user object for magic link sessions
      req.user = {
        _id: null,
        name: customer.name,
        role: 'customer',
        customer: customer._id,
        isMagicLink: true
      };
      req.customer = customer;
      return next();
    }

    // Regular user token
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Please log in again.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact admin.'
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please log in again.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.'
      });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication unavailable. Please try again.'
    });
  }
};

/**
 * Authorization Middleware
 * Restricts access to specific roles
 * @param  {...string} roles - Allowed roles (e.g., 'admin', 'staff', 'customer')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};

/**
 * Optional Authentication
 * Attaches user to request if token exists, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
      const decoded = jwt.verify(token, secret);
      const user = await User.findById(decoded.id).select('-password');
      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Only silently continue for JWT-related errors (invalid/expired tokens)
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      // Token invalid or expired, continue without user
      next();
    } else {
      // Unexpected error (DB failure, programming error) - log but continue
      console.error('Unexpected error in optional auth middleware:', error.message, error.stack);
      next();
    }
  }
};

module.exports = { protect, authorize, optionalAuth };
