const mongoose = require('mongoose');

// Counter model for atomic sequence generation
// Used to prevent race conditions in order number generation
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Counter name (e.g., "order_ORD2601")
  seq: { type: Number, default: 0 }
});

// Get next sequence value atomically
counterSchema.statics.getNextSequence = async function(name) {
  try {
    const counter = await this.findByIdAndUpdate(
      name,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    if (!counter || typeof counter.seq !== 'number') {
      throw new Error(`Invalid counter state for ${name}`);
    }

    return counter.seq;
  } catch (error) {
    console.error(`Counter.getNextSequence failed for "${name}":`, error.message);
    throw new Error(`Counter operation failed: ${error.message}`);
  }
};

module.exports = mongoose.model('Counter', counterSchema);
