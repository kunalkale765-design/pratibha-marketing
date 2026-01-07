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
    enum: ['quintal', 'bag', 'kg', 'piece', 'ton'],
    default: 'quintal'
  },
  basePrice: {
    type: Number,
    required: [true, 'Base price is required'],
    min: [0, 'Price cannot be negative']
  },
  category: {
    type: String,
    trim: true,
    enum: ['leafy-greens', 'root', 'fruiting', 'gourd', 'grain', 'seed', 'fertilizer', 'pesticide', 'equipment', 'other'],
    default: 'other'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  stockQuantity: {
    type: Number,
    default: 0,
    min: [0, 'Stock quantity cannot be negative']
  },
  minStockLevel: {
    type: Number,
    default: 0,
    min: [0, 'Minimum stock level cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster searches
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });

// Virtual for checking if stock is low
productSchema.virtual('isLowStock').get(function() {
  return this.stockQuantity <= this.minStockLevel;
});

module.exports = mongoose.model('Product', productSchema);
