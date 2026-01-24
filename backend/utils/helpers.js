/**
 * Shared utility functions for the backend
 * Consolidates common patterns used across multiple route files
 */

const { validationResult } = require('express-validator');

/**
 * Round a number to 2 decimal places
 * Avoids floating-point precision issues
 * @param {number} num - Number to round
 * @returns {number} Rounded number
 */
function roundTo2Decimals(num) {
  return Math.round(num * 100) / 100;
}

/**
 * Extract customer ID from user object (handles both populated and unpopulated cases)
 * @param {Object} user - User object with optional customer reference
 * @returns {string|null} Customer ID as string, or null if not found
 */
function getCustomerId(user) {
  if (!user || !user.customer) return null;
  return typeof user.customer === 'object'
    ? user.customer._id?.toString()
    : user.customer.toString();
}

/**
 * Extract ID from a potentially populated Mongoose reference
 * @param {Object|string} ref - Mongoose reference (populated object or ObjectId)
 * @returns {string|null} ID as string, or null if not found
 */
function extractId(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  return ref._id?.toString() || ref.toString();
}

/**
 * Check if validation errors exist and return error response if so
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {boolean} True if errors exist (response already sent), false otherwise
 */
function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
}

/**
 * Build a date range filter for MongoDB queries
 * @param {string} startDate - Start date string (optional)
 * @param {string} endDate - End date string (optional)
 * @param {Object} options - Options for date range building
 * @param {boolean} options.endOfDay - If true, set endDate to 23:59:59.999 (default: true)
 * @returns {{ filter: Object|null, error: string|null }} Filter object or error message
 */
function buildDateRangeFilter(startDate, endDate, options = {}) {
  const { endOfDay = true } = options;

  if (!startDate && !endDate) {
    return { filter: null, error: null };
  }

  const dateFilter = {};

  if (startDate) {
    const parsedStart = new Date(startDate);
    if (isNaN(parsedStart.getTime())) {
      return { filter: null, error: 'Invalid startDate format' };
    }
    // Use UTC to avoid timezone issues
    parsedStart.setUTCHours(0, 0, 0, 0);
    dateFilter.$gte = parsedStart;
  }

  if (endDate) {
    const parsedEnd = new Date(endDate);
    if (isNaN(parsedEnd.getTime())) {
      return { filter: null, error: 'Invalid endDate format' };
    }
    if (endOfDay) {
      parsedEnd.setUTCHours(23, 59, 59, 999);
    }
    dateFilter.$lte = parsedEnd;
  }

  // Validate date range
  if (dateFilter.$gte && dateFilter.$lte && dateFilter.$gte > dateFilter.$lte) {
    return { filter: null, error: 'endDate must be greater than or equal to startDate' };
  }

  return { filter: dateFilter, error: null };
}

/**
 * Parse and validate pagination parameters
 * @param {Object} query - Express request query object
 * @param {Object} defaults - Default values { limit, maxLimit, page }
 * @returns {{ limit: number, page: number, skip: number }}
 */
function parsePagination(query, defaults = {}) {
  const { limit: defaultLimit = 50, maxLimit = 1000, page: defaultPage = 1 } = defaults;

  const limit = Math.min(Math.max(parseInt(query.limit) || defaultLimit, 1), maxLimit);
  const page = Math.max(parseInt(query.page) || defaultPage, 1);
  const skip = (page - 1) * limit;

  return { limit, page, skip };
}

/**
 * Build safe customer response object for API responses
 * Excludes sensitive data but includes pricing info for frontend filtering
 * @param {Object} customer - Customer document (populated or plain object)
 * @returns {Object|null} Safe customer object or null
 */
function buildSafeCustomerResponse(customer) {
  if (!customer) return null;

  const safeCustomer = {
    _id: customer._id,
    name: customer.name,
    pricingType: customer.pricingType
  };

  // Include contract prices for contract customers (needed for product filtering)
  if (customer.pricingType === 'contract' && customer.contractPrices) {
    safeCustomer.contractPrices = customer.contractPrices instanceof Map
      ? Object.fromEntries(customer.contractPrices)
      : customer.contractPrices;
  }

  // Include markup percentage for markup customers
  if (customer.pricingType === 'markup') {
    safeCustomer.markupPercentage = customer.markupPercentage || 0;
  }

  return safeCustomer;
}

/**
 * Transform order for queue/list view
 * Extracts essential fields for display without sensitive pricing data
 * @param {Object} order - Populated order document
 * @returns {Object} Transformed order object
 */
function transformOrderForList(order) {
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    customer: order.customer ? {
      _id: order.customer._id,
      name: order.customer.name || 'Unknown',
      phone: order.customer.phone || ''
    } : null,
    batch: order.batch ? {
      _id: order.batch._id,
      batchNumber: order.batch.batchNumber,
      batchType: order.batch.batchType,
      status: order.batch.status
    } : null,
    itemCount: order.products?.length || 0,
    totalAmount: order.totalAmount,
    status: order.status,
    packingDone: order.packingDone || false,
    notes: order.notes,
    deliveryAddress: order.deliveryAddress || order.customer?.address,
    createdAt: order.createdAt
  };
}

/**
 * Check if a customer user owns an order
 * @param {Object} user - User object with customer reference
 * @param {Object} order - Order document (may be populated)
 * @returns {boolean} True if user owns the order
 */
function userOwnsOrder(user, order) {
  const userCustomerId = getCustomerId(user);
  const orderCustomerId = extractId(order.customer);
  return userCustomerId && orderCustomerId && userCustomerId === orderCustomerId;
}

module.exports = {
  roundTo2Decimals,
  getCustomerId,
  extractId,
  handleValidationErrors,
  buildDateRangeFilter,
  parsePagination,
  buildSafeCustomerResponse,
  transformOrderForList,
  userOwnsOrder
};
