/**
 * Import Customers as Users
 *
 * Creates User accounts for all active, non-test customers who don't already have one.
 * Generates usernames from customer names and assigns passwords.
 * Saves credentials to a local text file.
 *
 * Usage: node scripts/import-customer-users.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Customer = require('../backend/models/Customer');
const User = require('../backend/models/User');

function generateUsername(name) {
  // Convert "Hotel Taj Palace" → "hoteltajpalace"
  // Remove special chars, lowercase, no spaces
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function generatePassword(name) {
  // Take first 3 chars of name (capitalized) + "123" → e.g., "Hot123"
  const clean = name.replace(/[^a-zA-Z]/g, '');
  const prefix = clean.charAt(0).toUpperCase() + clean.slice(1, 3).toLowerCase();
  return prefix + '1234';
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all active, non-test customers
    const customers = await Customer.find({ isActive: true, isTestCustomer: { $ne: true } }).sort({ name: 1 });
    console.log(`Found ${customers.length} active non-test customers`);

    // Find which customers already have user accounts
    const existingUsers = await User.find({ customer: { $in: customers.map(c => c._id) } }).select('customer email');
    const linkedCustomerIds = new Set(existingUsers.map(u => u.customer.toString()));

    const customersWithoutUsers = customers.filter(c => !linkedCustomerIds.has(c._id.toString()));
    console.log(`${customersWithoutUsers.length} customers need user accounts`);
    console.log(`${linkedCustomerIds.size} customers already have user accounts`);

    if (customersWithoutUsers.length === 0) {
      console.log('All customers already have user accounts. Nothing to do.');
      await mongoose.disconnect();
      return;
    }

    const credentials = [];
    const skipped = [];
    const usedUsernames = new Set();

    // Collect existing usernames to avoid duplicates
    const allUsers = await User.find({}).select('email');
    allUsers.forEach(u => usedUsernames.add(u.email));

    for (const customer of customersWithoutUsers) {
      let username = generateUsername(customer.name);

      // Ensure min 3 chars
      if (username.length < 3) {
        username = username + 'user';
      }

      // Handle duplicates by appending a number
      let finalUsername = username;
      let counter = 2;
      while (usedUsernames.has(finalUsername)) {
        finalUsername = username + counter;
        counter++;
      }

      const password = generatePassword(customer.name);

      try {
        const user = await User.create({
          name: customer.name,
          email: finalUsername,
          password: password,
          phone: customer.phone || undefined,
          role: 'customer',
          customer: customer._id
        });

        usedUsernames.add(finalUsername);
        credentials.push({
          name: customer.name,
          username: finalUsername,
          password: password,
          phone: customer.phone || '-',
          customerId: customer._id.toString()
        });
        console.log(`  Created: ${customer.name} → ${finalUsername}`);
      } catch (err) {
        // Phone duplicate or other validation error
        if (err.code === 11000 || err.name === 'ValidationError') {
          // Retry without phone if phone was the issue
          try {
            const user = await User.create({
              name: customer.name,
              email: finalUsername,
              password: password,
              role: 'customer',
              customer: customer._id
            });

            usedUsernames.add(finalUsername);
            credentials.push({
              name: customer.name,
              username: finalUsername,
              password: password,
              phone: '-',
              customerId: customer._id.toString()
            });
            console.log(`  Created (no phone): ${customer.name} → ${finalUsername}`);
          } catch (retryErr) {
            skipped.push({ name: customer.name, reason: retryErr.message });
            console.error(`  SKIPPED: ${customer.name} — ${retryErr.message}`);
          }
        } else {
          skipped.push({ name: customer.name, reason: err.message });
          console.error(`  SKIPPED: ${customer.name} — ${err.message}`);
        }
      }
    }

    // Also include existing customer users in the credentials file
    for (const existingUser of existingUsers) {
      const customer = customers.find(c => c._id.toString() === existingUser.customer.toString());
      if (customer) {
        credentials.push({
          name: customer.name,
          username: existingUser.email,
          password: '(already existed — password unchanged)',
          phone: customer.phone || '-',
          customerId: customer._id.toString()
        });
      }
    }

    // Sort by name
    credentials.sort((a, b) => a.name.localeCompare(b.name));

    // Write credentials file
    const timestamp = new Date().toISOString().slice(0, 10);
    const filePath = path.join(__dirname, '..', `customer-credentials-${timestamp}.txt`);

    let content = `PRATIBHA MARKETING — Customer Login Credentials\n`;
    content += `Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n`;
    content += `${'='.repeat(70)}\n\n`;
    content += `${'Name'.padEnd(30)} ${'Username'.padEnd(20)} ${'Password'.padEnd(15)} Phone\n`;
    content += `${'-'.repeat(30)} ${'-'.repeat(20)} ${'-'.repeat(15)} ${'-'.repeat(10)}\n`;

    for (const cred of credentials) {
      content += `${cred.name.padEnd(30)} ${cred.username.padEnd(20)} ${cred.password.padEnd(15)} ${cred.phone}\n`;
    }

    if (skipped.length > 0) {
      content += `\n\nSKIPPED (errors):\n`;
      for (const s of skipped) {
        content += `  ${s.name}: ${s.reason}\n`;
      }
    }

    content += `\n\nTotal: ${credentials.length} users | Skipped: ${skipped.length}\n`;

    fs.writeFileSync(filePath, content);
    console.log(`\nCredentials saved to: ${filePath}`);
    console.log(`Created: ${credentials.filter(c => !c.password.includes('already')).length} new users`);
    console.log(`Existing: ${credentials.filter(c => c.password.includes('already')).length} users`);
    if (skipped.length) console.log(`Skipped: ${skipped.length} (see file for details)`);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
