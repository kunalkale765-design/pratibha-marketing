/**
 * Utility Functions
 *
 * Common helper functions used across the application.
 * Import these instead of copying the same code everywhere.
 */

/**
 * Escape HTML to prevent XSS attacks
 * Converts special characters to HTML entities
 *
 * @param {any} unsafe - The value to escape
 * @returns {string} - Safe HTML string
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format a date for display
 *
 * @param {Date|string} date - Date to format
 * @param {string} format - 'short', 'long', 'time', or 'datetime'
 * @returns {string} - Formatted date string
 *
 * @example
 * formatDate('2026-01-09', 'short')  // "Jan 9, 2026"
 * formatDate('2026-01-09', 'long')   // "January 9, 2026"
 * formatDate(new Date(), 'time')     // "2:30 PM"
 * formatDate(new Date(), 'datetime') // "Jan 9, 2026, 2:30 PM"
 */
export function formatDate(date, format = 'short') {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const options = {
    short: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    time: { hour: 'numeric', minute: '2-digit', hour12: true },
    datetime: { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true },
    iso: null // Special case
  };

  if (format === 'iso') {
    return d.toISOString().split('T')[0];
  }

  return d.toLocaleDateString('en-IN', options[format] || options.short);
}

/**
 * Format a number as Indian Rupee currency
 *
 * @param {number} amount - Amount to format
 * @param {boolean} showSymbol - Whether to show ₹ symbol
 * @returns {string} - Formatted currency string
 *
 * @example
 * formatCurrency(1234.56)        // "₹1,234.56"
 * formatCurrency(1234.56, false) // "1,234.56"
 */
export function formatCurrency(amount, showSymbol = true) {
  if (amount === null || amount === undefined || isNaN(amount)) return showSymbol ? '₹0' : '0';

  const formatted = Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  return showSymbol ? `₹${formatted}` : formatted;
}

/**
 * Format a number with Indian number system (lakhs, crores)
 *
 * @param {number} num - Number to format
 * @returns {string} - Formatted number
 *
 * @example
 * formatNumber(1234567) // "12,34,567"
 */
export function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toLocaleString('en-IN');
}

/**
 * Debounce a function - delays execution until after wait ms have elapsed
 * since the last time it was invoked
 *
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} - Debounced function
 *
 * @example
 * const debouncedSearch = debounce(search, 300);
 * input.addEventListener('input', debouncedSearch);
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle a function - ensures it's only called at most once per wait ms
 *
 * @param {Function} func - Function to throttle
 * @param {number} wait - Minimum ms between calls
 * @returns {Function} - Throttled function
 */
export function throttle(func, wait = 100) {
  let lastTime = 0;
  return function executedFunction(...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      func(...args);
    }
  };
}

/**
 * Generate a unique ID
 *
 * @param {string} prefix - Optional prefix
 * @returns {string} - Unique ID
 */
export function uniqueId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array/object)
 *
 * @param {any} value - Value to check
 * @returns {boolean} - True if empty
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Capitalize first letter of a string
 *
 * @param {string} str - String to capitalize
 * @returns {string} - Capitalized string
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Truncate a string to a maximum length
 *
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add if truncated
 * @returns {string} - Truncated string
 */
export function truncate(str, maxLength = 50, suffix = '...') {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Parse query string parameters
 *
 * @param {string} queryString - Query string (with or without leading ?)
 * @returns {Object} - Parsed parameters
 */
export function parseQueryString(queryString = window.location.search) {
  const params = {};
  const searchParams = new URLSearchParams(queryString);
  for (const [key, value] of searchParams) {
    params[key] = value;
  }
  return params;
}

/**
 * Build a query string from an object
 *
 * @param {Object} params - Parameters object
 * @returns {string} - Query string
 */
export function buildQueryString(params) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.append(key, value);
    }
  }
  return searchParams.toString();
}

/**
 * Deep clone an object
 *
 * @param {Object} obj - Object to clone
 * @returns {Object} - Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sleep for a specified time (for async/await)
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after ms
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
