// Error handling middleware
let Sentry;
try {
  Sentry = require('@sentry/node');
} catch (_) {
  // Sentry not installed — optional dependency
}

// 404 Not Found handler
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Global error handler
const errorHandler = (err, req, res, _next) => {
  // Ensure we have a valid error object
  if (!err) {
    err = new Error('Unknown error occurred');
  }

  // Set status code - default to 500 if not explicitly set
  let statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;

  // Prepare error response with consistent structure
  const errorResponse = {
    success: false,
    message: err.message || 'Something went wrong. Please try again.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  // Handle specific Mongoose errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {})
      .map(e => e.message || 'Please check your input')
      .join(', ');
    errorResponse.message = messages || 'Please check your input';
    statusCode = 400;
  }

  if (err.name === 'CastError') {
    errorResponse.message = err.path === '_id' ? 'Item not found' : `Please check ${err.path || 'your input'}`;
    statusCode = 400;
  }

  if (err.code === 11000) {
    const field = err.keyPattern ? Object.keys(err.keyPattern)[0] : 'field';
    errorResponse.message = `A record with this ${field} already exists`;
    statusCode = 400;
  }

  // Handle MongoDB connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    errorResponse.message = 'Service temporarily unavailable. Please try again.';
    statusCode = 503;
  }

  // Handle JWT errors not caught by auth middleware
  if (err.name === 'JsonWebTokenError') {
    errorResponse.message = 'Please log in again';
    statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    errorResponse.message = 'Session expired. Please log in again.';
    statusCode = 401;
  }

  // Handle syntax errors in request body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    errorResponse.message = 'Please check your input and try again';
    statusCode = 400;
  }

  // Handle request body too large (express.json limit)
  if (err.status === 413 || err.type === 'entity.too.large') {
    errorResponse.message = 'Request body too large. Please try a smaller payload.';
    statusCode = 413;
  }

  // Handle file system errors
  if (err.code === 'ENOENT') {
    errorResponse.message = 'Requested item not found';
    statusCode = 404;
  }

  if (err.code === 'EACCES' || err.code === 'EPERM') {
    errorResponse.message = 'Access not available. Please try again.';
    statusCode = 500;
  }

  // Apply the status code
  res.status(statusCode);

  // Report 5xx errors to Sentry if available
  if (statusCode >= 500 && Sentry && process.env.SENTRY_DSN) {
    Sentry.captureException(err, {
      tags: { statusCode },
      extra: { url: req.originalUrl, method: req.method }
    });
  }

  // Log errors - but skip expected client errors (4xx) in test mode to reduce noise
  const isTestMode = process.env.NODE_ENV === 'test';
  const isClientError = statusCode >= 400 && statusCode < 500;

  if (!isTestMode || !isClientError) {
    console.error(`[${process.env.NODE_ENV || 'unknown'}] Error (${statusCode}):`, err.message);
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack:', err.stack);
    }
  }

  res.json(errorResponse);
};

module.exports = { notFound, errorHandler };
