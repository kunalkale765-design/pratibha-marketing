const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs').promises;
const companies = require('../config/companies');
const Counter = require('../models/Counter');
const Order = require('../models/Order');
const Product = require('../models/Product');
const MarketRate = require('../models/MarketRate');
const Customer = require('../models/Customer');

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
 * Helper function to round to 2 decimal places
 */
function roundTo2Decimals(num) {
  return Math.round(num * 100) / 100;
}

/**
 * Format date for display (DD/MM/YYYY)
 */
function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format number as currency
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return 'Rs. 0.00';
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generate unique bill number
 * Format: BILL{YY}{MM}{0001}
 */
async function generateBillNumber() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const prefix = `BILL${year}${month}`;
  const counterName = `deliverybill_${prefix}`;

  const seq = await Counter.getNextSequence(counterName);
  return `${prefix}${seq.toString().padStart(4, '0')}`;
}

/**
 * Update order prices for market/markup customers using latest rates
 */
async function updateOrderPrices(order) {
  const customer = await Customer.findById(order.customer);
  if (!customer) return order;

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

    let newRate = marketRate;
    if (customer.pricingType === 'markup') {
      const markup = customer.markupPercentage || 0;
      newRate = roundTo2Decimals(marketRate * (1 + markup / 100));
    }

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

// PDF Layout Constants
const PAGE_HEIGHT = 841;  // A4 height in points
const PAGE_MARGIN = 50;
const TABLE_ROW_HEIGHT = 22;
const TABLE_HEADER_HEIGHT = 22;
const HEADER_HEIGHT = 230;  // Space for company info, bill details, customer
const FOOTER_HEIGHT = 100;  // Space for total section and footer
const MAX_ITEMS_Y = PAGE_HEIGHT - PAGE_MARGIN - FOOTER_HEIGHT;  // ~691

// Table configuration
const TABLE_HEADERS = ['#', 'Product', 'Qty', 'Unit', 'Rate', 'Amount'];
const COL_WIDTHS = [25, 210, 50, 45, 70, 95];

function getColPositions() {
  const positions = [50];
  for (let i = 0; i < COL_WIDTHS.length - 1; i++) {
    positions.push(positions[i] + COL_WIDTHS[i]);
  }
  return positions;
}

/**
 * Render the watermark for a page
 */
function renderWatermark(doc, copyType) {
  doc.save();
  doc.fontSize(60)
    .fillColor('#e0e0e0')
    .rotate(-45, { origin: [300, 400] })
    .text(copyType, 150, 400, { opacity: 0.3 })
    .rotate(45, { origin: [300, 400] });
  doc.restore();
}

/**
 * Render the bill header (company info, bill details, customer)
 * @returns {number} Y position where table should start
 */
function renderBillHeader(doc, billData, copyType, pageNum, totalPages) {
  const primaryColor = '#2e3532';
  const accentColor = '#7e9181';

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

  // Page number (only show if multiple pages)
  if (totalPages > 1) {
    doc.fontSize(8)
      .fillColor('#999999')
      .text(`Page ${pageNum} of ${totalPages}`, 380, 132, { align: 'right' });
  }

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

  return Math.max(yPos + 15, 230);
}

/**
 * Render table header row
 */
function renderTableHeader(doc, tableTop) {
  const accentColor = '#7e9181';
  const colPositions = getColPositions();

  // Table Header Background
  doc.rect(50, tableTop, 495, TABLE_HEADER_HEIGHT)
    .fillColor(accentColor)
    .fill();

  // Table Header Text
  doc.fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(9);

  TABLE_HEADERS.forEach((header, i) => {
    const align = i >= 2 ? 'right' : 'left';
    doc.text(header, colPositions[i] + (align === 'right' ? 0 : 5), tableTop + 7, {
      width: COL_WIDTHS[i] - 10,
      align: align
    });
  });

  return tableTop + TABLE_HEADER_HEIGHT + 5;
}

/**
 * Render a single table row
 */
function renderTableRow(doc, item, index, currentY, isAlternate) {
  const primaryColor = '#2e3532';
  const lightGray = '#f5f5f5';
  const colPositions = getColPositions();

  // Alternate row background
  if (isAlternate) {
    doc.rect(50, currentY - 4, 495, TABLE_ROW_HEIGHT)
      .fillColor(lightGray)
      .fill();
  }

  doc.font('Helvetica').fontSize(9).fillColor(primaryColor);

  // Row data
  doc.text((index + 1).toString(), colPositions[0] + 5, currentY, { width: COL_WIDTHS[0] - 10 });
  doc.text(item.name || item.productName, colPositions[1] + 5, currentY, { width: COL_WIDTHS[1] - 10 });
  doc.text(item.quantity.toString(), colPositions[2], currentY, { width: COL_WIDTHS[2] - 10, align: 'right' });
  doc.text(item.unit, colPositions[3], currentY, { width: COL_WIDTHS[3] - 10, align: 'right' });
  doc.text(formatCurrency(item.rate), colPositions[4], currentY, { width: COL_WIDTHS[4] - 10, align: 'right' });
  doc.text(formatCurrency(item.amount), colPositions[5], currentY, { width: COL_WIDTHS[5] - 10, align: 'right' });
}

/**
 * Render the total section and footer
 */
function renderBillFooter(doc, billData, copyType, currentY) {
  const primaryColor = '#2e3532';

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
 * Calculate total pages needed for items
 */
function calculateTotalPages(itemCount) {
  // First page has less space due to header
  const firstPageItems = Math.floor((MAX_ITEMS_Y - HEADER_HEIGHT - TABLE_HEADER_HEIGHT) / TABLE_ROW_HEIGHT);
  // Continuation pages have more space (no customer section)
  const continuationPageItems = Math.floor((MAX_ITEMS_Y - 80 - TABLE_HEADER_HEIGHT) / TABLE_ROW_HEIGHT);

  if (itemCount <= firstPageItems) {
    return 1;
  }

  const remainingItems = itemCount - firstPageItems;
  return 1 + Math.ceil(remainingItems / continuationPageItems);
}

/**
 * Render a bill copy (ORIGINAL or DUPLICATE) with proper pagination
 * @param {PDFDocument} doc - PDFKit document
 * @param {Object} billData - Bill data
 * @param {string} copyType - 'ORIGINAL' or 'DUPLICATE'
 * @param {boolean} isFirstCopy - Whether this is the first copy (don't add page before)
 */
function renderBillCopy(doc, billData, copyType, isFirstCopy) {
  const totalPages = calculateTotalPages(billData.items.length);
  let itemIndex = 0;
  let pageNum = 1;

  while (itemIndex < billData.items.length) {
    // Add new page (except for first page of first copy)
    if (!(isFirstCopy && pageNum === 1)) {
      doc.addPage();
    }

    // Render watermark
    renderWatermark(doc, copyType);

    // Render header
    let tableTop;
    if (pageNum === 1) {
      // Full header on first page
      tableTop = renderBillHeader(doc, billData, copyType, pageNum, totalPages);
    } else {
      // Condensed header on continuation pages
      const primaryColor = '#2e3532';
      const accentColor = '#7e9181';

      doc.fontSize(12)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(`${billData.firm.name} - ${billData.billNumber}`, 50, 50);

      doc.fontSize(9)
        .fillColor('#666666')
        .font('Helvetica')
        .text(`Customer: ${billData.customer.name}`, 50, 68)
        .text(`Page ${pageNum} of ${totalPages}`, 380, 50, { align: 'right' });

      doc.moveTo(50, 85)
        .lineTo(545, 85)
        .strokeColor(accentColor)
        .lineWidth(1)
        .stroke();

      tableTop = 95;
    }

    // Render table header
    let currentY = renderTableHeader(doc, tableTop);

    // Calculate how many items fit on this page
    const availableHeight = MAX_ITEMS_Y - currentY;
    const itemsPerPage = Math.floor(availableHeight / TABLE_ROW_HEIGHT);

    // Render items for this page
    const endIndex = Math.min(itemIndex + itemsPerPage, billData.items.length);

    for (let i = itemIndex; i < endIndex; i++) {
      renderTableRow(doc, billData.items[i], i, currentY, i % 2 === 0);
      currentY += TABLE_ROW_HEIGHT;
    }

    // If this is the last page, render footer with total
    if (endIndex >= billData.items.length) {
      renderBillFooter(doc, billData, copyType, currentY);
    } else {
      // Show "Continued on next page" indicator
      doc.fontSize(8)
        .fillColor('#999999')
        .font('Helvetica-Oblique')
        .text('Continued on next page...', 50, PAGE_HEIGHT - PAGE_MARGIN - 20, {
          align: 'right',
          width: 495
        });
    }

    itemIndex = endIndex;
    pageNum++;
  }
}

/**
 * Generate PDF for a delivery bill with both ORIGINAL and DUPLICATE copies
 * Properly handles pagination for large orders
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

      // ORIGINAL copy (with pagination)
      renderBillCopy(doc, billData, 'ORIGINAL', true);

      // DUPLICATE copy (with pagination)
      renderBillCopy(doc, billData, 'DUPLICATE', false);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate delivery bills for all orders in a batch
 * @param {Object} batch - Batch document
 * @returns {Object} Result with generated bills info
 */
async function generateBillsForBatch(batch) {
  await ensureStorageDir();

  // Get all confirmed orders in the batch
  const orders = await Order.find({
    batch: batch._id,
    status: 'confirmed'
  }).populate('customer', 'name phone address pricingType markupPercentage');

  const results = {
    totalOrders: orders.length,
    billsGenerated: 0,
    errors: [],
    bills: []
  };

  for (const order of orders) {
    try {
      // Update prices for market/markup customers
      const updatedOrder = await updateOrderPrices(order);
      await updatedOrder.save();

      // Split order by firm
      const firmSplit = await splitOrderByFirm(updatedOrder);

      // Track the first bill number for this order (order can have multiple bills if split by firm)
      let orderBillNumber = null;

      // Generate bill for each firm portion
      for (const [firmId, firmData] of Object.entries(firmSplit)) {
        if (firmData.items.length === 0) continue;

        const billNumber = await generateBillNumber();

        // Store first bill number for the order
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

        // Save PDF
        const filename = `${billNumber}.pdf`;
        await fs.writeFile(path.join(BILL_STORAGE_DIR, filename), billPdf);

        results.bills.push({
          billNumber: billNumber,
          orderNumber: updatedOrder.orderNumber,
          firmId: firmId,
          firmName: firmData.firm.name,
          total: firmData.subtotal,
          pdfPath: filename
        });

        results.billsGenerated++;
      }

      // Mark order as having delivery bill generated and store bill number
      updatedOrder.deliveryBillGenerated = true;
      updatedOrder.deliveryBillGeneratedAt = new Date();
      updatedOrder.deliveryBillNumber = orderBillNumber;  // Store for consistent redownloads
      await updatedOrder.save();

    } catch (error) {
      console.error(`Error generating bill for order ${order.orderNumber}:`, error);
      results.errors.push({
        orderNumber: order.orderNumber,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Get bill PDF path safely (prevents path traversal)
 */
function getSafeBillPath(filename) {
  if (!filename) {
    throw new Error('Bill filename is required');
  }
  const sanitizedFilename = path.basename(filename);
  const fullPath = path.join(BILL_STORAGE_DIR, sanitizedFilename);

  const resolvedPath = path.resolve(fullPath);
  const resolvedStorageDir = path.resolve(BILL_STORAGE_DIR);
  if (!resolvedPath.startsWith(resolvedStorageDir + path.sep)) {
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
