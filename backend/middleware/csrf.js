const crypto = require('crypto');

/**
 * CSRF Protection Middleware using Double-Submit Cookie Pattern
 *
 * How it works:
 * 1. On any request, sets a CSRF token in a non-httpOnly cookie (readable by JS)
 * 2. For state-changing requests (POST, PUT, DELETE), validates that the
 *    X-CSRF-Token header matches the cookie value
 *
 * The frontend must:
 * 1. Read the csrf_token cookie
 * 2. Include it as X-CSRF-Token header in state-changing requests
 */

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days (match JWT expiration)

// Generate a cryptographically secure random token
const generateToken = () => {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
};

// Get or create CSRF token from cookies
const getOrCreateToken = (req, res) => {
  // First check if we already generated a token in this request cycle
  // This prevents double-setting the cookie with different values
  if (req._csrfToken) {
    return req._csrfToken;
  }

  let token = req.cookies[CSRF_COOKIE_NAME];

  if (!token) {
    token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Changed from 'strict' to allow navigation from external links
      maxAge: COOKIE_MAX_AGE,
      path: '/'
    });
  }

  // Store on request object for reuse in same request cycle
  req._csrfToken = token;
  return token;
};

// Middleware to set CSRF token cookie on all requests
const csrfTokenSetter = (req, res, next) => {
  getOrCreateToken(req, res);
  next();
};

// Validate Origin/Referer header matches allowed origins
const validateOrigin = (req) => {
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // In development, allow localhost origins
  if (process.env.NODE_ENV === 'development') {
    const devHosts = ['localhost', '127.0.0.1'];
    if (origin) {
      try {
        const url = new URL(origin);
        if (devHosts.includes(url.hostname)) return true;
      } catch (e) { /* invalid origin */ }
    }
    if (referer) {
      try {
        const url = new URL(referer);
        if (devHosts.includes(url.hostname)) return true;
      } catch (e) { /* invalid referer */ }
    }
    // No origin/referer in dev is ok (Postman, curl)
    if (!origin && !referer) return true;
    return false;
  }

  // In production, check against ALLOWED_ORIGINS
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

  if (origin && allowedOrigins.some(allowed => origin === allowed)) return true;
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (allowedOrigins.some(allowed => refOrigin === allowed)) return true;
    } catch (e) { /* invalid referer */ }
  }

  // Allow requests with no origin/referer (non-browser clients)
  if (!origin && !referer) return true;

  return false;
};

// Middleware to validate CSRF token on state-changing requests
const csrfProtection = (req, res, next) => {
  // Skip for safe methods (GET, HEAD, OPTIONS)
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Skip in test mode
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // Skip for API endpoints that need to work without CSRF (e.g., magic links)
  // Use regex with exact pattern matching to prevent path traversal bypasses
  const exemptPatterns = [
    /^\/api\/auth\/magic\/[a-f0-9]{64}$/, // Magic link authentication (exact 64-char hex token)
  ];

  if (exemptPatterns.some(pattern => pattern.test(req.path))) {
    return next();
  }

  // Secondary defense: validate Origin/Referer header
  if (!validateOrigin(req)) {
    return res.status(403).json({
      success: false,
      message: 'Request origin not allowed'
    });
  }

  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  // Validate tokens exist and match
  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token missing'
    });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token mismatch'
    });
  }

  next();
};

// Route handler to get/refresh CSRF token
const csrfTokenHandler = (req, res) => {
  const token = getOrCreateToken(req, res);
  res.json({ success: true, csrfToken: token });
};

module.exports = {
  csrfTokenSetter,
  csrfProtection,
  csrfTokenHandler,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
