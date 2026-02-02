const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs').promises;
const companies = require('../config/companies');
const Counter = require('../models/Counter');
const Order = require('../models/Order');
const Product = require('../models/Product');
const MarketRate = require('../models/MarketRate');
const Customer = require('../models/Customer');
const { calculateEffectiveRate } = require('./pricingService');
const { roundTo2Decimals } = require('../utils/helpers');
const { formatDateIST, getISTYearMonthPrefix } = require('../utils/dateTime');

// Storage directory for delivery bills
const BILL_STORAGE_DIR = path.join(__dirname, '..', 'storage', 'delivery-bills');

/**
 * Ensure storage directory exists
 */
async function ensureStorageDir() {
  try {
    await fs.mkdir(BILL_STORAGE_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Format date for display (DD/MM/YYYY) in IST.
 * Wraps centralized utility with service-specific error messaging.
 */
function formatDate(date, context = 'unknown') {
  try {
    return formatDateIST(date, context);
  } catch (err) {
    throw new Error(`[DeliveryBillService] Cannot generate bill: ${err.message}`);
  }
}

/**
 * Format number as currency
 * Throws on invalid amounts to prevent incorrect bills from being printed
 */
function formatCurrency(amount, context = 'unknown') {
  if (amount === null || amount === undefined || isNaN(amount)) {
    throw new Error(`[DeliveryBillService] Cannot generate bill: invalid amount "${amount}" (context: ${context}). Fix the order data before generating bills.`);
  }
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generate unique bill number
 * Format: BILL{YY}{MM}{0001}
 */
async function generateBillNumber() {
  const { prefix } = getISTYearMonthPrefix();
  const billPrefix = `BILL${prefix}`;
  const counterName = `deliverybill_${billPrefix}`;

  const seq = await Counter.getNextSequence(counterName);
  return `${billPrefix}${seq.toString().padStart(4, '0')}`;
}

/**
 * Update order prices for market/markup customers using latest rates
 */
async function updateOrderPrices(order) {
  const customer = await Customer.findById(order.customer);
  if (!customer) {
    throw new Error(`[DeliveryBillService] Cannot generate bill for order ${order.orderNumber || order._id}: customer not found (ID: ${order.customer}). Customer may have been deleted.`);
  }

  // Only update for market and markup pricing types
  if (customer.pricingType !== 'market' && customer.pricingType !== 'markup') {
    return order;
  }

  // Batch fetch all market rates to avoid N+1 queries
  const productIds = order.products.map(item => item.product);
  const marketRates = await MarketRate.find({ product: { $in: productIds } })
    .sort({ effectiveDate: -1 });

  // Build rate map (first entry per product is latest due to sort)
  const marketRateMap = new Map();
  marketRates.forEach(mr => {
    const pid = mr.product.toString();
    if (!marketRateMap.has(pid)) {
      marketRateMap.set(pid, mr.rate);
    }
  });

  let totalAmount = 0;
  const updatedProducts = [];

  for (const item of order.products) {
    // Get market rate from pre-fetched map
    const marketRate = marketRateMap.get(item.product.toString());
    if (marketRate === null || marketRate === undefined) {
      // Keep original rate if no market rate available
      updatedProducts.push(item);
      totalAmount += item.amount;
      continue;
    }

    const newRate = calculateEffectiveRate(customer, marketRate);

    const newAmount = roundTo2Decimals(item.quantity * newRate);
    updatedProducts.push({
      ...item.toObject ? item.toObject() : item,
      rate: newRate,
      amount: newAmount
    });
    totalAmount += newAmount;
  }

  order.products = updatedProducts;
  order.totalAmount = roundTo2Decimals(totalAmount);

  return order;
}

/**
 * Split order items by firm based on product categories
 */
async function splitOrderByFirm(order) {
  // Get product categories
  const productIds = order.products.map(p => p.product);
  const products = await Product.find({ _id: { $in: productIds } }).select('_id category');
  const categoryMap = {};
  products.forEach(p => {
    categoryMap[p._id.toString()] = p.category;
  });

  const result = {};

  // Initialize result with all firms
  companies.firms.forEach(firm => {
    result[firm.id] = {
      firm: firm,
      items: [],
      subtotal: 0
    };
  });

  // Assign each product to appropriate firm
  order.products.forEach(product => {
    const productId = (product.product?._id || product.product).toString();
    const category = categoryMap[productId] || 'Other';
    const firm = companies.getFirmForCategory(category);

    result[firm.id].items.push({
      ...product.toObject ? product.toObject() : product,
      category: category
    });
    result[firm.id].subtotal += product.amount || 0;
  });

  // Remove empty firms
  Object.keys(result).forEach(firmId => {
    if (result[firmId].items.length === 0) {
      delete result[firmId];
    }
  });

  return result;
}

/**
 * Render a single bill page
 * @param {PDFDocument} doc - PDFKit document
 * @param {Object} billData - Bill data
 * @param {string} copyType - 'ORIGINAL' or 'DUPLICATE'
 */
function renderBillPage(doc, billData, copyType) {
  // Colors
  const primaryColor = '#2e3532';
  const accentColor = '#7e9181';
  const lightGray = '#f5f5f5';

  // Watermark
  doc.fontSize(60)
    .fillColor('#e0e0e0')
    .rotate(-45, { origin: [300, 400] })
    .text(copyType, 150, 400, { opacity: 0.3 })
    .rotate(45, { origin: [300, 400] });

  // Header - Company Info
  doc.fontSize(18)
    .fillColor(primaryColor)
    .font('Helvetica-Bold')
    .text(billData.firm.name, 50, 50);

  doc.fontSize(9)
    .font('Helvetica')
    .fillColor('#666666')
    .text(billData.firm.address, 50, 72)
    .text(`Phone: ${billData.firm.phone}`, 50, 85)
    .text(`Email: ${billData.firm.email || ''}`, 50, 98);

  // Bill Title
  doc.fontSize(22)
    .fillColor(accentColor)
    .font('Helvetica-Bold')
    .text('DELIVERY BILL', 380, 50, { align: 'right' });

  // Bill Details
  doc.fontSize(9)
    .fillColor(primaryColor)
    .font('Helvetica')
    .text(`Bill No: ${billData.billNumber}`, 380, 80, { align: 'right' })
    .text(`Date: ${formatDate(billData.date)}`, 380, 93, { align: 'right' })
    .text(`Order: ${billData.orderNumber}`, 380, 106, { align: 'right' })
    .text(`Batch: ${billData.batchNumber}`, 380, 119, { align: 'right' });

  // Divider line
  doc.moveTo(50, 138)
    .lineTo(545, 138)
    .strokeColor(accentColor)
    .lineWidth(2)
    .stroke();

  // Customer Section
  doc.fontSize(11)
    .fillColor(accentColor)
    .font('Helvetica-Bold')
    .text('Deliver To:', 50, 155);

  doc.fontSize(11)
    .fillColor(primaryColor)
    .font('Helvetica-Bold')
    .text(billData.customer.name, 50, 172);

  doc.fontSize(9)
    .font('Helvetica')
    .fillColor('#666666');

  let yPos = 187;
  if (billData.customer.address) {
    doc.text(billData.customer.address, 50, yPos);
    yPos += 13;
  }
  if (billData.customer.phone) {
    doc.text(`Phone: ${billData.customer.phone}`, 50, yPos);
    yPos += 13;
  }

  // Products Table
  const tableTop = Math.max(yPos + 15, 230);
  const tableHeaders = ['#', 'Product', 'Qty', 'Unit', 'Rate', 'Amount'];
  const colWidths = [25, 210, 50, 45, 70, 95];
  const colPositions = [50];
  for (let i = 0; i < colWidths.length - 1; i++) {
    colPositions.push(colPositions[i] + colWidths[i]);
  }

  // Table Header Background
  doc.rect(50, tableTop, 495, 22)
    .fillColor(accentColor)
    .fill();

  // Table Header Text
  doc.fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(9);

  tableHeaders.forEach((header, i) => {
    const align = i >= 2 ? 'right' : 'left';
    doc.text(header, colPositions[i] + (align === 'right' ? 0 : 5), tableTop + 7, {
      width: colWidths[i] - 10,
      align: align
    });
  });

  // Table Rows
  let currentY = tableTop + 27;
  doc.font('Helvetica').fontSize(9).fillColor(primaryColor);

  billData.items.forEach((item, index) => {
    // Alternate row background
    if (index % 2 === 0) {
      doc.rect(50, currentY - 4, 495, 22)
        .fillColor(lightGray)
        .fill();
      doc.fillColor(primaryColor);
    }

    // Row data
    doc.text((index + 1).toString(), colPositions[0] + 5, currentY, { width: colWidths[0] - 10 });
    doc.text(item.name || item.productName, colPositions[1] + 5, currentY, { width: colWidths[1] - 10 });
    doc.text(item.quantity.toString(), colPositions[2], currentY, { width: colWidths[2] - 10, align: 'right' });
    doc.text(item.unit, colPositions[3], currentY, { width: colWidths[3] - 10, align: 'right' });
    doc.text(formatCurrency(item.rate), colPositions[4], currentY, { width: colWidths[4] - 10, align: 'right' });
    doc.text(formatCurrency(item.amount), colPositions[5], currentY, { width: colWidths[5] - 10, align: 'right' });

    currentY += 22;
  });

  // Total Section
  const totalY = currentY + 12;

  doc.rect(350, totalY, 195, 28)
    .fillColor(primaryColor)
    .fill();

  doc.fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Total:', 360, totalY + 8)
    .text(formatCurrency(billData.total), 455, totalY + 8, { width: 80, align: 'right' });

  // Footer with copy type indicator
  const footerY = Math.min(totalY + 60, 770);
  doc.fillColor('#999999')
    .font('Helvetica')
    .fontSize(9)
    .text(`${copyType} COPY`, 50, footerY, { align: 'center', width: 495 });
}

/**
 * Generate PDF for a delivery bill with both ORIGINAL and DUPLICATE copies
 * @param {Object} billData - Bill data
 * @returns {Promise<Buffer>} PDF buffer with both copies
 */
async function generateBillPDF(billData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Delivery Bill ${billData.billNumber}`,
          Author: billData.firm.name
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Page 1: ORIGINAL copy
      renderBillPage(doc, billData, 'ORIGINAL');

      // Page 2: DUPLICATE copy
      doc.addPage();
      renderBillPage(doc, billData, 'DUPLICATE');

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Process a single order's bill generation
 * @param {Object} order - Order document (populated)
 * @param {Object} batch - Batch document
 * @returns {Object} Result for this order
 */
async function generateBillForOrder(order, batch) {
  // Update prices for market/markup customers (in-memory only, saved after bills succeed)
  const updatedOrder = await updateOrderPrices(order);

  // Split order by firm
  const firmSplit = await splitOrderByFirm(updatedOrder);

  const orderBills = [];
  let orderBillNumber = null;

  // Generate bill for each firm portion
  for (const [firmId, firmData] of Object.entries(firmSplit)) {
    if (firmData.items.length === 0) continue;

    const billNumber = await generateBillNumber();

    if (!orderBillNumber) {
      orderBillNumber = billNumber;
    }

    const billData = {
      billNumber: billNumber,
      orderNumber: updatedOrder.orderNumber,
      batchNumber: batch.batchNumber,
      date: new Date(),
      firm: {
        id: firmId,
        name: firmData.firm.name,
        address: firmData.firm.address,
        phone: firmData.firm.phone,
        email: firmData.firm.email
      },
      customer: {
        name: updatedOrder.customer?.name || 'Unknown Customer',
        phone: updatedOrder.customer?.phone || '',
        address: updatedOrder.deliveryAddress || updatedOrder.customer?.address || ''
      },
      items: firmData.items.map(item => ({
        name: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        amount: item.amount
      })),
      total: firmData.subtotal
    };

    // Generate combined PDF with both ORIGINAL and DUPLICATE copies
    const billPdf = await generateBillPDF(billData);

    // Build descriptive filename: "Customer Name 29 Jan.pdf"
    const customerName = (updatedOrder.customer?.name || 'Unknown').replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const billDate = new Date();
    const day = billDate.toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' });
    const month = billDate.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' });
    const displayFilename = `${customerName} ${day} ${month}.pdf`;
    // Safe filename for disk storage (no spaces)
    const storageFilename = `${billNumber}.pdf`;
    await fs.writeFile(path.join(BILL_STORAGE_DIR, storageFilename), billPdf);

    orderBills.push({
      billNumber: billNumber,
      orderNumber: updatedOrder.orderNumber,
      firmId: firmId,
      firmName: firmData.firm.name,
      total: firmData.subtotal,
      pdfPath: storageFilename,
      displayFilename: displayFilename
    });
  }

  // Mark order as having delivery bill generated
  updatedOrder.deliveryBillGenerated = true;
  updatedOrder.deliveryBillGeneratedAt = new Date();
  updatedOrder.deliveryBillNumber = orderBillNumber;
  await updatedOrder.save();

  return orderBills;
}

/**
 * Generate delivery bills for all orders in a batch
 * Uses controlled concurrency to avoid blocking the event loop
 * @param {Object} batch - Batch document
 * @returns {Object} Result with generated bills info
 */
async function generateBillsForBatch(batch) {
  await ensureStorageDir();

  // Get confirmed orders that don't already have bills (idempotent)
  const orders = await Order.find({
    batch: batch._id,
    status: 'confirmed',
    deliveryBillGenerated: { $ne: true }
  }).populate('customer', 'name phone address pricingType markupPercentage');

  const results = {
    totalOrders: orders.length,
    billsGenerated: 0,
    errors: [],
    bills: []
  };

  // Process orders in parallel with concurrency limit of 5
  const CONCURRENCY = 5;
  for (let i = 0; i < orders.length; i += CONCURRENCY) {
    const chunk = orders.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.allSettled(
      chunk.map(order => generateBillForOrder(order, batch))
    );

    chunkResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.bills.push(...result.value);
        results.billsGenerated += result.value.length;
      } else {
        const order = chunk[idx];
        console.error(`Error generating bill for order ${order.orderNumber}:`, result.reason);
        results.errors.push({
          orderNumber: order.orderNumber,
          error: result.reason.message
        });
      }
    });
  }

  return results;
}

/**
 * Get bill PDF path safely (prevents path traversal)
 */
function getSafeBillPath(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Bill filename is required');
  }

  // Strict whitelist: only allow alphanumeric, hyphen, underscore, dot followed by .pdf
  if (!/^[a-zA-Z0-9_-]+\.pdf$/.test(filename)) {
    throw new Error('Invalid bill filename format');
  }

  const sanitizedFilename = path.basename(filename);
  const fullPath = path.join(BILL_STORAGE_DIR, sanitizedFilename);

  const resolvedPath = path.resolve(fullPath);
  const resolvedStorageDir = path.resolve(BILL_STORAGE_DIR);
  if (!resolvedPath.startsWith(resolvedStorageDir + path.sep) && resolvedPath !== resolvedStorageDir) {
    throw new Error('Invalid bill path');
  }

  if (resolvedPath === resolvedStorageDir) {
    throw new Error('Invalid bill path');
  }

  return resolvedPath;
}

/**
 * Read bill PDF
 */
async function readBillPdf(filename) {
  const safePath = getSafeBillPath(filename);
  return await fs.readFile(safePath);
}

module.exports = {
  generateBillNumber,
  updateOrderPrices,
  splitOrderByFirm,
  generateBillPDF,
  generateBillsForBatch,
  getSafeBillPath,
  readBillPdf,
  BILL_STORAGE_DIR
};
