/**
 * CSRF Middleware Tests
 *
 * Note: CSRF protection is skipped in test mode (NODE_ENV=test).
 * These tests verify the middleware functions directly.
 */

const { csrfTokenSetter, csrfProtection, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } = require('../middleware/csrf');

describe('CSRF Middleware', () => {
  let mockReq;
  let mockRes;
  let nextFn;

  beforeEach(() => {
    mockReq = {
      cookies: {},
      headers: {},
      method: 'GET',
      path: '/api/test'
    };

    mockRes = {
      cookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    nextFn = jest.fn();
  });

  describe('csrfTokenSetter', () => {
    it('should create new token when no cookie exists', () => {
      csrfTokenSetter(mockReq, mockRes, nextFn);

      expect(mockRes.cookie).toHaveBeenCalled();
      expect(nextFn).toHaveBeenCalled();
    });

    it('should not create new token when cookie exists', () => {
      mockReq.cookies[CSRF_COOKIE_NAME] = 'existing-token';

      csrfTokenSetter(mockReq, mockRes, nextFn);

      expect(mockRes.cookie).not.toHaveBeenCalled();
      expect(nextFn).toHaveBeenCalled();
    });

    it('should set cookie with correct options', () => {
      csrfTokenSetter(mockReq, mockRes, nextFn);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        CSRF_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          sameSite: 'lax', // Changed from 'strict' to allow navigation from external links
          path: '/'
        })
      );
    });

    it('should generate 64-character hex token', () => {
      csrfTokenSetter(mockReq, mockRes, nextFn);

      const tokenArg = mockRes.cookie.mock.calls[0][1];
      expect(tokenArg).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('csrfProtection', () => {
    describe('Safe Methods', () => {
      it('should skip validation for GET requests', () => {
        mockReq.method = 'GET';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(nextFn).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      it('should skip validation for HEAD requests', () => {
        mockReq.method = 'HEAD';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(nextFn).toHaveBeenCalled();
      });

      it('should skip validation for OPTIONS requests', () => {
        mockReq.method = 'OPTIONS';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(nextFn).toHaveBeenCalled();
      });
    });

    describe('Test Mode', () => {
      it('should skip validation in test mode', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'test';

        mockReq.method = 'POST';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(nextFn).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
      });
    });

    describe('Exempt Paths', () => {
      it('should skip validation for magic link path', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        mockReq.method = 'POST';
        mockReq.path = '/api/auth/magic/' + 'a1b2c3d4e5f6'.repeat(5) + 'a1b2'; // 64-char hex token

        csrfProtection(mockReq, mockRes, nextFn);

        expect(nextFn).toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
      });
    });

    describe('Token Validation (Non-Test Mode)', () => {
      beforeEach(() => {
        // Temporarily set to development mode for these tests
        process.env.NODE_ENV = 'development';
        mockReq.method = 'POST';
      });

      afterEach(() => {
        process.env.NODE_ENV = 'test';
      });

      it('should reject when cookie token is missing', () => {
        mockReq.headers[CSRF_HEADER_NAME] = 'some-token';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: 'CSRF token missing'
          })
        );
      });

      it('should reject when header token is missing', () => {
        mockReq.cookies[CSRF_COOKIE_NAME] = 'some-token';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'CSRF token missing'
          })
        );
      });

      it('should reject when tokens do not match', () => {
        mockReq.cookies[CSRF_COOKIE_NAME] = 'cookie-token';
        mockReq.headers[CSRF_HEADER_NAME] = 'header-token';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'CSRF token mismatch'
          })
        );
      });

      it('should allow request when tokens match', () => {
        const token = 'valid-matching-token';
        mockReq.cookies[CSRF_COOKIE_NAME] = token;
        mockReq.headers[CSRF_HEADER_NAME] = token;

        csrfProtection(mockReq, mockRes, nextFn);

        expect(nextFn).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      it('should validate POST requests', () => {
        mockReq.method = 'POST';
        mockReq.cookies[CSRF_COOKIE_NAME] = 'token';
        mockReq.headers[CSRF_HEADER_NAME] = 'token';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(nextFn).toHaveBeenCalled();
      });

      it('should validate PUT requests', () => {
        mockReq.method = 'PUT';
        mockReq.cookies[CSRF_COOKIE_NAME] = 'token';
        mockReq.headers[CSRF_HEADER_NAME] = 'token';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(nextFn).toHaveBeenCalled();
      });

      it('should validate DELETE requests', () => {
        mockReq.method = 'DELETE';
        mockReq.cookies[CSRF_COOKIE_NAME] = 'token';
        mockReq.headers[CSRF_HEADER_NAME] = 'token';

        csrfProtection(mockReq, mockRes, nextFn);

        expect(nextFn).toHaveBeenCalled();
      });
    });
  });

  describe('Constants', () => {
    it('should export correct cookie name', () => {
      expect(CSRF_COOKIE_NAME).toBe('csrf_token');
    });

    it('should export correct header name', () => {
      expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
    });
  });
});
