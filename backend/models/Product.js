const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    unique: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    enum: ['quintal', 'bag', 'kg', 'piece', 'ton', 'bunch', 'box'],
    default: 'kg'
  },
  category: {
    type: String,
    trim: true,
    default: 'Other'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster searches (name already indexed via unique: true)
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1 }); // For filtering active/inactive products
productSchema.index({ isActive: 1, category: 1 }); // Compound for active products by category

module.exports = mongoose.model('Product', productSchema);
