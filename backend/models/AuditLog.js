const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN_FAILED', 'ACCOUNT_LOCKED',
      'CUSTOMER_UPDATED', 'CUSTOMER_DELETED',
      'ORDER_CANCELLED', 'ORDER_PRICE_UPDATED',
      'RECONCILIATION_COMPLETED',
      'PAYMENT_RECORDED', 'ADJUSTMENT_RECORDED'
    ]
  },
  resourceType: {
    type: String,
    required: true,
    enum: ['User', 'Customer', 'Order', 'LedgerEntry']
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  performedByName: String,
  changes: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
