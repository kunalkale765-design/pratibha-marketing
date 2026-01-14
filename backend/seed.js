require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const Customer = require('./models/Customer');
const Order = require('./models/Order');
const MarketRate = require('./models/MarketRate');
const User = require('./models/User');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Initial vegetable products (prices managed via MarketRate)
const vegetables = [
  // Leafy Greens
  { name: 'Spinach (Palak)', category: 'leafy-greens', unit: 'kg' },
  { name: 'Cabbage (Patta Gobi)', category: 'leafy-greens', unit: 'kg' },
  { name: 'Lettuce', category: 'leafy-greens', unit: 'kg' },
  { name: 'Coriander (Dhania)', category: 'leafy-greens', unit: 'kg' },
  { name: 'Fenugreek (Methi)', category: 'leafy-greens', unit: 'kg' },

  // Root Vegetables
  { name: 'Potato (Aloo)', category: 'root', unit: 'kg' },
  { name: 'Onion (Pyaz)', category: 'root', unit: 'kg' },
  { name: 'Carrot (Gajar)', category: 'root', unit: 'kg' },
  { name: 'Beetroot (Chukandar)', category: 'root', unit: 'kg' },
  { name: 'Radish (Mooli)', category: 'root', unit: 'kg' },

  // Fruiting Vegetables
  { name: 'Tomato (Tamatar)', category: 'fruiting', unit: 'kg' },
  { name: 'Cucumber (Kheera)', category: 'fruiting', unit: 'kg' },
  { name: 'Capsicum (Shimla Mirch)', category: 'fruiting', unit: 'kg' },
  { name: 'Brinjal (Baingan)', category: 'fruiting', unit: 'kg' },
  { name: 'Green Chilli (Hari Mirch)', category: 'fruiting', unit: 'kg' },

  // Gourds
  { name: 'Bottle Gourd (Lauki)', category: 'gourd', unit: 'kg' },
  { name: 'Ridge Gourd (Tori)', category: 'gourd', unit: 'kg' },
  { name: 'Bitter Gourd (Karela)', category: 'gourd', unit: 'kg' },

  // Others
  { name: 'Cauliflower (Phool Gobi)', category: 'other', unit: 'kg' },
  { name: 'Beans (Sem Phali)', category: 'other', unit: 'kg' },
  { name: 'Peas (Matar)', category: 'other', unit: 'kg' },
  { name: 'Okra/Bhindi (Lady Finger)', category: 'other', unit: 'kg' },
];

// Default market rates for seeding
const defaultRates = {
  'Spinach (Palak)': 40, 'Cabbage (Patta Gobi)': 30, 'Lettuce': 50,
  'Coriander (Dhania)': 60, 'Fenugreek (Methi)': 45, 'Potato (Aloo)': 25,
  'Onion (Pyaz)': 35, 'Carrot (Gajar)': 40, 'Beetroot (Chukandar)': 35,
  'Radish (Mooli)': 30, 'Tomato (Tamatar)': 40, 'Cucumber (Kheera)': 30,
  'Capsicum (Shimla Mirch)': 60, 'Brinjal (Baingan)': 35, 'Green Chilli (Hari Mirch)': 80,
  'Bottle Gourd (Lauki)': 30, 'Ridge Gourd (Tori)': 35, 'Bitter Gourd (Karela)': 40,
  'Cauliflower (Phool Gobi)': 40, 'Beans (Sem Phali)': 60, 'Peas (Matar)': 70,
  'Okra/Bhindi (Lady Finger)': 50
};

// Sample customers
const sampleCustomers = [
  { name: 'Rajesh Kumar', phone: '9876543210', whatsapp: '9876543210', address: 'Shop 12, Main Market, Mumbai' },
  { name: 'Priya Sharma', phone: '9876543211', whatsapp: '9876543211', address: 'Stall 5, Vegetable Market, Pune' },
  { name: 'Amit Patel', phone: '9876543212', whatsapp: '9876543212', address: 'Shop 8, Central Market, Ahmedabad' },
  { name: 'Sunita Devi', phone: '9876543213', whatsapp: '9876543213', address: 'Shop 3, City Market, Delhi' },
  { name: 'Vijay Singh', phone: '9876543214', whatsapp: '9876543214', address: 'Stall 15, Main Bazaar, Jaipur' },
];

// Admin user - uses ADMIN_TEMP_PASSWORD from env if available, otherwise generates secure random
const getAdminPassword = () => {
  if (process.env.ADMIN_TEMP_PASSWORD) {
    return process.env.ADMIN_TEMP_PASSWORD;
  }
  // Generate secure random password: 16 chars with uppercase, lowercase, numbers
  const crypto = require('crypto');
  return crypto.randomBytes(12).toString('base64').slice(0, 16);
};

const adminPassword = getAdminPassword();
const adminUser = {
  name: 'Admin',
  email: 'admin@pratibhamarketing.in',
  password: adminPassword,
  phone: '9876543200',
  role: 'admin'
};

const seedDatabase = async () => {
  try {
    await connectDB();

    console.log('\n[*] Starting database seeding...\n');

    // SAFETY CHECK: Prevent accidental deletion of production data
    const existingOrders = await Order.countDocuments();
    const existingCustomers = await Customer.countDocuments();

    if (existingOrders > 5 || existingCustomers > 5) {
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║  ⚠️  WARNING: PRODUCTION DATA DETECTED!                    ║');
      console.log('╠═══════════════════════════════════════════════════════════╣');
      console.log(`║  Orders: ${existingOrders.toString().padEnd(5)} | Customers: ${existingCustomers.toString().padEnd(20)}║`);
      console.log('║                                                           ║');
      console.log('║  This will DELETE ALL your data!                          ║');
      console.log('║                                                           ║');
      console.log('║  To proceed, run with --force flag:                       ║');
      console.log('║  node backend/seed.js --force                             ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');

      if (!process.argv.includes('--force')) {
        console.log('\n❌ Seed cancelled. Your data is safe.\n');
        await mongoose.disconnect();
        process.exit(0);
      }

      console.log('\n⚠️  --force flag detected. Proceeding with data deletion...\n');
    }

    // Clear existing data
    console.log('Clearing existing data...');
    await Product.deleteMany({});
    await Customer.deleteMany({});
    await Order.deleteMany({});
    await MarketRate.deleteMany({});
    await User.deleteMany({});
    console.log('[OK] Existing data cleared\n');

    // Seed Products
    console.log('Seeding products (vegetables)...');
    const products = await Product.insertMany(vegetables);
    console.log(`[OK] ${products.length} products created\n`);

    // Seed Customers
    console.log('Seeding sample customers...');
    const customers = await Customer.insertMany(sampleCustomers);
    console.log(`[OK] ${customers.length} customers created\n`);

    // Create Admin User
    console.log('Creating admin user...');
    const admin = await User.create(adminUser);
    console.log(`[OK] Admin user created (Email: ${admin.email})\n`);

    // Create Kunal's admin account (permanent)
    console.log('Creating Kunal admin account...');
    await User.create({
      name: 'Kunal',
      email: 'kunal@pm.in',
      password: 'Kunal786',
      role: 'admin',
      isActive: true
    });
    console.log(`[OK] Kunal admin created (Email: kunal@pm.in)\n`);

    // Create sample user accounts for some customers
    console.log('Creating customer user accounts...');
    for (let i = 0; i < 2; i++) {
      const customer = customers[i];
      await User.create({
        name: customer.name,
        email: `${customer.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        password: 'Pass1234',
        phone: customer.phone,
        role: 'customer',
        customer: customer._id
      });
    }
    console.log('✓ 2 customer user accounts created\n');

    // Generate a magic link for the first customer (for testing)
    const crypto = require('crypto');
    const testMagicToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(testMagicToken).digest('hex');
    await Customer.findByIdAndUpdate(customers[0]._id, {
      magicLinkToken: hashedToken,
      magicLinkCreatedAt: new Date()
    });
    console.log('✓ Magic link generated for Rajesh Kumar');
    console.log(`  Test URL: /customer-order-form.html?token=${testMagicToken}\n`);

    // Seed Market Rates for all products
    console.log('Seeding market rates...');
    const marketRates = products.map(product => ({
      product: product._id,
      productName: product.name,
      rate: (defaultRates[product.name] || 30) + Math.floor(Math.random() * 10) - 5,
      unit: product.unit,
      marketLocation: 'Main Wholesale Market',
      date: new Date()
    }));
    await MarketRate.insertMany(marketRates);
    console.log(`[OK] ${marketRates.length} market rates created\n`);

    // Create rate lookup for orders
    const rateMap = {};
    marketRates.forEach(r => { rateMap[r.productName] = r.rate; });

    // Seed Sample Orders
    console.log('Seeding sample orders...');
    const sampleOrders = [];

    // Generate order numbers
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');

    // Create 3 pending orders
    for (let i = 0; i < 3; i++) {
      const customer = customers[i];
      const prod1 = products[Math.floor(Math.random() * products.length)];
      const prod2 = products[Math.floor(Math.random() * products.length)];
      const qty1 = Math.floor(Math.random() * 20) + 10;
      const qty2 = Math.floor(Math.random() * 15) + 5;

      const rate1 = rateMap[prod1.name] || 30;
      const rate2 = rateMap[prod2.name] || 30;
      const orderProducts = [
        {
          product: prod1._id,
          productName: prod1.name,
          quantity: qty1,
          unit: prod1.unit,
          rate: rate1,
          amount: qty1 * rate1
        },
        {
          product: prod2._id,
          productName: prod2.name,
          quantity: qty2,
          unit: prod2.unit,
          rate: rate2,
          amount: qty2 * rate2
        }
      ];

      const totalAmount = orderProducts.reduce((sum, item) => sum + item.amount, 0);

      sampleOrders.push({
        orderNumber: `ORD${year}${month}${(i + 1).toString().padStart(4, '0')}`,
        customer: customer._id,
        products: orderProducts,
        totalAmount,
        status: 'pending',
        paymentStatus: 'unpaid',
        deliveryAddress: customer.address,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 2) * 24 * 60 * 60 * 1000) // Last 2 days
      });
    }

    // Create 2 completed orders
    for (let i = 3; i < 5; i++) {
      const customer = customers[i];
      const prod = products[Math.floor(Math.random() * products.length)];
      const qty = Math.floor(Math.random() * 25) + 15;

      const rate = rateMap[prod.name] || 30;
      const orderProducts = [
        {
          product: prod._id,
          productName: prod.name,
          quantity: qty,
          unit: prod.unit,
          rate: rate,
          amount: qty * rate
        }
      ];

      const totalAmount = orderProducts.reduce((sum, item) => sum + item.amount, 0);

      sampleOrders.push({
        orderNumber: `ORD${year}${month}${(i + 1).toString().padStart(4, '0')}`,
        customer: customer._id,
        products: orderProducts,
        totalAmount,
        status: 'delivered',
        paymentStatus: 'paid',
        paidAmount: totalAmount,
        deliveryAddress: customer.address,
        deliveredAt: new Date(),
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 7) * 24 * 60 * 60 * 1000) // Last week
      });
    }

    const createdOrders = await Order.create(sampleOrders);
    console.log(`[OK] ${createdOrders.length} sample orders created\n`);

    console.log('═══════════════════════════════════════');
    console.log('[OK] Database seeding completed successfully!');
    console.log('═══════════════════════════════════════\n');
    console.log('[*] Summary:');
    console.log(`   Products: ${products.length}`);
    console.log(`   Customers: ${customers.length}`);
    console.log(`   Orders: ${sampleOrders.length}`);
    console.log(`   Market Rates: ${marketRates.length}`);
    console.log('   Users: 3 (1 admin + 2 customers)\n');
    console.log('[*] Admin Credentials:');
    console.log('   Email: admin@pratibhamarketing.in');
    console.log(`   Password: ${process.env.ADMIN_TEMP_PASSWORD ? '(from ADMIN_TEMP_PASSWORD env var)' : adminPassword}`);
    console.log('   [!] CHANGE THIS PASSWORD IMMEDIATELY!\n');
    console.log('[*] Sample Customer Credentials:');
    console.log('   Email: rajesh.kumar@example.com');
    console.log('   Password: Pass1234\n');
    console.log('   Email: priya.sharma@example.com');
    console.log('   Password: Pass1234\n');
    console.log('[*] Magic Link for Testing (Rajesh Kumar):');
    console.log(`   http://localhost:5000/customer-order-form.html?token=${testMagicToken}\n`);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('[ERROR] Error seeding database:', error);
    process.exitCode = 1;
  } finally {
    // Always close the database connection
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
    process.exit();
  }
};

// Run the seed function
seedDatabase();
