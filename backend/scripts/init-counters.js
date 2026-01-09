/**
 * Counter Migration Script
 *
 * This script initializes the Counter collection based on existing orders.
 * Run this BEFORE deploying the new order numbering system to prevent duplicate order numbers.
 *
 * Usage: node backend/scripts/init-counters.js
 *
 * What it does:
 * 1. Connects to the database
 * 2. Finds all existing orders
 * 3. Extracts the highest sequence number for each month (ORD{YY}{MM})
 * 4. Creates Counter documents with those sequence values
 *
 * Safe to run multiple times - it will only update counters if existing orders have higher numbers.
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Counter schema (same as Counter.js)
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

// Order schema (minimal, just for querying)
const orderSchema = new mongoose.Schema({
  orderNumber: String
});

const Order = mongoose.model('Order', orderSchema);

async function initializeCounters() {
  console.log('Starting counter initialization...\n');

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('ERROR: MONGODB_URI environment variable is not set');
      console.log('Set it in your .env file or pass it directly:');
      console.log('  MONGODB_URI=mongodb://localhost:27017/pratibha node backend/scripts/init-counters.js');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully.\n');

    // Find all orders with order numbers
    const orders = await Order.find({ orderNumber: { $exists: true, $ne: null } });
    console.log(`Found ${orders.length} orders with order numbers.\n`);

    if (orders.length === 0) {
      console.log('No existing orders found. Counters will start from 1 for new months.');
      await mongoose.disconnect();
      return;
    }

    // Group by prefix (ORD{YY}{MM}) and find max sequence for each
    const maxSequences = {};
    const orderPattern = /^ORD(\d{4})(\d{4})$/; // ORDYYMMxxxx

    for (const order of orders) {
      const match = order.orderNumber?.match(orderPattern);
      if (match) {
        const prefix = `ORD${match[1]}`; // ORDYYMM
        const seq = parseInt(match[2], 10); // The sequence number

        if (!maxSequences[prefix] || seq > maxSequences[prefix]) {
          maxSequences[prefix] = seq;
        }
      }
    }

    console.log('Max sequences found per month:');
    for (const [prefix, maxSeq] of Object.entries(maxSequences)) {
      console.log(`  ${prefix}: ${maxSeq}`);
    }
    console.log('');

    // Initialize or update counters
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const [prefix, maxSeq] of Object.entries(maxSequences)) {
      const counterName = `order_${prefix}`;

      // Use findOneAndUpdate with $max to only update if new value is higher
      const result = await Counter.findOneAndUpdate(
        { _id: counterName },
        { $max: { seq: maxSeq } },
        { upsert: true, new: true, rawResult: true }
      );

      if (result.lastErrorObject?.updatedExisting) {
        if (result.value.seq === maxSeq) {
          updated++;
          console.log(`Updated counter ${counterName} to ${maxSeq}`);
        } else {
          skipped++;
          console.log(`Skipped ${counterName} (existing: ${result.value.seq} >= ${maxSeq})`);
        }
      } else {
        created++;
        console.log(`Created counter ${counterName} with value ${maxSeq}`);
      }
    }

    console.log('\n--- Summary ---');
    console.log(`Counters created: ${created}`);
    console.log(`Counters updated: ${updated}`);
    console.log(`Counters skipped: ${skipped}`);
    console.log('\nMigration complete! Safe to deploy the new order numbering system.');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

// Run the migration
initializeCounters();
