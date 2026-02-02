const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Customer = require('../models/Customer');
const RevokedToken = require('../models/RevokedToken');
const { JWT_SECRET } = require('../config/secrets');

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

    // Verify token - use centralized secret from config
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if token has been revoked (jti-based blacklist)
    if (decoded.jti) {
      const isRevoked = await RevokedToken.isRevoked(decoded.jti);
      if (isRevoked) {
        return res.status(401).json({
          success: false,
          message: 'Session has been revoked. Please log in again.'
        });
      }
    }

    // Handle magic link tokens (customer-only access)
    if (decoded.type === 'magic' && decoded.customerId) {
      const customer = await Customer.findById(decoded.customerId);
      if (!customer || !customer.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Invalid session. Please use a new magic link.'
        });
      }

      // Reject sessions issued before the magic link was revoked
      if (customer.magicLinkRevokedAt && decoded.iat) {
        const revokedAtSec = Math.floor(customer.magicLinkRevokedAt.getTime() / 1000);
        if (decoded.iat <= revokedAtSec) {
          return res.status(401).json({
            success: false,
            message: 'Access has been revoked. Please request a new magic link.'
          });
        }
      }

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

    // Check tokenVersion: if password was changed, all older tokens are invalid
    if (decoded.tv !== undefined && decoded.tv !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'Session invalidated due to password change. Please log in again.'
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
      const decoded = jwt.verify(token, JWT_SECRET);

      // Check if token has been revoked
      if (decoded.jti) {
        const isRevoked = await RevokedToken.isRevoked(decoded.jti);
        if (isRevoked) {
          return next(); // Treat as unauthenticated
        }
      }

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
      // Unexpected error (DB failure, programming error) - return 503
      // Do NOT silently continue as unauthenticated; this masks DB outages
      // and could serve wrong data to logged-in users
      console.error('Unexpected error in optional auth middleware:', error.message, error.stack);
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again.'
      });
    }
  }
};

module.exports = { protect, authorize, optionalAuth };
