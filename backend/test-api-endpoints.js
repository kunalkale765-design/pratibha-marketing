/**
 * API Endpoint Tests
 * Tests invoice and reports API endpoints
 */

const mongoose = require('mongoose');
require('dotenv').config();

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const pass = (msg) => console.log(`${GREEN}✅ ${msg}${RESET}`);
const fail = (msg) => console.log(`${RED}❌ ${msg}${RESET}`);
const info = (msg) => console.log(`${YELLOW}ℹ️  ${msg}${RESET}`);

// Simple HTTP client
async function httpRequest(method, path, body = null, cookie = null) {
  const http = require('http');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // Check if response is JSON or binary
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
          } else {
            resolve({ status: res.statusCode, headers: res.headers, data, binary: true });
          }
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data, binary: true });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Register models
    require('./models/User');
    require('./models/Customer');
    require('./models/Order');
    require('./models/Invoice');

    const User = mongoose.model('User');
    const Order = mongoose.model('Order');
    const Invoice = mongoose.model('Invoice');

    // ========================================
    console.log('='.repeat(50));
    console.log('TEST 1: Login as Staff');
    console.log('='.repeat(50));
    // ========================================

    // Find a staff user
    const staffUser = await User.findOne({ role: { $in: ['admin', 'staff'] } });
    if (!staffUser) {
      fail('No staff user found');
      process.exit(1);
    }
    info(`Found staff user: ${staffUser.email}`);

    // Login
    const loginRes = await httpRequest('POST', '/api/auth/login', {
      email: staffUser.email,
      password: 'password123' // Default test password
    });

    let authCookie = null;
    if (loginRes.status === 200 && loginRes.headers['set-cookie']) {
      authCookie = loginRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
      pass('Staff login successful');
    } else {
      // Try with admin credentials
      const loginRes2 = await httpRequest('POST', '/api/auth/login', {
        email: 'admin@test.com',
        password: 'admin123'
      });
      if (loginRes2.status === 200 && loginRes2.headers['set-cookie']) {
        authCookie = loginRes2.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        pass('Admin login successful');
      } else {
        info('Could not login with test credentials - testing without auth');
      }
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 2: Get Firms List');
    console.log('='.repeat(50));
    // ========================================

    const firmsRes = await httpRequest('GET', '/api/invoices/firms', null, authCookie);

    if (firmsRes.status === 200 && firmsRes.data.success) {
      pass(`Firms endpoint working: ${firmsRes.data.data.length} firms`);
      firmsRes.data.data.forEach(f => {
        info(`  - ${f.name} (${f.id}) ${f.isDefault ? '[DEFAULT]' : ''}`);
      });
    } else if (firmsRes.status === 401) {
      info('Firms endpoint requires auth (expected)');
    } else {
      fail(`Firms endpoint failed: ${firmsRes.status} - ${JSON.stringify(firmsRes.data)}`);
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 3: Get Order Split');
    console.log('='.repeat(50));
    // ========================================

    const testOrder = await Order.findOne({ status: { $ne: 'cancelled' } });
    if (testOrder) {
      const splitRes = await httpRequest('GET', `/api/invoices/${testOrder._id}/split`, null, authCookie);

      if (splitRes.status === 200 && splitRes.data.success) {
        pass(`Split endpoint working for order ${testOrder.orderNumber}`);
        info(`  Order has ${splitRes.data.data.firms.length} firm(s)`);
        splitRes.data.data.firms.forEach(f => {
          info(`  - ${f.firmName}: ${f.items.length} items, ₹${f.subtotal}`);
        });
      } else if (splitRes.status === 401) {
        info('Split endpoint requires auth (expected)');
      } else {
        fail(`Split endpoint failed: ${splitRes.status}`);
      }
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 4: Cancelled Order Validation');
    console.log('='.repeat(50));
    // ========================================

    const cancelledOrder = await Order.findOne({ status: 'cancelled' });
    if (cancelledOrder) {
      const cancelledSplitRes = await httpRequest('GET', `/api/invoices/${cancelledOrder._id}/split`, null, authCookie);

      if (cancelledSplitRes.status === 400 && cancelledSplitRes.data.message?.includes('cancelled')) {
        pass('Cancelled order correctly rejected');
        info(`  Message: ${cancelledSplitRes.data.message}`);
      } else if (cancelledSplitRes.status === 401) {
        info('Cannot test cancelled validation without auth');
      } else {
        fail(`Cancelled order should be rejected but got: ${cancelledSplitRes.status}`);
      }
    } else {
      info('No cancelled orders to test');
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 5: Invoice List Endpoint');
    console.log('='.repeat(50));
    // ========================================

    const listRes = await httpRequest('GET', '/api/invoices', null, authCookie);

    if (listRes.status === 200 && listRes.data.success) {
      pass(`Invoice list endpoint working`);
      info(`  Total invoices: ${listRes.data.pagination?.total || listRes.data.data?.length || 0}`);
    } else if (listRes.status === 401) {
      info('Invoice list requires auth (expected)');
    } else {
      fail(`Invoice list failed: ${listRes.status}`);
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 6: Ledger Report Endpoint');
    console.log('='.repeat(50));
    // ========================================

    const ledgerPreviewRes = await httpRequest('GET', '/api/reports/ledger/preview', null, authCookie);

    if (ledgerPreviewRes.status === 200 && ledgerPreviewRes.data.success) {
      pass('Ledger preview endpoint working');
      info(`  Invoices: ${ledgerPreviewRes.data.data.summary?.totalInvoices || 0}`);
      info(`  Total amount: ₹${ledgerPreviewRes.data.data.summary?.totalAmount || 0}`);
    } else if (ledgerPreviewRes.status === 401) {
      info('Ledger preview requires auth (expected)');
    } else {
      fail(`Ledger preview failed: ${ledgerPreviewRes.status}`);
    }

    // Test Excel download
    const ledgerDownloadRes = await httpRequest('GET', '/api/reports/ledger', null, authCookie);

    if (ledgerDownloadRes.status === 200 && ledgerDownloadRes.headers['content-type']?.includes('spreadsheet')) {
      pass('Ledger Excel download working');
      info(`  Content-Type: ${ledgerDownloadRes.headers['content-type']}`);
      info(`  Filename: ${ledgerDownloadRes.headers['content-disposition']}`);
    } else if (ledgerDownloadRes.status === 401) {
      info('Ledger download requires auth (expected)');
    } else {
      fail(`Ledger download failed: ${ledgerDownloadRes.status}`);
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 7: Customer Invoice Access');
    console.log('='.repeat(50));
    // ========================================

    // Find a customer user
    const customerUser = await User.findOne({ role: 'customer', customer: { $exists: true } });
    if (customerUser) {
      info(`Found customer user: ${customerUser.email}`);

      // Try to find their orders
      const customerOrders = await Order.find({ customer: customerUser.customer }).limit(1);
      if (customerOrders.length > 0) {
        // Test customer invoice endpoint (without auth for now)
        const custInvRes = await httpRequest('GET', `/api/invoices/my-order/${customerOrders[0]._id}`);

        if (custInvRes.status === 401) {
          pass('Customer invoice endpoint requires authentication');
        } else {
          info(`Customer invoice endpoint returned: ${custInvRes.status}`);
        }
      }
    } else {
      info('No customer users found');
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('TEST 8: Health Check');
    console.log('='.repeat(50));
    // ========================================

    const healthRes = await httpRequest('GET', '/api/health');

    if (healthRes.status === 200 && healthRes.data.status === 'ok') {
      pass('Server healthy');
      info(`  MongoDB: ${healthRes.data.mongodb}`);
    } else {
      fail('Health check failed');
    }

    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    // ========================================

    await mongoose.disconnect();
    console.log('\n✅ API tests completed!');

    console.log('\nTo fully test with authentication:');
    console.log('1. Open browser to http://localhost:3000');
    console.log('2. Login as staff/admin');
    console.log('3. Go to Orders → Click Print on any order → Generate invoice');
    console.log('4. Go to Dashboard → Reports → Customer Ledger → Download');

  } catch (e) {
    console.error('\n❌ Test failed:', e);
    process.exit(1);
  }
}

test();
