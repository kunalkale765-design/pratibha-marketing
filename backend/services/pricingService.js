const { roundTo2Decimals } = require('../utils/helpers');

/**
 * Calculate price for a product based on customer's pricing type.
 * Single source of truth for all pricing logic in the application.
 *
 * @param {Object} customer - Customer document with pricingType, contractPrices, markupPercentage
 * @param {Object} product - Product document with _id
 * @param {number} prefetchedMarketRate - The current market rate for this product
 * @param {number|null} requestedRate - Staff-provided rate override (optional)
 * @returns {{ rate: number, usedFallback: boolean, isContractPrice: boolean, saveAsContractPrice: boolean }}
 */
function calculatePriceWithRate(customer, product, prefetchedMarketRate, requestedRate = null) {
  const pricingType = customer.pricingType || 'market';
  const marketRate = prefetchedMarketRate || 0;
  const productId = product._id.toString();

  // For contract customers, contract prices are LOCKED
  if (pricingType === 'contract') {
    const existingContractPrice = customer.contractPrices?.get
      ? customer.contractPrices.get(productId)
      : customer.contractPrices?.[productId];

    if (existingContractPrice !== undefined && existingContractPrice !== null) {
      // Contract price exists - ALWAYS use it (ignore any staff-provided rate)
      return {
        rate: existingContractPrice,
        usedFallback: false,
        isContractPrice: true,
        saveAsContractPrice: false
      };
    }

    // No contract price exists for this product
    if (requestedRate !== null && requestedRate !== undefined && requestedRate > 0) {
      // Staff provided a rate - use it and mark for saving as new contract price
      return {
        rate: requestedRate,
        usedFallback: false,
        isContractPrice: true,
        saveAsContractPrice: true
      };
    }

    // No contract price and no staff rate - fall back to market rate
    return {
      rate: marketRate,
      usedFallback: true,
      isContractPrice: false,
      saveAsContractPrice: false
    };
  }

  // For non-contract customers (market/markup), use staff rate if provided
  if (requestedRate !== null && requestedRate !== undefined && requestedRate > 0) {
    return {
      rate: requestedRate,
      usedFallback: false,
      isContractPrice: false,
      saveAsContractPrice: false
    };
  }

  // Calculate based on pricing type
  if (pricingType === 'markup') {
    const markup = customer.markupPercentage || 0;
    return {
      rate: roundTo2Decimals(marketRate * (1 + markup / 100)),
      usedFallback: false,
      isContractPrice: false,
      saveAsContractPrice: false
    };
  }

  // Market pricing (default)
  return {
    rate: roundTo2Decimals(marketRate),
    usedFallback: false,
    isContractPrice: false,
    saveAsContractPrice: false
  };
}

/**
 * Calculate the effective rate for a customer given a market rate.
 * Simplified version for bulk updates (no staff override, no contract save logic).
 *
 * @param {Object} customer - Customer with pricingType, markupPercentage
 * @param {number} marketRate - Current market rate
 * @returns {number} The effective rate for this customer
 */
function calculateEffectiveRate(customer, marketRate) {
  const pricingType = customer.pricingType || 'market';

  if (pricingType === 'markup') {
    const markup = customer.markupPercentage || 0;
    return roundTo2Decimals(marketRate * (1 + markup / 100));
  }

  return roundTo2Decimals(marketRate);
}

module.exports = {
  calculatePriceWithRate,
  calculateEffectiveRate
};
