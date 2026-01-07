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

// Initial vegetable products
const vegetables = [
  // Leafy Greens
  { name: 'Spinach (Palak)', category: 'leafy-greens', unit: 'kg', basePrice: 40, stockQuantity: 50, minStockLevel: 10, description: 'Fresh green spinach leaves' },
  { name: 'Cabbage (Patta Gobi)', category: 'leafy-greens', unit: 'kg', basePrice: 30, stockQuantity: 100, minStockLevel: 20, description: 'Fresh cabbage' },
  { name: 'Lettuce', category: 'leafy-greens', unit: 'kg', basePrice: 50, stockQuantity: 30, minStockLevel: 10, description: 'Crispy lettuce leaves' },
  { name: 'Coriander (Dhania)', category: 'leafy-greens', unit: 'kg', basePrice: 60, stockQuantity: 20, minStockLevel: 5, description: 'Fresh coriander leaves' },
  { name: 'Fenugreek (Methi)', category: 'leafy-greens', unit: 'kg', basePrice: 45, stockQuantity: 25, minStockLevel: 8, description: 'Fresh methi leaves' },

  // Root Vegetables
  { name: 'Potato (Aloo)', category: 'root', unit: 'kg', basePrice: 25, stockQuantity: 500, minStockLevel: 100, description: 'Fresh potatoes' },
  { name: 'Onion (Pyaz)', category: 'root', unit: 'kg', basePrice: 35, stockQuantity: 400, minStockLevel: 80, description: 'Fresh onions' },
  { name: 'Carrot (Gajar)', category: 'root', unit: 'kg', basePrice: 40, stockQuantity: 150, minStockLevel: 30, description: 'Fresh carrots' },
  { name: 'Beetroot (Chukandar)', category: 'root', unit: 'kg', basePrice: 35, stockQuantity: 80, minStockLevel: 20, description: 'Fresh beetroot' },
  { name: 'Radish (Mooli)', category: 'root', unit: 'kg', basePrice: 30, stockQuantity: 60, minStockLevel: 15, description: 'Fresh radish' },

  // Fruiting Vegetables
  { name: 'Tomato (Tamatar)', category: 'fruiting', unit: 'kg', basePrice: 40, stockQuantity: 200, minStockLevel: 50, description: 'Fresh red tomatoes' },
  { name: 'Cucumber (Kheera)', category: 'fruiting', unit: 'kg', basePrice: 30, stockQuantity: 100, minStockLevel: 25, description: 'Fresh cucumbers' },
  { name: 'Capsicum (Shimla Mirch)', category: 'fruiting', unit: 'kg', basePrice: 60, stockQuantity: 80, minStockLevel: 20, description: 'Fresh bell peppers' },
  { name: 'Brinjal (Baingan)', category: 'fruiting', unit: 'kg', basePrice: 35, stockQuantity: 90, minStockLevel: 20, description: 'Fresh eggplant' },
  { name: 'Green Chilli (Hari Mirch)', category: 'fruiting', unit: 'kg', basePrice: 80, stockQuantity: 40, minStockLevel: 10, description: 'Fresh green chillies' },

  // Gourds
  { name: 'Bottle Gourd (Lauki)', category: 'gourd', unit: 'kg', basePrice: 30, stockQuantity: 70, minStockLevel: 15, description: 'Fresh bottle gourd' },
  { name: 'Ridge Gourd (Tori)', category: 'gourd', unit: 'kg', basePrice: 35, stockQuantity: 60, minStockLevel: 15, description: 'Fresh ridge gourd' },
  { name: 'Bitter Gourd (Karela)', category: 'gourd', unit: 'kg', basePrice: 40, stockQuantity: 50, minStockLevel: 12, description: 'Fresh bitter gourd' },

  // Others
  { name: 'Cauliflower (Phool Gobi)', category: 'other', unit: 'kg', basePrice: 40, stockQuantity: 120, minStockLevel: 30, description: 'Fresh cauliflower' },
  { name: 'Beans (Sem Phali)', category: 'other', unit: 'kg', basePrice: 60, stockQuantity: 80, minStockLevel: 20, description: 'Fresh green beans' },
  { name: 'Peas (Matar)', category: 'other', unit: 'kg', basePrice: 70, stockQuantity: 90, minStockLevel: 25, description: 'Fresh green peas' },
  { name: 'Okra/Bhindi (Lady Finger)', category: 'other', unit: 'kg', basePrice: 50, stockQuantity: 70, minStockLevel: 18, description: 'Fresh okra/bhindi' },
];

// Sample customers
const sampleCustomers = [
  { name: 'Rajesh Kumar', phone: '9876543210', whatsapp: '9876543210', address: 'Shop 12, Main Market, Mumbai' },
  { name: 'Priya Sharma', phone: '9876543211', whatsapp: '9876543211', address: 'Stall 5, Vegetable Market, Pune' },
  { name: 'Amit Patel', phone: '9876543212', whatsapp: '9876543212', address: 'Shop 8, Central Market, Ahmedabad' },
  { name: 'Sunita Devi', phone: '9876543213', whatsapp: '9876543213', address: 'Shop 3, City Market, Delhi' },
  { name: 'Vijay Singh', phone: '9876543214', whatsapp: '9876543214', address: 'Stall 15, Main Bazaar, Jaipur' },
];

// Admin user
const adminUser = {
  name: 'Admin',
  email: 'admin@pratibhamarketing.in',
  password: 'admin123',
  phone: '9876543200',
  role: 'admin'
};

const seedDatabase = async () => {
  try {
    await connectDB();

    console.log('\n🌱 Starting database seeding...\n');

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('Clearing existing data...');
    await Product.deleteMany({});
    await Customer.deleteMany({});
    await Order.deleteMany({});
    await MarketRate.deleteMany({});
    await User.deleteMany({});
    console.log('✓ Existing data cleared\n');

    // Seed Products
    console.log('Seeding products (vegetables)...');
    const products = await Product.insertMany(vegetables);
    console.log(`✓ ${products.length} products created\n`);

    // Seed Customers
    console.log('Seeding sample customers...');
    const customers = await Customer.insertMany(sampleCustomers);
    console.log(`✓ ${customers.length} customers created\n`);

    // Create Admin User
    console.log('Creating admin user...');
    const admin = await User.create(adminUser);
    console.log(`✓ Admin user created (Email: ${admin.email}, Password: admin123)\n`);

    // Create sample user accounts for some customers
    console.log('Creating customer user accounts...');
    for (let i = 0; i < 2; i++) {
      const customer = customers[i];
      await User.create({
        name: customer.name,
        email: `${customer.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        password: 'password123',
        phone: customer.phone,
        role: 'customer',
        customer: customer._id
      });
    }
    console.log('✓ 2 customer user accounts created\n');

    // Seed Market Rates
    console.log('Seeding market rates...');
    const marketRates = products.slice(0, 10).map(product => ({
      product: product._id,
      productName: product.name,
      rate: product.basePrice + Math.floor(Math.random() * 10) - 5, // Slight variation from base price
      unit: product.unit,
      marketLocation: 'Main Wholesale Market',
      date: new Date()
    }));
    await MarketRate.insertMany(marketRates);
    console.log(`✓ ${marketRates.length} market rates created\n`);

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

      const orderProducts = [
        {
          product: prod1._id,
          productName: prod1.name,
          quantity: qty1,
          unit: prod1.unit,
          rate: prod1.basePrice,
          amount: qty1 * prod1.basePrice
        },
        {
          product: prod2._id,
          productName: prod2.name,
          quantity: qty2,
          unit: prod2.unit,
          rate: prod2.basePrice,
          amount: qty2 * prod2.basePrice
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

      const orderProducts = [
        {
          product: prod._id,
          productName: prod.name,
          quantity: qty,
          unit: prod.unit,
          rate: prod.basePrice,
          amount: qty * prod.basePrice
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
    console.log(`✓ ${createdOrders.length} sample orders created\n`);

    console.log('═══════════════════════════════════════');
    console.log('✅ Database seeding completed successfully!');
    console.log('═══════════════════════════════════════\n');
    console.log('📊 Summary:');
    console.log(`   Products: ${products.length}`);
    console.log(`   Customers: ${customers.length}`);
    console.log(`   Orders: ${sampleOrders.length}`);
    console.log(`   Market Rates: ${marketRates.length}`);
    console.log(`   Users: 3 (1 admin + 2 customers)\n`);
    console.log('🔐 Admin Credentials:');
    console.log(`   Email: admin@pratibhamarketing.in`);
    console.log(`   Password: admin123\n`);
    console.log('🔐 Sample Customer Credentials:');
    console.log(`   Email: rajesh.kumar@example.com`);
    console.log(`   Password: password123\n`);
    console.log(`   Email: priya.sharma@example.com`);
    console.log(`   Password: password123\n`);
    console.log('═══════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

// Run the seed function
seedDatabase();
