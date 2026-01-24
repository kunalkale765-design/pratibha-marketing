const mongoose = require('mongoose');

// Schema for distributed locks
const lockSchema = new mongoose.Schema({
  _id: { type: String }, // Lock name as the primary key
  holder: { type: String, required: true }, // Instance identifier
  acquiredAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
});

lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Lock = mongoose.model('Lock', lockSchema);

// Generate a unique instance ID (hostname + PID + random)
const instanceId = `${require('os').hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Acquire a distributed lock using MongoDB atomic operations.
 * Only one instance can hold the lock at a time.
 *
 * @param {string} lockName - Unique name for the lock
 * @param {number} ttlMs - Lock TTL in milliseconds (auto-releases after this)
 * @returns {Promise<{acquired: boolean, holder: string}>}
 */
async function acquireLock(lockName, ttlMs = 5 * 60 * 1000) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    // Try to insert a new lock (atomic - only succeeds if no lock exists)
    // Or update an expired lock (where expiresAt < now)
    const result = await Lock.findOneAndUpdate(
      {
        _id: lockName,
        $or: [
          { expiresAt: { $lt: now } }, // Lock expired
          { _id: { $exists: false } }  // Lock doesn't exist (handled by upsert)
        ]
      },
      {
        $set: {
          holder: instanceId,
          acquiredAt: now,
          expiresAt: expiresAt
        }
      },
      { upsert: true, new: true }
    );

    // We got the lock if we're the holder
    const acquired = result.holder === instanceId;
    return { acquired, holder: result.holder };
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key = another instance holds the lock
      const existing = await Lock.findById(lockName).lean();
      return { acquired: false, holder: existing?.holder || 'unknown' };
    }
    throw err;
  }
}

/**
 * Release a distributed lock. Only the holder can release it.
 *
 * @param {string} lockName - The lock to release
 * @returns {Promise<boolean>} - Whether the lock was released
 */
async function releaseLock(lockName) {
  const result = await Lock.deleteOne({
    _id: lockName,
    holder: instanceId
  });
  return result.deletedCount > 0;
}

/**
 * Execute a function while holding a distributed lock.
 * Automatically acquires and releases the lock.
 *
 * @param {string} lockName - Unique lock name
 * @param {Function} fn - Async function to execute while holding lock
 * @param {Object} options
 * @param {number} options.ttlMs - Lock TTL (default: 5 minutes)
 * @param {number} options.timeoutMs - Max execution time before aborting (default: 30s)
 * @returns {Promise<{executed: boolean, result?: any, error?: Error, skipped?: boolean}>}
 */
async function withLock(lockName, fn, options = {}) {
  const { ttlMs = 5 * 60 * 1000, timeoutMs = 30000 } = options;

  const lock = await acquireLock(lockName, ttlMs);
  if (!lock.acquired) {
    return { executed: false, skipped: true, holder: lock.holder };
  }

  try {
    // Race the function against a timeout
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Lock operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
    return { executed: true, result };
  } catch (error) {
    return { executed: true, error };
  } finally {
    await releaseLock(lockName).catch(err => {
      console.error(`[Locks] Failed to release lock "${lockName}":`, err.message);
    });
  }
}

module.exports = { acquireLock, releaseLock, withLock, instanceId };
