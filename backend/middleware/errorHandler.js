// Error handling middleware

// 404 Not Found handler
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Global error handler
const errorHandler = (err, req, res, next) => {
  // Set status code
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);

  // Prepare error response
  const errorResponse = {
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  // Handle specific Mongoose errors
  if (err.name === 'ValidationError') {
    errorResponse.message = Object.values(err.errors)
      .map(e => e.message)
      .join(', ');
    res.status(400);
  }

  if (err.name === 'CastError') {
    errorResponse.message = 'Invalid ID format';
    res.status(400);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    errorResponse.message = `${field} already exists`;
    res.status(400);
  }

  // Always log errors - essential for debugging in any environment
  console.error(`[${process.env.NODE_ENV || 'unknown'}] Error:`, err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error('Stack:', err.stack);
  }

  res.json(errorResponse);
};

module.exports = { notFound, errorHandler };
