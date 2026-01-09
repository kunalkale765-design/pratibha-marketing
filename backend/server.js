// Preserve NODE_ENV if set (for tests)
const preservedNodeEnv = process.env.NODE_ENV;
require('dotenv').config();
if (preservedNodeEnv) {
  process.env.NODE_ENV = preservedNodeEnv;
}

// Validate required environment variables (skip in test mode)
const validateEnv = () => {
  const required = ['MONGODB_URI'];
  const requiredInProd = ['JWT_SECRET'];
  const missing = [];

  required.forEach(key => {
    if (!process.env[key]) missing.push(key);
  });

  if (process.env.NODE_ENV === 'production') {
    requiredInProd.forEach(key => {
      if (!process.env[key]) missing.push(key);
    });
  }

  if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    console.error('╔═══════════════════════════════════════════════════════════╗');
    console.error('║  FATAL: Missing required environment variables            ║');
    console.error('╚═══════════════════════════════════════════════════════════╝');
    console.error(`Missing: ${missing.join(', ')}`);
    console.error('\nCreate a .env file with these variables or set them in your environment.');
    console.error('See .env.example for reference.\n');
    process.exit(1);
  }

  // Warn about optional but recommended variables
  if (process.env.NODE_ENV === 'production' && !process.env.SENTRY_DSN) {
    console.warn('⚠️  SENTRY_DSN not configured - error monitoring disabled');
  }
};

validateEnv();
const Sentry = require('@sentry/node');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { csrfTokenSetter, csrfProtection } = require('./middleware/csrf');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { startScheduler, stopScheduler } = require('./services/marketRateScheduler');

// Initialize Sentry (only in production/development, not in test)
if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      Sentry.httpIntegration({ tracing: true }),
      Sentry.expressIntegration(),
    ],
  });
  console.log('Sentry error monitoring initialized');
}

// Initialize Express app
const app = express();

// Note: MongoDB connection is now handled in startServer() function
// to properly await the connection before accepting requests

// Security Middleware
// ====================

// Helmet - Set security headers with HSTS for HTTPS enforcement
app.use(helmet({
  contentSecurityPolicy: false, // Disable for now to allow inline scripts in HTML
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false
}));

// HTTPS redirect in production (when behind reverse proxy like Nginx)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Trust X-Forwarded-Proto header from reverse proxy
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// CORS - Enable Cross-Origin Resource Sharing
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5000'];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate Limiting - Prevent brute force attacks (disabled in test mode)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' // Skip in test mode
});

// Apply rate limiting to API routes only
app.use('/api', limiter);

// Stricter rate limiting for login/register endpoints only
// Applied directly in auth routes to avoid limiting /me and /logout
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Allow 10 attempts per 15 minutes
  message: 'Too many login attempts, please try again later.',
  skip: (req) => {
    // Skip rate limiting for non-sensitive auth routes or in test mode
    return req.path === '/me' || req.path === '/logout' || process.env.NODE_ENV === 'test';
  }
});

// Rate limiting for write operations (create/update/delete) on sensitive resources
const writeOperationsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Allow 50 write operations per 15 minutes
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Only limit POST, PUT, DELETE methods; skip in test mode
    return req.method === 'GET' || process.env.NODE_ENV === 'test';
  }
});

// Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie Parser
app.use(cookieParser());

// CSRF Protection (Double-Submit Cookie Pattern)
// Sets csrf_token cookie on all requests, validates on state-changing requests
app.use(csrfTokenSetter);
app.use('/api', csrfProtection);

// Data Sanitization - Prevent NoSQL injection
app.use(mongoSanitize());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// API Documentation (Swagger UI)
// ================================
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Pratibha Marketing API Docs'
}));

// Serve OpenAPI spec as JSON
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// API Routes
// ===========
// Apply stricter rate limiting to auth routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
// Apply write operations rate limiting to sensitive resources
app.use('/api/customers', writeOperationsLimiter, require('./routes/customers'));
app.use('/api/orders', writeOperationsLimiter, require('./routes/orders'));
app.use('/api/products', require('./routes/products'));
app.use('/api/market-rates', require('./routes/marketRates'));
app.use('/api/supplier', require('./routes/supplier'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  // Check actual MongoDB connection state
  const mongoState = mongoose.connection.readyState;
  const mongoStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  const isDbConnected = mongoState === 1;

  res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? 'ok' : 'degraded',
    message: isDbConnected ? 'Server is running' : 'Database connection issue',
    timestamp: new Date().toISOString(),
    mongodb: mongoStates[mongoState] || 'unknown',
    sentry: process.env.SENTRY_DSN ? 'configured' : 'not configured'
  });
});

// Debug endpoint to test Sentry (only in development)
if (process.env.NODE_ENV === 'development') {
  app.get('/api/debug-sentry', (req, res, next) => {
    try {
      throw new Error('Sentry test error - this is a test!');
    } catch (err) {
      next(err);
    }
  });
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Catch-all route for frontend (SPA support)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  // Try to serve the specific file, fallback to index.html
  const filePath = path.join(__dirname, '../frontend', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, '../frontend/index.html'));
    }
  });
});

// Error Handling Middleware (must be last)
// ==========================================
app.use(notFound);

// Sentry error handler - captures errors and sends to Sentry
if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  app.use(Sentry.expressErrorHandler());
}

app.use(errorHandler);

// Start Server
// =============
const PORT = process.env.PORT || 5000;

// Async startup function to properly await database connection
const startServer = async () => {
  try {
    // Wait for database connection before starting server
    await connectDB();

    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════╗
║   Server running in ${process.env.NODE_ENV} mode   ║
║   Port: ${PORT}                                ║
║   MongoDB: Connected                          ║
╚═══════════════════════════════════════════════╝
      `);
      // Start the market rate scheduler after server is ready
      startScheduler();
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

// Only start server if not in test mode (Supertest handles server in tests)
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  // Send to Sentry if configured
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  // Send to Sentry if configured
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Graceful shutdown helper
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  stopScheduler();

  // Close MongoDB connection
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (err) {
    console.error('Error closing MongoDB connection:', err.message);
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export app for testing
module.exports = app;
