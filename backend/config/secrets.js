/**
 * Centralized Secret Management
 *
 * SECURITY: This module validates that required secrets are configured.
 * It prevents the dangerous fallback to hardcoded default secrets that
 * could allow attackers to forge authentication tokens.
 */

// Skip validation in test environment (tests set their own secret)
if (process.env.NODE_ENV !== 'test' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  console.error('Set JWT_SECRET in your .env file or environment');
  process.exit(1);
}

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET
};
