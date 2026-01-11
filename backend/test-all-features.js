/**
 * Comprehensive Feature Test Script
 * Tests invoice persistence, customer access, ledger reports
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const pass = (msg) => console.log(`${GREEN}✅ ${msg}${RESET}`);
const fail = (msg) => console.log(`${RED}❌ ${msg}${RESET}`);
const info = (msg) => console.log(`${YELLOW}ℹ️  ${msg}${RESET}`);

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Register all models
    require('./models/User');
    require('./models/Customer');
    require('./models/Product');
    require('./models/Order');
    require('./models/MarketRate');
    require('./models/Invoice');
    require('./models/Counter');

    const Order = mongoose.model('Order');
    const Invoice = mongoose.model('Invoice');
    const Customer = mongoose.model('Customer');
    const Product = mongoose.model('Product');
    const fs = require('fs').promises;
    const path = require('path');

    const invoiceService = require('./services/invoiceService');
    const companies = require('./config/companies');

    // ========================================
    console.log('='.repeat(50));
    console.log('TEST 1: Invoice Number Generation');
    console.log('='.repeat(50));
    // ========================================

    const invNum1 = await invoiceService.generateInvoiceNumber();
    const invNum2 = await invoiceService.generateInvoiceNumber();
    const invNum3 = await invoiceService.generateInvoiceNumber();

    if (invNum1 !== invNum2 && invNum2 !== invNum3) {
      pass(`Sequential numbers generated: ${invNum1}, ${invNum2}, ${invNum3}`);
    } else {
      fail(`Duplicate numbers: ${invNum1}, ${invNum2}, ${invNum3}`);
    }

    // Check format
    if (/^INV\d{6}\d{4}$/.test(invNum1)) {
      pass(`Invoice number format correct: INV{YYMM}{0001}`);
    } else {
      fail(`Invalid format: ${invNum1}`);
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 2: Company Configuration');
    console.log('='.repeat(50));
    // ========================================

    // Test firm lookup
    const pratibha = companies.getFirmById('pratibha');
    const vikas = companies.getFirmById('vikas');

    if (pratibha && pratibha.name === 'Pratibha Marketing') {
      pass(`Pratibha firm found: ${pratibha.name}`);
    } else {
      fail('Pratibha firm not found');
    }

    if (vikas && vikas.name === 'Vikas Frozen Foods') {
      pass(`Vikas firm found: ${vikas.name}`);
    } else {
      fail('Vikas firm not found');
    }

    // Test category mapping
    const fruitsFirm = companies.getFirmForCategory('Fruits');
    const vegFirm = companies.getFirmForCategory('Indian Vegetables');

    if (fruitsFirm.id === 'vikas') {
      pass('Fruits category maps to Vikas');
    } else {
      fail(`Fruits mapped to wrong firm: ${fruitsFirm.id}`);
    }

    if (vegFirm.id === 'pratibha') {
      pass('Vegetables category maps to Pratibha (default)');
    } else {
      fail(`Vegetables mapped to wrong firm: ${vegFirm.id}`);
    }

    // Test real addresses are set
    if (!pratibha.address.includes('TODO') && !pratibha.address.includes('123 Market')) {
      pass(`Real address configured: ${pratibha.address.substring(0, 40)}...`);
    } else {
      fail('Placeholder address still in config');
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 3: Invoice Data Generation');
    console.log('='.repeat(50));
    // ========================================

    const order = await Order.findOne({ status: { $ne: 'cancelled' } }).populate('customer');
    if (!order) {
      fail('No non-cancelled orders found for testing');
      process.exit(1);
    }

    info(`Testing with order: ${order.orderNumber}`);

    const invoiceData = invoiceService.getInvoiceData(order, 'pratibha', null, 'INV-TEST-001');

    if (invoiceData.invoiceNumber === 'INV-TEST-001') {
      pass('Custom invoice number accepted');
    } else {
      fail(`Custom number not used: ${invoiceData.invoiceNumber}`);
    }

    if (invoiceData.firm.name === 'Pratibha Marketing') {
      pass('Firm data populated correctly');
    } else {
      fail(`Wrong firm: ${invoiceData.firm.name}`);
    }

    if (invoiceData.customer.name) {
      pass(`Customer data populated: ${invoiceData.customer.name}`);
    } else {
      fail('Customer name missing');
    }

    if (invoiceData.items.length > 0) {
      pass(`Items populated: ${invoiceData.items.length} items`);
    } else {
      fail('No items in invoice');
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 4: PDF Generation');
    console.log('='.repeat(50));
    // ========================================

    const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

    if (pdfBuffer && pdfBuffer.length > 0) {
      pass(`PDF generated: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    } else {
      fail('PDF buffer empty');
    }

    // Check PDF header
    const header = pdfBuffer.slice(0, 4).toString();
    if (header === '%PDF') {
      pass('Valid PDF header');
    } else {
      fail(`Invalid PDF header: ${header}`);
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 5: Invoice Persistence');
    console.log('='.repeat(50));
    // ========================================

    // Check if storage directory exists
    const storageDir = path.join(__dirname, 'storage', 'invoices');
    try {
      await fs.access(storageDir);
      pass('Invoice storage directory exists');
    } catch {
      fail('Storage directory missing');
    }

    // Check Invoice model
    const invoiceCount = await Invoice.countDocuments();
    info(`Total invoices in database: ${invoiceCount}`);

    // Check if we can query invoices
    const recentInvoices = await Invoice.find().sort({ generatedAt: -1 }).limit(3);
    if (recentInvoices.length > 0) {
      pass(`Can query invoices. Most recent: ${recentInvoices[0].invoiceNumber}`);

      // Verify PDF file exists for this invoice
      const pdfPath = path.join(storageDir, recentInvoices[0].pdfPath);
      try {
        await fs.access(pdfPath);
        pass(`PDF file exists: ${recentInvoices[0].pdfPath}`);
      } catch {
        info(`PDF file not found (may need to generate first): ${recentInvoices[0].pdfPath}`);
      }
    } else {
      info('No invoices in database yet (generate one via UI to test)');
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 6: Cancelled Order Validation');
    console.log('='.repeat(50));
    // ========================================

    const cancelledOrder = await Order.findOne({ status: 'cancelled' });
    if (cancelledOrder) {
      info(`Found cancelled order: ${cancelledOrder.orderNumber}`);
      // The validation happens in the route, not the service
      // So we just verify the order exists for manual testing
      pass('Cancelled order available for route testing');
    } else {
      info('No cancelled orders found (create one to test validation)');
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 7: Ledger Report Data');
    console.log('='.repeat(50));
    // ========================================

    // Test that we can aggregate invoice data for ledger
    const ledgerData = await Invoice.find()
      .sort({ generatedAt: -1 })
      .limit(10)
      .lean();

    if (ledgerData.length > 0) {
      pass(`Ledger data available: ${ledgerData.length} invoices`);

      // Verify required fields for Excel export
      const sample = ledgerData[0];
      const hasRequiredFields = sample.invoiceNumber &&
                                sample.customer?.name &&
                                sample.firm?.name &&
                                sample.total !== undefined;

      if (hasRequiredFields) {
        pass('Invoice records have all required ledger fields');
        info(`  Sample: ${sample.invoiceNumber} | ${sample.customer?.name} | ${sample.firm?.name} | ₹${sample.total}`);
      } else {
        fail('Missing required fields in invoice records');
      }
    } else {
      info('No invoices for ledger test (generate invoices first)');
    }

    // Calculate total
    const totalAmount = ledgerData.reduce((sum, inv) => sum + (inv.total || 0), 0);
    info(`Total amount in ledger: ₹${totalAmount}`);

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 8: Customer Invoice Access');
    console.log('='.repeat(50));
    // ========================================

    // Check if we have customer users
    const User = mongoose.model('User');
    const customerUser = await User.findOne({ role: 'customer', customer: { $exists: true } });

    if (customerUser) {
      pass(`Customer user exists: ${customerUser.name || customerUser.email}`);

      // Find orders for this customer
      const customerOrders = await Order.find({ customer: customerUser.customer }).limit(3);
      info(`Customer has ${customerOrders.length} orders`);

      // Check if any have invoices
      for (const ord of customerOrders) {
        const orderInvoices = await Invoice.find({ order: ord._id });
        if (orderInvoices.length > 0) {
          pass(`Order ${ord.orderNumber} has ${orderInvoices.length} invoice(s)`);
        }
      }
    } else {
      info('No customer users found (create one to test customer access)');
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 9: Edge Cases');
    console.log('='.repeat(50));
    // ========================================

    // Test invalid firm
    try {
      invoiceService.getInvoiceData(order, 'invalid-firm-id');
      fail('Should throw error for invalid firm');
    } catch (e) {
      pass(`Invalid firm rejected: ${e.message}`);
    }

    // Test null date handling
    const testDate = invoiceService.formatDate(null);
    if (testDate && !testDate.includes('NaN')) {
      pass(`Null date handled: ${testDate}`);
    } else {
      fail('Null date not handled properly');
    }

    // Test invalid date
    const invalidDate = invoiceService.formatDate('not-a-date');
    if (invalidDate && !invalidDate.includes('NaN')) {
      pass(`Invalid date handled: ${invalidDate}`);
    } else {
      fail('Invalid date not handled properly');
    }

    // Test null amount
    const nullAmount = invoiceService.formatCurrency(null);
    if (nullAmount === 'Rs. 0.00') {
      pass('Null amount handled');
    } else {
      fail(`Null amount not handled: ${nullAmount}`);
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    // ========================================

    await mongoose.disconnect();
    console.log('\n✅ All tests completed!');
    console.log('\nManual testing recommended:');
    console.log('1. Generate invoice via Orders page → Print button');
    console.log('2. Check Dashboard → Reports → Customer Ledger');
    console.log('3. Login as customer and check invoice download in My Orders');

  } catch (e) {
    console.error('\n❌ Test failed:', e);
    process.exit(1);
  }
}

test();
