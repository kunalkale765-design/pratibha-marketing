/**
 * Test data constants and utilities for E2E tests
 *
 * These users should exist in the database (created by seed.js)
 */

// Test user credentials - using actual seed data users
export const TEST_USERS = {
  admin: {
    email: 'kunal@pm.in',
    password: 'Kunal786',
    name: 'Kunal',
    role: 'admin'
  },
  staff: {
    // Using admin as staff since seed doesn't create staff users
    // In real tests, you'd create a staff user in the seed
    email: 'kunal@pm.in',
    password: 'Kunal786',
    name: 'Kunal',
    role: 'admin'  // Will act as staff
  },
  customer: {
    email: 'e2e-test-customer',
    password: 'Customer123!',
    name: 'E2E Test Customer',
    role: 'customer'
  }
};

// Test products
export const TEST_PRODUCTS = [
  { name: 'Tomato', unit: 'kg', category: 'Indian Vegetables' },
  { name: 'Potato', unit: 'kg', category: 'Indian Vegetables' },
  { name: 'Onion', unit: 'kg', category: 'Indian Vegetables' },
  { name: 'Cabbage', unit: 'kg', category: 'Indian Vegetables' },
  { name: 'Apple', unit: 'kg', category: 'Fruits' },
  { name: 'Banana', unit: 'bunch', category: 'Fruits' },
  { name: 'Frozen Peas', unit: 'kg', category: 'Frozen' },
  { name: 'Rice Bag', unit: 'bag', category: 'Grains' },
];

// Test customers
export const TEST_CUSTOMERS = [
  {
    name: 'Market Customer',
    phone: '9876543210',
    pricingType: 'market',
    address: '123 Market Street'
  },
  {
    name: 'Markup Customer',
    phone: '9876543211',
    pricingType: 'markup',
    markupPercentage: 10,
    address: '456 Markup Road'
  },
  {
    name: 'Contract Customer',
    phone: '9876543212',
    pricingType: 'contract',
    address: '789 Contract Lane'
  }
];

// Market rates for products
export const TEST_MARKET_RATES: Record<string, number> = {
  'Tomato': 50,
  'Potato': 30,
  'Onion': 40,
  'Cabbage': 25,
  'Apple': 150,
  'Banana': 60,
  'Frozen Peas': 120,
  'Rice Bag': 2500
};

// Order statuses for testing state machine
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'cancelled'
] as const;

// Payment statuses
export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'] as const;

// Valid product units
export const PRODUCT_UNITS = ['quintal', 'bag', 'kg', 'piece', 'ton', 'bunch', 'box'] as const;

// Auth storage paths
export const AUTH_STORAGE_PATHS = {
  admin: 'e2e/.auth/admin.json',
  staff: 'e2e/.auth/staff.json',
  customer: 'e2e/.auth/customer.json'
};

// Page URLs
export const PAGE_URLS = {
  login: '/login.html',
  signup: '/signup.html',
  dashboard: '/index.html',
  orders: '/orders.html',
  customers: '/customer-management.html',
  products: '/products.html',
  marketRates: '/market-rates.html',
  customerOrderForm: '/customer-order-form.html'
};
