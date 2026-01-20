const mongoose = require('mongoose');

const jobLogSchema = new mongoose.Schema({
  jobName: {
    type: String,
    required: true,
    index: true
  },
  executedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    required: true
  },
  result: {
    type: mongoose.Schema.Types.Mixed
  },
  error: {
    type: String
  }
}, {
  timestamps: true
});

// Index for finding last execution of a job
jobLogSchema.index({ jobName: 1, executedAt: -1 });

module.exports = mongoose.model('JobLog', jobLogSchema);
