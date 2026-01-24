const PDFDocument = require('pdfkit');
const companies = require('../config/companies');
const Counter = require('../models/Counter');
const { formatDateIST, getISTYearMonthPrefix } = require('../utils/dateTime');

/**
 * Invoice Service
 * Handles invoice generation, PDF creation, and order splitting by firm
 */

/**
 * Split order items by firm based on product categories
 * @param {object} order - Order document with populated customer and products
 * @returns {object} Object with items grouped by firmId
 */
function splitOrderByFirm(order) {
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
    const category = product.category;
    if (!category) {
      console.warn(`Product "${product.productName}" has no category - assigning to default firm`);
    }
    const firm = companies.getFirmForCategory(category || 'Other');

    result[firm.id].items.push(product);
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
 * Format invoice data for display/PDF generation
 * @param {object} order - Order document with populated customer
 * @param {string} firmId - Firm ID to generate invoice for
 * @param {array} productIds - Array of product IDs to include (optional, includes all firm items if not provided)
 * @param {string} invoiceNumber - Custom invoice number (optional, generates from order number if not provided)
 * @returns {object} Formatted invoice data
 */
function getInvoiceData(order, firmId, productIds = null, invoiceNumber = null) {
  const firm = companies.getFirmById(firmId);
  if (!firm) {
    throw new Error(`Firm not found: ${firmId}`);
  }

  // Filter products based on productIds if provided
  let items = order.products;
  if (productIds && productIds.length > 0) {
    items = order.products.filter(p =>
      productIds.includes(p.product?.toString() || p._id?.toString())
    );
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  // Use provided invoice number or derive from order number (for preview)
  const finalInvoiceNumber = invoiceNumber || order.orderNumber.replace('ORD', 'INV');

  return {
    invoiceNumber: finalInvoiceNumber,
    orderNumber: order.orderNumber,
    date: order.createdAt,
    firm: {
      name: firm.name,
      address: firm.address,
      phone: firm.phone,
      whatsapp: firm.whatsapp,
      email: firm.email
    },
    customer: {
      name: order.customer?.name || 'Unknown Customer',
      phone: order.customer?.phone || '',
      whatsapp: order.customer?.whatsapp || '',
      address: order.deliveryAddress || order.customer?.address || ''
    },
    items: items.map((item, index) => ({
      sno: index + 1,
      name: item.productName || 'Unknown Product',
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
      amount: item.amount
    })),
    total: subtotal
  };
}

/**
 * Generate PDF buffer for an invoice
 * @param {object} invoiceData - Formatted invoice data from getInvoiceData()
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateInvoicePDF(invoiceData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Invoice ${invoiceData.invoiceNumber}`,
          Author: invoiceData.firm.name
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#2e3532'; // Gunmetal
      const accentColor = '#7e9181'; // Dusty olive
      const lightGray = '#f5f5f5';

      // Header - Company Info
      doc.fontSize(20)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(invoiceData.firm.name, 50, 50);

      doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text(invoiceData.firm.address, 50, 75)
        .text(`Phone: ${invoiceData.firm.phone}`, 50, 90)
        .text(`Email: ${invoiceData.firm.email}`, 50, 105);

      // Invoice Title
      doc.fontSize(28)
        .fillColor(accentColor)
        .font('Helvetica-Bold')
        .text('INVOICE', 400, 50, { align: 'right' });

      // Invoice Details
      doc.fontSize(10)
        .fillColor(primaryColor)
        .font('Helvetica')
        .text(`Invoice No: ${invoiceData.invoiceNumber}`, 400, 90, { align: 'right' })
        .text(`Date: ${formatDate(invoiceData.date)}`, 400, 105, { align: 'right' })
        .text(`Order: ${invoiceData.orderNumber}`, 400, 120, { align: 'right' });

      // Divider line
      doc.moveTo(50, 145)
        .lineTo(545, 145)
        .strokeColor(accentColor)
        .lineWidth(2)
        .stroke();

      // Bill To Section
      doc.fontSize(12)
        .fillColor(accentColor)
        .font('Helvetica-Bold')
        .text('Bill To:', 50, 165);

      doc.fontSize(11)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(invoiceData.customer.name, 50, 185);

      doc.fontSize(10)
        .font('Helvetica')
        .fillColor('#666666');

      let yPos = 200;
      if (invoiceData.customer.address) {
        doc.text(invoiceData.customer.address, 50, yPos);
        yPos += 15;
      }
      if (invoiceData.customer.phone) {
        doc.text(`Phone: ${invoiceData.customer.phone}`, 50, yPos);
        yPos += 15;
      }

      // Products Table
      const tableTop = Math.max(yPos + 20, 250);
      const tableHeaders = ['#', 'Product', 'Qty', 'Unit', 'Rate', 'Amount'];
      const colWidths = [30, 200, 50, 50, 70, 95];
      const colPositions = [50];
      for (let i = 0; i < colWidths.length - 1; i++) {
        colPositions.push(colPositions[i] + colWidths[i]);
      }

      // Table Header Background
      doc.rect(50, tableTop, 495, 25)
        .fillColor(accentColor)
        .fill();

      // Table Header Text
      doc.fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(10);

      tableHeaders.forEach((header, i) => {
        const align = i >= 2 ? 'right' : 'left';
        doc.text(header, colPositions[i] + (align === 'right' ? 0 : 5), tableTop + 8, {
          width: colWidths[i] - 10,
          align: align
        });
      });

      // Table Rows
      let currentY = tableTop + 30;
      doc.font('Helvetica').fontSize(10).fillColor(primaryColor);

      invoiceData.items.forEach((item, index) => {
        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(50, currentY - 5, 495, 25)
            .fillColor(lightGray)
            .fill();
          doc.fillColor(primaryColor);
        }

        // Row data
        doc.text(item.sno.toString(), colPositions[0] + 5, currentY, { width: colWidths[0] - 10 });
        doc.text(item.name, colPositions[1] + 5, currentY, { width: colWidths[1] - 10 });
        doc.text(item.quantity.toString(), colPositions[2], currentY, { width: colWidths[2] - 10, align: 'right' });
        doc.text(item.unit, colPositions[3], currentY, { width: colWidths[3] - 10, align: 'right' });
        doc.text(formatCurrency(item.rate), colPositions[4], currentY, { width: colWidths[4] - 10, align: 'right' });
        doc.text(formatCurrency(item.amount), colPositions[5], currentY, { width: colWidths[5] - 10, align: 'right' });

        currentY += 25;

        // Page break if needed
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }
      });

      // Total Section
      const totalY = currentY + 15;

      doc.rect(350, totalY, 195, 30)
        .fillColor(primaryColor)
        .fill();

      doc.fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('Total:', 360, totalY + 8)
        .text(formatCurrency(invoiceData.total), 455, totalY + 8, { width: 80, align: 'right' });

      // Footer
      const footerY = Math.min(totalY + 80, 750);
      doc.fillColor('#999999')
        .font('Helvetica')
        .fontSize(10)
        .text('Thank you for your business!', 50, footerY, { align: 'center', width: 495 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Format date for display
 * @param {Date} date - Date object
 * @param {Object} options - Options
 * @param {boolean} options.allowFallback - If true, use current date for null/invalid (for display-only contexts)
 * @returns {string} Formatted date string (DD/MM/YYYY)
 * @throws {Error} If date is null/invalid and allowFallback is false
 */
function formatDate(date, options = { allowFallback: false }) {
  if (!date) {
    if (options.allowFallback) {
      return formatDateIST(new Date(), 'invoice-fallback');
    }
    throw new Error('formatDate: date is required - received null/undefined');
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    if (options.allowFallback) {
      return formatDateIST(new Date(), 'invoice-fallback');
    }
    throw new Error(`formatDate: invalid date value - received "${date}"`);
  }
  return formatDateIST(d, 'invoice');
}

/**
 * Format number as currency
 * @param {number} amount - Amount to format
 * @param {Object} options - Options
 * @param {boolean} options.allowZeroFallback - If true, treat null/undefined as 0 (for optional fields)
 * @returns {string} Formatted currency string
 * @throws {Error} If amount is null/undefined/NaN and allowZeroFallback is false
 */
function formatCurrency(amount, options = { allowZeroFallback: false }) {
  if (amount === null || amount === undefined) {
    if (options.allowZeroFallback) {
      return formatCurrency(0, { allowZeroFallback: false });
    }
    throw new Error('formatCurrency: amount is required - received null/undefined');
  }
  if (typeof amount !== 'number' || isNaN(amount)) {
    if (options.allowZeroFallback) {
      return formatCurrency(0, { allowZeroFallback: false });
    }
    throw new Error(`formatCurrency: invalid amount - received "${amount}" (type: ${typeof amount})`);
  }
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generate unique invoice number using counter
 * Format: INV{YY}{MM}{0001}
 * @returns {Promise<string>} Unique invoice number
 */
async function generateInvoiceNumber() {
  const { prefix } = getISTYearMonthPrefix();
  const invPrefix = `INV${prefix}`;
  const counterName = `invoice_${invPrefix}`;

  const seq = await Counter.getNextSequence(counterName);
  return `${invPrefix}${seq.toString().padStart(4, '0')}`;
}

module.exports = {
  splitOrderByFirm,
  getInvoiceData,
  generateInvoicePDF,
  generateInvoiceNumber,
  formatDate,
  formatCurrency
};
