const AuditLog = require('../models/AuditLog');

/**
 * Log an audit event. Fire-and-forget - never throws.
 */
async function logAudit(req, action, resourceType, resourceId, changes = null) {
  try {
    await AuditLog.create({
      action,
      resourceType,
      resourceId,
      performedBy: req.user?._id || null,
      performedByName: req.user?.name || 'system',
      changes,
      ipAddress: req.ip
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAudit };
