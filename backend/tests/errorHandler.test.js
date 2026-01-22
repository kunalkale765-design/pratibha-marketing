const { notFound, errorHandler } = require('../middleware/errorHandler');

describe('Error Handler Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.NODE_ENV;

    // Create mock request
    mockReq = {
      originalUrl: '/api/test'
    };

    // Create mock response
    mockRes = {
      statusCode: 200,
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Create mock next function
    mockNext = jest.fn();

    // Suppress console.error during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  describe('notFound middleware', () => {
    it('should create 404 error and pass to next', () => {
      notFound(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalled();

      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Not Found');
      expect(error.message).toContain('/api/test');
    });
  });

  describe('errorHandler middleware', () => {
    it('should handle generic error with 500 status', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Something went wrong'
        })
      );
    });

    it('should preserve status code if already set >= 400', () => {
      mockRes.statusCode = 403;
      const error = new Error('Forbidden');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should default to 500 if status code < 400', () => {
      mockRes.statusCode = 200;
      const error = new Error('Unexpected error');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should handle null error gracefully', () => {
      errorHandler(null, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Unknown error occurred'
        })
      );
    });

    it('should handle undefined error gracefully', () => {
      errorHandler(undefined, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false
        })
      );
    });

    describe('Mongoose ValidationError', () => {
      it('should handle ValidationError with 400 status', () => {
        const error = {
          name: 'ValidationError',
          errors: {
            name: { message: 'Name is required' },
            email: { message: 'Email is invalid' }
          }
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: expect.stringContaining('Name is required')
          })
        );
      });

      it('should handle ValidationError with empty errors', () => {
        const error = {
          name: 'ValidationError',
          errors: {}
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Please check your input'
          })
        );
      });
    });

    describe('Mongoose CastError', () => {
      it('should handle CastError for _id with 400 status', () => {
        const error = {
          name: 'CastError',
          path: '_id'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Item not found'
          })
        );
      });

      it('should handle CastError for other fields', () => {
        const error = {
          name: 'CastError',
          path: 'quantity'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: expect.stringContaining('quantity')
          })
        );
      });

      it('should handle CastError with missing path', () => {
        const error = {
          name: 'CastError'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
      });
    });

    describe('MongoDB Duplicate Key Error (11000)', () => {
      it('should handle duplicate key error with field and value', () => {
        const error = {
          code: 11000,
          keyPattern: { email: 1 },
          keyValue: { email: 'test@example.com' }
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: expect.stringContaining('email')
          })
        );
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('test@example.com')
          })
        );
      });

      it('should handle duplicate key error without key info', () => {
        const error = {
          code: 11000
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: expect.stringContaining('already exists')
          })
        );
      });
    });

    describe('MongoDB Connection Errors', () => {
      it('should handle MongoNetworkError with 503 status', () => {
        const error = {
          name: 'MongoNetworkError',
          message: 'Connection failed'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Service temporarily unavailable. Please try again.'
          })
        );
      });

      it('should handle MongoTimeoutError with 503 status', () => {
        const error = {
          name: 'MongoTimeoutError',
          message: 'Connection timed out'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Service temporarily unavailable. Please try again.'
          })
        );
      });
    });

    describe('JWT Errors', () => {
      it('should handle JsonWebTokenError with 401 status', () => {
        const error = {
          name: 'JsonWebTokenError',
          message: 'Invalid token'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Please log in again'
          })
        );
      });

      it('should handle TokenExpiredError with 401 status', () => {
        const error = {
          name: 'TokenExpiredError',
          message: 'Token expired'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Session expired. Please log in again.'
          })
        );
      });
    });

    describe('Syntax Error (JSON parsing)', () => {
      it('should handle SyntaxError in request body with 400 status', () => {
        const error = new SyntaxError('Unexpected token');
        error.status = 400;
        error.body = 'invalid json';

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Please check your input and try again'
          })
        );
      });

      it('should not treat non-body SyntaxError as 400', () => {
        const error = new SyntaxError('Code error');
        error.status = 500;

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(500);
      });
    });

    describe('File System Errors', () => {
      it('should handle ENOENT with 404 status', () => {
        const error = {
          code: 'ENOENT',
          message: 'File not found'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Requested item not found'
          })
        );
      });

      it('should handle EACCES with 500 status', () => {
        const error = {
          code: 'EACCES',
          message: 'Permission denied'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Access not available. Please try again.'
          })
        );
      });

      it('should handle EPERM with 500 status', () => {
        const error = {
          code: 'EPERM',
          message: 'Operation not permitted'
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Access not available. Please try again.'
          })
        );
      });
    });

    describe('Development vs Production Mode', () => {
      it('should include stack trace in development mode', () => {
        process.env.NODE_ENV = 'development';
        const error = new Error('Test error');
        error.stack = 'Error: Test error\n    at test.js:1:1';

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            stack: expect.stringContaining('Error: Test error')
          })
        );
      });

      it('should not include stack trace in production mode', () => {
        process.env.NODE_ENV = 'production';
        const error = new Error('Test error');
        error.stack = 'Error: Test error\n    at test.js:1:1';

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.json).toHaveBeenCalledWith(
          expect.not.objectContaining({
            stack: expect.anything()
          })
        );
      });

      it('should not include stack trace in test mode', () => {
        process.env.NODE_ENV = 'test';
        const error = new Error('Test error');
        error.stack = 'Error: Test error\n    at test.js:1:1';

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.json).toHaveBeenCalledWith(
          expect.not.objectContaining({
            stack: expect.anything()
          })
        );
      });
    });

    describe('Response Structure', () => {
      it('should always include success: false in response', () => {
        const error = new Error('Any error');

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false
          })
        );
      });

      it('should always include message in response', () => {
        const error = new Error('');

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.any(String)
          })
        );
      });

      it('should use default message when error has no message', () => {
        const error = new Error();

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'Something went wrong. Please try again.'
          })
        );
      });
    });

    describe('Error Priority (order of error type checking)', () => {
      it('should prioritize ValidationError over generic handling', () => {
        const error = {
          name: 'ValidationError',
          message: 'General validation failed',
          errors: {
            field: { message: 'Specific field error' }
          }
        };

        errorHandler(error, mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Specific field error')
          })
        );
      });
    });
  });
});
