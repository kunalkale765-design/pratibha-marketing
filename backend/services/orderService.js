const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const MarketRate = require('../models/MarketRate');
const { calculatePriceWithRate } = require('./pricingService');
const { assignOrderToBatch } = require('./batchScheduler');
const { roundTo2Decimals } = require('../utils/helpers');

/**
 * Create a new order with proper pricing, batch assignment, and contract price handling.
 * This is the single source of truth for order creation business logic.
 *
 * @param {Object} params
 * @param {string} params.customerId - Customer ID
 * @param {Array} params.products - Array of { product: id, quantity, rate? }
 * @param {string} [params.deliveryAddress] - Delivery address
 * @param {string} [params.notes] - Order notes
 * @param {string} [params.idempotencyKey] - Idempotency key for deduplication
 * @param {Object} params.user - The user creating the order { _id, role, customer }
 * @returns {Promise<{ order: Object, warnings: string[], newContractPrices: Array }>}
 * @throws {Object} { statusCode: number, message: string } on validation errors
 */
async function createOrder({ customerId, products, deliveryAddress, notes, idempotencyKey, user }) {
  // Check for idempotency
  if (idempotencyKey) {
    const existingOrder = await Order.findOne({ idempotencyKey })
      .populate('customer', 'name phone')
      .populate('products.product', 'name unit');

    if (existingOrder) {
      return { order: existingOrder, idempotent: true, warnings: [], newContractPrices: [] };
    }
  }

  // Verify customer exists and is active
  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw { statusCode: 404, message: 'Customer not found' };
  }
  if (!customer.isActive) {
    throw { statusCode: 400, message: 'Cannot create order for inactive customer' };
  }

  // SECURITY: Customers can only create orders for themselves
  if (user.role === 'customer') {
    const userCustomerId = typeof user.customer === 'object'
      ? user.customer._id.toString()
      : user.customer?.toString();

    if (userCustomerId !== customerId.toString()) {
      throw { statusCode: 403, message: 'You can only create orders for yourself' };
    }
  }

  // SECURITY: Contract customers can only order products with contract prices configured
  if (user.role === 'customer' && customer.pricingType === 'contract') {
    const contractProductIds = customer.contractPrices
      ? [...customer.contractPrices.keys()]
      : [];

    const requestedProductIds = products.map(p => p.product.toString());
    const unauthorizedProducts = requestedProductIds.filter(
      pid => !contractProductIds.includes(pid)
    );

    if (unauthorizedProducts.length > 0) {
      throw { statusCode: 403, message: 'Some products are not available for your account. Please contact us for pricing.' };
    }
  }

  // Pre-fetch all products and market rates to avoid race conditions
  const productIds = products.map(item => item.product);
  const [productDocs, marketRates] = await Promise.all([
    Product.find({ _id: { $in: productIds } }),
    MarketRate.find({ product: { $in: productIds } }).sort({ effectiveDate: -1 })
  ]);

  // Create lookup maps
  const productMap = new Map(productDocs.map(p => [p._id.toString(), p]));
  const rateMap = new Map();
  for (const rate of marketRates) {
    const productId = rate.product.toString();
    if (!rateMap.has(productId)) {
      rateMap.set(productId, rate.rate);
    }
  }

  // Calculate amounts and populate product names
  let totalAmount = 0;
  let usedPricingFallback = false;
  const processedProducts = [];
  const newContractPrices = [];

  for (const item of products) {
    const product = productMap.get(item.product.toString ? item.product.toString() : item.product);
    if (!product) {
      throw { statusCode: 404, message: `Product ${item.product} not found` };
    }
    if (!product.isActive) {
      throw { statusCode: 400, message: `Product "${product.name}" is no longer available` };
    }

    // Validate quantity precision based on unit type
    if (product.unit === 'piece' && !Number.isInteger(item.quantity)) {
      throw { statusCode: 400, message: `Product "${product.name}" is sold by piece and requires a whole number quantity (got ${item.quantity})` };
    }

    // Calculate rate based on customer's pricing type
    const priceResult = calculatePriceWithRate(customer, product, rateMap.get(product._id.toString()), item.rate);
    const amount = roundTo2Decimals(item.quantity * priceResult.rate);
    totalAmount += amount;

    if (priceResult.usedFallback) {
      usedPricingFallback = true;
    }

    if (priceResult.saveAsContractPrice) {
      newContractPrices.push({
        productId: product._id.toString(),
        productName: product.name,
        rate: priceResult.rate
      });
    }

    processedProducts.push({
      product: item.product,
      productName: product.name,
      quantity: item.quantity,
      unit: product.unit,
      rate: priceResult.rate,
      amount: amount,
      isContractPrice: priceResult.isContractPrice
    });
  }

  // Save new contract prices to customer if any
  let contractPriceSaveError = null;
  if (newContractPrices.length > 0) {
    try {
      const freshCustomer = await Customer.findById(customerId);
      if (freshCustomer && freshCustomer.pricingType === 'contract') {
        if (!freshCustomer.contractPrices) {
          freshCustomer.contractPrices = new Map();
        }
        for (const cp of newContractPrices) {
          freshCustomer.contractPrices.set(cp.productId, cp.rate);
        }
        freshCustomer.markModified('contractPrices');
        await freshCustomer.save();
      } else {
        console.warn(`[OrderService] Skipping contract price save: customer ${customerId} pricing type changed during order creation`);
        newContractPrices.length = 0;
      }
    } catch (contractError) {
      console.error(`[OrderService] Failed to save contract prices for customer ${customerId}:`, contractError.message);
      const failedPrices = [...newContractPrices];
      newContractPrices.length = 0;
      contractPriceSaveError = `Failed to save contract prices for: ${failedPrices.map(cp => cp.productName).join(', ')}. Please add them manually in customer management.`;
    }
  }

  // Assign order to appropriate batch
  const batch = await assignOrderToBatch(new Date());
  if (!batch || !batch._id) {
    throw { statusCode: 500, message: 'Failed to assign order to a batch. Please try again or contact support.' };
  }

  // Create the order
  const orderData = {
    customer: customerId,
    products: processedProducts,
    totalAmount: roundTo2Decimals(totalAmount),
    deliveryAddress,
    notes,
    usedPricingFallback,
    batch: batch._id
  };

  if (idempotencyKey) {
    orderData.idempotencyKey = idempotencyKey;
  }

  const order = await Order.create(orderData);

  // Populate and return
  const populatedOrder = await Order.findById(order._id)
    .populate('customer', 'name phone')
    .populate('products.product', 'name unit')
    .populate('batch', 'batchNumber batchType status');

  // Collect warnings
  const warnings = [];
  if (usedPricingFallback) {
    warnings.push('Some products used market rate fallback because contract prices were not set');
  }
  if (contractPriceSaveError) {
    warnings.push(contractPriceSaveError);
  }

  return {
    order: populatedOrder,
    idempotent: false,
    warnings,
    newContractPrices
  };
}

module.exports = { createOrder };
