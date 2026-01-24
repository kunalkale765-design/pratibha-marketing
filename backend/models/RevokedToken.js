const mongoose = require('mongoose');

const revokedTokenSchema = new mongoose.Schema({
  jti: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  expiresAt: {
    type: Date,
    required: true
  },
  revokedAt: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    enum: ['logout', 'password_change', 'admin_revoke'],
    default: 'logout'
  }
});

// TTL index: automatically delete documents after their JWT would have expired
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to check if a token is revoked
revokedTokenSchema.statics.isRevoked = async function(jti) {
  if (!jti) return false;
  const entry = await this.findOne({ jti }).lean();
  return !!entry;
};

// Static method to revoke a token
revokedTokenSchema.statics.revokeToken = async function(jti, userId, expiresAt, reason = 'logout') {
  try {
    await this.create({ jti, userId, expiresAt, reason });
  } catch (err) {
    // Ignore duplicate key errors (token already revoked)
    if (err.code !== 11000) throw err;
  }
};

// Static method to revoke all tokens for a user (via tokenVersion bump)
// This is used when password changes - we don't need to find individual tokens
// because protect() middleware checks tokenVersion
revokedTokenSchema.statics.revokeAllForUser = async function(userId, reason = 'password_change') {
  // No-op: tokenVersion check in protect() handles this without needing to track individual tokens
};

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
