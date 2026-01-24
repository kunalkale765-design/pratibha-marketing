/**
 * Invoice Feature Test Script
 * Tests all invoice functionality directly
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Register all models first (required for populate to work)
    require('./models/User');
    require('./models/Customer');
    require('./models/Product');
    require('./models/Order');
    require('./models/MarketRate');

    // Get an order to test with
    const Order = mongoose.model('Order');
    const Product = mongoose.model('Product');
    const order = await Order.findOne().populate('customer');

    if (!order) {
      console.log('❌ No orders found in database');
      process.exit(1);
    }

    console.log('✅ Found test order:', order.orderNumber);
    console.log('   Customer:', order.customer?.name || 'Unknown');
    console.log('   Products:', order.products.length);
    console.log('   Order ID:', order._id);

    // Test invoice service directly
    const invoiceService = require('./services/invoiceService');
    const companies = require('./config/companies');

    // Test splitOrderByFirm
    console.log('\n--- Testing splitOrderByFirm ---');
    try {
      // Need to add category to products first
      const productIds = order.products.map(p => p.product);
      const products = await Product.find({ _id: { $in: productIds } });
      const categoryMap = {};
      products.forEach(p => { categoryMap[p._id.toString()] = p.category; });

      const orderWithCategories = {
        ...order.toObject(),
        products: order.products.map(p => ({
          ...(p.toObject ? p.toObject() : p),
          category: categoryMap[p.product?.toString()] || 'Other'
        }))
      };

      const split = invoiceService.splitOrderByFirm(orderWithCategories);
      console.log('✅ Split result:', Object.keys(split));
      Object.keys(split).forEach(firmId => {
        console.log('   ' + firmId + ':', split[firmId].items.length, 'items, ₹' + split[firmId].subtotal);
      });
    } catch (e) {
      console.log('❌ splitOrderByFirm failed:', e.message);
    }

    // Test getInvoiceData
    console.log('\n--- Testing getInvoiceData ---');
    try {
      const invoiceData = invoiceService.getInvoiceData(order, 'pratibha');
      console.log('✅ Invoice data generated');
      console.log('   Invoice #:', invoiceData.invoiceNumber);
      console.log('   Firm:', invoiceData.firm.name);
      console.log('   Customer:', invoiceData.customer.name);
      console.log('   Items:', invoiceData.items.length);
      console.log('   Total:', invoiceData.total);
    } catch (e) {
      console.log('❌ getInvoiceData failed:', e.message);
    }

    // Test PDF generation
    console.log('\n--- Testing PDF Generation ---');
    try {
      const invoiceData = invoiceService.getInvoiceData(order, 'pratibha');
      const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);
      console.log('✅ PDF generated successfully');
      console.log('   Size:', (pdfBuffer.length / 1024).toFixed(2), 'KB');

      // Verify it's a valid PDF (starts with %PDF)
      const header = pdfBuffer.slice(0, 4).toString();
      if (header === '%PDF') {
        console.log('✅ Valid PDF header detected');
      } else {
        console.log('❌ Invalid PDF header:', header);
      }
    } catch (e) {
      console.log('❌ PDF generation failed:', e.message);
      console.log('   Stack:', e.stack);
    }

    // Test companies config
    console.log('\n--- Testing Companies Config ---');
    console.log('✅ Firms:', companies.firms.map(f => f.name).join(', '));
    console.log('✅ getFirmById(pratibha):', companies.getFirmById('pratibha')?.name);
    console.log('✅ getFirmById(vikas):', companies.getFirmById('vikas')?.name);
    console.log('✅ getFirmForCategory(Fruits):', companies.getFirmForCategory('Fruits')?.name);
    console.log('✅ getFirmForCategory(Indian Vegetables):', companies.getFirmForCategory('Indian Vegetables')?.name);
    console.log('✅ getDefaultFirm():', companies.getDefaultFirm()?.name);

    // Test edge cases
    console.log('\n--- Testing Edge Cases ---');

    // Test with invalid firm
    try {
      invoiceService.getInvoiceData(order, 'invalid-firm');
      console.log('❌ Should have thrown error for invalid firm');
    } catch (e) {
      console.log('✅ Correctly throws error for invalid firm:', e.message);
    }

    // Test with empty productIds
    try {
      const invoiceData = invoiceService.getInvoiceData(order, 'pratibha', []);
      console.log('✅ Empty productIds returns', invoiceData.items.length, 'items (filters to none)');
    } catch (e) {
      console.log('❌ Empty productIds failed:', e.message);
    }

    // Test with null order
    try {
      invoiceService.splitOrderByFirm(null);
      console.log('❌ Should have thrown error for null order');
    } catch (_e) {
      console.log('✅ Correctly handles null order');
    }

    await mongoose.disconnect();
    console.log('\n✅ All tests completed!');

  } catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
  }
}

test();
